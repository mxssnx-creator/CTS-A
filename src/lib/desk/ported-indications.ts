import { REVERSAL_BY_ID, REVERSAL_SOURCES, trendReversalAt } from "../../../shared/cts-reversal/reversal.ts";
import {portedStates,entryOnsets} from "../../../shared/cts-indications/index.ts";
import {PORTED_CATALOG} from "../../../shared/cts-indications/catalog.ts";
import { LOW_RANGE_IDS } from "../../../shared/cts-indications/low-range-catalog.ts";
import type {IndicationId,VstEngine,VstQuote} from "./types.ts";

const known=new Set<string>([...PORTED_CATALOG.map(s=>s.id), ...LOW_RANGE_IDS, ...REVERSAL_SOURCES.flatMap(({id}) => [id, `sig-${id}`])]);
export function isPortedIndication(id: string): boolean {
 return known.has(id);
}
export function indicationSourceIds(raw:unknown):IndicationId[]{
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>128||raw.some(id=>typeof id!=="string"||!known.has(id)))throw new Error("Choose at most 128 known imported indication sources");
 return [...new Set(raw)] as IndicationId[];
}
const memo=new WeakMap<VstQuote,{key:string;directions:Record<string,number>}>();
export function refreshPortedIndications(e:VstEngine,ids:readonly string[],now=Date.now()):void{
 const quotes = Object.values(e.quotes);
 const classic: string[] = [];
 const reversals = new Map<string, typeof REVERSAL_SOURCES[number]>();
 let tailSize = 0;
 for (const id of ids) {
  const reversal = REVERSAL_BY_ID.get(id.startsWith("sig-") ? id.slice(4) : id);
  if (!reversal) {
   classic.push(id);
   continue;
  }
  reversals.set(id, reversal);
  const related = reversal.tactic === "pullback" || reversal.tactic === "confluence";
  tailSize = Math.max(tailSize, reversal.period * (related ? 2 : 1) + 3);
 }
 const needsPeers = classic.some(id => /pair-|market-/.test(id));
 const peerStamp = needsPeers ? quotes.map(p => [p.id, p.closedBars?.at(-1)?.timestamp, p.closedBars?.length]) : [];
 for(const q of quotes){
  const rows = q.closedBars;
  if (!rows?.length || !ids.length) {q.portedDirections={};continue;}
  // The normalized feed is chronological. Exclude any unfinished tail before reading it.
  let end = rows.length;
  while (end > 0 && rows[end - 1].timestamp + 60_000 > now) end--;
  if (!end || now - rows[end - 1].timestamp > 180_000) {q.portedDirections={};continue;}
  const key=JSON.stringify([rows[0].timestamp,rows[end-1].timestamp,end,ids,peerStamp]);
  let cached=memo.get(q);
  if(cached?.key!==key){
   const directions: Record<string, number> = {};
   if (classic.length) {
    const peers = needsPeers ? quotes.filter(p => p !== q && p.closedBars?.length).map(p => ({
      symbol: p.id.includes("-") ? p.id : p.id.replace(/USDT$/, "") + "-USDT",
      bars: p.closedBars!.filter(b => b.timestamp + 60_000 <= now),
    })) : [];
    const symbol = q.id.includes("-") ? q.id : q.id.replace(/USDT$/, "") + "-USDT";
    const output = portedStates(symbol, 1, end < rows.length ? rows.slice(0, end) : rows, classic, peers);
    for (const id of classic) directions[id] = output.available[id] ? entryOnsets(output.states[id]).at(-1) ?? 0 : 0;
   }
   if (reversals.size) {
    const tail = rows.slice(Math.max(0, end - tailSize), end);
    const bars = {t:tail.map(b=>b.timestamp),o:tail.map(b=>b.open),h:tail.map(b=>b.high),
      l:tail.map(b=>b.low),c:tail.map(b=>b.close),v:tail.map(b=>b.volume)};
    const onsetByProfile = new Map<string, number>();
    for (const [id, profile] of reversals) {
     let onset = onsetByProfile.get(profile.id);
     if (onset === undefined) {
      const last = trendReversalAt(bars, tail.length - 1, profile.period, profile.tactic, 60_000);
      const previous = last ? trendReversalAt(bars, tail.length - 2, profile.period, profile.tactic, 60_000) : 0;
      onset = last !== previous ? last : 0;
      onsetByProfile.set(profile.id, onset);
     }
     directions[id] = onset;
    }
   }
   cached={key,directions};memo.set(q,cached);
  }
  q.portedDirections=cached.directions;
 }
}
