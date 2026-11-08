import assert from 'node:assert/strict';
import { it } from 'node:test';
import { minimalControlPrices, closePnl, POSITION_COST_PCT, POSITION_RT_COST_PCT, DEFAULT_TACTIC_CONFIG } from './engine.ts';
import { actualPositionFeeEstimate, modeledPositionCost, initVstEngine } from './vst.ts';
it('separates sizing from dynamic target units and charges partial costs additively',()=>{
 assert.equal(POSITION_COST_PCT,.0012);
 assert.ok(Math.abs(POSITION_RT_COST_PCT-.00176)<1e-15);
 for (const cost of [.0011,.00176,.0044]) {
  assert.ok(Math.abs(minimalControlPrices('long',100,2,1.5,cost).tpDist-200*cost)<1e-12);
  assert.ok(Math.abs(closePnl(1,100,101,2,cost)-2*closePnl(1,100,101,1,cost))<1e-12);
 }
});
it('new admissions use the matching rate snapshot and stale snapshots fall back',()=>{
 const e=initVstEngine(DEFAULT_TACTIC_CONFIG,{arm:false,warmup:0,symbolCount:8});
 e.feeAsOfMs=10_000;
 e.feeSnapshots={A:{exchange:'bingx',account:e.activeConnId,symbol:'A',at:9000,maker:0,taker:.002}};
 assert.ok(Math.abs(modeledPositionCost(e,'A')-.0044)<1e-15);
 assert.ok(Math.abs(modeledPositionCost(e,'B')-.00176)<1e-15);
 assert.ok(Math.abs(actualPositionFeeEstimate(e,'B',100,102,2)-.3232)<1e-12);
 e.feeAsOfMs=8_000_000;
 assert.ok(Math.abs(modeledPositionCost(e,'A')-.00176)<1e-15);
});
