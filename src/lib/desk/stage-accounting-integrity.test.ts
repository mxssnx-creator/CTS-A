import assert from "node:assert/strict";
import { test } from "node:test";
import { liveLastNEvals, overlayLiveTracks, stageMarkers } from "./validate.ts";
import { completeConfigSampleKey } from "./vst.ts";
import type { ClosedTrade, HorizonMark, LaneEvalTrack } from "./types.ts";

const close = (id: string, pnl: number, ratio: number | undefined, extra: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id, connId: "bingx-vst-02", symbol: "BTCUSDT", side: "long", pnl, ratio, qty: 1, entry: 100,
  indication:"ema",rangeType:"atr",playbook:"axis",calc:"base",tpAtr:.6,slOfTp:.5,trailPct:0,
  modelRtCost:.001,minSlDistancePct:.1,microRange:false,minimalRange:false,shortRange:false,
  exit: 100, reason: pnl > 0 ? "tp" : "sl", tick: 10, r: 0, tactic: "axis", kind: "normal", validExec: true, ...extra,
});

const track = (strategyId: string, tactic: "axis" | "trailing"): LaneEvalTrack => ({
  executionKey: completeConfigSampleKey(close("identity",1,.01,{tactic}))!,
  laneId: `${strategyId}:BTCUSDT:${tactic}`, strategyId, symbol: "BTCUSDT", tactic, kind: "normal",
  ns: [{ n: 2, pf: 2, wr: 1, net: 1, trades: 2, ok: true }], evidence: "source-model", effective: true, lastAt: 0,
});

test("stage PF uses return ratios, requires the complete window, and fails closed on unknown economics", () => {
  const rows = [close("a", 100, .01), close("b", -1, -.02)];
  const hit = liveLastNEvals(rows, [2], 1)[0]!;
  assert.equal(hit.pf, .5);
  assert.equal(hit.net, -.01);
  assert.equal(hit.ok, false);
  assert.equal(liveLastNEvals([rows[0]!], [2], 1)[0]!.ok, false);
  const unknown = liveLastNEvals([close("x", 1, undefined, { entry: 0, qty: 0 }), rows[0]!], [2], 1)[0]!;
  assert.equal(unknown.unknown, 1);
  assert.equal(unknown.ok, false);
  assert.ok(Number.isNaN(unknown.net));
});

test("symbol-only and sibling-strategy closes cannot overwrite another source lane", () => {
  const source = [track("alpha", "axis"), track("beta", "trailing")];
  const unproven = [close("a", 1, .01), close("b", -1, -.02)];
  assert.deepEqual(overlayLiveTracks(source, unproven, 1), source);
  const proven = [
    close("c", 1, .01, { strategyId: "alpha" }),
    close("d", -1, -.02, { strategyId: "alpha" }),
  ];
  const next = overlayLiveTracks(source, proven, 1);
  assert.equal(next[0]!.evidence, "settled-identity");
  assert.equal(next[0]!.ns[0]!.pf, .5);
  assert.equal(next[0]!.effective, false);
  assert.deepEqual(next[1], source[1]);
});

test("stage markers retain requested horizons and never substitute another period", () => {
  const mark = (hours: number): HorizonMark => ({ hours, trades: 10, pf: 1.2, wr: .6, net: 1, mdd: .01, equity: 10, slExits: 1, tpExits: 1, ok: true, score: 1 });
  const result = stageMarkers([48, 4, 16, 24], [mark(4), mark(16), mark(48)], { samples: 2, pf: 1.3, minPf: 1.1, effective: 2, valid: 3 });
  assert.deepEqual(result.map((row) => [row.id, row.hours]), [["pre", 4], ["mid", 16], ["mid", 24], ["end", 48]]);
  assert.equal(result[2]!.recorded, false);
  assert.equal(result[2]!.ok, false);
  assert.equal(result[2]!.pf, 0);
  assert.equal(result[3]!.pf, 1.3);
  assert.equal(result[3]!.ok, true);
});


test("account, side, range and economic siblings cannot supply an exact execution window",()=>{
  const source=[track("alpha","axis")];
  const own=[close("a",1,.01,{strategyId:"alpha"}),close("b",1,.01,{strategyId:"alpha"})];
  for(const patch of [{connId:"other-account"},{side:"short" as const},{rangeType:"linear" as const},{slOfTp:.75},{modelRtCost:.002},{minSlDistancePct:.3},{calc:undefined}])
    assert.deepEqual(overlayLiveTracks(source,own.map(x=>({...x,...patch})),1),source,JSON.stringify(patch));
  const unbound=[{...source[0],executionKey:undefined}];
  assert.deepEqual(overlayLiveTracks(unbound,own,1),unbound,"abstract model lanes have no settled provenance");
  assert.equal(overlayLiveTracks(source,own,1)[0].evidence,"settled-identity");
});
test("an end stage without an owned window cannot borrow its historical marker's PF",()=>{
 const mark={hours:4,trades:10,pf:4,wr:1,net:1,mdd:0,equity:10,slExits:0,tpExits:10,ok:true,score:1};
 const result=stageMarkers([4],[mark],{samples:0,pf:0,minPf:1.1,effective:0,valid:0})[0];
 assert.equal(result.recorded,false);assert.equal(result.ok,false);assert.equal(result.pf,0);
});

test("Micro execution identity requires both captured distance floors", () => {
  const row = close("micro", 1, .01, { microRange: true });
  assert.equal(completeConfigSampleKey(row), null);
  const captured = { ...row, microMinSlDistancePct: .1, microMinTrailDistancePct: .05 };
  assert.equal(typeof completeConfigSampleKey(captured), "string");
  assert.equal(completeConfigSampleKey({ ...captured, microMinTrailDistancePct: NaN }), null);
  assert.notEqual(completeConfigSampleKey(captured), completeConfigSampleKey({ ...captured, microMinTrailDistancePct: .1 }));
});
