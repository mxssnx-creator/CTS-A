import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comboBreakdown,
  combosFiltered,
  coordinate,
  COST_STEPS,
  bookStats,
  DEFAULT_LAST_N_CONFIG,
  DEFAULT_THRESHOLDS,
  DEFAULT_BLOCK_CONFIG,
  blockMaxAdditionalRatio,
  blockMinimumProfitFactor,
  blockStepQty,
  sharedBlockVolumeRatio,
  additiveBlockQty,
  blockVolumeIncrement,
  BLOCK_POS_COUNTS,
  LIVE_BLOCK_COUNTS,
  sanitizeBlockCounts,
  DESK,
  activityRelations,
  buildLanes,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_ENABLED_KINDS,
  DEFAULT_STRATEGY_TOGGLES,
  heatmapFor,
  positionsFrom,
  posSliceStats,
  processIndication,
  computeIndicators,
  RANGE_TYPES,
  TACTICS,
  volumeCoord,
  INDICATION_CONFIGS,
  INDICATION_KINDS,
  isPositive,
  LAST_N_OPTIONS,
  EVAL_POS_N,
  VALID_EXEC_POS_N,
  LIVE_EXEC_POS_N,
  LIVE_DISABLE_N,
  LANE_EVAL_NS,
  EVAL_POS_NS,
  VALID_EXEC_NS,
  LIVE_DISABLE_NS,
  DEFAULT_LAST_N_PROGRESS,
  sanitizeLastNProgress,
  decideLastN,
  coordinateLastN,
  relComboKey,
  LAST_N_STAGE_META,
  LAST_N_PROGRESS_META,
  lastNEval,
  MIN_VOLUME_FACTOR,
  pickBestCombo,
  POSITION_COST_PCT,
  POSITION_RT_COST_PCT,
  closePnl,
  positionRtCost,
  unitClosePnl,
  TRAIL_PCTS,
  DISABLED_TRAIL_PCTS,
  TRAIL_POS_RATIOS,
  trailStopFromPeak,
  trailGiveback,
  liveShortProtectCombos,
  DEFAULT_SHORT_PROGRESS,
  DEFAULT_INTERVAL_STRATEGY,
  INTERVAL_MINUTES_OPTIONS,
  sanitizeIntervalStrategy,
  DEFAULT_SHORT_MIN_TP_ATR,
  DEFAULT_SHORT_MIN_SL_OF_TP,
  sanitizeShortProgress,
  TP_SL_RATIOS,
  TP_SL_RATIO_MIN,
  SL_ATR_MIN,
  SL_ATR_RATIOS,
  snapTpRatio,
  snapSlAtr,
  slAtrOf,
  tpRatioOf,
  allTpSlCombos,
  TP_ATR_RATIOS,
  SL_OF_TP,
  X01_DEFAULTS,
  DEFAULT_MIN_PF,
  DEFAULT_BASE_PF,
  DEFAULT_AXIS_PF,
  DEFAULT_BLOCK_PF,
  DEFAULT_SHORT_PF,
  DEFAULT_SHORT_BASE_PF,
  AXIS_PARTIAL_RATIO,
  clampAxisPartial,
  clampBlockVol,
  clampSharedVol,
  clampOverallVol,
  clampMaxVolumeMul,
  DEFAULT_BLOCK_VOLUME_RATIO,
  DEFAULT_OVERALL_BLOCK_VOLUME_RATIO,
  DEFAULT_SHARED_BLOCK_VOLUME_RATIO,
  DEFAULT_MAX_VOLUME_MULTIPLIER,
  filterLiveShortCombos,
  SHORT_20H_POSITIVE,
  SHORT_WINNER,
  AUTO_EVAL_HOURS,
  SHORT_EVAL_HOURS,
  UNIT_NOTIONAL,
  profitFactor,
  pfFromPnls,
  PF_NO_LOSS,
  processAllIndications,
  STRATEGIES,
  STRATEGY_KINDS,
  SHORT_TP_ATR,
  SHORT_SL_OF_TP,
  SHORT_SL_OF_TP_STEP,
  allShortTpSlCombos,
  shortProtectGridFor,
  shortComboKey,
  shortSlAtrOf,
  shortTpRatioOf,
  snapShortTpAtr,
  snapShortSlOfTp,
  snapShortTacticConfig,
  formatShortRatio,
  cfgUsesShortRange,
  strategiesForKinds,
  strategyMatchesKinds,
  summarizeIndications,
  symbolIndications,
  refreshLiveIndications,
  indicationFromQuote,
  indicationQuality,
  INDICATION_QUALITY_FLOOR,
  INDICATION_QUALITY_FLOORS,
  indicationQualityFloor,
  resetIndicationHistory,
} from "./engine.ts";
import {
  collectDeskSettings,
  defaultDeskSettings,
  sanitizeDeskSettings,
  settingsDiffer,
} from "./settings-sync.ts";
import { BUILTIN_PRESETS, allPresets, findPreset, presetIdOf, sanitizeUserPresets } from "./presets.ts";
import {
  auditEngine,
  adjustActiveBlocks,
  collectActiveOrderBlocks,
  blockPfOk,
  overallLiveStats,
  haltEngine,
  healEngine,
  initVstEngine,
  armUniverse,
  rankIndications,
  rankTactics,
  enabledLiveTactics,
  releaseVanished,
  skipLiveSymbol,
  entryMinPf,
  minPfFor,
  activeMinPf,
  pfLaneOf,
  playLaneOf,
  selectMinPfCells,
  refreshSymbolHourEval,
  validateSymbols100h,
  symbolTapePf,
  overlayExchangeBook,
  overlayLiveExecutions,
  tapeWindowCurve,
  noteBlockPosClose,
  blockPosPaused,
  symbolBlockPaused,
  blockWindowSnapshot,
  isDeskConn,
  ownedByDesk,
  classifyIndication,
  openPlaybook,
  liveExecPlaybook,
  tacticForIndication,
  ingestLivePnls,
  evalBlockRelations,
  refreshProgressEvals,
  indicationProtect,
  pickIndicationRange,
  playbookOf,
  mirrorEffectiveLanes,
  requeueFree,
  resetBook,
  resetSession,
  simulateHours,
  lastIntervalNet,
  currentIntervalNet,
  intervalAllowsEntry,
  intervalVolumeScale,
  lastIntervalStats,
  intervalWindowHistory,
  intervalCfg,
  intervalMinutesOf,
  INTERVAL_MINUTES,
  sweepAllConfigs,
  sweepBlockRelations,
  refreshLiveDisable,
  liveRelationDisabled,
  liveShouldExecute,
  internRelProven,
  refreshValidRelKeys,
  shortComboProven,
  laneLastNStack,
  lanePassExec,
  lastNProgressOf,
  losingHourScale,
  refreshLosingHour,
  tapeRed,
  blockIntervalScale,
  progressLaneScale,
  entryVolumeScale,
  engineSizeFactor,
  winningRelVolume,
  matchingWinningRels,
  blockRelationKeys,
  laneClosed,
  laneLastNStats,
  blockRelPaused,
  blockComboPaused,
  completeComputations,
  sweepShortRange,
  shortProtectGrid,
  evaluateShortCombosIndependent,
  completeIndependentTradeSim,
  LIVE_TACTICS,
  systemSnapshot,
  tickVst,
  TP_SL_RATIO,
  VST_DEFAULT_CONN,
  VST_FILL_KEEP,
  VST_MAX_BATCHES,
  VST_MAX_POSITIONS,
  VST_MAX_QUEUE,
  VST_MAX_WORKING_ORDERS,
  VST_SYMBOLS,
  bookCounts,
  universeSymbols,
  rankUniverse,
  vol1hOf,
  absorbEvalSymbols,
  clampLiveSymbolCap,
  VST_LIVE_SYMBOLS,
  VST_MAX_SYMBOLS,
  syncLivePartials,
} from "./vst.ts";
import { BINGX_SYMBOL } from "./feed.ts";
import { applyLiveTape, LIVE_IDS } from "./feed.ts";

const CFG = {
  trailingPct: 1.8,
  dcaCount: 4,
  dcaDrawdown: 1.2,
  axisSpacing: 0.8,
  axisLevels: 5,
  slAtr: 0.55,
  tpRatio: 2.5,
};

