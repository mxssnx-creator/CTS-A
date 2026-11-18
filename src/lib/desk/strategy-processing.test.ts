import {it} from "node:test";
import assert from "node:assert/strict";
import {sanitizeStrategyRangeSwitches,strategyTogglesForRange,STRATEGY_PROCESSING_RANGES,TRADE_COORDINATIONS} from "./strategy-processing.ts";
import {DEFAULT_STRATEGY_TOGGLES,sanitizeStrategyToggles,liveTacticsOf,DEFAULT_TACTIC_CONFIG} from "./engine.ts";
import {enabledLiveTactics,initVstEngine,liveShouldExecute,strategyProcessingFor} from "./vst.ts";
it("overall masters and every range remain independent while additional strategies retain their switches",()=>{
 for(const range of STRATEGY_PROCESSING_RANGES)for(const normal of [false,true])for(const trailing of [false,true]){
  const t={...DEFAULT_STRATEGY_TOGGLES,normal,trailing,axis:true,block:true,dca:true,ranges:{[range]:{normal:false,trailing:false}}};
  const isCoordination = (TRADE_COORDINATIONS as readonly string[]).includes(range);
  const own = isCoordination ? strategyTogglesForRange(t, range as typeof TRADE_COORDINATIONS[number])
    : strategyTogglesForRange(t, "normal", range as "atr");
  assert.equal(own.normal,false);assert.equal(own.trailing,false);
  assert.deepEqual([own.axis,own.block,own.dca],[true,true,true]);
  assert.deepEqual(sanitizeStrategyToggles(JSON.parse(JSON.stringify(t))),t);
 }
 assert.deepEqual(sanitizeStrategyRangeSwitches({atr:{normal:'false',trailing:false},bad:{normal:false}}),{atr:{trailing:false}});
 assert.deepEqual(liveTacticsOf({normal:false,trailing:false,axis:false,block:false,dca:false}),[]);
});

it("Low-Range owns its tactic choices and inherits existing tier controls when unset", () => {
 const e = initVstEngine(DEFAULT_TACTIC_CONFIG, { arm: false, warmup: 0, symbolCount: 1 });
 const short = { rangeType: "atr" as const, shortRange: true, indication: "trend" as const };
 const low = { ...short, indication: "low-range-6-edge-turn-standalone" as const };
 e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, ranges: { short: { normal: false, trailing: false } } };
 assert.equal(strategyProcessingFor(e, low).normal, false);
 assert.ok(!enabledLiveTactics(e, low).includes("trailing"));
 e.strategyToggles.ranges!["low-range"] = { normal: true, trailing: true };
 assert.ok(enabledLiveTactics(e, low).includes("trailing"));
 assert.ok(!enabledLiveTactics(e, short).includes("trailing"));
 const order = { symbol: "BTCUSDT", side: "long" as const, tactic: "trailing" as const, playbook: "short" };
 assert.equal(liveShouldExecute(e, { ...order, ...low }), true);
 assert.equal(liveShouldExecute(e, { ...order, ...short }), false);
 e.strategyToggles.ranges!["low-range"] = { normal: true, trailing: false };
 assert.equal(liveShouldExecute(e, { ...order, ...low }), false);
 assert.equal(liveShouldExecute(e, { ...order, ...low, tactic: "axis", playbook: "axis" }), e.strategyToggles.axis);
});
it("a validated Normal lane cannot bypass Normal off; range trailing never suppresses Axis/Block/DCA",()=>{
 const e=initVstEngine(DEFAULT_TACTIC_CONFIG,{arm:false,warmup:0,symbolCount:1});
 e.strategyToggles={normal:false,trailing:true,axis:true,block:true,dca:true};
 const rel={symbol:'BTCUSDT',side:'long' as const,kind:'normal',playbook:'normal',tactic:'trailing' as const,rangeType:'atr' as const};
 assert.equal(liveShouldExecute(e,rel),false);
 e.strategyToggles={...e.strategyToggles,normal:true,ranges:{atr:{trailing:false},linear:{normal:false}}};
 assert.equal(strategyProcessingFor(e,rel).trailing,false);
 assert.equal(strategyProcessingFor(e,{rangeType:'linear'}).normal,false);
 assert.equal(strategyProcessingFor(e,{rangeType:'geometric'}).normal,true);
});
