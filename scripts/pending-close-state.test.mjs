import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PendingCloseState} from './pending-close-state.mjs';
const row={symbol:'BTCUSDT',side:'long',qty:1,clientOrderId:'CTS-demo-close'};
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'cts-pending-'));try{fn(join(dir,'state.json'));}finally{rmSync(dir,{recursive:true,force:true});}}
test('pending identity survives restart and forbids another dispatch',()=>fixture(path=>{
 const s=new PendingCloseState(path,'demo');assert.equal(s.begin(row),true);
 const restarted=new PendingCloseState(path,'demo');assert.equal(restarted.begin({...row,clientOrderId:'second'}),false);
 assert.equal(restarted.rows.size,1);
}));
test('flat without terminal own identity remains unknown',()=>fixture(path=>{
 const s=new PendingCloseState(path,'demo');s.begin(row);
 const book={ok:true,positions:[]};
 for(const response of [{ok:false},{ok:true,order:{status:'NEW',clientOrderID:row.clientOrderId}},{ok:true,order:{status:'FILLED',clientOrderID:'foreign'}}])
  assert.equal(s.resolve('BTCUSDT:long',response,book).state,'pending');
 assert.equal(s.rows.size,1);
}));
test('terminal close plus fresh flat clears persistent identity; stale exposure does not',()=>fixture(path=>{
 const s=new PendingCloseState(path,'demo');s.begin(row);s.acknowledge('BTCUSDT:long',{orderId:'8'});
 const response={ok:true,order:{status:'FILLED',clientOrderID:row.clientOrderId,orderId:'8'}};
 assert.equal(s.resolve('BTCUSDT:long',response,{ok:true,positions:[row]}).state,'pending');
 assert.equal(s.resolve('BTCUSDT:long',response,{ok:true,positions:[]}).state,'flat');
 assert.equal(new PendingCloseState(path,'demo').rows.size,1,'entry lock remains until control cleanup');
 s.complete('BTCUSDT:long');
 assert.equal(new PendingCloseState(path,'demo').rows.size,0);
}));
test('terminal cancellation allows remaining owned quantity to be reconsidered',()=>fixture(path=>{
 const s=new PendingCloseState(path,'demo');s.begin(row);
 assert.equal(s.resolve('BTCUSDT:long',{ok:true,order:{status:'CANCELED',clientOrderID:row.clientOrderId,orderId:'8'}},{ok:true,positions:[row]}).state,'remaining');
}));
test('corrupt or wrong-connection state fails closed',()=>fixture(path=>{
 writeFileSync(path,JSON.stringify({version:1,connId:'other',rows:[]}));
 assert.throws(()=>new PendingCloseState(path,'demo'));
}));