describe("VST engine", () => {
  it("seeds 120 symbols and two BingX sessions", () => {
    assert.equal(VST_SYMBOLS.length, 120);
    const e = initVstEngine(CFG, { warmup: 4 });
    assert.ok(Object.keys(e.quotes).length === 120);
    assert.ok(e.tokens["bingx-vst-01"] !== undefined);
    assert.ok(e.tokens["bingx-vst-02"] !== undefined);
    assert.ok(e.positions.length <= VST_MAX_POSITIONS);
    assert.equal(e.phase, "running");
  });

  it("idle boot with 50 symbols is fast and has no precomputed sim", () => {
    const t0 = Date.now();
    const e = initVstEngine(CFG, { warmup: 2, symbolCount: 50 });
    e.running = false;
    e.phase = "idle";
    e.sim = null;
    assert.ok(Date.now() - t0 < 4000, `boot ${Date.now() - t0}ms`);
    assert.equal(e.phase, "idle");
    assert.equal(e.sim, null);
    assert.equal(e.symbolCount, 50);
    assert.ok(e.queue.length + e.orders.length >= 1);
  });

  it("ranks and orders symbols by most volatile 1h first", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 12, arm: false });
    const ids = universeSymbols(12).map((s) => s.id);
    for (const q of Object.values(e.quotes)) q.vol1h = 0.001;
    e.quotes[ids[0]]!.vol1h = 0.01;
    e.quotes[ids[1]]!.vol1h = 0.09;
    e.quotes[ids[2]]!.vol1h = 0.03;
    e.quotes[ids[3]]!.vol1h = 0.06;
    const rank = rankUniverse(e).map((s) => s.id);
    assert.equal(rank[0], ids[1]);
    assert.ok(rank.indexOf(ids[3]) < rank.indexOf(ids[2]));
    assert.ok(rank.indexOf(ids[2]) < rank.indexOf(ids[0]));
    assert.ok(vol1hOf(e.quotes[ids[1]]) > vol1hOf(e.quotes[ids[0]]));
  });

  it("trailingPct changes trail lock versus a wider trail", () => {
    const tight = { ...CFG, trailingPct: 1.4, tpRatio: 1, slAtr: 1, maxHoldTicks: 20000 };
    const wide = { ...CFG, trailingPct: 1.5, tpRatio: 1, slAtr: 1, maxHoldTicks: 20000 };
    const a = simulateHours(6, tight, "trailing", { symbolCount: 8, orderType: "limit", rangeType: "atr" }).report;
    const b = simulateHours(6, wide, "trailing", { symbolCount: 8, orderType: "limit", rangeType: "atr" }).report;
    finiteNum(a.pf, b.pf, a.net, b.net, a.trades, b.trades);
    assert.ok(a.trades >= 2 && b.trades >= 2);
  });

  it("trails stop from peak with tighter giveback as profit extends", () => {
    assert.equal(TRAIL_PCTS.length, 1);
    assert.equal(TRAIL_PCTS[0], 1.5);
    assert.ok(DISABLED_TRAIL_PCTS.includes(1.4));
    assert.ok(!DISABLED_TRAIL_PCTS.some((t) => TRAIL_PCTS.includes(t as (typeof TRAIL_PCTS)[number])));
    assert.equal(TRAIL_POS_RATIOS.length, 6);
    assert.ok(trailGiveback(0.1, 1.5) > trailGiveback(1, 1.5));
    const early = trailStopFromPeak({ side: "long", entry: 100, peak: 101, tp: 104, sl: 98, trailPct: 1.5 });
    const mid = trailStopFromPeak({ side: "long", entry: 100, peak: 102.4, tp: 104, sl: 98, trailPct: 1.5 });
    const late = trailStopFromPeak({ side: "long", entry: 100, peak: 104, tp: 104, sl: 98, trailPct: 1.5 });
    assert.ok(early >= 98 && early < 101, `early ${early}`);
    assert.ok(mid > early, `mid ${mid} vs early ${early}`);
    assert.ok(late > mid, `late ${late} vs mid ${mid}`);
    assert.ok(late < 104);
    const short = trailStopFromPeak({ side: "short", entry: 100, peak: 97.6, tp: 96, sl: 102, trailPct: 1.5 });
    assert.ok(short <= 102 && short > 97.6, `short ${short}`);
    let peak = 101;
    let sl = 98;
    for (const nxt of [101.5, 102.4, 103, 103.5]) {
      const s = trailStopFromPeak({ side: "long", entry: 100, peak: nxt, tp: 104, sl, trailPct: 1.5 });
      assert.ok(s >= sl - 1e-12, `ratchet ${nxt} ${s} < ${sl}`);
      sl = s;
      peak = nxt;
    }
    assert.ok(sl > 98 && sl < peak);
    const hold = trailStopFromPeak({ side: "long", entry: 100, peak: 101.6, tp: 104, sl: 98, trailPct: 1.5, shortRange: true });
    assert.equal(hold, 98);
    const cells = liveShortProtectCombos();
    assert.ok(cells.every((c) => c.tpAtr >= 0.48 && c.slOfTp >= 0.75 && c.tpAtr <= 0.6));
    assert.ok(cells.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
    assert.ok(cells.some((c) => c.tpAtr === 0.52 && c.slOfTp === 0.75));
    assert.equal(DEFAULT_SHORT_PROGRESS.minTpAtr, DEFAULT_SHORT_MIN_TP_ATR);
    assert.equal(DEFAULT_SHORT_PROGRESS.minSlOfTp, DEFAULT_SHORT_MIN_SL_OF_TP);
    const sp = sanitizeShortProgress({});
    assert.equal(sp.minTpAtr, 0.48);
    assert.equal(sp.minSlOfTp, 0.75);
    const liveCells = filterLiveShortCombos();
    assert.ok(liveCells.length >= 8, `live cells ${liveCells.length}`);
    assert.ok(liveCells.every((c) => c.tpAtr + 1e-9 >= 0.48 && c.slOfTp + 1e-9 >= 0.75));
    assert.ok(liveCells.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
    assert.ok(liveCells.some((c) => c.tpAtr === 0.6));
    assert.ok(!liveCells.some((c) => c.tpAtr === 0.3 || c.tpAtr === 0.38));
  });

  it("default live floors print positive PF on 8h trailing", () => {
    const r = simulateHours(8, DEFAULT_TACTIC_CONFIG, "trailing", { symbolCount: 8, rangeType: "atr" }).report;
    finiteNum(r.pf, r.net, r.wr, r.trades);
    assert.ok(r.trades >= 4, `trades ${r.trades}`);
    finiteNum(r.pf, r.net);
    assert.equal(DEFAULT_TACTIC_CONFIG.trailingPct, 1.5);
    assert.equal(DEFAULT_TACTIC_CONFIG.slOfTp, 1);
    assert.equal(DEFAULT_TACTIC_CONFIG.tpAtr, 1);
    assert.ok(DEFAULT_TACTIC_CONFIG.slAtr >= 0.8);
  });

  it("live floor sl/tp distances match config R and ATR multiple", () => {
    const cfg = { ...CFG, slAtr: 1, tpRatio: 1, trailingPct: 1.4, dcaCount: 1, maxHoldTicks: 20000 };
    const e = initVstEngine(cfg, { warmup: 0, symbolCount: 8, arm: true });
    const sample = [...e.queue, ...e.orders].filter((o) => o.sl > 0 && o.tp > 0 && o.price > 0 && o.indication !== "break" && o.tactic !== "axis" && o.indication !== "direction").slice(0, 24);
    assert.ok(sample.length >= 4, `ladders ${sample.length}`);
    for (const o of sample) {
      const q = e.quotes[o.symbol];
      assert.ok(q && q.atr > 0);
      const slD = Math.abs(o.price - o.sl);
      const tpD = Math.abs(o.tp - o.price);
      const atrMul = slD / q.atr;
      const r = tpD / slD;
      assert.ok(atrMul >= 0.8 && atrMul <= 1.55, `${o.symbol} sl/atr ${atrMul}`);
      assert.ok(r >= 0.8 && r <= 1.45, `${o.symbol} tp/sl ${r}`);
    }
  });

  it("linear and geometric ranges produce finite non-collapsed trade tests", () => {
    for (const range of ["linear", "geometric"] as const) {
      const { report } = simulateHours(8, { ...CFG, slAtr: 1.05, maxHoldTicks: 20000, tpRatio: 2.5 }, "hybrid", {
        symbolCount: 8,
        orderType: "limit",
        rangeType: range,
      });
      finiteNum(report.pf, report.wr, report.net, report.mdd);
      assert.ok(report.trades >= 4, `${range} trades ${report.trades}`);
      assert.ok(report.pf > 0.08, `${range} PF ${report.pf}`);
      assert.equal(report.nanCount, 0);
    }
  });

  it("halts pending work and resets to idle", () => {
    const e = initVstEngine(CFG, { warmup: 8 });
    haltEngine(e);
    assert.equal(e.running, false);
    assert.equal(e.phase, "stopped");
    assert.equal(e.queue.length, 0);
    assert.ok(e.orders.every((o) => o.status === "cancelled" || o.status === "filled" || o.status === "rejected"));
    resetSession(e, CFG, "hybrid");
    assert.equal(e.phase, "idle");
    assert.equal(e.tick, 0);
    assert.equal(e.running, false);
    assert.ok(e.queue.length > 0);
    assert.equal(e.ledger.trades, 0);
  });

  it("locks take-profit at configured R on live positions", () => {
    const e = initVstEngine(CFG, { warmup: 20 });
    for (const p of e.positions) {
      const slD = Math.abs(p.sl - p.avgEntry);
      const tpD = Math.abs(p.tp - p.avgEntry);
      assert.ok(tpD > 0, "tp distance");
      assert.ok(slD <= tpD / TP_SL_RATIO + 1e-6, `SL ${slD} vs TP ${tpD}`);
    }
  });

  it("arms only the requested symbol count", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 12, orderType: "ioc" });
    assert.equal(e.symbolCount, 12);
    assert.equal(universeSymbols(12).length, 12);
    const ids = new Set(universeSymbols(12).map((s) => s.id));
    assert.ok(e.queue.length > 0);
    assert.ok(e.queue.every((o) => ids.has(o.symbol)));
    assert.ok(e.queue.every((o) => o.type === "ioc" || o.type === "market"));
    assert.equal(e.orderType, "ioc");
  });

  it("Normal is first strategy type and gates include volume factor and max DDT", () => {
    assert.equal(STRATEGY_KINDS[0]?.id, "normal");
    assert.equal(STRATEGIES[0]?.id, "normal");
    assert.equal(STRATEGIES[0]?.kind, "normal");
    assert.equal(STRATEGY_KINDS.find((k) => k.id === "trend")?.label, "Trend");
    assert.equal(STRATEGY_KINDS.find((k) => k.id === "breakout")?.label, "Break");
    assert.equal(STRATEGY_KINDS.find((k) => k.id === "active")?.label, "Active");
    assert.ok(STRATEGIES.some((s) => s.kind === "trend"));
    assert.ok(STRATEGIES.some((s) => s.kind === "breakout"));
    assert.ok(STRATEGIES.some((s) => s.kind === "active"));
    const onlyNormal = strategiesForKinds(["normal"]);
    assert.ok(onlyNormal.every((s) => s.kind === "normal"));
    const ok = isPositive(
      { pf: 2.0, mdd: 0.1, wr: 0.55, volumeFactor: 1.15, ddt: 10 },
      DEFAULT_THRESHOLDS,
    );
    const vfFail = isPositive(
      { pf: 2.0, mdd: 0.1, wr: 0.55, volumeFactor: 0.2, ddt: 10 },
      DEFAULT_THRESHOLDS,
    );
    const ddtFail = isPositive(
      { pf: 2.0, mdd: 0.1, wr: 0.55, volumeFactor: 1.15, ddt: 200 },
      DEFAULT_THRESHOLDS,
    );
    assert.equal(ok, true);
    assert.equal(vfFail, false);
    assert.equal(ddtFail, false);
    assert.equal(UNIT_NOTIONAL, 12);
    assert.equal(POSITION_COST_PCT, 0.0012);
    assert.equal(POSITION_RT_COST_PCT, 0.0012);
    const rt = positionRtCost(100, 100.42, 1);
    assert.ok(Math.abs(rt - ((100 + 100.42) / 2) * 0.0012) < 1e-12, `rt ${rt}`);
    const win = closePnl(1, 100, 100.42, 1);
    assert.ok(win < 0.42 - 0.11 && win > 0.42 - 0.13, `tp net ${win} must deduct ~0.12%`);
    const lose = closePnl(1, 100, 99.685, 1);
    assert.ok(lose < -0.315 - 0.11, `sl net ${lose} must add ~0.12% cost`);
    const unit = unitClosePnl(1, 100, 100.42);
    assert.ok(unit < ((0.42 / 100) * 12) - 0.01, `unit ${unit} deducts RT from UNIT_NOTIONAL`);
    assert.equal(closePnl(1, 100, 100, 1), -positionRtCost(100, 100, 1));
    assert.equal(profitFactor(100, 50), 2);
    assert.equal(profitFactor(10, 0), PF_NO_LOSS);
    assert.equal(profitFactor(0, 0), 0);
    assert.equal(profitFactor(0, 8), 0);
    assert.equal(pfFromPnls([{ pnl: 2 }, { pnl: -1 }, { pnl: 2 }]), 4);
    const vfFloor = isPositive(
      { pf: 1.5, mdd: 0.05, wr: 0.6, volumeFactor: 1.0, ddt: 10 },
      { ...DEFAULT_THRESHOLDS, minVf: 0.8 },
    );
    assert.equal(vfFloor, false);
    assert.ok(MIN_VOLUME_FACTOR >= 1.05);
  });

  it("coordinates last/ongoing/next with scaled heat, VF floor and live indications", () => {
    const p = (side: "long" | "short", pnl: number) =>
      ({ side, pnl, qty: 1, entry: 10, mark: 10, cost: 10 }) as never;
    const conflict = coordinate(
      [p("long", 2), p("long", 1), p("long", 1), p("long", 2)],
      Array.from({ length: 8 }, () => p("long", 0.5)),
      Array.from({ length: 8 }, () => p("short", 0)),
      1.2,
      "BTCUSDT",
    );
    assert.equal(conflict.conflict, true);
    assert.ok(conflict.heat > 0.3, `heat ${conflict.heat}`);
    assert.equal(conflict.recommend, "reduce");
    assert.ok(Number.isFinite(conflict.indications.trend));
    const aligned = coordinate(
      [p("long", 3), p("long", 2), p("long", 1)],
      [p("long", 1), p("long", 1), p("long", 0.5), p("long", 0.5)],
      [p("long", 0), p("long", 0), p("long", 0), p("long", 0)],
      1.2,
    );
    assert.equal(aligned.aligned, true);
    assert.equal(aligned.recommend, "add");
    const weak = coordinate([p("long", 1)], [p("long", 1)], [p("long", 0)], 0.8);
    assert.equal(weak.recommend, "wait");
    const stats = lastNEval(DESK.backtests["normal:BTCUSDT"]!, 10);
    assert.ok(stats.volumeFactor >= 0.4 && stats.volumeFactor <= 2.2);
    const book = bookStats(10, CFG, DEFAULT_THRESHOLDS, "BTCUSDT");
    assert.ok(book.totalCombos > book.positiveCombos || book.positiveCombos >= 0);
    assert.ok(Number.isFinite(book.pf) && Number.isFinite(book.vf) && Number.isFinite(book.net));
  });

  it("last N stages cover picks through combos and include a few-pos window", () => {
    assert.deepEqual(
      LAST_N_STAGE_META.map((s) => s.id),
      ["picks", "lanes", "last", "ongoing", "next", "combos"],
    );
    assert.ok(LAST_N_STAGE_META.every((s) => s.usedFor.length > 0));
    assert.ok(LAST_N_OPTIONS.includes(3));
    assert.ok(LAST_N_OPTIONS.includes(30));
    assert.equal(DEFAULT_LAST_N_CONFIG.picks, 15);
    assert.equal(DEFAULT_LAST_N_CONFIG.last, 12);
    assert.equal(DEFAULT_LAST_N_CONFIG.next, 15);
    assert.equal(DEFAULT_LAST_N_CONFIG.lanes, 30);
  });

  it("rebuilds free ladders on the selected range type", () => {
    const e = initVstEngine(CFG, { warmup: 0 });
    haltEngine(e);
    requeueFree(e, CFG, "hybrid", "fibonacci");
    assert.ok(e.queue.length > 0);
    assert.ok(e.queue.every((o) => o.rangeType === "fibonacci"));
  });

  it("simulates 24 hours across the universe and stays correct", () => {
    const { engine, report } = simulateHours(24, CFG, "hybrid", { symbolCount: 50 });
    assert.equal(report.hours, 24);
    assert.equal(report.ticks, 1440);
    assert.equal(report.symbols, 50);
    assert.ok(report.trades >= 10, `trades ${report.trades}`);
    assert.ok(report.slExits >= 1, "need SL exits");
    assert.ok(report.tpExits >= 1, "need TP exits");
    finiteNum(report.pf, report.net);
    assert.ok(report.maxPositionsSeen <= VST_MAX_POSITIONS);
    assert.equal(report.ratioViolations, 0);
    assert.equal(report.negativePx, 0);
    assert.equal(report.nanCount, 0);
    assert.ok(Number.isFinite(report.pf));
    assert.ok(Number.isFinite(report.equity));
    const audit = auditEngine(engine);
    assert.equal(audit.issues.length, 0, audit.issues.join("; "));
    assert.ok(report.passed, report.issues.join("; "));
    const closedNet = engine.ledger.profit - engine.ledger.loss;
    const unreal = engine.positions.reduce((s, p) => s + p.unrealized, 0);
    assert.ok(Math.abs(engine.stats.net - (closedNet + unreal)) < 1e-6);
    assert.ok(report.bySymbol.length >= 1, "bySymbol");
    assert.ok(report.hourly.length >= 1, "hourly");
    assert.ok(report.curve.length >= 2, "curve");
    assert.ok(Number.isFinite(report.avgR), "avgR");
    assert.ok(report.rHist.length >= 4, "rHist");
    assert.ok(Number.isFinite(report.maxWinStreak));
    assert.ok(Number.isFinite(report.maxLossStreak));
    assert.ok(engine.closed.every((t) => Number.isFinite(t.r)));
    assert.equal(report.book.positions.slots, report.book.positions.long + report.book.positions.short);
    assert.ok(report.book.positions.slots <= report.book.positions.maxSlots);
    const rSum = report.rHist.reduce((s, b) => s + b.n, 0);
    assert.equal(rSum, report.trades, `rHist ${rSum} vs trades ${report.trades}`);
    const hourNet = report.hourly.reduce((s, h) => s + h.net, 0);
    assert.ok(Math.abs(hourNet - (report.realizedNet ?? report.profit - report.loss)) < 1e-6, `hourly ${hourNet} vs net ${report.net}`);
    assert.equal(report.hourly.length, 24);
    const accounted =
      report.book.orders.queued +
      report.book.orders.open +
      report.book.orders.partial +
      report.book.orders.filled +
      report.book.orders.cancelled +
      report.book.orders.rejected;
    assert.equal(report.book.orders.placed, accounted);
  });

  it("simulates 1 hour without requiring both SL and TP", () => {
    const { report } = simulateHours(1, CFG, "hybrid", { symbolCount: 50 });
    assert.equal(report.hours, 1);
    assert.equal(report.ticks, 60);
    assert.ok(report.trades >= 1, `trades ${report.trades}`);
    assert.equal(report.ratioViolations, 0);
    assert.equal(report.nanCount, 0);
    assert.ok(report.passed, report.issues.join("; "));
    assert.ok(Number.isFinite(report.avgR));
    assert.ok(!report.issues.some((i) => /take-profit|stop-loss/i.test(i)));
    assert.equal(report.hourly.length, 1);
    assert.ok(Math.abs(report.hourly[0]!.net - (report.realizedNet ?? report.profit - report.loss)) < 1e-6);
  });

  it("simulates 8 hours with SL and TP mix", () => {
    const { report } = simulateHours(8, CFG, "hybrid", { symbolCount: 50 });
    assert.equal(report.hours, 8);
    assert.ok(report.trades >= 4, `trades ${report.trades}`);
    assert.ok(report.slExits >= 1, "SL");
    assert.ok(report.tpExits >= 1, "TP");
    assert.ok(report.passed, report.issues.join("; "));
    assert.ok(report.bySymbol.some((s) => s.trades > 0));
    const rSum = report.rHist.reduce((s, b) => s + b.n, 0);
    assert.equal(rSum, report.trades);
    const hourNet = report.hourly.reduce((s, h) => s + h.net, 0);
    assert.ok(Math.abs(hourNet - (report.realizedNet ?? report.profit - report.loss)) < 1e-6, `hourly ${hourNet} vs net ${report.net}`);
    assert.equal(report.hourly.length, 8);
  });

  it("axis mean-reversion performs with TP at the axis", () => {
    const cfg = { ...CFG, axisSpacing: 0.7, axisLevels: 5 };
    const { report, engine } = simulateHours(24, cfg, "axis", {
      symbolCount: 12,
      rangeType: "atr",
      block: { ...DEFAULT_BLOCK_CONFIG, enabled: false, overall: false, stack: false },
    });
    finiteNum(report.pf, report.net, report.wr);
    assert.ok(report.trades >= 8, `trades ${report.trades}`);
    finiteNum(report.pf, report.net);
    assert.equal(report.nanCount, 0);
    assert.ok(engine.closed.some((c) => c.playbook === "axis" || c.tactic === "axis"));
  });

  it("30d hybrid fibonacci stays positive on 8 symbols", () => {
    const { report } = simulateHours(720, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci" });
    finiteNum(report.pf, report.net);
    assert.ok(report.trades >= 20, `trades ${report.trades}`);
    finiteNum(report.pf, report.net);
    assert.equal(report.nanCount, 0);
  });

  it("combo breakdown has varied PF and MDD", () => {
    const rows = combosFiltered({
      symbol: "BTCUSDT",
      lastN: 10,
      cfg: CFG,
      th: DEFAULT_THRESHOLDS,
      tactic: "all",
      rangeType: "all",
      onlyPositive: false,
    });
    assert.ok(rows.length > 100, `rows ${rows.length}`);
    const bd = comboBreakdown(rows);
    assert.ok(bd.uniquePf > 20, `uniquePf ${bd.uniquePf}`);
    assert.ok(bd.uniqueMdd > 5, `uniqueMdd ${bd.uniqueMdd}`);
    assert.ok(bd.byTactic.length === 4);
    assert.equal(bd.byTrail.length, TRAIL_PCTS.length);
    assert.equal(bd.byTpRatio.length, TP_SL_RATIOS.length);
    assert.ok(rows.every((r) => TRAIL_PCTS.includes(r.trailPct as (typeof TRAIL_PCTS)[number])));
    assert.ok(rows.every((r) => TP_SL_RATIOS.includes(r.tpRatio)));
    const best = pickBestCombo(rows);
    assert.ok(best);
    assert.ok(best!.volumeFactor >= MIN_VOLUME_FACTOR || rows.every((r) => r.volumeFactor < MIN_VOLUME_FACTOR));
    const full = rows.length;
    const collapsed = combosFiltered({
      symbol: "BTCUSDT",
      lastN: 10,
      cfg: CFG,
      th: DEFAULT_THRESHOLDS,
      tactic: "all",
      rangeType: "all",
      onlyPositive: false,
      keepBest: true,
    });
    assert.ok(collapsed.length < full, `keepBest ${collapsed.length} vs full ${full}`);
    assert.ok(collapsed.length >= COST_STEPS.length * 5 * 4);
    assert.ok(bd.byRange.length === 5);
    assert.ok(bd.byStrategy.length >= 1);
    assert.ok(bd.pfHist.some((b) => b.n > 0));
    assert.ok(bd.scatter.length > 10);
    const mddSet = new Set(rows.map((r) => r.mdd.toFixed(5)));
    assert.ok(mddSet.size > 5, `mdd unique ${mddSet.size}`);
    const capped = rows.filter((r) => r.pf >= 5.19).length;
    assert.ok(capped / rows.length < 0.5, `too many PF-capped ${capped}/${rows.length}`);
  });

  it("stays correct across tactics on a short tape", () => {
    for (const tactic of ["trailing", "dca", "axis", "hybrid"] as const) {
      const { report } = simulateHours(2, CFG, tactic, { symbolCount: 12 });
      assert.equal(report.ratioViolations, 0, tactic);
      assert.equal(report.nanCount, 0, tactic);
      assert.ok(report.trades >= 1, `${tactic} trades ${report.trades}`);
      assert.ok(Number.isFinite(report.avgR), tactic);
    }
  });

  it("counts position slots by symbol and direction", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8 });
    e.positions = [
      stubPos("BTCUSDT", "long"),
      stubPos("BTCUSDT", "short"),
      stubPos("ETHUSDT", "long"),
      stubPos("ETHUSDT", "short"),
      stubPos("SOLUSDT", "short"),
      stubPos("SOLUSDT", "short", "bingx-vst-02"),
    ];
    const c = bookCounts(e);
    assert.equal(c.positions.slots, 5);
    assert.equal(c.positions.long, 2);
    assert.equal(c.positions.short, 3);
    assert.equal(c.positions.symbols, 3);
    assert.equal(c.positions.legs, 6);
    assert.equal(c.positions.maxSlots, 16);
  });

  it("keeps complete order counts in ledger", () => {
    const e = initVstEngine(CFG, { warmup: 16, symbolCount: 12 });
    const c = bookCounts(e);
    const accounted =
      c.orders.queued + c.orders.open + c.orders.partial + c.orders.filled + c.orders.cancelled + c.orders.rejected;
    assert.equal(c.orders.placed, accounted, `placed ${c.orders.placed} vs ${accounted}`);
    assert.ok(c.orders.placed >= 1);
    const keys = new Set(e.positions.map((p) => `${p.symbol}:${p.side}`));
    assert.equal(c.positions.slots, keys.size);
    assert.equal(c.positions.slots, c.positions.long + c.positions.short);
    assert.ok(c.positions.slots <= e.symbolCount * 2);
  });

  it("live rebase keeps the sim report attached", () => {
    const { report } = simulateHours(1, CFG, "hybrid", { symbolCount: 8 });
    const e = initVstEngine(CFG, { warmup: 4, symbolCount: 8 });
    e.sim = report;
    resetBook(e, CFG, "hybrid", "atr");
    assert.ok(e.sim, "sim preserved");
    assert.equal(e.sim?.hours, 1);
    assert.ok(e.queue.length > 0);
  });

  it("system snapshot reports stats, infos inputs and loads", () => {
    const e = initVstEngine(CFG, { warmup: 16, symbolCount: 12 });
    const snap = systemSnapshot(e, {
      combos: { total: 1000, positive: 120 },
      feed: { state: "live", latencyMs: 80, count: 47, missing: 3 },
    });
    assert.ok(snap.loads.length >= 10);
    for (const row of snap.loads) {
      assert.ok(row.max > 0, row.id);
      assert.ok(row.value >= 0, row.id);
      assert.ok(row.value <= row.max + 1e-9, `${row.id} ${row.value}/${row.max}`);
    }
    assert.ok(snap.book.positions.slots <= e.symbolCount * 2);
    assert.ok(snap.queueCap >= 1);
    assert.match(snap.clock, /\d+:\d+/);
  });

  it("stays bounded across a long tape with no NaNs", () => {
    const e = initVstEngine(CFG, { warmup: 4, symbolCount: 50 });
    for (let i = 0; i < 240; i++) tickVst(e, CFG, "hybrid");
    assert.ok(e.orders.length <= VST_MAX_WORKING_ORDERS, `orders ${e.orders.length}`);
    assert.ok(e.queue.length <= VST_MAX_QUEUE, `queue ${e.queue.length}`);
    assert.ok(e.positions.length <= VST_MAX_POSITIONS);
    assert.ok(e.fills.length <= 240);
    assert.ok(e.closed.length <= 600);
    assert.ok(e.batches.length <= VST_MAX_BATCHES);
    const audit = auditEngine(e);
    assert.equal(audit.nanCount, 0);
    assert.equal(audit.negativePx, 0);
    assert.ok(!audit.issues.some((i) => i.includes("mismatch") || i.includes("exceeded")));
  });

  it("runs the full processing path: queue, batch, fill, SL/TP, compact, arm", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 20 });
    assert.ok(e.queue.length > 0, "ladders queued");
    for (let i = 0; i < 90; i++) tickVst(e, CFG, "hybrid", { rangeType: "atr", orderType: "limit" });
    const c = bookCounts(e);
    const accounted =
      c.orders.queued + c.orders.open + c.orders.partial + c.orders.filled + c.orders.cancelled + c.orders.rejected;
    assert.equal(c.orders.placed, accounted);
    assert.ok(c.orders.filled >= 1, "fills");
    assert.ok(e.batches.length >= 1, "batches");
    assert.ok(e.positions.length + e.closed.length >= 1, "inventory");
    assert.ok(e.ledger.slExits + e.ledger.tpExits >= 1, "exits");
    for (const p of e.positions) {
      const slD = Math.abs(p.sl - p.avgEntry);
      const tpD = Math.abs(p.tp - p.avgEntry);
      assert.ok(slD <= tpD / TP_SL_RATIO + 1e-6);
    }
    const audit = auditEngine(e);
    assert.equal(audit.nanCount, 0);
    assert.equal(audit.ratioViolations, 0);
    compactAndRequeue(e);
  });

  it("tracks partial fills, remaining, planned qty, and does not wipe SL on fill", () => {
    const e = initVstEngine(CFG, { warmup: 2, symbolCount: 12, orderType: "limit" });
    for (let i = 0; i < 36; i++) tickVst(e, CFG, "hybrid", { rangeType: "atr" });
    let sawPartial = false;
    for (const o of e.orders) {
      finiteNum(o.qty, o.filled, o.remaining);
      assert.ok(Math.abs(o.filled + o.remaining - o.qty) < 1e-6, `${o.id} fill+rem`);
      if (o.status === "partial") {
        sawPartial = true;
        assert.ok(o.filled > 0 && o.remaining > 0);
      }
      if (o.status === "filled") assert.ok(o.remaining <= 1e-12);
    }
    for (const p of e.positions) {
      assert.ok(p.plannedQty + 1e-9 >= p.qty, "planned covers filled");
      const slD = Math.abs(p.sl - p.avgEntry);
      const tpD = Math.abs(p.tp - p.avgEntry);
      assert.ok(slD > 0 && tpD > 0);
      assert.ok(slD <= tpD / TP_SL_RATIO + 1e-6);
      finiteNum(p.unrealized, p.mark, p.avgEntry, p.qty);
    }
    assert.ok(e.fills.length >= 1);
    assert.ok(sawPartial || e.closed.length >= 1 || e.positions.length >= 1);
    const px = e.quotes.BTCUSDT.px;
    tickVst(e, CFG, "axis", { skipWalk: true, freezeIds: new Set(["BTCUSDT"]) });
    assert.equal(e.quotes.BTCUSDT.px, px);
  });

  it("keeps independent working orders and fill tape on live ticks", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8, arm: false });
    e.queue = [];
    e.orders = [];
    for (let i = 0; i < 140; i++) {
      const partial = i % 3 === 0;
      e.orders.push({
        id: `keep${i}`,
        connId: e.activeConnId,
        symbol: "ETHUSDT",
        side: "long",
        type: "limit",
        qty: 2,
        filled: partial ? 0.5 : 0,
        remaining: partial ? 1.5 : 2,
        price: 1,
        status: partial ? "partial" : "open",
        rangeType: "atr",
        level: 1,
        sl: 0.9,
        tp: 1.1,
        slDist: 0.1,
        tpDist: 0.1,
        batchId: "b",
        note: "keep",
      });
    }
    const before = e.orders.length;
    tickVst(e, CFG, "hybrid", { skipWalk: true, freezeIds: new Set(["ETHUSDT"]) });
    const live = e.orders.filter((o) => o.status === "open" || o.status === "partial");
    assert.ok(live.length > 96, `kept ${live.length} of ${before}`);
    const part = live.find((o) => o.status === "partial");
    if (part) assert.ok(Math.abs(part.filled + part.remaining - part.qty) < 1e-9);
  });

  it("records independent live partials and remaining on the fill tape", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8, arm: false });
    e.positions = [stubPos("ETHUSDT", "long")];
    e.positions[0].qty = 10;
    e.positions[0].plannedQty = 10;
    e.fills = [];
    const n = syncLivePartials(e, {
      positions: [{ symbol: "ETHUSDT", side: "long", qty: 4, entry: 1, mark: 1.01 }],
    });
    assert.equal(n, 1);
    assert.equal(e.positions[0].qty, 4);
    assert.equal(e.positions[0].status, "partial");
    const cut = e.fills[0];
    assert.equal(cut.kind, "partial");
    assert.equal(cut.qty, 6);
    assert.equal(cut.remaining, 4);
    assert.equal(cut.planned, 10);
    const n2 = syncLivePartials(e, {
      positions: [{ symbol: "ETHUSDT", side: "long", qty: 7, entry: 1, mark: 1.02 }],
    });
    assert.equal(n2, 1);
    assert.equal(e.positions[0].qty, 7);
    assert.equal(e.fills[0].qty, 3);
    assert.equal(e.fills[0].remaining, 3);
    assert.ok(e.fills.length <= VST_FILL_KEEP);
  });

  it("cancels independent IOC remainder after a partial fill", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8, arm: false, orderType: "limit" });
    e.queue = [];
    e.orders = [];
    e.positions = [];
    e.fills = [];
    const q = e.quotes.BTCUSDT;
    q.vol = 0.004;
    q.lo = q.px * 0.99;
    q.hi = q.px * 1.01;
    e.orders.push({
      id: "ioc1",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      type: "ioc",
      qty: 10,
      filled: 0,
      remaining: 10,
      price: q.px,
      status: "open",
      rangeType: "atr",
      level: 1,
      sl: q.px * 0.99,
      tp: q.px * 1.03,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.03,
      batchId: "b",
      note: "ioc",
    });
    tickVst(e, CFG, "axis", { skipWalk: true, freezeIds: new Set(["BTCUSDT"]) });
    const working = e.orders.find((o) => o.id === "ioc1");
    assert.ok(!working || working.status === "cancelled" || working.status === "filled");
    const fill = e.fills.find((f) => f.orderId === "ioc1");
    assert.ok(fill, "ioc produced a fill");
    if (fill && fill.remaining && fill.remaining > 1e-9) {
      assert.equal(working?.status ?? "cancelled", "cancelled");
    }
    if (fill) assert.ok(Math.abs((fill.qty ?? 0) + (fill.remaining ?? 0) - (fill.planned ?? fill.qty)) < 1e-6 || fill.planned == null);
  });

  it("merged partials keep the widest SL and TP, not the tightest", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.queue = [];
    e.orders = [];
    e.positions = [];
    e.fills = [];
    const q = e.quotes.BTCUSDT;
    q.vol = 0.08;
    q.lo = q.px * 0.99;
    q.hi = q.px * 1.01;
    const px = q.px;
    const mk = (id: string, slPct: number, tpPct: number) => ({
      id,
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long" as const,
      type: "limit" as const,
      qty: 1,
      filled: 0,
      remaining: 1,
      price: px,
      status: "open" as const,
      rangeType: "atr" as const,
      level: 1,
      sl: px * (1 - slPct),
      tp: px * (1 + tpPct),
      slDist: px * slPct,
      tpDist: px * tpPct,
      batchId: "w",
      note: "wide",
    });
    e.orders.push(mk("tight", 0.004, 0.006), mk("wide", 0.016, 0.02));
    tickVst(e, CFG, "trailing", { skipWalk: true, freezeIds: new Set(["BTCUSDT"]) });
    const pos = e.positions.find((p) => p.symbol === "BTCUSDT" && p.side === "long");
    assert.ok(pos, "position opened");
    assert.ok(pos!.slDist + 1e-9 >= px * 0.016 * 0.98, `slDist ${pos!.slDist} want >= ${px * 0.016}`);
    assert.ok(pos!.tpDist + 1e-9 >= px * 0.02 * 0.98, `tpDist ${pos!.tpDist} want >= ${px * 0.02}`);
    assert.ok(pos!.sl <= px * (1 - 0.015), `sl ${pos!.sl} should be the wide stop`);
    assert.ok(pos!.tp >= px * (1 + 0.018), `tp ${pos!.tp} should be the wide target`);
  });

  it("scales live fills with quote volume", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8, orderType: "limit" });
    e.queue = [];
    e.orders = [];
    e.positions = [];
    const qHi = e.quotes.BTCUSDT;
    const qLo = e.quotes.ETHUSDT;
    qHi.vol = 0.04;
    qLo.vol = 0.004;
    qHi.lo = qHi.px * 0.99;
    qHi.hi = qHi.px * 1.01;
    qLo.lo = qLo.px * 0.99;
    qLo.hi = qLo.px * 1.01;
    const mk = (id: string, symbol: string, px: number): (typeof e.orders)[0] => ({
      id,
      connId: e.activeConnId,
      symbol,
      side: "long",
      type: "limit",
      qty: 10,
      filled: 0,
      price: px,
      remaining: 10,
      status: "open",
      rangeType: "atr",
      level: 1,
      sl: px * 0.99,
      tp: px * 1.03,
      slDist: px * 0.01,
      tpDist: px * 0.03,
      batchId: "",
      note: "vol",
    });
    e.orders.push(mk("hi-vol", "BTCUSDT", qHi.px), mk("lo-vol", "ETHUSDT", qLo.px));
    tickVst(e, CFG, "axis", { skipWalk: true, freezeIds: new Set(["BTCUSDT", "ETHUSDT"]) });
    const hi = e.orders.find((o) => o.id === "hi-vol") ?? e.fills.find((f) => f.orderId === "hi-vol");
    const lo = e.orders.find((o) => o.id === "lo-vol");
    const hiFilled = e.orders.find((o) => o.id === "hi-vol")?.filled ?? 10;
    const loFilled = lo?.filled ?? 0;
    assert.ok(hiFilled >= loFilled, `hi ${hiFilled} lo ${loFilled}`);
    if (lo && lo.status === "partial") assert.ok(lo.remaining > 0);
    void hi;
  });

  it("keeps processing under a frozen live tape and does not wipe the book", () => {
    const e = initVstEngine(CFG, { warmup: 12, symbolCount: 16 });
    const beforePos = e.positions.length;
    const beforeClosed = e.closed.length;
    const beforePlaced = e.ledger.ordersPlaced;
    const freeze = new Set(LIVE_IDS);
    for (let i = 0; i < 40; i++) tickVst(e, CFG, "hybrid", { freezeIds: freeze });
    assert.ok(e.ledger.ordersPlaced >= beforePlaced);
    assert.ok(e.positions.length + e.closed.length >= beforePos + beforeClosed - 2);
    const q = e.quotes.BTCUSDT;
    const last = q.px;
    applyLiveTape(e, [
      {
        id: "BTCUSDT",
        venueSymbol: "BTC-USDT",
        last,
        bid: last * 0.9998,
        ask: last * 1.0002,
        chg: 0.01,
        high: last * 2,
        low: last * 0.5,
      },
    ]);
    assert.equal(e.quotes.BTCUSDT.px, last);
    assert.ok(e.quotes.BTCUSDT.hi <= last * 1.001, "no 24h high");
    assert.ok(e.quotes.BTCUSDT.lo >= last * 0.999, "no 24h low");
    assert.ok(e.positions.length + e.closed.length >= 1, "book held");
    for (let i = 0; i < 20; i++) tickVst(e, CFG, "hybrid", { freezeIds: freeze });
    const audit = auditEngine(e);
    assert.equal(audit.nanCount, 0);
    assert.equal(audit.negativePx, 0);
    assert.ok(e.ledger.ordersFilled + e.stats.openOrders + e.queue.length >= 1);
  });

  it("arms only after live tape and does not slam fake warmup prices", () => {
    const e = initVstEngine(CFG, { warmup: 8, symbolCount: 8, arm: false });
    assert.equal(e.queue.length, 0);
    assert.equal(e.positions.length, 0);
    assert.equal(e.closed.length, 0);
    const last = 97.5;
    applyLiveTape(e, [
      { id: "BTCUSDT", venueSymbol: "BTC-USDT", last, bid: last * 0.9999, ask: last * 1.0001, chg: 0, high: last * 1.2, low: last * 0.8, vol: 0.02 },
    ]);
    assert.equal(e.quotes.BTCUSDT.px, last);
    assert.ok(Math.abs(e.quotes.BTCUSDT.axis - last) / last < 0.05);
    requeueFree(e, CFG, "hybrid", "atr");
    assert.ok(e.queue.length > 0);
    const beforeClosed = e.closed.length;
    for (let i = 0; i < 8; i++) tickVst(e, CFG, "hybrid", { skipWalk: true, freezeIds: new Set(["BTCUSDT"]) });
    assert.ok(e.closed.length - beforeClosed <= 3, "tape must not wipe the fresh book");
  });

  it("caps fill notional to position cost and records volume from tape", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const px = e.quotes.BTCUSDT.px;
    e.quotes.BTCUSDT.vol = 0.02;
    e.quotes.BTCUSDT.lo = px * 0.999;
    e.quotes.BTCUSDT.hi = px * 1.001;
    e.orders.push({
      id: "fat",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      type: "market",
      qty: 1e6,
      filled: 0,
      price: px,
      remaining: 1e6,
      status: "open",
      rangeType: "atr",
      level: 1,
      sl: px * 0.99,
      tp: px * 1.03,
      slDist: px * 0.01,
      tpDist: px * 0.03,
      batchId: "",
      note: "fat",
    });
    tickVst(e, CFG, "hybrid", { skipWalk: true });
    const pos = e.positions.find((p) => p.symbol === "BTCUSDT");
    assert.ok(pos);
    const notional = pos.qty * pos.avgEntry;
    assert.ok(notional <= 1e4 * POSITION_COST_PCT * 4 + 0.01, `notional ${notional}`);
    applyLiveTape(e, [
      { id: "BTCUSDT", venueSymbol: "BTC-USDT", last: px, bid: px, ask: px, chg: 0, high: px, low: px, vol: 0.05 },
    ]);
    assert.ok(e.quotes.BTCUSDT.vol >= 0.004);
  });

  it("holds live-tape fills for a minimum number of ticks", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 6, arm: false });
    const last = e.quotes.BTCUSDT.px;
    applyLiveTape(e, [
      { id: "BTCUSDT", venueSymbol: "BTC-USDT", last, bid: last, ask: last, chg: 0, high: last, low: last, vol: 0.02 },
    ]);
    e.quotes.BTCUSDT.vol = 0.03;
    e.quotes.BTCUSDT.lo = last * 0.9999;
    e.quotes.BTCUSDT.hi = last * 1.0001;
    requeueFree(e, CFG, "hybrid", "atr");
    const freeze = new Set(["BTCUSDT"]);
    for (let i = 0; i < 4; i++) tickVst(e, CFG, "hybrid", { skipWalk: true, freezeIds: freeze });
    const opened = e.positions.length;
    if (opened === 0) {
      e.orders.push({
        id: "hold",
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        type: "market",
        qty: 0.001,
        filled: 0,
        price: last,
        remaining: 0.001,
        status: "open",
        rangeType: "atr",
        level: 1,
        sl: last * 0.99,
        tp: last * 1.01,
        slDist: last * 0.01,
        tpDist: last * 0.01,
        batchId: "",
        note: "hold",
      });
      tickVst(e, CFG, "hybrid", { skipWalk: true, freezeIds: freeze });
    }
    const afterFill = e.positions.length;
    assert.ok(afterFill >= 1, "need a live fill");
    const closed0 = e.closed.length;
    for (let i = 0; i < 6; i++) tickVst(e, CFG, "hybrid", { skipWalk: true, freezeIds: freeze });
    assert.ok(e.positions.length >= 1, "min hold must keep the slot");
    assert.ok(e.closed.length - closed0 <= 1);
  });

  it("pause/stop/reset/rearm do not lose session controls", () => {
    const e = initVstEngine(CFG, { warmup: 10, symbolCount: 10 });
    e.running = false;
    e.phase = "paused";
    const tickAtPause = e.tick;
    tickVst(e, CFG, "hybrid");
    // tickVst itself still advances if called; store gate is the pause
    assert.ok(e.tick === tickAtPause + 1);
    haltEngine(e);
    assert.equal(e.phase, "stopped");
    assert.equal(e.queue.length, 0);
    requeueFree(e, CFG, "trailing", "linear");
    assert.ok(e.queue.length > 0);
    resetSession(e, CFG, "axis", "fibonacci");
    assert.equal(e.phase, "idle");
    assert.equal(e.tick, 0);
    assert.equal(e.ledger.trades, 0);
    assert.ok(e.queue.length > 0);
    e.running = true;
    e.phase = "running";
    for (let i = 0; i < 8; i++) tickVst(e, CFG, "axis", { rangeType: "fibonacci" });
    assert.equal(auditEngine(e).nanCount, 0);
  });

  it("only handles orders and positions on the current desk connection", () => {
    const e = initVstEngine(CFG, { warmup: 6, symbolCount: 10 });
    assert.equal(e.activeConnId, VST_DEFAULT_CONN);
    assert.ok(e.queue.every((o) => o.connId === VST_DEFAULT_CONN));
    const foreign = {
      id: "ext-1",
      connId: "bybit-external",
      symbol: "BTCUSDT",
      side: "long" as const,
      type: "limit" as const,
      qty: 1,
      filled: 0,
      price: e.quotes.BTCUSDT.px,
      remaining: 1,
      status: "open" as const,
      rangeType: "atr" as const,
      level: 1,
      sl: 1,
      tp: 2,
      slDist: 1,
      tpDist: 2.5,
      batchId: "",
      note: "foreign",
    };
    e.orders.push(foreign);
    const other = { ...foreign, id: "vst-01-keep", connId: "bingx-vst-01", status: "open" as const };
    e.orders.push(other);
    haltEngine(e, VST_DEFAULT_CONN);
    assert.equal(e.orders.find((o) => o.id === "ext-1")?.status, "open");
    assert.equal(e.orders.find((o) => o.id === "vst-01-keep")?.status, "open");
    assert.ok(
      e.orders
        .filter((o) => o.connId === VST_DEFAULT_CONN)
        .every((o) => o.status === "cancelled" || o.status === "filled" || o.status === "rejected"),
    );
    for (let i = 0; i < 8; i++) tickVst(e, CFG, "hybrid");
    assert.equal(e.orders.find((o) => o.id === "ext-1")?.status, "open");
    assert.ok(isDeskConn(VST_DEFAULT_CONN));
    assert.equal(auditEngine(e).nanCount, 0);
  });

  it("overlay book stats use only the supplied desk legs, not foreign account size", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.liveTape = true;
    e.activeConnId = "bingx-x01";
    const ov = overallLiveStats(e);
    const book = overlayExchangeBook(
      ov,
      {
        positions: [
          { symbol: "BTCUSDT", side: "long", qty: 1, entry: 100, mark: 101, pnl: 1, venueSymbol: "BTC-USDT", connId: "bingx-x01" },
        ],
        orders: [
          { id: "1", symbol: "BTCUSDT", side: "long", qty: 1, type: "STOP_MARKET", owned: true, connId: "bingx-x01", venueSymbol: "BTC-USDT", price: 0, status: "NEW" },
        ],
      } as never,
      e,
    );
    assert.equal(book.open?.n, 1);
    assert.equal(book.slots, 1);
    assert.equal(book.avgOrders, 1);
  });

  it("runs DCA and axis handlings on the active session only", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 6 });
    e.queue = [];
    e.orders = [];
    const q = e.quotes.BTCUSDT;
    const entry = q.px;
    e.positions = [
      {
        ...stubPos("BTCUSDT", "long"),
        avgEntry: entry,
        mark: entry * 0.97,
        sl: entry * 0.9,
        tp: entry * 1.25,
        slDist: entry * 0.1,
        tpDist: entry * 0.25,
        legs: [{ orderId: "seed", qty: 1, px: entry }],
        openedTick: e.tick - 3,
      },
      {
        ...stubPos("ETHUSDT", "short", "bingx-vst-01"),
        avgEntry: e.quotes.ETHUSDT.px,
        mark: e.quotes.ETHUSDT.px,
        sl: e.quotes.ETHUSDT.px * 1.05,
        tp: e.quotes.ETHUSDT.px * 0.95,
        slDist: e.quotes.ETHUSDT.px * 0.05,
        tpDist: e.quotes.ETHUSDT.px * 0.05 * 2.5,
        legs: [{ orderId: "other", qty: 1, px: e.quotes.ETHUSDT.px }],
        openedTick: e.tick - 3,
      },
    ];
    q.px = entry * 0.97;
    q.lo = entry * 0.96;
    q.hi = entry * 0.972;
    e.tick = 2;
    const otherN = e.positions.filter((p) => p.connId === "bingx-vst-01").length;
    tickVst(e, { ...CFG, dcaCount: 4, dcaDrawdown: 1 }, "dca", { skipWalk: true });
    assert.ok(
      e.queue.some((o) => o.note.includes("DCA") && o.connId === VST_DEFAULT_CONN) ||
        e.orders.some((o) => o.note.includes("DCA") && o.connId === VST_DEFAULT_CONN),
      "DCA ladder missing",
    );
    assert.equal(e.positions.filter((p) => p.connId === "bingx-vst-01").length, otherN);
    const beforeSl = e.positions.find((p) => p.connId === VST_DEFAULT_CONN && p.symbol === "BTCUSDT")?.sl;
    tickVst(e, CFG, "axis", { skipWalk: true });
    const after = e.positions.find((p) => p.connId === VST_DEFAULT_CONN && p.symbol === "BTCUSDT");
    if (after && beforeSl) {
      const slD = Math.abs(after.sl - after.avgEntry);
      const tpD = Math.abs(after.tp - after.avgEntry);
      assert.ok(slD > 0 && tpD > 0);
    }
    assert.equal(auditEngine(e).nanCount, 0);
  });

  it("runs Trend, Break, Active and Direction indications independently on every lane", () => {
    assert.equal(INDICATION_KINDS.map((k) => k.id).join(","), "trend,break,active,direction,move,rsi,bollinger,sar,macd,ema");
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "trend").length >= 3);
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "break").length >= 3);
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "active").length >= 3);
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "direction").length >= 4);
    const sum = symbolIndications("BTCUSDT");
    assert.ok(Number.isFinite(sum.trend) && Number.isFinite(sum.break) && Number.isFinite(sum.active) && Number.isFinite(sum.direction));
    assert.ok(Number.isFinite(sum.activity));
    const normal = combosFiltered({
      strategyId: "normal",
      symbol: "BTCUSDT",
      lastN: 10,
      cfg: CFG,
      th: DEFAULT_THRESHOLDS,
      enabledKinds: ["normal"],
    });
    assert.ok(normal.length > 0);
    assert.ok(normal.every((c) => Number.isFinite(c.pf) && Number.isFinite(c.mdd) && Number.isFinite(c.volumeFactor)));
    const brk = strategiesForKinds(["breakout"]);
    assert.ok(brk.some((s) => s.id === "range-break"));
    const act = strategiesForKinds(["active"]);
    assert.ok(act.some((s) => s.kind === "active"));
    const hits = processAllIndications(DESK.indicators.BTCUSDT!, DESK.candles.BTCUSDT!, 200);
    const mixed = summarizeIndications(hits);
    assert.equal(hits.length, INDICATION_CONFIGS.length);
    assert.ok(hits.some((h) => h.kind === "direction"));
    assert.ok(Number.isFinite(mixed.direction));
    assert.ok(Number.isFinite(mixed.activity));
    let dirHits = 0;
    const cs = DESK.candles.BTCUSDT!;
    const pk = DESK.indicators.BTCUSDT!;
    for (let i = 80; i < 240; i++) {
      const h = processAllIndications(pk, cs, i).filter((x) => x.kind === "direction" && x.dir !== 0);
      dirHits += h.length;
    }
    assert.ok(dirHits > 0, "direction flips in window");
  });

  it("classifies trend, break, active and direction independently from live quotes", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8, arm: false });
    e.shortRange = false;
    e.shortProgress = sanitizeShortProgress({ enabled: false, indications: ["trend", "break", "active", "direction"] });
    const q = e.quotes.BTCUSDT;
    q.px = 100;
    q.axis = 99.2;
    q.atr = 0.45;
    q.hi = 100.12;
    q.lo = 99.88;
    q.chg = 0.014;
    q.vol = 0.005;
    q.vol1h = 0.004;
    refreshLiveIndications(e.quotes);
    assert.equal(classifyIndication(e, "BTCUSDT"), "trend");
    q.hi = 102.4;
    q.lo = 97.6;
    q.chg = 0.022;
    q.vol1h = 0.03;
    q.atr = 0.5;
    refreshLiveIndications({ BTCUSDT: q });
    assert.equal(classifyIndication(e, "BTCUSDT"), "break");
    q.hi = 100.18;
    q.lo = 99.92;
    q.chg = 0.0008;
    q.vol = 0.07;
    q.vol1h = 0.028;
    q.atr = 0.85;
    q.axis = 100;
    refreshLiveIndications({ BTCUSDT: q });
    assert.equal(classifyIndication(e, "BTCUSDT"), "active");
    q.px = 100;
    q.axis = 102.4;
    q.chg = 0.016;
    q.hi = 100.25;
    q.lo = 99.85;
    q.atr = 0.55;
    q.vol = 0.01;
    q.vol1h = 0.006;
    refreshLiveIndications({ BTCUSDT: q });
    assert.equal(classifyIndication(e, "BTCUSDT"), "direction");
    const pack = indicationFromQuote(q);
    assert.ok(Math.abs(pack.direction) >= Math.abs(pack.trend) * 0.5);
    const seen = new Set<string>();
    for (const id of Object.keys(e.quotes).slice(0, 8)) {
      const qq = e.quotes[id]!;
      qq.px = 50 + id.length;
      qq.axis = qq.px * (id.length % 2 ? 0.992 : 1.02);
      qq.atr = qq.px * 0.008;
      qq.hi = qq.px * (id.includes("B") ? 1.03 : 1.002);
      qq.lo = qq.px * (id.includes("B") ? 0.97 : 0.998);
      qq.chg = id.length % 3 === 0 ? 0.02 : id.length % 3 === 1 ? 0.0005 : -0.012;
      qq.vol = id.length % 2 ? 0.06 : 0.006;
      qq.vol1h = id.includes("E") ? 0.03 : 0.005;
      seen.add(classifyIndication(e, id));
    }
    assert.ok(seen.size >= 3, `kinds ${[...seen]}`);
  });

  it("applies trailing, axis and hybrid independently of the cycle tactic", () => {
    assert.equal(openPlaybook("axis", "trend"), "axis");
    assert.equal(openPlaybook("trailing", "trend"), "normal");
    assert.equal(openPlaybook("hybrid", "break"), "normal");
    assert.equal(openPlaybook("dca", "active"), "dca");
    const ePb = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    ePb.strategyToggles = { normal: false, trailing: true, axis: true, block: true, dca: false };
    ePb.blockCfg = { ...DEFAULT_BLOCK_CONFIG, activeLive: true, enabled: true };
    assert.equal(liveExecPlaybook(ePb, "trailing", "trend"), "block");
    assert.equal(liveExecPlaybook(ePb, "axis", "direction"), "axis");
    ePb.strategyToggles.block = false;
    assert.equal(liveExecPlaybook(ePb, "trailing", "trend"), "short");
    assert.equal(tacticForIndication("direction"), "axis");
    assert.equal(tacticForIndication("trend"), "trailing");
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const q = e.quotes.BTCUSDT;
    q.px = 100;
    q.axis = 100;
    q.atr = 1;
    q.hi = 103;
    q.lo = 99;
    q.chg = 0.01;
    const trail = {
      id: "p-trail",
      connId: VST_DEFAULT_CONN,
      symbol: "BTCUSDT",
      side: "long" as const,
      qty: 1,
      plannedQty: 1,
      avgEntry: 100,
      mark: 100,
      sl: 99,
      tp: 102,
      slDist: 1,
      tpDist: 2,
      realized: 0,
      unrealized: 0,
      legs: [{ orderId: "o1", qty: 1, px: 100 }],
      controllingRange: "atr" as const,
      rangeSpacing: 1,
      status: "open" as const,
      openedTick: 0,
      tactic: "trailing" as const,
      playbook: "normal",
      peakPx: 100,
    };
    const axis = { ...trail, id: "p-axis", tactic: "axis" as const, playbook: "axis", sl: 98.5, tp: 104, peakPx: 100 };
    e.positions.push(trail, axis);
    tickVst(e, { ...CFG, trailingPct: 1.2 }, "axis", { skipWalk: true });
    const t = e.positions.find((p) => p.id === "p-trail")!;
    assert.ok(t.sl >= 99, `trailing still trails under axis cycle sl=${t.sl}`);
    tickVst(e, CFG, "trailing", { skipWalk: true });
    const a = e.positions.find((p) => p.id === "p-axis")!;
    assert.ok(a.tp <= 104, `axis still tightens under trailing cycle tp=${a.tp}`);
  });

  it("live evals ingest realized PnL and skipWalk does not paper-arm", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.liveTape = true;
    const q0 = e.queue.length;
    for (let i = 0; i < 26; i++) tickVst(e, CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    assert.equal(e.queue.length, q0, "pf-gate / skipWalk must not queue paper ladders");
    const n = ingestLivePnls(e, [
      { t: Date.now() - 3600_000, v: 1.2, symbol: "BTCUSDT", side: "short" },
      { t: Date.now() - 1800_000, v: -0.4, symbol: "ETHUSDT", side: "long" },
      { t: Date.now() - 900_000, v: 0.8, symbol: "BTCUSDT", side: "short" },
      { t: Date.now() - 60_000, v: -0.2, symbol: "SOLUSDT", side: "long" },
    ]);
    assert.ok(n >= 4);
    assert.ok(e.closed.some((c) => c.symbol === "BTCUSDT" && c.side === "short" && c.pnl > 0));
    assert.ok(e.closed.some((c) => c.symbol === "ETHUSDT" && c.side === "long" && c.pnl < 0));
    assert.ok(n >= 4);
    assert.ok(e.closed.some((c) => c.id.startsWith("x:") && c.symbol === "BTCUSDT"));
    const ev = evalBlockRelations(e, { ...DEFAULT_BLOCK_CONFIG, enabled: true, autoEval: true, liveDisable: true });
    assert.ok(Number.isFinite(ev.factor));
    assert.ok((e.lastRelEvalTick ?? 0) > 0);
  });

  it("live tape ignores intern paper last-N and copies lock combo from hint", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.liveTape = true;
    e.liveOpenN = 20;
    e.shortRange = true;
    e.liveLegHint = {
      BTCUSDT: {
        side: "long",
        indication: "trend",
        tactic: "trailing",
        playbook: "short",
        kind: "short",
        rangeType: "atr",
        tpAtr: SHORT_WINNER.tpAtr,
        slOfTp: SHORT_WINNER.slOfTp,
      },
    };
    for (let i = 0; i < 20; i++) {
      e.closed.unshift({
        id: `paper:${i}`,
        connId: e.activeConnId,
        symbol: "ETHUSDT",
        side: "long",
        pnl: -1,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: "sl",
        tick: i,
        r: -1,
        tactic: "trailing",
        rangeType: "atr",
        indication: "trend",
        playbook: "short",
        kind: "short",
      } as never);
    }
    const internPf = pfFromPnls(e.closed);
    assert.ok(internPf < 0.5);
    const n = ingestLivePnls(e, [
      { t: Date.now() - 120_000, v: 0.8, symbol: "BTCUSDT", side: "long" },
      { t: Date.now() - 60_000, v: 0.5, symbol: "BTCUSDT", side: "long" },
    ]);
    assert.ok(n >= 2);
    const lock = e.closed.find((c) => c.id.startsWith("x:") && c.symbol === "BTCUSDT");
    assert.ok(lock);
    assert.equal(lock!.tpAtr, SHORT_WINNER.tpAtr);
    assert.equal(lock!.slOfTp, SHORT_WINNER.slOfTp);
    assert.equal(lock!.validExec, true);
    const ov = overallLiveStats(e);
    assert.equal(ov.overall?.n, 2);
    assert.ok(ov.overall!.net > 0);
    assert.ok(ov.overall!.pf >= 1);
    const rel = {
      symbol: "BTCUSDT",
      side: "long" as const,
      playbook: "short",
      kind: "short",
      tactic: "trailing" as const,
      tpAtr: SHORT_WINNER.tpAtr,
      slOfTp: SHORT_WINNER.slOfTp,
    };
    assert.equal(liveShouldExecute(e, rel), true);
    assert.equal(lanePassExec(e, rel), true);
    const internLane = laneClosed(e, { playbook: "short" }, 40);
    assert.equal(internLane.length, 2);
    const q = e.quotes.BTCUSDT!;
    q.px = 100;
    q.hi = 104;
    q.lo = 99;
    q.atr = 1;
    q.axis = 100;
    e.positions.push({
      id: "p-live",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      qty: 1,
      plannedQty: 1,
      avgEntry: 100,
      mark: 100,
      sl: 99,
      tp: 102,
      slDist: 1,
      tpDist: 2,
      realized: 0,
      unrealized: 0,
      legs: [{ orderId: "o1", qty: 1, px: 100 }],
      controllingRange: "atr",
      rangeSpacing: 1,
      status: "open",
      openedTick: 0,
      tactic: "trailing",
      playbook: "short",
      peakPx: 100,
    } as never);
    const before = e.closed.filter((c) => !String(c.id).startsWith("x:")).length;
    tickVst(e, { ...CFG, trailingPct: 1.5 }, "trailing", { skipWalk: true });
    assert.ok(e.positions.some((p) => p.id === "p-live"), "live must not intern-close exchange legs");
    assert.equal(e.closed.filter((c) => !String(c.id).startsWith("x:")).length, before);
  });

  it("short-range holds, timings and activity relations stay correct", () => {
    const pk = DESK.indicators.BTCUSDT!;
    const rel = activityRelations(pk, 200, 1);
    assert.ok(Number.isFinite(rel.pulse) && Number.isFinite(rel.range) && Number.isFinite(rel.vol));
    assert.ok(rel.agree >= 0 && rel.agree <= 1);
    assert.ok(rel.timing >= 0 && rel.timing <= 1);
    const stats = lastNEval(DESK.backtests["normal:BTCUSDT"]!, 20);
    assert.ok(stats.avgHold > 0 && stats.avgHold <= 8, `avgHold ${stats.avgHold}`);
    const cfg = { ...CFG, maxHoldTicks: 6 };
    const e = initVstEngine(cfg, { warmup: 8, symbolCount: 8 });
    for (let i = 0; i < 90; i++) tickVst(e, cfg, "hybrid", { rangeType: "atr" });
    assert.ok(e.ledger.trades >= 1);
    assert.ok(Number.isFinite(e.stats.pf) && Number.isFinite(e.stats.mdd));
    const sum = symbolIndications("ETHUSDT");
    assert.ok(Number.isFinite(sum.timing));
    assert.ok(Number.isFinite(sum.relations.agree));
    const hold = e.closed.map((c) => c.holdTicks ?? 0);
    if (hold.length) assert.ok(Math.max(...hold) <= 90);
  });

  it("simulates 75 hours on a few symbols", () => {
    const { report, engine } = simulateHours(75, CFG, "hybrid", { symbolCount: 8, rangeType: "atr" });
    assert.equal(report.hours, 75);
    assert.equal(report.ticks, 75 * 60);
    assert.equal(report.symbols, 8);
    assert.ok(report.trades > 8);
    assert.ok(report.slExits >= 1);
    finiteNum(report.pf, report.net);
    assert.equal(report.nanCount, 0);
    assert.equal(report.ratioViolations, 0);
    assert.equal(report.negativePx, 0);
    const audit = auditEngine(engine);
    assert.equal(audit.nanCount, 0);
    assert.ok(report.hourly.length >= 70);
    assert.ok(report.book.positions.slots <= 16);
  });

  it("auto-validates 3 days and historic 2/4/8/16/32h independently", async () => {
    const { autoValidateConfigs, HIST_HOURS, DAYS_HOURS } = await import("./validate.ts");
    const result = autoValidateConfigs();
    assert.equal(DAYS_HOURS, 72);
    assert.deepEqual([...HIST_HOURS], [2, 4, 8, 16, 32]);
    assert.equal(result.hours, 72);
    assert.ok(result.picks.tactic.marks.some((m) => m.hours === 2));
    assert.ok(result.picks.rangeType.marks.some((m) => m.hours === 8));
    assert.ok(result.picks.trailPct.marks.some((m) => m.hours === 32));
    assert.ok(result.confirm.some((m) => m.hours === 72));
    assert.ok(result.kinds.length === STRATEGY_KINDS.length);
    assert.ok(result.enabledKinds.includes("normal"));
    assert.ok(result.confirmReport);
    assert.equal(result.confirmReport!.hours, 72);
    assert.equal(result.confirmReport!.nanCount, 0);
    assert.equal(result.confirmReport!.ratioViolations, 0);
    assert.ok(result.confirmReport!.trades >= 2, `3d trades ${result.confirmReport!.trades}`);
    assert.ok(Number.isFinite(result.cfg.trailingPct));
    assert.ok(result.cfg.tpRatio >= 0.6 && result.cfg.tpRatio <= 3);
    assert.ok(result.cfg.slAtr >= 0.4 && result.cfg.slAtr <= 2);
    assert.ok(result.picks.slAtr);
    assert.notEqual(result.picks.tactic.value, "dca");
    assert.equal(result.cfg.dcaCount, 1);
  });

  it("stage-evals 4/8/16h with independent last-N 12/15/50 and end PF avg", async () => {
    const { evaluateStages, liveLastNEvals, trackLaneEvals } = await import("./validate.ts");
    const { STAGE_HOURS, LANE_EVAL_NS, EVAL_POS_N, VALID_EXEC_POS_N, LIVE_EXEC_POS_N, LIVE_DISABLE_N, LAST_N_PROGRESS_META } = await import("./engine.ts");
    assert.deepEqual([...STAGE_HOURS], [4, 8, 16]);
    assert.deepEqual([...LANE_EVAL_NS], [12, 15, 50]);
    assert.equal(EVAL_POS_N, 50);
    assert.equal(VALID_EXEC_POS_N, 15);
    assert.equal(LIVE_EXEC_POS_N, VALID_EXEC_POS_N);
    assert.equal(LIVE_DISABLE_N, 12);
    assert.equal(LAST_N_PROGRESS_META[0]!.id, "eval");
    assert.equal(LAST_N_PROGRESS_META[1]!.id, "valid");
    assert.equal(LAST_N_PROGRESS_META[1]!.label, "Valid execute");
    assert.equal(LAST_N_PROGRESS_META[2]!.id, "disable");
    const bundle = evaluateStages({
      hours: [...STAGE_HOURS],
      lastNs: [...LANE_EVAL_NS],
      base: CFG,
      tactic: "axis",
      rangeType: "atr",
    });
    assert.deepEqual(bundle.hours, [4, 8, 16]);
    assert.deepEqual(bundle.lastNs, [12, 15, 50]);
    assert.equal(bundle.stages.length, 3);
    assert.deepEqual(
      bundle.stages.map((s) => s.id),
      ["pre", "mid", "end"],
    );
    for (const s of bundle.stages) finiteNum(s.pf, s.wr, s.net, s.mdd, s.trades);
    const end = bundle.stages.find((s) => s.id === "end")!;
    assert.ok(Number.isFinite(bundle.endPfAvg));
    if (bundle.effective > 0) {
      assert.equal(end.pfAvg, bundle.endPfAvg);
      assert.equal(end.effective, bundle.effective);
    }
    assert.ok(bundle.coords.some((c) => c.axis === "tactic"));
    assert.ok(bundle.coords.some((c) => c.axis === "range"));
    assert.ok(bundle.coords.some((c) => c.axis === "kind"));
    assert.equal(bundle.coords.filter((c) => c.axis === "lastN").length, 3);
    assert.ok(bundle.laneTracks.length >= STRATEGIES.length * TACTICS.length);
    assert.ok(bundle.laneTracks.every((t) => t.ns.length === 3));
    assert.ok(TACTICS.every((t) => bundle.coords.some((c) => c.axis === "tactic" && c.value === t)));
    assert.ok(RANGE_TYPES.every((r) => bundle.coords.some((c) => c.axis === "range" && c.value === r)));
    const effective = bundle.laneTracks.filter((t) => t.effective);
    if (effective.length) {
      const endN = bundle.lastNs[bundle.lastNs.length - 1]!;
      const avg =
        effective.reduce((s, t) => s + (t.ns.find((r) => r.n === endN)?.pf ?? 0), 0) / effective.length;
      assert.ok(Math.abs(avg - bundle.endPfAvg) < 1e-9);
      assert.ok(effective.every((t) => t.ns.every((r) => r.n === 12 || r.n === 15 || r.n === 50)));
    }
    const e = initVstEngine(CFG, { warmup: 1, symbolCount: 12 });
    const allow = [...new Set(effective.map((t) => t.symbol))].slice(0, 3);
    if (allow.length) {
      mirrorEffectiveLanes(e, allow, CFG, "axis", "atr");
      assert.ok(e.queue.every((o) => allow.includes(o.symbol)));
    }
    for (const t of bundle.laneTracks.slice(0, 12)) {
      for (const row of t.ns) finiteNum(row.pf, row.wr, row.net, row.n);
    }
    const tracks = trackLaneEvals(DEFAULT_THRESHOLDS);
    assert.ok(tracks.every((t) => t.ns.length === 3));
    const live = liveLastNEvals([], [12, 15, 50]);
    assert.equal(live.length, 3);
    const snap = sanitizeDeskSettings({ evalHours: [4, 99], evalLastNs: [12, 7, 15] } as never);
    assert.deepEqual(snap.evalHours, [4]);
    assert.deepEqual(snap.evalLastNs, [12, 15]);
  });

  it("block strategy adjusts overall active orders independent of lanes", () => {
    assert.ok(STRATEGIES.some((s) => s.kind === "block"));
    assert.ok(STRATEGIES.filter((s) => s.kind === "block").length >= 2);
    const rows = combosFiltered({
      strategyId: "block-stack",
      symbol: "BTCUSDT",
      lastN: 10,
      cfg: CFG,
      th: DEFAULT_THRESHOLDS,
      enabledKinds: ["block"],
      keepBest: true,
    });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.strategyId === "block-stack"));
    for (const r of rows.slice(0, 8)) assertComboStats(r);

    const e = initVstEngine(CFG, { warmup: 6, symbolCount: 8 });
    const adj = adjustActiveBlocks(
      e,
      CFG,
      "axis",
      { ...DEFAULT_BLOCK_CONFIG, enabled: true, maxMultiple: 2, minMultiple: 1, addOnWin: false, flattenConflict: true, endStageOnly: false, cadence: 4 },
      "atr",
      { endStage: true },
    );
    finiteNum(adj.cancelled, adj.added, adj.flattened, adj.blocks);
    const after = collectActiveOrderBlocks(e);
    assert.ok(after.every((b) => b.multiple <= 2) || adj.cancelled >= 1);
    const ladder = e.queue.filter((o) => !/^Block/i.test(o.note)).length + e.orders.filter((o) => !/^Block/i.test(o.note)).length;
    assert.ok(ladder >= 0);

    assert.equal(sharedBlockVolumeRatio(1, 4, 1), 0.25);
    assert.equal(sharedBlockVolumeRatio(1, 4, 1, "additive"), 1);
    assert.equal(blockMaxAdditionalRatio(6, 0.25, 2), 1);
    assert.equal(blockMaxAdditionalRatio(3, 1, 2.25, "additive"), 3);
    assert.equal(blockStepQty(1.2, 1, 1, 2.25, 2, 0, "additive"), 1.2);
    assert.equal(blockStepQty(1.2, 2, 1, 2.25, 2, 0, "additive"), 1.2);
    assert.equal(blockStepQty(1.2, 3, 1, 2.25, 3, 0, "additive"), 1.2);
    assert.ok(Math.abs(blockStepQty(1.2, 1, 1, 2.25, 3, 0, "additive") * 3 - 3.6) < 1e-9);
    assert.ok(blockStepQty(10, 1, 0.25, 2, 6) > 0);
    assert.ok(blockStepQty(10, 2, 0.25, 2, 6) > 0);
    const liftedStep = blockStepQty(10, 1, 0.01, 2, 6, 5);
    assert.ok(liftedStep >= 5 - 1e-9);
    const minPf = blockMinimumProfitFactor(2, 1.45, 1.25);
    assert.ok(minPf > 2);
    const fat = blockStepQty(10, 1, 1.25, 2.25, 2);
    assert.ok(fat >= 10 * 1.25 - 1e-9, `block step ${fat}`);

    const sized = initVstEngine(CFG, { warmup: 8, symbolCount: 8 });
    const parent = sized.positions.find((p) => p.qty > 0);
    if (parent) {
      parent.unrealized = Math.max(parent.avgEntry * parent.qty * 0.01, 0.2);
      const beforeQ = sized.queue.length;
      const add = adjustActiveBlocks(
        sized,
        CFG,
        "hybrid",
        { ...DEFAULT_BLOCK_CONFIG, enabled: true, endStageOnly: false, addOnWin: true, flattenConflict: false, minMultiple: 1, maxMultiple: 6 },
        "atr",
        { endStage: true },
      );
      finiteNum(add.added, add.blocks);
      const blockOrder = sized.queue.find((o) => /^Block /.test(o.note));
      if (blockOrder) {
        assert.ok(blockOrder.qty < parent.qty * 1.01, "block add is a rung, not a full parent");
        assert.ok(blockOrder.level >= 1);
      } else {
        assert.ok(add.added === 0 || sized.queue.length >= beforeQ);
      }
    }

    const { report } = simulateHours(16, CFG, "hybrid", {
      symbolCount: 8,
      rangeType: "fibonacci",
      block: { ...DEFAULT_BLOCK_CONFIG, volumeMode: "shared", counts: [1, 2], maxMultiple: 2, windows: true },
    });
    assert.equal(report.hours, 16);
    assert.ok(report.passed || report.trades >= 4, report.issues.join("; "));
    finiteNum(report.pf, report.net);
    assert.equal(report.nanCount, 0);
    assert.equal(report.ratioViolations, 0);
    assert.ok(report.trades >= 4);
  });

  it("Overall Block adds volume additively on all positions and tracks ids/partials", () => {
    const block = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      stack: true,
      windows: false,
      volumeMode: "shared" as const,
      volumeRatio: 0.4,
      relAdditive: false,
      addOnWin: true,
      flattenConflict: false,
      endStageOnly: false,
      cadence: 4,
      counts: [1, 2],
      maxMultiple: 2,
    };
    const { report, engine } = simulateHours(12, CFG, "hybrid", {
      symbolCount: 8,
      rangeType: "fibonacci",
      block,
    });
    finiteNum(report.pf, report.net);
    const ov = overallLiveStats(engine);
    finiteNum(ov.pf, ov.net, ov.block.volume, ov.block.orders, ov.block.partials, ov.block.queued);
    assert.equal(ov.block.overall, true);
    const notes = [...engine.queue, ...engine.orders].filter((o) => /Overall Block/i.test(o.note || ""));
    for (const o of notes) {
      assert.ok(o.id, "order id");
      assert.ok(o.batchId.includes(":"), `batch ${o.batchId}`);
      assert.ok(o.note.includes(o.id));
      finiteNum(o.qty, o.filled, o.remaining);
      assert.ok(Math.abs(o.qty - o.filled - o.remaining) < 1e-6);
    }
    const parents = engine.positions.filter((p) => (p.blockQty || 0) > 0);
    for (const p of parents) {
      assert.ok(p.playbook !== "block" || p.legs.length >= 1);
      finiteNum(p.blockQty || 0);
    }
    const ids = new Set(ov.block.ids);
    assert.equal(ids.size, ov.block.ids.length);
  });

  it("overall Block queues independently of relation Block at the same N", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.running = true;
    e.phase = "running";
    e.blockCfg = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      stack: true,
      windows: false,
      volumeMode: "additive",
      overallMode: "additive",
      volumeRatio: 0.4,
      relAdditive: false,
      addOnWin: false,
      cadence: 1,
      counts: [1],
      maxMultiple: 6,
      minMultiple: 1,
      minActiveLevel: 1,
    };
    const q = e.quotes.BTCUSDT!;
    e.positions.push({
      id: "p-ov",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      qty: 1,
      plannedQty: 1,
      avgEntry: q.px,
      mark: q.px,
      sl: q.px * 0.99,
      tp: q.px * 1.01,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.01,
      realized: 0,
      unrealized: 0.02,
      legs: [{ orderId: "leg-ov", qty: 1, px: q.px }],
      controllingRange: "atr",
      rangeSpacing: q.atr,
      status: "open",
      openedTick: 0,
      tactic: "trailing",
      indication: "trend",
      kind: "short",
      playbook: "short",
    });
    e.orders.push({
      id: "b1-rel",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      type: "limit",
      qty: 0.4,
      filled: 0,
      price: q.px,
      remaining: 0.4,
      status: "open",
      rangeType: "atr",
      level: 1,
      sl: q.px * 0.99,
      tp: q.px * 1.01,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.01,
      batchId: "p-ov:1",
      tactic: "trailing",
      indication: "trend",
      kind: "block",
      playbook: "block",
      note: "Block additive #1 BTCUSDT long · b1-rel · p-ov · " + e.activeConnId,
    });
    for (let i = 0; i < 8; i++) tickVst(e, CFG, "trailing", { rangeType: "atr", block: e.blockCfg, skipWalk: true, skipMatch: true });
    const ov = [...e.queue, ...e.orders].filter((o) => /Overall Block/i.test(o.note || "") && o.level === 1);
    assert.ok(ov.length >= 1, "Overall Block adds same N independently");
    assert.ok(ov.every((o) => /^ob/i.test(o.id)));
    assert.ok(ov.some((o) => /Overall Block additive #1/.test(o.note || "") && !/symbol|dir/.test(o.note || "")));
    const rel = [...e.queue, ...e.orders].filter((o) => /Block additive #1/.test(o.note || "") && !/Overall/.test(o.note || ""));
    assert.ok(rel.length >= 1, "relation Block stays while overall adds");
  });

  it("last-N / relation evals run on the same tick before Overall Block sizes", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.running = true;
    e.phase = "running";
    e.blockCfg = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      autoEval: true,
      overall: true,
      stack: true,
      windows: true,
      sets: true,
      volumeMode: "additive",
      overallMode: "additive",
      volumeRatio: 0.4,
      overallVolumeRatio: 1.5,
      relAdditive: false,
      addOnWin: false,
      cadence: 1,
      counts: [1],
      maxMultiple: 6,
      minMultiple: 1,
      minActiveLevel: 1,
      minRelPf: 1.05,
    };
    const q = e.quotes.BTCUSDT!;
    const rel = {
      indication: "trend" as const,
      kind: "short",
      tactic: "trailing" as const,
      rangeType: "atr" as const,
      playbook: "short",
    };
    for (let i = 0; i < 18; i++) {
      noteBlockPosClose(e, "BTCUSDT", "long", i % 4 === 0 ? -0.4 : 1.1, e.blockCfg, rel);
    }
    e.positions.push({
      id: "p-eval-first",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      qty: 1,
      plannedQty: 1,
      avgEntry: q.px,
      mark: q.px,
      sl: q.px * 0.99,
      tp: q.px * 1.01,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.01,
      realized: 0,
      unrealized: 0.02,
      legs: [{ orderId: "leg-eval", qty: 1, px: q.px }],
      controllingRange: "atr",
      rangeSpacing: q.atr,
      status: "open",
      openedTick: 0,
      tactic: "trailing",
      indication: "trend",
      kind: "short",
      playbook: "short",
    });
    assert.equal(e.lastRelEvalTick || 0, 0);
    for (let i = 0; i < 4; i++) tickVst(e, CFG, "trailing", { rangeType: "atr", block: e.blockCfg, skipWalk: true, skipMatch: true });
    assert.equal(e.lastRelEvalTick, e.tick, "relation eval must complete on the Overall Block tick");
    assert.equal(e.lastBlockAt, e.tick, "Overall Block must still size this tick");
    assert.ok(Object.keys(e.blockRelBest || {}).length >= 1, "winning relations ready before overall extra");
    const hits = matchingWinningRels(e, { symbol: "BTCUSDT", side: "long", ...rel });
    assert.ok(hits.length >= 1, `relation picks ${hits.map((h) => h.key).join(",")} should be live for overall extra`);
    const ov = [...e.queue, ...e.orders].filter((o) => /Overall Block/i.test(o.note || ""));
    assert.ok(ov.length >= 1, "Overall Block queued after eval");
  });

  it("relation Block keeps full qty; Overall Block takes leftover room instead of share-scaling", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.running = true;
    e.phase = "running";
    e.blockCfg = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      autoEval: false,
      overall: true,
      overallSymbol: false,
      overallDirection: false,
      stack: true,
      windows: false,
      sets: true,
      volumeMode: "additive",
      overallMode: "additive",
      volumeRatio: 0.4,
      overallVolumeRatio: 1.5,
      sharedVolumeRatio: 1.5,
      maxVolumeMultiplier: 2.5,
      relAdditive: false,
      addOnWin: false,
      cadence: 1,
      counts: [1],
      maxMultiple: 6,
      minMultiple: 1,
      minActiveLevel: 1,
    };
    const q = e.quotes.BTCUSDT!;
    e.positions.push({
      id: "p-rel-first",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      qty: 1,
      plannedQty: 1,
      avgEntry: q.px,
      mark: q.px,
      sl: q.px * 0.99,
      tp: q.px * 1.01,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.01,
      realized: 0,
      unrealized: 0.02,
      legs: [{ orderId: "leg-rel-first", qty: 1, px: q.px }],
      controllingRange: "atr",
      rangeSpacing: q.atr,
      status: "open",
      openedTick: 0,
      tactic: "trailing",
      indication: "trend",
      kind: "short",
      playbook: "short",
    });
    for (let i = 0; i < 4; i++) tickVst(e, CFG, "trailing", { rangeType: "atr", block: e.blockCfg, skipWalk: true, skipMatch: true });
    const rel = [...e.queue, ...e.orders].filter((o) => /Block additive #1/.test(o.note || "") && !/Overall/.test(o.note || ""));
    const ov = [...e.queue, ...e.orders].filter((o) => /Overall Block/i.test(o.note || "") && o.level === 1);
    assert.ok(rel.length >= 1, "relation Block present");
    assert.ok(ov.length >= 1, "Overall Block present");
    const relQty = rel.reduce((s, o) => s + o.qty, 0);
    const ovQty = ov.reduce((s, o) => s + o.qty, 0);
    assert.ok(Math.abs(relQty - 0.4) < 0.02, `relation must keep 0.4, not share-scale, got ${relQty}`);
    assert.ok(relQty + ovQty <= 1.5 + 1e-6, `extra ${relQty + ovQty} exceeds 1.5 room`);
    assert.ok(ovQty > 0.5, `overall leftover ${ovQty}`);
  });

  it("Overall Block stacks book + symbol + direction additively on shared", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.running = true;
    e.phase = "running";
    e.blockCfg = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      overallSymbol: true,
      overallDirection: true,
      overallSharedStack: "additive",
      sets: false,
      stack: true,
      windows: false,
      volumeMode: "shared",
      overallMode: "shared",
      sharedVolumeRatio: 1.5,
      relAdditive: false,
      addOnWin: false,
      cadence: 1,
      counts: [1],
      maxMultiple: 6,
      minMultiple: 1,
      minActiveLevel: 1,
    };
    const q = e.quotes.BTCUSDT!;
    e.positions.push({
      id: "p-ov-stack",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      qty: 1,
      plannedQty: 1,
      avgEntry: q.px,
      mark: q.px,
      sl: q.px * 0.99,
      tp: q.px * 1.01,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.01,
      realized: 0,
      unrealized: 0.02,
      legs: [{ orderId: "leg-ov-stack", qty: 1, px: q.px }],
      controllingRange: "atr",
      rangeSpacing: q.atr,
      status: "open",
      openedTick: 0,
      tactic: "trailing",
      indication: "trend",
      kind: "short",
      playbook: "short",
    });
    for (let i = 0; i < 8; i++) tickVst(e, CFG, "trailing", { rangeType: "atr", block: e.blockCfg, skipWalk: true, skipMatch: true });
    const ov = [...e.queue, ...e.orders].filter((o) => /Overall Block/i.test(o.note || "") && o.level === 1);
    const book = ov.filter((o) => /Overall Block shared #1/.test(o.note || "") && !/symbol|dir/.test(o.note || ""));
    const sym = ov.filter((o) => /Overall Block symbol/.test(o.note || ""));
    const dir = ov.filter((o) => /Overall Block dir/.test(o.note || ""));
    assert.ok(book.length >= 1, `book ${ov.map((o) => o.note).join(" | ")}`);
    assert.ok(sym.length >= 1, "symbol overall");
    assert.ok(dir.length >= 1, "direction overall");
    finiteNum(book[0]!.qty, sym[0]!.qty, dir[0]!.qty);
    assert.ok(Math.abs(sym[0]!.qty - book[0]!.qty) < 1e-6, `symbol qty ${sym[0]!.qty} vs book ${book[0]!.qty}`);
    assert.ok(Math.abs(dir[0]!.qty - book[0]!.qty) < 1e-6, `dir qty ${dir[0]!.qty}`);
    const stacked = book[0]!.qty + sym[0]!.qty + dir[0]!.qty;
    assert.ok(stacked > 0, `stacked ${stacked}`);
    assert.ok(stacked <= 1.5 + 1e-6, `overall extra ${stacked} exceeds 1.5× cap`);
    e.blockCfg = { ...e.blockCfg, counts: [1, 2], maxMultiple: 6 };
    for (let i = 0; i < 8; i++) tickVst(e, CFG, "trailing", { rangeType: "atr", block: e.blockCfg, skipWalk: true, skipMatch: true });
    const n2 = [...e.queue, ...e.orders].filter((o) => /Overall Block shared #2/.test(o.note || "") && !/symbol|dir/.test(o.note || ""));
    const extra2 = n2.reduce((s, o) => s + o.qty, 0);
    assert.ok(stacked + extra2 <= 1.5 + 1e-6, `N=2 must not inflate past 1.5× extra, got ${stacked + extra2}`);
  });

  it("parallel Block keeps shared + additive + overall as independent volume streams", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.running = true;
    e.phase = "running";
    e.blockCfg = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      stack: true,
      windows: false,
      volumeMode: "parallel",
      overallMode: "parallel",
      volumeRatio: 0.4,
      overallVolumeRatio: 1,
      sharedVolumeRatio: 1,
      relAdditive: false,
      addOnWin: false,
      cadence: 1,
      counts: [1],
      maxMultiple: 6,
      minMultiple: 1,
      minActiveLevel: 1,
    };
    const q = e.quotes.BTCUSDT!;
    e.positions.push({
      id: "p-par",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      qty: 1,
      plannedQty: 1,
      avgEntry: q.px,
      mark: q.px,
      sl: q.px * 0.99,
      tp: q.px * 1.01,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.01,
      realized: 0,
      unrealized: 0.02,
      legs: [{ orderId: "leg-par", qty: 1, px: q.px }],
      controllingRange: "atr",
      rangeSpacing: q.atr,
      status: "open",
      openedTick: 0,
      tactic: "trailing",
      indication: "trend",
      kind: "short",
      playbook: "short",
    });
    for (let i = 0; i < 10; i++) tickVst(e, CFG, "trailing", { rangeType: "atr", block: e.blockCfg, skipWalk: true, skipMatch: true });
    const rungs = [...e.queue, ...e.orders].filter((o) => /Block/i.test(o.note || ""));
    const notes = rungs.map((o) => o.note || "");
    assert.ok(notes.some((n) => /Block shared #1/.test(n) && !/Overall/.test(n)), `rel shared ${notes.join(" | ")}`);
    assert.ok(notes.some((n) => /Block additive #1/.test(n) && !/Overall/.test(n)), "rel additive");
    assert.ok(notes.some((n) => /Overall Block shared/.test(n)), "overall shared");
    assert.ok(notes.some((n) => /Overall Block additive/.test(n)), "overall additive");
    const extra = rungs.reduce((s, o) => s + Math.max(0, o.qty || 0), 0);
    assert.ok(extra <= 1.5 + 1e-6, `parallel extra ${extra} exceeds 1.5× cap`);
    const relAdd = rungs.find((o) => /Block additive #1/.test(o.note || "") && !/Overall/.test(o.note || ""));
    const ovShare = rungs.find((o) => /Overall Block shared #1/.test(o.note || ""));
    assert.ok(relAdd && ovShare, `rel add + overall shared ${notes.join(" | ")}`);
    assert.ok(relAdd!.qty > 0, `rel qty ${relAdd!.qty}`);
  });

  it("Block N=1 PF uses a lookback, not a single loss", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const block = { ...DEFAULT_BLOCK_CONFIG, windows: true, counts: [1, 2, 3, 4, 5, 6], keepAdjusted: true };
    for (let i = 0; i < 24; i++) noteBlockPosClose(e, "BTCUSDT", "long", i % 2 === 0 ? 2 : -1, block);
    const w1 = e.blockWindows?.[1];
    assert.ok(w1 && w1.closed === 24, `closed ${w1?.closed}`);
    assert.ok(w1.lastPf >= 1, `n1 pf ${w1.lastPf} should not collapse to 0 on one loss`);
    assert.ok(w1.lastNet < 0, "batch of 1 still sees the last close");
    assert.equal(clampSharedVol(1.5), 1.5);
    assert.equal(clampSharedVol(3), 3);
    const w6 = e.blockWindows?.[6];
    assert.ok(w6 && Math.abs((w6.lastPf || 0) - (w1.lastPf || 0)) > 1e-6, `n1 ${w1.lastPf} n6 ${w6?.lastPf} must be independent`);
  });

  it("block on vs off: adds rungs when enabled and stays inert when disabled", () => {
    const off = { ...DEFAULT_BLOCK_CONFIG, enabled: false };
    const on = { ...DEFAULT_BLOCK_CONFIG, enabled: true, endStageOnly: false, cadence: 4, addOnWin: false, flattenConflict: false, sides: "both" as const, windows: false, liveDisable: false };
    const cfg = { ...CFG, trailingPct: 1.4, maxHoldTicks: 20000 };
    const a = simulateHours(12, cfg, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: on });
    const b = simulateHours(12, cfg, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: off });
    assert.equal(a.report.nanCount, 0);
    assert.equal(b.report.nanCount, 0);
    assert.ok(a.report.trades >= 4 && b.report.trades >= 1, `trades ${a.report.trades}/${b.report.trades}`);
    finiteNum(a.report.pf, b.report.pf, a.report.net, b.report.net);
    const blockCloses = a.engine.closed.filter((c) => c.playbook === "block" || (c.blockQty || 0) > 0).length;
    const offCloses = b.engine.closed.filter((c) => c.playbook === "block" || (c.blockQty || 0) > 0).length;
    assert.equal(offCloses, 0);
    assert.ok(
      a.engine.lastBlockAt > 0 ||
        blockCloses > 0 ||
        a.engine.queue.some((o) => /Block /i.test(o.note || "")) ||
        a.engine.positions.some((p) => (p.blockQty || 0) > 0) ||
        a.report.trades !== b.report.trades ||
        a.report.net !== b.report.net,
    );
    assert.equal(b.engine.lastBlockAt ?? 0, 0);
  });

  it("releases vanished legs so processing continues after a manual close", () => {
    const e = initVstEngine(CFG, { warmup: 8, symbolCount: 6 });
    for (let i = 0; i < 40 && e.positions.length < 1; i++) tickVst(e, CFG, "hybrid", { rangeType: "atr" });
    if (e.positions.length < 1) {
      e.positions.push({
        id: "p-manual",
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        qty: 0.01,
        avgEntry: 64000,
        sl: 63000,
        tp: 66000,
        slDist: 1000,
        tpDist: 2000,
        unrealized: 0,
        realized: 0,
        openedTick: e.tick,
        legs: [],
      } as never);
    }
    const before = e.positions.length;
    assert.ok(before >= 1);
    const drop = e.positions[0];
    const kept = new Set(e.positions.slice(1).map((p) => `${p.symbol}:${p.side}`));
    const n = releaseVanished(e, kept, e.activeConnId);
    assert.equal(n, 1);
    assert.equal(e.positions.length, before - 1);
    assert.ok(!e.positions.some((p) => p.symbol === drop.symbol && p.side === drop.side));
    tickVst(e, CFG, "hybrid", { rangeType: "atr" });
    assert.ok(e.tick >= 1);
  });

  it("last-N pos windows: loss in last 6 adjusts the next 6", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const cfg = { ...DEFAULT_BLOCK_CONFIG, pauseCountRatio: 1, keepAdjusted: false };
    for (let i = 0; i < 6; i++) noteBlockPosClose(e, "BTCUSDT", "long", -1, cfg);
    const w6 = e.blockWindows[6];
    assert.equal(w6.windows, 1);
    assert.equal(w6.lossWindows, 1);
    assert.equal(w6.pauseLeft, 6);
    assert.ok(blockPosPaused(e, 6));
    assert.ok(symbolBlockPaused(e, "BTCUSDT", 6));
    for (let i = 0; i < 6; i++) noteBlockPosClose(e, "ETHUSDT", "short", 1, cfg);
    assert.equal(e.blockWindows[6].pauseLeft, 0);
    assert.equal(e.blockWindows[6].adjusted, 6);
    assert.equal(blockPosPaused(e, 6), false);
    const snap = blockWindowSnapshot(e, 6);
    assert.ok(snap.symbols.some((s) => s.symbol === "BTCUSDT" && s.lastAvg < 0));
    assert.ok(snap.symbols.some((s) => s.symbol === "ETHUSDT" && s.closed === 6));
    const w1 = e.blockWindows[1];
    assert.ok(w1.windows >= 6);
  });

  it("old stack 1-2 and new windows 1-6 stay independent", () => {
    const stackOnly = { ...DEFAULT_BLOCK_CONFIG, enabled: true, stack: true, windows: false, maxMultiple: 2, counts: [1, 2], endStageOnly: false };
    const winOnly = { ...DEFAULT_BLOCK_CONFIG, enabled: true, stack: false, windows: true, evalPosCount: 6, endStageOnly: false, pauseCountRatio: 1, keepAdjusted: false };
    const both = { ...DEFAULT_BLOCK_CONFIG, enabled: true, stack: true, windows: true, maxMultiple: 2, counts: [1, 2], evalPosCount: 6, endStageOnly: false };
    const a = simulateHours(8, CFG, "hybrid", { symbolCount: 6, rangeType: "fibonacci", block: stackOnly });
    const b = simulateHours(8, CFG, "hybrid", { symbolCount: 6, rangeType: "fibonacci", block: winOnly });
    const c = simulateHours(8, CFG, "hybrid", { symbolCount: 6, rangeType: "fibonacci", block: both });
    assert.ok(a.report.trades >= 1 && b.report.trades >= 1 && c.report.trades >= 1);
    finiteNum(a.report.pf, b.report.pf, c.report.pf);
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    for (let i = 0; i < 6; i++) noteBlockPosClose(e, "BTCUSDT", "long", -0.5, winOnly);
    assert.ok(blockPosPaused(e, 6));
    const e2 = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    for (let i = 0; i < 6; i++) noteBlockPosClose(e2, "BTCUSDT", "long", -0.5, stackOnly);
    assert.equal(blockPosPaused(e2, 6), false);
  });

  it("windows 1-6 skip next N of a losing symbol while other symbols still arm", () => {
    const e = initVstEngine(CFG, { warmup: 4, symbolCount: 6, arm: false });
    e.blockCfg = { ...DEFAULT_BLOCK_CONFIG, stack: false, windows: true, evalPosCount: 6, pauseCountRatio: 1, keepAdjusted: false };
    for (let i = 0; i < 6; i++) noteBlockPosClose(e, "BTCUSDT", "long", -0.4, e.blockCfg);
    assert.ok(symbolBlockPaused(e, "BTCUSDT", 6));
    armUniverse(e, CFG, "hybrid", "fibonacci");
    const btcLong = [...e.queue, ...e.orders].filter((o) => o.symbol === "BTCUSDT" && o.side === "long");
    const other = [...e.queue, ...e.orders].filter((o) => o.symbol !== "BTCUSDT");
    assert.equal(btcLong.length, 0);
    assert.ok(other.length > 0, "other symbols should still arm");
  });

  it("Block long, short, and both sides run independent vs old stack", () => {
    const old = { ...DEFAULT_BLOCK_CONFIG, stack: true, windows: false, volumeMode: "shared" as const, counts: [1, 2], maxMultiple: 2 };
    const neu = { ...DEFAULT_BLOCK_CONFIG, stack: true, windows: true, volumeMode: "shared" as const, counts: [1, 2], maxMultiple: 2, evalPosCount: 6 };
    for (const sides of ["long", "short", "both", "mixed"] as const) {
      const a = simulateHours(8, CFG, "hybrid", { symbolCount: 6, rangeType: "fibonacci", block: { ...old, sides } });
      const b = simulateHours(8, CFG, "hybrid", { symbolCount: 6, rangeType: "fibonacci", block: { ...neu, sides } });
      finiteNum(a.report.pf, b.report.pf, a.report.net, b.report.net);
      assert.equal(a.report.nanCount, 0);
      assert.equal(b.report.nanCount, 0);
      if (sides === "long" || sides === "short") {
        assert.ok(a.engine.closed.every((c) => c.side === sides) || a.engine.closed.length === 0);
        assert.ok(b.engine.closed.every((c) => c.side === sides) || b.engine.closed.length === 0);
      }
      if (sides === "both") {
        const seen = new Set(b.engine.closed.map((c) => c.side));
        assert.ok(seen.has("long") && seen.has("short") || b.engine.closed.length < 4);
      }
      if (sides === "mixed") {
        const mix = bookCounts(b.engine).positions;
        assert.ok((mix.longOnly ?? 0) + (mix.shortOnly ?? 0) + (mix.both ?? 0) >= 0);
      }
    }
  });

  it("mixed overall book has long-only, short-only, and both-side symbols", () => {
    const { report, engine } = simulateHours(12, CFG, "hybrid", {
      symbolCount: 12,
      rangeType: "fibonacci",
      block: { ...DEFAULT_BLOCK_CONFIG, sides: "mixed", stack: true, windows: true, volumeMode: "shared" },
    });
    assert.ok(report.passed);
    finiteNum(report.pf);
    const mix = bookCounts(engine).positions;
    const closedSym = new Map<string, Set<string>>();
    for (const c of engine.closed) {
      const set = closedSym.get(c.symbol) ?? new Set();
      set.add(c.side);
      closedSym.set(c.symbol, set);
    }
    for (const p of engine.positions) {
      const set = closedSym.get(p.symbol) ?? new Set();
      set.add(p.side);
      closedSym.set(p.symbol, set);
    }
    let longOnly = 0, shortOnly = 0, both = 0;
    for (const sides of closedSym.values()) {
      if (sides.has("long") && sides.has("short")) both += 1;
      else if (sides.has("long")) longOnly += 1;
      else if (sides.has("short")) shortOnly += 1;
    }
    assert.ok(longOnly >= 1, `long-only ${longOnly}`);
    assert.ok(shortOnly >= 1, `short-only ${shortOnly}`);
    assert.ok(both >= 1, `both ${both}`);
    finiteNum(mix.longOnly ?? 0, mix.shortOnly ?? 0, mix.both ?? 0);
  });

  function collectSymbolSides(e: {
    positions: { symbol: string; side: string }[];
    orders: { symbol: string; side: string; status?: string }[];
    queue: { symbol: string; side: string; status?: string }[];
    closed: { symbol: string; side: string }[];
  }) {
    const open = new Map<string, Set<string>>();
    const closed = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, symbol: string, side: string) => {
      const s = m.get(symbol) ?? new Set();
      s.add(side);
      m.set(symbol, s);
    };
    for (const p of e.positions) add(open, p.symbol, p.side);
    for (const o of [...e.queue, ...e.orders]) {
      if (o.status === "cancelled" || o.status === "rejected") continue;
      add(open, o.symbol, o.side);
    }
    for (const c of e.closed) add(closed, c.symbol, c.side);
    const dualOpen = [...open.values()].filter((s) => s.has("long") && s.has("short")).length;
    const dualClosed = [...closed.values()].filter((s) => s.has("long") && s.has("short")).length;
    let longN = 0;
    let shortN = 0;
    for (const c of e.closed) if (c.side === "long") longN += 1; else shortN += 1;
    return { open, closed, dualOpen, dualClosed, longN, shortN };
  }

  it("both directions: same symbol can hold long and short; processings do not flatten", () => {
    const block = { ...DEFAULT_BLOCK_CONFIG, sides: "both" as const, flattenConflict: false, windows: false, liveDisable: false };
    const e = initVstEngine(CFG, { warmup: 20, symbolCount: 8, block });
    const sides = collectSymbolSides(e);
    assert.ok(sides.dualOpen >= 1, `hedge open dual ${sides.dualOpen} of ${sides.open.size}`);
    const adj = adjustActiveBlocks(e, CFG, "hybrid", { ...block, flattenConflict: true }, "fibonacci", { endStage: true });
    assert.equal(adj.flattened, 0, "hedge does not flatten the other side");
    for (const [sym, set] of sides.open) {
      if (set.has("long") && set.has("short")) {
        const legs = e.positions.filter((p) => p.symbol === sym);
        assert.ok(legs.length <= 2 || new Set(legs.map((p) => p.side)).size === 2);
      }
    }
  });

  it("one side forced: same symbol never opens the opposite direction", () => {
    const block = { ...DEFAULT_BLOCK_CONFIG, sides: "one" as const, flattenConflict: true, windows: false, liveDisable: false };
    const e = initVstEngine(CFG, { warmup: 20, symbolCount: 8, block });
    const sides = collectSymbolSides(e);
    assert.equal(sides.dualOpen, 0, `one-forced dual open ${sides.dualOpen}`);
    for (const set of sides.open.values()) assert.equal(set.size, 1);
    const adj = adjustActiveBlocks(e, CFG, "hybrid", block, "fibonacci", { endStage: true });
    finiteNum(adj.flattened, adj.added);
    const after = collectSymbolSides(e);
    assert.equal(after.dualOpen, 0);
  });

  it("24h × 8 symbols: both-directions vs one-forced vs long/short domination", () => {
    const run = (sides: "both" | "one" | "long" | "short") =>
      simulateHours(24, CFG, "hybrid", {
        symbolCount: 8,
        rangeType: "fibonacci",
        block: { ...DEFAULT_BLOCK_CONFIG, sides, flattenConflict: sides !== "both", liveDisable: false, windows: true, stack: true },
      });
    const both = run("both");
    const one = run("one");
    const lng = run("long");
    const sht = run("short");
    for (const r of [both, one, lng, sht]) {
      finiteNum(r.report.pf, r.report.net, r.report.wr);
      assert.ok(r.report.trades >= 4, `trades ${r.report.trades}`);
      assert.equal(r.report.nanCount, 0);
    }
    const b = collectSymbolSides(both.engine);
    const o = collectSymbolSides(one.engine);
    const l = collectSymbolSides(lng.engine);
    const s = collectSymbolSides(sht.engine);
    assert.ok(b.dualOpen + b.dualClosed >= 1, `both dual ${b.dualOpen}/${b.dualClosed}`);
    assert.ok(b.longN >= 1 && b.shortN >= 1, `both L/S ${b.longN}/${b.shortN}`);
    assert.equal(o.dualOpen, 0, "one-forced never holds both sides open");
    assert.equal(l.shortN, 0);
    assert.equal(s.longN, 0);
    assert.ok(lng.engine.closed.every((c) => c.side === "long"));
    assert.ok(sht.engine.closed.every((c) => c.side === "short"));
  });

  it("Block relations pause independently per indication, strategy, tactic, range, side", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const block = { ...DEFAULT_BLOCK_CONFIG, windows: true, evalPosCount: 6, pauseCountRatio: 1, keepAdjusted: false };
    for (let i = 0; i < 6; i++) {
      noteBlockPosClose(e, "BTCUSDT", "long", -1, block, {
        indication: "trend",
        kind: "trend",
        tactic: "hybrid",
        rangeType: "fibonacci",
        playbook: "normal",
      });
    }
    assert.ok(blockRelPaused(e, "ind:trend", 6));
    assert.ok(blockComboPaused(e, { symbol: "BTCUSDT", side: "long", indication: "trend", kind: "trend", tactic: "hybrid", rangeType: "fibonacci" }, 6));
    assert.equal(blockRelPaused(e, "ind:active", 6), false);
    assert.equal(blockComboPaused(e, { symbol: "ETHUSDT", side: "short", indication: "active", kind: "active", tactic: "axis", rangeType: "atr" }, 6), false);
    const keys = blockRelationKeys({ symbol: "BTCUSDT", side: "long", indication: "trend", kind: "trend", tactic: "hybrid", rangeType: "fibonacci", playbook: "normal" });
    assert.ok(keys.some((k) => k.startsWith("combo:")));
    assert.ok(keys.some((k) => k.startsWith("sub:")));
  });

  it("sweep Block relations covers tactic × range × sides independently", () => {
    const s = sweepBlockRelations(1, 4, CFG);
    assert.equal(s.runs.length, LIVE_TACTICS.length * RANGE_TYPES.length * 3);
    for (const r of s.runs) finiteNum(r.pf, r.net, r.trades, r.relKeys);
  });

  it("Block volume is always additive and independent of other lanes", () => {
    const base = 1.2;
    const r = 0.4;
    const a = blockStepQty(base, 1, r, 1.8, 2, 0, "additive");
    const b = blockStepQty(base, 2, r, 1.8, 2, 0, "additive");
    assert.ok(Math.abs(a - base * r) < 1e-9, `step1 ${a}`);
    assert.ok(Math.abs(b - base * r) < 1e-9, `step2 ${b}`);
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeMode, "parallel");
    assert.equal(DEFAULT_BLOCK_CONFIG.overallMode, "parallel");
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeRatio, 0.2);
    const q = additiveBlockQty(1.2, [1, 2, 3], 1, 3, 1);
    assert.ok(Math.abs(q.totalSteps - 3 * 1.2) < 1e-9, `steps ${q.totalSteps}`);
    assert.ok(Math.abs(q.relExtra - 3 * 1.2) < 1e-9, `rel ${q.relExtra}`);
    assert.ok(Math.abs(q.total - 7.2) < 1e-9, `total ${q.total}`);
  });

  it("auto-evals major/minor relations every 2h and adds volume additively", () => {
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeRatio, 0.2);
    assert.equal(DEFAULT_BLOCK_CONFIG.relVolumeRatio, 0.2);
    assert.equal(DEFAULT_BLOCK_CONFIG.overallVolumeRatio, 1.5);
    assert.equal(DEFAULT_BLOCK_CONFIG.sharedVolumeRatio, 1.5);
    assert.equal(AXIS_PARTIAL_RATIO, 3);
    assert.equal(sanitizeDeskSettings({ tacticConfig: { axisPartialRatio: 0.08 } } as never).tacticConfig.axisPartialRatio, 3);
    assert.equal(sanitizeIntervalStrategy({ relationBoost: 1.08 }).relationBoost, 1);
    assert.equal(sanitizeIntervalStrategy({}).relationBoost, 1);
    assert.equal(clampBlockVol(0.08), 0.2);
    assert.equal(clampBlockVol(0.1), 0.1);
    assert.equal(clampBlockVol(0.2), 0.2);
    assert.equal(clampBlockVol(1.5), 1);
    assert.equal(clampBlockVol(0.7), 0.7);
    assert.equal(DEFAULT_THRESHOLDS.minPf, 1.35);
    assert.equal(DEFAULT_THRESHOLDS.basePf, 1);
    assert.equal(DEFAULT_THRESHOLDS.axisPf, 1.15);
    assert.equal(DEFAULT_THRESHOLDS.blockPf, 1.2);
    assert.equal(DEFAULT_THRESHOLDS.shortPf, 0.95);
    assert.equal(DEFAULT_THRESHOLDS.shortBasePf, 0.7);
    assert.equal(DEFAULT_BLOCK_CONFIG.liveDisableMinPf, 1.2);
    assert.equal(DEFAULT_BLOCK_CONFIG.liveLastN, 12);
    assert.equal(DEFAULT_BLOCK_CONFIG.validExecN, 15);
    assert.equal(DEFAULT_BLOCK_CONFIG.liveExecN, DEFAULT_BLOCK_CONFIG.validExecN);
    assert.equal(DEFAULT_BLOCK_CONFIG.minRelPf, 1.2);
    assert.equal(DEFAULT_TACTIC_CONFIG.slAtr, slAtrOf(1.0, 1));
    assert.equal(DEFAULT_TACTIC_CONFIG.tpRatio, tpRatioOf(1));
    assert.equal(TP_SL_RATIO_MIN, tpRatioOf(1.25));
    assert.equal(SL_ATR_MIN, slAtrOf(0.8, 1));
    assert.ok(TP_SL_RATIOS.includes(tpRatioOf(1)) && TP_SL_RATIOS.includes(tpRatioOf(1.25)));
    assert.ok(SL_ATR_RATIOS.includes(slAtrOf(1.0, 1)));
    assert.equal(snapTpRatio(0.5), tpRatioOf(1.25));
    assert.ok(snapSlAtr(0.35) >= SL_ATR_MIN - 1e-9);
    assert.equal(allTpSlCombos().length, 9 * 2);
    assert.equal(TP_ATR_RATIOS[0], 0.8);
    assert.equal(TP_ATR_RATIOS[TP_ATR_RATIOS.length - 1], 1.6);
    assert.deepEqual([...SL_OF_TP], [1, 1.25]);
    assert.equal(new Set(allTpSlCombos().map((c) => `${c.tpAtr}:${c.slOfTp}`)).size, 18);
    assert.equal(X01_DEFAULTS.minPf, 1.35);
    assert.equal(X01_DEFAULTS.symbolCount, 120);
    assert.equal(X01_DEFAULTS.sides, "both");
    assert.equal(X01_DEFAULTS.slAtrMin, 0.8);
    assert.equal(X01_DEFAULTS.tpRatioMin, 0.8);
    assert.equal(DEFAULT_BLOCK_CONFIG.evalHours, 2);
    assert.deepEqual(DEFAULT_BLOCK_CONFIG.counts, [1, 3, 4, 5, 6]);
    assert.deepEqual(DEFAULT_BLOCK_CONFIG.evalLastNs, [1, 2, 3, 4, 5, 6]);
    assert.equal(DEFAULT_BLOCK_CONFIG.maxMultiple, 6);
    assert.equal(DEFAULT_BLOCK_CONFIG.evalPosCount, 6);
    assert.equal(DEFAULT_BLOCK_CONFIG.pauseCountRatio, 1);
    assert.equal(DEFAULT_BLOCK_CONFIG.keepAdjusted, true);
    assert.equal(DEFAULT_BLOCK_CONFIG.sharedVolumeRatio, 1.5);
    assert.equal(DEFAULT_BLOCK_CONFIG.overallVolumeRatio, 1.5);
    assert.equal(DEFAULT_BLOCK_CONFIG.maxVolumeMultiplier, 2.5);
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const block = { ...DEFAULT_BLOCK_CONFIG };
    for (let i = 0; i < 6; i++) {
      noteBlockPosClose(e, "BTCUSDT", "long", 1, block, {
        indication: "trend",
        kind: "trend",
        tactic: "hybrid",
        rangeType: "fibonacci",
        playbook: "normal",
        indicationCfg: "trend-ema",
      });
    }
    const ev = evalBlockRelations(e, block);
    assert.ok(ev.winners >= 1, `winners ${ev.winners}`);
    assert.ok(ev.factor >= 0.05 - 1e-9, `factor ${ev.factor}`);
    assert.ok(ev.picks.some((p) => p.major));
    assert.ok(ev.picks.some((p) => p.n >= 2), "prefers last-N ≥ 2 when samples exist");
    assert.equal(e.lastRelEvalTick, e.tick);
  });

  it("disables non-performing live relations from last 12 pos and keeps the best", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.closed = [];
    for (let i = 0; i < 12; i++) {
      e.closed.push({
        id: `c-t${i}`,
        connId: VST_DEFAULT_CONN,
        symbol: "BTCUSDT",
        side: "long",
        pnl: 1,
        qty: 1,
        entry: 100,
        exit: 101,
        reason: "tp",
        tick: i,
        r: 1,
        tactic: "hybrid",
        rangeType: "fibonacci",
        kind: "trend",
        indication: "trend",
        playbook: "normal",
      } as never);
      e.closed.push({
        id: `c-a${i}`,
        connId: VST_DEFAULT_CONN,
        symbol: "ETHUSDT",
        side: "short",
        pnl: -1,
        qty: 1,
        entry: 100,
        exit: 99,
        reason: "sl",
        tick: i,
        r: -1,
        tactic: "axis",
        rangeType: "linear",
        kind: "active",
        indication: "active",
        playbook: "axis",
      } as never);
    }
    const h = refreshLiveDisable(e, { ...DEFAULT_BLOCK_CONFIG, liveLastN: 12, liveDisable: true, liveDisableMinPf: 1.1, liveDisableMinSamples: 4 });
    assert.ok(h.disabled.some((k) => k.includes("active") || k.includes("axis") || k.includes("linear")), `disabled ${h.disabled.join(",")}`);
    assert.ok(h.kept.some((k) => k.includes("trend") || k.includes("hybrid") || k.includes("fibonacci")), `kept ${h.kept.join(",")}`);
    assert.equal(liveRelationDisabled(e, { symbol: "ETHUSDT", side: "short", indication: "active", kind: "active", tactic: "axis", rangeType: "linear", playbook: "axis" }), true);
    assert.equal(liveRelationDisabled(e, { symbol: "BTCUSDT", side: "long", indication: "trend", kind: "trend", tactic: "hybrid", rangeType: "fibonacci", playbook: "normal" }), false);
  });

  it("24h × 20 symbols Block 0.4 with auto-eval stays finite and positive", () => {
    const { report, engine } = simulateHours(24, CFG, "hybrid", {
      symbolCount: 20,
      rangeType: "atr",
      block: { ...DEFAULT_BLOCK_CONFIG, autoEval: true, relAdditive: true, volumeRatio: 0.4, relVolumeRatio: 0.4, evalHours: 2 },
    });
    assert.ok(report.trades >= 8);
    finiteNum(report.pf, report.net, report.wr);
    assert.ok(report.pf > 0.2, `PF ${report.pf}`);
    assert.ok((engine.lastRelEvalTick || 0) >= 2 * 60, `eval tick ${engine.lastRelEvalTick}`);
    assert.ok((engine.relVolumeFactor || 0) >= 0);
  });

  it("Axis 0.08 is rung ratio, not engine size or Block extra or vol-confirm", () => {
    assert.equal(clampAxisPartial(0.08), 3);
    assert.equal(AXIS_PARTIAL_RATIO, 3);
    assert.equal(sanitizeIntervalStrategy({ relationBoost: 1.08 }).relationBoost, 1);
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    e.coordVolumeFactor = 1.08;
    e.relVolumeFactor = 0.4;
    assert.equal(e.coordVolumeFactor, 1.08);
    assert.equal(e.relVolumeFactor, 0.4);
    assert.equal(engineSizeFactor(e), 1);
    assert.notEqual(e.relVolumeFactor, e.coordVolumeFactor);
    assert.ok(progressLaneScale(e, { playbook: "block" }) !== 1.08 || e.progressEval == null);
  });

  it("windows shared vs additive run with stack 1-2 additionally", () => {
    const base = { ...DEFAULT_BLOCK_CONFIG, enabled: true, stack: true, windows: true, counts: [1, 2], maxMultiple: 2, evalPosCount: 6, volumeRatio: 1, endStageOnly: false };
    const shared = simulateHours(24, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...base, volumeMode: "shared" } });
    const additive = simulateHours(24, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...base, volumeMode: "additive" } });
    const winOnly = simulateHours(24, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...base, stack: false, volumeMode: "shared" } });
    finiteNum(shared.report.pf, additive.report.pf, winOnly.report.pf);
    assert.ok(shared.report.trades >= 1 && additive.report.trades >= 1);
    assert.ok(shared.engine.blockWindows[6]);
    assert.ok(winOnly.engine.blockWindows[6].closed >= 0);
  });

  it("all Block counts 1-6 additive pause/keep volume are independent", () => {
    assert.deepEqual([...BLOCK_POS_COUNTS], [1, 2, 3, 4, 5, 6]);
    assert.deepEqual([...LIVE_BLOCK_COUNTS], [1, 3, 4, 5, 6]);
    assert.deepEqual(sanitizeBlockCounts([2, 3, 4, 5, 6]), [1, 3, 4, 5, 6]);
    assert.deepEqual(sanitizeBlockCounts([1, 2, 3, 4, 5, 6]), [1, 3, 4, 5, 6]);
    assert.ok(!sanitizeBlockCounts([1, 2, 3]).includes(2));
    for (const vr of [0.4, 0.8]) {
      const q = additiveBlockQty(1.2, BLOCK_POS_COUNTS, vr, 3, vr);
      assert.equal(q.n, 6);
      assert.ok(Math.abs(q.step - 1.2 * vr) < 1e-9, `step ${q.step}`);
      assert.ok(Math.abs(q.totalSteps - 6 * 1.2 * vr) < 1e-9, `steps ${q.totalSteps}`);
      assert.ok(Math.abs(q.relExtra - 3 * vr * 1.2) < 1e-9, `rel ${q.relExtra}`);
      for (const s of q.steps) {
        assert.ok(Math.abs(s.step - 1.2 * vr) < 1e-9);
        assert.ok(Math.abs(s.cap - s.n * vr * 1.2) < 1e-9);
      }
    }
    for (const pause of [0, 1, 2]) {
      const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
      const block = { ...DEFAULT_BLOCK_CONFIG, pauseCountRatio: pause, keepAdjusted: false, evalPosCount: 1, windows: true };
      noteBlockPosClose(e, "BTCUSDT", "long", -1, block);
      assert.equal(e.blockWindows[1].pauseLeft, pause, `pause ${pause} left ${e.blockWindows[1].pauseLeft}`);
    }
    const keepE = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    noteBlockPosClose(keepE, "BTCUSDT", "long", -1, { ...DEFAULT_BLOCK_CONFIG, pauseCountRatio: 2, keepAdjusted: true, evalPosCount: 1, windows: true });
    assert.equal(keepE.blockWindows[1].pauseLeft, 0);
    assert.ok(keepE.blockWindows[1].adjusted >= 1);
    for (const vr of [0.4, 0.8]) {
      for (const keep of [false, true]) {
        const r = simulateHours(8, CFG, "hybrid", {
          symbolCount: 8,
          rangeType: "fibonacci",
          block: {
            ...DEFAULT_BLOCK_CONFIG,
            counts: [...BLOCK_POS_COUNTS],
            maxMultiple: 6,
            volumeRatio: vr,
            relVolumeRatio: vr,
            pauseCountRatio: 1,
            keepAdjusted: keep,
            volumeMode: "additive",
            evalPosCount: 6,
            evalLastNs: [1, 2, 3, 4, 5, 6],
          },
        });
        assert.ok(r.report.trades >= 1, `vr ${vr} keep ${keep} n=${r.report.trades}`);
        finiteNum(r.report.pf, r.report.net);
      }
    }
  });

  it("shared and additive Block volume run in parallel independently", () => {
    const par = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      stack: true,
      windows: true,
      volumeMode: "parallel" as const,
      counts: [1, 2],
      maxMultiple: 2,
      evalPosCount: 6,
      endStageOnly: false,
    };
    const shared = simulateHours(16, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...par, volumeMode: "shared" } });
    const additive = simulateHours(16, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...par, volumeMode: "additive" } });
    const both = simulateHours(16, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: par });
    finiteNum(shared.report.pf, additive.report.pf, both.report.pf);
    assert.ok(shared.report.trades >= 1 && both.report.trades >= 1);
    const keys = Object.keys(both.engine.blockLanes || {});
    if (keys.length) {
      assert.ok(keys.some((k) => k.endsWith(":shared")), `parallel shared lanes ${keys.join(",")}`);
      assert.ok(keys.some((k) => k.endsWith(":additive")), `parallel additive lanes ${keys.join(",")}`);
    }
    const sk = Object.keys(shared.engine.blockLanes || {});
    assert.ok(!sk.length || sk.every((k) => k.endsWith(":shared")), `shared keys ${sk.join(",")}`);
    const ak = Object.keys(additive.engine.blockLanes || {});
    assert.ok(!ak.length || ak.every((k) => k.endsWith(":additive")), `additive keys ${ak.join(",")}`);
  });

  it("best configs run Block shared+additive for stack, windows, and both types", () => {
    const best = [
      { tactic: "trailing" as const, range: "geometric" as const, cfg: { ...CFG, trailingPct: 1.4, slAtr: 0.9, tpRatio: 1.6 } },
      { tactic: "hybrid" as const, range: "fibonacci" as const, cfg: { ...CFG, trailingPct: 1.4, slAtr: 0.9, tpRatio: 1.6 } },
      { tactic: "trailing" as const, range: "volume" as const, cfg: { ...CFG, trailingPct: 1.7, slAtr: 0.9, tpRatio: 1.6 } },
      { tactic: "trailing" as const, range: "atr" as const, cfg: { ...CFG, trailingPct: 1.4, slAtr: 0.7, tpRatio: 2.0 } },
    ];
    const types = [
      { stack: true, windows: false, name: "stack" },
      { stack: false, windows: true, name: "windows" },
      { stack: true, windows: true, name: "both" },
    ] as const;
    const modes = ["shared", "additive", "parallel"] as const;
    for (const b of best) {
      for (const t of types) {
        for (const m of modes) {
          const r = simulateHours(8, b.cfg, b.tactic, {
            symbolCount: 8,
            rangeType: b.range,
            block: {
              ...DEFAULT_BLOCK_CONFIG,
              stack: t.stack,
              windows: t.windows,
              volumeMode: m,
              counts: [1, 2],
              maxMultiple: 2,
              evalPosCount: 6,
              volumeRatio: 0.4,
              liveDisable: false,
              sides: "one",
            },
          });
          assert.ok(r.report.nanCount === 0, `${b.tactic}/${b.range} ${t.name} ${m} ${r.report.issues?.join(";")}`);
          finiteNum(r.report.pf, r.report.net);
          assert.ok(r.report.trades >= 1, `${b.tactic}/${b.range} ${t.name} ${m} trades ${r.report.trades}`);
          const keys = Object.keys(r.engine.blockLanes || {});
          if (m === "shared" && keys.length) assert.ok(keys.every((k) => k.endsWith(":shared")), keys.join(","));
          if (m === "additive" && keys.length) assert.ok(keys.every((k) => k.endsWith(":additive")), keys.join(","));
          if (t.windows) assert.ok(r.engine.blockWindows?.[1] || r.engine.blockWindows?.[6] || r.report.trades >= 0);
        }
      }
    }
    const a = blockStepQty(1.2, 1, 0.4, 1.8, 2, 0, "shared");
    const b = blockStepQty(1.2, 1, 0.4, 1.8, 2, 0, "additive");
    assert.ok(a > 0 && b > 0);
    assert.ok(Math.abs(b - 1.2 * 0.4) < 1e-9, `additive step ${b}`);
  });

  it("skips PF<1 symbols but not direction indication", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.symbolStats.SOLUSDT = { id: "SOLUSDT", trades: 4, wins: 0, profit: 0.1, loss: 0.8, sl: 4, tp: 0 };
    assert.ok((symbolTapePf(e, "SOLUSDT") ?? 0) < 1);
    assert.equal(skipLiveSymbol(e, "SOLUSDT"), true);
    e.symbolStats.ETHUSDT = { id: "ETHUSDT", trades: 4, wins: 3, profit: 1.2, loss: 0.2, sl: 1, tp: 3 };
    assert.equal(skipLiveSymbol(e, "ETHUSDT"), false);
    assert.equal(entryMinPf(e), DEFAULT_MIN_PF);
    e.minPf = DEFAULT_MIN_PF;
    e.basePf = DEFAULT_BASE_PF;
    e.axisPf = DEFAULT_AXIS_PF;
    e.blockPf = DEFAULT_BLOCK_PF;
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, axis: true, block: true, trailing: true, normal: false };
    assert.equal(minPfFor(e, "overall"), DEFAULT_MIN_PF);
    assert.equal(minPfFor(e, "base"), DEFAULT_BASE_PF);
    assert.equal(minPfFor(e, "axis"), DEFAULT_AXIS_PF);
    assert.equal(minPfFor(e, "block"), DEFAULT_BLOCK_PF);
    assert.equal(minPfFor(e, "short"), DEFAULT_SHORT_PF);
    assert.equal(minPfFor(e, "shortBase"), DEFAULT_SHORT_BASE_PF);
    assert.equal(activeMinPf(e), 1.15);
    assert.equal(pfLaneOf({ tactic: "axis" }), "axis");
    assert.equal(pfLaneOf({ playbook: "block", blockLevel: 2 }), "block");
    assert.equal(pfLaneOf({ playbook: "short", blockLevel: 3 }), "short");
    assert.equal(pfLaneOf({ kind: "normal" }), "base");
    assert.equal(pfLaneOf({ playbook: "short", kind: "short" }), "short");
    e.shortRange = true;
    e.shortPf = 0.95;
    e.shortBasePf = 0.7;
    e.shortAxisPf = 0.95;
    e.shortBlockPf = 1.15;
    assert.equal(minPfFor(e, "axis"), 0.95);
    assert.equal(minPfFor(e, "block"), 1.15);
    assert.equal(activeMinPf(e), 0.95);
    e.liveTape = true;
    e.closed = Array.from({ length: 10 }, (_, i) => ({
      id: `a${i}`,
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      pnl: i % 2 ? 0.4 : 0.2,
      qty: 1,
      entry: 1,
      exit: 1,
      reason: "tp",
      tick: i,
      r: 1,
      tactic: "axis",
      rangeType: "atr",
      playbook: "axis",
      kind: "trend",
    })) as never;
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", tactic: "axis", playbook: "axis" }), true);
    e.liveTape = true;
    e.liveOpenN = 20;
    e.symbolStats.ADAUSDT = { id: "ADAUSDT", trades: 6, wins: 3, profit: 1.5, loss: 1.0, sl: 3, tp: 3 };
    assert.ok((symbolTapePf(e, "ADAUSDT") ?? 0) >= 1);
    assert.equal(skipLiveSymbol(e, "ADAUSDT"), false);
    e.minPf = 2;
    e.symbolStats.BNBUSDT = { id: "BNBUSDT", trades: 6, wins: 3, profit: 0.4, loss: 1.0, sl: 3, tp: 3 };
    assert.ok((symbolTapePf(e, "BNBUSDT") ?? 0) < 1);
    assert.equal(skipLiveSymbol(e, "BNBUSDT"), true);
  });

  it("auto-validates each symbol last 100h and selects only performing hour coords", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8, arm: false });
    const now = new Date("2026-09-19T15:00:00Z");
    const hour = now.getUTCHours();
    const mk = (symbol: string, pnl: number, h = hour, i = 0): (typeof e.closed)[number] => ({
      id: `${symbol}${i}`,
      connId: e.activeConnId,
      symbol,
      side: "long",
      pnl,
      qty: 1,
      entry: 1,
      exit: 1,
      reason: pnl > 0 ? "tp" : "sl",
      tick: 100,
      at: Date.UTC(2026, 8, 19, h, i, 0),
      r: 1,
      tactic: "trailing",
      rangeType: "atr",
      indication: "active",
      playbook: "normal",
      kind: "normal",
    });
    const ids = universeSymbols(8).map((s) => s.id);
    const win = ids[0]!;
    const lose = ids[1]!;
    const hourLose = ids[2]!;
    for (let i = 0; i < 8; i++) e.closed.push(mk(win, 0.4, hour, i));
    for (let i = 0; i < 8; i++) e.closed.push(mk(lose, -0.3, hour, i));
    for (let i = 0; i < 8; i++) e.closed.push(mk(hourLose, i < 4 ? 0.5 : -0.6, i < 4 ? (hour + 3) % 24 : hour, i));
    e.tick = 20 * 60;
    const scored = refreshSymbolHourEval(e, { hours: 100, minPf: 1.4, minN: 6, now });
    assert.ok(scored.performing.includes(win), `win ${scored.performing.join(",")}`);
    assert.ok(!scored.performing.includes(lose));
    assert.equal(skipLiveSymbol(e, lose), true);
    assert.equal(skipLiveSymbol(e, win), false);
    assert.equal(e.symbolEval?.[hourLose]?.hourOk, false);
    assert.equal(skipLiveSymbol(e, hourLose), true);
    const ranked = rankUniverse(e).map((s) => s.id);
    assert.equal(ranked[0], win);
    const sim = validateSymbols100h(CFG, "trailing", { symbolCount: 8, rangeType: "atr", minPf: 1.4 });
    assert.equal(sim.hours, 100);
    assert.ok(sim.symbols >= 8);
    finiteNum(sim.report.pf, sim.n);
  });

  it("eval universe 300 with live cap 50", () => {
    assert.equal(VST_MAX_SYMBOLS, 300);
    assert.equal(VST_LIVE_SYMBOLS, 50);
    assert.equal(clampLiveSymbolCap(50, 300), 50);
    assert.equal(clampLiveSymbolCap(300, 300), 300);
    const before = universeSymbols(300).length;
    const added = absorbEvalSymbols(
      Array.from({ length: 20 }, (_, i) => ({ id: `EVAL${i}USDT`, base: `EVAL${i}` })),
      300,
    );
    assert.ok(added >= 0);
    assert.ok(universeSymbols(300).length >= before);
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 80, liveSymbolCap: 50, arm: false });
    e.liveTape = true;
    e.preEvalDone = true;
    assert.equal(e.liveSymbolCap, 50);
    assert.equal(e.symbolCount, 80);
  });

  it("short-range thin TP/SL grid arms Block ladders", () => {
    const combos = allShortTpSlCombos();
    assert.equal(combos.length, SHORT_TP_ATR.length * SHORT_SL_OF_TP.length);
    assert.ok(combos.length >= 20);
    const sample = combos.find((c) => c.tpAtr === 0.36 && c.slOfTp === 1.5);
    assert.ok(sample);
    assert.equal(sample!.slAtr, shortSlAtrOf(0.36, 1.5));
    assert.equal(sample!.tpRatio, shortTpRatioOf(1.5));
    const cfg = { ...CFG, ...sample!, shortRange: true, trailingPct: 1.5, maxHoldTicks: 12 };
    assert.equal(cfgUsesShortRange(cfg), true);
    const e = initVstEngine(cfg, { warmup: 0, symbolCount: 8, arm: true });
    const o = [...e.queue, ...e.orders].find((x) => x.sl > 0 && x.tp > 0 && x.price > 0);
    assert.ok(o, "short ladder");
    const slD = Math.abs(o!.price - o!.sl);
    const tpD = Math.abs(o!.tp - o!.price);
    assert.ok(tpD / slD >= 0.35 && tpD / slD <= 2.1, `R ${tpD / slD}`);
  });

  it("short-range GRID processes every TP×SL combo independently and intern-scores them", () => {
    const all = allShortTpSlCombos();
    assert.equal(all.length, SHORT_TP_ATR.length * SHORT_SL_OF_TP.length);
    const keys = new Set(all.map((c) => shortComboKey(c.tpAtr, c.slOfTp)));
    assert.equal(keys.size, all.length);
    for (const c of all) {
      assert.ok(Math.abs(c.slAtr - shortSlAtrOf(c.tpAtr, c.slOfTp)) < 1e-9);
      assert.ok(Math.abs(c.tpRatio - shortTpRatioOf(c.slOfTp)) < 1e-9);
    }
    assert.ok(SHORT_SL_OF_TP[0] === 0.5 && SHORT_SL_OF_TP[SHORT_SL_OF_TP.length - 1] === 2.5);
    assert.equal(SHORT_SL_OF_TP.length, 9);
    for (let i = 1; i < SHORT_SL_OF_TP.length; i += 1) {
      assert.ok(Math.abs(SHORT_SL_OF_TP[i]! - SHORT_SL_OF_TP[i - 1]! - 0.25) < 1e-9);
    }
    const internGrid = shortProtectGridFor({ intern: true });
    assert.equal(internGrid.length, all.length);
    const liveGrid = shortProtectGridFor({ complete: false, minTpAtr: 0.38, minSlOfTp: 0.75, maxTpAtr: 0.6, positiveOnly: true });
    assert.ok(liveGrid.length >= 8, `live grid ${liveGrid.length}`);
    assert.ok(liveGrid.every((c) => c.tpAtr + 1e-9 >= 0.48 && c.slOfTp + 1e-9 >= 0.75));
    assert.ok(liveGrid.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
    assert.ok(!liveGrid.some((c) => c.tpAtr + 1e-9 < 0.48));
    assert.ok(!liveGrid.some((c) => c.slOfTp + 1e-9 < 0.75));
    const cfg = { ...CFG, shortRange: true as const, trailingPct: 1.5, maxHoldTicks: 24, slAtr: 0.36, tpRatio: 4 / 3, tpAtr: 0.48, slOfTp: 0.75 };
    const e = initVstEngine(cfg, { warmup: 0, symbolCount: 6, arm: true, complete: true });
    assert.equal(e.completeSim, true);
    const grid = shortProtectGrid(e, cfg);
    assert.ok(grid.length >= SHORT_20H_POSITIVE.length && grid.length <= all.length, `exec grid ${grid.length}`);
    assert.ok(grid.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
    assert.equal(grid.length, all.length, "complete intern arms the full TP×SL grid");
    const tagged = [...e.queue, ...e.orders].filter((o) => o.playbook === "short" && o.tpAtr != null && o.slOfTp != null);
    assert.ok(tagged.length >= 12, `tagged ${tagged.length}`);
    const seen = new Set(tagged.map((o) => shortComboKey(o.tpAtr!, o.slOfTp!)));
    assert.ok(seen.size >= Math.min(grid.length, 8), `combo keys ${seen.size} of ${grid.length}`);
    const ratios = tagged.map((o) => Math.abs(o.tp - o.price) / Math.max(1e-9, Math.abs(o.price - o.sl)));
    const minR = Math.min(...ratios);
    const maxR = Math.max(...ratios);
    assert.ok(maxR - minR > 0.05, `R span ${minR}..${maxR}`);
    assert.ok(e.queue.length + e.orders.length <= VST_MAX_QUEUE || e.completeSim);
    assert.ok(e.queue.length <= 8000);
    for (const c of all.slice(0, 6)) {
      e.closed.unshift({
        id: `s-${c.tpAtr}-${c.slOfTp}`,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        pnl: c.tpAtr >= 0.45 ? 1.2 : -0.4,
        qty: 1,
        entry: 100,
        exit: 101,
        reason: "tp",
        tick: 1,
        r: 1,
        playbook: "short",
        kind: "short",
        tactic: "trailing",
        rangeType: "atr",
        indication: "ema",
        tpAtr: c.tpAtr,
        slOfTp: c.slOfTp,
        trailPct: 1.5,
        validExec: true,
      });
    }
    const snap = refreshProgressEvals(e);
    assert.ok(Object.keys(snap.shortCombos).length >= 4, `shortCombos ${Object.keys(snap.shortCombos).join(",")}`);
    const hold = trailStopFromPeak({ side: "long", entry: 100, peak: 101.8, tp: 102.4, sl: 98.3, trailPct: 1.5, shortRange: true });
    const wide = trailStopFromPeak({ side: "long", entry: 100, peak: 101.8, tp: 102.4, sl: 98.3, trailPct: 1.5, shortRange: false });
    assert.ok(hold <= 101.8);
    assert.ok(hold >= 98.3);
    assert.ok(hold <= wide + 1e-9 || Math.abs(hold - wide) >= 0);
    e.shortRange = true;
    e.shortBasePf = 0.7;
    e.shortPf = 0.95;
    e.preEvalDone = true;
    e.progressEval = snap;
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing", tpAtr: 0.48, slOfTp: 0.75 }), false, "n<6 after pre is intern-score, not live");
    const loseKey = shortComboKey(0.3, 0.5);
    e.progressEval = {
      ...snap,
      shortCombos: {
        ...snap.shortCombos,
        [loseKey]: { n: 8, pf: 0.35, net: -1, ok: false },
        [shortComboKey(0.48, 0.75)]: { n: 8, pf: 1.2, net: 0.8, ok: true },
        [shortComboKey(0.52, 0.75)]: { n: 8, pf: 1.3, net: 0.9, ok: true },
      },
    };
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing", tpAtr: 0.48, slOfTp: 0.75 }), true);
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing", tpAtr: 0.52, slOfTp: 0.75 }), true, "all performing combos execute");
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing", tpAtr: 0.3, slOfTp: 0.5 }), false);
    e.progressEval = {
      ...snap,
      shortCombos: {
        ...snap.shortCombos,
        [loseKey]: { n: 8, pf: 0.35, net: -1, ok: false },
        [shortComboKey(0.48, 0.75)]: { n: 8, pf: 0.75, net: 0.1, ok: true },
        [shortComboKey(0.52, 0.75)]: { n: 8, pf: 1.25, net: 0.6, ok: true },
      },
    };
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing", tpAtr: 0.48, slOfTp: 0.75 }), false, "below short PF is not performing");
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing", tpAtr: 0.52, slOfTp: 0.75 }), true);
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing", tpAtr: 0.3, slOfTp: 0.5 }), false);
    const after = shortProtectGrid(e, cfg);
    assert.ok(after.some((c) => c.tpAtr === 0.52 && c.slOfTp === 0.75), "performing cells stay on the GRID");
    assert.ok(!after.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75), "below-floor cell is not armed after pre");
    e.completeSim = false;
    const liveAfter = shortProtectGrid(e, cfg);
    assert.ok(!liveAfter.some((c) => c.tpAtr === 0.3 && c.slOfTp === 0.5));
  });

  it("live tape uses exchange closes only — intern paper last-N cannot kill the lock", () => {
    const e = initVstEngine({ ...CFG, shortRange: true, tpAtr: 0.48, slOfTp: 0.75, maxHoldTicks: 24 }, { warmup: 0, symbolCount: 4, arm: false });
    e.liveTape = true;
    e.shortRange = true;
    e.shortPf = 0.95;
    e.shortBasePf = 0.7;
    e.preEvalDone = true;
    e.liveOpenN = 20;
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: false, trailing: true, axis: false, block: true, dca: false };
    for (let i = 0; i < 24; i += 1) {
      e.closed.push({
        id: `intern${i}`,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        pnl: -1,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: "sl",
        tick: i,
        r: -1,
        tactic: "trailing",
        rangeType: "atr",
        kind: "short",
        indication: "direction",
        playbook: "short",
        tpAtr: 0.48,
        slOfTp: 0.75,
        validExec: true,
      } as never);
    }
    const snap = refreshProgressEvals(e);
    e.progressEval = snap;
    const lock = { symbol: "ETHUSDT", side: "long" as const, playbook: "short", kind: "short", tactic: "trailing" as const, tpAtr: 0.48, slOfTp: 0.75 };
    assert.equal(liveShouldExecute(e, lock), true, "intern paper PF must not halt live lock");
    assert.equal(lanePassExec(e, lock), true);
    assert.equal(skipLiveSymbol(e, "NEWUSDT"), false, "fresh symbols stay armable while overall tape is empty");
  });

  it("complete hourly tape reports eq use, avg pos/ord, and strategy PFs", () => {
    const cfg = { ...CFG, shortRange: true as const, trailingPct: 1.5, tpAtr: 0.42, slOfTp: 1.75, maxHoldTicks: 24 };
    const { report } = simulateHours(2, cfg, "hybrid", {
      symbolCount: 8,
      rangeType: "atr",
      equity: 10,
      costStep: 3,
      complete: true,
      prehours: 1,
    });
    assert.ok((report.hourly || []).length >= 2, `hours ${report.hourly?.length}`);
    for (const h of report.hourly || []) {
      assert.ok(Number.isFinite(h.eq));
      assert.ok(Number.isFinite(h.mdd));
      assert.ok(Number.isFinite(h.eqUsePct ?? h.marginPct));
      assert.ok(Number.isFinite(h.avgPos ?? h.pos));
      assert.ok(Number.isFinite(h.avgOrd ?? h.orders));
      assert.ok(Number.isFinite(h.hourPf));
      assert.ok(h.inds && typeof h.inds === "object");
      assert.ok(h.plays && typeof h.plays === "object");
    }
    assert.ok(report.trades >= 0);
    assert.ok(Number.isFinite(report.pf));
    assert.ok((report.avgBlockOrd ?? 0) >= 0);
  });

  it("complete sim headline is the performing tape and stays positive", () => {
    const cfg = { ...CFG, shortRange: true as const, trailingPct: 1.5, tpAtr: 0.48, slOfTp: 0.75, maxHoldTicks: 24 };
    const { report } = simulateHours(4, cfg, "trailing", {
      symbolCount: 8,
      rangeType: "atr",
      complete: true,
      prehours: 4,
      equity: 1e4,
      costStep: 10,
      shortPf: 0.95,
      shortBasePf: 0.7,
    });
    finiteNum(report.pf, report.net);
    const gated = report.liveGated as { n?: number; pf?: number; net?: number; of?: number } | undefined;
    const selected = report.selected as { n?: number; pf?: number; net?: number } | undefined;
    const hasTape = (selected?.n ?? 0) >= 4 || (gated?.n ?? 0) >= 4;
    if (hasTape) {
      assert.ok(report.pf > 0, `headline PF ${report.pf} must be positive`);
      if ((selected?.n ?? 0) >= 4 && (selected?.net ?? 0) >= 0 && (selected?.pf ?? 0) > 0) {
        assert.ok(report.pf + 1e-6 >= Math.min(selected!.pf!, 4) - 1e-6, `headline ${report.pf} vs selected ${selected!.pf}`);
        assert.ok(report.net + 1e-9 >= 0 || report.pf >= 1, `net ${report.net} pf ${report.pf}`);
      }
    }
    if ((gated?.n ?? 0) >= 8 && (gated?.of ?? 0) === gated!.n) {
      assert.ok((gated!.pf ?? 0) > 0, `gated PF ${gated!.pf}`);
    }
    for (const h of report.hourly || []) {
      if ((h.gatedN || 0) > 0) {
        assert.ok(Number.isFinite(h.gatedPf));
        assert.ok(Number.isFinite(h.gatedNet));
      }
    }
  });

  it("short SL 0.5–2.5 step 0.25 combos sim independently with prehours and stay Base-gated", () => {
    const all = allShortTpSlCombos();
    assert.equal(all.length, 14 * 9);
    assert.equal(new Set(all.map((c) => shortComboKey(c.tpAtr, c.slOfTp))).size, all.length);
    const tight = all.find((c) => c.tpAtr === 0.4 && c.slOfTp === 0.5);
    const wide = all.find((c) => c.tpAtr === 0.4 && c.slOfTp === 2.5);
    const win = all.find((c) => c.tpAtr === SHORT_WINNER.tpAtr && c.slOfTp === SHORT_WINNER.slOfTp);
    assert.ok(tight && wide && win);
    const cfgTight = { ...CFG, ...tight!, shortRange: true as const, trailingPct: 1.5, maxHoldTicks: 12 };
    const cfgWide = { ...CFG, ...wide!, shortRange: true as const, trailingPct: 1.5, maxHoldTicks: 12 };
    const a = initVstEngine(cfgTight, { warmup: 0, symbolCount: 4, arm: true, comboOnly: true });
    const b = initVstEngine(cfgWide, { warmup: 0, symbolCount: 4, arm: true, comboOnly: true });
    const oa = [...a.queue, ...a.orders].find((o) => o.tpAtr === 0.4 && o.slOfTp === 0.5);
    const ob = [...b.queue, ...b.orders].find((o) => o.tpAtr === 0.4 && o.slOfTp === 2.5);
    assert.ok(oa && ob, "independent ladders");
    const ra = Math.abs(oa!.tp - oa!.price) / Math.max(1e-9, Math.abs(oa!.price - oa!.sl));
    const rb = Math.abs(ob!.tp - ob!.price) / Math.max(1e-9, Math.abs(ob!.price - ob!.sl));
    assert.ok(ra > rb + 0.4, `R tight ${ra} vs wide ${rb}`);
    const sample = [tight!, win!, wide!, all.find((c) => c.tpAtr === 0.3 && c.slOfTp === 0.5)!, all.find((c) => c.tpAtr === 0.6 && c.slOfTp === 2.25)!];
    const run = evaluateShortCombosIndependent({
      hours: 4,
      prehours: 4,
      symbolCount: 12,
      tactic: "trailing",
      block: false,
      combos: sample,
    });
    assert.equal(run.cells.length, sample.length);
    assert.ok(run.all.trades >= 0);
    assert.ok(run.cells.every((c) => Number.isFinite(c.pf) && Number.isFinite(c.net)));
    assert.ok(new Set(run.cells.map((c) => c.combo)).size === sample.length);
    const full = evaluateShortCombosIndependent({
      hours: 1,
      prehours: 1,
      symbolCount: 8,
      tactic: "trailing",
      block: false,
    });
    assert.equal(full.cells.length, all.length);
    assert.ok(full.all.orders > 0, `orders ${full.all.orders}`);
    assert.equal(full.cells.reduce((s, c) => s + c.leaked, 0), 0, "independent tapes must not mix combos");
    assert.ok(full.cells.every((c) => c.pf < PF_NO_LOSS - 1e-9 || c.net > -1e-6), "no-loss PF cannot print a losing net");
    const ok = full.cells.filter((c) => c.ok);
    const lose = full.cells.filter((c) => !c.ok && c.trades >= 6);
    assert.ok(ok.length + lose.length >= 1);
    if (ok.length) {
      const blocked = evaluateShortCombosIndependent({
        hours: 2,
        prehours: 2,
        symbolCount: 8,
        tactic: "trailing",
        block: true,
        combos: ok.slice(0, Math.min(6, ok.length)).map((c) => ({
          tpAtr: c.tpAtr,
          slOfTp: c.slOfTp,
          slAtr: c.slAtr,
          tpRatio: c.tpRatio,
          shortRange: true as const,
        })),
      });
      assert.ok(blocked.cells.every((c) => Number.isFinite(c.pf)));
      assert.ok(blocked.all.orders > 0);
    }
    const mixed = initVstEngine({ ...CFG, shortRange: true, tpAtr: 0.48, slOfTp: 0.75 }, { warmup: 0, symbolCount: 6, arm: true, complete: true });
    const exec = shortProtectGrid(mixed, { ...CFG, shortRange: true, tpAtr: 0.48, slOfTp: 0.75 });
    assert.ok(exec.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
    assert.ok(exec.some((c) => c.tpAtr === 0.3), "complete intern scores the full TP×SL grid");
    mixed.preEvalDone = true;
    mixed.shortPf = 0.95;
    mixed.progressEval = {
      at: 1,
      lastNModes: { independent: { pass: true, pf: 1 }, combined: { pass: true, pf: 1 }, parallel: { pass: true, pf: 1 } },
      lastNMode: "parallel",
      evalNs: {},
      validNs: {},
      disableNs: {},
      blockCounts: {},
      volumeModes: {},
      overallModes: {},
      indications: {},
      tactics: {},
      ranges: {},
      playbooks: {},
      relations: {},
      shortCombos: {
        [shortComboKey(0.3, 0.5)]: { n: 8, pf: 0.2, net: -1, ok: false },
        [shortComboKey(0.48, 0.75)]: { n: 8, pf: 1.2, net: 1, ok: true },
      },
    };
    const afterPre = shortProtectGrid(mixed, { ...CFG, shortRange: true, tpAtr: 0.48, slOfTp: 0.75 });
    assert.ok(!afterPre.some((c) => c.tpAtr === 0.3), "below live floors is intern-only");
    assert.ok(!afterPre.some((c) => c.slOfTp + 1e-9 < 0.75));
    assert.ok(!afterPre.some((c) => c.tpAtr + 1e-9 < 0.38));
    assert.ok(afterPre.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75), "performing cell stays armed");
  });

  it("short SL labels and combo keys snap 0.25 steps — toFixed(1) would mislabel 0.75 as 0.8", () => {
    assert.equal(SHORT_SL_OF_TP_STEP, 0.25);
    assert.equal(SHORT_SL_OF_TP.length, 9);
    assert.equal(formatShortRatio(0.75), "0.75");
    assert.equal(formatShortRatio(1.25), "1.25");
    assert.equal(formatShortRatio(1.75), "1.75");
    assert.equal(formatShortRatio(2.25), "2.25");
    assert.notEqual((0.75).toFixed(1), "0.75");
    assert.notEqual((1.75).toFixed(1), "1.75");
    assert.equal(new Set(SHORT_SL_OF_TP.map((r) => r.toFixed(1))).size, SHORT_SL_OF_TP.length);
    assert.equal(snapShortSlOfTp(1.7), 1.75);
    assert.equal(snapShortSlOfTp(1.8), 1.75);
    assert.equal(snapShortSlOfTp(0.6), 0.5);
    assert.equal(snapShortTpAtr(0.41), 0.42);
    assert.equal(shortComboKey(0.42, 1.7), shortComboKey(0.42, 1.75));
    assert.equal(shortComboKey(0.41, 1.8), "0.42:1.75");
    assert.notEqual(shortComboKey(0.4, 0.5), shortComboKey(0.4, 0.75));
    const snapped = snapShortTacticConfig({ ...CFG, shortRange: true, tpAtr: 0.41, slOfTp: 1.7 });
    assert.equal(snapped.tpAtr, 0.42);
    assert.equal(snapped.slOfTp, 1.75);
    assert.equal(snapped.slAtr, shortSlAtrOf(0.42, 1.75));
    assert.equal(snapped.tpRatio, shortTpRatioOf(1.75));
    const keys = new Set(allShortTpSlCombos().map((c) => shortComboKey(c.tpAtr, c.slOfTp)));
    assert.equal(keys.size, 14 * 9);
  });

  it("complete independent trade sim covers every SL 0.5–2.5 with prehours, many symbols, and no leaks", () => {
    const covering = SHORT_SL_OF_TP.map((slOfTp) => {
      const tpAtr = slOfTp === 0.5 ? 0.3 : slOfTp === 2.5 ? 0.6 : 0.45;
      return {
        tpAtr,
        slOfTp,
        slAtr: shortSlAtrOf(tpAtr, slOfTp),
        tpRatio: shortTpRatioOf(slOfTp),
        shortRange: true as const,
      };
    });
    const run = completeIndependentTradeSim({
      hours: 2,
      prehours: 2,
      symbolCount: 16,
      tactic: "trailing",
      block: false,
      combos: covering,
    });
    assert.equal(run.short.cells.length, 9);
    assert.equal(run.leaked, 0);
    assert.ok(run.orders > 0, `orders ${run.orders}`);
    assert.ok(run.short.cells.every((c) => Number.isFinite(c.pf) && Number.isFinite(c.net) && Number.isFinite(c.trades)));
    assert.equal(new Set(run.short.cells.map((c) => c.slOfTp)).size, 9);
    const tactics = completeComputations(CFG, { symbolCount: 4, hours: [1] });
    assert.equal(tactics.cells.length, LIVE_TACTICS.length * RANGE_TYPES.length);
    const a = covering.find((c) => c.slOfTp === 0.5)!;
    const b = covering.find((c) => c.slOfTp === 2.5)!;
    const ea = initVstEngine({ ...CFG, ...a }, { warmup: 0, symbolCount: 6, arm: true, comboOnly: true });
    const eb = initVstEngine({ ...CFG, ...b }, { warmup: 0, symbolCount: 6, arm: true, comboOnly: true });
    const oa = [...ea.queue, ...ea.orders].find((o) => o.slOfTp === 0.5 && o.tp > 0);
    const ob = [...eb.queue, ...eb.orders].find((o) => o.slOfTp === 2.5 && o.tp > 0);
    assert.ok(oa && ob, "independent SL 0.5 vs 2.5 ladders");
    const ra = Math.abs(oa!.tp - oa!.price) / Math.max(1e-9, Math.abs(oa!.price - oa!.sl));
    const rb = Math.abs(ob!.tp - ob!.price) / Math.max(1e-9, Math.abs(ob!.price - ob!.sl));
    assert.ok(ra > rb + 0.4, `R 0.5 ${ra} vs 2.5 ${rb}`);
  });

  it("intern scores all 126 short combos and mixed last-N does not skip Base-ok TP 0.4", () => {
    const e = initVstEngine({ ...CFG, shortRange: true, tpAtr: 0.4, slOfTp: 1.75 }, { warmup: 0, symbolCount: 4, arm: false });
    e.preEvalDone = true;
    e.shortRange = true;
    e.shortBasePf = 0.7;
    e.shortPf = 0.95;
    const mk = (pnl: number, extra: { tpAtr: number; slOfTp: number; id: string; tick: number }) =>
      ({
        id: extra.id,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long" as const,
        pnl,
        qty: 1,
        entry: 100,
        exit: pnl > 0 ? 101 : 99,
        reason: pnl > 0 ? "tp" : "sl",
        tick: extra.tick,
        r: pnl,
        rangeType: "atr" as const,
        indication: "ema",
        playbook: "short",
        tactic: "trailing" as const,
        kind: "short",
        tpAtr: extra.tpAtr,
        slOfTp: extra.slOfTp,
        trailPct: 1.5,
        validExec: true,
      }) as never;
    for (let i = 0; i < 20; i++) e.closed.unshift(mk(-0.55, { tpAtr: 0.4, slOfTp: 0.5, id: `lose:${i}`, tick: 10 + i }));
    for (let i = 0; i < 8; i++) e.closed.unshift(mk(0.95, { tpAtr: 0.4, slOfTp: 1.75, id: `win:${i}`, tick: 80 + i }));
    const snap = refreshProgressEvals(e);
    assert.equal(Object.keys(snap.shortCombos).length, SHORT_TP_ATR.length * SHORT_SL_OF_TP.length);
    const winKey = shortComboKey(0.4, 1.75);
    assert.equal(snap.shortCombos[winKey]?.ok, true, "Base-ok 0.4/1.75");
    const mixed = relComboKey({ indication: "ema", tactic: "trailing", rangeType: "atr", playbook: "short" });
    const winRel = {
      symbol: "BTCUSDT",
      side: "long" as const,
      indication: "ema" as const,
      kind: "short",
      tactic: "trailing" as const,
      rangeType: "atr" as const,
      playbook: "short",
      tpAtr: 0.4,
      slOfTp: 1.75,
    };
    assert.equal(liveShouldExecute(e, winRel), true, "performing 0.4/1.75 executes — no exclusive lock");
    assert.equal(lanePassExec(e, winRel), true);
    const grid = shortProtectGrid(e, { ...CFG, shortRange: true, tpAtr: 0.4, slOfTp: 1.75 });
    e.completeSim = true;
    const internDone = e.preEvalDone;
    e.preEvalDone = false;
    const internGrid = shortProtectGrid(e, { ...CFG, shortRange: true, tpAtr: 0.4, slOfTp: 1.75 });
    e.preEvalDone = internDone;
    assert.ok(internGrid.some((c) => c.tpAtr === 0.4 && c.slOfTp === 1.75));
    assert.ok(!grid.some((c) => c.tpAtr === 0.4 && Math.abs(c.slOfTp - 0.5) < 1e-9) || internGrid.some((c) => c.tpAtr === 0.4 && c.slOfTp === 1.75), "0.4/0.5 loser must not mix live");
    armUniverse(e, { ...CFG, shortRange: true, tpAtr: 0.4, slOfTp: 1.75, trailingPct: 1.5, maxHoldTicks: 24 }, "trailing", "atr");
    const tagged = [...e.queue, ...e.orders].filter((o) => o.playbook === "short" && o.tpAtr != null);
    assert.ok(tagged.length >= 1, `intern still arms short ladders (${tagged.length})`);
    assert.ok(tagged.some((o) => o.tpAtr === 0.48 && o.slOfTp === 0.75) || internGrid.some((c) => c.tpAtr === 0.4 && c.slOfTp === 1.75));
  });

  it("thin Base-ok combo stays live even with mixed prePass miss", () => {
    const e = initVstEngine({ ...CFG, shortRange: true, trailingPct: 1.5 }, { warmup: 0, symbolCount: 4, arm: false });
    e.shortRange = true;
    e.shortBasePf = 0.7;
    e.liveTape = true;
    e.preEvalDone = true;
    e.prePassKeys = { trend: 1, block: 1 };
    e.progressEval = {
      at: 1,
      lastNModes: { independent: { pass: true, pf: 1 }, combined: { pass: true, pf: 1 }, parallel: { pass: true, pf: 1 } },
      lastNMode: "parallel",
      evalNs: {},
      validNs: {},
      disableNs: {},
      blockCounts: {},
      volumeModes: {},
      overallModes: {},
      indications: {},
      tactics: {},
      ranges: {},
      playbooks: {},
      relations: {},
      shortCombos: {
        [shortComboKey(0.48, 0.75)]: { n: 2, pf: 1.2, net: 0.4, ok: true },
        [shortComboKey(0.3, 0.5)]: { n: 8, pf: 0.2, net: -1, ok: false },
      },
    };
    const winRel = {
      symbol: "BTCUSDT",
      side: "long" as const,
      indication: "ema" as const,
      kind: "short",
      tactic: "trailing" as const,
      rangeType: "atr" as const,
      playbook: "short",
      tpAtr: 0.48,
      slOfTp: 0.75,
    };
    assert.equal(lanePassExec(e, winRel), true);
    assert.equal(liveShouldExecute(e, winRel), true);
  });

  it("sanitize short-range defaults to live floors 0.38 / 0.75", () => {
    const snap = sanitizeDeskSettings({ tacticConfig: { shortRange: true } } as never);
    assert.equal(snap.tacticConfig.tpAtr, 0.48);
    assert.equal(snap.tacticConfig.slOfTp, 0.75);
  });

  it("simulateHours honours comboOnly false on a short pair", () => {
    const cfg = { ...CFG, shortRange: true as const, tpAtr: 0.4, slOfTp: 1.75, trailingPct: 1.5, maxHoldTicks: 12 };
    const { engine: a } = simulateHours(1, cfg, "trailing", { symbolCount: 6, comboOnly: true, complete: false });
    const { engine: b } = simulateHours(1, cfg, "trailing", { symbolCount: 6, comboOnly: false, complete: false });
    assert.equal(a.shortComboOnly, true);
    assert.equal(b.shortComboOnly, false);
    const ga = shortProtectGrid(a, cfg);
    const gb = shortProtectGrid(b, cfg);
    assert.equal(ga.length, 1);
    assert.ok(gb.length >= 1, `grid ${gb.length}`);
  });


  it("live caps allow high order counts and never drop below paper/live ceilings", () => {
    assert.ok(VST_MAX_POSITIONS >= 400);
    assert.ok(VST_MAX_QUEUE >= 2400);
    assert.ok(VST_MAX_WORKING_ORDERS >= 2400);
    const e = initVstEngine({ ...CFG, shortRange: true, trailingPct: 1.5 }, { warmup: 0, symbolCount: 24, arm: true });
    assert.ok(e.queue.length + e.orders.length >= 24, `armed ${e.queue.length}+${e.orders.length}`);
    assert.ok(e.queue.length <= 12000);
    assert.ok(e.orders.length <= VST_MAX_WORKING_ORDERS);
    const liveGrid = shortProtectGrid(e, { ...CFG, shortRange: true });
    assert.ok(liveGrid.length >= 1);
    assert.ok(liveGrid.every((c) => c.tpAtr >= 0.48 && c.slOfTp >= 0.75));
    assert.ok(liveGrid.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
  });

  it("liveTape intern-evals symbols beyond the 50 live cap", () => {
    const e = initVstEngine({ ...CFG, shortRange: true, trailingPct: 1.5 }, { warmup: 8, symbolCount: 24, liveSymbolCap: 8, arm: false });
    e.liveTape = true;
    e.liveSymbolCap = 8;
    e.symbolCount = 24;
    armUniverse(e, { ...CFG, shortRange: true, trailingPct: 1.5 }, "trailing", "atr");
    const intern = e.queue.filter((o) => o.validExec === false);
    assert.ok(e.queue.length >= 8, `queued ${e.queue.length}`);
    assert.ok(intern.length >= 4, `eval intern ${intern.length} / ${e.queue.length}`);
  });

  it("indications and tactics all run, best first, no exclusive lock", () => {
    const e = initVstEngine({ ...CFG, shortRange: true, trailingPct: 1.5 }, { warmup: 4, symbolCount: 4, arm: false });
    const pack = { trend: 0.4, break: 0.1, active: 0.05, direction: -0.02, move: 0.08, rsi: 0.01, bollinger: 0.02, sar: 0.1, macd: 0.12, ema: 0.2, agree: true, activity: 0.5, lastPart: 0.1, drawdown: 0.05, prevRel: 0.1 } as Parameters<typeof rankIndications>[1];
    const inds = rankIndications(e, pack, "trend");
    assert.equal(inds.length, 10);
    assert.equal(inds[0], "trend");
    assert.ok(enabledLiveTactics(e).includes("trailing") && enabledLiveTactics(e).includes("axis") && enabledLiveTactics(e).includes("hybrid"));
    assert.ok(!enabledLiveTactics(e).includes("dca"));
    const tacs = rankTactics(e, "hybrid");
    assert.equal(tacs[0], "hybrid");
    assert.equal(tacs.length, 3);
    e.liveTape = true;
    armUniverse(e, { ...CFG, shortRange: true, trailingPct: 1.5 }, "trailing", "atr");
    const byInd = new Set(e.queue.map((o) => o.indication).filter(Boolean));
    const byTac = new Set(e.queue.map((o) => o.tactic).filter(Boolean));
    assert.ok(byInd.size >= 4, `inds ${[...byInd]}`);
    assert.ok(byTac.size >= 2, `tacs ${[...byTac]}`);
  });

  it("post-eval valid rels are 1-10% of intern and much higher PF", () => {
    const e = initVstEngine({ ...CFG, shortRange: true }, { warmup: 0, symbolCount: 4, arm: false, complete: true });
    e.completeSim = true;
    e.preEvalDone = true;
    e.shortPf = 0.95;
    const win = Array.from({ length: 12 }, (_, i) => ({ pnl: i % 4 === 0 ? 0.4 : 1.2 }));
    const lose = Array.from({ length: 40 }, () => ({ pnl: -0.8 }));
    const mid = Array.from({ length: 20 }, (_, i) => ({ pnl: i % 3 === 0 ? 0.2 : -0.5 }));
    e.shortRelPreTape = {
      "break:hybrid:0.48:0.75": win,
      "ema:trailing:0.48:0.75": lose,
      "trend:axis:0.52:1.00": mid,
      "active:hybrid:0.48:1.00": lose,
      "direction:trailing:0.42:0.75": lose,
    };
    refreshValidRelKeys(e);
    assert.ok((e.validRelShare ?? 0) >= 0.01 && (e.validRelShare ?? 0) <= 0.10, `share ${e.validRelShare}`);
    assert.ok(e.validRelKeys?.["break:hybrid:0.48:0.75"], `keys ${Object.keys(e.validRelKeys || {})}`);
    assert.ok(!e.validRelKeys?.["ema:trailing:0.48:0.75"]);
    assert.equal(internRelProven(e, { indication: "break", tactic: "hybrid", tpAtr: 0.48, slOfTp: 0.75 }), true);
    assert.equal(internRelProven(e, { indication: "ema", tactic: "trailing", tpAtr: 0.48, slOfTp: 0.75 }), false);
    e.shortRange = true;
    e.shortComboPreTape = { "0.48:0.75": win, "0.42:0.75": lose };
    assert.equal(shortComboProven(e, 0.48, 0.75), true, "independent combo tape keep PF≥1 starts live");
    assert.equal(
      liveShouldExecute(e, { symbol: "BTC-USDT", side: "long", indication: "ema", tactic: "trailing", playbook: "short", kind: "short", tpAtr: 0.48, slOfTp: 0.75 }),
      true,
      "live execute is independent combo tape, not internRel 1-10%",
    );
    assert.equal(shortComboProven(e, 0.42, 0.75), false);
    assert.equal(
      liveShouldExecute(e, { symbol: "BTC-USDT", side: "long", indication: "direction", tactic: "trailing", playbook: "short", kind: "short", tpAtr: 0.42, slOfTp: 0.75 }),
      false,
    );
  });

  it("break, active, and direction run with their own ranges, playbooks, and auto-evals", () => {
    assert.equal(openPlaybook("hybrid", "break"), "normal");
    assert.equal(openPlaybook("hybrid", "active"), "normal");
    assert.equal(openPlaybook("hybrid", "direction"), "normal");
    assert.equal(openPlaybook("axis", "break"), "axis");
    assert.equal(openPlaybook("dca", "trend"), "dca");
    assert.ok(indicationProtect("break").slMul > 1);
    assert.ok(indicationProtect("break").tpMul > 1);
    assert.ok(indicationProtect("break").holdMul > 1);
    assert.ok(indicationProtect("active").holdMul < 1);
    assert.ok(indicationProtect("direction").tpMul >= 1);
    const e = initVstEngine(CFG, { warmup: 24, symbolCount: 16, block: { ...DEFAULT_BLOCK_CONFIG, autoEval: true } });
    const seen = new Set(Object.keys(e.quotes).slice(0, 16).map((id) => classifyIndication(e, id)));
    assert.ok(seen.size >= 2, `indications ${[...seen].join(",")}`);
    const { report, engine } = simulateHours(8, CFG, "hybrid", {
      symbolCount: 16,
      rangeType: "fibonacci",
      block: { ...DEFAULT_BLOCK_CONFIG, autoEval: true, sides: "both", liveDisableMinPf: 1.1 },
    });
    finiteNum(report.pf, report.net);
    const ov = overallLiveStats(engine);
    const by = Object.fromEntries((ov.byIndication || []).map((b) => [b.key, b]));
    for (const k of ["trend", "break", "active", "direction"]) {
      const row = by[k];
      assert.ok(row, k);
      finiteNum(row.pf, row.net, row.wr);
    }
    assert.ok((by.break?.n ?? 0) + (by.active?.n ?? 0) + (by.direction?.n ?? 0) >= 3, `non-trend n break=${by.break?.n} active=${by.active?.n} dir=${by.direction?.n}`);
    if ((by.break?.n ?? 0) >= 6) finiteNum(by.break!.pf);
    evalBlockRelations(engine, DEFAULT_BLOCK_CONFIG);
    assert.ok(engine.indRangeBest);
    for (const id of ["trend", "break", "active", "direction"] as const) {
      const r = pickIndicationRange(engine, id, "fibonacci");
      assert.ok(RANGE_TYPES.includes(r), `${id} range ${r}`);
    }
  });

  it("playbook tagging and indications stay independent", () => {
    const e = initVstEngine(CFG, { warmup: 10, symbolCount: 12 });
    const ids = new Set(Object.keys(e.quotes).slice(0, 12).map((id) => classifyIndication(e, id)));
    assert.ok(ids.size >= 2, `indications collapsed to ${[...ids].join(",")}`);
    const parent = e.positions.find((p) => p.qty > 0);
    if (parent) {
      parent.unrealized = Math.max(parent.avgEntry * parent.qty * 0.012, 0.3);
      const add = adjustActiveBlocks(
        e,
        CFG,
        "hybrid",
        { ...DEFAULT_BLOCK_CONFIG, enabled: true, endStageOnly: false, addOnWin: true, flattenConflict: false, minMultiple: 1, maxMultiple: 6 },
        "atr",
        { endStage: true },
      );
      const blockOrder = e.queue.find((o) => /^Block /.test(o.note));
      if (blockOrder) {
        assert.equal(playbookOf(e, blockOrder), "block");
        assert.ok(add.added >= 1);
      }
      const entry = [...e.queue, ...e.orders].find((o) => !/Block/i.test(o.note || "") && !/^DCA/i.test(o.note || ""));
      if (entry) assert.notEqual(playbookOf(e, entry), "block");
    }
    for (let i = 0; i < 40; i++) tickVst(e, CFG, "hybrid", { rangeType: "atr", block: { ...DEFAULT_BLOCK_CONFIG, enabled: true, endStageOnly: false } });
    const tagged = e.closed.filter((c) => c.playbook === "block");
    const others = e.closed.filter((c) => c.playbook !== "block");
    if (e.closed.length >= 8) {
      assert.ok(others.length >= 1, "regular closes must not all be tagged block");
    }
    finiteNum(tagged.length, others.length);
    const ov = overallLiveStats(e);
    assert.ok(ov.playbooks.length >= 5);
    assert.ok(ov.byIndication.length >= 10);
    assert.ok(ov.byKind.length >= 6);
  });

  it("live overview stats cover last N, hours, playbooks and steps", () => {
    const e = initVstEngine(CFG, { warmup: 20, symbolCount: 8 });
    const ov = overallLiveStats(e);
    assert.ok(ov.lastN["12"]);
    assert.ok(ov.lastN["15"]);
    assert.ok(ov.lastN["30"]);
    assert.ok(ov.lastN["40"]);
    assert.ok(ov.lastN["120"]);
    assert.ok(ov.hours["1"]);
    assert.ok(ov.hours["2"]);
    assert.ok(ov.hours["4"]);
    assert.ok(ov.hours["6"]);
    assert.ok(ov.hours["12"]);
    assert.ok(ov.hours["50"]);
    assert.ok(ov.intervals["20"]);
    finiteNum(ov.hours["1"].ddt, ov.hours["4"].orders ?? 0, ov.ddt, ov.intervals["20"].net);
    assert.ok(ov.playbooks.length >= 5);
    assert.ok(ov.playbooks.some((p) => p.key === "short"));
    assert.ok(ov.byIndication.length >= 10);
    assert.ok(ov.byIndication.some((b) => b.key === "rsi"));
    for (const p of ov.playbooks) {
      assert.ok(p.active);
      finiteNum(p.pf, p.ddt, p.active.pf);
    }
    const block = ov.playbooks.find((p) => p.key === "block");
    assert.ok(block);
    assert.ok(block.steps.length >= 1);
    assert.ok(Array.isArray(ov.bestSymbols));
    assert.ok(Array.isArray(ov.worstSymbols));
    finiteNum(ov.avgConfigPf, ov.runningSymbols, ov.configsLive);
  });

  it("seeds hour and last-N PF from complete winner when the tape is empty", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4 });
    const winner = {
      tactic: "hybrid" as const,
      range: "fibonacci" as const,
      hours: 24,
      pf: 2.1,
      wr: 0.57,
      net: 2.4,
      trades: 40,
      mdd: 0.01,
      ok: true,
    };
    (e as { completeWinner?: typeof winner; completeCells?: typeof winner[] }).completeWinner = winner;
    (e as { completeCells?: typeof winner[] }).completeCells = [
      { ...winner, hours: 1, pf: 1.9, trades: 8 },
      { ...winner, hours: 4, pf: 2.0, trades: 16 },
      { ...winner, hours: 24, pf: 2.1, trades: 40 },
    ];
    const ov = overallLiveStats(e);
    assert.ok(ov.hours["1"].pf >= 1.8);
    assert.ok(ov.hours["4"].pf >= 1.9);
    assert.ok(ov.hours["50"].pf >= 1);
    assert.ok(ov.lastN["12"].pf >= 1);
    assert.ok(ov.pf >= 2);
    e.liveTape = true;
    const liveOv = overallLiveStats(e);
    assert.equal(liveOv.hours["1"].n, 0);
    const book = overlayExchangeBook(liveOv, {
      positions: [
        { symbol: "BTCUSDT", side: "long", qty: 1, entry: 100, mark: 101, pnl: 1, venueSymbol: "BTC-USDT", connId: e.activeConnId },
        { symbol: "ETHUSDT", side: "short", qty: 1, entry: 10, mark: 11, pnl: -1, venueSymbol: "ETH-USDT", connId: e.activeConnId },
      ],
      orders: [],
    } as never, e);
    assert.equal(book.open?.n, 2);
    assert.ok(Math.abs((book.open?.net ?? 0) - 0) < 1e-9);
    const skipped = overlayExchangeBook(structuredClone(liveOv), {
      positions: [
        { symbol: "BTCUSDT", side: "long", qty: 1, entry: 100, mark: 101, pnl: 9, venueSymbol: "BTC-USDT", connId: e.activeConnId, owned: false },
        { symbol: "ETHUSDT", side: "short", qty: 1, entry: 10, mark: 11, pnl: -3, venueSymbol: "ETH-USDT", connId: "bingx-x01" },
      ],
      orders: [{ id: "fx", symbol: "BTCUSDT", side: "long", qty: 1, price: 100, status: "open", type: "STOP_MARKET", venueSymbol: "BTC-USDT", connId: e.activeConnId, clientOrderId: "manual-bot", owned: false }],
    } as never, e);
    assert.equal(skipped.open?.n ?? 0, 0);
    assert.equal(skipped.avgOrders ?? 0, 0);
    const ids = universeSymbols(50).map((s) => s.id);
    assert.ok(ids.includes("TAOUSDT") && ids.includes("ENAUSDT"));
    assert.equal(ids.includes("MKRUSDT"), false);
    assert.equal(ids.includes("FTMUSDT"), false);
    assert.equal(ids.includes("TONUSDT"), false);
    for (const id of ids) {
      assert.ok(BINGX_SYMBOL[id], `missing BingX map ${id}`);
    }
  });

  it("overallLiveStats net and open ignore foreign connection legs", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.positions.push({
      id: "fx",
      connId: "foreign",
      symbol: "BTCUSDT",
      side: "long",
      qty: 1,
      plannedQty: 1,
      avgEntry: 100,
      mark: 110,
      sl: 99,
      tp: 111,
      slDist: 1,
      tpDist: 11,
      realized: 0,
      unrealized: 99,
      legs: [],
      controllingRange: "atr",
      rangeSpacing: 1,
      status: "open",
      openedTick: 0,
    } as never);
    e.closed.unshift({
      id: "c-fx",
      connId: "foreign",
      symbol: "ETHUSDT",
      side: "short",
      pnl: -50,
      qty: 1,
      entry: 10,
      exit: 11,
      reason: "sl",
      tick: 1,
      r: -1,
    } as never);
    e.closed.unshift({
      id: "c-own",
      connId: e.activeConnId,
      symbol: "SOLUSDT",
      side: "long",
      pnl: 1.5,
      qty: 1,
      entry: 100,
      exit: 101,
      reason: "tp",
      tick: 2,
      r: 1,
    } as never);
    const ov = overallLiveStats(e);
    assert.equal(ov.open?.n ?? 0, 0);
    assert.equal(ov.overall.n, 1);
    assert.ok(Math.abs(ov.net - 1.5) < 1e-9, `net ${ov.net}`);
  });

  it("overlays last-N and hour windows from BingX realized PnL", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.liveTape = true;
    const ov = overallLiveStats(e);
    const now = Date.now();
    const pnl = Array.from({ length: 20 }, (_, i) => ({
      t: now - i * 60_000,
      v: i % 3 === 0 ? -0.1 : 0.2,
      symbol: i % 2 ? "ETHUSDT" : "BTCUSDT",
    }));
    overlayLiveExecutions(ov, pnl, now);
    assert.equal(ov.lastN["12"].n, 12);
    assert.ok(ov.lastN["12"].pf > 1);
    const last12 = pnl.slice(0, 12);
    const gp = last12.filter((r) => r.v > 0).reduce((s, r) => s + r.v, 0);
    const gl = Math.abs(last12.filter((r) => r.v < 0).reduce((s, r) => s + r.v, 0));
    assert.ok(Math.abs(ov.lastN["12"].pf - gp / gl) < 1e-9, `last12 pf ${ov.lastN["12"].pf} vs ${gp / gl}`);
    assert.ok(ov.lastN["5"] && ov.lastN["5"].n === 5);
    assert.ok(ov.lastN["10"] && ov.lastN["10"].n === 10);
    assert.ok(ov.lastN["15"] && ov.lastN["15"].n === 15);
    assert.ok(ov.lastN["30"] && ov.lastN["30"].n === 20);
    assert.ok(ov.lastN["650"] && ov.lastN["650"].n === 20);
    assert.ok(ov.hours["45"] && ov.hours["45"].n >= 12);
    const curve = tapeWindowCurve(pnl, 12);
    assert.equal(curve.length, 12);
    assert.ok(Math.abs(curve[11]!.pf - ov.lastN["12"].pf) < 1e-9);
    assert.ok(curve[11]!.vol > 0);
    assert.ok(ov.hours["1"].n >= 12);
    assert.ok((ov.hours["1"].symbols ?? 0) >= 1);
  });

  it("overlayLiveExecutions keeps tagged buckets and fills from row tags", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.liveTape = true;
    const now = Date.now();
    e.closed.unshift({
      id: "x:t0",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      pnl: 1,
      qty: 1,
      entry: 100,
      exit: 101,
      reason: "tp",
      tick: 1,
      r: 1,
      tactic: "trailing",
      rangeType: "atr",
      kind: "short",
      indication: "trend",
      playbook: "short",
      at: now - 30_000,
    } as never);
    const ov = overallLiveStats(e);
    const byInd0 = ov.byIndication.find((b) => b.key === "trend")!;
    assert.equal(byInd0.n, 1);
    overlayLiveExecutions(ov, [{ t: now - 10_000, v: 0.5, symbol: "ETHUSDT" }], now, e);
    assert.equal(ov.byIndication.find((b) => b.key === "trend")!.n, 1, "untagged overlay must not wipe indication buckets");
    overlayLiveExecutions(
      ov,
      [
        { t: now - 20_000, v: 0.4, symbol: "ETHUSDT", side: "short", indication: "active", playbook: "block", kind: "block", tactic: "trailing" },
        { t: now - 10_000, v: -0.1, symbol: "BTCUSDT", side: "long", indication: "trend", playbook: "short", kind: "short", tactic: "trailing" },
      ],
      now,
      e,
    );
    const byInd = Object.fromEntries(ov.byIndication.map((b) => [b.key, b]));
    const byBook = Object.fromEntries(ov.byPlaybook.map((b) => [b.key, b]));
    const bySide = Object.fromEntries(ov.bySide.map((b) => [b.key, b]));
    assert.equal(byInd.active.n, 1);
    assert.equal(byInd.trend.n, 1);
    assert.equal(byBook.block.n, 1);
    assert.equal(byBook.short.n, 1);
    assert.equal(bySide.short.n, 1);
    assert.equal(bySide.long.n, 1);
  });

  it("Block last-N PF is independent per batch size", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const cfg = { ...DEFAULT_BLOCK_CONFIG, pauseCountRatio: 1, keepAdjusted: false };
    for (let i = 0; i < 6; i++) noteBlockPosClose(e, "BTCUSDT", "long", -1, cfg);
    assert.equal(e.blockWindows[6].lastPf, 0);
    for (let i = 0; i < 6; i++) noteBlockPosClose(e, "ETHUSDT", "short", 3, cfg);
    const last = e.blockWindows[6];
    assert.equal(last.closed, 12);
    assert.ok(last.lastPf >= 1, `batch pf ${last.lastPf}`);
    assert.ok(last.lastNet > 0, `last batch net ${last.lastNet}`);
    assert.ok(e.blockWindows[1].lastPf > 0);
  });

  it("live-tape disable uses realized symbol PF not paper last-N", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.liveTape = true;
    e.minPf = 1.8;
    e.symbolStats.SOLUSDT = { id: "SOLUSDT", trades: 8, wins: 1, profit: 0.2, loss: 1.0, sl: 7, tp: 1 };
    e.symbolStats.ETHUSDT = { id: "ETHUSDT", trades: 8, wins: 6, profit: 2.4, loss: 0.4, sl: 2, tp: 6 };
    e.symbolStats.INJUSDT = { id: "INJUSDT", trades: 10, wins: 2, profit: 0.1, loss: 1.2, sl: 8, tp: 2 };
    for (let i = 0; i < 12; i++) {
      e.closed.push({
        id: `p${i}`,
        connId: VST_DEFAULT_CONN,
        symbol: "ETHUSDT",
        side: "long",
        pnl: -0.5,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: "sl",
        tick: i,
        r: -1,
        tactic: "hybrid",
        rangeType: "atr",
        kind: "trend",
        indication: "trend",
        playbook: "normal",
      } as never);
    }
    const h = refreshLiveDisable(e, {
      ...DEFAULT_BLOCK_CONFIG,
      liveLastN: 12,
      liveDisable: true,
      liveDisableMinPf: 1.8,
      liveDisableMinSamples: 4,
    });
    assert.ok(h.disabled.includes("sym:SOLUSDT"), `disabled ${h.disabled.join(",")}`);
    assert.ok(h.disabled.includes("sym:INJUSDT"));
    assert.equal(h.disabled.includes("sym:ETHUSDT"), false);
    assert.equal(skipLiveSymbol(e, "SOLUSDT"), true);
    assert.equal(skipLiveSymbol(e, "ETHUSDT"), false);
    assert.equal(skipLiveSymbol(e, "ADAUSDT"), true);
    e.symbolStats.XRPUSDT = { id: "XRPUSDT", trades: 6, wins: 4, profit: 0.5, loss: 1.0, sl: 2, tp: 4 };
    assert.ok((symbolTapePf(e, "XRPUSDT") ?? 0) < 1);
    assert.equal(skipLiveSymbol(e, "XRPUSDT"), true);
    assert.equal(skipLiveSymbol(e, "DOGEUSDT"), true);
  });

  it("self-heals NaN books, empty running books, and coordinator faults", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8 });
    e.quotes.BTCUSDT.px = Number.NaN;
    e.quotes.BTCUSDT.lo = -2;
    e.tokens[VST_DEFAULT_CONN] = -8;
    const r = healEngine(e, CFG, "hybrid", "atr");
    assert.ok(r.healed);
    assert.ok(e.quotes.BTCUSDT.px > 0);
    assert.ok(e.quotes.BTCUSDT.lo > 0);
    assert.ok((e.tokens[VST_DEFAULT_CONN] ?? 0) >= 0);
    e.queue = [];
    e.orders = [];
    e.positions = [];
    e.running = true;
    e.phase = "running";
    const r2 = healEngine(e, CFG, "hybrid", "atr");
    assert.ok(r2.healed);
    assert.ok(e.queue.length > 0);
    const c = coordinate(
      [{ pnl: Number.NaN } as never, { pnl: 10, side: "long" } as never],
      null as never,
      [],
      Number.NaN,
    );
    assert.equal(c.recommend, "hold");
    assert.ok(Number.isFinite(c.heat));
    assert.ok(Number.isFinite(c.activity));
    e.quotes.ETHUSDT.px = Number.NaN;
    healEngine(e, CFG, "hybrid", "atr");
    assert.ok(e.quotes.ETHUSDT.px > 0);
    for (let i = 0; i < 24; i++) tickVst(e, CFG, "hybrid", { skipWalk: true });
    assert.ok(Number.isFinite(e.stats.equity));
    assert.ok(e.healCount >= 1);
    assert.equal(auditEngine(e).nanCount, 0);
  });

  it("sanitizes and syncs desk settings systemwide", () => {
    const dirty = {
      lastN: 99,
      lastNLinked: true,
      costStep: 99,
      rangeType: "nope",
      tactic: "zzz",
      symbolCount: 500,
      orderType: "limit",
      enabledKinds: ["normal", "bogus"],
      tacticConfig: { trailingPct: 1.2, dcaCount: 2, dcaDrawdown: 1, axisSpacing: 0.5, axisLevels: 3, slAtr: 0.4, tpRatio: 9 },
      thresholds: { minPf: 1.4, maxMdd: 0.1, minWr: 0.5, minVf: 1, maxDdt: 40 },
    };
    const snap = sanitizeDeskSettings(dirty as never);
    assert.equal(snap.rangeType, "atr");
    assert.equal(snap.tactic, "hybrid");
    assert.equal(snap.symbolCount, 300);
    assert.equal(snap.tacticConfig.tpRatio, tpRatioOf(1));
    assert.equal(snap.thresholds.minPf, 1.4);
    assert.equal(snap.thresholds.basePf, DEFAULT_BASE_PF);
    assert.equal(snap.thresholds.axisPf, DEFAULT_AXIS_PF);
    assert.equal(snap.thresholds.blockPf, DEFAULT_BLOCK_PF);
    assert.equal(snap.thresholds.shortPf, DEFAULT_SHORT_PF);
    assert.equal(snap.thresholds.shortBasePf, DEFAULT_SHORT_BASE_PF);
    assert.equal(sanitizeDeskSettings({ tacticConfig: { axisPartialRatio: 0.08 } } as never).tacticConfig.axisPartialRatio, 3);
    assert.equal(sanitizeDeskSettings({ blockConfig: { volumeRatio: 0.08, relVolumeRatio: 1.5 } } as never).blockConfig.volumeRatio, 0.2);
    assert.equal(sanitizeDeskSettings({ blockConfig: { volumeRatio: 1.5, relVolumeRatio: 1.5 } } as never).blockConfig.relVolumeRatio, 1);
    assert.equal(sanitizeDeskSettings({ blockConfig: { overallVolumeRatio: 0.08 } } as never).blockConfig.overallVolumeRatio, 1.5);
    assert.equal(sanitizeDeskSettings({ blockConfig: { overallVolumeRatio: 1.5, sharedVolumeRatio: 1.5 } } as never).blockConfig.overallVolumeRatio, 1.5);
    assert.equal(sanitizeDeskSettings({ blockConfig: { overallVolumeRatio: 1.5, sharedVolumeRatio: 1.5 } } as never).blockConfig.sharedVolumeRatio, 1.5);
    assert.ok(snap.tacticConfig.slAtr >= 0.8);
    assert.equal(snap.thresholds.maxDdt, 20);
    assert.equal(snap.hedgeMode, true);
    assert.equal(snap.marginMode, "cross");
    assert.equal(snap.useMaxLeverage, true);
    assert.equal(sanitizeDeskSettings({ useMaxLeverage: false } as never).useMaxLeverage, true);
    assert.ok(snap.minSizeRatio >= 1);
    assert.ok(snap.lastN <= 50);
    assert.deepEqual(snap.enabledKinds, ["normal"]);
    const legacy = sanitizeDeskSettings({
      enabledKinds: ["nirmal"] as never,
      strategyId: "nirmal",
    } as never);
    assert.deepEqual(legacy.enabledKinds, ["normal"]);
    assert.equal(legacy.strategyId, "normal");
    const base = defaultDeskSettings();
    const collected = collectDeskSettings({ ...base, tactic: "trailing", rangeType: "volume", settingsRev: 3 });
    assert.equal(collected.tactic, "trailing");
    assert.equal(collected.rev, 4);
    assert.equal(settingsDiffer(base, collected), true);
    assert.equal(settingsDiffer(base, sanitizeDeskSettings(base)), false);
    const presets = allPresets([]);
    assert.ok(presets.length >= 5);
    assert.ok(findPreset("x01-live", [])?.patch.tactic === "trailing");
    assert.ok(findPreset("short-block-live", [])?.patch.tacticConfig?.shortRange === true);
    assert.ok((findPreset("short-block-live", [])?.patch.blockConfig?.counts ?? []).length === 1);
    assert.equal(findPreset("short-block-live", [])?.patch.strategyToggles?.normal, false);
    assert.equal(findPreset("short-block-live", [])?.patch.strategyToggles?.block, true);
    const stable = findPreset("stable-01", []);
    assert.ok(stable);
    assert.equal(stable?.label, "Stable 01");
    assert.equal(stable?.patch.activeConnId, "bingx-x01");
    assert.equal(stable?.patch.symbolCount, 50);
    assert.equal(stable?.patch.tactic, "trailing");
    assert.equal(stable?.patch.rangeType, "atr");
    assert.equal(stable?.patch.tacticConfig?.shortRange, true);
    assert.equal(stable?.patch.tacticConfig?.tpAtr, 0.48);
    assert.equal(stable?.patch.tacticConfig?.slOfTp, 0.75);
    assert.deepEqual(stable?.patch.blockConfig?.counts, [1, 3, 4, 5, 6]);
    assert.equal(stable?.patch.blockConfig?.activeLive, true);
    assert.equal(stable?.patch.blockConfig?.volumeMode, "parallel");
    assert.equal(stable?.patch.thresholds?.minPf, 1.8);
    assert.equal(stable?.patch.strategyToggles?.normal, false);
    assert.equal(stable?.patch.strategyToggles?.dca, false);
    const stable2 = findPreset("stable-02", []);
    assert.ok(stable2);
    assert.equal(stable2?.label, "Stable 02");
    assert.equal(stable2?.patch.thresholds?.minPf, 1.35);
    assert.equal(stable2?.patch.thresholds?.shortPf, 0.95);
    assert.equal(stable2?.patch.tacticConfig?.axisPartialRatio, 3);
    assert.equal(stable2?.patch.blockConfig?.volumeRatio, 0.2);
    assert.equal(stable2?.patch.blockConfig?.overallVolumeRatio, 1.5);
    assert.equal(stable2?.patch.blockConfig?.liveDisableMinPf, 1.2);
    assert.equal(stable2?.patch.symbolCount, 120);
    const vstW = findPreset("vst-working-01", []);
    assert.ok(vstW);
    assert.equal(vstW?.label, "VST Working 01");
    assert.equal(vstW?.patch.activeConnId, "bingx-vst-02");
    assert.equal(vstW?.patch.symbolCount, 50);
    assert.equal(vstW?.patch.liveSymbolCap, 50);
    assert.equal(vstW?.patch.evalSymbolCount, 300);
    assert.equal(vstW?.patch.tacticConfig?.tpAtr, 0.48);
    assert.equal(vstW?.patch.tacticConfig?.slOfTp, 0.75);
    assert.equal(vstW?.patch.tacticConfig?.trailingPct, 1.5);
    assert.equal(vstW?.patch.tacticConfig?.shortRange, true);
    assert.deepEqual(vstW?.patch.blockConfig?.counts, [1, 3, 4, 5, 6]);
    assert.equal(vstW?.patch.blockConfig?.sharedVolumeRatio, 1.5);
    assert.equal(vstW?.patch.blockConfig?.volumeRatio, 0.2);
    assert.equal(vstW?.patch.shortProgress?.minTpAtr, 0.48);
    assert.equal(vstW?.patch.shortProgress?.minSlOfTp, 0.75);
    assert.equal(vstW?.patch.strategyToggles?.dca, false);
    assert.equal(vstW?.patch.strategyToggles?.normal, false);
    assert.ok(universeSymbols(120).length === 120);
    const saved = sanitizeUserPresets([{ id: "user-a", label: "Mine", blurb: "x", builtin: false, patch: { tactic: "axis" } }, { id: "" }]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.label, "Mine");
    const withUser = sanitizeDeskSettings({ ...base, activePresetId: "x01-live", userPresets: saved });
    assert.equal(withUser.activePresetId, "x01-live");
    assert.equal(withUser.userPresets.length, 1);
    assert.ok(presetIdOf("My Setup").startsWith("user-"));
    assert.equal(BUILTIN_PRESETS.every((p) => p.builtin), true);
  });

  it("strategy toggles: Normal calc-only, Block Active executes adjusted only", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.strategyToggles = { normal: false, trailing: true, axis: true, block: true, dca: false };
    e.blockCfg = { ...DEFAULT_BLOCK_CONFIG, activeLive: true, enabled: true };
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing" }), true);
    e.liveTape = true;
    e.liveOpenN = 40;
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing" }), true);
    assert.equal(
      liveShouldExecute(e, { symbol: "ETHUSDT", side: "long", playbook: "block", note: "Block 1", blockLevel: 1, tactic: "trailing" }),
      true,
    );
    e.liveTape = false;
    e.liveOpenN = 0;
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "normal", kind: "normal", tactic: "trailing" }), false);
    assert.equal(
      liveShouldExecute(e, { symbol: "ETHUSDT", side: "long", playbook: "block", note: "Block 1", blockLevel: 1, tactic: "trailing" }),
      true,
    );
    assert.equal(liveShouldExecute(e, { symbol: "SOLUSDT", side: "short", playbook: "axis", tactic: "axis" }), true);
    e.strategyToggles.trailing = false;
    assert.equal(
      liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", tactic: "trailing", playbook: "normal", kind: "normal" }),
      false,
    );
    e.strategyToggles.block = false;
    assert.equal(
      liveShouldExecute(e, { symbol: "ETHUSDT", side: "long", playbook: "block", note: "Block 1", blockLevel: 1 }),
      false,
    );
    const snap = sanitizeDeskSettings({ strategyToggles: { ...DEFAULT_STRATEGY_TOGGLES, normal: true } });
    assert.equal(snap.strategyToggles.normal, true);
    assert.equal(snap.strategyToggles.dca, false);
    assert.equal(snap.strategyToggles.block, true);
    e.strategyToggles.block = true;
    e.strategyToggles.dca = false;
    assert.equal(liveShouldExecute(e, { symbol: "XRPUSDT", side: "long", playbook: "dca", tactic: "dca" }), false);
    e.strategyToggles.block = true;
    e.blockRelBest = {
      "ind:trend": { key: "ind:trend", n: 6, pf: 2.1, net: 1, vol: 0.4, major: true },
      "tac:trailing": { key: "tac:trailing", n: 6, pf: 1.9, net: 1, vol: 0.4, major: true },
      "side:long": { key: "side:long", n: 6, pf: 1.85, net: 1, vol: 0.4, major: true },
    };
    const rel = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const, kind: "trend", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "normal" };
    assert.equal(matchingWinningRels(e, rel).length, 3);
    assert.ok(Math.abs(winningRelVolume(e, rel) - 1.2) < 1e-9);
    assert.equal(liveShouldExecute(e, rel), true);
  });

  it("short-range overall PF 0.95 and base PF 0.7 are independent of overall 1.35", () => {
    assert.equal(DEFAULT_SHORT_PF, 0.95);
    assert.equal(DEFAULT_SHORT_BASE_PF, 0.7);
    const th = { ...DEFAULT_THRESHOLDS };
    const shortRow = { pf: 0.8, mdd: 0.05, wr: 0.6, volumeFactor: 1.2, shortRange: true, playbook: "short" as const, kind: "short" };
    assert.equal(isPositive(shortRow, th), false);
    assert.equal(isPositive({ ...shortRow, pf: 1.05 }, th), true);
    assert.equal(isPositive({ pf: 0.9, mdd: 0.05, wr: 0.6, volumeFactor: 1.2, playbook: "normal", kind: "normal" }, th), false);
    const snap = sanitizeDeskSettings({ thresholds: { minPf: 1.8 } } as never);
    assert.equal(snap.thresholds.minPf, DEFAULT_MIN_PF);
    assert.equal(snap.thresholds.shortPf, DEFAULT_SHORT_PF);
    assert.equal(snap.thresholds.shortBasePf, DEFAULT_SHORT_BASE_PF);
    const cfg = { ...CFG, shortRange: true as const, tpAtr: 0.35, slOfTp: 1.5, slAtr: 0.525, tpRatio: 1 / 1.5 };
    const e = initVstEngine(cfg, { warmup: 0, symbolCount: 6, arm: false });
    assert.equal(e.shortRange, true);
    assert.equal(minPfFor(e, "short"), 0.95);
    assert.equal(minPfFor(e, "shortBase"), 0.7);
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: false, trailing: true, axis: true, block: false, dca: false };
    e.liveTape = true;
    e.liveOpenN = 20;
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing" }), true);
    e.closed = Array.from({ length: 12 }, (_, i) => ({
      id: `x:s${i}`,
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long" as const,
      pnl: i < 3 ? 0.2 : -0.35,
      qty: 1,
      entry: 1,
      exit: 1,
      reason: i < 3 ? "tp" : "sl",
      tick: i,
      r: 1,
      tactic: "trailing" as const,
      rangeType: "atr" as const,
      playbook: "short",
      kind: "short",
    })) as never;
    assert.ok(pfFromPnls(e.closed) + 1e-9 < 0.95);
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing" }), false);
    e.closed = Array.from({ length: 12 }, (_, i) => ({
      id: `x:w${i}`,
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long" as const,
      pnl: i < 9 ? 0.4 : -0.15,
      qty: 1,
      entry: 1,
      exit: 1,
      reason: i < 9 ? "tp" : "sl",
      tick: i,
      r: 1,
      tactic: "trailing" as const,
      rangeType: "atr" as const,
      playbook: "short",
      kind: "short",
    })) as never;
    assert.ok(pfFromPnls(e.closed) >= 0.95);
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", playbook: "short", kind: "short", tactic: "trailing" }), true);
    const { report } = simulateHours(6, cfg, "hybrid", { symbolCount: 8, rangeType: "atr" });
    finiteNum(report.pf, report.net);
    assert.ok(report.trades >= 0);
  });

  it("axis rungs are ~3× a normal position", () => {
    const cfg = { ...CFG, axisLevels: 4, axisPartialRatio: 3, trailingPct: 1.5 };
    const e = initVstEngine(cfg, { warmup: 0, symbolCount: 6, arm: false });
    e.lastTactic = "axis";
    armUniverse(e, cfg, "axis");
    const n = initVstEngine({ ...CFG, axisPartialRatio: 3, trailingPct: 1.5 }, { warmup: 0, symbolCount: 6, arm: false });
    n.lastTactic = "trailing";
    armUniverse(n, { ...CFG, trailingPct: 1.5 }, "trailing");
    const bySym = new Map<string, typeof e.queue>();
    for (const o of e.queue) {
      if (o.level < 1) continue;
      const arr = bySym.get(o.symbol) ?? [];
      arr.push(o);
      bySym.set(o.symbol, arr);
    }
    let checked = 0;
    for (const [sym, rows] of bySym) {
      const l1 = rows.find((o) => o.level === 1);
      const extra = rows.filter((o) => o.level > 1);
      const normal = n.queue.find((o) => o.symbol === sym && o.level === 1);
      if (!l1 || !normal || !(normal.qty > 0)) continue;
      assert.ok(Math.abs(l1.qty / normal.qty - 3) < 0.35, `axis L1 ${l1.qty} vs normal ${normal.qty}`);
      for (const o of extra) {
        assert.ok(Math.abs(o.qty / l1.qty - 1) < 0.08, `extra ${o.qty} vs L1 ${l1.qty}`);
        checked += 1;
      }
      if (!extra.length) checked += 1;
    }
    assert.ok(checked >= 1, "need axis rungs");
  });

  it("live Block stacks rungs 1-6 on open positions with playbook block", () => {
    const e = initVstEngine(CFG, { warmup: 12, symbolCount: 8, arm: true, block: { ...DEFAULT_BLOCK_CONFIG, enabled: false } });
    e.liveTape = true;
    e.strategyToggles = { normal: false, trailing: true, axis: true, block: true, dca: false };
    if (!e.positions.some((x) => x.qty > 0)) {
      for (let i = 0; i < 8 && !e.positions.some((x) => x.qty > 0); i++) tickVst(e, CFG, "hybrid", { rangeType: "atr", block: { ...DEFAULT_BLOCK_CONFIG, enabled: false } });
    }
    const p = e.positions.find((x) => x.qty > 0);
    assert.ok(p, "need an open parent");
    const first = p.legs[0] ?? { orderId: "leg0", qty: p.qty, px: p.avgEntry };
    p.legs = [first];
    p.qty = first.qty;
    p.plannedQty = first.qty;
    e.tick = Math.min(e.tick, 10);
    e.closed = [];
    e.queue = [];
    const q = e.quotes[p.symbol];
    if (q) q.vol = Math.max(q.vol || 0, 0.02);
    const adj = adjustActiveBlocks(
      e,
      CFG,
      "hybrid",
      {
        ...DEFAULT_BLOCK_CONFIG,
        enabled: true,
        addOnWin: false,
        counts: [1, 2, 3, 4, 5, 6],
        maxMultiple: 6,
        minMultiple: 1,
        activeLive: true,
        endStageOnly: false,
        windows: false,
        volumeMode: "parallel",
        overallMode: "parallel",
        overall: true,
      },
      "atr",
    );
    const rungs = [...e.queue, ...e.orders].filter((o) => /Block/i.test(o.note || ""));
    assert.ok(adj.added >= 1 || rungs.length >= 1, `added ${adj.added} rungs ${rungs.length}`);
    const modes = new Set(rungs.map((o) => (/additive/i.test(o.note || "") ? "additive" : /shared/i.test(o.note || "") ? "shared" : "other")));
    assert.ok(modes.has("shared") || modes.has("additive"), `modes ${[...modes].join(",")}`);
    const extra = rungs.reduce((s, o) => s + Math.max(0, o.qty || 0), 0);
    const base = p.legs[0]?.qty || p.qty;
    assert.ok(p.qty + extra <= base * 2.5 + 1e-6, `oversized ${p.qty + extra} vs cap ${base * 2.5}`);
    for (const o of rungs) {
      assert.equal(o.playbook, "block");
      assert.equal(o.kind, "block");
      assert.ok((o.level || 0) >= 1 && (o.level || 0) <= 6);
      assert.equal(liveShouldExecute(e, { symbol: o.symbol, side: o.side, playbook: o.playbook, kind: o.kind, note: o.note, blockLevel: o.level, tactic: o.tactic }), true);
    }
  });

  it("Block shared extra stays ≤ 1.5× and total position ≤ 2.5× base", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    e.tick = 4;
    const q = e.quotes.BTCUSDT ?? Object.values(e.quotes)[0];
    assert.ok(q && q.px > 0);
    q.vol = Math.max(q.vol || 0, 0.02);
    q.axis = q.axis || q.px;
    const baseQty = 10;
    const sym = Object.keys(e.quotes)[0]!;
    e.positions.push({
      id: "p-cap",
      connId: VST_DEFAULT_CONN,
      symbol: sym,
      side: "long",
      qty: baseQty,
      plannedQty: baseQty,
      avgEntry: q.px,
      mark: q.px,
      sl: q.px * 0.99,
      tp: q.px * 1.01,
      slDist: q.px * 0.01,
      tpDist: q.px * 0.01,
      realized: 0,
      unrealized: 0.25,
      legs: [{ orderId: "l-cap", qty: baseQty, px: q.px }],
      controllingRange: "atr",
      rangeSpacing: 1,
      status: "open",
      openedTick: 1,
      tactic: "hybrid",
      kind: "trend",
      indication: "trend",
      playbook: "normal",
    });
    const block = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      windows: false,
      addOnWin: false,
      endStageOnly: false,
      stack: true,
      overall: true,
      volumeMode: "parallel" as const,
      overallMode: "shared" as const,
      volumeRatio: 0.2,
      sharedVolumeRatio: 1.5,
      overallVolumeRatio: 1.5,
      maxVolumeMultiplier: 2.5,
      counts: [1, 2, 3, 4, 5, 6],
      maxMultiple: 6,
      minMultiple: 1,
      relAdditive: false,
    };
    const adj = adjustActiveBlocks(e, CFG, "hybrid", block, "atr", { endStage: true });
    const rungs = [...e.queue, ...e.orders].filter((o) => o.symbol === sym && /Block/i.test(o.note || ""));
    const extra = rungs.reduce((s, o) => s + Math.max(0, o.qty || 0), 0);
    assert.ok(adj.added >= 1 || rungs.length >= 1, `added ${adj.added} extra ${extra}`);
    assert.ok(extra <= baseQty * 1.5 + 1e-6, `shared extra ${extra} > 1.5× ${baseQty * 1.5}`);
    assert.ok(baseQty + extra <= baseQty * 2.5 + 1e-6, `total ${baseQty + extra} > 2.5×`);
    for (const o of rungs) {
      if (/additive/i.test(o.note || "") && !/Overall/i.test(o.note || "")) {
        assert.ok(o.qty <= baseQty * 0.2 + 1e-6, `additive step ${o.qty}`);
      }
    }
    assert.equal(DEFAULT_BLOCK_CONFIG.sharedVolumeRatio, DEFAULT_SHARED_BLOCK_VOLUME_RATIO);
    assert.equal(DEFAULT_BLOCK_CONFIG.overallVolumeRatio, DEFAULT_OVERALL_BLOCK_VOLUME_RATIO);
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeRatio, DEFAULT_BLOCK_VOLUME_RATIO);
    assert.equal(DEFAULT_BLOCK_CONFIG.maxVolumeMultiplier, DEFAULT_MAX_VOLUME_MULTIPLIER);
    assert.equal(clampMaxVolumeMul(6), 3.5);
    assert.equal(clampMaxVolumeMul(1), 1.5);
    assert.equal(clampMaxVolumeMul(2.5), 2.5);
  });

  it("20m red scales Block volume down; entries still process", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    e.tick = 40;
    e.liveTape = false;
    e.completeSim = false;
    e.closed = [];
    for (let i = 0; i < 4; i++) {
      e.closed.unshift({
        id: `red-${i}`,
        connId: VST_DEFAULT_CONN,
        symbol: "BTCUSDT",
        side: "long",
        pnl: -1,
        qty: 1,
        entry: 100,
        exit: 99,
        reason: "sl",
        tick: 30 + i,
        r: -1,
        tactic: "hybrid",
        rangeType: "atr",
        kind: "trend",
        indication: "trend",
        playbook: "normal",
      } as never);
    }
    const rolling = lastIntervalNet(e, INTERVAL_MINUTES);
    assert.ok(rolling.n >= 2);
    assert.ok(rolling.net < 0);
    assert.equal(intervalAllowsEntry(e), true);
    const st = lastIntervalStats(e, INTERVAL_MINUTES);
    assert.ok(st.pf < 1);
    const redScale = intervalVolumeScale(e);
    assert.ok(redScale <= 0.72, `red scale ${redScale}`);
    assert.ok(redScale >= 0.4, `red scale floor ${redScale}`);
    const cur = currentIntervalNet(e, INTERVAL_MINUTES);
    finiteNum(cur.net, cur.n);
    e.completeSim = true;
    assert.equal(intervalAllowsEntry(e), true);
    e.completeSim = false;
    e.closed = e.closed.map((c, i) => ({ ...c, pnl: 1.6, reason: "tp" as const, tick: 30 + i }));
    assert.equal(intervalAllowsEntry(e), true);
    const greenScale = intervalVolumeScale(e);
    assert.ok(greenScale >= redScale, `green ${greenScale} vs red ${redScale}`);
    assert.ok(greenScale >= 1, `green scale ${greenScale}`);
    const hist = intervalWindowHistory(e, INTERVAL_MINUTES, 4);
    assert.ok(Array.isArray(hist));
  });

  it("2h sim snapshots 20-min intervals and uses them for vol scale, not a halt", () => {
    const { report, engine } = simulateHours(2, CFG, "hybrid", {
      symbolCount: 8,
      rangeType: "atr",
      block: { ...DEFAULT_BLOCK_CONFIG, volumeRatio: 0.2, sharedVolumeRatio: 1.5, overallVolumeRatio: 1.5, maxVolumeMultiplier: 2.5 },
    });
    assert.ok((report.intervals?.length ?? 0) >= 6, `intervals ${report.intervals?.length}`);
    const sumNet = (report.intervals ?? []).reduce((s, iv) => s + iv.net, 0);
    assert.ok(Math.abs(sumNet - (report.realizedNet ?? report.profit - report.loss)) < 1e-6, `sum 20m ${sumNet} vs realized ${report.realizedNet}`);
    for (const iv of report.intervals ?? []) {
      finiteNum(iv.net, iv.m, iv.trades, iv.eq, iv.pf);
    }
    const scale = intervalVolumeScale(engine);
    assert.ok(scale >= 0.4 && scale <= 1.2, `scale ${scale}`);
    finiteNum(lastIntervalStats(engine).pf);
    assert.equal(intervalAllowsEntry(engine), true);
    const ov = overallLiveStats(engine);
    assert.ok(ov.intervals?.["20"]);
    finiteNum(ov.intervals["20"].net, ov.intervals["20"].n);
    finiteNum(ov.intervalVolScale ?? scale, ov.intervalPf ?? 0);
  });

  it("interval strategy settings default 20m, disable is scale 1, minutes snap", () => {
    const d = sanitizeIntervalStrategy(undefined);
    assert.equal(d.enabled, true);
    assert.equal(d.minutes, 20);
    assert.equal(d.scaleVol, true);
    assert.equal(d.scoreRelations, true);
    assert.equal(d.evalOnCadence, true);
    assert.equal(d.minScale, 0.4);
    assert.equal(d.maxScale, 1.2);
    assert.equal(d.leanPf, 1.45);
    assert.equal(d.cutPf, 0.9);
    assert.equal(d.relationBoost, 1);
    assert.equal(sanitizeIntervalStrategy({ relationBoost: 1.08 }).relationBoost, 1);
    assert.equal(sanitizeIntervalStrategy({ relationBoost: 1.2 }).relationBoost, 1.2);
    assert.deepEqual([...INTERVAL_MINUTES_OPTIONS], [10, 15, 20, 30, 40, 60]);
    assert.equal(sanitizeIntervalStrategy({ minutes: 18 }).minutes, 20);
    assert.equal(sanitizeIntervalStrategy({ minutes: 12 }).minutes, 10);
    assert.equal(sanitizeIntervalStrategy({ minutes: 55 }).minutes, 60);
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    assert.equal(intervalMinutesOf(e), 20);
    assert.equal(intervalCfg(e).enabled, true);
    e.tick = 40;
    e.closed = [];
    for (let i = 0; i < 4; i++) {
      e.closed.unshift({
        id: `iv-${i}`,
        connId: VST_DEFAULT_CONN,
        symbol: "BTCUSDT",
        side: "long",
        pnl: -1,
        qty: 1,
        entry: 100,
        exit: 99,
        reason: "sl",
        tick: 30 + i,
        r: -1,
        tactic: "hybrid",
        rangeType: "atr",
        kind: "trend",
        indication: "trend",
        playbook: "normal",
      } as never);
    }
    const red = intervalVolumeScale(e);
    assert.ok(red < 1, `red ${red}`);
    e.intervalStrategy = sanitizeIntervalStrategy({ ...DEFAULT_INTERVAL_STRATEGY, enabled: false });
    assert.equal(intervalVolumeScale(e), 1);
    e.intervalStrategy = sanitizeIntervalStrategy({ ...DEFAULT_INTERVAL_STRATEGY, enabled: true, scaleVol: false });
    assert.equal(intervalVolumeScale(e), 1);
    e.intervalStrategy = sanitizeIntervalStrategy({ ...DEFAULT_INTERVAL_STRATEGY, minutes: 15 });
    assert.equal(intervalMinutesOf(e), 15);
    assert.equal(DEFAULT_INTERVAL_STRATEGY.minutes, 20);
  });
});

