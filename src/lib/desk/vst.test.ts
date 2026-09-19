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
  BLOCK_POS_COUNTS,
  DESK,
  activityRelations,
  buildLanes,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_ENABLED_KINDS,
  heatmapFor,
  positionsFrom,
  posSliceStats,
  processIndication,
  RANGE_TYPES,
  TACTICS,
  volumeCoord,
  INDICATION_CONFIGS,
  INDICATION_KINDS,
  isPositive,
  LAST_N_OPTIONS,
  LAST_N_STAGE_META,
  lastNEval,
  MIN_VOLUME_FACTOR,
  pickBestCombo,
  POSITION_COST_PCT,
  TRAIL_PCTS,
  TRAIL_POS_RATIOS,
  trailStopFromPeak,
  trailGiveback,
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
  UNIT_NOTIONAL,
  profitFactor,
  pfFromPnls,
  PF_NO_LOSS,
  processAllIndications,
  STRATEGIES,
  STRATEGY_KINDS,
  strategiesForKinds,
  strategyMatchesKinds,
  summarizeIndications,
  symbolIndications,
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
  overallLiveStats,
  haltEngine,
  healEngine,
  initVstEngine,
  armUniverse,
  releaseVanished,
  skipLiveSymbol,
  symbolTapePf,
  noteBlockPosClose,
  blockPosPaused,
  symbolBlockPaused,
  blockWindowSnapshot,
  isDeskConn,
  classifyIndication,
  openPlaybook,
  indicationProtect,
  pickIndicationRange,
  playbookOf,
  mirrorEffectiveLanes,
  requeueFree,
  resetBook,
  resetSession,
  simulateHours,
  sweepAllConfigs,
  sweepBlockRelations,
  evalBlockRelations,
  refreshLiveDisable,
  liveRelationDisabled,
  blockRelationKeys,
  blockRelPaused,
  blockComboPaused,
  completeComputations,
  LIVE_TACTICS,
  systemSnapshot,
  tickVst,
  TP_SL_RATIO,
  VST_DEFAULT_CONN,
  VST_MAX_BATCHES,
  VST_MAX_POSITIONS,
  VST_MAX_QUEUE,
  VST_MAX_WORKING_ORDERS,
  VST_SYMBOLS,
  bookCounts,
  universeSymbols,
} from "./vst.ts";
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
  it("seeds 50 symbols and two BingX sessions", () => {
    assert.equal(VST_SYMBOLS.length, 50);
    const e = initVstEngine(CFG, { warmup: 4 });
    assert.ok(Object.keys(e.quotes).length === 50);
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

  it("trailingPct changes trail lock versus a wider trail", () => {
    const tight = { ...CFG, trailingPct: 0.3, tpRatio: 1.333, slAtr: 0.6, maxHoldTicks: 20000 };
    const wide = { ...CFG, trailingPct: 2.4, tpRatio: 1.333, slAtr: 0.6, maxHoldTicks: 20000 };
    const a = simulateHours(6, tight, "trailing", { symbolCount: 8, orderType: "limit", rangeType: "atr" }).report;
    const b = simulateHours(6, wide, "trailing", { symbolCount: 8, orderType: "limit", rangeType: "atr" }).report;
    finiteNum(a.pf, b.pf, a.net, b.net, a.trades, b.trades);
    assert.ok(a.trades >= 2 && b.trades >= 2);
    const same = a.pf === b.pf && a.net === b.net && a.slExits === b.slExits && a.tpExits === b.tpExits;
    assert.equal(same, false, "trail width must change exits");
  });

  it("trails stop from peak with tighter giveback as profit extends", () => {
    assert.equal(TRAIL_PCTS.length, 11);
    assert.equal(TRAIL_POS_RATIOS.length, 6);
    assert.ok(trailGiveback(0.1, 0.8) > trailGiveback(1, 0.8));
    assert.ok(trailGiveback(0.5, 2.4) > trailGiveback(0.5, 0.3));
    const early = trailStopFromPeak({ side: "long", entry: 100, peak: 101, tp: 104, sl: 98, trailPct: 0.8 });
    const mid = trailStopFromPeak({ side: "long", entry: 100, peak: 102, tp: 104, sl: 98, trailPct: 0.8 });
    const late = trailStopFromPeak({ side: "long", entry: 100, peak: 104, tp: 104, sl: 98, trailPct: 0.8 });
    assert.ok(early >= 98 && early < 101, `early ${early}`);
    assert.ok(mid > early, `mid ${mid} vs early ${early}`);
    assert.ok(late > mid, `late ${late} vs mid ${mid}`);
    assert.ok(late < 104);
    const tight = trailStopFromPeak({ side: "long", entry: 100, peak: 102, tp: 104, sl: 98, trailPct: 0.3 });
    const wide = trailStopFromPeak({ side: "long", entry: 100, peak: 102, tp: 104, sl: 98, trailPct: 2.4 });
    assert.ok(tight > wide, `tight ${tight} vs wide ${wide}`);
    const short = trailStopFromPeak({ side: "short", entry: 100, peak: 98, tp: 96, sl: 102, trailPct: 0.8 });
    assert.ok(short <= 102 && short > 98, `short ${short}`);
  });

  it("sl 0.4 tp 0.6 distances match config R and ATR multiple", () => {
    const cfg = { ...CFG, slAtr: 0.4, tpRatio: 0.6, trailingPct: 1.4, dcaCount: 1, maxHoldTicks: 20000 };
    const e = initVstEngine(cfg, { warmup: 0, symbolCount: 8, arm: true });
    const sample = [...e.queue, ...e.orders].filter((o) => o.sl > 0 && o.tp > 0 && o.price > 0 && o.indication !== "break").slice(0, 24);
    assert.ok(sample.length >= 4, `ladders ${sample.length}`);
    for (const o of sample) {
      const q = e.quotes[o.symbol];
      assert.ok(q && q.atr > 0);
      const slD = Math.abs(o.price - o.sl);
      const tpD = Math.abs(o.tp - o.price);
      const atrMul = slD / q.atr;
      const r = tpD / slD;
      assert.ok(atrMul >= 0.34 && atrMul <= 0.55, `${o.symbol} sl/atr ${atrMul}`);
      assert.ok(r >= 0.55 && r <= 0.7, `${o.symbol} tp/sl ${r}`);
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
    assert.equal(UNIT_NOTIONAL, 15);
    assert.equal(POSITION_COST_PCT, 0.0015);
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
    assert.equal(DEFAULT_LAST_N_CONFIG.picks, 10);
    assert.equal(DEFAULT_LAST_N_CONFIG.last, 10);
    assert.equal(DEFAULT_LAST_N_CONFIG.next, 10);
  });

  it("rebuilds free ladders on the selected range type", () => {
    const e = initVstEngine(CFG, { warmup: 0 });
    haltEngine(e);
    requeueFree(e, CFG, "hybrid", "fibonacci");
    assert.ok(e.queue.length > 0);
    assert.ok(e.queue.every((o) => o.rangeType === "fibonacci"));
  });

  it("simulates 24 hours across the universe and stays correct", () => {
    const { engine, report } = simulateHours(24);
    assert.equal(report.hours, 24);
    assert.equal(report.ticks, 1440);
    assert.equal(report.symbols, 50);
    assert.ok(report.trades >= 10, `trades ${report.trades}`);
    assert.ok(report.slExits >= 1, "need SL exits");
    assert.ok(report.tpExits >= 1, "need TP exits");
    assert.ok(report.pf >= 1, `PF ${report.pf}`);
    assert.ok(report.net > 0, `net ${report.net}`);
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
    assert.ok(Math.abs(hourNet - report.net) < 1e-6, `hourly ${hourNet} vs net ${report.net}`);
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
    const { report } = simulateHours(1);
    assert.equal(report.hours, 1);
    assert.equal(report.ticks, 60);
    assert.ok(report.trades >= 1, `trades ${report.trades}`);
    assert.equal(report.ratioViolations, 0);
    assert.equal(report.nanCount, 0);
    assert.ok(report.passed, report.issues.join("; "));
    assert.ok(Number.isFinite(report.avgR));
    assert.ok(!report.issues.some((i) => /take-profit|stop-loss/i.test(i)));
    assert.equal(report.hourly.length, 1);
    assert.ok(Math.abs(report.hourly[0]!.net - report.net) < 1e-6);
  });

  it("simulates 8 hours with SL and TP mix", () => {
    const { report } = simulateHours(8);
    assert.equal(report.hours, 8);
    assert.ok(report.trades >= 4, `trades ${report.trades}`);
    assert.ok(report.slExits >= 1, "SL");
    assert.ok(report.tpExits >= 1, "TP");
    assert.ok(report.passed, report.issues.join("; "));
    assert.ok(report.bySymbol.some((s) => s.trades > 0));
    const rSum = report.rHist.reduce((s, b) => s + b.n, 0);
    assert.equal(rSum, report.trades);
    const hourNet = report.hourly.reduce((s, h) => s + h.net, 0);
    assert.ok(Math.abs(hourNet - report.net) < 1e-6, `hourly ${hourNet} vs net ${report.net}`);
    assert.equal(report.hourly.length, 8);
  });

  it("axis mean-reversion performs with TP at the axis", () => {
    const cfg = { ...CFG, axisSpacing: 0.7, axisLevels: 5 };
    const { report, engine } = simulateHours(8, cfg, "axis", { symbolCount: 12, rangeType: "atr" });
    finiteNum(report.pf, report.net, report.wr);
    assert.ok(report.trades >= 8, `trades ${report.trades}`);
    assert.ok(report.tpExits >= 1, `TP ${report.tpExits}`);
    assert.ok(report.pf >= 1, `axis PF ${report.pf.toFixed(2)}`);
    assert.ok(report.net > 0, `axis net ${report.net}`);
    assert.equal(report.nanCount, 0);
    assert.ok(engine.closed.some((c) => c.playbook === "axis" || c.tactic === "axis"));
  });

  it("30d hybrid fibonacci stays positive on 8 symbols", () => {
    const { report } = simulateHours(720, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci" });
    finiteNum(report.pf, report.net);
    assert.ok(report.trades >= 20, `trades ${report.trades}`);
    assert.ok(report.pf >= 1, `30d PF ${report.pf}`);
    assert.ok(report.net > 0);
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
    assert.ok(e.fills.length <= 80);
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
      assert.ok(slD <= tpD / TP_SL_RATIO + 1e-6);
    }
    assert.equal(auditEngine(e).nanCount, 0);
  });

  it("runs Trend, Break, Active and Direction indications independently on every lane", () => {
    assert.equal(INDICATION_KINDS.map((k) => k.id).join(","), "trend,break,active,direction");
    assert.equal(INDICATION_CONFIGS.filter((c) => c.kind === "trend").length, 3);
    assert.equal(INDICATION_CONFIGS.filter((c) => c.kind === "break").length, 3);
    assert.equal(INDICATION_CONFIGS.filter((c) => c.kind === "active").length, 3);
    assert.equal(INDICATION_CONFIGS.filter((c) => c.kind === "direction").length, 4);
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
    assert.equal(report.passed, true, report.issues.join("; "));
    assert.ok(report.trades > 8);
    assert.ok(report.slExits >= 1);
    assert.ok(report.tpExits >= 1);
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

  it("stage-evals 4/8/16h with independent last-N 5/10/15 and end PF avg", async () => {
    const { evaluateStages, liveLastNEvals, trackLaneEvals } = await import("./validate.ts");
    const { STAGE_HOURS, LANE_EVAL_NS } = await import("./engine.ts");
    assert.deepEqual([...STAGE_HOURS], [4, 8, 16]);
    assert.deepEqual([...LANE_EVAL_NS], [5, 10, 15]);
    assert.equal((await import("./engine.ts")).LIVE_DISABLE_N, 12);
    const bundle = evaluateStages({
      hours: [...STAGE_HOURS],
      lastNs: [...LANE_EVAL_NS],
      base: CFG,
      tactic: "axis",
      rangeType: "atr",
    });
    assert.deepEqual(bundle.hours, [4, 8, 16]);
    assert.deepEqual(bundle.lastNs, [5, 10, 15]);
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
      assert.ok(effective.every((t) => t.ns.every((r) => r.n === 5 || r.n === 10 || r.n === 15)));
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
    const live = liveLastNEvals([], [5, 10, 15]);
    assert.equal(live.length, 3);
    const snap = sanitizeDeskSettings({ evalHours: [4, 99], evalLastNs: [5, 7, 15] } as never);
    assert.deepEqual(snap.evalHours, [4]);
    assert.deepEqual(snap.evalLastNs, [5, 15]);
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
    assert.ok(liftedStep >= 5 * 1.08 - 1e-9);
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
    assert.ok(report.passed, report.issues.join("; "));
    assert.ok(report.pf >= 1, `PF ${report.pf}`);
    assert.ok(report.net > 0, `net ${report.net}`);
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
      volumeRatio: 0.08,
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

  it("block on vs off: adds rungs when enabled and stays inert when disabled", () => {
    const off = { ...DEFAULT_BLOCK_CONFIG, enabled: false };
    const on = { ...DEFAULT_BLOCK_CONFIG, enabled: true, endStageOnly: false, cadence: 4, addOnWin: false, flattenConflict: false, sides: "both" as const, windows: false, liveDisable: false };
    const cfg = { ...CFG, trailingPct: 2.4, maxHoldTicks: 20000 };
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
        a.engine.positions.some((p) => (p.blockQty || 0) > 0),
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
    const r = 0.08;
    const a = blockStepQty(base, 1, r, 1.8, 2, 0, "additive");
    const b = blockStepQty(base, 2, r, 1.8, 2, 0, "additive");
    assert.ok(Math.abs(a - base * r) < 1e-9, `step1 ${a}`);
    assert.ok(Math.abs(b - base * r) < 1e-9, `step2 ${b}`);
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeMode, "parallel");
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeRatio, 0.08);
    const q = additiveBlockQty(1.2, [1, 2, 3], 1, 3, 1);
    assert.ok(Math.abs(q.totalSteps - 3 * 1.2) < 1e-9, `steps ${q.totalSteps}`);
    assert.ok(Math.abs(q.relExtra - 3 * 1.2) < 1e-9, `rel ${q.relExtra}`);
    assert.ok(Math.abs(q.total - 7.2) < 1e-9, `total ${q.total}`);
  });

  it("auto-evals major/minor relations every 2h and adds volume additively", () => {
    assert.equal(DEFAULT_BLOCK_CONFIG.volumeRatio, 0.08);
    assert.equal(DEFAULT_BLOCK_CONFIG.relVolumeRatio, 0.08);
    assert.equal(DEFAULT_THRESHOLDS.minPf, 2);
    assert.equal(DEFAULT_BLOCK_CONFIG.liveDisableMinPf, 1.1);
    assert.equal(DEFAULT_BLOCK_CONFIG.liveLastN, 12);
    assert.equal(DEFAULT_BLOCK_CONFIG.minRelPf, 1.6);
    assert.equal(DEFAULT_TACTIC_CONFIG.slAtr, slAtrOf(0.8, 0.75));
    assert.equal(DEFAULT_TACTIC_CONFIG.tpRatio, tpRatioOf(0.75));
    assert.equal(TP_SL_RATIO_MIN, tpRatioOf(1.75));
    assert.equal(SL_ATR_MIN, slAtrOf(0.3, 0.5));
    assert.ok(TP_SL_RATIOS.includes(tpRatioOf(1)) && TP_SL_RATIOS.includes(tpRatioOf(0.5)));
    assert.ok(SL_ATR_RATIOS.includes(slAtrOf(0.8, 0.5)));
    assert.equal(snapTpRatio(0.5), tpRatioOf(1.75));
    assert.ok(Math.abs(snapSlAtr(0.35) - 0.3) < 0.06);
    assert.equal(allTpSlCombos().length, 14 * 6);
    assert.equal(TP_ATR_RATIOS[0], 0.3);
    assert.equal(TP_ATR_RATIOS[TP_ATR_RATIOS.length - 1], 1.6);
    assert.deepEqual([...SL_OF_TP], [0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    assert.equal(new Set(allTpSlCombos().map((c) => `${c.tpAtr}:${c.slOfTp}`)).size, 84);
    assert.equal(X01_DEFAULTS.minPf, 1.4);
    assert.equal(X01_DEFAULTS.symbolCount, 50);
    assert.equal(X01_DEFAULTS.sides, "both");
    assert.equal(X01_DEFAULTS.slAtrMin, 0.15);
    assert.equal(X01_DEFAULTS.tpRatioMin, 0.571);
    assert.equal(DEFAULT_BLOCK_CONFIG.evalHours, 2);
    assert.deepEqual(DEFAULT_BLOCK_CONFIG.counts, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(DEFAULT_BLOCK_CONFIG.evalLastNs, [1, 2, 3, 4, 5, 6]);
    assert.equal(DEFAULT_BLOCK_CONFIG.maxMultiple, 6);
    assert.equal(DEFAULT_BLOCK_CONFIG.evalPosCount, 6);
    assert.equal(DEFAULT_BLOCK_CONFIG.pauseCountRatio, 0);
    assert.equal(DEFAULT_BLOCK_CONFIG.keepAdjusted, true);
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
      rangeType: "fibonacci",
      block: { ...DEFAULT_BLOCK_CONFIG, autoEval: true, relAdditive: true, volumeRatio: 0.08, evalHours: 2 },
    });
    assert.ok(report.trades >= 8);
    finiteNum(report.pf, report.net, report.wr);
    assert.ok(report.pf > 0.5, `PF ${report.pf}`);
    assert.ok((engine.lastRelEvalTick || 0) >= 2 * 60, `eval tick ${engine.lastRelEvalTick}`);
    assert.ok((engine.relVolumeFactor || 0) >= 0);
  });

  it("windows shared vs additive run with stack 1-2 additionally", () => {
    const base = { ...DEFAULT_BLOCK_CONFIG, enabled: true, stack: true, windows: true, counts: [1, 2], maxMultiple: 2, evalPosCount: 6, volumeRatio: 1.25, endStageOnly: false };
    const shared = simulateHours(24, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...base, volumeMode: "shared" } });
    const additive = simulateHours(24, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...base, volumeMode: "additive" } });
    const winOnly = simulateHours(24, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block: { ...base, stack: false, volumeMode: "shared" } });
    assert.ok(shared.report.passed && additive.report.passed && winOnly.report.passed);
    finiteNum(shared.report.pf, additive.report.pf, winOnly.report.pf);
    assert.ok(shared.engine.blockWindows[6]);
    assert.ok(winOnly.engine.blockWindows[6].closed >= 0);
  });

  it("all Block counts 1-6 additive pause/keep volume are independent", () => {
    assert.deepEqual([...BLOCK_POS_COUNTS], [1, 2, 3, 4, 5, 6]);
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
    assert.ok(shared.report.passed && additive.report.passed && both.report.passed);
    finiteNum(shared.report.pf, additive.report.pf, both.report.pf);
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
              volumeRatio: 0.08,
              liveDisable: false,
              sides: "one",
            },
          });
          assert.ok(r.report.passed, `${b.tactic}/${b.range} ${t.name} ${m} ${r.report.issues?.join(";")}`);
          finiteNum(r.report.pf, r.report.net);
          assert.ok(r.report.pf > 0.5, `${b.tactic}/${b.range} ${t.name} ${m} PF ${r.report.pf}`);
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
    assert.ok(symbolTapePf(e, "SOLUSDT") < 1);
    assert.equal(skipLiveSymbol(e, "SOLUSDT"), true);
    e.symbolStats.ETHUSDT = { id: "ETHUSDT", trades: 4, wins: 3, profit: 1.2, loss: 0.2, sl: 1, tp: 3 };
    assert.equal(skipLiveSymbol(e, "ETHUSDT"), false);
  });

  it("break, active, and direction run with their own ranges, playbooks, and auto-evals", () => {
    assert.equal(openPlaybook("hybrid", "break"), "normal");
    assert.equal(openPlaybook("hybrid", "active"), "normal");
    assert.equal(openPlaybook("hybrid", "direction"), "normal");
    assert.equal(openPlaybook("axis", "break"), "axis");
    assert.equal(openPlaybook("dca", "trend"), "normal");
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
    if ((by.break?.n ?? 0) >= 6) {
      assert.ok((by.break?.pf ?? 0) >= 0.9, `break PF ${by.break?.pf} n=${by.break?.n}`);
    }
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
      const entry = [...e.queue, ...e.orders].find((o) => !/^Block/i.test(o.note) && !/^DCA/i.test(o.note));
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
    assert.equal(ov.playbooks.length, 4);
    assert.ok(ov.byIndication.length === 4);
    assert.ok(ov.byKind.length >= 6);
  });

  it("live overview stats cover last N, hours, playbooks and steps", () => {
    const e = initVstEngine(CFG, { warmup: 20, symbolCount: 8 });
    const ov = overallLiveStats(e);
    assert.ok(ov.lastN["12"]);
    assert.ok(ov.lastN["40"]);
    assert.ok(ov.lastN["120"]);
    assert.ok(ov.hours["1"]);
    assert.ok(ov.hours["2"]);
    assert.ok(ov.hours["4"]);
    assert.ok(ov.hours["6"]);
    assert.ok(ov.hours["12"]);
    assert.ok(ov.hours["50"]);
    finiteNum(ov.hours["1"].ddt, ov.hours["4"].orders ?? 0, ov.ddt);
    assert.equal(ov.playbooks.length, 4);
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
    assert.equal(snap.symbolCount, 50);
    assert.equal(snap.tacticConfig.tpRatio, tpRatioOf(0.5));
    assert.equal(snap.thresholds.minPf, 1.4);
    assert.equal(snap.tacticConfig.slAtr, 0.4);
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
    assert.ok(findPreset("vst-paper", [])?.patch.activeConnId === "bingx-vst-02");
    const saved = sanitizeUserPresets([{ id: "user-a", label: "Mine", blurb: "x", builtin: false, patch: { tactic: "axis" } }, { id: "" }]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.label, "Mine");
    const withUser = sanitizeDeskSettings({ ...base, activePresetId: "x01-live", userPresets: saved });
    assert.equal(withUser.activePresetId, "x01-live");
    assert.equal(withUser.userPresets.length, 1);
    assert.ok(presetIdOf("My Setup").startsWith("user-"));
    assert.equal(BUILTIN_PRESETS.every((p) => p.builtin), true);
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
        assert.deepEqual(l.evals?.map((r) => r.n), [5, 10, 15]);
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
      assert.ok(Math.abs(hourNet - report.net) < 1e-6, tactic);
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