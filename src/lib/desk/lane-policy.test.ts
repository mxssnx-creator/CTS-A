import { it } from "node:test";
import assert from "node:assert/strict";
import { initVstEngine, laneClosed, laneLastNDecision, matchingWinningRels, configStepFloor } from "./vst.ts";
import { DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { decideLastN, DEFAULT_LAST_N_PROGRESS, scoreLastNModeTape } from "./last-n-progress.ts";
import { negativeLastN, negativeLastNDecision } from "./negative-last-n.ts";
import type { ClosedTrade } from "./types.ts";
const rel = { symbol:"A", side:"long" as const, indication:"trend" as const, tactic:"axis" as const,
 rangeType:"geometric" as const, playbook:"axis", kind:"normal" as const, tpAtr:.3, slOfTp:1 };
const engine = () => initVstEngine(DEFAULT_TACTIC_CONFIG,{arm:false,warmup:0,symbolCount:8});
it("last-N windows separate TP, SL, symbols, direction, kind and policy edits within the same tick",()=>{
 const e=engine(); e.lastNProgress={...DEFAULT_LAST_N_PROGRESS,evalNs:[15],validNs:[8],disableNs:[6],mode:"independent"};
 e.minPf=1.1; e.axisPf=1.1; e.basePf=1.1;
 const rows=(tp:number,sl:number,pnl:number)=>Array.from({length:16},(_,i)=>({
  ...rel, id:`${tp}:${sl}:${i}`,connId:e.activeConnId,pnl,ratio:pnl,tpAtr:tp,slOfTp:sl,tick:100-i,
  entry:100,exit:100*(1+pnl),qty:1,r:pnl,reason:"tp",
 } as ClosedTrade));
 e.closed=[...rows(.3,1,-1),...rows(.4,1,2),...rows(.3,2,2)];
 assert.equal(laneClosed(e,rel,80).length,16);
 assert.equal(laneLastNDecision(e,rel).pass,false);
 assert.equal(laneLastNDecision(e,{...rel,tpAtr:.4}).pass,true);
 assert.equal(laneLastNDecision(e,{...rel,symbol:"B"}).pass,false);
 assert.equal(laneLastNDecision(e,{...rel,side:"short"}).pass,false);
 assert.equal(laneLastNDecision(e,{...rel,kind:"block"}).pass,false);
 e.closed=rows(.4,1,1.2); e.closed[0].pnl=-1; e.closed[0].ratio=-1;
 const before=laneLastNDecision(e,{...rel,tpAtr:.4}); assert.equal(before.pass,true);
 e.axisPf=10;
 assert.equal(laneLastNDecision(e,{...rel,tpAtr:.4}).pass,false,"cache must include current PF settings");
});
it("empty windows never qualify or create a parallel stack",()=>{
 for (const mode of ["independent","combined","parallel","majority"] as const) {
  const d=decideLastN([],{...DEFAULT_LAST_N_PROGRESS,mode},1.1,1.1);
  assert.equal(d.pass,false); assert.equal(d.stack,1);
 }
});
it("matching relations include exact config and protection without borrowing sibling wins",()=>{
 const e=engine();e.blockRelBest={
  "cfg:own":{key:"cfg:own",n:8,pf:2,net:1,vol:.2,major:false},
  "cfg:sibling":{key:"cfg:sibling",n:8,pf:9,net:8,vol:2,major:false},
 };
 assert.deepEqual(matchingWinningRels(e,{...rel,indicationCfg:"own"}).map(x=>x.key),["cfg:own"]);
 assert.deepEqual(matchingWinningRels(e,{...rel,indicationCfg:"absent"}),[]);
 e.minimalRange=true;e.stepPf={enabled:true,ratio:1.5,max:2};
 assert.equal(configStepFloor(e,1,{...rel,tpAtr:3}),1.75);
});


it("parallel Last-N policies preserve small requested windows and cannot borrow another config",()=>{
 const e=engine();const p={...DEFAULT_LAST_N_PROGRESS,evalNs:[5],validNs:[5],disableNs:[1],mode:"independent" as const,parallelStack:false};
 e.lastNProgress={...p,policies:[{...p,id:"minor",role:"minor"},{...p,validNs:[12],id:"major",role:"major"}]};
 e.closed=Array.from({length:5},(_,i)=>({...rel,id:`own${i}`,connId:e.activeConnId,pnl:1,ratio:1,tick:10-i,qty:1,entry:100,exit:101,r:1,reason:"tp"} as ClosedTrade));
 const a=laneLastNDecision(e,rel);assert.equal(a.pass,true);assert.equal(a.policyDecisions!.minor.pass,true);
 assert.equal(a.policyDecisions!.major.pass,false);assert.equal(a.policyDecisions!.minor.validHits[0].n,5);
 assert.equal(a.stack,1);assert.equal(laneLastNDecision(e,{...rel,slOfTp:2}).pass,false);
 e.lastNProgress.policies![0].validNs=[6];assert.equal(laneLastNDecision(e,rel).pass,false);
});

it("recent-loss windows veto only new own-lane entries and retain measured positive PF",()=>{
 const cfg={...DEFAULT_LAST_N_PROGRESS,evalNs:[5],validNs:[5],disableNs:[1],mode:"independent" as const,
  negativeFilter:negativeLastN({windows:[1,3],mode:"any"})};
 const rows=[-.001,.02,.02,.02,.02].map(pnl=>({pnl}));
 const d=decideLastN(rows,cfg,1.1,1.1);
 assert.equal(d.pass,false);assert.ok(d.validHits[0].pf>1);assert.equal(d.negative?.state,"negative");
 assert.deepEqual(d.negative?.negativeNs,[1]);assert.equal(d.stack,1);
 assert.equal(decideLastN(rows,{...cfg,negativeFilter:negativeLastN({windows:[1,3],mode:"all"})},1.1,1.1).pass,true);
 assert.equal(negativeLastNDecision([1],cfg.negativeFilter).state,"insufficient");
 assert.equal(negativeLastNDecision([1,NaN,1],cfg.negativeFilter).state,"unknown");
 assert.equal(negativeLastNDecision([-1e-18],negativeLastN({windows:[1]})).state,"negative");
 for(const windows of [[0],[201],[1.5],[true],[]])assert.throws(()=>negativeLastN({windows}));
});

it("negative policy changes invalidate same-tick lane decisions",()=>{
 const e=engine();e.lastNProgress={...DEFAULT_LAST_N_PROGRESS,evalNs:[5],validNs:[5],disableNs:[1],mode:"independent"};
 e.closed=[-.001,.02,.02,.02,.02].map((pnl,i)=>({...rel,id:`negative-${i}`,connId:e.activeConnId,pnl,ratio:pnl,tick:10-i,
  qty:1,entry:100,exit:100*(1+pnl),r:pnl,reason:pnl<0?"sl":"tp"} as ClosedTrade));
 assert.equal(laneLastNDecision(e,rel).pass,true);
 e.lastNProgress.negativeFilter=negativeLastN({windows:[1]});
 assert.equal(laneLastNDecision(e,rel).pass,false);
 assert.equal(laneLastNDecision(e,{...rel,symbol:"unobserved"}).pass,false);
});

it("statistics use the configured small window instead of an unrelated hardcoded Last-8",()=>{
 const cfg={...DEFAULT_LAST_N_PROGRESS,evalNs:[3],validNs:[3],disableNs:[1],parallelStack:false};
 const score=scoreLastNModeTape([{pnl:.02},{pnl:-.01},{pnl:.02}],cfg,1.1,1.1,"independent");
 assert.equal(score.pass,true);assert.equal(score.gatedN,3);assert.equal(score.gatedPf,4);
 assert.equal(scoreLastNModeTape([{pnl:.02},{pnl:.02}],cfg,1.1,1.1,"independent").pass,false);
});