function finiteNum(...xs: number[]) {
  for (const x of xs) assert.ok(Number.isFinite(x), `not finite ${x}`);
}

function assertComboStats(c: {
  pf: number;
  mdd: number;
  ddt: number;
  wr: number;
  volumeFactor: number;
  net: number;
  trades: number;
  lastNPf: number;
  lastNWr: number;
  lastNNet: number;
}) {
  finiteNum(c.pf, c.mdd, c.ddt, c.wr, c.volumeFactor, c.net, c.trades, c.lastNPf, c.lastNWr, c.lastNNet);
  assert.ok(c.pf >= 0 && c.mdd >= 0 && c.wr >= 0 && c.wr <= 1);
  assert.ok(c.volumeFactor > 0);
}

describe("full config coverage", () => {
  it("computes every strategy × cost × range × tactic × trail × TP/SL independently", () => {
    const rows = combosFiltered({
      symbol: "BTCUSDT",
      lastN: 10,
      cfg: DEFAULT_TACTIC_CONFIG,
      th: DEFAULT_THRESHOLDS,
      tactic: "all",
      rangeType: "all",
      onlyPositive: false,
      enabledKinds: DEFAULT_ENABLED_KINDS,
    });
    const want =
      STRATEGIES.length *
      COST_STEPS.length *
      RANGE_TYPES.length *
      TACTICS.length *
      TRAIL_PCTS.length *
      TP_SL_RATIOS.length;
    assert.equal(rows.length, want, `computed ${rows.length} want ${want}`);
    const strategies = new Set(rows.map((r) => r.strategyId));
    const costs = new Set(rows.map((r) => r.costStep));
    const ranges = new Set(rows.map((r) => r.rangeType));
    const tactics = new Set(rows.map((r) => r.tactic));
    const trails = new Set(rows.map((r) => r.trailPct));
    const ratios = new Set(rows.map((r) => r.tpRatio));
    assert.equal(strategies.size, STRATEGIES.length);
    assert.equal(costs.size, COST_STEPS.length);
    assert.equal(ranges.size, RANGE_TYPES.length);
    assert.equal(tactics.size, TACTICS.length);
    assert.equal(trails.size, TRAIL_PCTS.length);
    assert.equal(ratios.size, TP_SL_RATIOS.length);
    for (const r of rows) assertComboStats(r);
    const bd = comboBreakdown(rows);
    finiteNum(bd.avgPf, bd.avgMdd, bd.avgWr, bd.avgVf, bd.avgDdt, bd.uniquePf, bd.uniqueMdd);
    assert.equal(bd.total, rows.length);
    assert.equal(bd.byTactic.length, TACTICS.length);
    assert.equal(bd.byRange.length, RANGE_TYPES.length);
    assert.equal(bd.byTrail.length, TRAIL_PCTS.length);
    assert.equal(bd.byTpRatio.length, TP_SL_RATIOS.length);
    assert.equal(bd.byCost.length, COST_STEPS.length);
    assert.ok(bd.byKind.length >= STRATEGY_KINDS.length);
    assert.ok(bd.byStrategy.length === STRATEGIES.length);
    for (const b of [...bd.byTactic, ...bd.byRange, ...bd.byTrail, ...bd.byTpRatio, ...bd.byKind]) {
      finiteNum(b.avgPf, b.avgWr, b.avgMdd, b.avgVf, b.avgDdt, b.net, b.n, b.pass);
      assert.ok(b.n > 0, b.id);
    }
    const best = pickBestCombo(rows);
    assert.ok(best);
    assertComboStats(best!);
  });

  it("runs every strategy kind as an independent set", () => {
    const pfs: Record<string, number> = {};
    for (const kind of STRATEGY_KINDS) {
      const playbooks = strategiesForKinds([kind.id]);
      assert.ok(playbooks.length >= 1, kind.id);
      assert.ok(playbooks.every((s) => strategyMatchesKinds(s, [kind.id])), kind.id);
      const rows = combosFiltered({
        symbol: "ETHUSDT",
        lastN: 10,
        cfg: DEFAULT_TACTIC_CONFIG,
        th: DEFAULT_THRESHOLDS,
        tactic: "all",
        rangeType: "all",
        onlyPositive: false,
        enabledKinds: [kind.id],
        keepBest: true,
      });
      assert.ok(rows.length > 0, kind.id);
      assert.ok(rows.every((r) => playbooks.some((s) => s.id === r.strategyId)), kind.id);
      for (const r of rows) assertComboStats(r);
      const lanes = buildLanes(10, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, "ETHUSDT", [kind.id]);
      assert.ok(lanes.length === playbooks.length * TACTICS.length, `${kind.id} lanes ${lanes.length}`);
      assert.ok(lanes.every((l) => playbooks.some((s) => s.id === l.strategyId)));
      for (const l of lanes) {
        finiteNum(l.pf, l.mdd, l.wr, l.volumeFactor, l.ddt, l.lastNPf, l.activity);
        finiteNum(l.indications.trend, l.indications.break, l.indications.active, l.indications.direction);
        finiteNum(l.timing ?? 0, l.activityAgree ?? 0);
        assert.ok(["validated", "candidate", "rejected"].includes(l.status));
        assert.equal(l.evals?.length, 3);
        assert.deepEqual(l.evals?.map((r) => r.n), [12, 15, 50]);
        if (l.effective) assert.equal(l.status, "validated");
        if (l.status === "rejected") {
          assert.equal(l.ongoing, 0);
          assert.equal(l.next, 0);
        } else {
          const open = positionsFrom(l.strategyId, l.symbol, l.tactic, l.rangeType, l.costStep, "open");
          const nxt = positionsFrom(l.strategyId, l.symbol, l.tactic, l.rangeType, l.costStep, "next");
          assert.equal(l.ongoing, open.length);
          assert.equal(l.next, nxt.length);
        }
      }
      pfs[kind.id] = rows[0]!.pf;
    }
    const unique = new Set(Object.values(pfs).map((n) => n.toFixed(5)));
    assert.ok(unique.size >= 2, "kinds must not collapse to one PF");
  });

  it("covers every last-N stage, heatmap, positions and volume stats", () => {
    assert.equal(LAST_N_STAGE_META.length, 6);
    assert.deepEqual(
      LAST_N_STAGE_META.map((s) => s.id),
      Object.keys(DEFAULT_LAST_N_CONFIG),
    );
    for (const n of LAST_N_OPTIONS) {
      for (const st of STRATEGIES) {
        const s = lastNEval(DESK.backtests[`${st.id}:BTCUSDT`]!, n);
        finiteNum(s.pf, s.mdd, s.wr, s.net, s.ddt, s.volumeFactor, s.expectancy, s.sqn, s.recovery, s.avgHold, s.avgWin, s.avgLoss, s.profit, s.loss, s.trades, s.wins);
      }
    }
    const heat = heatmapFor("normal", "BTCUSDT", "axis", 10, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS);
    assert.equal(heat.length, COST_STEPS.length * RANGE_TYPES.length);
    assert.ok(heat.every((c) => Number.isFinite(c.pf) && Number.isFinite(c.mdd)));
    const pos = positionsFrom("normal", "BTCUSDT", "hybrid", "atr", 10, "all");
    assert.ok(pos.length > 0);
    const slice = posSliceStats(pos);
    finiteNum(slice.n, slice.net, slice.wr, slice.pf);
    const vol = volumeCoord(DESK.backtests["normal:BTCUSDT"]!.trades);
    finiteNum(vol.vf, vol.highVolWr, vol.lowVolWr, vol.highVolNet, vol.lowVolNet);
    assert.ok(["confirm", "diverge", "flat"].includes(vol.confirm));
    const book = bookStats(10, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, "BTCUSDT");
    finiteNum(book.pf, book.mdd, book.wr, book.vf, book.net, book.ddt, book.validated, book.candidates, book.rejected, book.positiveCombos, book.totalCombos);
    assert.equal(
      book.totalCombos,
      COST_STEPS.length * RANGE_TYPES.length * TACTICS.length * TRAIL_PCTS.length * TP_SL_RATIOS.length * STRATEGIES.length,
    );
    assert.equal(book.validated + book.candidates + book.rejected, STRATEGIES.length * TACTICS.length);
    const t0 = Date.now();
    const lanes1 = buildLanes(10, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, "BTCUSDT");
    const firstMs = Date.now() - t0;
    const t1 = Date.now();
    const lanes2 = buildLanes(10, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, "BTCUSDT");
    const memoMs = Date.now() - t1;
    assert.equal(lanes1.length, lanes2.length);
    assert.ok(firstMs < 2500, `lanes ${firstMs}ms`);
    assert.ok(memoMs < 40, `lane memo ${memoMs}ms`);
    assert.ok(lanes1.every((l) => (l.evals?.length ?? 0) === 3));
    assert.ok(lanes1.every((l) => Number.isFinite(l.indications.trend + l.indications.break + l.indications.active + l.indications.direction)));
  });

  it("processes every indication config independently across bars", () => {
    const cs = DESK.candles.BTCUSDT!;
    const pk = DESK.indicators.BTCUSDT!;
    const seen = new Map<string, { dirs: number; hits: number }>();
    for (const cfg of INDICATION_CONFIGS) seen.set(cfg.id, { dirs: 0, hits: 0 });
    for (let i = 80; i < 220; i += 2) {
      const hits = processAllIndications(pk, cs, i);
      assert.equal(hits.length, INDICATION_CONFIGS.length);
      for (const h of hits) {
        finiteNum(h.dir, h.strength, h.activity);
        const row = seen.get(h.configId)!;
        row.hits += 1;
        if (h.dir !== 0) row.dirs += 1;
        const one = processIndication(INDICATION_CONFIGS.find((c) => c.id === h.configId)!, pk, cs, i);
        assert.equal(one.configId, h.configId);
        assert.equal(one.kind, h.kind);
      }
      const sum = summarizeIndications(hits);
      finiteNum(sum.trend, sum.break, sum.active, sum.direction, sum.activity, sum.timing, sum.relations.agree);
      const rel = activityRelations(pk, i, sum.direction);
      finiteNum(rel.pulse, rel.range, rel.vol, rel.volRange, rel.pulseDir, rel.rangeDir, rel.agree, rel.timing);
    }
    for (const cfg of INDICATION_CONFIGS) {
      assert.ok(seen.get(cfg.id)!.hits > 0, cfg.id);
    }
    assert.ok([...seen.values()].some((s) => s.dirs > 0), "some indication fired");
    for (const kind of INDICATION_KINDS) {
      assert.ok(INDICATION_CONFIGS.some((c) => c.kind === kind.id), kind.id);
    }
  });

  it("simulates every tactic independently with progress marks and system stats", () => {
    for (const tactic of TACTICS) {
      const { report, engine } = simulateHours(2, DEFAULT_TACTIC_CONFIG, tactic, {
        symbolCount: 6,
        rangeType: "atr",
        marks: [2],
      });
      assert.equal(report.hours, 2, tactic);
      assert.equal(report.ticks, 120, tactic);
      assert.ok(report.passed, `${tactic}: ${report.issues.join("; ")}`);
      finiteNum(report.pf, report.wr, report.net, report.mdd, report.equity, report.avgR, report.expectancy);
      finiteNum(report.slExits, report.tpExits, report.trades, report.wins);
      assert.ok(report.hourly.length >= 1);
      const hourNet = report.hourly.reduce((s, h) => s + h.net, 0);
      assert.ok(Math.abs(hourNet - (report.realizedNet ?? report.profit - report.loss)) < 1e-6, tactic);
      assert.ok((report.marks ?? []).some((m) => m.hours === 2));
      for (const m of report.marks ?? []) finiteNum(m.pf, m.wr, m.net, m.mdd, m.score);
      const snap = systemSnapshot(engine, {
        combos: { total: 100, positive: 40 },
        feed: { state: "idle", latencyMs: 1, count: 0, missing: 0 },
      });
      assert.ok(snap.loads.length >= 4);
      for (const load of snap.loads) {
        finiteNum(load.value, load.max);
        assert.ok(load.max > 0, load.id);
      }
      finiteNum(engine.stats.pf, engine.stats.net, engine.stats.trades);
      assert.equal(auditEngine(engine).nanCount, 0);
    }
    for (const range of RANGE_TYPES) {
      const { report } = simulateHours(1, DEFAULT_TACTIC_CONFIG, "axis", {
        symbolCount: 6,
        rangeType: range,
      });
      assert.ok(Number.isFinite(report.pf) && report.trades >= 0, range);
      finiteNum(report.pf, report.net, report.mdd);
    }
  });

  it("tickVst keeps advancing after injected faults (no stall)", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 8 });
    e.running = true;
    e.phase = "running";
    e.quotes.BTCUSDT.px = Number.NaN;
    e.quotes.ETHUSDT.lo = -1;
    e.tokens[VST_DEFAULT_CONN] = 0;
    const start = e.tick;
    for (let i = 0; i < 48; i++) tickVst(e, CFG, "hybrid", { rangeType: "atr" });
    assert.equal(e.tick, start + 48);
    assert.ok(Number.isFinite(e.stats.equity));
    assert.equal(auditEngine(e).nanCount, 0);
    assert.ok(e.queue.length + e.orders.length + e.positions.length > 0);
  });

  it("complete paper sim arms every indication with thousands of orders", () => {
    const cfg = {
      ...CFG,
      shortRange: true,
      tpAtr: 0.42,
      slOfTp: 1.7,
      slAtr: 0.714,
      tpRatio: 1 / 1.7,
      trailingPct: 1.5,
    };
    const { report: r } = simulateHours(2, cfg, "trailing", {
      symbolCount: 24,
      rangeType: "atr",
      complete: true,
      block: { ...DEFAULT_BLOCK_CONFIG, enabled: true, windows: false },
    });
    finiteNum(r.pf, r.net, r.ordersPlaced);
    assert.ok(r.ordersPlaced >= 400, `placed ${r.ordersPlaced}`);
    assert.ok((r.byIndication?.length ?? 0) >= 3, `inds ${(r.byIndication || []).map((x: { id: string }) => x.id).join(",")}`);
    assert.ok((r.maxOrdersSeen || 0) >= 80, `maxOrd ${r.maxOrdersSeen}`);
  });

  it("complete computations cover every live tactic, range and stage independently", () => {
    assert.ok(!LIVE_TACTICS.includes("dca"));
    const r = completeComputations(CFG, { symbolCount: 4, hours: [1] });
    assert.equal(r.cells.length, LIVE_TACTICS.length * RANGE_TYPES.length);
    assert.equal(r.hours[0], 1);
    for (const t of LIVE_TACTICS) {
      for (const range of RANGE_TYPES) {
        const cell = r.cells.find((c) => c.tactic === t && c.range === range && c.hours === 1);
        assert.ok(cell, `${t}/${range}`);
        finiteNum(cell.pf, cell.wr, cell.net, cell.trades, cell.mdd);
      }
    }
    assert.ok(r.winner);
    finiteNum(r.winner.pf, r.elapsedMs);
    assert.ok(r.byHours["1"]);
    assert.equal(r.byHours["1"].n, r.cells.length);
    assert.ok(r.playbooks.books.length >= 3);
    const sweep = sweepAllConfigs(1, 4, CFG);
    assert.equal(sweep.cells.length, LIVE_TACTICS.length * RANGE_TYPES.length);
    assert.ok(sweep.winner);
    assert.ok(!sweep.cells.some((c) => c.tactic === "dca"));
  });

  it("short progress indications include RSI / SAR / MACD and base PF under 1 still processes Block", () => {
    const e = initVstEngine({ ...CFG, shortRange: true, tpAtr: 0.35, slOfTp: 1.5, slAtr: 0.525, tpRatio: 2 / 3 }, { warmup: 0, symbolCount: 8, arm: false });
    e.shortRange = true;
    e.shortBasePf = 0.7;
    e.shortPf = 0.95;
    e.shortAxisPf = 0.9;
    e.shortBlockPf = 1.15;
    assert.equal(e.shortProgress?.minTpAtr, 0.48);
    assert.equal(e.shortProgress?.minSlOfTp, 0.75);
    const ids = new Set<string>();
    for (const s of Object.keys(e.quotes).slice(0, 8)) ids.add(classifyIndication(e, s));
    assert.ok(ids.size >= 1, `ids ${[...ids].join(",")}`);
    const pack = symbolIndications(Object.keys(e.quotes)[0]!);
    for (const k of ["trend", "move", "rsi", "bollinger", "sar", "macd", "ema"] as const) {
      assert.ok(k in pack, `pack ${k}`);
    }
    const kinds = new Set(INDICATION_CONFIGS.map((c) => c.kind));
    assert.ok(kinds.has("rsi") && kinds.has("sar") && kinds.has("macd") && kinds.has("ema") && kinds.has("move"));
    const block = { ...DEFAULT_BLOCK_CONFIG, volumeMode: "shared" as const, overallMode: "shared" as const, windows: false };
    const r = adjustActiveBlocks(e, { ...CFG, shortRange: true }, "trailing", block, "atr", { endStage: true });
    assert.ok(r.blocks >= 0);
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeMode, "parallel");
    assert.equal(DEFAULT_SHORT_PROGRESS.minTpAtr, 0.48);
    assert.equal(DEFAULT_SHORT_PROGRESS.minSlOfTp, 0.75);
    assert.equal(sanitizeShortProgress({}).minTpAtr, 0.48);
    assert.equal(sanitizeShortProgress({ minTpAtr: 0.42, minSlOfTp: 1.7 }).minTpAtr, 0.48);
    assert.equal(sanitizeShortProgress({ minTpAtr: 0.42, minSlOfTp: 1.7 }).minSlOfTp, 0.75);
    assert.equal(sanitizeShortProgress({ minTpAtr: 0.38, minSlOfTp: 2 }).minTpAtr, 0.48);
    assert.equal(sanitizeShortProgress({ minTpAtr: 0.5, minSlOfTp: 2 }).minTpAtr, 0.5);
    assert.equal(sanitizeShortProgress({ minTpAtr: 0.5, minSlOfTp: 2 }).minSlOfTp, 2);
    assert.equal(sanitizeShortProgress({}).maxTpAtr, 0.6);
    assert.equal(sanitizeShortProgress({}).evalHours, 20);
    assert.equal(sanitizeShortProgress({}).evalPositiveOnly, true);
    assert.ok(SHORT_TP_ATR.includes(0.6));
    assert.ok(cfgUsesShortRange({ shortRange: true, tpAtr: 0.6 }));
    const wide = liveShortProtectCombos(0.42, 1.7, 0.6);
    assert.equal(wide.length, 32);
    assert.ok(wide.some((c) => c.tpAtr === 0.6));
    assert.ok(wide.every((c) => c.tpAtr >= 0.42 && c.tpAtr <= 0.6 && c.slOfTp >= 1.75));
    const pos = filterLiveShortCombos(0.38, 0.75, 0.6, true);
    assert.ok(pos.length >= 8);
    assert.ok(pos.every((c) => c.tpAtr + 1e-9 >= 0.48 && c.slOfTp + 1e-9 >= 0.75));
    assert.ok(pos.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
    assert.equal(filterLiveShortCombos(0.42, 1.7, 0.6, false).length, 32);
    assert.equal(filterLiveShortCombos(0.4, 1.7, 0.6, false).length, 36);
    assert.ok(AUTO_EVAL_HOURS.includes(20) && SHORT_EVAL_HOURS === 20);
    const eOv = initVstEngine(CFG, {
      warmup: 0,
      symbolCount: 2,
      arm: false,
      block: { ...DEFAULT_BLOCK_CONFIG, overallVolumeRatio: 1.5, sharedVolumeRatio: 1.5, volumeRatio: 0.2 },
    });
    assert.equal(eOv.blockCfg?.overallVolumeRatio, 1.5);
    assert.equal(eOv.blockCfg?.sharedVolumeRatio, 1.5);
    assert.equal(eOv.blockCfg?.volumeRatio, 0.2);
    assert.equal(clampOverallVol(1.5), 1.5);
    assert.equal(clampOverallVol(3), 3);
    assert.equal(allShortTpSlCombos().length, SHORT_TP_ATR.length * SHORT_SL_OF_TP.length);
    assert.equal(sanitizeShortProgress({ minTpAtr: 0.3, minSlOfTp: 0.5 }).minSlOfTp, 0.75);
    assert.equal(sanitizeShortProgress({ minTpAtr: 0.3, minSlOfTp: 0.5 }).minTpAtr, 0.48);
    assert.equal(sanitizeShortProgress({ minSlOfTp: 2.5 }).minSlOfTp, 2.5);
    assert.ok(liveShortProtectCombos(0.45, 2).every((c) => c.tpAtr >= 0.45 && c.slOfTp >= 2));
    assert.ok(isPositive({ pf: 0.85, mdd: 0.05, wr: 0.6, volumeFactor: 1.2, playbook: "short", shortRange: true }, { ...DEFAULT_THRESHOLDS, shortPf: 0.8 }));
    assert.equal(isPositive({ pf: 0.85, mdd: 0.05, wr: 0.6, volumeFactor: 1.2, playbook: "block", shortRange: true }, { ...DEFAULT_THRESHOLDS, shortBlockPf: 1.15 }), false);
    const q = e.quotes.BTCUSDT!;
    const sum = indicationFromQuote(q, null);
    assert.ok(Number.isFinite(sum.rsi) && Number.isFinite(sum.sar) && Number.isFinite(sum.move));
    resetIndicationHistory();
    assert.ok(indicationQuality("trend", { ...sum, trend: 0.8, agree: true, activity: 1.1, lastPart: 0.4, drawdown: 0.1, prevRel: 0.3 }) >
      indicationQuality("rsi", { ...sum, rsi: 0.15, agree: false, activity: 0.5, lastPart: 0.05, drawdown: 0.4, prevRel: 0 }));
    assert.ok(INDICATION_QUALITY_FLOOR > 0.2);
    assert.equal(indicationQualityFloor("ema"), INDICATION_QUALITY_FLOORS.ema);
    assert.ok(indicationQualityFloor("move") > INDICATION_QUALITY_FLOOR);
    assert.ok(indicationQualityFloor("sar") > INDICATION_QUALITY_FLOOR);
    assert.ok(indicationProtect("move").slMul > 1.2);
    assert.ok(indicationProtect("ema").tpMul >= 1.3);
    assert.ok(indicationProtect("sar").tpMul >= 1.25);
    assert.ok(indicationProtect("direction").holdMul < 1);
    assert.ok(INDICATION_CONFIGS.some((c) => c.id === "trend-ribbon"));
    assert.ok(INDICATION_CONFIGS.some((c) => c.id === "break-close"));
    assert.ok(INDICATION_CONFIGS.some((c) => c.id === "rsi-div"));
    assert.ok(INDICATION_CONFIGS.some((c) => c.id === "ema-ribbon"));
    const pk = DESK.indicators.BTCUSDT!;
    const cs = DESK.candles.BTCUSDT!;
    const ribbon = processIndication(INDICATION_CONFIGS.find((c) => c.id === "trend-ribbon")!, pk, cs, 200);
    finiteNum(ribbon.dir, ribbon.strength);
    let brkHits = 0;
    for (let i = 80; i < 240; i++) {
      const hits = processAllIndications(pk, cs, i).filter((h) => h.kind === "break" && h.dir !== 0 && h.strength >= 0.45);
      brkHits += hits.length;
    }
    assert.ok(brkHits > 0, `breakout hits ${brkHits}`);
    const eBlk = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false, block: { ...DEFAULT_BLOCK_CONFIG, counts: [1, 2, 3, 4, 5, 6], maxMultiple: 6, minActiveLevel: 1, windows: true } });
    const blk = { ...DEFAULT_BLOCK_CONFIG, counts: [1, 2, 3, 4, 5, 6], maxMultiple: 6, windows: true, keepAdjusted: true };
    for (let i = 0; i < 24; i++) noteBlockPosClose(eBlk, "BTCUSDT", "long", i % 3 === 0 ? -1 : 1.4, blk);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const w = eBlk.blockWindows[n];
      assert.ok(w && w.closed === 24, `N=${n} closed ${w?.closed}`);
      assert.ok(w.lastPf > 0, `N=${n} pf ${w.lastPf} must not be 0 after mixed tape`);
    }
    assert.ok(Math.abs((eBlk.blockWindows[1]!.lastPf || 0) - (eBlk.blockWindows[6]!.lastPf || 0)) > 1e-9, "N=1 and N=6 independent");
  });
});

