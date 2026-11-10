import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "./engine.ts";
import { armUniverse, finishBaseEval, initVstEngine, liveShouldExecute, auditEngine } from "./vst.ts";

test("audit accepts the own cost-plus-stop floor but rejects an unjustified wider stop",()=>{
  for (const side of ["long","short"] as const) {
    const e=initVstEngine(DEFAULT_TACTIC_CONFIG,{arm:false,warmup:0,symbolCount:3});
    const sign=side==="long"?1:-1;
    e.positions=[{id:"floor",symbol:"BTCUSDT",side,avgEntry:100,qty:1,unrealized:0,
      sl:100-sign*.276,tp:100+sign*.2,slOfTp:.25,modelRtCost:.00176,minSlDistancePct:.1} as never];
    assert.equal(auditEngine(e).ratioViolations,0);
    e.positions[0].sl=100-sign*.4;
    assert.equal(auditEngine(e).ratioViolations,1);
  }
});

for (const range of ["micro", "minimal", "short"] as const) {
  test(`${range}: complete paper admission uses the same exact evidence as the execution gate`, () => {
    const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: range === "micro", minimalRange: range === "minimal",
      shortRange: range === "short", tpAtr: range === "micro" ? .3 : range === "minimal" ? 2 : .6, slOfTp: .5 };
    const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false };
    armUniverse(e, cfg, "trailing", "atr");
    const initial = [...e.orders, ...e.queue];
    assert.ok(initial.length > 1, "Base discovery runs before qualification");
    const seed = initial.find(o => o.tactic === "trailing" && o.calc === "base") ?? initial[0];
    e.tick = 100;
    e.closed = Array.from({ length: 60 }, (_, i) => ({ ...seed, id: `known-${i}`, pnl: 1, ratio: .01,
      entry: seed.price, exit: seed.price * (seed.side === "long" ? 1.012 : .988),
      reason: "tp" as const, tick: 99 - i, r: 1, validExec: false }));
    e.queue = []; e.orders = []; e.positions = [];
    finishBaseEval(e);
    const executionDecision = (order: typeof seed) => {
      e.liveTape = true;
      try { return liveShouldExecute(e, order); } finally { e.liveTape = false; }
    };
    assert.equal(executionDecision(seed), true, "known exact Base history qualifies");
    const unknown = { ...seed, slOfTp: seed.slOfTp === .25 ? .5 : .25 };
    assert.equal(executionDecision(unknown), false, "an unobserved sibling is not qualified");
    armUniverse(e, cfg, "trailing", "atr");
    const admitted = [...e.orders, ...e.queue].filter(o => o.validExec);
    assert.ok(admitted.length > 0, "qualified cells remain available after Base");
    for (const order of admitted) assert.equal(executionDecision(order), true,
      `paper admitted an unqualified ${range} cell ${JSON.stringify([order.symbol, order.indication, order.calc, order.tpAtr, order.slOfTp])}`);
    e.queue = []; e.orders = []; e.positions = [];
    e.liveTape = true;
    armUniverse(e, cfg, "trailing", "atr");
    const live = [...e.orders, ...e.queue].filter(o => o.validExec);
    assert.ok(live.length > 0, "the actual live admission path can also arm qualified cells");
    for (const order of live) assert.equal(liveShouldExecute(e, order), true,
      "live admission preserves the complete geometry/economic identity");
  });
}
