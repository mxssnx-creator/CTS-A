// Runtime coordination tests on the synthetic feed (no network): races between cycles, settings, stop,
// resync and the watchdog; plus a responsiveness bound on the event loop during a full compute.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoreRuntime } from "./runtime.server.ts";
import { CoreDb } from "./db.server.ts";

const small = { symbols: 4, historyDays: 18, mainTop: 12, refineTop: 4, evalTop: 8, cycleMs: 60_000 };
const mk = () => new CoreRuntime(new CoreDb(":memory:"), small, { market: "synthetic" });
const until = async (cond: () => boolean, ms = 120_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("runtime coordination", { timeout: 300_000 }, () => {
  it("computes on the synthetic feed and publishes every stage", async () => {
    const rt = mk();
    rt.start();
    await until(() => rt.status.computes >= 1 && rt.status.state === "running");
    assert.equal(rt.status.source, "synthetic");
    assert.ok(rt.pipeline && rt.sim && rt.tapes.length > 0);
    assert.ok(Number(rt.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM results")?.n) > 300);
    assert.ok(rt.db.kvGet("presetSims"));
    for (const k of ["Pipeline", "Persist", "Tapes", "Simulation", "Compare", "Paper"]) assert.ok(rt.status.phases[k], k);
    // no table is left half-written: shadow tables are gone after the swap
    assert.equal(rt.db.all("SELECT name FROM sqlite_master WHERE name LIKE '%_next'").length, 0);
    rt.stop();
  });

  it("stop during a compute stays stopped and never reschedules", async () => {
    const rt = mk();
    rt.start();
    await until(() => rt.status.state === "computing");
    const cycles = rt.status.cycles;
    const computes = rt.status.computes;
    rt.stop();
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(rt.status.state, "stopped");
    assert.equal(rt.status.cycles, cycles, "abandoned cycle must not count");
    assert.equal(rt.status.computes, computes, "abandoned compute must not publish");
    // start again resumes
    rt.start();
    await until(() => rt.status.state === "running" && rt.status.cycles > cycles);
    rt.stop();
  });

  it("a settings change during a compute is applied by a follow-up compute, not mid-way", async () => {
    const rt = mk();
    rt.start();
    await until(() => rt.status.state === "computing");
    rt.updateSettings({ toggles: { ...rt.settings.toggles, dcaActive: false, blockActive: false } });
    await until(() => rt.status.computes >= 2, 180_000);
    assert.equal(rt.sim?.opts.toggles.dcaActive, false);
    assert.equal(rt.sim?.opts.toggles.blockActive, false);
    rt.stop();
  });

  it("resync while busy is applied at the next cycle and rebuilds the universe", async () => {
    const rt = mk();
    rt.start();
    await until(() => rt.status.computes >= 1);
    rt.updateSettings({ symbols: 3 });
    await until(() => rt.status.computes >= 2 && rt.candles.size === 3, 180_000);
    assert.equal(Number(rt.db.get<{ n: number }>("SELECT COUNT(DISTINCT sym) AS n FROM candles")?.n), 3);
    rt.stop();
  });

  it("the watchdog starts a new generation; the abandoned cycle never publishes", async () => {
    const rt = mk();
    rt.start();
    await until(() => rt.status.state === "computing");
    rt.status.heartbeat = 0; // simulate a stuck loop
    rt.ensureAlive();
    await until(() => rt.status.computes >= 1, 180_000);
    const ev = rt.db.all<{ msg: string }>("SELECT msg FROM events WHERE msg LIKE 'watchdog%'");
    assert.equal(ev.length, 1);
    // exactly one compute run row per finished generation compute
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(Number(rt.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM runs")?.n), rt.status.computes);
    rt.stop();
  });

  it("keeps the event loop responsive during a compute", async () => {
    const rt = mk();
    let worst = 0;
    let last = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      worst = Math.max(worst, now - last - 10);
      last = now;
    }, 10);
    rt.start();
    await until(() => rt.status.computes >= 1);
    clearInterval(iv);
    rt.stop();
    assert.ok(worst < 250, `worst stall ${worst.toFixed(0)} ms`);
    for (const [k, v] of Object.entries(rt.status.phases)) assert.ok(v.maxSliceMs < 250, `${k} slice ${v.maxSliceMs.toFixed(0)} ms`);
  });
});
