import test from "node:test";
import assert from "node:assert/strict";
import {decideLastN,lastNMaxOf,sanitizeLastNProgress,DEFAULT_LAST_N_PROGRESS,scoreLastNGroup,scoreLastNModeTape} from "./last-n-progress.ts";
import {DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG} from "./engine.ts";
import {initVstEngine, refreshLiveDisable, refreshPrePassKeys} from "./vst.ts";
const blocks={long:20,short:10,minimal:3,shortPolarity:"negative" as const,minimalPolarity:"negative" as const};
test("measured losing Sets cannot keep a stale prepass or be restored as the least negative relation",()=>{
 const e=initVstEngine(DEFAULT_TACTIC_CONFIG,{arm:false,warmup:0,symbolCount:4});
 e.closed=Array.from({length:12},(_,i)=>({
   id:`paper-${i}`,connId:e.activeConnId,symbol:"BTCUSDT", side:"long",
   pnl:-1,r:-1,ratio:-.01, entry:100,exit:99,qty:1,reason:"sl",tick:i,
   indication:"trend",kind:"trend",tactic:"hybrid",rangeType:"atr",playbook:"normal",
 } as never));
 e.prePassKeys={trend:2};
 refreshPrePassKeys(e);
 assert.deepEqual(e.prePassKeys,{});
 const health=refreshLiveDisable(e,{...DEFAULT_BLOCK_CONFIG,liveDisable:true,liveDisableMinSamples:4});
 assert.ok(health.disabled.includes("ind:trend"));
 assert.deepEqual(health.kept,[]);
});
test("native independent policy separates 33 positions and never borrows missing closes",()=>{
 const cfg=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,blocks});
 const rows=[...Array(13).fill({pnl:-1}),...Array(20).fill({pnl:2})];
 const v=decideLastN(rows,cfg,1.1,1.1);assert.equal(v.pass,true);assert.equal(v.stack,1);
 assert.equal(v.evalHits[0].net,40);assert.equal(v.validHits[0].net,-10);assert.equal(v.disableHits[0].net,-3);
 assert.equal(decideLastN(rows.slice(1),cfg,1.1,1.1).pass,false);
 assert.equal(decideLastN([{pnl:NaN},...rows.slice(1)],cfg,1.1,1.1).pass,false);
 assert.ok(lastNMaxOf({...cfg,blocks:{...blocks,long:70,short:20,minimal:5}})>=95);
});
test("signed policies remain independent and have neutral volume",()=>{
 const policy=(id:string,negative:boolean)=>({...DEFAULT_LAST_N_PROGRESS,id,role:"independent" as const,blocks:{...blocks,shortPolarity:negative?"negative" as const:"positive" as const}});
 const cfg=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,policies:[policy("negative",true),policy("positive",false)]});
 const v=decideLastN([...Array(13).fill({pnl:-1}),...Array(20).fill({pnl:2})],cfg,1.1,1.1);
 assert.equal(v.policyDecisions!.negative.pass,true);assert.equal(v.policyDecisions!.positive.pass,false);assert.equal(v.stack,1);
});

test("signed blocks retain their independence and report complete PF downstream",()=>{
 const cfg=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,blocks});
 const rows=[...Array(13).fill({pnl:-1}),...Array.from({length:20},(_,i)=>({pnl:i%2? -1:3}))];
 assert.equal(decideLastN(rows,cfg,1.1,1.1).pass,true);
 const group=scoreLastNGroup(rows,cfg,1.1,1.1);
 assert.equal(group.ok,true);assert.equal(group.n,33);assert.equal(group.pf,30/23);assert.equal(group.net,7);
 for(const mode of ["independent","combined","majority","parallel"] as const){
   const score=scoreLastNModeTape(rows,cfg,1.1,1.1,mode);
   assert.equal(score.pass,true,mode);assert.equal(score.n,33);assert.equal(score.pf,30/23);assert.equal(score.net,7);
 }
 const wrongShort=[...Array(3).fill({pnl:-1}),...Array(10).fill({pnl:1}),...rows.slice(13)];
 assert.equal(decideLastN(wrongShort,cfg,1.1,1.1).pass,false);
 assert.equal(scoreLastNGroup(wrongShort,cfg,1.1,1.1).ok,false,"positive short must not satisfy a negative short policy");
 for(const incomplete of [rows.slice(0,4),rows.slice(0,32),[{pnl:NaN},...rows.slice(1)]]){
   assert.equal(scoreLastNGroup(incomplete,cfg,1.1,1.1).ok,false);
   assert.equal(scoreLastNModeTape(incomplete,cfg,1.1,1.1,"independent").pass,false);
 }
});

