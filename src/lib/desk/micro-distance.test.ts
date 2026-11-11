import assert from "node:assert/strict";
import {test} from "node:test";
import {microControlPrices,minimalControlPrices,trailStopFromPeak} from "./engine.ts";

test("Micro own absolute SL and trailing gap are independent of global costs and direction",()=>{
 for(const side of ["long","short"] as const){
  const sign=side==="long"?1:-1;
  const a=microControlPrices(side,100,.2,.5,.0011,.9,.07);
  assert.ok(Math.abs(a.slDist-.1)<1e-12);assert.ok(Math.abs(a.tpDist-.2)<1e-12);
  const b=microControlPrices(side,100,.2,.5,.002,.9,.18);
  assert.ok(Math.abs(b.slDist-.18)<1e-12);assert.equal(a.tpDist,b.tpDist);
  assert.ok(minimalControlPrices(side,100,1,.25,.0011,.9).slDist>.9);
  const stop=trailStopFromPeak({side,entry:100,peak:100+sign*.3,tp:a.tp,sl:a.sl,trailPct:1.5,minimalRange:true,microMinTrailDistancePct:.09});
  assert.ok(sign*(100+sign*.3-stop)>=.09-1e-12);
  assert.ok(sign*(stop-a.sl)>=0,"floor cannot loosen the captured stop");
 }
 for(const n of [-1,NaN,Infinity,11])assert.throws(()=>microControlPrices("long",100,.2,.5,.0011,.1,n));
});