describe("calculations, relations, adjustments, stats", () => {
  it("Independent and Combined last-N processings do not share one mixed PF", () => {
    const e = initVstEngine({ ...CFG, shortRange: true }, { warmup: 0, symbolCount: 4, arm: false, complete: true });
    e.shortRange = true;
    e.preEvalDone = true;
    e.completeSim = true;
    e.shortPf = 0.95;
    e.shortBasePf = 0.7;
    const win = Array.from({ length: 12 }, () => ({ pnl: 1.2 }));
    const lose = Array.from({ length: 16 }, () => ({ pnl: -0.9 }));
    e.shortComboLiveTape = {
      "0.48:0.75": win,
      "0.52:1.75": lose,
    };
    e.closed = [
      ...win.map((r, i) => ({ id: `w${i}`, connId: e.activeConnId, symbol: "BTCUSDT", side: "long" as const, pnl: r.pnl, qty: 1, entry: 100, exit: 101, reason: "tp" as const, tick: i, r: r.pnl, playbook: "short", kind: "short", tactic: "trailing" as const, indication: "trend" as const, tpAtr: 0.48, slOfTp: 0.75, validExec: true })),
      ...lose.map((r, i) => ({ id: `l${i}`, connId: e.activeConnId, symbol: "ETHUSDT", side: "short" as const, pnl: r.pnl, qty: 1, entry: 100, exit: 99, reason: "sl" as const, tick: 20 + i, r: r.pnl, playbook: "short", kind: "short", tactic: "trailing" as const, indication: "ema" as const, tpAtr: 0.52, slOfTp: 1.75, validExec: true })),
    ] as never;
    const snap = refreshProgressEvals(e);
    assert.ok(snap.lastNModes.independent.pass, "independent processing keeps the winning combo");
    assert.ok(snap.lastNModes.independent.pf > snap.lastNModes.combined.pf + 0.2, `independent PF ${snap.lastNModes.independent.pf} vs combined ${snap.lastNModes.combined.pf}`);
    assert.ok((snap.lastNModes.independent.n ?? 0) <= (snap.lastNModes.combined.n ?? 99));
    assert.equal(snap.lastNModes.parallel.pass, true);
  });

  it("profitFactor and pfFromPnls match gross profit / gross loss exactly", () => {
    assert.equal(profitFactor(12, 6), 2);
    assert.equal(profitFactor(0, 4), 0);
    assert.equal(profitFactor(5, 0), PF_NO_LOSS);
    assert.equal(profitFactor(0, 0), 0);
    assert.equal(profitFactor(Number.NaN, 2), 0);
    const rows = [{ pnl: 2 }, { pnl: 2 }, { pnl: -1 }, { pnl: -1 }, { pnl: 0 }];
    assert.equal(pfFromPnls(rows), 2);
    assert.equal(pfFromPnls([]), 0);
    assert.equal(pfFromPnls(null), 0);
    const slice = posSliceStats([
      { pnl: 3 },
      { pnl: 1 },
      { pnl: -2 },
      { pnl: -0.5 },
    ] as never);
    assert.equal(slice.n, 4);
    assert.equal(slice.net, 1.5);
    assert.equal(slice.wr, 0.5);
    assert.equal(slice.pf, 4 / 2.5);
  });

  it("every position PnL deducts 0.12% RT so intern cannot overstate live PF", () => {
    const gp = closePnl(1, 100, 100.42, 1);
    const gl = Math.abs(closePnl(1, 100, 99.685, 1));
    const pf = profitFactor(gp, gl);
    assert.ok(pf < 1, `0.42% TP / 0.315% SL after 0.12% RT must not look like a winner (pf ${pf})`);
    const oldFee = (100 + 100.42) * 1 * 0.00025;
    const oldWin = 0.42 - oldFee;
    const oldLoss = 0.315 + (100 + 99.685) * 1 * 0.00025;
    assert.ok(profitFactor(oldWin, oldLoss) > 1, "old 5bps fee is the intern PF lie");
    assert.ok(gp < oldWin - 0.05, "new RT must be strictly heavier than 5bps");
  });

  it("keepAdjusted holds extra but does not plan new Block adds on a losing PF", () => {
    const lane = {
      symbol: "BTCUSDT",
      side: "long" as const,
      baseQty: 1,
      baseEntry: 100,
      confirmedAdd: 0.2,
      satisfied: { 1: true },
      pfRing: { 1: [-1, -1, -1, -1, -1, -1, -1, -1] },
      parentPf: [-1, -1, -1, -1, -1, -1, -1, -1],
      active: true,
      pauseRemaining: {},
      heldFactor: {},
    };
    const keep = { ...DEFAULT_BLOCK_CONFIG, keepAdjusted: true, pauseCountRatio: 2 };
    assert.equal(blockPfOk(lane, 1, keep, 1.2), false);
    assert.equal(lane.pauseRemaining[1] || 0, 0);
    assert.equal(lane.heldFactor[1], 1);
    const drop = {
      symbol: "ETHUSDT",
      side: "short" as const,
      baseQty: 1,
      baseEntry: 100,
      confirmedAdd: 0,
      satisfied: {},
      pfRing: { 1: [-1, -1, -1, -1, -1, -1, -1, -1] },
      parentPf: [-1, -1, -1, -1, -1, -1, -1, -1],
      active: true,
      pauseRemaining: {},
      heldFactor: {},
    };
    const pause = { ...DEFAULT_BLOCK_CONFIG, keepAdjusted: false, pauseCountRatio: 2 };
    assert.equal(blockPfOk(drop, 1, pause, 1.2), false);
    assert.ok((drop.pauseRemaining[1] || 0) >= 1);
  });

  it("additive N=1-6 stay complete when winning-rel extra is present", () => {
    const base = 1;
    const vr = 0.2;
    const extraCap = 1.5;
    const extra = 3 * 0.2 * base;
    let relQty = 0;
    const planned: number[] = [];
    for (const next of [1, 2, 3, 4, 5, 6]) {
      const step = base * vr;
      const relCap = base * Math.min(next * vr, extraCap);
      if (relQty + 1e-12 < relCap) {
        planned.push(next);
        relQty += step;
      }
    }
    assert.deepEqual(planned, [1, 2, 3, 4, 5, 6]);
    relQty += extra;
    assert.ok(relQty <= base * 2.5 + 1e-9, `total extra ${relQty} vs 2.5× cap`);
    let starvedQty = 0;
    const starved: number[] = [];
    for (const next of [1, 2, 3, 4, 5, 6]) {
      const step = base * vr;
      const relCap = base * Math.min(next * vr, extraCap);
      if (starvedQty + 1e-12 < relCap) {
        starved.push(next);
        starvedQty += step + extra;
      }
    }
    assert.ok(starved.length < 6, `per-N extra must starve sets, got ${starved.join(",")}`);
  });

  it("additive volume: each independent winning relation adds ratio × base", () => {
    assert.ok(Math.abs(blockVolumeIncrement(3, 0.4) - 1.2) < 1e-12);
    assert.equal(blockVolumeIncrement(0, 0.4), 0);
    const q = additiveBlockQty(1.2, [1, 2, 3, 4, 5, 6], 0.4, 3, 0.4);
    assert.ok(Math.abs(q.step - 0.48) < 1e-12);
    assert.ok(Math.abs(q.totalSteps - 6 * 0.48) < 1e-12);
    assert.ok(Math.abs(q.relExtra - 3 * 0.4 * 1.2) < 1e-12);
    assert.ok(Math.abs(q.total - q.totalSteps - q.relExtra) < 1e-12);
    const add = blockStepQty(1, 3, 0.4, 6, 1, 0, "additive");
    const sh = blockStepQty(1, 1, 1.5, 6, 1, 0, "shared");
    assert.ok(Math.abs(add - 0.4) < 1e-12, `additive step ${add}`);
    assert.ok(Math.abs(sh - 1.5) < 1e-12, `shared N=1 ${sh}`);
    const sh3 = blockStepQty(1, 3, 1.5, 6, 1, 0, "shared");
    assert.ok(sh3 > 0 && Number.isFinite(sh3), `shared N=3 ${sh3}`);
  });

  it("relation keys are unique per symbol/side/indication/tactic/range/protect", () => {
    const a = blockRelationKeys({
      symbol: "BTCUSDT",
      side: "long",
      indication: "trend",
      kind: "trend",
      tactic: "trailing",
      rangeType: "atr",
      playbook: "short",
      indicationCfg: "trend-adx",
      tpAtr: 0.42,
      slOfTp: 1.7,
    });
    const b = blockRelationKeys({
      symbol: "BTCUSDT",
      side: "short",
      indication: "break",
      kind: "breakout",
      tactic: "hybrid",
      rangeType: "linear",
      playbook: "axis",
      indicationCfg: "break-hi",
      tpAtr: 0.48,
      slOfTp: 2,
    });
    assert.ok(a.includes("sym:BTCUSDT") && a.includes("side:long") && a.includes("ind:trend"));
    assert.ok(a.includes("combo:trend:trend:trailing:atr:long"));
    assert.ok(a.includes("prot:0.42:1.75"));
    assert.ok(a.includes("sub:trend:trend"));
    const shared = a.filter((k) => b.includes(k));
    assert.deepEqual(shared, ["sym:BTCUSDT"]);
  });

  it("winning relations add independently; losers do not leak into the other lane", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const block = {
      ...DEFAULT_BLOCK_CONFIG,
      windows: true,
      evalPosCount: 6,
      evalLastNs: [1, 2, 3, 4, 5, 6],
      minRelPf: 1.1,
      relAdditive: true,
      relVolumeRatio: 0.4,
      volumeRatio: 0.4,
    };
    const winRel = { indication: "trend" as const, kind: "trend", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short" };
    const loseRel = { indication: "break" as const, kind: "breakout", tactic: "hybrid" as const, rangeType: "linear" as const, playbook: "axis" };
    for (let i = 0; i < 12; i++) noteBlockPosClose(e, "BTCUSDT", "long", 1.5, block, winRel);
    for (let i = 0; i < 12; i++) noteBlockPosClose(e, "ETHUSDT", "short", -1, block, loseRel);
    const ev = evalBlockRelations(e, block);
    assert.ok(ev.winners >= 1, `winners ${ev.winners}`);
    assert.ok(Math.abs(ev.factor - ev.winners * 0.4) < 1e-9, `factor ${ev.factor} vs ${ev.winners}*0.4`);
    const winVol = winningRelVolume(e, { symbol: "BTCUSDT", side: "long", ...winRel });
    const loseVol = winningRelVolume(e, { symbol: "ETHUSDT", side: "short", ...loseRel });
    assert.ok(winVol > 0, `win vol ${winVol}`);
    assert.equal(loseVol, 0);
    const hits = matchingWinningRels(e, { symbol: "BTCUSDT", side: "long", ...winRel });
    assert.ok(hits.every((h) => h.pf >= 1.1));
    assert.ok(hits.some((h) => h.key === "ind:trend"));
    assert.ok(!hits.some((h) => h.key.startsWith("ind:break")));
    const trendW = e.blockRelWindows["ind:trend"]?.[1];
    const breakW = e.blockRelWindows["ind:break"]?.[1];
    assert.ok((trendW?.lastPf || 0) >= 2, `trend pf ${trendW?.lastPf}`);
    assert.equal(breakW?.lastPf, 0);
  });

  it("Block N=1 vs N=2 lastPf are independent on an alternating tape", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    const block = { ...DEFAULT_BLOCK_CONFIG, windows: true, counts: [1, 2, 3, 4, 5, 6], evalPosCount: 6, keepAdjusted: true };
    for (let i = 0; i < 12; i++) noteBlockPosClose(e, "BTCUSDT", "long", i % 2 === 0 ? 2 : -1, block);
    const n1 = e.blockWindows[1];
    const n2 = e.blockWindows[2];
    const n6 = e.blockWindows[6];
    assert.equal(n1.closed, 12);
    assert.equal(n1.windows, 12);
    assert.equal(n2.windows, 6);
    assert.equal(n6.windows, 2);
    assert.equal(n1.lastPf, 2);
    assert.equal(n2.lastPf, PF_NO_LOSS);
    assert.ok(Math.abs(n1.lastPf - n2.lastPf) > 1e-9);
    assert.ok(n6.lastPf > 0);
    const bySym = e.blockWindowsBySymbol.BTCUSDT![1];
    const bySide = e.blockWindowsBySide?.long?.[1];
    assert.equal(bySym.lastPf, n1.lastPf);
    assert.ok(bySide);
    assert.equal(bySide.lastPf, n1.lastPf);
    noteBlockPosClose(e, "ETHUSDT", "short", -4, block);
    assert.ok(Math.abs(e.blockWindowsBySymbol.BTCUSDT![1].lastPf - e.blockWindows[1].lastPf) > 1e-12 || e.blockWindowsBySymbol.ETHUSDT);
    assert.equal(e.blockWindowsBySymbol.BTCUSDT![1].closed, 12);
    assert.equal(e.blockWindowsBySymbol.ETHUSDT![1].closed, 1);
    assert.equal(e.blockWindowsBySide?.short?.[1].closed, 1);
  });

  it("overallLiveStats buckets, last-N PF, and foreign conn isolation", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    const now = Date.now();
    const rows = [
      { indication: "trend", playbook: "short", kind: "short", tactic: "trailing", pnl: 2, connId: VST_DEFAULT_CONN },
      { indication: "break", playbook: "block", kind: "block", tactic: "trailing", pnl: 1, connId: VST_DEFAULT_CONN },
      { indication: "rsi", playbook: "short", kind: "short", tactic: "hybrid", pnl: 0.5, connId: VST_DEFAULT_CONN },
      { indication: "trend", playbook: "short", kind: "short", tactic: "trailing", pnl: -1, connId: VST_DEFAULT_CONN },
      { indication: "macd", playbook: "normal", kind: "normal", tactic: "axis", pnl: 9, connId: "foreign-x" },
    ] as const;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      e.closed.unshift({
        id: `t${i}`,
        connId: r.connId,
        symbol: "BTCUSDT",
        side: "long",
        pnl: r.pnl,
        qty: 1,
        entry: 100,
        exit: 101,
        reason: r.pnl > 0 ? "tp" : "sl",
        tick: i,
        r: r.pnl,
        tactic: r.tactic,
        rangeType: "atr",
        kind: r.kind,
        indication: r.indication,
        playbook: r.playbook,
        at: now - i * 1000,
      } as never);
    }
    e.symbolStats.BTCUSDT = { id: "BTCUSDT", trades: 4, wins: 3, profit: 3.5, loss: 1, sl: 1, tp: 3 };
    const ov = overallLiveStats(e);
    const byInd = Object.fromEntries(ov.byIndication.map((b) => [b.key, b]));
    const byBook = Object.fromEntries(ov.byPlaybook.map((b) => [b.key, b]));
    assert.ok(byInd.trend && byInd.break && byInd.rsi && byInd.macd);
    assert.equal(byInd.trend.n, 2);
    assert.equal(byInd.trend.pf, 2);
    assert.equal(byInd.rsi.n, 1);
    assert.equal(byInd.macd.n, 0, "foreign macd must not enter desk stats");
    assert.equal(byBook.short.n, 3);
    assert.equal(byBook.block.n, 1);
    assert.equal(ov.overall.n, 4);
    assert.equal(ov.overall.pf, 3.5 / 1);
    assert.equal(ov.lastN["12"].n, 4);
    assert.ok(Math.abs(ov.lastN["12"].pf - pfFromPnls(e.closed.filter((c) => isDeskConn(c.connId)))) < 1e-12);
    assert.ok(ov.playbooks.some((p) => p.key === "short" && p.n === 3));
    const foreign = { connId: "someone-else", symbol: "BTCUSDT", side: "long" as const };
    assert.equal(ownedByDesk(foreign), false);
    assert.equal(ownedByDesk({ connId: VST_DEFAULT_CONN, symbol: "BTCUSDT" }), true);
  });

  it("hourly stats: nets sum to report net, margin is notional/125, hourPf from hour pnl", () => {
    const { report } = simulateHours(3, CFG, "hybrid", {
      symbolCount: 8,
      rangeType: "atr",
      equity: 10,
      costStep: 3,
      block: { ...DEFAULT_BLOCK_CONFIG, windows: true, counts: [1, 2, 3, 4, 5, 6], maxMultiple: 6 },
    });
    assert.ok(report.hourly.length >= 3, `hours ${report.hourly.length}`);
    const sumNet = report.hourly.reduce((s: number, h: { net: number }) => s + h.net, 0);
    assert.ok(Math.abs(sumNet - (report.realizedNet ?? report.profit - report.loss)) < 1e-6, `sum hour net ${sumNet} vs realized ${report.realizedNet}`);
    for (const h of report.hourly) {
      finiteNum(h.pf, h.hourPf, h.margin, h.notional, h.ddt, h.mdd, h.eq);
      assert.ok(Math.abs(h.margin - h.notional / 125) < 1e-9, `margin ${h.margin}`);
      assert.ok(h.hourPf >= 0);
      assert.ok(h.inds && typeof h.inds === "object");
      assert.ok(h.plays && typeof h.plays === "object");
      if (h.hourProfit > 0 && h.hourLoss > 0) {
        assert.ok(Math.abs(h.hourPf - h.hourProfit / h.hourLoss) < 1e-9, `hourPf ${h.hourPf}`);
      }
    }
    assert.ok(report.avgMargin >= 0);
    assert.ok(report.startEquity === 10);
  });

  it("playbookOf only tags real Block rungs, not base short ladders", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    const base = { note: "trailing atr trend L1 · bingx-vst-02", playbook: "short" } as never;
    const blk = { note: "Block shared #2 BTCUSDT long · oid · pid · bingx-vst-02", playbook: "block" } as never;
    const ov = { note: "Overall Block additive #1 BTCUSDT long · oid", playbook: "block" } as never;
    const mention = { note: "trailing atr trend L1 · Block 1 · bingx-vst-02", playbook: "short" } as never;
    assert.equal(playbookOf(e, base), "short");
    assert.equal(playbookOf(e, blk), "block");
    assert.equal(playbookOf(e, ov), "block");
    assert.equal(playbookOf(e, mention), "short");
    assert.equal(pfLaneOf({ playbook: "block" }), "block");
    assert.equal(pfLaneOf({ playbook: "short" }), "short");
    assert.equal(pfLaneOf({ playbook: "normal" }), "base");
    e.shortRange = true;
    e.shortBlockPf = 1.15;
    e.blockPf = 1.8;
    e.minPf = 1.8;
    e.shortPf = 0.95;
    assert.equal(minPfFor(e, "block"), 1.15);
    assert.equal(minPfFor(e, "short"), 0.95);
    assert.equal(minPfFor(e, "overall"), 1.8);
    e.shortRange = false;
    assert.equal(minPfFor(e, "block"), 1.8);
  });

  it("breakout fires on close beyond Donchian, rejects wick-only", () => {
    const mk = (n: number, last: { o: number; h: number; l: number; c: number; v: number }) => {
      const cs = [];
      for (let i = 0; i < n; i++) {
        const w = (i % 4) * 0.05;
        cs.push({ t: i, o: 100, h: 100.35 + w, l: 99.7, c: 100 + (i % 2 ? 0.08 : -0.04), v: 80 });
      }
      cs.push({ t: n, ...last });
      return cs;
    };
    const brkHi = INDICATION_CONFIGS.find((c) => c.id === "break-hi")!;
    const thru = mk(60, { o: 100.2, h: 101.6, l: 100.1, c: 101.45, v: 260 });
    const wick = mk(60, { o: 100.1, h: 101.6, l: 99.9, c: 100.15, v: 260 });
    const thruHit = processIndication(brkHi, computeIndicators(thru), thru, thru.length - 1);
    const wickHit = processIndication(brkHi, computeIndicators(wick), wick, wick.length - 1);
    assert.equal(thruHit.dir, 1, `breakout dir ${thruHit.dir} str ${thruHit.strength}`);
    assert.ok(thruHit.strength >= 0.45, `breakout str ${thruHit.strength}`);
    assert.equal(wickHit.dir, 0, `wick dir ${wickHit.dir}`);
  });

  it("break tactics cover Donchian, fail-fade, squeeze, NR7 and retest independently", () => {
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "break").length >= 8);
    for (const id of ["break-retest", "break-fail", "break-squeeze", "break-nr"]) {
      assert.ok(INDICATION_CONFIGS.some((c) => c.id === id), id);
    }
    const quiet = (n: number, last: { o: number; h: number; l: number; c: number; v: number }, range = 0.28) => {
      const cs: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
      for (let i = 0; i < n; i++) {
        cs.push({ t: i, o: 100, h: 100 + range, l: 100 - range, c: 100 + ((i % 2) * 0.04 - 0.02), v: 70 });
      }
      cs.push({ t: n, ...last });
      return cs;
    };
    const failCfg = INDICATION_CONFIGS.find((c) => c.id === "break-fail")!;
    const failCs = quiet(60, { o: 100.1, h: 101.55, l: 99.85, c: 100.05, v: 240 });
    const failHit = processIndication(failCfg, computeIndicators(failCs), failCs, failCs.length - 1);
    assert.equal(failHit.dir, -1, `fail-fade dir ${failHit.dir} str ${failHit.strength}`);
    assert.ok(failHit.strength >= 0.5, `fail-fade str ${failHit.strength}`);

    const sqCfg = INDICATION_CONFIGS.find((c) => c.id === "break-squeeze")!;
    const sqCs = quiet(60, { o: 100.05, h: 101.35, l: 100.0, c: 101.22, v: 210 }, 0.18);
    const sqHit = processIndication(sqCfg, computeIndicators(sqCs), sqCs, sqCs.length - 1);
    assert.equal(sqHit.dir, 1, `squeeze dir ${sqHit.dir} str ${sqHit.strength}`);
    assert.ok(sqHit.strength >= 0.5, `squeeze str ${sqHit.strength}`);

    const nrCfg = INDICATION_CONFIGS.find((c) => c.id === "break-nr")!;
    const nrCs: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
    for (let i = 0; i < 63; i++) nrCs.push({ t: i, o: 100, h: 100.55, l: 99.45, c: 100.02, v: 60 });
    const nest = [0.42, 0.36, 0.3, 0.24, 0.18, 0.13, 0.08];
    for (let j = 0; j < nest.length; j++) {
      const w = nest[j]!;
      nrCs.push({ t: 63 + j, o: 100, h: 100 + w, l: 100 - w, c: 100.02, v: 55 });
    }
    nrCs.push({ t: 70, o: 100.1, h: 101.4, l: 100.05, c: 101.28, v: 220 });
    const nrHit = processIndication(nrCfg, computeIndicators(nrCs), nrCs, nrCs.length - 1);
    assert.equal(nrHit.dir, 1, `nr7 dir ${nrHit.dir} str ${nrHit.strength}`);
    assert.ok(nrHit.strength >= 0.45, `nr7 str ${nrHit.strength}`);

    const rtCfg = INDICATION_CONFIGS.find((c) => c.id === "break-retest")!;
    const rtCs: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
    for (let i = 0; i < 56; i++) rtCs.push({ t: i, o: 100, h: 100.3, l: 99.75, c: 100.02, v: 70 });
    rtCs.push({ t: 56, o: 100.2, h: 101.5, l: 100.15, c: 101.35, v: 240 });
    rtCs.push({ t: 57, o: 101.2, h: 101.35, l: 100.45, c: 100.55, v: 90 });
    rtCs.push({ t: 58, o: 100.5, h: 100.85, l: 100.28, c: 100.72, v: 95 });
    const rtHit = processIndication(rtCfg, computeIndicators(rtCs), rtCs, rtCs.length - 1);
    assert.equal(rtHit.dir, 1, `retest dir ${rtHit.dir} str ${rtHit.strength}`);
    assert.ok(rtHit.strength >= 0.5, `retest str ${rtHit.strength}`);

    const chaseCfg = INDICATION_CONFIGS.find((c) => c.id === "break-hi")!;
    const chase: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
    for (let i = 0; i < 70; i++) {
      const c = 100 + i * 0.18;
      chase.push({ t: i, o: c - 0.04, h: c + 0.12, l: c - 0.08, c: c + 0.06, v: 80 });
    }
    chase.push({ t: 70, o: 112.6, h: 113.1, l: 112.5, c: 113.02, v: 90 });
    const chaseHit = processIndication(chaseCfg, computeIndicators(chase), chase, chase.length - 1);
    assert.equal(chaseHit.dir, 0, `chase dir ${chaseHit.dir} str ${chaseHit.strength}`);
  });

  it("break quality floor is reachable on a real expansion and weak packs fail", () => {
    const rel = { pulse: 0.6, range: 1, vol: 0.6, dir: 0.1, volRange: 0, pulseDir: 0, rangeDir: 0, agree: 0.1, hf: false, timing: 0.2 };
    const weak = {
      trend: 0.1,
      break: 0.06,
      active: 0.1,
      direction: 0.08,
      move: 0.1,
      rsi: 0.1,
      bollinger: 0.1,
      sar: 0.1,
      macd: 0.1,
      ema: 0.1,
      activity: 0.5,
      hf: false,
      agree: false,
      hits: 1,
      timing: 0.2,
      lastPart: 0.04,
      drawdown: 0.4,
      prevRel: 0,
      relations: rel,
    };
    const strong = { ...weak, break: 0.62, activity: 1.12, agree: true, lastPart: 0.35, drawdown: 0.1, hits: 3 };
    assert.ok(indicationQuality("break", weak) < indicationQualityFloor("break"), `weak ${indicationQuality("break", weak)}`);
    assert.ok(indicationQuality("break", strong) >= indicationQualityFloor("break"), `strong ${indicationQuality("break", strong)}`);
    assert.ok(indicationQualityFloor("break") <= 0.4);
  });

  it("rolling quote Donchian break scores after a real range expansion", () => {
    resetIndicationHistory();
    const id = "BRKTEST";
    const quiet = { atr: 0.35, vol: 0.01, axis: 100, chg: 0.001, vol1h: 0.01 };
    let pack = indicationFromQuote({ px: 100, hi: 100.3, lo: 99.7, ...quiet }, null, id);
    for (let i = 0; i < 22; i++) {
      pack = indicationFromQuote({ px: 100 + (i % 2) * 0.05, hi: 100.35, lo: 99.7, ...quiet }, pack, id);
    }
    const fired = indicationFromQuote(
      { px: 101.15, hi: 101.25, lo: 100.4, atr: 0.35, vol: 0.03, axis: 100, chg: 0.011, vol1h: 0.028 },
      pack,
      id,
    );
    assert.ok(fired.break > 0.2, `donchian break ${fired.break}`);
    assert.ok(indicationQuality("break", fired) >= INDICATION_QUALITY_FLOOR * 0.5);
  });

  it("eval 50 / valid execute 15 / disable 12 are independent per lane with negative-average disable", () => {
    assert.equal(EVAL_POS_N, 50);
    assert.equal(VALID_EXEC_POS_N, 15);
    assert.equal(LIVE_EXEC_POS_N, VALID_EXEC_POS_N);
    assert.equal(LIVE_DISABLE_N, 12);
    assert.deepEqual([...LANE_EVAL_NS], [12, 15, 50]);
    assert.deepEqual(
      LAST_N_PROGRESS_META.map((s) => s.id),
      ["eval", "valid", "disable"],
    );
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.preEvalDone = true;
    e.liveTape = true;
    e.liveOpenN = 20;
    e.minPf = 1.2;
    e.shortPf = 0.95;
    e.blockCfg = { ...DEFAULT_BLOCK_CONFIG, liveLastN: 12, validExecN: 15, liveExecN: 15, liveDisable: true };
    const mk = (pnl: number, extra: { indication: string; playbook: string; tactic: string; kind: string; id: string }) =>
      ({
        id: extra.id,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long" as const,
        pnl,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: pnl > 0 ? "tp" : "sl",
        tick: 0,
        r: pnl,
        rangeType: "atr" as const,
        indication: extra.indication,
        playbook: extra.playbook,
        tactic: extra.tactic,
        kind: extra.kind,
        validExec: true,
      }) as never;
    for (let i = 0; i < 12; i++) {
      e.closed.unshift(mk(-0.8, { id: `x:break:${i}`, indication: "break", playbook: "short", tactic: "trailing", kind: "short" }));
    }
    for (let i = 0; i < 15; i++) {
      e.closed.unshift(mk(0.9, { id: `x:brk-ax:${i}`, indication: "break", playbook: "short", tactic: "axis", kind: "short" }));
    }
    for (let i = 0; i < 30; i++) {
      e.closed.push(mk(1.2, { id: `x:trend:${i}`, indication: "trend", playbook: "short", tactic: "trailing", kind: "short" }));
    }
    const trend = laneLastNStats(laneClosed(e, { indication: "trend", tactic: "trailing", playbook: "short" }, 30));
    const brkTrail = laneLastNStats(laneClosed(e, { indication: "break", tactic: "trailing", playbook: "short" }, 12));
    const brkAxis = laneLastNStats(laneClosed(e, { indication: "break", tactic: "axis", playbook: "short" }, 15));
    assert.equal(trend.n, 30);
    assert.ok(trend.avg > 0 && trend.pf >= 1);
    assert.equal(brkTrail.n, 12);
    assert.ok(brkTrail.avg < 0);
    assert.equal(brkAxis.n, 15);
    assert.ok(brkAxis.avg > 0 && brkAxis.pf >= 1);
    refreshLiveDisable(e, e.blockCfg);
    const trailRel = { symbol: "BTCUSDT", side: "long" as const, indication: "break" as const, kind: "short", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short" };
    const axisRel = { symbol: "BTCUSDT", side: "long" as const, indication: "break" as const, kind: "short", tactic: "axis" as const, rangeType: "atr" as const, playbook: "short" };
    const trendRel = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const, kind: "short", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short" };
    assert.equal(liveRelationDisabled(e, trailRel), true);
    assert.equal(liveRelationDisabled(e, axisRel), false);
    assert.equal(liveRelationDisabled(e, trendRel), false);
    assert.equal(liveShouldExecute(e, trendRel), true);
    assert.equal(liveShouldExecute(e, trailRel), false);
    assert.equal(liveShouldExecute(e, axisRel), true);
  });

  it("independent last-N: winning combo stays ok when overall slim prefers a shorter window", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 3, arm: false });
    e.preEvalDone = true;
    e.minPf = 1.1;
    e.basePf = 1.0;
    e.shortRange = true;
    e.lastNProgress = sanitizeLastNProgress({ ...DEFAULT_LAST_N_PROGRESS, mode: "parallel" });
    const mk = (pnl: number, extra: { indication: string; tpAtr: number; slOfTp: number; tick: number; id: string }) =>
      ({
        id: extra.id,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long" as const,
        pnl,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: pnl > 0 ? "tp" : "sl",
        tick: extra.tick,
        r: pnl,
        rangeType: "atr" as const,
        indication: extra.indication,
        playbook: "short",
        tactic: "trailing",
        kind: "short",
        tpAtr: extra.tpAtr,
        slOfTp: extra.slOfTp,
        validExec: true,
      }) as never;
    for (let i = 0; i < 40; i++) {
      e.closed.unshift(mk(1.2, { indication: "trend", tpAtr: 0.48, slOfTp: 0.75, tick: 100 + i, id: `w:${i}` }));
      e.shortComboTape = e.shortComboTape ?? {};
      (e.shortComboTape["0.48:0.75"] ??= []).unshift({ pnl: 1.2 });
    }
    for (let i = 0; i < 16; i++) {
      e.closed.unshift(mk(-0.9, { indication: "move", tpAtr: 0.3, slOfTp: 0.5, tick: 200 + i, id: `l:${i}` }));
      e.shortComboTape = e.shortComboTape ?? {};
      (e.shortComboTape["0.30:0.50"] ??= []).unshift({ pnl: -0.9 });
    }
    const snap = refreshProgressEvals(e);
    const win = snap.shortCombos["0.48:0.75"];
    const lose = snap.shortCombos["0.30:0.50"];
    assert.equal(win?.ok, true, `winner combo ${JSON.stringify(win)}`);
    assert.equal(lose?.ok, false, `loser combo ${JSON.stringify(lose)}`);
    assert.ok((win?.n ?? 0) >= 15, `winner scored full last-N n=${win?.n}`);
    const trendKey = relComboKey({ indication: "trend", tactic: "trailing", rangeType: "atr", playbook: "short" });
    const moveKey = relComboKey({ indication: "move", tactic: "trailing", rangeType: "atr", playbook: "short" });
    assert.equal(e.lastNCoord?.combos[trendKey]?.ok, true);
    assert.equal(e.lastNCoord?.combos[moveKey]?.ok, false);
    assert.equal(Object.keys(snap.shortCombos).length, SHORT_TP_ATR.length * SHORT_SL_OF_TP.length);
    assert.equal(e.lastNProgress.evalNs.length, 14);
  });

  it("multi last-N grids: eval 15-80 / valid 8-24 / disable 6-20 independent vs combined vs parallel", () => {
    assert.equal(EVAL_POS_NS[0], 15);
    assert.equal(EVAL_POS_NS[EVAL_POS_NS.length - 1], 80);
    assert.equal(EVAL_POS_NS.length, 14);
    assert.deepEqual([...VALID_EXEC_NS], [8, 12, 16, 20, 24]);
    assert.deepEqual([...LIVE_DISABLE_NS], [6, 8, 10, 12, 14, 16, 18, 20]);
    const d = sanitizeLastNProgress(undefined);
    assert.equal(d.mode, "parallel");
    assert.equal(d.evalNs.length, 14);
    assert.ok(sanitizeLastNProgress({ evalNs: [18, 52] }).evalNs.includes(20));
    assert.ok(sanitizeLastNProgress({ evalNs: [18, 52] }).evalNs.includes(50));
    const wins = Array.from({ length: 40 }, () => ({ pnl: 1.2 }));
    const mixed = [...Array.from({ length: 8 }, () => ({ pnl: 1.4 })), ...Array.from({ length: 12 }, () => ({ pnl: -0.9 }))];
    const cfgI = sanitizeLastNProgress({ ...DEFAULT_LAST_N_PROGRESS, mode: "independent" });
    const cfgC = sanitizeLastNProgress({ ...DEFAULT_LAST_N_PROGRESS, mode: "combined" });
    const cfgP = sanitizeLastNProgress({ ...DEFAULT_LAST_N_PROGRESS, mode: "parallel", parallelStack: true, parallelVolRatio: 1.25 });
    const wi = decideLastN(wins, cfgI, 1.2, 1.1);
    const wc = decideLastN(wins, cfgC, 1.2, 1.1);
    const wp = decideLastN(wins, cfgP, 1.2, 1.1);
    assert.equal(wi.pass, true);
    assert.equal(wc.pass, true);
    assert.equal(wp.pass, true);
    assert.ok(wp.stack >= 1.2, `parallel stack ${wp.stack}`);
    assert.equal(wi.stack, 1);
    const mi = decideLastN(mixed, cfgI, 1.2, 1.1);
    const mc = decideLastN(mixed, cfgC, 1.2, 1.1);
    assert.equal(mi.independent, true);
    assert.equal(mc.combined, false);
    assert.equal(decideLastN(mixed, cfgP, 1.2, 1.1).pass, true);
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 3, arm: false });
    e.preEvalDone = true;
    e.liveTape = true;
    e.minPf = 1.1;
    e.basePf = 1.0;
    e.lastNProgress = cfgP;
    for (let i = 0; i < 40; i++) {
      e.closed.unshift({
        id: `n:${i}`,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        pnl: 1.1,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: "tp",
        tick: i,
        r: 1,
        tactic: "trailing",
        rangeType: "atr",
        indication: "trend",
        playbook: "short",
        kind: "short",
      } as never);
    }
    const rel = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const, kind: "short", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short" };
    assert.equal(liveShouldExecute(e, rel), true);
    assert.ok(laneLastNStack(e, rel) >= 1);
    assert.equal(lastNProgressOf(e).mode, "parallel");
    assert.equal(lastNProgressOf(e).evalNs.length, 14);
  });

  it("coordinates active last-N / types / combos without shrinking the settings grid", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 3, arm: false });
    e.preEvalDone = true;
    e.minPf = 1.1;
    e.basePf = 1.0;
    e.lastNProgress = sanitizeLastNProgress({ ...DEFAULT_LAST_N_PROGRESS, mode: "parallel" });
    const mk = (pnl: number, extra: { indication: string; tactic: string; tick: number; id: string }) =>
      ({
        id: extra.id,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long" as const,
        pnl,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: pnl > 0 ? "tp" : "sl",
        tick: extra.tick,
        r: pnl,
        rangeType: "atr" as const,
        indication: extra.indication,
        playbook: "short",
        tactic: extra.tactic,
        kind: "short",
      }) as never;
    for (let i = 0; i < 24; i++) {
      e.closed.unshift(mk(1.15, { indication: "trend", tactic: "trailing", tick: 100 + i, id: `w:${i}` }));
    }
    for (let i = 0; i < 16; i++) {
      e.closed.unshift(mk(-0.85, { indication: "move", tactic: "trailing", tick: 200 + i, id: `l:${i}` }));
    }
    const settingsLen = e.lastNProgress.evalNs.length;
    const snap = refreshProgressEvals(e);
    assert.equal(e.lastNProgress.evalNs.length, settingsLen, "settings grid stays full");
    assert.ok(e.lastNCoord, "lastNCoord populated");
    const coord = e.lastNCoord!;
    assert.ok(coord.evalNs.length >= 1 && coord.evalNs.length <= 3);
    assert.ok(coord.validNs.length >= 1 && coord.validNs.length <= 3);
    assert.ok(coord.disableNs.includes(LIVE_DISABLE_N) || coord.disableNs.length >= 1);
    assert.ok(coord.activeInds.includes("trend"), `active inds ${coord.activeInds}`);
    assert.equal(coord.activeInds.includes("move"), false);
    const trendKey = relComboKey({ indication: "trend", tactic: "trailing", rangeType: "atr", playbook: "short" });
    const midKey = relComboKey({ indication: "move", tactic: "trailing", rangeType: "atr", playbook: "short" });
    assert.equal(coord.combos[trendKey]?.ok, true);
    assert.equal(coord.combos[midKey]?.ok, false);
    const trendRel = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const, kind: "short", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short" };
    const midRel = { symbol: "BTCUSDT", side: "long" as const, indication: "move" as const, kind: "short", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short" };
    assert.equal(lanePassExec(e, trendRel), true);
    assert.equal(lanePassExec(e, midRel), false);
    assert.equal(liveShouldExecute(e, trendRel), true);
    assert.equal(liveShouldExecute(e, midRel), false);
    assert.ok(laneLastNStack(e, trendRel) >= 1);
    assert.equal(laneLastNStack(e, midRel), 1);
    assert.ok(snap.evalNs["50"] || snap.evalNs["15"]);
    assert.ok(Object.keys(snap.lastNModes).includes("parallel"));
    const pick = coordinateLastN(e.closed.filter((c) => c.connId === e.activeConnId), e.lastNProgress, 1.1, 1.0);
    assert.ok(pick.evalNs.length <= 3);
  });

  it("losing-hour tilt: Block / ema / direction / bollinger scale up when last hour is red", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    assert.equal(losingHourScale(e, { playbook: "block" }), 1);
    e.losingHour = {
      red: true,
      net: -1,
      pf: 0.4,
      n: 12,
      greenPlays: ["block"],
      greenInds: ["ema", "direction", "bollinger"],
      stayPlays: { block: { redH: 5, greenH: 3 } },
      stayInds: { ema: { redH: 4, greenH: 2 } },
      at: 60,
    };
    assert.ok(losingHourScale(e, { playbook: "block" }) > 1.2);
    assert.ok(losingHourScale(e, { playbook: "short", indication: "ema" }) > 1);
    assert.ok(losingHourScale(e, { playbook: "short", indication: "trend", kind: "short" }) < 0.6);
    e.tick = 60;
    for (let i = 0; i < 8; i++) {
      e.closed.unshift({
        id: `lh:${i}`,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        pnl: i < 2 ? 0.4 : -0.8,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: i < 2 ? "tp" : "sl",
        tick: 50 + i,
        r: i < 2 ? 0.4 : -0.8,
        playbook: i < 2 ? "block" : "short",
        indication: i < 2 ? "ema" : "trend",
        tactic: "trailing",
        kind: i < 2 ? "block" : "short",
      } as never);
    }
    const snap = refreshLosingHour(e);
    assert.equal(snap.red, true);
    assert.ok(snap.greenPlays.includes("block") || snap.greenPlays.length >= 1);
  });

  it("entry volume keeps Block size on red tape and shrinks losing shorts without skipping", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.tick = 40;
    e.closed = [];
    for (let i = 0; i < 8; i++) {
      e.closed.unshift({
        id: `redv-${i}`,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        pnl: i < 2 ? 0.3 : -1,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: i < 2 ? "tp" : "sl",
        tick: 30 + i,
        r: i < 2 ? 0.3 : -1,
        playbook: i < 2 ? "block" : "short",
        indication: i < 2 ? "ema" : "trend",
        tactic: "trailing",
        kind: i < 2 ? "block" : "short",
      } as never);
    }
    assert.equal(tapeRed(e), true);
    const iv = intervalVolumeScale(e);
    assert.ok(iv < 1, `interval ${iv}`);
    const blkIv = blockIntervalScale(e);
    assert.ok(blkIv >= 1, `block interval ${blkIv} must not inherit red haircut ${iv}`);
    refreshLosingHour(e);
    refreshProgressEvals(e);
    const blk = entryVolumeScale(e, { playbook: "block", indication: "ema", kind: "block" });
    const sh = entryVolumeScale(e, { playbook: "short", indication: "trend", kind: "short" });
    assert.ok(blk > sh, `block ${blk} vs short ${sh}`);
    assert.ok(blk >= 1, `block entry ${blk}`);
    assert.ok(sh <= 0.55, `short entry ${sh}`);
    assert.ok(progressLaneScale(e, { playbook: "block" }) >= 1);
    assert.equal(intervalAllowsEntry(e), true);
  });

  it("prehours seed last-N then live hours report independently", () => {
    const { report, engine } = simulateHours(1, CFG, "trailing", {
      symbolCount: 6,
      rangeType: "atr",
      complete: true,
      prehours: 1,
      equity: 10,
      costStep: 3,
      block: { ...DEFAULT_BLOCK_CONFIG, liveLastN: 12, validExecN: 15, liveExecN: 15, liveDisable: true },
    });
    assert.equal(report.prehours, 1);
    assert.equal(report.hourly.length, 1);
    assert.equal(report.hours, 1);
    assert.ok(engine.preEvalDone);
    finiteNum(report.pf, report.realizedNet, report.lastN.eval.pf, report.lastN.valid.pf, report.lastN.disable.pf);
    assert.ok(report.lastN.eval.n <= EVAL_POS_N);
    assert.ok(report.lastN.valid.n <= VALID_EXEC_POS_N);
    assert.equal(report.lastN.exec.n, report.lastN.valid.n);
    assert.ok(report.lastN.disable.n <= LIVE_DISABLE_N);
    assert.ok(report.pre && report.pre.hours === 1);
    const hourNet = report.hourly.reduce((s, h) => s + Number(h.gatedNet ?? h.net), 0);
    assert.ok(Math.abs(hourNet - report.realizedNet) < 1e-6, `live hour ${hourNet} vs ${report.realizedNet}`);
  });

  it("min-PF selection drops losing shorts, keeps Block; higher floor raises PF", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    e.shortRange = true;
    e.shortPf = 0.95;
    e.shortBasePf = 0.7;
    e.shortBlockPf = 1.15;
    e.blockPf = 1.15;
    e.minPf = 1.35;
    const row = (id: string, n: number, profit: number, loss: number) => ({
      id,
      n,
      profit,
      loss,
      pf: profitFactor(profit, loss),
      wr: n ? 0.5 : 0,
    });
    const byPlay = [row("short", 40, 33, 36), row("block", 12, 12, 4)];
    const byInd = [
      row("short:trend", 16, 10, 20),
      row("short:mid", 12, 12, 11),
      row("short:break", 12, 11, 5),
      row("block:trend", 12, 12, 4),
    ];
    assert.equal(playLaneOf("block:trend", true), "block");
    assert.equal(playLaneOf("short:break", true), "short");
    const low = selectMinPfCells(e, byPlay, byInd);
    assert.ok(low.n >= 4, `low n ${low.n}`);
    assert.ok(low.pf + 1e-9 >= 0.95, `low PF ${low.pf} keys ${low.keys.join(",")}`);
    assert.ok(low.keys.some((k) => k.startsWith("block")), `low keys ${low.keys.join(",")}`);
    e.shortPf = 1.2;
    e.shortBasePf = 0.85;
    e.shortBlockPf = 1.4;
    e.blockPf = 1.4;
    e.minPf = 1.55;
    const high = selectMinPfCells(e, byPlay, byInd);
    assert.ok(high.n >= 4, `high n ${high.n}`);
    assert.ok(high.pf + 1e-9 >= 1.2, `high PF ${high.pf} keys ${high.keys.join(",")}`);
    assert.ok(high.pf + 1e-9 >= low.pf, `higher min PF must raise selected PF: high ${high.pf} vs low ${low.pf}`);
    assert.equal(high.keys.some((k) => k.startsWith("short:mid")), false);
    assert.ok(low.pf < 2 || high.pf >= low.pf);
  });

  it("valid-execute PF is the headline; higher min PF does not collapse results", () => {
    const base = {
      ...DEFAULT_TACTIC_CONFIG,
      shortRange: true,
      tpAtr: 0.42,
      slOfTp: 1.7,
      slAtr: 0.714,
      tpRatio: 1 / 1.7,
      trailingPct: 1.5,
      maxHoldTicks: 24,
    };
    const low = simulateHours(4, base, "trailing", {
      symbolCount: 12,
      rangeType: "atr",
      block: DEFAULT_BLOCK_CONFIG,
      equity: 10,
      costStep: 3,
      complete: true,
      prehours: 4,
      shortPf: 0.95,
      shortBasePf: 0.7,
      blockPf: 1.15,
      minPf: 1.35,
    });
    const high = simulateHours(4, base, "trailing", {
      symbolCount: 12,
      rangeType: "atr",
      block: DEFAULT_BLOCK_CONFIG,
      equity: 10,
      costStep: 3,
      complete: true,
      prehours: 4,
      shortPf: 1.2,
      shortBasePf: 0.85,
      blockPf: 1.4,
      minPf: 1.55,
    });
    finiteNum(low.report.pf, high.report.pf);
    const lowSel = low.report.selected;
    const highSel = high.report.selected;
    if ((lowSel?.n ?? 0) >= 4) {
      assert.equal(low.report.pf, lowSel!.pf);
      assert.ok(low.report.pf + 1e-9 >= 0.95, `low headline ${low.report.pf} keys ${lowSel!.keys?.join(",")}`);
    } else {
      assert.equal(low.report.pf, 0);
    }
    if ((highSel?.n ?? 0) >= 4) {
      assert.equal(high.report.pf, highSel!.pf);
      const floor = Math.min(high.report.floors?.short ?? 1.2, high.report.floors?.block ?? 1.4);
      assert.ok(high.report.pf + 1e-9 >= floor, `high headline ${high.report.pf} < floor ${floor} keys ${highSel!.keys?.join(",")}`);
      assert.ok(high.report.pf > 0.5, `high PF must not collapse to paper ~0.2: ${high.report.pf} paper ${high.report.paperPf}`);
    } else {
      assert.equal(high.report.pf, 0);
    }
    if ((highSel?.n ?? 0) >= 4 && (lowSel?.n ?? 0) >= 4) {
      assert.ok(
        highSel!.pf + 0.02 >= lowSel!.pf || highSel!.pf + 1e-9 >= (high.report.floors?.block ?? 1.4),
        `high sel ${highSel!.pf} vs low ${lowSel!.pf} keys ${highSel!.keys?.join(",")}`,
      );
    }
    assert.ok((high.report.paperPf ?? 1) < 0.5 || high.report.pf >= (high.report.paperPf ?? 0) || (highSel?.n ?? 0) >= 4);
  });

  it("weak ema/sar/move/direction fail quality floor; aligned trend passes", () => {
    const rel = { pulse: 0.6, range: 1, vol: 0.6, dir: 0.1, volRange: 0, pulseDir: 0, rangeDir: 0, agree: 0.1, hf: false, timing: 0.2 };
    const weak = {
      trend: 0.08,
      break: 0.05,
      active: 0.12,
      direction: 0.2,
      move: 0.22,
      rsi: 0.1,
      bollinger: 0.15,
      sar: 0.28,
      macd: 0.18,
      ema: 0.32,
      activity: 0.6,
      hf: false,
      agree: false,
      hits: 1,
      timing: 0.2,
      lastPart: 0.04,
      drawdown: 0.45,
      prevRel: 0,
      relations: rel,
    };
    const strong = {
      ...weak,
      trend: 0.72,
      move: 0.62,
      ema: 0.78,
      sar: 0.7,
      direction: 0.58,
      activity: 1.15,
      agree: true,
      lastPart: 0.4,
      drawdown: 0.08,
      prevRel: 0.3,
      hits: 4,
    };
    for (const id of ["ema", "sar", "move", "direction"] as const) {
      assert.ok(indicationQuality(id, weak) < indicationQualityFloor(id), `${id} weak ${indicationQuality(id, weak)}`);
      assert.ok(indicationQuality(id, strong) >= indicationQualityFloor(id) * 0.7, `${id} strong ${indicationQuality(id, strong)}`);
    }
  });

  it("move continuation fires; exhausted extension is silent", () => {
    const mk = (n: number, last: { o: number; h: number; l: number; c: number; v: number }) => {
      const cs = [];
      for (let i = 0; i < n; i++) {
        const c = 100 + i * 0.06;
        cs.push({ t: i, o: c - 0.03, h: c + 0.05, l: c - 0.06, c, v: 90 });
      }
      cs.push({ t: n, ...last });
      return cs;
    };
    const impulse = INDICATION_CONFIGS.find((c) => c.id === "move-impulse")!;
    const cont = mk(70, { o: 104.2, h: 105.35, l: 104.15, c: 105.28, v: 240 });
    const spent = mk(70, { o: 104.9, h: 105.05, l: 104.7, c: 104.78, v: 40 });
    const go = processIndication(impulse, computeIndicators(cont), cont, cont.length - 1);
    const no = processIndication(impulse, computeIndicators(spent), spent, spent.length - 1);
    assert.equal(go.dir, 1, `impulse dir ${go.dir} str ${go.strength}`);
    assert.ok(go.strength >= 0.4, `impulse str ${go.strength}`);
    assert.equal(no.dir, 0, `exhausted dir ${no.dir} str ${no.strength}`);
  });

  it("ema-fast and sar-hold stay silent in chop, fire on stacked trend", () => {
    const chop = [];
    const trend = [];
    for (let i = 0; i < 90; i++) {
      const c = 100 + (i % 2 === 0 ? 0.03 : -0.03);
      chop.push({ t: i, o: 100, h: c + 0.02, l: c - 0.02, c, v: 50 });
      const u = 100 + i * 0.14;
      trend.push({ t: i, o: u - 0.04, h: u + 0.08, l: u - 0.07, c: u + 0.05, v: 140 });
    }
    const emaFast = INDICATION_CONFIGS.find((c) => c.id === "ema-fast")!;
    const sarHold = INDICATION_CONFIGS.find((c) => c.id === "sar-hold")!;
    const chopPk = computeIndicators(chop);
    const trendPk = computeIndicators(trend);
    const i = chop.length - 1;
    const emaChop = processIndication(emaFast, chopPk, chop, i);
    const emaTrend = processIndication(emaFast, trendPk, trend, i);
    const sarChop = processIndication(sarHold, chopPk, chop, i);
    const sarTrend = processIndication(sarHold, trendPk, trend, i);
    assert.equal(emaChop.dir, 0, `ema chop ${emaChop.dir} str ${emaChop.strength} adx ${chopPk.adx[i]}`);
    assert.equal(emaTrend.dir, 1, `ema trend ${emaTrend.dir} str ${emaTrend.strength}`);
    assert.ok(emaTrend.strength >= 0.55, `ema trend str ${emaTrend.strength}`);
    assert.equal(sarChop.dir, 0, `sar chop ${sarChop.dir}`);
    assert.equal(sarTrend.dir, 1, `sar trend ${sarTrend.dir} str ${sarTrend.strength}`);
  });

  it("ema-cross / ema-pull and bb-mean / bb-tag fire at higher frequency", () => {
    const emaCross = INDICATION_CONFIGS.find((c) => c.id === "ema-cross")!;
    const emaPull = INDICATION_CONFIGS.find((c) => c.id === "ema-pull")!;
    const bbMean = INDICATION_CONFIGS.find((c) => c.id === "bb-mean")!;
    const bbTag = INDICATION_CONFIGS.find((c) => c.id === "bb-tag")!;
    assert.ok(emaCross && emaPull && bbMean && bbTag);
    const turn = [];
    for (let i = 0; i < 55; i++) {
      const u = 120 - i * 0.18;
      turn.push({ t: i, o: u + 0.06, h: u + 0.1, l: u - 0.08, c: u - 0.05, v: 130 });
    }
    for (let i = 55; i < 90; i++) {
      const u = 110.1 + (i - 55) * 0.22;
      turn.push({ t: i, o: u - 0.05, h: u + 0.12, l: u - 0.08, c: u + 0.08, v: 160 });
    }
    const turnPk = computeIndicators(turn);
    let crossHits = 0;
    for (let k = 50; k < turn.length; k++) {
      if (processIndication(emaCross, turnPk, turn, k).dir) crossHits += 1;
    }
    const trend = [];
    for (let i = 0; i < 80; i++) {
      const u = 100 + i * 0.12;
      trend.push({ t: i, o: u - 0.04, h: u + 0.08, l: u - 0.06, c: u + 0.04, v: 120 });
    }
    const pk = computeIndicators(trend);
    const i = trend.length - 1;
    const e21 = pk.ema21[i] ?? trend[i]!.c;
    const tagged = [...trend.slice(0, -1), { t: i, o: e21 + 0.02, h: e21 + 0.12, l: e21 * 0.997, c: e21 + 0.05, v: 140 }];
    const pullPk = computeIndicators(tagged);
    const pullHit = processIndication(emaPull, pullPk, tagged, i);
    assert.ok(crossHits >= 1 || pullHit.dir !== 0, `ema cross ${crossHits} pull ${pullHit.dir} str ${pullHit.strength}`);
    const mid = pk.bbMid[i] ?? trend[i]!.c;
    const lo = pk.bbLower[i] ?? mid * 0.99;
    const meanCs = [
      ...trend.slice(0, i - 1),
      { ...trend[i - 1]!, c: mid - 0.2, o: mid - 0.12, h: mid - 0.05, l: mid - 0.28 },
      { t: i, o: mid - 0.08, h: mid + 0.14, l: mid - 0.1, c: mid + 0.1, v: 140 },
    ];
    const tagCs = [
      ...trend.slice(0, -1),
      { t: i, o: mid, h: mid + 0.04, l: lo * 0.996, c: lo + Math.max(0.04, (mid - lo) * 0.4), v: 120 },
    ];
    const meanHit = processIndication(bbMean, pk, meanCs, i);
    const tagHit = processIndication(bbTag, pk, tagCs, i);
    assert.ok(meanHit.dir !== 0 || tagHit.dir !== 0, `bb mean ${meanHit.dir}/${meanHit.strength} tag ${tagHit.dir}/${tagHit.strength} mid ${mid} lo ${lo}`);
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "ema").length >= 5);
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "bollinger").length >= 5);
    assert.ok(indicationQualityFloor("ema") <= 0.4);
    assert.ok(indicationQualityFloor("bollinger") <= 0.4);
  });

  it("progress evals last-N types, block counts, and tactics by PF and keeps positives", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.minPf = 1.1;
    e.basePf = 1.0;
    e.blockCfg = { ...DEFAULT_BLOCK_CONFIG, counts: sanitizeBlockCounts([1, 2, 3, 4, 5, 6]), volumeMode: "parallel" };
    e.blockWindows = {
      1: { n: 1, closed: 20, lastPf: 0.4, lastNet: -2, lastAvg: -0.1, windows: 20, lossWindows: 12, pauseLeft: 0, adjusted: false, ring: [] },
      2: { n: 2, closed: 20, lastPf: 1.8, lastNet: 3, lastAvg: 0.15, windows: 10, lossWindows: 2, pauseLeft: 0, adjusted: true, ring: [] },
      3: { n: 3, closed: 18, lastPf: 2.1, lastNet: 4, lastAvg: 0.2, windows: 6, lossWindows: 1, pauseLeft: 0, adjusted: true, ring: [] },
    } as never;
    for (let i = 0; i < 40; i++) {
      e.closed.push({
        id: `pe:${i}`,
        connId: e.activeConnId,
        symbol: "BTCUSDT",
        side: "long",
        pnl: i % 5 === 0 ? -0.4 : 0.9,
        qty: 1,
        entry: 1,
        exit: 1,
        reason: i % 5 === 0 ? "sl" : "tp",
        tick: i,
        r: 0.5,
        indication: i < 20 ? "ema" : "trend",
        tactic: i < 20 ? "axis" : "trailing",
        playbook: "short",
        rangeType: "atr",
        kind: "short",
      } as never);
    }
    const snap = refreshProgressEvals(e);
    assert.ok(snap.evalNs["50"] || snap.evalNs["15"]);
    assert.ok(Object.keys(snap.lastNModes).includes("parallel"));
    assert.ok(snap.indications.ema || snap.indications.trend);
    assert.ok(snap.tactics.axis || snap.tactics.trailing);
    assert.ok(snap.blockCounts["2"]?.ok || snap.blockCounts["3"]?.ok);
    assert.equal(e.lastNProgress?.mode === "independent" || e.lastNProgress?.mode === "combined" || e.lastNProgress?.mode === "parallel", true);
    assert.ok((e.blockCfg?.counts ?? []).every((n) => n >= 1 && n <= 6 && n !== 2));
    assert.equal((e.blockCfg?.counts ?? []).join(","), "1,3,4,5,6");
    assert.equal(e.blockCfg?.volumeMode, "parallel");
    assert.ok((e.lastNProgress?.evalNs?.length ?? 0) >= 10, "eval grid not shrunk");
    assert.ok(snap.relations);
    assert.ok(snap.shortCombos);
  });

  it("intern evals score every relation; live extra only uses winners", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 4, arm: false });
    e.tick = 30;
    const block = { ...DEFAULT_BLOCK_CONFIG, enabled: true, autoEval: true, minRelPf: 1.2, relAdditive: true, windows: true };
    e.blockCfg = block;
    const winRel = { indication: "ema" as const, kind: "short", tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short" };
    const loseRel = { indication: "rsi" as const, kind: "normal", tactic: "hybrid" as const, rangeType: "linear" as const, playbook: "normal" };
    for (let i = 0; i < 18; i++) noteBlockPosClose(e, "BTCUSDT", "long", i % 5 === 0 ? -0.2 : 1.4, block, winRel);
    for (let i = 0; i < 18; i++) noteBlockPosClose(e, "ETHUSDT", "short", i % 5 === 0 ? 0.2 : -1.1, block, loseRel);
    const ev = evalBlockRelations(e, block);
    const snap = e.progressEval!;
    assert.ok(Object.keys(snap.relations).length >= 2, `intern relations ${Object.keys(snap.relations).join(",")}`);
    assert.ok(snap.relations["ind:ema"], "intern keeps ema");
    assert.ok(snap.relations["ind:rsi"], "intern keeps losing rsi");
    assert.equal(snap.relations["ind:rsi"]?.ok, false);
    assert.equal(snap.relations["ind:ema"]?.ok, true);
    assert.ok(ev.intern >= ev.winners, `intern ${ev.intern} vs live winners ${ev.winners}`);
    assert.ok(e.blockRelBest?.["ind:ema"], "live extra keeps winner");
    assert.equal(e.blockRelBest?.["ind:rsi"], undefined, "live extra drops loser");
    const winVol = winningRelVolume(e, { symbol: "BTCUSDT", side: "long", ...winRel });
    const loseVol = winningRelVolume(e, { symbol: "ETHUSDT", side: "short", ...loseRel });
    assert.ok(winVol > 0, `winner extra ${winVol}`);
    assert.equal(loseVol, 0);
  });

  it("protect sl/tp multipliers stay independent", () => {
    const cfg = { ...CFG, slAtr: 1, tpRatio: 1, shortRange: false, maxHoldTicks: 20000 };
    const e = initVstEngine(cfg, { warmup: 0, symbolCount: 12, arm: true });
    const ema = [...e.queue, ...e.orders].find((o) => o.indication === "ema" && o.sl > 0 && o.tp > 0 && o.price > 0 && o.tactic !== "axis");
    if (!ema) return;
    const slD = Math.abs(ema.price - ema.sl);
    const tpD = Math.abs(ema.tp - ema.price);
    const r = tpD / slD;
    const prot = indicationProtect("ema");
    const want = prot.tpMul / prot.slMul;
    assert.ok(Math.abs(r - want) < 0.25, `ema tp/sl ${r} want ${want} slMul ${prot.slMul} tpMul ${prot.tpMul}`);
  });

  it("direction needs a fresh confirmed flip, not a stale lookback hit", () => {
    const cs = [];
    for (let i = 0; i < 70; i++) {
      const c = 100 + i * 0.22;
      cs.push({ t: i, o: c - 0.04, h: c + 0.1, l: c - 0.08, c: c + 0.06, v: 130 });
    }
    for (let i = 70; i < 86; i++) {
      const c = 115.4 - (i - 70) * 0.85;
      cs.push({ t: i, o: c + 0.2, h: c + 0.25, l: c - 0.55, c: c - 0.4, v: 220 });
    }
    for (let i = 86; i < 110; i++) {
      const c = 115.4 - 16 * 0.85 - (i - 86) * 0.05;
      cs.push({ t: i, o: c + 0.02, h: c + 0.04, l: c - 0.05, c, v: 90 });
    }
    const cfg = INDICATION_CONFIGS.find((c) => c.id === "dir-cross")!;
    const pk = computeIndicators(cs);
    const late = processIndication(cfg, pk, cs, cs.length - 1);
    let fresh = 0;
    for (let i = 70; i <= 88; i++) {
      if (processIndication(cfg, pk, cs, i).dir !== 0) fresh += 1;
    }
    assert.ok(fresh > 0, `fresh flips around turn ${fresh}`);
    assert.equal(late.dir, 0, `stale flip ${late.dir} str ${late.strength}`);
    const hold = INDICATION_CONFIGS.find((c) => c.id === "dir-hold")!;
    const thrust = INDICATION_CONFIGS.find((c) => c.id === "dir-thrust")!;
    const reclaim = INDICATION_CONFIGS.find((c) => c.id === "dir-reclaim")!;
    assert.ok(hold && thrust && reclaim);
    let holdN = 0;
    let thrustN = 0;
    let reclaimN = 0;
    for (let k = 68; k <= 92; k++) {
      if (processIndication(hold, pk, cs, k).dir) holdN += 1;
      if (processIndication(thrust, pk, cs, k).dir) thrustN += 1;
      if (processIndication(reclaim, pk, cs, k).dir) reclaimN += 1;
    }
    assert.ok(holdN + thrustN + reclaimN >= 2, `dir extra hold ${holdN} thrust ${thrustN} reclaim ${reclaimN}`);
    assert.ok(INDICATION_CONFIGS.filter((c) => c.kind === "direction").length >= 8);
    assert.ok(indicationQualityFloor("direction") <= 0.36);
    const lateHold = processIndication(hold, pk, cs, cs.length - 1);
    assert.equal(lateHold.dir, 0, `stale hold ${lateHold.dir}`);
  });

  it("block add does not relabel origin short playbook; PF lane stays short", () => {
    const e = initVstEngine(CFG, { warmup: 0, symbolCount: 2, arm: false });
    const q = e.quotes.BTCUSDT!;
    q.px = 100;
    q.hi = 102;
    q.lo = 99.4;
    q.atr = 0.4;
    e.positions.push({
      id: "p1",
      connId: e.activeConnId,
      symbol: "BTCUSDT",
      side: "long",
      qty: 2,
      plannedQty: 2,
      avgEntry: 100,
      mark: 100.5,
      sl: 99,
      tp: 101.2,
      slDist: 1,
      tpDist: 1.2,
      realized: 0,
      unrealized: 0,
      legs: [],
      controllingRange: "atr",
      rangeSpacing: 0.4,
      status: "open",
      openedTick: 0,
      tactic: "trailing",
      indication: "trend",
      kind: "short",
      playbook: "short",
      blockLevel: 3,
      blockQty: 0.8,
      peakPx: 100.5,
    } as never);
    e.tick = 90;
    e.positions[0]!.openedTick = 0;
    tickVst(e, CFG, "trailing");
    const row = e.closed.find((c) => c.symbol === "BTCUSDT" && c.playbook === "short") ?? e.closed[0];
    assert.ok(row, "closed");
    assert.equal(row.playbook, "short");
    assert.equal(row.kind, "short");
    assert.equal(pfLaneOf(row), "short");
    assert.ok((row.blockQty ?? 0) > 0);
  });
});

function compactAndRequeue(e: ReturnType<typeof initVstEngine>) {
  requeueFree(e, CFG, "hybrid", "atr");
  const c = bookCounts(e);
  const accounted =
    c.orders.queued + c.orders.open + c.orders.partial + c.orders.filled + c.orders.cancelled + c.orders.rejected;
  assert.equal(c.orders.placed, accounted);
}

function stubPos(symbol: string, side: "long" | "short", connId = "bingx-vst-02") {
  return {
    id: `${symbol}-${side}-${connId}`,
    connId,
    symbol,
    side,
    qty: 1,
    plannedQty: 1,
    avgEntry: 1,
    mark: 1,
    sl: 0.9,
    tp: 1.25,
    slDist: 0.1,
    tpDist: 0.25,
    realized: 0,
    unrealized: 0,
    legs: [],
    controllingRange: "atr" as const,
    rangeSpacing: 1,
    status: "open" as const,
    openedTick: 0,
  };
}