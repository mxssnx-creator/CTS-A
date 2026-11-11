import type {PortedBar} from "../../../shared/cts-indications/index.ts";

/** BingX v3 arrays and objects, retaining real times and volume. No synthetic gap filling. */
export function parseClosedIndicationBars(raw:unknown,now:number):PortedBar[]{
 if(!Array.isArray(raw))throw new Error("Expected OHLCV rows");
 const unique=new Map<number,PortedBar>();
 for(const item of raw){
  const r=item as Record<string,unknown>;
  const values=Array.isArray(item)?item:[r?.time??r?.openTime??r?.timestamp,r?.open,r?.high,r?.low,r?.close,r?.volume];
  let [timestamp,open,high,low,close,volume]=values.map(Number);
  if(timestamp<1e12)timestamp*=1000;
  if(![timestamp,open,high,low,close,volume].every(Number.isFinite)||timestamp<=0||timestamp%60000!==0||low<=0||high<Math.max(open,close)||low>Math.min(open,close)||volume<0)throw new Error("Invalid exchange OHLCV row");
  if(timestamp+60000>now)continue;
  const bar={timestamp,open,high,low,close,volume},prior=unique.get(timestamp);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(bar))throw new Error("Conflicting exchange candles");
  unique.set(timestamp,bar);
 }
 return [...unique.values()].sort((a,b)=>a.timestamp-b.timestamp);
}
type FetchJson=(url:string)=>Promise<{json:unknown;status:number}>;
const cache=new Map<string,{at:number;bars:PortedBar[]}>();
const pending=new Map<string,Promise<PortedBar[]>>();
export async function fetchClosedIndicationBars(network:string,symbol:string,hosts:readonly string[],fetchJson:FetchJson,now=Date.now()):Promise<PortedBar[]>{
 if(!['testnet','mainnet'].includes(network)||!/^([A-Z0-9]{1,30})(-?USDT)?$/.test(symbol))throw new Error("Invalid market context");
 const venue=symbol.includes('-')?symbol:symbol.replace(/USDT$/,'')+'-USDT',key=network+':'+venue;
 const old=cache.get(key);
 if(old&&Math.floor(old.at/60000)===Math.floor(now/60000))return old.bars;
 if(pending.has(key))return pending.get(key)!;
 const job=(async()=>{
  let merged=[...(old?.bars??[])],end=now,start=old?.bars.at(-1)?.timestamp??now-72*3600000;
  for(let page=0;page<5;page++){
   let got:PortedBar[]|undefined;
   for(const host of hosts){
    try{
     const result=await fetchJson(host+'/openApi/swap/v3/quote/klines?'+new URLSearchParams({symbol:venue,interval:'1m',limit:'1000',startTime:String(start),endTime:String(end)}));
     const body=result.json as {code?:number;data?:unknown};
     if(result.status!==200||Number(body?.code)!==0)throw new Error('Candle request failed');
     got=parseClosedIndicationBars(body.data,now);break;
    }catch{ /* Try the other host of this network, never another account/network. */ }
   }
   if(!got)throw new Error('Closed OHLCV data unavailable');
   const byTime=new Map(merged.map(b=>[b.timestamp,b]));for(const b of got)byTime.set(b.timestamp,b);
   merged=[...byTime.values()].sort((a,b)=>a.timestamp-b.timestamp).filter(b=>b.timestamp>=now-72*3600000).slice(-4320);
   if(got.length<1000||got[0].timestamp<=start)break;
   const next=got[0].timestamp-1;if(next>=end)throw new Error('Non advancing candle page');end=next;
  }
  if(cache.size>=200&&!cache.has(key))cache.delete(cache.keys().next().value!);
  cache.set(key,{at:now,bars:merged});return merged;
 })();pending.set(key,job);
 try{return await job;}finally{pending.delete(key);}
}
