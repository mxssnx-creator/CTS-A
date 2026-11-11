import test from "node:test";
import assert from "node:assert/strict";
import {decideLastN,lastNMaxOf,sanitizeLastNProgress,DEFAULT_LAST_N_PROGRESS} from "./last-n-progress.ts";
const blocks={long:20,short:10,minimal:3,shortPolarity:"negative" as const,minimalPolarity:"negative" as const};
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
