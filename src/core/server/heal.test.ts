// Self-healing / recovery tests with an injected market feed (no network).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoreRuntime, type MarketFeed } from "./runtime.server.ts";
import { CoreDb } from "./db.server.ts";
import { syntheticCandles } from "../market/bars.ts";

const small = { symbols: 3, historyDays: 18, mainTop: 10, refineTop: 4, evalTop: 6, cycleMs: 60_000 };
const until = async (cond: () => boolean, ms = 180_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
};

function fakeFeed(state: { up: boolean; historyCalls: number }): Partial<MarketFeed> {
  return {
    tickers: async () => {
      if (!state.up) throw new Error("ECONNREFUSED");
      return ["AAA-USDT", "BBB-USDT", "CCC-USDT"].map((sym, i) => ({ sym, last: 1, quoteVol: 1e9 - i, changePct: 0 }));
    },
    history: async (sym, tf, bars) => {
      state.historyCalls++;
      if (!state.up) throw new Error("ECONNREFUSED");
      return syntheticCandles(sym, tf, bars, Date.now() - tf * 60_000);
    },
    klines: async () => [],
  };
}

describe("self-healing", { timeout: 600_000 }, () => {
  it("uses no mock data when BingX is down, retries with backoff and recovers with real data", async () => {
    const st = { up: false, historyCalls: 0 };
    const rt = new CoreRuntime(new CoreDb(":memory:"), small, { market: "bingx", feed: fakeFeed(st) });
    rt.start();
    await until(() => rt.status.errorsInRow >= 1);
    assert.equal(rt.status.state, "error");
    assert.equal(rt.status.source, "none");
    assert.equal(rt.candles.size, 0, "no mock candles");
    assert.match(rt.status.error ?? "", /no mock data/);
    st.up = true;
    rt.kick();
    await until(() => rt.status.source === "bingx" && rt.status.computes >= 1);
    assert.ok(rt.status.symbols.every((s) => /^(AAA|BBB|CCC)-USDT$/.test(s)));
    assert.match(rt.status.lastHeal, /recovered after/);
    rt.stop();
  });

  it("backs off on repeated cycle failures and recovers", async () => {
    const st = { up: true, historyCalls: 0 };
    const rt = new CoreRuntime(new CoreDb(":memory:"), small, { market: "bingx", feed: fakeFeed(st) });
    const real = rt.compute.bind(rt);
    let fail = 2;
    rt.compute = async (gen?: number) => {
      if (fail-- > 0) throw new Error("injected compute failure");
      return real(gen);
    };
    rt.start();
    await until(() => rt.status.errorsInRow === 1);
    const wait1 = rt.status.nextCycleAt - Date.now();
    assert.ok(wait1 > 3_000 && wait1 <= 5_000, `first backoff ${wait1} ms`);
    assert.equal(rt.status.state, "error");
    // don't wait out the backoff in the test: kick the next attempts
    rt.kick();
    await until(() => rt.status.errorsInRow === 2);
    assert.ok(rt.status.nextCycleAt - Date.now() > 8_000, "second backoff doubles");
    rt.kick();
    await until(() => rt.status.computes >= 1 && rt.status.state === "running");
    assert.equal(rt.status.errorsInRow, 0);
    assert.match(rt.status.lastHeal, /recovered after 2 failed cycle/);
    rt.stop();
  });

  it("reschedules a lost timer and repairs a symbol gap by re-backfilling it", async () => {
    const st = { up: true, historyCalls: 0 };
    const rt = new CoreRuntime(new CoreDb(":memory:"), small, { market: "bingx", feed: fakeFeed(st) });
    rt.start();
    await until(() => rt.status.computes >= 1 && rt.status.state === "running");
    // lose the timer
    const priv = rt as unknown as { timer: ReturnType<typeof setTimeout> | null };
    if (priv.timer) clearTimeout(priv.timer);
    priv.timer = null;
    const calls = st.historyCalls;
    // make one symbol 400 bars stale
    const cs = rt.candles.get("AAA-USDT")!;
    rt.candles.set("AAA-USDT", cs.slice(0, cs.length - 400));
    await rt.heal();
    assert.match(rt.status.lastHeal, /rescheduling/);
    await until(() => st.historyCalls > calls && rt.status.computes >= 2);
    const events = rt.db.all<{ msg: string }>("SELECT msg FROM events WHERE msg LIKE 'self-heal%'").map((e) => e.msg);
    assert.ok(events.some((m) => /re-backfilled 1 symbol/.test(m)), events.join(" | "));
    assert.ok(Date.now() - rt.candles.get("AAA-USDT")!.at(-1)!.t < 60 * 60_000);
    rt.stop();
  });
});
