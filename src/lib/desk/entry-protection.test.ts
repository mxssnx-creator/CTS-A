import assert from "node:assert/strict";
import { test } from "node:test";
import { capturedEntryProtection } from "./entry-protection.ts";
import type { LiveOrder } from "./types.ts";

const source={id:"own-config-entry",connId:"bingx-vst-02",symbol:"S0USDT",side:"long",price:100,slDist:.1,tpDist:.3} as LiveOrder;
const intent={orderId:source.id,connId:source.connId,symbol:source.symbol,side:source.side,entry:98};
test("a resting Micro entry retains its own percentage geometry at the submitted price",()=>{
  for(const side of ["long","short"]as const){
    const result=capturedEntryProtection({...source,side},{...intent,side})!;
    assert.ok(result);
    assert.ok(Math.abs(Math.abs(result.sl-98)/98-.001)<1e-12);
    assert.ok(Math.abs(Math.abs(result.tp!-98)/98-.003)<1e-12);
    assert.equal(side==="long",result.sl<98&&result.tp!>98);
  }
});
test("a sibling, another connection and missing captured distances cannot supply entry protection",()=>{
  for(const order of [undefined,{...source,id:"sibling"},{...source,connId:"bingx-x01"},{...source,side:"short"as const},
    {...source,symbol:"S1USDT"},{...source,slDist:0},{...source,tpDist:NaN}])
    assert.equal(capturedEntryProtection(order,intent),null);
});

test("a captured trailing-only order retains its stop without inventing a fixed target",()=>{
 const result=capturedEntryProtection({...source,tpDist:0,trailPct:.05},intent);
 assert.ok(result);assert.equal(result.tp,undefined);assert.ok(result.sl<98);
 assert.equal(capturedEntryProtection({...source,tpDist:0,trailPct:0},intent),null);
});
