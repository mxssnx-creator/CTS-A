import assert from "node:assert/strict";
import { test } from "node:test";
import { placeSwapOrder } from "./feed.server.ts";

async function fixture(work:(posts:URLSearchParams[])=>Promise<void>,reply:(n:number)=>{code:number;msg?:string;data?:unknown}){
  const previous=globalThis.fetch,posts:URLSearchParams[]=[];
  globalThis.fetch=async input=>{
    const u=new URL(String(input));assert.equal(u.hostname,"open-api-vst.bingx.com");
    let body:unknown={code:0,data:{}};
    if(u.pathname.endsWith("/quote/contracts"))body={code:0,data:[{symbol:"NMR-USDT",quantityPrecision:3,pricePrecision:4,tradeMinQuantity:.001,tradeMinUSDT:2}]};
    if(u.pathname.endsWith("/trade/order")){posts.push(u.searchParams);body=reply(posts.length)}
    return new Response(JSON.stringify(body));
  };
  try{await work(posts)}finally{globalThis.fetch=previous}
}
const request={network:"testnet" as const,connId:"bingx-vst-02",apiKey:"fixture-key",secret:"fixture-secret",symbol:"NMRUSDT",
  side:"BUY" as const,positionSide:"LONG" as const,type:"LIMIT" as const,price:100,quantity:.02,notional:2,
  confirmLive:true,attachProtect:true,slPrice:99.9,tpPrice:100.3,exactQty:true};

test("a refused entry bracket never retries the order without its requested protection",async()=>{
  await fixture(async posts=>{
    const result=await placeSwapOrder(request);assert.equal(result.ok,false);assert.equal(posts.length,1);
    assert.equal(JSON.parse(posts[0].get("stopLoss")!).stopPrice,99.9);
    assert.equal(JSON.parse(posts[0].get("takeProfit")!).stopPrice,100.3);
  },()=>({code:109400,msg:"SL Price must be lower than Last Price"}));
});
test("a captured stop on the wrong entry side is rejected before an order dispatch",async()=>{
  await fixture(async posts=>{const result=await placeSwapOrder({...request,slPrice:100.1});assert.equal(result.ok,false);assert.equal(posts.length,0)},()=>({code:0,data:{orderId:"41"}}));
});
test("a trailing-only entry has a native stop and no invented take-profit",async()=>{
  await fixture(async posts=>{
    const result=await placeSwapOrder({...request,tpPrice:undefined});assert.equal(result.ok,true);assert.equal(posts.length,1);
    assert.ok(posts[0].has("stopLoss"));assert.equal(posts[0].has("takeProfit"),false);
  },()=>({code:0,data:{orderId:"42"}}));
});
test("a definite minimum-size retry retains both native brackets",async()=>{
  await fixture(async posts=>{
    const result=await placeSwapOrder({...request,exactQty:false,equity:1000});assert.equal(result.ok,true);assert.equal(posts.length,2);
    assert.ok(Number(posts[1].get("quantity"))>Number(posts[0].get("quantity")));
    for(const p of posts){assert.ok(p.has("stopLoss"));assert.ok(p.has("takeProfit"))}
  },n=>n===1?{code:109400,msg:"notional too small"}:{code:0,data:{orderId:"43"}});
});
