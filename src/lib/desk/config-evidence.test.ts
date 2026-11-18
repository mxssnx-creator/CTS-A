import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "./engine.ts";
import { finishBaseEval, initVstEngine, laneClosed, laneLastNDecision, lanePassExec, liveShouldExecute, lastNSampleCoverage, registerSampleContext, configStepFloor, tickVst } from "./vst.ts";

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

test("a validated signed 20/10/3 configuration reaches its own execution lane", () => {
  const e=fixture();
  e.lastNProgress={evalNs:[20],validNs:[10],disableNs:[3],mode:"independent",parallelStack:false,parallelVolRatio:1,
    blocks:{long:20,short:10,minimal:3,shortPolarity:"negative",minimalPolarity:"negative"}};
  e.closed=Array.from({length:33},(_,i)=>({...e.closed[0],id:`x:signed-${i}`,tick:99-i,
    pnl:i<13?-1:i%2? -1:2,ratio:i<13?-.01:i%2? -.01:.02}));
  assert.equal(laneLastNDecision(e,own).pass,true);
  assert.equal(lanePassExec(e,own),true);
  assert.equal(liveShouldExecute(e,own),true);
  assert.equal(lanePassExec(e,{...own,calc:"rng"}),false,"a sibling configuration has no evidence");
  const changed=fixture();changed.lastNProgress=e.lastNProgress;changed.closed=e.closed.slice(1);
  assert.equal(lanePassExec(changed,own),false,"32 samples cannot satisfy 20/10/3");
  const wrong=fixture();wrong.lastNProgress=e.lastNProgress;
  wrong.closed=e.closed.map((row,i)=>i>=3&&i<13?{...row,pnl:1,ratio:.01}:row);
  assert.equal(lanePassExec(wrong,own),false,"a positive short block does not pass a negative short policy");
  const vetoed=fixture();vetoed.lastNProgress={...e.lastNProgress,negativeFilter:{windows:[1],mode:"any",maxPf:1}};vetoed.closed=e.closed;
  assert.equal(liveShouldExecute(vetoed,own),false,"a separate recent-loss veto cannot be bypassed by signed blocks");
  e.liveTape=false;e.preEvalDone=false;finishBaseEval(e);e.closed=[];e.liveTape=true;
  assert.equal(liveShouldExecute(e,own),true,"the own signed Base evidence survives the stage boundary");
  assert.equal(liveShouldExecute(JSON.parse(JSON.stringify(e)),own),true,"the signed evidence survives restart");
});

test("last-N decision cache is independent for each calculation and fee policy", () => {
  const e = fixture();
  const ownResult = laneLastNDecision(e, own);
  assert.notDeepEqual(laneLastNDecision(e, { ...own, calc: "rng" }), ownResult);
  assert.notDeepEqual(laneLastNDecision(e, { ...own, modelRtCost: .00176 }), ownResult);
  assert.deepEqual(laneLastNDecision(e, own), ownResult);
});

test("completed config windows exclude Base boundary flattens before selecting last N", () => {
  const e=fixture();
  e.lastNProgress={evalNs:[8],validNs:[8],disableNs:[8],mode:"independent",parallelStack:false,parallelVolRatio:1};
  const settled=e.closed.slice(0,8);
  e.closed=[...settled.map((row,i)=>({...row,id:`x:flat-${i}`,tick:e.tick,pnl:-1,ratio:-.01,examFlat:true})),...settled];
  assert.equal(laneLastNDecision(e,own).pass,true);
  assert.equal(liveShouldExecute(e,own),true);
  assert.equal(lastNSampleCoverage(e).stages!.currentOwn[0].usable,1);
  assert.equal(liveShouldExecute(e,{...own,tpAtr:own.tpAtr+1e-7}),false);
});

