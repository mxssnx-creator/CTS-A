import {it} from "node:test";
import assert from "node:assert/strict";
import {sanitizeStrategyRangeSwitches,strategyTogglesForRange,STRATEGY_PROCESSING_RANGES} from "./strategy-processing.ts";
import {DEFAULT_STRATEGY_TOGGLES,sanitizeStrategyToggles,liveTacticsOf,DEFAULT_TACTIC_CONFIG} from "./engine.ts";
import {initVstEngine,liveShouldExecute,strategyProcessingFor} from "./vst.ts";
it("overall masters and every range remain independent while additional strategies retain their switches",()=>{
 for(const range of STRATEGY_PROCESSING_RANGES)for(const normal of [false,true])for(const trailing of [false,true]){
  const t={...DEFAULT_STRATEGY_TOGGLES,normal,trailing,axis:true,block:true,dca:true,ranges:{[range]:{normal:false,trailing:false}}};
  const own=strategyTogglesForRange(t,['normal','minimal','short'].includes(range)?range as 'normal': 'normal', ['normal','minimal','short'].includes(range)?undefined:range as 'atr');
  assert.equal(own.normal,false);assert.equal(own.trailing,false);
  assert.deepEqual([own.axis,own.block,own.dca],[true,true,true]);
  assert.deepEqual(sanitizeStrategyToggles(JSON.parse(JSON.stringify(t))),t);
 }
 assert.deepEqual(sanitizeStrategyRangeSwitches({atr:{normal:'false',trailing:false},bad:{normal:false}}),{atr:{trailing:false}});
 assert.deepEqual(liveTacticsOf({normal:false,trailing:false,axis:false,block:false,dca:false}),[]);
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
