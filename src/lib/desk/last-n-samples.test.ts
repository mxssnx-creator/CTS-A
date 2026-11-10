import assert from "node:assert/strict";
import { test } from "node:test";
import { extendOwnSampleHistory, sampleRows } from "./last-n-samples.ts";
import { sanitizeLastNProgress } from "./last-n-progress.ts";

test("full losing, short, empty and corrupt samples have separate outcomes",()=>{
  const cfg=sanitizeLastNProgress({evalNs:[3],validNs:[1],disableNs:[5],negativeFilter:{windows:[2],mode:"any",maxPf:1}});
  const rows=sampleRows([[{pnl:-1},{pnl:-1},{pnl:-1}],[{pnl:1}],[],[{pnl:1},{pnl:1},{ratio:NaN}]],cfg);
  assert.deepEqual(rows[0],{policy:"default",window:"base",n:3,contexts:4,full:2,usable:1,insufficient:2,unknown:1,unavailable:0,pct:25});
  assert.equal(rows.find(r=>r.window==="validation")!.usable,3);
  assert.equal(rows.find(r=>r.window==="negative")!.usable,0);
  assert.equal(rows.find(r=>r.window==="recentLoss")!.usable,2);
});
test("each independent policy retains its own counts and no contexts means unavailable",()=>{
  const cfg=sanitizeLastNProgress({evalNs:[5],validNs:[5],disableNs:[5],negativeFilter:{windows:[2],mode:"any",maxPf:1},policies:[{id:"minor",role:"minor",evalNs:[1],validNs:[2],disableNs:[3],mode:"independent",parallelStack:false,parallelVolRatio:1}]});
  const rows=sampleRows([[{pnl:-1}],[]],cfg);
  assert.equal(rows.find(r=>r.policy==="minor"&&r.window==="base")!.pct,50);
  assert.ok(rows.every(r=>r.policy==="minor"), "only active policies are measured");
  assert.equal(rows.find(r=>r.window==="recentLoss")!.n,2,"global negative filter is inherited");
  assert.ok(sampleRows([],cfg).every(r=>r.pct===null));
});

test("missing configuration provenance is unavailable, not an empty observed tape",()=>{
  const cfg=sanitizeLastNProgress({evalNs:[1],validNs:[1],disableNs:[1]});
  const row=sampleRows([null,[],[{pnl:-1}]],cfg)[0];
  assert.deepEqual([row.contexts,row.usable,row.insufficient,row.unknown,row.unavailable,row.pct],[3,1,1,0,1,null]);
});


test("a truncated current book extends its own ordered ring without replacing newer losses",()=>{
  const retained=Array.from({length:200},(_,i)=>({id:`close-${i}`,tick:200-i,pnl:i<80?1:-2}));
  assert.equal(extendOwnSampleHistory(retained.slice(0,1),retained).length,200);
  assert.equal(extendOwnSampleHistory([{id:"new-loss",tick:201,pnl:-5}],retained).length,1);
  assert.equal(extendOwnSampleHistory<{id?:string;tick?:number;pnl:number}>([{pnl:1}],retained).length,1,"missing identity cannot prove overlap");
  const cfg=sanitizeLastNProgress({evalNs:[200]});
  assert.equal(sampleRows([extendOwnSampleHistory(retained.slice(0,1),retained)],cfg)[0].usable,1);
});