test("a close from an almost equal TP cannot qualify a different frozen configuration", () => {
  const e=fixture();e.liveTape=false;e.preEvalDone=false;finishBaseEval(e);
  e.closed=[];e.liveTape=true;
  assert.equal(liveShouldExecute(e,own),true);
  assert.equal(liveShouldExecute(e,{...own,tpAtr:own.tpAtr+1e-7}),false);
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


test("registered empty cohorts remain after denial, cancellation and restart",()=>{
  const e=fixture();
  e.lastNProgress={evalNs:[3],validNs:[2],disableNs:[1],mode:"independent",parallelStack:false,parallelVolRatio:1};
  const empty={...own,connId:e.activeConnId,calc:"rng"};
  registerSampleContext(e,empty);
  assert.equal(liveShouldExecute(e,empty),false);
  e.queue=[]; e.orders=[];
  const row=lastNSampleCoverage(JSON.parse(JSON.stringify(e))).rows[0];
  assert.deepEqual([row.contexts,row.usable,row.insufficient,row.pct],[2,1,1,50]);
});

test("frozen Base retains Last-200 per cohort beyond the old mixed 2,400 cap and restart",()=>{
  const e=fixture();
  e.closed=Array.from({length:13},(_,config)=>Array.from({length:200},(_,i)=>({...e.closed[0],
    id:`x:cohort-${config}-${i}`,trailPct:config/10,tick:300-i}))).flat();
  e.lastNProgress={evalNs:[200],validNs:[200],disableNs:[200],mode:"independent",parallelStack:false,parallelVolRatio:1};
  e.liveTape=false;e.preEvalDone=false;finishBaseEval(e);e.closed=[];e.liveTape=true;
  const restored=JSON.parse(JSON.stringify(e));
  assert.equal(liveShouldExecute(restored,{...own,trailPct:1.2}),true);
  const coverage=lastNSampleCoverage(restored);
  assert.equal(coverage.stages!.frozenBase![0].usable,13);
  assert.equal(coverage.stages!.currentOwn[0].usable,0);
  assert.equal(coverage.rows[0].usable,13);
});

test("legacy missing economic identity reports unavailable rather than fabricated sufficiency",()=>{
  const e=fixture();e.closed.forEach(row=>{delete row.modelRtCost;});
  const row=lastNSampleCoverage(e).rows[0];
  assert.equal(row.unavailable,1); assert.equal(row.usable,0); assert.equal(row.insufficient,0);
});

test("step PF uses final own geometry and preserves requested and effective SL constraints",()=>{
  const e=fixture();
  e.stepPf={enabled:true,ratio:.2,max:2,byStep:{"3":1.7},bySlRatio:{"0.25":1.4,"0.75":1.8}};
  const rel={...own,shortRange:true,microRange:false,tpAtr:.6,price:100,tpDist:.3,slDist:.225};
  assert.equal(configStepFloor(e,1.1,rel),1.8);
  assert.equal(configStepFloor(e,1.9,rel),1.9);
  e.stepPf.bySlRatio={"0.25":1.9,"0.75":1.8};
  assert.equal(configStepFloor(e,1.1,rel),1.9);
});


test("native pooled truncation cannot discard an intact own Last-200 ring at Base freeze",()=>{
  const e=fixture();e.closed=[];e.liveTape=false;e.preEvalDone=false;e.completeSim=false;
  e.lastNProgress={evalNs:[200],validNs:[200],disableNs:[200],mode:"independent",parallelStack:false,parallelVolRatio:1};
  e.pfCoords={hourKeep:false,bankWin:false,pairAdd:false,laneCool:false,winAgain:false};
  e.strategyToggles={...DEFAULT_STRATEGY_TOGGLES,normal:true,block:false,axis:false,dca:false};
  const q=e.quotes[own.symbol];q.px=q.lo=q.hi=q.open=99;
  const settle=(count:number,calc:"px"|"rng",offset:number)=>{
    e.tick++;
    e.positions=Array.from({length:count},(_,i)=>({...own,calc,id:`native-${offset+i}`,connId:e.activeConnId,
      qty:1,plannedQty:1,avgEntry:100,mark:100,sl:99.5,tp:102,slDist:.5,tpDist:2,
      realized:0,unrealized:0,legs:[{orderId:`fill-${offset+i}`,qty:1,px:100}],
      controllingRange:"atr",rangeSpacing:.5,status:"open",openedTick:1,validExec:false}));
    tickVst(e,DEFAULT_TACTIC_CONFIG,"trailing",{bookOnly:true,skipWalk:true,skipMatch:true});
    assert.equal(e.positions.length,0);
  };
  settle(199,"px",0);settle(600,"rng",199);settle(1,"px",799);
  assert.equal(e.closed.length,600);
  assert.equal(e.closed.filter(row=>row.calc==="px").length,1);
  assert.equal(lastNSampleCoverage(e).rows[0].usable,2,"both full own rings are readable despite pooled truncation");
  finishBaseEval(e);
  assert.equal(e.frozenBaseSamples!.filter(row=>row.calc==="px").length,200);
  assert.equal(lastNSampleCoverage(e).stages!.frozenBase![0].usable,2);
  e.closed=[{...e.closed[0],id:"new-unmatched-loss",tick:e.tick+1,pnl:-3,ratio:-.03}];
  assert.equal(lastNSampleCoverage(e).rows[0].usable,1,"the new own tape cannot be replaced by its older ring");
});

test("a complete long signed window survives the Base checkpoint for its exact lane", () => {
  const e=fixture(); e.liveTape=false; e.preEvalDone=false;
  e.lastNProgress={evalNs:[20],validNs:[10],disableNs:[3],mode:"independent",parallelStack:false,parallelVolRatio:1,
    blocks:{long:205,short:10,minimal:3,shortPolarity:"negative",minimalPolarity:"negative"}};
  e.closed=Array.from({length:218},(_,i)=>({...e.closed[0],id:`x:long-owned-${i}`,tick:999-i,
    pnl:i<13?-1:i%3?-1:4,ratio:i<13?-.01:i%3?-.01:.04}));
  assert.equal(laneLastNDecision(e,own).pass,true);
  finishBaseEval(e); e.closed=[];e.liveTape=true;
  assert.equal(liveShouldExecute(e,own),true);
  assert.equal(liveShouldExecute(JSON.parse(JSON.stringify(e)),own),true);
  assert.equal(liveShouldExecute(e,{...own,modelRtCost:.00176}),false);
});


test("absolute stop and trailing cells keep independent live and frozen Base evidence", () => {
  const e = fixture();
  const exact = { ...own, priceStopPct: .2, priceTrailPct: .2, trailingDistance: "dynamic" as const };
  e.closed = Array.from({ length: 60 }, (_, i) => ({ ...e.closed[0], ...exact, id: `x:absolute-${i}`, tick: 99 - i }));
  assert.equal(liveShouldExecute(e, exact), true);
  for (const sibling of [
    { ...exact, priceStopPct: .3 },
    { ...exact, priceTrailPct: .3 },
    { ...exact, trailingDistance: "fixed" as const },
  ]) {
    assert.equal(laneClosed(e, sibling, 80).length, 0);
    assert.equal(liveShouldExecute(e, sibling), false, "a price-grid sibling cannot inherit the selected cell");
  }
  e.liveTape = false; e.preEvalDone = false;
  finishBaseEval(e); e.closed = []; e.liveTape = true;
  const restored = JSON.parse(JSON.stringify(e));
  assert.equal(liveShouldExecute(restored, exact), true, "the exact cell survives Base and restart");
  assert.equal(liveShouldExecute(restored, { ...exact, priceTrailPct: .3 }), false);
});
