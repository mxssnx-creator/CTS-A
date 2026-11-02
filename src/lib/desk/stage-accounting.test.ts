import assert from "node:assert/strict";
import { test } from "node:test";
import { liveLastNEvals, overlayLiveTracks, stageMarkers } from "./validate.ts";
import type { ClosedTrade, HorizonMark, LaneEvalTrack } from "./types.ts";

const close = (id: string, pnl: number, ratio: number | undefined, extra: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id, connId:"bingx-vst-02", symbol:"BTCUSDT", side:"long", pnl, ratio, qty:1, entry:100,
  exit:100, reason:pnl > 0 ? "tp" : "sl", tick:10, r:0, tactic:"axis", kind:"normal", validExec:true, ...extra,
});
const track = (strategyId: string, tactic: "axis" | "trailing"): LaneEvalTrack => ({
  laneId:`${strategyId}:BTCUSDT:${tactic}`, strategyId, symbol:"BTCUSDT", tactic, kind:"normal",
  ns:[{n:2,pf:2,wr:1,net:1,trades:2,ok:true}], effective:true,lastAt:0,
});

test("stage PF uses net return, requires its full window, and retains unknown costs as unknown", () => {
  const rows = [close("a", 100, .01), close("b", -1, -.02)];
  const hit=liveLastNEvals(rows,[2],1)[0];
  assert.equal(hit.pf,.5); assert.equal(hit.net,-.01); assert.equal(hit.ok,false);
  assert.equal(liveLastNEvals([rows[0]],[2],1)[0].ok,false);
  const unknown=liveLastNEvals([close("x",1,undefined,{entry:0,qty:0}),rows[0]],[2],1)[0];
  assert.equal(unknown.unknown,1); assert.equal(unknown.ok,false); assert.ok(Number.isNaN(unknown.net));
  const recovered=liveLastNEvals([close("cash",1,undefined,{entry:100,qty:2}),rows[1]],[2],1)[0];
  assert.equal(recovered.pf,.25);
});

test("symbol-only or different-strategy closes cannot overlay another lane's source evaluation", () => {
  const source=[track("alpha","axis"),track("beta","trailing")];
  const unproven=[close("a",1,.01,{strategyId:undefined}),close("b",-1,-.02,{strategyId:undefined})];
  assert.deepEqual(overlayLiveTracks(source,unproven,1),source);
  const proven=[close("c",1,.01,{strategyId:"alpha"}),close("d",-1,-.02,{strategyId:"alpha"})];
  const next=overlayLiveTracks(source,proven,1);
  assert.equal(next[0].ns[0].pf,.5); assert.equal(next[0].effective,false);
  assert.deepEqual(next[1],source[1]);
});

test("stage markers keep requested horizons and never substitute another period for a missing mark", () => {
  const mark = (hours:number):HorizonMark => ({hours,trades:10,pf:1.2,wr:.6,net:1,mdd:.01,equity:10,slExits:1,tpExits:1,ok:true,score:1});
  const result=stageMarkers([48,4,16,24],[mark(4),mark(16),mark(48)],{samples:2,pf:1.3,minPf:1.1,effective:2,valid:3});
  assert.deepEqual(result.map(x=>[x.id,x.hours]),[["pre",4],["mid",16],["mid",24],["end",48]]);
  assert.equal(result[2].recorded,false); assert.equal(result[2].ok,false); assert.equal(result[2].pf,0);
  assert.equal(result[3].pf,1.3); assert.equal(result[3].ok,true);
});
