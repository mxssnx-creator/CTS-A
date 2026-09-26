import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { barsFromCandles, syntheticCandles, tailBars } from "../market/bars.ts";
import { SeriesCache } from "../indications/cache.ts";
import { INDICATIONS, indicationState } from "../indications/registry.ts";
import { BOTS, comboSignal } from "../bots/bots.ts";
import { optimizeLastN, windowDdt, gatedTrades } from "../lastn/optimizer.ts";
import { evaluateConfig } from "../evals/evaluator.ts";
import { makeUniverse, runPipelineSync, configId, parseConfigId, allCombos } from "./pipeline.ts";
import { DEFAULT_SETTINGS, DEFAULT_GATES } from "../config.ts";
import { INDICATION_KINDS, type Bars, type Trade } from "../domain/types.ts";

const END = Date.UTC(2026, 8, 20);
const H = 3_600_000;

function head(b: Bars, k: number): Bars {
  return { ...b, n: k, t: b.t.slice(0, k), o: b.o.slice(0, k), h: b.h.slice(0, k), l: b.l.slice(0, k), c: b.c.slice(0, k), v: b.v.slice(0, k) };
}

describe("indications", () => {
  const full = barsFromCandles("AAA", 5, syntheticCandles("AAA", 5, 600, END));
  const kFull = new SeriesCache(full);

  it("covers all 10 kinds with unique ids", () => {
    const kinds = new Set(INDICATIONS.map((s) => s.kind));
    for (const k of INDICATION_KINDS) assert.ok(kinds.has(k), k);
    assert.equal(new Set(INDICATIONS.map((s) => s.id)).size, INDICATIONS.length);
    assert.ok(INDICATIONS.length >= 36);
  });

  it("never uses future bars (prefix-stable) for every indication", () => {
    for (const cut of [200, 377, 523]) {
      const kCut = new SeriesCache(head(full, cut));
      for (const s of INDICATIONS) {
        const a = indicationState(s.id, kFull)!;
        const b = indicationState(s.id, kCut)!;
        for (let i = 0; i < cut; i++) assert.equal(b[i], a[i], `${s.id} @${i} cut ${cut}`);
      }
    }
  });

  it("produces both directions on a long random walk", () => {
    let both = 0;
    for (const s of INDICATIONS) {
      const st = indicationState(s.id, kFull)!;
      if (st.includes(1) && st.includes(-1)) both++;
    }
    assert.ok(both >= INDICATIONS.length * 0.8, `${both}`);
  });
});

describe("bots", () => {
  const full = barsFromCandles("BBB", 5, syntheticCandles("BBB", 5, 600, END));
  const kFull = new SeriesCache(full);
  it("every bot × filter is prefix-stable (no look-ahead)", () => {
    const cut = 411;
    const kCut = new SeriesCache(head(full, cut));
    for (const b of BOTS) {
      for (const ind of ["none", "trend-ema", "rsi-extreme"]) {
        const a = comboSignal(b.type, ind, kFull);
        const c = comboSignal(b.type, ind, kCut);
        if (a === null) {
          assert.equal(b.type, "follow");
          assert.equal(ind, "none");
          continue;
        }
        for (let i = 0; i < cut; i++) assert.equal(c![i], a[i], `${b.type}/${ind} @${i}`);
      }
    }
  });
  it("filter only removes signals that disagree", () => {
    const raw = comboSignal("sandwich", "none", kFull)!;
    const f = comboSignal("sandwich", "trend-ema", kFull)!;
    const st = indicationState("trend-ema", kFull)!;
    for (let i = 0; i < raw.length; i++) {
      if (f[i] !== 0) assert.equal(f[i], raw[i]);
      if (raw[i] !== 0 && st[i] === raw[i]) assert.equal(f[i], raw[i]);
    }
  });
});

function tr(i: number, r: number, dur = 1): Trade {
  return { cfg: "x", sym: "S", side: 1, entryT: i * H, exitT: (i + dur) * H, entry: 1, exit: 1, r, reason: r > 0 ? "tp" : "sl", bars: 1, mfe: 0, mae: 0 };
}

