import assert from "node:assert/strict";
import { test } from "node:test";
import { liveLastNEvals, overlayLiveTracks, stageLaneSummary, stageMarkers } from "./validate.ts";
import { DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { completeConfigSampleKey, simulateHours, TICKS_PER_HOUR } from "./vst.ts";
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

test("a quick replay carries Base samples forward without carrying its open orders or positions", () => {
  const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, tpAtr: .6, slOfTp: 1, maxHoldTicks: 60 };
  const { engine, report } = simulateHours(2, cfg, "trailing", {
    symbolCount: 12, prehours: 2, complete: false, comboOnly: true, orderType: "market",
  });
  const boundary = 2 * TICKS_PER_HOUR;
  assert.ok(engine.frozenBaseSamples?.length, "Base evidence must remain available");
  const later = engine.closed.filter((row) => row.tick > boundary);
  assert.equal(later.some((row) => row.tick - (row.holdTicks ?? 0) <= boundary), false);
  assert.equal(engine.positions.some((position) => position.openedTick <= boundary), false);
  assert.equal(report.settledSlices, later.length);
});

test("each Last-N window is judged independently on the lane's own closes", () => {
  const src: LaneEvalTrack = { ...track("alpha", "axis"), ns: [
    { n: 2, pf: 9, wr: 1, net: 9, trades: 2, ok: true }, { n: 4, pf: 9, wr: 1, net: 9, trades: 4, ok: true } ] };
  const own = [close("a", 1, .02, { strategyId: "alpha" }), close("b", 1, .02, { strategyId: "alpha" })];
  const [out] = overlayLiveTracks([src], own, 1);
  assert.equal(out!.evidence, "settled-identity");
  assert.equal(out!.ns[0]!.ok, true, "N2 is full and positive");
  assert.equal(out!.ns[1]!.ok, false, "N4 cannot be filled by two closes and never inherits the source model");
  assert.equal(out!.effective, false);
});

test("a stage lane evaluation uses only closes settled by that stage's end", () => {
  const src = [track("alpha", "axis")];
  src[0]!.ns = [{ n: 2, pf: 9, wr: 1, net: 9, trades: 2, ok: true }];
  const early = [close("e1", 1, .02, { strategyId: "alpha", tick: 100 }), close("e2", 1, .02, { strategyId: "alpha", tick: 90 })];
  const late = [close("l1", -1, -.05, { strategyId: "alpha", tick: 500 }), close("l2", -1, -.05, { strategyId: "alpha", tick: 450 })];
  const settled = [...late, ...early];
  const pre = stageLaneSummary(src, settled, 2, [2], 1);
  const end = stageLaneSummary(src, settled, 10, [2], 1);
  assert.equal(pre.effective, 1);
  assert.ok(pre.pf > 1);
  assert.equal(end.effective, 0, "later losses belong to the later stage only");
  assert.equal(stageLaneSummary(src, settled, 1, [2], 1).valid, 0, "no closes by hour 1");
});
