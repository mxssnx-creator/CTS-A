import { it } from "node:test";
import assert from "node:assert/strict";
import { initVstEngine, laneClosed, laneLastNDecision, matchingWinningRels, configStepFloor } from "./vst.ts";
import { DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { decideLastN, DEFAULT_LAST_N_PROGRESS } from "./last-n-progress.ts";
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
