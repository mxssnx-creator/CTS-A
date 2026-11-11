import {test} from 'node:test';import assert from 'node:assert/strict';import {parseClosedIndicationBars,fetchClosedIndicationBars} from './closed-indication-feed.ts';import {indicationSourceIds,refreshPortedIndications} from './ported-indications.ts';import {initVstEngine} from './vst.ts';import {DEFAULT_TACTIC_CONFIG} from './engine.ts';import {stable02EntrySide,stable02ProcessSide} from './stable02.ts';
const start=1700000040000;
test('live candle parser preserves real timestamps and volume, rejects corrupt data and never fills gaps or admits an unfinished candle',()=>{
 const rows=[{time:start,open:'100',high:'101',low:'99',close:'100.5',volume:'8'},[start+120000,100.5,102,100,101,12],[start+180000,101,103,100,102,7]];
 const b=parseClosedIndicationBars(rows,start+180000);assert.deepEqual(b.map(b=>b.timestamp),[start,start+120000]);assert.deepEqual(b.map(b=>b.volume),[8,12]);assert.throws(()=>parseClosedIndicationBars([[start,100,99,101,100,5]],start+60000));
});
test('public candle caches stay on their requested network and use no trading endpoint',async()=>{
 const now=start+60000,calls:string[]=[];const fetch=async(url:string)=>{calls.push(url);return {status:200,json:{code:0,data:[{time:start,open:100,high:101,low:99,close:100,volume:5}]}}};
 const a=await fetchClosedIndicationBars('testnet','TESTVOL',['https://test.invalid'],fetch,now);await fetchClosedIndicationBars('testnet','TESTVOL',['https://test.invalid'],fetch,now);await fetchClosedIndicationBars('mainnet','TESTVOL',['https://main.invalid'],fetch,now);assert.equal(calls.length,2);assert.equal(a.length,1);assert.ok(calls.every(c=>c.includes('/quote/klines?')));assert.ok(calls[0].startsWith('https://test.invalid'));assert.ok(calls[1].startsWith('https://main.invalid'));
});
test('Inverse uses its original opposite pre-entry direction for every additional tactic, and missing/stale bars cannot fall back to a generic direction',()=>{
 const e=initVstEngine(DEFAULT_TACTIC_CONFIG,{arm:false,warmup:0,symbolCount:1}),q=Object.values(e.quotes)[0],id='inverse-known-ema-9-21';q.closedBars=Array.from({length:81},(_,i)=>({timestamp:start+i*60000,open:100+i,high:100.5+i,low:99.5+i,close:100+i,volume:10}));const now=start+81*60000;
 refreshPortedIndications(e,[id],now);assert.equal(stable02EntrySide(q,id),'short');for(const tactic of ['trailing','axis','dca','hybrid']as const)assert.equal(stable02ProcessSide(q,id,tactic),'short');
 refreshPortedIndications(e,[id],now+180000);assert.equal(stable02EntrySide(q,id),null);q.closedBars=[];refreshPortedIndications(e,[id],now);assert.equal(stable02ProcessSide(q,id,'dca'),null);assert.throws(()=>indicationSourceIds(['invented']));
});
