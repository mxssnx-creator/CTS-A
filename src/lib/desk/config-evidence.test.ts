import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "./engine.ts";
import { finishBaseEval, initVstEngine, laneClosed, laneLastNDecision, liveShouldExecute, lastNSampleCoverage } from "./vst.ts";

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

test("sample coverage includes known empty own configs and ignores another connection",()=>{
  const e=fixture();
  e.lastNProgress={evalNs:[3],validNs:[2],disableNs:[1],mode:"independent",parallelStack:false,parallelVolRatio:1};
  e.closed[0].pnl=-1; e.closed[0].ratio=-.01;
  e.positions.push({...own,connId:e.activeConnId,calc:"rng"} as never);
  e.closed.push({...e.closed[0],connId:"bingx-vst-01",calc:"rng"});
  const r=lastNSampleCoverage(e).rows[0];
  assert.deepEqual([r.contexts,r.usable,r.insufficient,r.pct],[2,1,1,50]);
  assert.deepEqual(lastNSampleCoverage(JSON.parse(JSON.stringify(e))),lastNSampleCoverage(e));
});

test("configured Last-200 reaches exact live and frozen Base qualification", () => {
  const e = fixture();
  e.lastNProgress = { evalNs:[200], validNs:[200], disableNs:[200], mode:"independent", parallelStack:false, parallelVolRatio:1 };
  e.closed = Array.from({length:200}, (_,i)=>({...e.closed[0],id:`x:long-${i}`,tick:201-i}));
  e.tick = 202;
  assert.equal(liveShouldExecute(e, own), true, "all 200 own samples must reach the configured window");
  assert.equal(liveShouldExecute(JSON.parse(JSON.stringify(e)), own), true);
  e.liveTape = false; e.preEvalDone = false;
  finishBaseEval(e);
  e.closed = []; e.liveTape = true;
  assert.equal(liveShouldExecute(e, own), true, "the frozen own Base tape must retain the requested 200");
  assert.equal(lastNSampleCoverage(e).rows[0].usable, 1, "coverage describes the same chosen frozen tape");
  // A newly observed loss takes priority over an older fully sampled Base pass.
  e.closed = [{...fixture().closed[0],pnl:-1,ratio:-.01}];
  assert.equal(liveShouldExecute(e, own), false);
  assert.equal(lastNSampleCoverage(e).rows[0].usable, 0);
});

test("Last-200 does not hide older own losses behind an 80-sample cap", () => {
  const e = fixture();
  e.lastNProgress = { evalNs:[200], validNs:[200], disableNs:[200], mode:"independent", parallelStack:false, parallelVolRatio:1 };
  e.closed = Array.from({length:200}, (_,i)=>({...e.closed[0],id:`x:mixed-${i}`,tick:201-i,
    pnl:i<80?1:-2,ratio:i<80?.01:-.02}));
  e.tick=202;
  assert.equal(liveShouldExecute(e, own), false, "the selected complete window has PF 1/3");
  e.liveTape=false; e.preEvalDone=false; finishBaseEval(e); e.closed=[]; e.liveTape=true;
  assert.equal(liveShouldExecute(e, own), false, "frozen Base proof must read the same full window");
});

for (const independent of [false, true]) test(`warm-up cannot bypass an ${independent ? "independent" : "explicit"} recent-loss veto`, () => {
  const e = fixture();
  const negativeFilter = {windows:[1],mode:"any" as const,maxPf:1};
  e.lastNProgress = {evalNs:[200],validNs:[200],disableNs:[200],mode:"independent",parallelStack:false,parallelVolRatio:1,
    negativeFilter, ...(independent ? {policies:[{id:"own",role:"independent" as const,evalNs:[3],validNs:[3],disableNs:[3],mode:"independent" as const,parallelStack:false,parallelVolRatio:1}]} : {})};
  e.closed = e.closed.slice(0,12);
  e.closed[0].pnl=-1; e.closed[0].ratio=-.01;
  assert.equal(liveShouldExecute(e,own),false,"a profitable eight-row fallback cannot ignore the selected veto");
});
