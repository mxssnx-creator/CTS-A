import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleRows } from "./last-n-samples.ts";
import { sanitizeLastNProgress } from "./last-n-progress.ts";

test("full losing, short, empty and corrupt samples have separate outcomes",()=>{
  const cfg=sanitizeLastNProgress({evalNs:[3],validNs:[1],disableNs:[5],negativeFilter:{windows:[2],mode:"any",maxPf:1}});
  const rows=sampleRows([[{pnl:-1},{pnl:-1},{pnl:-1}],[{pnl:1}],[],[{pnl:1},{pnl:1},{ratio:NaN}]],cfg);
  assert.deepEqual(rows[0],{policy:"default",window:"base",n:3,contexts:4,full:2,usable:1,insufficient:2,unknown:1,pct:25});
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
