import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { simulate, mergeTapes } from "./backtest.ts";
import { barsFromCandles } from "../market/bars.ts";
import { statsOf, profitFactor, equityCurve } from "../metrics/stats.ts";
import { RT_COST } from "../config.ts";
import type { Candle, Protect } from "../domain/types.ts";

const M = 60_000;
function mk(rows: Array<[number, number, number, number]>): Candle[] {
  return rows.map(([o, h, l, c], i) => ({ t: i * 5 * M, o, h, l, c, v: 1 }));
}
const P: Protect = { tp: 0.01, sl: 0.01, trail: 0, hold: 50 };

describe("cost", () => {
  it("round-trip cost is 0.2%", () => {
    assert.equal(RT_COST, 0.002);
  });
});

describe("simulate", () => {
  it("enters at the next bar open, never on the signal bar", () => {
    const b = barsFromCandles("X", 5, mk([
      [100, 100, 100, 100],
      [105, 106, 104, 105],
      [105, 107, 104, 106],
      [106, 106.1, 105.5, 106],
    ]));
    const sig = new Int8Array([1, 0, 0, 0]);
    const res = simulate("c", b, sig, { ...P, tp: 0.01 }, { cost: RT_COST });
    assert.equal(res.trades.length, 1);
    assert.equal(res.trades[0].entry, 105);
    assert.equal(res.trades[0].reason, "tp");
    assert.ok(Math.abs(res.trades[0].exit - 106.05) < 1e-9);
    assert.ok(Math.abs(res.trades[0].r - (0.01 - 0.002)) < 1e-12);
  });

  it("is pessimistic when both stop and target are touched in one bar", () => {
    const b = barsFromCandles("X", 5, mk([
      [100, 100, 100, 100],
      [100, 102, 98, 100],
    ]));
    const res = simulate("c", b, new Int8Array([1, 0]), P, { cost: RT_COST });
    assert.equal(res.trades[0].reason, "sl");
    assert.ok(Math.abs(res.trades[0].r - (-0.01 - 0.002)) < 1e-12);
  });

  it("fills a gap through the stop at the open", () => {
    const b = barsFromCandles("X", 5, mk([
      [100, 100, 100, 100],
      [100, 100.2, 99.5, 100],
      [97, 97.5, 96, 97],
    ]));
    const res = simulate("c", b, new Int8Array([1, 0, 0]), P, { cost: 0 });
    assert.equal(res.trades[0].exit, 97);
  });

  it("short side mirrors long", () => {
    const b = barsFromCandles("X", 5, mk([
      [100, 100, 100, 100],
      [100, 100.5, 98.9, 99],
    ]));
    const res = simulate("c", b, new Int8Array([-1, 0]), P, { cost: RT_COST });
    assert.equal(res.trades[0].reason, "tp");
    assert.ok(Math.abs(res.trades[0].r - 0.008) < 1e-12);
  });

  it("trail tightens from completed-bar peaks only", () => {
    const b = barsFromCandles("X", 5, mk([
      [100, 100, 100, 100],
      [100, 100.8, 99.9, 100.7], // peak 100.8 → trail on (0.5%), stop = 100.296
      [100.6, 100.7, 100.2, 100.3], // low 100.2 <= stop → trail exit
    ]));
    const res = simulate("c", b, new Int8Array([1, 0, 0]), { tp: 0.05, sl: 0.01, trail: 0.005, hold: 50 }, { cost: 0 });
    assert.equal(res.trades[0].reason, "trail");
    assert.ok(Math.abs(res.trades[0].exit - 100.8 * 0.995) < 1e-9);
  });

  it("time exit at close after hold bars", () => {
    const b = barsFromCandles("X", 5, mk([
      [100, 100, 100, 100],
      [100, 100.1, 99.9, 100],
      [100, 100.1, 99.9, 100.05],
    ]));
    const res = simulate("c", b, new Int8Array([1, 0, 0]), { ...P, hold: 2 }, { cost: 0 });
    assert.equal(res.trades[0].reason, "time");
    assert.equal(res.trades[0].exit, 100.05);
  });

  it("reports the open position and a pending signal", () => {
    const b = barsFromCandles("X", 5, mk([
      [100, 100, 100, 100],
      [100, 100.1, 99.9, 100],
    ]));
    const r1 = simulate("c", b, new Int8Array([1, 0]), P, { cost: 0 });
    assert.ok(r1.open);
    const r2 = simulate("c", b, new Int8Array([0, -1]), P, { cost: 0 });
    assert.equal(r2.open, null);
    assert.equal(r2.pending, -1);
  });

  it("merges tapes by exit time", () => {
    const a = { cfg: "c", sym: "A", side: 1 as const, entryT: 0, exitT: 30, entry: 1, exit: 1, r: 0, reason: "tp" as const, bars: 1, mfe: 0, mae: 0 };
    const t = mergeTapes([[{ ...a, exitT: 50 }], [a]]);
    assert.deepEqual(t.map((x) => x.exitT), [30, 50]);
  });
});

describe("stats", () => {
  const H = 3_600_000;
  const tr = (r: number, i: number) => ({ r, entryT: i * H, exitT: (i + 1) * H });

  it("pf, wr, net", () => {
    const s = statsOf([tr(0.02, 0), tr(-0.01, 1), tr(0.01, 2)]);
    assert.equal(s.n, 3);
    assert.ok(Math.abs(s.pf - 3) < 1e-12);
    assert.ok(Math.abs(s.net - 2) < 1e-12);
    assert.ok(Math.abs(s.wr - 2 / 3) < 1e-12);
  });

  it("pf caps at 4 with no losses and 0 with no wins", () => {
    assert.equal(profitFactor(1, 0), 4);
    assert.equal(profitFactor(0, 0), 0);
  });

  it("mdd and ddt: time from peak to recovery", () => {
    // +1 (peak at 1h), -1 (2h), -1 (3h), +3 (4h: recovered)
    const s = statsOf([tr(0.01, 0), tr(-0.01, 1), tr(-0.01, 2), tr(0.03, 3)]);
    assert.ok(Math.abs(s.mdd - 2) < 1e-9);
    assert.ok(Math.abs(s.ddt - 3) < 1e-9);
    assert.equal(s.ddtNow, 0);
  });

  it("ongoing drawdown counts to now", () => {
    const s = statsOf([tr(0.01, 0), tr(-0.01, 1)], 10 * H);
    assert.ok(Math.abs(s.ddtNow - 9) < 1e-9);
    assert.ok(Math.abs(s.ddt - 9) < 1e-9);
  });

  it("drawdown from the start counts from the first entry", () => {
    const s = statsOf([tr(-0.01, 0), tr(0.02, 1)]);
    assert.ok(Math.abs(s.ddt - 2) < 1e-9);
  });

  it("equity curve shades drawdown spans", () => {
    const c = equityCurve([tr(0.01, 0), tr(-0.01, 1), tr(0.02, 2)]);
    assert.deepEqual(c.ddSpans, [[H, 3 * H]]);
    assert.equal(c.eq.length, 3);
  });
});
