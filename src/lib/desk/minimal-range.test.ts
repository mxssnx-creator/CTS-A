import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allMinimalCombos,
  minimalControlPrices,
  minimalTrailPct,
  MINIMAL_SL_OF_TP,
  MINIMAL_TP_COST,
  MINIMAL_WINNER,
  POSITION_COST_PCT,
  resolveRangeTouch,
  shortControlPrices,
  SYSTEM_MIN_SL_PCT,
  trailStopFromPeak,
} from "./engine.ts";

describe("minimal range", () => {
  it("covers position-cost TP 1–3 and SL 1–3 of TP at 0.25", () => {
    assert.equal(MINIMAL_TP_COST[0], 1);
    assert.equal(MINIMAL_TP_COST[MINIMAL_TP_COST.length - 1], 3);
    assert.equal(MINIMAL_TP_COST.length, 9);
    assert.equal(MINIMAL_SL_OF_TP.length, 9);
    assert.equal(allMinimalCombos().length, 81);
    for (let i = 1; i < MINIMAL_TP_COST.length; i++) {
      assert.ok(Math.abs(MINIMAL_TP_COST[i]! - MINIMAL_TP_COST[i - 1]! - 0.25) < 1e-9);
    }
  });

  it("prices from position cost and sits under the short floor at 1×", () => {
    const px = 100;
    const row = minimalControlPrices("long", px, 1, 1);
    const cost = px * POSITION_COST_PCT;
    assert.ok(Math.abs(row.tpDist - cost) < 1e-9);
    assert.ok(Math.abs(row.slDist - cost) < 1e-9);
    assert.ok(row.tp > px && row.sl < px);
    const short = shortControlPrices("long", px, px * 0.01, 0.3, 1);
    assert.ok(row.tpDist < short.tpDist);
    assert.ok(row.slDist + 1e-12 < px * (SYSTEM_MIN_SL_PCT / 100));
  });

  it("keeps the SL/TP ratio on a wider cell", () => {
    const row = minimalControlPrices("short", 50, 2.5, 1.25);
    assert.ok(Math.abs(row.slDist / row.tpDist - 1.25) < 1e-9);
    assert.ok(row.tp < 50 && row.sl > 50);
  });

  it("resolves a dual touch by the barrier closer to the open", () => {
    const px = 100;
    const row = minimalControlPrices("long", px, 2, 1);
    assert.equal(resolveRangeTouch("long", px, px + row.tpDist * 3, px - row.slDist * 3, px + row.tpDist * 0.2, row.sl, row.tp), "tp");
    assert.equal(resolveRangeTouch("long", px, px + row.tpDist * 3, px - row.slDist * 4, px - row.slDist * 0.2, row.sl, row.tp), "sl");
    assert.equal(resolveRangeTouch("long", px + row.tpDist * 1.2, px + row.tpDist * 2, px - row.slDist * 2, px + row.tpDist * 1.1, row.sl, row.tp), "tp");
    assert.equal(resolveRangeTouch("short", 50, 51, 49, 50.05, 50.2, 49.8), "sl");
  });

  it("trails only the optimal cells and locks inside the minimal target", () => {
    assert.equal(minimalTrailPct(MINIMAL_WINNER.tpCost, MINIMAL_WINNER.slOfTp), null);
    const opt = { tpCost: 3, slOfTp: 1.75, trailPct: 1.5 };
    assert.equal(minimalTrailPct(opt.tpCost, opt.slOfTp), opt.trailPct);
    assert.equal(minimalTrailPct(1, 3), null);
    const row = minimalControlPrices("long", 100, opt.tpCost, opt.slOfTp);
    const peak = 100 + row.tpDist * 0.9;
    const next = trailStopFromPeak({
      side: "long",
      entry: 100,
      peak,
      tp: row.tp,
      sl: row.sl,
      trailPct: opt.trailPct,
      minimalRange: true,
    });
    assert.ok(next > row.sl);
    assert.ok(next < peak);
    assert.ok(next > 100);
  });
});
