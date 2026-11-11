import {test} from 'node:test';import assert from 'node:assert/strict';
import {improvesTrailingStop,confirmedUnfilledCancellation,selectTrailingControls} from './trailing-control-policy.mjs';
test('long and short stops tighten only, including rounded and invalid prices',()=>{
 assert.ok(improvesTrailingStop('long',95,96,.1));assert.ok(improvesTrailingStop('short',105,104,.1));
 for(const [side,old,next] of [['long',95,94],['short',105,106],['long',95,95],['long',95,NaN]])assert.equal(improvesTrailingStop(side,old,next,.1),false);
});
test('only an exact terminal zero-fill receipt permits replacement',()=>{
 const r={ok:true,order:{orderID:'9007199254740993123',status:'CANCELED',executedQty:'0'}};
 assert.ok(confirmedUnfilledCancellation(r,r.order.orderID));
 for(const patch of [{status:'FILLED'},{executedQty:'0.1'},{executedQty:undefined},{executedQty:null},{orderID:'foreign'},{status:'NEW'}])assert.equal(confirmedUnfilledCancellation({...r,order:{...r.order,...patch}},r.order.orderID),false);
 assert.equal(confirmedUnfilledCancellation({ok:false},r.order.orderID),false);
});
test('trailing requests rotate across lanes and keep a bounded recent-attempt map',()=>{
 const attempts=new Map([['gone',1]]),rows=[{key:'a'},{key:'b'}];
 assert.deepEqual(selectTrailingControls(rows,attempts,1000),[{key:'a'}]);assert.equal(attempts.has('gone'),false);
 attempts.set('a',1000);assert.deepEqual(selectTrailingControls(rows,attempts,1100),[{key:'b'}]);
 attempts.set('b',1100);assert.deepEqual(selectTrailingControls(rows,attempts,1200),[]);
 assert.deepEqual(selectTrailingControls(rows,attempts,2000),[{key:'a'}]);
});
