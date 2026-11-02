import assert from "node:assert/strict";
import { test } from "node:test";
import { coordinateLastN, DEFAULT_LAST_N_PROGRESS } from "./last-n-progress.ts";
import { buildLanes, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, getBacktest } from "./engine.ts";
import { initVstEngine, LIVE_RUN_CFG, laneClosed, laneLastNDecision, lanePassExec, refreshLiveDisable, refreshProgressEvals } from "./vst.ts";
import type { ClosedTrade } from "./types.ts";

test("each TP/SL lane coordinates its own active windows and same-tick settings changes invalidate its cache", () => {
  const e = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 4, arm: false });
  e.lastNProgress = { ...DEFAULT_LAST_N_PROGRESS, evalNs: [15, 20], validNs: [8, 12, 16], disableNs: [6, 14], mode: "independent" };
  e.minPf = 1.1; e.basePf = 1.1;
  const common = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const,
    tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short", kind: "normal" as const, tpAtr: .5 };
  const a = { ...common, slOfTp: 1 }, b = { ...common, slOfTp: 2 };
  const row = (id: string, pnl: number, slOfTp: number, tick: number): ClosedTrade => ({
    id, connId: e.activeConnId, ...common, slOfTp, pnl, ratio: pnl, qty: 1,
    entry: 100, exit: 100 + pnl, reason: pnl > 0 ? "tp" : "sl", tick, r: pnl,
  });
  const rows: ClosedTrade[] = [];
  for (let i = 0; i < 16; i++) {
    rows.push(row(`a${i}`, i < 8 ? 2 : -1.5, 1, 100-i));
    rows.push(row(`b${i}`, i < 8 ? -1 : 3, 2, 100-i));
  }
  e.closed = rows; e.tick = 200;
  refreshProgressEvals(e);
  assert.ok(e.lastNCoord);
  const aRows = laneClosed(e, a, 80), bRows = laneClosed(e, b, 80);
  assert.equal(aRows.length, 16); assert.equal(bRows.length, 16);
  assert.deepEqual(aRows.slice(0, 8).map(x => x.pnl), Array(8).fill(2));
  assert.deepEqual(bRows.slice(0, 8).map(x => x.pnl), Array(8).fill(-1));
  const aa = laneLastNDecision(e, a), bb = laneLastNDecision(e, b);
  assert.ok(aa.validHits.some(h => h.n === 8));
  assert.ok(bb.validHits.some(h => h.n === 16));
  assert.ok(!bb.validHits.some(h => h.n === 8));
  assert.notDeepEqual(aa.validHits.map(h => h.n), bb.validHits.map(h => h.n));
  assert.ok(aa.disableHits.every(h => [6, 14].includes(h.n)));
  e.lastNProgress = { ...e.lastNProgress, validNs: [12] };
  assert.deepEqual(laneLastNDecision(e, a).validHits.map(h => h.n), [12]);
  assert.equal(laneClosed(e, { ...a, slOfTp: NaN }, 80).length, 0);
});

test("all losing or unknown active windows stay disabled rather than promoting a forced best lane", () => {
  for (const value of [-.1, NaN]) {
    const e = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.lastNProgress = { ...DEFAULT_LAST_N_PROGRESS, evalNs: [15], validNs: [8, 12], disableNs: [6, 14], mode: "independent" };
    e.preEvalDone = true; e.shortRange = false; e.tick = 100;
    e.closed = Array.from({ length: 16 }, (_,i) => ({ id:`bad${i}`, connId:e.activeConnId,
      symbol:"BTCUSDT", side:"long" as const, pnl:value, ratio:value, qty:1, entry:100, exit:99,
      reason:"sl" as const, tick:100-i, r:value, indication:"trend" as const, tactic:"trailing" as const,
      kind:"normal" as const, playbook:"normal", rangeType:"atr" as const, validExec:true }));
    refreshProgressEvals(e);
    const health = refreshLiveDisable(e);
    assert.ok(health.disabled.includes("sym:BTCUSDT"));
    assert.ok(health.disabled.includes("ind:trend"));
    assert.equal(health.kept.includes("sym:BTCUSDT"), false);
  }
});

test("lane catalog uses its active source windows instead of the ordinary Last-N value", () => {
  const progress = { ...DEFAULT_LAST_N_PROGRESS, evalNs: [15, 20], validNs: [8, 12, 16], disableNs: [6, 14], mode: "independent" as const };
  const rows = [...getBacktest("confluence", "BTCUSDT").trades].reverse();
  assert.ok(rows.length >= 20);
  const own = coordinateLastN(rows, progress, DEFAULT_THRESHOLDS.minPf, DEFAULT_THRESHOLDS.minPf);
  const first = buildLanes(3, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, "BTCUSDT", ["hybrid"], progress)
    .filter(x => x.strategyId === "confluence");
  const second = buildLanes(50, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, "BTCUSDT", ["hybrid"], progress)
    .filter(x => x.strategyId === "confluence");
  assert.ok(first.length > 0); assert.equal(first.length, second.length);
  assert.ok(first.every(x => x.activeLastN === own.bestValid));
  assert.deepEqual(first.map(x => [x.activeLastN, x.lastNPf, x.status]), second.map(x => [x.activeLastN, x.lastNPf, x.status]));
  const allowed = new Set([...own.evalNs, ...own.validNs, ...own.disableNs]);
  assert.ok(first.every(x => x.evals?.every(h => allowed.has(h.n))));
});

test("a profitable sibling cannot qualify a losing or unobserved exact symbol, side or TP/SL set", () => {
  const e = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 4, arm: false });
  e.lastNProgress = { ...DEFAULT_LAST_N_PROGRESS, evalNs: [15], validNs: [8, 12], disableNs: [6, 14], mode: "independent" };
  e.minPf = 1.1; e.basePf = 1.1; e.completeSim = true; e.preEvalDone = true; e.openCompleteTape = false; e.liveTape = false;
  const good = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const,
    tactic: "trailing" as const, rangeType: "atr" as const, playbook: "normal", kind: "normal", tpAtr: .5, slOfTp: 1 };
  const loss = { ...good, slOfTp: 2 };
  const row = (id: string, pnl: number, slOfTp: number, tick: number): ClosedTrade => ({
    id, connId: e.activeConnId, ...good, kind: "normal", slOfTp, pnl, ratio: pnl, qty: 1,
    entry: 100, exit: 100 + pnl, reason: pnl > 0 ? "tp" : "sl", tick, r: pnl,
  });
  e.closed = Array.from({ length: 16 }, (_,i) => [row(`w${i}`, 2, 1, 100-i), row(`l${i}`, -1, 2, 100-i)]).flat();
  e.tick = 200; refreshProgressEvals(e);
  assert.equal(lanePassExec(e, good), true);
  assert.equal(lanePassExec(e, loss), false);
  assert.equal(lanePassExec(e, { ...good, symbol: "ETHUSDT" }), false);
  assert.equal(lanePassExec(e, { ...good, side: "short" }), false);
});
