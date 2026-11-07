import assert from "node:assert/strict";
import { it } from "node:test";
import { profitFactor, ratioProfitFactor, pfFromPnls } from "./engine.ts";
import { lastNPrefix, lastNHitFromPrefix } from "./last-n-progress.ts";

it("preserves tiny measured losses and neutral PF across return units", () => {
  for (const scale of [1, 1e-8, 1e-14, 1e-100]) {
    assert.equal(profitFactor(scale, scale), 1);
    assert.equal(profitFactor(scale, 2 * scale), .5);
    assert.equal(profitFactor(2 * scale, scale), 2);
    assert.equal(ratioProfitFactor(scale, 2 * scale, 1), .5);
    const rows = [{ pnl: 2 * scale }, { pnl: -scale }];
    assert.equal(pfFromPnls(rows), 2);
    assert.equal(lastNHitFromPrefix(lastNPrefix(rows, 2), 2).pf, 2);
  }
});

it("invalid aggregate loss evidence cannot become a no-loss qualification", () => {
  for (const loss of [NaN, Infinity, -1]) {
    assert.equal(profitFactor(1, loss), 0);
    assert.equal(ratioProfitFactor(1, loss, 1), 0);
  }
  assert.equal(profitFactor(0, 0), 0); // internal empty score is not a measured PF
});

it("unknown returns stay in the current window and cannot resurrect older wins", () => {
  for (const unknown of [{ pnl: NaN }, {}, { ratio: NaN, pnl: 1000 }]) {
    const rows = [unknown, ...Array.from({ length: 20 }, () => ({ pnl: 1 }))];
    const hit = lastNHitFromPrefix(lastNPrefix(rows, 8), 8);
    assert.equal(hit.samples, 8);
    assert.equal(hit.ok, false);
    assert.equal(hit.pf, 0);
    assert.equal(pfFromPnls(rows), 0);
  }
});
