import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "./engine.ts";
import { finishBaseEval, initVstEngine, laneClosed, laneLastNDecision, liveShouldExecute } from "./vst.ts";

const own = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const,
  tactic: "trailing" as const, rangeType: "atr" as const, kind: "block" as const, playbook: "block",
  tpAtr: .3, slOfTp: .25, trailPct: .2, calc: "px" as const,
  microRange: true, minimalRange: false, shortRange: true, modelRtCost: .0011, minSlDistancePct: .1 };
function fixture() {
  const e = initVstEngine(DEFAULT_TACTIC_CONFIG, { arm: false, warmup: 0, symbolCount: 3 });
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, block: true };
  e.preEvalDone = true; e.liveTape = true; e.tick = 100;
  e.closed = Array.from({ length: 60 }, (_, i) => ({ ...own, id: `x:owned-${i}`, connId: e.activeConnId,
    pnl: 1, ratio: .01, qty: 1, entry: 100, exit: 101.11, reason: "tp" as const,
    tick: 99 - i, r: 1, validExec: true }));
  return e;
}

for (const [name, changed] of Object.entries({
  "Micro/Minimal": { microRange: false, minimalRange: true },
  "Short mode": { shortRange: false },
  "calculation lane": { calc: "rng" as const },
  "trailing ratio": { trailPct: .3 },
  "fee policy": { modelRtCost: .00176 },
  "stop floor": { minSlDistancePct: .2 },
})) {
  test(`${name}: sibling evidence cannot qualify another execution configuration`, () => {
    const e = fixture();
    assert.equal(liveShouldExecute(e, own), true, "the measured own configuration still qualifies");
    const sibling = { ...own, ...changed };
    assert.equal(laneClosed(e, sibling, 80).length, 0, "no sibling closes in this exact lane");
    assert.equal(liveShouldExecute(e, sibling), false, "empty exact history cannot inherit wins");
    const restored = JSON.parse(JSON.stringify(e));
    assert.equal(liveShouldExecute(restored, own), true);
    assert.equal(liveShouldExecute(restored, sibling), false, "restart keeps the same ownership boundary");
  });
}

test("frozen Base evidence retains range, calculation and economic identity", () => {
  const e = fixture(); e.liveTape = false; e.preEvalDone = false;
  finishBaseEval(e);
  e.closed = []; e.liveTape = true;
  assert.equal(liveShouldExecute(e, own), true);
  assert.equal(liveShouldExecute(e, { ...own, microRange: false, minimalRange: true }), false);
  assert.equal(liveShouldExecute(e, { ...own, modelRtCost: .00176 }), false);
});

test("last-N decision cache is independent for each calculation and fee policy", () => {
  const e = fixture();
  const ownResult = laneLastNDecision(e, own);
  assert.notDeepEqual(laneLastNDecision(e, { ...own, calc: "rng" }), ownResult);
  assert.notDeepEqual(laneLastNDecision(e, { ...own, modelRtCost: .00176 }), ownResult);
  assert.deepEqual(laneLastNDecision(e, own), ownResult);
});

test("another desk connection cannot supply live or frozen qualification evidence", () => {
  const e = fixture();
  e.closed.forEach((c) => { c.connId = "bingx-vst-01"; });
  assert.equal(laneClosed(e, own, 80).length, 0);
  assert.equal(liveShouldExecute(e, own), false);
  e.liveTape = false; e.preEvalDone = false;
  finishBaseEval(e); e.closed = []; e.liveTape = true;
  assert.equal(liveShouldExecute(e, own), false);
});
