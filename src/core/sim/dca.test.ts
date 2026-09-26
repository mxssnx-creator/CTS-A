import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { simulateDca } from "./dca.ts";
import { barsFromCandles } from "../market/bars.ts";
import type { Candle } from "../domain/types.ts";

const mk = (rows: Array<[number, number, number, number]>): Candle[] => rows.map(([o, h, l, c], i) => ({ t: i * 900_000, o, h, l, c, v: 1 }));
const P = { tp: 0.02, sl: 0.05, trail: 0, hold: 20 };
const D = { levels: 2, step: 0.01 };

describe("dca", () => {
  it("normal DCA adds legs and re-anchors the target to the average", () => {
    const b = barsFromCandles("X", 15, mk([
      [100, 100, 100, 100],
      [100, 100.2, 98.8, 99], // leg 2 at 99 → avg 99.5, target 101.49 (no TP this bar)
      [99, 101.6, 98.9, 101.5], // TP 101.49
    ]));
    const r = simulateDca("c", b, new Int8Array([1, 0, 0]), P, D, false, 0.002);
    assert.equal(r.trades.length, 1);
    const tr = r.trades[0];
    assert.equal(tr.vol, 2);
    assert.equal(tr.reason, "tp");
    assert.ok(Math.abs(tr.exit - 99.5 * 1.02) < 1e-9);
    const expect = (tr.exit - 100) / 100 + (tr.exit - 99) / 99 - 0.004;
    assert.ok(Math.abs(tr.r - expect) < 1e-12);
  });

  it("DCA Active skips the base leg and trades only the level fill", () => {
    const b = barsFromCandles("X", 15, mk([
      [100, 100, 100, 100],
      [100, 100.5, 99.5, 100], // no fill (limit 99)
      [100, 100, 98.9, 99.2], // fill 99
      [99.2, 101.2, 99.1, 101], // TP 99·1.02 = 100.98
    ]));
    const r = simulateDca("c", b, new Int8Array([1, 0, 0, 0]), P, D, true, 0.002);
    assert.equal(r.trades.length, 1);
    assert.equal(r.trades[0].entry, 99);
    assert.equal(r.trades[0].kind, "dca-active");
    assert.ok(Math.abs(r.trades[0].r - (0.02 - 0.002)) < 1e-12);
  });

  it("DCA Active expires unfilled after hold bars", () => {
    const b = barsFromCandles("X", 15, mk(Array.from({ length: 30 }, () => [100, 100.3, 99.6, 100] as [number, number, number, number])));
    const sig = new Int8Array(30);
    sig[0] = 1;
    assert.equal(simulateDca("c", b, sig, P, D, true, 0.002).trades.length, 0);
  });

  it("stop stays anchored beyond the deepest level", () => {
    const b = barsFromCandles("X", 15, mk([
      [100, 100, 100, 100],
      [100, 100, 93, 94],
    ]));
    const r = simulateDca("c", b, new Int8Array([1, 0]), P, D, false, 0);
    assert.equal(r.trades[0].reason, "sl");
    assert.equal(r.trades[0].exit, 95);
    assert.equal(r.trades[0].vol, 3);
  });
});