test("downstream scoring honors the selected independent signed policy",()=>{
 const policy=(id:string,shortPolarity:"positive"|"negative")=>({...DEFAULT_LAST_N_PROGRESS,id,role:"independent" as const,blocks:{...blocks,shortPolarity}});
 const cfg=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,policies:[policy("positive", "positive"),policy("negative", "negative")]});
 const rows=[...Array(13).fill({pnl:-1}),...Array.from({length:20},(_,i)=>({pnl:i%2? -1:3}))];
 assert.equal(decideLastN(rows,cfg,1.1,1.1).selectedPolicy,"negative");
 assert.equal(scoreLastNGroup(rows,cfg,1.1,1.1).ok,true);
 assert.equal(scoreLastNModeTape(rows,cfg,1.1,1.1,"independent").pass,true);
 assert.equal(scoreLastNGroup(rows.slice(0,4),cfg,1.1,1.1).ok,false);
});

test("a profitable Long block cannot hide a losing full signed sample",()=>{
 const cfg=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,blocks});
 const rows=[...Array(13).fill({pnl:-1}),...Array.from({length:20},(_,i)=>({pnl:i%2?-1:2}))];
 const decision=decideLastN(rows,cfg,1.1,1.1);
 assert.equal(decision.evalHits[0].pf,2);
 assert.equal(decision.fullBlock?.pf,20/23);
 assert.equal(decision.pass,false);
 assert.equal(scoreLastNModeTape(rows,cfg,1.1,1.1,"independent").pass,false);
});

test("an additional recent-loss veto is enforced for each signed policy",()=>{
 const rows=[...Array(13).fill({pnl:-1}),...Array(20).fill({pnl:2})];
 const veto={windows:[1],mode:"any" as const,maxPf:1};
 const cfg=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,blocks,negativeFilter:veto});
 const rejected=decideLastN(rows,cfg,1.1,1.1);
 assert.equal(rejected.pass,false);assert.equal(rejected.negative?.state,"negative");
 assert.equal(scoreLastNGroup(rows,cfg,1.1,1.1).ok,false);
 assert.equal(scoreLastNModeTape(rows,cfg,1.1,1.1,"independent").pass,false);
 assert.equal(decideLastN(rows,{...cfg,negativeFilter:{...veto,windows:[33]}},1.1,1.1).pass,true);
 assert.equal(decideLastN(rows,{...cfg,negativeFilter:{...veto,windows:[34]}},1.1,1.1).negative?.state,"insufficient");
 const child={...DEFAULT_LAST_N_PROGRESS,id:"signed",role:"independent" as const,blocks};
 const inherited=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,negativeFilter:veto,policies:[child]});
 assert.equal(decideLastN(rows,inherited,1.1,1.1).pass,false);
});

test("a legacy sibling cannot bypass explicit policies or their inherited veto",()=>{
 const veto={windows:[1],mode:"any" as const,maxPf:1};
 const legacy={...DEFAULT_LAST_N_PROGRESS,id:"legacy",role:"independent" as const,evalNs:[5],validNs:[5],disableNs:[1]};
 const signed={...DEFAULT_LAST_N_PROGRESS,id:"signed",role:"independent" as const,blocks};
 const cfg=sanitizeLastNProgress({...DEFAULT_LAST_N_PROGRESS,negativeFilter:veto,policies:[legacy,signed]});
 const rows=[{pnl:-1},...Array(39).fill({pnl:2})];
 assert.equal(decideLastN(rows,cfg,1.1,1.1).pass,false);
 assert.equal(scoreLastNGroup(rows,cfg,1.1,1.1).ok,false);
 assert.equal(scoreLastNGroup(rows.slice(0,3),cfg,1.1,1.1).ok,false);
});
