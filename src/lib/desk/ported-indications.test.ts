import {test} from 'node:test';import assert from 'node:assert/strict';import {parseClosedIndicationBars,fetchClosedIndicationBars} from './closed-indication-feed.ts';import {indicationSourceIds,refreshPortedIndications} from './ported-indications.ts';import {stable02EntrySide,stable02ProcessSide} from './stable02.ts';
import {waveBars} from '../../../shared/cts-indications/fixtures.ts';
import {entryOnsets,portedStates} from '../../../shared/cts-indications/index.ts';
import { armUniverse, completeConfigSampleKey, finishBaseEval, initVstEngine, liveShouldExecute } from "./vst.ts";
import { DEFAULT_STRATEGY_TOGGLES, DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import type { TacticConfig } from "./types.ts";
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

test('Low-Range trades the original completed-candle onset and expires with the source', () => {
 const e = initVstEngine(DEFAULT_TACTIC_CONFIG, {arm:false,warmup:0,symbolCount:1});
 const q = Object.values(e.quotes)[0], id = "low-range-6-edge-turn-standalone";
 const bars = waveBars(320);
 const onsets = entryOnsets(portedStates("BTC-USDT", 1, bars, [id]).states[id]);
 const i = onsets.reduce((latest, direction, index) => direction ? index : latest, -1);
 assert.ok(i > 0);
 assert.deepEqual(indicationSourceIds([id,id]), [id]);
 q.closedBars = bars.slice(0,i+2);
 refreshPortedIndications(e, [id], bars[i].timestamp+60_000);
 assert.equal(stable02EntrySide(q,id), onsets[i] > 0 ? "long" : "short");
 refreshPortedIndications(e, [id], bars[i].timestamp+5*60_000);
 assert.equal(stable02EntrySide(q,id), null);
});

test("a Low-Range source carries its own coordination switch from discovery to qualified entries", () => {
 const id = "low-range-6-edge-turn-standalone";
 const cfg: TacticConfig = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, microRange: false, minimalRange: false,
   tpAtr: .6, slOfTp: .4, indicationSourceIds: [id] };
 const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
 e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false,
   ranges: { short: { trailing: false }, "low-range": { normal: true, trailing: true } } };
 const q = Object.values(e.quotes)[0];
 const bars = waveBars(320);
 const onsets = entryOnsets(portedStates("BTC-USDT", 1, bars, [id]).states[id]);
 const i = onsets.reduce((last, signal, index) => signal ? index : last, -1);
 assert.ok(i > 0);
 q.closedBars = bars.slice(0, i + 1);
 refreshPortedIndications(e, [id], bars[i].timestamp + 60_000);
 armUniverse(e, cfg, "trailing", "atr");
 const seed = [...e.orders, ...e.queue].find(order => order.indication === id && order.tactic === "trailing");
 assert.ok(seed, "the enabled Low-Range source gets its own trailing candidate");
 e.tick = 100;
 e.closed = Array.from({ length: 60 }, (_, j) => ({ ...seed, id: `low-range-${j}`, tick: 99 - j,
   pnl: 1, ratio: .01, r: 1, entry: seed.price, exit: seed.price * (seed.side === "long" ? 1.012 : .988),
   reason: "tp" as const, validExec: false }));
 e.queue = []; e.orders = []; e.positions = [];
 finishBaseEval(e);
 e.liveTape = true;
 assert.equal(liveShouldExecute(e, seed), true);
 assert.equal(liveShouldExecute(e, { ...seed, indication: "trend" }), false);
 e.strategyToggles.ranges!["low-range"]!.trailing = false;
 assert.equal(liveShouldExecute(e, seed), false);
});

test("Low-Range discovery creates every configured cost cell with independent fixed and dynamic evidence", () => {
 const id = "low-range-6-edge-turn-standalone";
 const cfg: TacticConfig = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, microRange: false, minimalRange: false,
   indicationSourceIds: [id], lowRange: { enabled: true, step: .002, steps: [2], slRatios: [.25, .3],
     trailRatios: [0, .5], maxHoldMin: 60 } };
 const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
 e.fees = { maker: .00088, taker: .00088, slippageFeeRatio: 0 };
 e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false };
 const q = Object.values(e.quotes)[0];
 const bars = waveBars(320);
 const onsets = entryOnsets(portedStates("BTC-USDT", 1, bars, [id]).states[id]);
 const i = onsets.reduce((last, signal, index) => signal ? index : last, -1);
 assert.ok(i > 0);
 q.closedBars = bars.slice(0, i + 1);
 refreshPortedIndications(e, [id], bars[i].timestamp + 60_000);
 armUniverse(e, cfg, "trailing", "atr");
 const rows = [...e.orders, ...e.queue].filter(order => order.indication === id && order.tactic === "trailing");
 assert.ok(rows.length > 0);
 assert.ok(rows.every(order => Math.abs(order.tpDist / order.price - .00576) < 1e-12));
 assert.ok(rows.every(order => Math.abs(order.slDist / order.price - .00276) < 1e-12));
 assert.ok(rows.every(order => order.maxHoldTicks === 12));
 const cells = new Map(rows.map(order => [JSON.stringify([
   order.tpAtr, order.slOfTp, order.trailPct, order.trailingDistance ?? "dynamic",
 ]), completeConfigSampleKey(order)]));
 assert.equal(cells.size, 3, "no-trail plus fixed and dynamic trailing are separate children");
 assert.equal(new Set(cells.values()).size, 3, "each actual child owns a complete evaluation key");
});