describe("last-N", () => {
  it("windowDdt counts an open dip up to now", () => {
    const xs = [tr(0, 0.01), tr(1, -0.01)];
    assert.equal(windowDdt(xs, 0, 2, 10 * H), 9);
  });

  it("only uses trades closed before the entry", () => {
    // trade 0 is a long loser that closes after trade 1 enters; with N=1 trade 1 must not see it
    const xs = [tr(0, -0.05, 5), tr(2, 0.02), tr(3, 0.02)];
    const got = gatedTrades(xs, 1, { ...DEFAULT_GATES, maxDdtH: 1e9 });
    // trade 1 (entry 2h): nothing closed → not taken. trade 2 (entry 3h): trade 1 closed at 3h with +2% → taken.
    assert.deepEqual(got.map((t) => t.entryT / H), [3]);
  });

  it("gating a regime-switching tape beats the ungated baseline and is validated out of sample", () => {
    const xs: Trade[] = [];
    let i = 0;
    for (let cyc = 0; cyc < 12; cyc++) {
      for (let j = 0; j < 25; j++) xs.push(tr(i++, 0.01));
      for (let j = 0; j < 25; j++) xs.push(tr(i++, -0.012));
    }
    const res = optimizeLastN("x", xs, { gates: { ...DEFAULT_GATES, maxDdtH: 1e9 } });
    assert.ok(res.bestN > 0, `bestN ${res.bestN}`);
    assert.ok(res.is.net > res.baseline.is.net);
    assert.ok(res.oos.net > res.baseline.oos.net);
    assert.ok(res.oos.pf > 1);
    assert.ok(res.rows.length > 5);
  });

  it("a pure loser never succeeds", () => {
    const xs = Array.from({ length: 200 }, (_, k) => tr(k, k % 3 === 0 ? 0.01 : -0.01));
    const res = optimizeLastN("x", xs, { gates: DEFAULT_GATES });
    assert.equal(res.success, false);
  });
});

describe("evals", () => {
  it("windows pass, fail and idle independently", () => {
    const now = 100 * H;
    const xs: Trade[] = [];
    for (let k = 0; k < 60; k++) xs.push(tr(20 + k, k % 4 === 0 ? -0.005 : 0.01));
    xs.sort((a, b) => a.exitT - b.exitT);
    const ev = evaluateConfig("x", xs, { gates: DEFAULT_GATES, nowT: now });
    const w4 = ev.windows.find((w) => w.key === "4h")!;
    assert.equal(w4.n, 0);
    const w72 = ev.windows.find((w) => w.key === "72h")!;
    assert.ok(w72.pass);
    assert.ok(ev.success);
    const bad = evaluateConfig("x", xs.map((t) => ({ ...t, r: -Math.abs(t.r) })), { gates: DEFAULT_GATES, nowT: now });
    assert.equal(bad.success, false);
  });
});

describe("pipeline", () => {
  it("config ids round-trip", () => {
    const id = configId("pivot", "sar-std", { tp: 0.012, sl: 0.018, trail: 0.004, hold: 36 });
    assert.equal(id, "pivot|sar-std|tp1.2|sl1.8|tr0.4|h36");
    assert.deepEqual(parseConfigId(id), { bot: "pivot", ind: "sar-std", protect: { tp: 0.012, sl: 0.018, trail: 0.004, hold: 36 } });
  });

  it("runs all stages deterministically and arms only successes", () => {
    const bars = ["A", "B", "C", "D", "E", "F"].map((s) => tailBars(barsFromCandles(s, 5, syntheticCandles(s, 5, 1200, END)), 1200));
    const s = { ...DEFAULT_SETTINGS, refineTop: 6, evalTop: 12, armTop: 3 };
    const a = runPipelineSync(makeUniverse(bars), s);
    const b = runPipelineSync(makeUniverse(bars), s);
    assert.equal(a.s1.length, allCombos().length);
    assert.ok(a.s2.length > 0);
    assert.deepEqual(a.ranked.map((r) => r.id), b.ranked.map((r) => r.id));
    assert.deepEqual(a.armed, b.armed);
    for (const id of a.armed) {
      const r = a.ranked.find((x) => x.id === id)!;
      assert.ok(r.lastN?.success || r.evalRes?.success);
    }
    assert.ok(a.portfolio.members.length <= 3);
    // cost is applied: no trade can earn more than its move minus 0.2%
    for (const t of a.tapes.values().next().value ?? []) {
      assert.ok(Math.abs(t.r - (t.side * (t.exit - t.entry)) / t.entry + 0.002) < 1e-12);
    }
  });
});

describe("portfolio", () => {
  it("hour guard stops entries after the hour's closed trades lose the limit", async () => {
    const { applyHourGuard } = await import("./portfolio.ts");
    const M = 60_000;
    const mk = (e: number, x: number, r: number): Trade => ({ ...tr(0, r), entryT: e * M, exitT: x * M });
    // hour 0: loser closes at 10m (-1%), next entry at 20m must be skipped; entry at 5m (before the close) is taken
    const xs = [mk(0, 10, -0.01), mk(5, 30, 0.004), mk(20, 25, 0.01), mk(65, 70, 0.01)];
    const got = applyHourGuard(xs, 0.6).map((t) => t.entryT / M);
    assert.deepEqual(got.sort((a, b) => a - b), [0, 5, 65]);
    assert.equal(applyHourGuard(xs, 0).length, 4);
  });
});
