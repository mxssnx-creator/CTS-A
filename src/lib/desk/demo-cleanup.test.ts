import assert from "node:assert/strict";
import { test } from "node:test";
import { runDemoCleanup } from "./demo-cleanup.ts";

type Position={id:string;own:boolean};
type Order={id:string;own:boolean;entry:boolean};
const ownPosition=(p:Position)=>p.own,ownOrder=(o:Order)=>o.own,entryOrder=(o:Order)=>o.entry;

test("a cancellation-time fill is closed before controls retire, and the final book is read again",async()=>{
  let positions:Position[]=[{id:"foreign",own:false}],orders:Order[]=[{id:"entry",own:true,entry:true},{id:"stop",own:true,entry:false},{id:"foreign",own:false,entry:true}];
  const events:string[]=[];
  const result=await runDemoCleanup({ownPosition,ownOrder,entryOrder,pendingCloses:()=>0,
    read:async()=>{events.push("read");return{ok:true,positions:[...positions],orders:[...orders]}},
    cancel:async selected=>{for(const o of selected){assert.equal(o.own,true);events.push("cancel:"+o.id);if(o.id==="entry")positions.push({id:"filled",own:true});orders=orders.filter(x=>x.id!==o.id)}},
    close:async p=>{assert.equal(p.id,"filled");assert.ok(orders.some(o=>o.id==="stop"));events.push("close");positions=positions.filter(x=>x.id!==p.id)},
  });
  assert.equal(result.complete,true);assert.equal(result.remainingOwnedOrders,0);assert.equal(result.remainingOwnedPositions,0);
  assert.deepEqual(events,["read","cancel:entry","read","close","read","cancel:stop","read"]);
  assert.deepEqual(orders.map(o=>o.id),["foreign"]);assert.deepEqual(positions.map(p=>p.id),["foreign"]);
});

test("an acknowledged cancellation with a still-visible own order is incomplete",async()=>{
  const result=await runDemoCleanup({ownPosition,ownOrder,entryOrder,pendingCloses:()=>0,attempts:1,
    read:async()=>({ok:true,positions:[],orders:[{id:"late",own:true,entry:true}]}),cancel:async()=>{},close:async()=>{throw Error("no position")}});
  assert.equal(result.complete,false);assert.equal(result.remainingOwnedOrders,1);
});

test("an unknown pending close cannot be declared complete from an empty account snapshot",async()=>{
  for(const pending of [1,NaN,-1]){
    const result=await runDemoCleanup<Position,Order>({ownPosition,ownOrder,entryOrder,pendingCloses:()=>pending,attempts:1,
      read:async()=>({ok:true,positions:[],orders:[]}),cancel:async()=>{},close:async()=>{throw Error("no position")}});
    assert.equal(result.complete,false);
  }
});

test("unknown or incomplete book data never establishes empty owned inventory",async()=>{
  for(const book of [{ok:false,positions:[],orders:[]},{ok:true,positions:[]},{ok:true,error:"unavailable",positions:[],orders:[]}]){
    await assert.rejects(runDemoCleanup<Position,Order>({ownPosition,ownOrder,entryOrder,pendingCloses:()=>0,
      read:async()=>book,cancel:async()=>{throw Error("must not mutate")},close:async()=>{throw Error("must not mutate")}}),/cannot verify/);
  }
});
