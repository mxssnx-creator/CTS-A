import {portedStates,entryOnsets} from "../../../shared/cts-indications/index.ts";
import {PORTED_CATALOG} from "../../../shared/cts-indications/catalog.ts";
import type {IndicationId,VstEngine,VstQuote} from "./types.ts";

const known=new Set<string>(PORTED_CATALOG.map(s=>s.id));
export function indicationSourceIds(raw:unknown):IndicationId[]{
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>128||raw.some(id=>typeof id!=="string"||!known.has(id)))throw new Error("Choose at most 128 known Tactic / Inverse source configurations");
 return [...new Set(raw)] as IndicationId[];
}
const memo=new WeakMap<VstQuote,{key:string;directions:Record<string,number>}>();
export function refreshPortedIndications(e:VstEngine,ids:readonly string[],now=Date.now()):void{
 for(const q of Object.values(e.quotes)){
  const bars=q.closedBars?.filter(b=>b.timestamp+60000<=now);
  if(!bars?.length||!ids.length){q.portedDirections={};continue;}
  if(now-bars.at(-1)!.timestamp>180000){q.portedDirections={};continue;}
  const peerStamp=Object.values(e.quotes).map(p=>[p.id,p.closedBars?.at(-1)?.timestamp,p.closedBars?.length]);
  const key=JSON.stringify([bars[0].timestamp,bars.at(-1)!.timestamp,bars.length,ids,peerStamp]);
  let cached=memo.get(q);
  if(cached?.key!==key){
   const peers=Object.values(e.quotes).filter(p=>p!==q&&p.closedBars?.length).map(p=>({symbol:p.id.includes('-')?p.id:p.id.replace(/USDT$/,'')+'-USDT',bars:p.closedBars!.filter(b=>b.timestamp+60000<=now)}));
   const output=portedStates(q.id.includes('-')?q.id:q.id.replace(/USDT$/,'')+'-USDT',1,bars,ids,peers);
   const directions=Object.fromEntries(ids.map(id=>[id,output.available[id]?entryOnsets(output.states[id]).at(-1)??0:0]));
   cached={key,directions};memo.set(q,cached);
  }
  q.portedDirections=cached.directions;
 }
}
