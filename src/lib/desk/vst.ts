Warning: truncated output (original token count: 127993)
Total output lines: 12646

import {laneVolumeFactor,additionalLaneVolumeFactor} from "./volume-policy.ts";
import {indicationSourceIds,isPortedIndication,refreshPortedIndications} from "./ported-indications.ts";
import {publishPortedIndications} from "./engine.ts";
import { strategyTogglesForRange } from "./strategy-processing.ts";
import { prehistoryHours } from "./prehistory.ts";
import { planRelate, relateConfig, type RelateEvidence, type RelateRelationTrials, type RelateTrialStamp } from "./relate.ts";
import { RELATE_SOURCES, relateKeys } from "../../../shared/cts-relate/policy.ts";
import { extendOwnSampleHistory, sampleRows, type SampleCoverage } from "./last-n-samples.ts";
import { hasDisjointBlocks, measuredEdgePnl, selectedDisjointBlocks } from "./last-n-progress.ts";
import { DEFAULT_MIN_SL_DISTANCE_PCT, initialProtection, minimumStopDistance, normalizeMinSlDistancePct } from "./protection-policy.ts";
import { absoluteProtection, priceDistanceParentBatch, priceDistanceVariants, priceTrailStop, STOP_DISTANCE_PCTS } from "./price-distance-grid.ts";
import { lowRangeGridProtects } from "../../../shared/cts-indications/origin/indications/low-range.ts";
import { DEFAULT_STEP_PF, stepPfFloor } from "./step-pf.ts";
import { actualFillFee, feePolicy, resolveFeePolicy, roundTripFeeRate } from "./fee-policy.ts";
import type {
  BlockAdjustResult,
  BlockConfig,
  Connection,
  ExchangeBook,
  Fill,
  IndicationId,
  IndCalcKind,
  LiveOrder,
  LivePosition,
  OrderTypeId,
  Position,
  RangeType,
  Side,
  SimReport,
  HorizonMark,
  StrategyKind,
  StrategyToggles,
  PfCoordToggles,
  SymbolTape,
  TacticConfig,
  TacticKind,
  TrailingDistance,
  VstBatch,
  VstEngine,
  VstLedger,
  VstQuote,
  VstSymbol,
  BlockLaneState,
  BlockPosWindow,
  SymbolHourRow,
  HourCoord,
  IntervalStrategyConfig,
  LastNProgressConfig,
  ProgressEval,
  ProgressEvalRow,
  LastNCoordState,
} from "./types.ts";
import { pushStable02Px, stable02EntrySide, stable02ExitSl, stable02Factor, stable02ProcessSide } from "./stable02.ts";
import { LIVE_MAX_POSITIONS } from "./feed.ts";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_THRESHOLDS,
  DEFAULT_MIN_PF,
  DEFAULT_BASE_PF,
  DEFAULT_AXIS_PF,
  DEFAULT_BLOCK_PF,
  DEFAULT_SHORT_PF,
  DEFAULT_SHORT_BASE_PF,
  DEFAULT_SHORT_AXIS_PF,
  DEFAULT_SHORT_BLOCK_PF,
  AXIS_PARTIAL_RATIO,
  DEFAULT_STRATEGY_TOGGLES,
  DEFAULT_PF_COORDS,
  BLOCK_POS_COUNTS,
  DEFAULT_MAX_HOLD_TICKS,
  MIN_QUOTE_VOL,
  POSITION_RT_COST_PCT,
  blockMaxAdditionalRatio,
  blockMinimumProfitFactor,
  blockStepQty,
  positionNotional,
  closePnl,
  RANGE_TYPES,
  TACTICS,
  INDICATION_KINDS,
  snapTpRatio,
  snapSlAtr,
  snapTrailPct,
  trendBreakTrailPct,
  profitFactor,
  ratioProfitFactor,
  pfFromPnls,
  PF_NO_LOSS,
  allTpSlCombos,
  allShortTpSlCombos,
  allMicroCombos,
  allMinimalCombos,
  shortProtectGridFor,
  DEFAULT_SHORT_MIN_TP_ATR,
  DEFAULT_SHORT_MIN_SL_OF_TP,
  shortComboKey,
  snapShortTpAtr,
  snapShortSlOfTp,
  shortSlAtrOf,
  shortTpRatioOf,
  snapShortTacticConfig,
  cfgUsesShortRange,
  cfgUsesMinimalRange,
  minimalControlPrices,
  microControlPrices,
  snapMicroTpPct,
  snapSlOfTp,
  snapMinimalTpCost,
  snapMinimalSlOfTp,
  MINIMAL_WINNER,
  minimalTrailPct,
  resolveRangeTouch,
  BUSY_HOUR_WEAK_PROTECT,
  HIGH_TRADE_PAY_INDICATIONS,
  clampBlockVol,
  clampSetBlockSamples,
  DEFAULT_OVERALL_BLOCK_VOLUME_RATIO,
  clampSharedVol,
  clampOverallVol,
  clampMaxVolumeMul,
  DEFAULT_SHARED_BLOCK_VOLUME_RATIO,
  DEFAULT_MAX_VOLUME_MULTIPLIER,
  clampAxisPartial,
  trailStopFromPeak,
  shortControlPrices,
  symbolIndications,
  refreshLiveIndications,
  symbolSideSet,
  STAGE_HOURS,
  SHORT_EVAL_HOURS,
  SYMBOL_EVAL_HOURS,
  SYMBOL_HOUR_WINDOWS,
  EVAL_POS_N,
  VALID_EXEC_POS_N,
  LIVE_DISABLE_N,
  sanitizeShortProgress,
  SHORT_PROGRESS_INDICATIONS,
  COMMON_INDICATIONS,
  DEFAULT_SHORT_PROGRESS,
  sanitizeIntervalStrategy,
  sanitizeLastNProgress,
  decideLastN,
  lastNWindows,
  lastNPrefix,
  coordinateLastNFromPrefix,
  scoreLastNGroup,
  nearLastNPass,
  evalWindowCount,
  foldLastNProcessings,
  completeLastNCorrectness,
  coverCatalogRows,
  hitsToProgressRows,
  relComboKey,
  lastNMaxOf,
  GATED_MIN_PF,
  BASE_STAGE_PF,
  edgePnl,
  positionNetRatio,
  indicationQuality,
  indicationQualityFloor,
  indicationRingDepth,
  resetIndicationHistory,
  sanitizeBlockCounts,
  LIVE_BLOCK_COUNTS,
} from "./engine.ts";

const DEFAULT_CFG: TacticConfig = {
  trailingPct: 1.5,
  dcaCount: 1,
  dcaDrawdown: 0.8,
  axisSpacing: 0.7,
  axisLevels: 5,
  axisPartialRatio: AXIS_PARTIAL_RATIO,
  slAtr: 1,
  tpRatio: 1,
  tpAtr: 1.0,
  slOfTp: 1,
  maxHoldBars: 3,
  maxHoldTicks: 16,
};

export const TP_SL_RATIO = 1;
export const SL_ATR_MULT = 1;
export const VST_MAX_SYMBOLS = 300;
export const VST_LIVE_SYMBOLS = 50;
export const VST_MAX_POSITIONS = 2000;
export const VST_BATCH_SIZE = 48;
export const VST_RATE_PER_SEC = 16;
export const VST_RATE_BURST = 40;
export const VST_RATE_WINDOW = 100;
export const VST_TICK_MS = 400;
export const VST_MINUTES_PER_TICK = 1;
export const TICKS_PER_HOUR = 60;
export const INTERVAL_MINUTES = 20;
export const TICKS_PER_INTERVAL = INTERVAL_MINUTES;

export function intervalCfg(e?: { intervalStrategy?: IntervalStrategyConfig } | null): IntervalStrategyConfig {
  return sanitizeIntervalStrategy(e?.intervalStrategy);
}

export function intervalMinutesOf(e?: { intervalStrategy?: IntervalStrategyConfig } | null): number {
  return intervalCfg(e).minutes;
}

export function ticksPerIntervalOf(e?: { intervalStrategy?: IntervalStrategyConfig } | null): number {
  return Math.max(5, Math.round(intervalMinutesOf(e)));
}
export const VST_MAX_WORKING_ORDERS = 8000;
export const VST_MAX_QUEUE = 8000;
const PAPER_MAX_POSITIONS = 8000;
const PAPER_MAX_QUEUE = 12000;
const PAPER_MAX_WORKING = 12000;
const SHORT_COMBO_TAPE_CAP = 80;
function paperMode(e: VstEngine) {
  return !e.liveTape;
}
const syntheticPaperReplays = new WeakSet<VstEngine>();
/** Engine size is not Block extra and not tape VF. */
export function engineSizeFactor(_e?: VstEngine) {
  return 1;
}
/** Complete intern-all: rotate every indication×tactic×combo (1 intern leg/side). After pre, live executes independently proven short tapes (keep PF≥1), not internRel 1–10%. */
function internAllPhase(e: VstEngine) {
  return Boolean(e.completeSim && paperMode(e) && !e.preEvalDone);
}
/** Tests / explicit prehours:0 open book. The 24h screenshot path is intern-all pre then performing live. */
/** After pre: paper live trades the validated book at open-tape pace. Proof stays on. Intern leftovers do not fill this book. */
function completeOpenTape(e: VstEngine) {
  return Boolean(e.openCompleteTape && e.completeSim && paperMode(e) && !e.liveTape);
}
/** After pre: paper live trades the validated book at open-tape pace. Proof stays on. Intern leftovers do not fill this book. */
function performingLive(e: VstEngine) {
  return Boolean(e.completeSim && e.preEvalDone && paperMode(e) && !e.liveTape && !completeOpenTape(e));
}

type TypeGateRow = { n: number; pf: number; net: number; ok: boolean };
const typeGateMem = new WeakMap<VstEngine, {
  indications: Record<string, TypeGateRow>;
  tactics: Record<string, TypeGateRow>;
  floor: number;
  blendN: number;
  blendPf: number;
  blendNet: number;
  okN: number;
  okPf: number;
  okNet: number;
}>();
const liveIndTally = new WeakMap<VstEngine, Record<string, { n: number; gp: number; gl: number; fail?: boolean; recent?: number[]; at?: number; pays?: boolean; probeTick?: number; probes?: number }>>();

function noteLiveInd(e: VstEngine, ind: string, pnl: number, tac?: string) {
  if (!(completeOpenTape(e) || performingLive(e))) return;
  const x = Number(pnl) || 0;
  if (Math.abs(x) < 1e-12) return;
  let bag = liveIndTally.get(e);
  if (!bag) {
    bag = {};
    liveIndTally.set(e, bag);
  }
  const key = tac ? `${ind}|${tac}` : ind;
  const row = bag[key] ?? (bag[key] = { n: 0, gp: 0, gl: 0, recent: [] });
  row.n += 1;
  if (x > 0) row.gp += x;
  else row.gl -= x;
  const recent = row.recent ?? (row.recent = []);
  recent.push(x);
  if (recent.length > 64) recent.shift();
}

function releaseFailedIndication(e: VstEngine, ind: string, tac?: string) {
  const hit = (o: { indication?: string; tactic?: string }) => o.indication === ind && (!tac || o.tactic === tac);
  for (const o of e.orders) {
    if (!hit(o)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
  cancelQueued(e, (o) => hit(o));
}

function dropQueuedLane(e: VstEngine, ind: string, tac?: string) {
  cancelQueued(e, (o) => {
    if (isBotPlay(o.playbook)) return false;
    if (o.indication !== ind) return false;
    return !tac || o.tactic === tac;
  });
}

function recentLanePays(recent: number[] | undefined): boolean | null {
  if (!recent || recent.length < 24) return null;
  const slice = recent.length > 48 ? recent.slice(-48) : recent;
  let gp = 0;
  let gl = 0;
  for (const x of slice) {
    if (x > 0) gp += x;
    else gl -= x;
  }
  const pf = profitFactor(gp, gl);
  if (pf < 0.9 && gp - gl <= 0) return false;
  return true;
}

const hourLaneMem = new WeakMap<VstEngine, { hour: number; off: Set<string>; last: Record<string, { n: number; net: number }> }>();

/** Exam hour flow must not pause the first live hour. */
function resetLiveHourState(e: VstEngine) {
  hourLaneMem.delete(e);
  liveIndTally.delete(e);
  hourFlowCache.delete(e);
  hourBusyCache.delete(e);
  e.hourLive = undefined;
}

/** New hour: keep every lane processing. A red hour is recorded, never a cancel or a stuck-off. */
function rollHourLanes(e: VstEngine) {
  if (!(performingLive(e) || completeOpenTape(e))) return;
  const hour = Math.floor(Math.max(0, e.tick) / TICKS_PER_HOUR);
  const mem = hourLaneMem.get(e);
  if (mem?.hour === hour) return;
  const last: Record<string, { n: number; net: number }> = {};
  const flow = hourFlowCache.get(e);
  if (flow && flow.hour === hour - 1) {
    for (const [id, row] of Object.entries(flow.byInd)) last[id] = { n: row.n, net: row.net };
  }
  const off = new Set<string>();
  for (const [id, row] of Object.entries(last)) {
    if (row.n >= 8 && row.net <= 0) off.add(id);
  }
  if (!Object.keys(last).length || [...off].length === Object.keys(last).length) off.clear();
  hourLaneMem.set(e, { hour, off, last });
  const bag = liveIndTally.get(e);
  if (bag) {
    for (const row of Object.values(bag)) row.fail = false;
  }
}

function indicationRecent(e: VstEngine, ind: string): number[] {
  const bag = liveIndTally.get(e);
  if (!bag) return [];
  const recent: number[] = [];
  for (const [key, row] of Object.entries(bag)) {
    if (key !== ind && !key.startsWith(`${ind}|`)) continue;
    if (row.recent?.length) recent.push(...row.recent.slice(-16));
    if (recent.length >= 48) break;
  }
  return recent;
}

function liveIndStillPays(e: VstEngine, ind?: string): boolean {
  if (!ind) return true;
  if (!(performingLive(e) || completeOpenTape(e))) return true;
  rollHourLanes(e);
  return true;
}

function applyStickyIndicationEval(e: VstEngine, indications: Record<string, { n: number; pf: number; net: number; ok: boolean }>) {
  const bag = liveIndTally.get(e);
  if (!bag) return;
  const ids = new Set(Object.keys(bag).map((k) => k.split("|")[0] || k));
  for (const id of ids) {
    liveIndStillPays(e, id);
    let n = 0;
    let gp = 0;
    let gl = 0;
    let anyPay = false;
    let seen = false;
    for (const [key, row] of Object.entries(bag)) {
      if (key !== id && !key.startsWith(`${id}|`)) continue;
      if (row.n < 24) continue;
      seen = true;
      n += row.n;
      gp += row.gp;
      gl += row.gl;
      if (!row.fail) anyPay = true;
    }
    if (!seen) continue;
    const pf = profitFactor(gp, gl);
    indications[id] = { n, pf, net: gp - gl, ok: anyPay };
  }
}

function scoreTypeGate(rows: { pnl: number }[] | undefined): TypeGateRow {
  const st = comboTapeStats(rows);
  const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
  const unreal = st.pf >= 30 && st.net < 0.01;
  return {
    n: st.n,
    pf: st.pf,
    net: st.net,
    ok: st.n >= 4 && st.pf + 1e-9 >= 1 && st.net > 1e-9 && !tiny && !unreal,
  };
}

/** Freeze intern indication and tactic tapes once, when the exam ends. Live does not default missing lanes to PF 1. */
function freezeLiveTypeGate(e: VstEngine) {
  if (typeGateMem.has(e)) return;
  const indP: Record<string, { pnl: number }[]> = {};
  const tacP: Record<string, { pnl: number }[]> = {};
  for (const c of e.closed) {
    if (c.protect || c.validExec === true) continue;
    const row = { pnl: edgePnl(c) };
    const ind = String(c.indication || "trend");
    const tac = String(c.tactic || "trailing");
    (indP[ind] ??= []).push(row);
    (tacP[tac] ??= []).push(row);
  }
  const indications: Record<string, TypeGateRow> = {};
  const tactics: Record<string, TypeGateRow> = {};
  let okGp = 0;
  let okGl = 0;
  let okN = 0;
  for (const [k, rows] of Object.entries(indP)) {
    const row = scoreTypeGate(rows);
    indications[k] = row;
    if (!row.ok) continue;
    for (const r of rows) {
      okN += 1;
      if (r.pnl > 0) okGp += r.pnl;
      else if (r.pnl < 0) okGl -= r.pnl;
    }
  }
  for (const [k, rows] of Object.entries(tacP)) tactics[k] = scoreTypeGate(rows);
  const proven: { pnl: number }[] = [];
  for (const [k, tape] of Object.entries(e.shortComboPreTape ?? {})) {
    const [tpS, slS] = k.split(":");
    const tp = Number(tpS);
    const sl = Number(slS);
    if (!Number.isFinite(tp) || !Number.isFinite(sl) || !tape?.length) continue;
    if (!shortComboProven(e, tp, sl)) continue;
    proven.push(...tape);
  }
  const blend = comboTapeStats(proven);
  const floor = blend.n >= 4 && blend.pf > 1 ? blend.pf : 1;
  typeGateMem.set(e, {
    indications,
    tactics,
    floor,
    blendN: blend.n,
    blendPf: blend.pf,
    blendNet: blend.net,
    okN,
    okPf: profitFactor(okGp, okGl),
    okNet: okGp - okGl,
  });
}

export function frozenTypeBlend(e: VstEngine): { n: number; pf: number; net: number } | null {
  const g = typeGateMem.get(e);
  if (!g || g.blendN < 4) return null;
  return { n: g.blendN, pf: g.blendPf, net: g.blendNet };
}

/** Indications that cleared the type gate. Wider than the strategy slice, so live can still beat it. */
function okTypePool(e: VstEngine): { n: number; pf: number; net: number } | null {
  const g = typeGateMem.get(e);
  if (!g || g.okN < 4) return null;
  return { n: g.okN, pf: g.okPf, net: g.okNet };
}

/** Live exchange only. A progress order must already be proving itself on the site book. */
export function liveOrderAllowed(e: VstEngine, o: { validExec?: boolean; tpAtr?: number; slOfTp?: number; playbook?: string }): boolean {
  if (isBotPlay(o.playbook)) return true;
  if (o.validExec !== true) return false;
  const floorEq = Number(e.startEquity) > 0 ? Number(e.startEquity) : 10;
  if (!(Number(e.stats?.pf) > 1)) return false;
  if (!(Number(e.stats?.equity) + 1e-9 >= floorEq)) return false;
  if (o.tpAtr == null || o.slOfTp == null) return false;
  const key = shortComboKey(o.tpAtr, o.slOfTp);
  const st = comboTapeStats(e.shortComboLiveTape?.[key] ?? e.shortComboTape?.[key]);
  const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
  return st.n >= 8 && st.pf > 1 && st.pf < 6 && st.net > 0 && !tiny;
}
function validatedOrderDepth(
  e: VstEngine,
  ind: IndicationId,
  tpAtr: number | undefined,
  slOfTp: number | undefined,
  levels: number,
  tactic?: string,
): number {
  if (!performingLive(e)) return -1;
  // Future keeps every lane and config. Unproven cells stay on the book at one rung.
  const kept = 1;
  if (
    tpAtr != null &&
    slOfTp != null &&
    (internRelProven(e, { indication: ind, tactic, tpAtr, slOfTp }) ||
      relExamPass(e, { indication: ind, tactic, tpAtr, slOfTp }) ||
      shortComboProven(e, tpAtr, slOfTp))
  ) {
    return Math.max(1, Math.min(4, levels));
  }
  const gate = typeGateMem.get(e);
  if (!gate) return kept;
  const indRow = gate.indications[ind];
  const comboProven = tpAtr != null && slOfTp != null && shortComboProven(e, tpAtr, slOfTp);
  if (!indRow?.ok && !comboProven) return kept;
  let pf = indRow?.ok ? indRow.pf : gate.floor > 1 ? gate.floor : 1;
  if (tactic) {
    const tacRow = gate.tactics[tactic];
    if (tacRow && tacRow.n >= 4 && !tacRow.ok) return kept;
    if (tacRow?.ok) pf = Math.min(pf, tacRow.pf);
  }
  if (tpAtr != null && slOfTp != null) {
    const key = shortComboKey(tpAtr, slOfTp);
    const full = comboPreRun.get(e)?.[key];
    const fullPf = full ? profitFactor(full.gp, full.gl) : 0;
    const fullNet = full ? full.gp - full.gl : 0;
    if (full && full.n >= 12) {
      if (fullPf + 1e-9 < 1 || fullNet <= 0) return kept;
    } else {
      const st = comboTapeStats(e.shortComboPreTape?.[key]);
      if (st.n >= 4) {
        const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
        if (st.pf + 1e-9 < 1 || st.net <= 1e-9 || tiny) return kept;
        if (gate.floor > 1 && st.pf + 1e-9 < gate.floor) return kept;
        pf = Math.min(pf, st.pf);
      } else if (!shortComboProven(e, tpAtr, slOfTp)) return kept;
    }
  }
  const liveEv = e.progressEval?.indications?.[ind];
  if (liveEv && liveEv.n >= 8 && !comboProven && (liveEv.ok === false || liveEv.pf + 1e-9 < 1)) return kept;
  if (!liveIndStillPays(e, ind)) return kept;
  if (!(pf >= 1)) return kept;
  const used = Math.min(pf, 1.6);
  const extra = Math.floor((used - 1) / 0.2);
  return Math.max(1, Math.min(Math.max(1, levels), 1 + extra));
}

/** Stable live tape (preset tape-6h-12): short 0.48/1, trail 1.5, all strategies. */
export const LIVE_RUN_CFG: TacticConfig = {
  trailingPct: 1.5,
  dcaCount: 3,
  dcaDrawdown: 0.6,
  axisSpacing: 0.7,
  axisLevels: 5,
  axisPartialRatio: 3,
  slAtr: 0.48,
  tpRatio: 1,
  tpAtr: 0.48,
  slOfTp: 1,
  shortRange: true,
  maxHoldBars: 3,
  maxHoldTicks: 8,
};

export function liveRunBlock(base?: BlockConfig): BlockConfig {
  return {
    ...(base ?? DEFAULT_BLOCK_CONFIG),
    enabled: true,
    liveDisable: false,
    autoEval: true,
    windows: true,
    stack: true,
    counts: [1, 2, 3, 4, 5, 6],
    maxMultiple: 6,
    minActiveLevel: 1,
    pauseCountRatio: 0,
    volumeMode: "parallel",
    overallMode: "parallel",
    sharedVolumeRatio: 1.5,
    volumeRatio: 0.4,
    relVolumeRatio: 0.4,
    overallVolumeRatio: 1.5,
    maxVolumeMultiplier: 8,
  };
}

export function engageLiveBook(e: VstEngine) {
  e.completeSim = true;
  e.openCompleteTape = true;
  e.preEvalDone = true;
  e.shortRange = true;
  e.shortComboOnly = false;
  e.liveTape = false;
  e.costStep = 3;
  if (!e.pfCoords) e.pfCoords = { ...DEFAULT_PF_COORDS };
  if ((e.ledger?.trades ?? 0) < 1 && (Number(e.startEquity) || 0) >= 1000) {
    e.startEquity = 10;
    e.ledger.peak = 10;
    e.stats.equity = 10;
    e.stats.net = 0;
  }
}


export type ConfigIdentity = {
  strategyId?: string;
  connId?: string;
  symbol?: string;
  side?: Side;
  indication?: string;
  tactic?: string;
  rangeType?: string;
  playbook?: string;
  kind?: string;
  tpAtr?: number;
  slOfTp?: number;
  trailPct?: number;
  trailingDistance?: TrailingDistance;
  priceStopPct?: number;
  priceTrailPct?: number;
  maxHoldTicks?: number;
  calc?: string;
  microRange?: boolean;
  minimalRange?: boolean;
  shortRange?: boolean;
  modelRtCost?: number;
  minSlDistancePct?: number;
  microMinSlDistancePct?: number;
  microMinTrailDistancePct?: number;
};
export type ConfigTapeRow = ConfigIdentity & {
  id?: string;
  tick?: number;
  pnl: number;
  ratio?: number;
  relateTrial?: RelateTrialStamp;
  relateRelationTrials?: RelateRelationTrials;
  validExec?: boolean;
  /** Flattened at the Base boundary. Not a strategy outcome. */
  examFlat?: boolean;
};
const configPreMem = new WeakMap<VstEngine, ConfigTapeRow[]>();
const frozenNativeIndex = new WeakMap<ConfigTapeRow[], Map<string, ConfigTapeRow[]>>();
function frozenConfigRows(e: VstEngine): ConfigTapeRow[] {
  return configPreMem.get(e) ?? e.frozenBaseSamples ?? [];
}

const frozenNativeCandidates = new WeakMap<ConfigTapeRow[], Map<string, Set<string>>>();
function nativeCandidateOwner(rel: ConfigIdentity) {
  return JSON.stringify([rel.connId, rel.symbol, rel.side, rel.indication, rel.tactic, rel.rangeType,
    rel.playbook, rel.kind, rel.tpAtr, rel.slOfTp,
    !!rel.microRange, !!rel.minimalRange, !!rel.shortRange,
    rel.modelRtCost, rel.minSlDistancePct,
    ...(rel.microRange ? [rel.microMinSlDistancePct, rel.microMinTrailDistancePct] : []),
    ...(rel.strategyId ? ["source-strategy", rel.strategyId] : [])]);
}
function nativeGeometryKey(rel: Pick<ConfigIdentity, "priceStopPct" | "priceTrailPct" | "trailingDistance">) {
  return JSON.stringify([rel.priceStopPct, rel.priceTrailPct, rel.trailingDistance === "fixed"]);
}
function frozenNativeCandidatesFor(e: VstEngine) {
  const rows = frozenConfigRows(e);
  if (!rows.length) return new Map<string, Set<string>>();
  let parents = frozenNativeCandidates.get(rows);
  if (!parents) {
    parents = new Map();
    for (const row of rows) {
      if (row.examFlat || !Number.isFinite(row.priceStopPct) || !completeConfigSampleKey(row)) continue;
      const owner = nativeCandidateOwner(row);
      let shapes = parents.get(owner);
      if (!shapes) parents.set(owner, shapes = new Set());
      shapes.add(nativeGeometryKey(row));
    }
    frozenNativeCandidates.set(rows, parents);
  }
  return parents;
}
function hasConfigProvenance(rel: ConfigIdentity): boolean {
  return [rel.connId, rel.symbol, rel.side, rel.indication, rel.tactic, rel.rangeType, rel.playbook, rel.kind, rel.calc]
    .every(value => typeof value === "string" && value.length > 0) &&
    [rel.tpAtr, rel.slOfTp, rel.trailPct, rel.modelRtCost, rel.minSlDistancePct].every(Number.isFinite) &&
    [rel.microRange, rel.minimalRange, rel.shortRange].every(value=>typeof value === "boolean");
}
/** Record the configured candidate before its qualification verdict or order lifecycle.
 * An empty/denied/cancelled own cohort must not disappear from sample percentages. */
export function registerSampleContext(e: VstEngine, rel: ConfigIdentity): void {
  if (!hasConfigProvenance(rel)) return;
  const key = strategyConfigSampleKey(rel);
  const contexts = e.configuredSampleContexts ?? (e.configuredSampleContexts = {});
  if (!(key in contexts)) {
    const { pnl: _pnl, examFlat: _flat, id: _id, tick: _tick, ...identity } = configTapeRow({ ...rel, pnl: NaN });
    contexts[key] = identity;
  }
}
const configTapeMem = new WeakMap<VstEngine, Map<string, ConfigTapeRow[]>>();
const rangeComboMem = new WeakMap<VstEngine, Map<string, ConfigTapeRow[]>>();
function configSampleKey(rel: ConfigIdentity) {
  return JSON.stringify([rel.connId, rel.symbol, rel.side, rel.indication, rel.tactic, rel.rangeType, rel.playbook, rel.kind,
    rel.tpAtr, rel.slOfTp, rel.trailPct, rel.calc, !!rel.microRange, !!rel.minimalRange, !!rel.shortRange,
    rel.modelRtCost, rel.minSlDistancePct, ...(rel.microRange ? [rel.microMinSlDistancePct,rel.microMinTrailDistancePct] : []),
    rel.priceStopPct, rel.priceTrailPct,
    ...(Number.isFinite(rel.maxHoldTicks) ? ["hold-ticks", rel.maxHoldTicks] : []),
    ...(rel.trailingDistance === "fixed" ? ["fixed-distance"] : [])]);
}
/** Only a complete recorded identity may bind modeled and settled contexts. */
export function completeConfigSampleKey(rel: ConfigIdentity): string | null {
  if (!hasConfigProvenance(rel)) return null;
  if (rel.microRange && ![rel.microMinSlDistancePct, rel.microMinTrailDistancePct].every(Number.isFinite)) return null;
  return configSampleKey(rel);
}
/** Stage accounting owns strategyId as an outer dimension. Runtime evidence
 * needs the same dimension inside its retained-tape and coordination maps. */
function strategyConfigSampleKey(rel: ConfigIdentity): string {
  const key = configSampleKey(rel);
  return rel.strategyId ? JSON.stringify([key, "source-strategy", rel.strategyId]) : key;
}
export function completeStrategyConfigSampleKey(rel: ConfigIdentity): string | null {
  return completeConfigSampleKey(rel) == null ? null : strategyConfigSampleKey(rel);
}
function deskRelateKeys(rel: ConfigIdentity, exactKey: string) {
  return relateKeys(JSON.stringify([rel.connId, rel.calc]), exactKey, rel.symbol!, rel.side!, rel.indication!,
    rel.strategyId ?? rel.kind!, rel.playbook!, rel.rangeType!);
}
function configDetailsMatch(row: ConfigIdentity, rel: ConfigIdentity): boolean {
  if (rel.strategyId != null && row.strategyId !== rel.strategyId) return false;
  if (rel.connId != null && row.connId !== rel.connId) return false;
  if (rel.calc != null && row.calc !== rel.calc) return false;
  if ((row.trailingDistance === "fixed") !== (rel.trailingDistance === "fixed")) return false;
  for (const key of ["trailPct", "priceStopPct", "priceTrailPct", "maxHoldTicks", "modelRtCost", "minSlDistancePct", "microMinSlDistancePct", "microMinTrailDistancePct"] as const) {
    if (rel[key] != null && (!Number.isFinite(rel[key]) || row[key] !== rel[key])) return false;
  }
  for (const key of ["microRange", "minimalRange", "shortRange"] as const) {
    if (rel[key] != null && (row[key] === true) !== (rel[key] === true)) return false;
  }
  return true;
}
function configTapeRow(c: ConfigTapeRow): ConfigTapeRow {
  return { id:c.id, tick:c.tick, pnl: measuredEdgePnl(c), ratio: c.ratio, relateTrial: c.relateTrial,
    relateRelationTrials: c.relateRelationTrials, validExec: c.validExec, strategyId: c.strategyId, connId: c.connId, symbol: c.symbol, side: c.side,
    indication: c.indication, tactic: c.tactic, rangeType: c.rangeType, playbook: c.playbook, kind: c.kind,
    tpAtr: c.tpAtr, slOfTp: c.slOfTp, trailPct: c.trailPct, trailingDistance: c.trailingDistance,
    priceStopPct: c.priceStopPct, priceTrailPct: c.priceTrailPct, maxHoldTicks: c.maxHoldTicks, calc: c.calc,
    microRange: c.microRange, minimalRange: c.minimalRange, shortRange: c.shortRange,
    modelRtCost: c.modelRtCost, minSlDistancePct: c.minSlDistancePct, microMinSlDistancePct: c.microMinSlDistancePct, microMinTrailDistancePct: c.microMinTrailDistancePct, examFlat: c.examFlat };
}
function rangeComboKey(rel: { rangeType?: string; tpAtr?: number; slOfTp?: number }) {
  const tp = rel.tpAtr == null ? "" : String(Math.round(rel.tpAtr * 1000) / 1000);
  const sl = rel.slOfTp == null ? "" : String(Math.round(rel.slOfTp * 1000) / 1000);
  return `${rel.rangeType || ""}|${tp}|${sl}`;
}
function configRetention(e: VstEngine) {
  // Ordinary windows go to 200; a signed policy needs the sum of its disjoint blocks.
  const raw = e.lastNProgress ?? e.blockCfg?.lastNProgress;
  if (!raw?.blocks && !raw?.policies?.some(policy => policy.blocks)) return 200;
  return Math.max(200, lastNMaxOf(lastNProgressOf(e)));
}
function pushTapeRing(map: Map<string, ConfigTapeRow[]>, key: string, row: ConfigTapeRow, capacity: number) {
  const ring = map.get(key) ?? [];
  ring.unshift(row);
  if (ring.length > capacity) ring.length = capacity;
  map.set(key, ring);
}
function noteConfigSample(e: VstEngine, c: ConfigTapeRow & { connId?: string; id?: string }) {
  if (!deskTapeRow(e, c)) return;
  const row = configTapeRow(c);
  registerSampleContext(e, row);
  const key = strategyConfigSampleKey(row);
  let bag = configTapeMem.get(e);
  if (!bag) {
    bag = new Map();
    configTapeMem.set(e, bag);
  }
  const capacity = configRetention(e);
  pushTapeRing(bag, key, row, capacity);
  if (row.rangeType && row.tpAtr != null && row.slOfTp != null) {
    let ranges = rangeComboMem.get(e);
    if (!ranges) {
      ranges = new Map();
      rangeComboMem.set(e, ranges);
    }
    pushTapeRing(ranges, rangeComboKey(row), row, capacity);
  }
}
function historyRows(e: VstEngine, rel: ConfigIdentity) {
  const bag = configTapeMem.get(e);
  if (!bag) return [];
  return bag.get(strategyConfigSampleKey(rel)) ?? [];
}

/** Own configured candidates survive empty, rejected and cancelled order lifecycles.
 * Keep actual Base/current tape stages distinct from the configured window names. */
export function lastNSampleCoverage(e: VstEngine): SampleCoverage {
  const capacity = configRetention(e);
  type Tape = Array<{id?:string;tick?:number;pnl?:number;ratio?:number}>;
  const current = new Map<string, Tape | null>();
  const identities = new Map<string, ConfigIdentity>();
  for (const row of e.closed) {
    if (row.connId !== e.activeConnId || !deskTapeRow(e,row) || ("examFlat" in row && row.examFlat)) continue;
    const key=strategyConfigSampleKey(row);
    identities.set(key,row);
    if (!hasConfigProvenance(row)) { current.set(key,null); continue; }
    const own=current.get(key) ?? [];
    if (own.length < capacity) own.push(row);
    current.set(key,own);
  }
  for (const [key, rows] of configTapeMem.get(e) ?? []) {
    const own=rows.filter(row=>row.connId === e.activeConnId && !row.examFlat && deskTapeRow(e,row));
    if (own.length) {
      identities.set(key,own[0]);
      const present=current.get(key);
      if (!current.has(key)) current.set(key,hasConfigProvenance(own[0]) ? own : null);
      else if (present) current.set(key,extendOwnSampleHistory(present,own,capacity));
    }
  }
  const frozen = new Map<string, Tape | null>();
  for (const row of frozenConfigRows(e)) {
    if (row.connId !== e.activeConnId || row.examFlat) continue;
    const key=strategyConfigSampleKey(row);
    identities.set(key,row);
    if (!hasConfigProvenance(row)) { frozen.set(key,null); continue; }
    const own=frozen.get(key) ?? [];
    if (own.length < capacity) own.push(row);
    frozen.set(key,own);
  }
  for (const row of [...Object.values(e.configuredSampleContexts ?? {}),...e.positions,...e.orders,...e.queue]) {
    if (row.connId === e.activeConnId) identities.set(strategyConfigSampleKey(row),row);
  }
  const selected = new Map<string, Tape | null>();
  for (const [key, rel] of identities) {
    const empty = hasConfigProvenance(rel) ? [] : null;
    // A short current losing tape takes priority over an older full Base tape.
    selected.set(key, current.has(key) ? current.get(key)! : frozen.has(key) ? frozen.get(key)! : empty);
    if (!current.has(key)) current.set(key,empty);
    if (!frozen.has(key)) frozen.set(key,empty);
  }
  const cfg=lastNProgressOf(e);
  return {at:e.tick,connId:e.activeConnId,scope:"registered-exact-contexts",rows:sampleRows(selected.values(),cfg),
    stages:{currentOwn:sampleRows(current.values(),cfg),
      frozenBase:configPreMem.has(e) || e.frozenBaseSamples !== undefined ? sampleRows(frozen.values(),cfg) : null}};
}
function snapshotConfigPreTape(e: VstEngine) {
  const capacity = configRetention(e);
  const grouped = new Map<string, ConfigTapeRow[]>();
  for (const c of e.closed) {
    if (!deskTapeRow(e,c) || ("examFlat" in c && c.examFlat)) continue;
    const row=configTapeRow(c), key=strategyConfigSampleKey(row), own=grouped.get(key) ?? [];
    if (own.length < capacity) own.push(row);
    grouped.set(key,own);
  }
  for (const [key,rows] of configTapeMem.get(e) ?? []) {
    const retained=rows.filter(row=>!row.examFlat).map(configTapeRow);
    grouped.set(key,extendOwnSampleHistory(grouped.get(key) ?? [],retained,capacity));
  }
  const rows=[...grouped.values()].flat();
  e.frozenBaseSamples=rows;
  configPreMem.set(e,rows);
  if (rows.some(row => row.priceTrailPct != null)) frozenNativeIndex.set(rows, grouped);
}
function filterConfigRows(rows: ConfigTapeRow[], rel: ConfigIdentity, limit: number, accept?: (row: ConfigTapeRow) => boolean) {
  const out: ConfigTapeRow[] = [];
  for (const c of rows) {
    if (c.examFlat || (accept && !accept(c))) continue;
    if (!configDetailsMatch(c, rel)) continue;
    if (rel.symbol && c.symbol !== rel.symbol) continue;
    if (rel.side && c.side !== rel.side) continue;
    if (rel.indication && c.indication !== rel.indication) continue;
    if (rel.tactic && c.tactic !== rel.tactic) continue;
    if (rel.rangeType && c.rangeType !== rel.rangeType) continue;
    if (rel.playbook && c.playbook !== rel.playbook) continue;
    if (rel.kind && (c.kind ?? "") !== rel.kind) continue;
    if (rel.tpAtr != null && c.tpAtr !== rel.tpAtr) continue;
    if (rel.slOfTp != null && c.slOfTp !== rel.slOfTp) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

function ownFrozenConfigRows(e: VstEngine, rel: ConfigIdentity, limit: number) {
  const rows = frozenConfigRows(e);
  if (!rows.length) return rows;
  const key = Number.isFinite(rel.priceStopPct) && Number.isFinite(rel.priceTrailPct)
    ? completeStrategyConfigSampleKey(rel) : null;
  if (key == null) return filterConfigRows(rows, rel, limit);
  let index = frozenNativeIndex.get(rows);
  if (!index) {
    // A restart restores the serialized tape. Rebuild its index on demand.
    index = new Map();
    for (const row of rows) {
      if (row.examFlat) continue;
      const rowKey = completeStrategyConfigSampleKey(row);
      if (rowKey == null) continue;
      const own = index.get(rowKey);
      if (own) own.push(row);
      else index.set(rowKey, [row]);
    }
    frozenNativeIndex.set(rows, index);
  }
  // Keep the lookup exact, and retain the same numeric matching rules as current tape.
  return filterConfigRows(index.get(key) ?? [], rel, limit);
}

/** Read the current own tape before applying the cap. A forced boundary
 * flatten or a modeled close cannot fill a settled execution window. */
function currentConfigRows(e: VstEngine, identity: ConfigIdentity, need: number) {
  const eligible = (row: ConfigTapeRow) => deskTapeRow(e, row);
  const current = filterConfigRows(e.closed, identity, need, eligible);
  const retained = filterConfigRows(historyRows(e, identity), identity, need, eligible);
  return extendOwnSampleHistory(current, retained, need);
}

/** Close the base exam: score every set, drop what did not validate, keep the best tapes for live. */
export function finishBaseEval(e: VstEngine, block?: BlockConfig) {
  const blk = block ?? e.blockCfg ?? DEFAULT_BLOCK_CONFIG;
  if (!e.liveTape) snapshotConfigPreTape(e);
  e.preEvalDone = true;
  evalBlockRelations(e, blk);
  flattenNonPerforming(e);
  refreshProgressEvals(e, blk);
  refreshLiveDisable(e, blk);
  // Exam closes scored the relations. Live Block windows start clean so a paper PF does not gate or unlock Real.
  e.blockWindows = {};
  e.blockWindowsBySymbol = {};
  e.blockWindowsBySide = {};
  e.blockWindowsByIndication = {};
  e.blockWindowsByType = {};
  e.blockWindowsByIndicationType = {};
  e.blockRelWindows = {};
}

/** Paper $10 book uses 12× size on the open tape and after the exam, so later hours do not shrink to dust. */
function paperSizeEquity(e: VstEngine): number {
  const eq = Number(e.stats?.equity) || 0;
  if (paperMode(e) && (completeOpenTape(e) || performingLive(e)) && eq > 0 && eq < 200) return eq * 12;
  return eq > 0 ? eq : 1e4;
}
/** Live hour stays non-negative and inside a tight PF band. Intern exam is never flattened. */
const STABLE_HOUR_PF = 1.08;
/** Missing coords retain future-entry hour controls. Settlement evidence is never scratched. */
export function pfCoordOn(e: VstEngine, key: keyof PfCoordToggles): boolean {
  const c = e.pfCoords;
  if (!c) return key === "hourKeep";
  return c[key] !== false;
}
function notePfCoord(e: VstEngine, key: "pair" | "bank" | "cool" | "again" | "scratch") {
  const bag = (e.pfCoordHits ??= { pair: 0, bank: 0, cool: 0, again: 0, scratch: 0 });
  bag[key] += 1;
}
function pfHourIndex(e: VstEngine) {
  return Math.floor(Math.max(0, e.tick - 1) / TICKS_PER_HOUR);
}
const laneCoolMem = new WeakMap<VstEngine, { hour: number; loss: Record<string, number> }>();
function laneCoolKey(p: LivePosition): string | null {
  if (!p.indication) return null;
  const exact = completeStrategyConfigSampleKey({ ...p, rangeType: p.controllingRange });
  return exact ? `cfg:${exact}` : `legacy:${p.symbol}:${p.indication}:${p.tactic || "x"}`;
}
function noteLaneLoss(e: VstEngine, p: LivePosition, ratio: number) {
  if (!pfCoordOn(e, "laneCool") || ratio >= -1e-9) return;
  if (!(completeOpenTape(e) || performingLive(e) || e.liveTape)) return;
  const k = laneCoolKey(p);
  if (!k) return;
  const hour = pfHourIndex(e);
  let bag = laneCoolMem.get(e);
  if (!bag || bag.hour !== hour) {
    bag = { hour, loss: {} };
    laneCoolMem.set(e, bag);
  }
  const n = (bag.loss[k] ?? 0) + 1;
  bag.loss[k] = n;
  if (n === 2) notePfCoord(e, "cool");
}
function laneCooled(e: VstEngine, p: LivePosition): boolean {
  if (!pfCoordOn(e, "laneCool")) return false;
  const bag = laneCoolMem.get(e);
  if (!bag || bag.hour !== pfHourIndex(e)) return false;
  const k = laneCoolKey(p);
  return k != null && (bag.loss[k] ?? 0) >= 2;
}
const winAgainMem = new WeakMap<VstEngine, { hour: number; n: Record<string, number> }>();
function queueWinAgain(e: VstEngine, p: LivePosition) {
  if (!pfCoordOn(e, "winAgain")) return;
  if (!(completeOpenTape(e) || performingLive(e) || e.liveTape)) return;
  if (String(p.playbook || "").startsWith("bot:")) return;
  if (e.queue.length >= maxQueue(e)) return;
  const q = e.quotes[p.symbol];
  if (!q || !(q.px > 0)) return;
  const hour = pfHourIndex(e);
  let bag = winAgainMem.get(e);
  if (!bag || bag.hour !== hour) {
    bag = { hour, n: {} };
    winAgainMem.set(e, bag);
  }
  const parentIdentity: ConfigIdentity = { ...p, rangeType: p.controllingRange };
  const exactParentKey = completeStrategyConfigSampleKey(parentIdentity);
  const legacyKey = `${p.symbol}:${p.side}:${p.indication || "x"}:${p.tactic || "x"}`;
  const k = exactParentKey ? `cfg:${exactParentKey}` : `legacy:${legacyKey}`;
  if ((bag.n[k] ?? 0) >= 4) return;
  if (performingLive(e)) {
    const tac = String(p.tactic || "");
    const play = String(p.playbook || "");
    if (tac === "dca" || play === "dca") {
      if (p.tpAtr == null || p.slOfTp == null || !relExamPass(e, { indication: p.indication, tactic: "dca", tpAtr: p.tpAtr, slOfTp: p.slOfTp })) return;
    }
    if (performingLive(e) && (tac === "trailing" || tac === "hybrid" || play === "short")) {
      if (
        p.tpAtr == null ||
        p.slOfTp == null ||
        !validatedSet(e, {
          ...p,
          rangeType: p.controllingRange,
        })
      )
        return;
    }
    if ((tac === "dca" || play === "dca") && laneLiveCold(e, "dca")) return;
    if (play === "block" && laneLiveCold(e, "block")) return;
  }
  if (e.queue.some((o) => o.note.includes("pf-again") && (exactParentKey
    ? completeStrategyConfigSampleKey(o) === exactParentKey
    : o.symbol === p.symbol && o.side === p.side && o.indication === p.indication))) return;
  bag.n[k] = (bag.n[k] ?? 0) + 1;
  const px = q.px;
  const sl0 = p.slDist;
  const tp0 = p.tpDist;
  const parentCost = p.modelRtCost ?? modeledPositionCost(e, p.symbol);
  const parentMinSl = p.minSlDistancePct ?? normalizeMinSlDistancePct(e.minSlDistancePct);
  const lv = protectLevels(px, p.side, sl0, tp0, sl0 > 1e-12 ? tp0 / sl0 : 1, true, parentCost, parentMinSl);
  const unitQty = sizeUnit(e) / px;
  const baseLeg = p.legs[0]?.qty > 0 ? p.legs[0].qty : unitQty;
  const qty = Math.min(Math.max(baseLeg, 1e-8), (sizeUnit(e) * ENTRY_NOTIONAL_MUL) / px);
  queueOrder(e, {
    id: nextId(e, "q"),
    strategyId: p.strategyId,
    connId: p.connId,
    symbol: p.symbol,
    side: p.side,
    type: e.orderType === "market" ? "market" : "limit",
    qty,
    filled: 0,
    price: px,
    remaining: qty,
    status: "queued",
    rangeType: p.controllingRange ?? e.lastRange,
    level: 1,
    sl: lv.sl,
    tp: lv.tp,
    slDist: lv.slDist,
    tpDist: lv.tpDist,
    batchId: "",
    note: `pf-again ${p.indication || ""} ${p.tactic || ""}`,
    indication: p.indication,
    kind: p.kind,
    playbook: p.playbook,
    tactic: p.tactic ?? e.lastTactic,
    validExec: true,
    tpAtr: p.tpAtr,
    slOfTp: p.slOfTp,
    trailPct: p.trailPct,
    trailingDistance: p.trailingDistance,
    priceStopPct: p.priceStopPct,
    priceTrailPct: p.priceTrailPct,
    maxHoldTicks: p.maxHoldTicks,
    minimalRange: p.minimalRange,
    microRange: p.microRange,
    shortRange: p.shortRange,
    calc: p.calc ?? "base",
    modelRtCost: parentCost,
    minSlDistancePct: parentMinSl,
    microMinSlDistancePct: p.microMinSlDistancePct,
    microMinTrailDistancePct: p.microMinTrailDistancePct,
  });
  countPlaced(e);
  notePfCoord(e, "again");
}
type HourLaneBag = { hour: number; p: number; l: number };
const hourLaneCache = new WeakMap<VstEngine, Map<string, HourLaneBag>>();
function hourLaneOf(e: VstEngine, key: string): HourLaneBag {
  const hour = Math.floor(Math.max(0, e.tick - 1) / TICKS_PER_HOUR);
  let map = hourLaneCache.get(e);
  if (!map) {
    map = new Map();
    hourLaneCache.set(e, map);
  }
  let bag = map.get(key);
  if (!bag || bag.hour !== hour) {
    bag = { hour, p: 0, l: 0 };
    map.set(key, bag);
  }
  return bag;
}
function noteHourLane(e: VstEngine, key: string, ratio: number) {
  if (!Number.isFinite(ratio) || ratio === 0) return;
  const bag = hourLaneOf(e, key);
  if (ratio > 0) bag.p += ratio;
  else bag.l += -ratio;
}
function blockHourLaneKey(p: LivePosition): string {
  const exact = completeStrategyConfigSampleKey({ ...p, rangeType: p.controllingRange });
  return exact ? `play:block:cfg:${exact}` : "play:block";
}
function noteHourLive(e: VstEngine, pnl: number, gated: boolean, ratio = 0) {
  if (!gated) return;
  const hour = Math.floor(Math.max(0, e.tick - 1) / TICKS_PER_HOUR);
  let bag = e.hourLive;
  if (!bag || bag.hour !== hour) {
    bag = { hour, p: 0, l: 0, n: 0, rp: 0, rl: 0 };
    e.hourLive = bag;
  }
  bag.n += 1;
  if (pnl > 0) bag.p += pnl;
  else bag.l += Math.abs(pnl);
  if (ratio > 0) bag.rp = (bag.rp ?? 0) + ratio;
  else if (ratio < 0) bag.rl = (bag.rl ?? 0) + -ratio;
}
/** Block last-N / PF rings: intern during pre, live validExec after pre. Intern paper never pollutes live Block gates. */
function countsOnBlockTape(e: VstEngine, validExec?: boolean): boolean {
  if (internAllPhase(e) || !e.preEvalDone) return true;
  return validExec === true;
}
/** Share of a close that is Block overlay qty (split out of short-combo last-N). */
function blockOverlayShare(qty: number, blockQty: number | undefined, playbook?: string): number {
  if (playbook === "block") return 1;
  const q = Math.max(0, Number(qty) || 0);
  const bq = Math.min(q, Math.max(0, Number(blockQty) || 0));
  if (q > 1e-12 && bq > 1e-12) return Math.min(1, bq / q);
  return 0;
}
function comboTapeStats(rows: { pnl?: number; ratio?: number }[] | undefined): { n: number; pf: number; net: number } {
  if (!rows?.length) return { n: 0, pf: 0, net: 0 };
  let gp = 0;
  let gl = 0;
  let net = 0;
  for (const r of rows) {
    const p = edgePnl(r);
    net += p;
    if (p > 0) gp += p;
    else if (p < 0) gl += -p;
  }
  return { n: rows.length, pf: profitFactor(gp, gl), net };
}
function relComboAlive(e: VstEngine, tpAtr: number, slOfTp: number): boolean {
  const combo = shortComboKey(tpAtr, slOfTp);
  const keys = e.validRelKeys;
  if (!keys) return false;
  for (const k of Object.keys(keys)) if (k.endsWith(`:${combo}`)) return true;
  return false;
}
function internRelKey(ind: string | undefined, tac: string | undefined, tpAtr: number, slOfTp: number): string {
  return `${ind || "na"}:${tac || "na"}:${shortComboKey(tpAtr, slOfTp)}`;
}
const relRun = new WeakMap<VstEngine, Record<string, { n: number; gp: number; gl: number }>>();
const relPreRun = new WeakMap<VstEngine, Record<string, { n: number; gp: number; gl: number }>>();
type LaneLiveBag = { hour: number; n: number; gp: number; gl: number; cold: boolean };
const laneLiveRun = new WeakMap<VstEngine, Record<string, LaneLiveBag>>();
let shortLiveNotes = 0;
export function shortLiveNoteCount(): number {
  return shortLiveNotes;
}
function hourIndex(e: VstEngine): number {
  return Math.floor(Math.max(0, e.tick) / TICKS_PER_HOUR);
}
function noteLaneLive(e: VstEngine, lane: string, pnl: number) {
  if (lane === "short") shortLiveNotes += 1;
  const hour = hourIndex(e);
  let all = laneLiveRun.get(e);
  if (!all) {
    all = {};
    laneLiveRun.set(e, all);
  }
  let bag = all[lane];
  if (!bag || bag.hour !== hour) bag = { hour, n: 0, gp: 0, gl: 0, cold: false };
  bag.n += 1;
  const x = Number(pnl) || 0;
  if (x > 0) bag.gp += x;
  else bag.gl -= x;
  const tog = e.strategyToggles;
  const openShort = lane === "short" && tog?.dca === false && tog?.block === false;
  const need = lane === "axis" || openShort ? 24 : 8;
  const cut = openShort ? 0.85 : lane === "axis" ? 0.75 : 1;
  if (bag.n >= need) {
    const pf = profitFactor(bag.gp, bag.gl);
    bag.cold = pf + 1e-9 < cut && bag.gp - bag.gl <= 0;
  } else bag.cold = false;
  all[lane] = bag;
}
function laneBag(e: VstEngine, lane: string): LaneLiveBag | undefined {
  const bag = laneLiveRun.get(e)?.[lane];
  if (!bag || bag.hour !== hourIndex(e)) return undefined;
  return bag;
}
function laneLiveCold(e: VstEngine, lane: string): boolean {
  return Boolean(laneBag(e, lane)?.cold);
}
function noteLiveBooks(
  e: VstEngine,
  c: { tactic?: string; playbook?: string; dcaQty?: number; blockQty?: number; qty?: number; pnl: number },
) {
  const tac = String(c.tactic || "");
  const play = String(c.playbook || "");
  const dcaQty = Math.max(0, Number(c.dcaQty) || 0);
  if (tac === "trailing" || tac === "hybrid" || play === "short") noteLaneLive(e, "short", c.pnl);
  if (tac === "axis" || play === "axis") noteLaneLive(e, "axis", c.pnl);
  if (tac === "dca" || play === "dca" || dcaQty > 0) noteLaneLive(e, "dca", c.pnl);
  if (play === "block" || (Number(c.blockQty) || 0) > 0) noteLaneLive(e, "block", c.pnl);
}
function shortLiveCold(e: VstEngine): boolean {
  return laneLiveCold(e, "short");
}
/** Probe until this hour proves itself, then let a hot book print. A red hour stays at 0. */
function shortRestCap(e: VstEngine, shareCap: number): number {
  const bag = laneBag(e, "short");
  const tog = e.strategyToggles;
  const room = tog?.dca === false && tog?.block === false;
  if (!bag) return room ? 24 : 8;
  const pf = profitFactor(bag.gp, bag.gl);
  const net = bag.gp - bag.gl;
  if (room && bag.n >= 8 && pf >= 1.8 && net > 0) return Math.min(shareCap, 64);
  if (room && bag.n >= 8 && pf >= 1.25 && net > 0) return Math.min(shareCap, 32);
  if (bag.n >= 10 && pf >= 1.4 && net > 0) return Math.min(shareCap, room ? 32 : 14);
  return room ? 16 : 8;
}
function dropLaneOrders(e: VstEngine, match: (o: LiveOrder) => boolean) {
  const dropQ = new Set<string>();
  for (const o of e.queue) {
    if (!match(o)) continue;
    if (o.status !== "queued" && o.status !== "open" && o.status !== "partial") continue;
    markTerminal(e, o, "cancelled");
    dropQ.add(o.id);
  }
  if (dropQ.size) e.queue = e.queue.filter((o) => !dropQ.has(o.id));
  const keep: LiveOrder[] = [];
  for (const o of e.orders) {
    if (match(o) && (o.status === "queued" || o.status === "open" || o.status === "partial")) {
      markTerminal(e, o, "cancelled");
      continue;
    }
    keep.push(o);
  }
  e.orders = keep;
}

/** Overall and future: a full queue must not erase a catalog lane. Free a few extras from fat lanes. */
function keepCatalogLanes(e: VstEngine, connId: string) {
  if (!(e.completeSim && paperMode(e))) return;
  // Rebalancing is needed only when the queue is full. Cancelling an ordinary
  // partial queue churned valid orders on every arm cycle despite free slots.
  if (e.queue.filter(o => o.connId === connId && !isBotPlay(o.playbook)).length < maxQueue(e)) return;
  const count = new Map<string, number>();
  const bump = (ind?: string) => {
    if (!ind) return;
    count.set(ind, (count.get(ind) || 0) + 1);
  };
  for (const o of e.queue) if (o.connId === connId && !isBotPlay(o.playbook)) bump(o.indication);
  for (const o of e.orders) {
    if (o.connId !== connId || isBotPlay(o.playbook)) continue;
    if (o.status !== "open" && o.status !== "partial" && o.status !== "queued") continue;
    bump(o.indication);
  }
  const missing = SHORT_PROGRESS_INDICATIONS.filter((id) => !e.skipIndications?.includes(id) && (count.get(id) || 0) < 1);
  if (!missing.length) return;
  let slots = missing.length * 2;
  const budget = new Map<string, number>();
  for (const [id, n] of [...count.entries()].sort((a, b) => b[1] - a[1])) {
    if (slots <= 0) break;
    const give = Math.min(slots, n - 2);
    if (give <= 0) continue;
    budget.set(id, give);
    slots -= give;
  }
  if (!budget.size) return;
  const used = new Map<string, number>();
  dropLaneOrders(e, (o) => {
    if (o.connId !== connId || !o.indication) return false;
    const cap = budget.get(o.indication);
    if (!cap) return false;
    const u = used.get(o.indication) || 0;
    if (u >= cap) return false;
    used.set(o.indication, u + 1);
    return true;
  });
}
function dropColdLanes(e: VstEngine) {
  if (laneLiveCold(e, "short")) {
    dropLaneOrders(
      e,
      (o) => o.validExec === true && o.tactic !== "axis" && (o.tactic === "trailing" || o.tactic === "hybrid" || o.playbook === "short"),
    );
  }
  if (laneLiveCold(e, "dca")) {
    dropLaneOrders(e, (o) => o.tactic === "dca" || o.playbook === "dca" || /^DCA/i.test(o.note || ""));
  }
  if (laneLiveCold(e, "block")) {
    dropLaneOrders(e, (o) => o.playbook === "block" || /Block/i.test(o.note || ""));
  }
}
function trimShortBook(e: VstEngine, cap: number) {
  const dist = (o: LiveOrder) => {
    const q = e.quotes[o.symbol];
    const atr = Math.max(q?.atr || 0, (q?.px || 1) * 0.0008, 1e-9);
    return q && o.price > 0 ? Math.abs(o.price - q.px) / atr : 9;
  };
  const kill = new Set<LiveOrder>();
  for (const tac of ["trailing", "hybrid"] as const) {
    const rows: LiveOrder[] = [];
    const match = (o: LiveOrder) =>
      o.validExec === true &&
      o.tactic === tac &&
      (o.status === "queued" || o.status === "open" || o.status === "partial");
    for (const o of e.queue) if (match(o)) rows.push(o);
    for (const o of e.orders) if (match(o) && !rows.includes(o)) rows.push(o);
    if (rows.length <= cap) continue;
    rows.sort((a, b) => dist(a) - dist(b));
    for (const o of rows.slice(cap)) kill.add(o);
  }
  if (kill.size) dropLaneOrders(e, (o) => kill.has(o));
}
function bumpRelRun(e: VstEngine, key: string, pnl: number) {
  let bag = relRun.get(e);
  if (!bag) {
    bag = {};
    relRun.set(e, bag);
  }
  const row = bag[key] ?? (bag[key] = { n: 0, gp: 0, gl: 0 });
  row.n += 1;
  const x = Number(pnl) || 0;
  if (x > 0) row.gp += x;
  else row.gl -= x;
}
function noteRelClose(
  e: VstEngine,
  c: { indication?: string; tactic?: string; tpAtr?: number; slOfTp?: number; pnl?: number; validExec?: boolean },
) {
  if (c.tpAtr == null || c.slOfTp == null) return;
  if (c.validExec === true && e.preEvalDone) {
    const key = internRelKey(c.indication, c.tactic, c.tpAtr, c.slOfTp);
    let bag = liveRelMem.get(e);
    if (!bag) {
      bag = {};
      liveRelMem.set(e, bag);
    }
    const ring = bag[key] ?? (bag[key] = []);
    ring.unshift({ pnl: edgePnl(c) });
    if (ring.length > 40) ring.length = 40;
    return;
  }
  const key = internRelKey(c.indication, c.tactic, c.tpAtr, c.slOfTp);
  bumpRelRun(e, key, edgePnl(c));
  const bag = e.shortRelTape ?? (e.shortRelTape = {});
  const ring = bag[key] ?? (bag[key] = []);
  ring.unshift({ pnl: Number(c.pnl) || 0, ratio: Number(c.pnl) || 0 });
  if (ring.length > SHORT_COMBO_TAPE_CAP) ring.length = SHORT_COMBO_TAPE_CAP;
}
function baseStageFloor(e: VstEngine): number {
  return Math.max(BASE_STAGE_PF, minPfFor(e, "base"));
}

/** Process a full last-N once the eval count is filled. Under that count, keep accepting from 8. */
function lastNTapePass(e: VstEngine, rows: { pnl: number }[] | undefined, floor = baseStageFloor(e)): boolean {
  const base = floor;
  const cfg = lastNProgressOf(e);
  if (!rows) return false;
  const evalCount = evalWindowCount(cfg);
  // Legacy default warm-up remains available; explicit independent policies and
  // negative vetoes must reach their own decision, even on a short tape.
  if (rows.length < evalCount && !cfg.policies?.length && !cfg.negativeFilter && !cfg.blocks) return nearLastNPass(rows, 8, base);
  const d = decideLastN(rows, cfg, base, base);
  if (selectedDisjointBlocks(cfg, d)) return d.pass;
  const validOk = d.validHits.some((h) => h.samples >= h.n && h.pf + 1e-9 >= base && h.net > 0);
  if (!validOk || !d.pass) return false;
  const evalFull = d.evalHits.filter((h) => h.samples >= h.n);
  if (!evalFull.length) return true;
  return evalFull.some((h) => h.pf + 1e-9 >= base && h.avg >= 0);
}

export function refreshValidRelKeys(e: VstEngine) {
  const tapes = (e.shortRelPreTape && Object.keys(e.shortRelPreTape).length ? e.shortRelPreTape : e.shortRelTape) ?? {};
  const stats = Object.entries(tapes).map(([k, rows]) => ({ k, ...comboTapeStats(rows) }));
  const internN = stats.reduce((s, r) => s + r.n, 0);
  let gp = 0;
  let gl = 0;
  for (const rows of Object.values(tapes)) {
    for (const x of rows) {
      const p = Number(x.pnl) || 0;
      if (p > 0) gp += p;
      else gl += Math.abs(p);
    }
  }
  const overall = profitFactor(gp, gl);
  const floor = Math.max(minPfFor(e, "shortBase"), overall > 0 ? overall * 1.5 : 1.15, 1.05);
  const ranked = stats
    .filter((r) => r.n >= 4 && r.net > 0)
    .sort((a, b) => b.pf - a.pf || b.n - a.n);
  const maxN = Math.max(1, Math.floor(Math.max(internN, 1) * 0.10));
  const minN = Math.max(1, Math.floor(Math.max(internN, 1) * 0.01));
  const keys: Record<string, number> = {};
  let cum = 0;
  for (const r of ranked) {
    if (cum >= maxN && Object.keys(keys).length) break;
    if (r.pf + 1e-9 < floor && cum >= minN) break;
    keys[r.k] = r.pf;
    cum += r.n;
  }
  e.validRelKeys = keys;
  e.validRelShare = internN > 0 ? cum / internN : 0;
  const full = relPreRun.get(e);
  const execStats = full && Object.keys(full).length
    ? Object.entries(full).map(([k, r]) => {
        const pf = profitFactor(r.gp, r.gl);
        return { k, n: r.n, pf, net: r.gp - r.gl };
      })
    : stats;
  const execKeys: Record<string, number> = {};
  const combos = new Set<string>();
  const prefixes = new Set<string>();
  for (const r of execStats) {
    const tiny = r.pf >= PF_NO_LOSS - 1e-9 && r.net <= 1e-4;
    if (tiny || r.pf >= 30) continue;
    if (!lastNTapePass(e, tapes[r.k])) continue;
    execKeys[r.k] = r.pf;
    const cut = r.k.indexOf(":");
    const cut2 = cut >= 0 ? r.k.indexOf(":", cut + 1) : -1;
    if (cut2 > 0) {
      prefixes.add(r.k.slice(0, cut2));
      combos.add(r.k.slice(cut2 + 1));
    }
  }
  execRelMem.set(e, { keys: execKeys, combos, prefixes });
}
export function internRelProven(
  e: VstEngine,
  rel: { indication?: string; tactic?: string; tpAtr?: number; slOfTp?: number },
): boolean {
  // Intern→valid share statistic only. Live execute uses independent shortComboProven / last-N.
  if (internAllPhase(e) || !e.preEvalDone) return true;
  if (!e.completeSim && !e.preEvalDone) return true;
  const keys = e.validRelKeys;
  if (!keys || !Object.keys(keys).length) return false;
  if (rel.tpAtr == null || rel.slOfTp == null) return false;
  const k = internRelKey(rel.indication, rel.tactic, rel.tpAtr, rel.slOfTp);
  if (keys[k]) return true;
  const combo = shortComboKey(rel.tpAtr, rel.slOfTp);
  const prefix = `${rel.indication || "na"}:`;
  return Object.keys(keys).some((x) => x.startsWith(prefix) && x.endsWith(`:${combo}`));
}
const execRelMem = new WeakMap<VstEngine, { keys: Record<string, number>; combos: Set<string>; prefixes: Set<string> }>();
const liveRelMem = new WeakMap<VstEngine, Record<string, { pnl: number }[]>>();
/** Own indication×tactic×combo exam, not the mixed TP×SL blend. A live tail can disable only that set. */
function relExamPass(
  e: VstEngine,
  rel: { indication?: string; tactic?: string; tpAtr?: number; slOfTp?: number },
): boolean {
  if (!e.completeSim || !e.preEvalDone || internAllPhase(e) || completeOpenTape(e)) return false;
  if (rel.tpAtr == null || rel.slOfTp == null) return false;
  const bag = execRelMem.get(e);
  if (!bag) return false;
  const k = internRelKey(rel.indication, rel.tactic, rel.tpAtr, rel.slOfTp);
  if (bag.keys[k] == null) return false;
  const live = liveRelMem.get(e)?.[k];
  if (live && live.length >= 8) {
    const st = comboTapeStats(live);
    const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
    const tac = String(rel.tactic || "");
    if ((tac === "trailing" || tac === "hybrid") && st.net <= 0 && st.pf + 1e-9 < 1) return false;
    if (live.length >= 24 && (tiny || (st.pf + 1e-9 < 0.9 && st.net <= 0))) return false;
  }
  return true;
}
function examRelReady(e: VstEngine): boolean {
  const bag = execRelMem.get(e);
  return Boolean(bag && Object.keys(bag.keys).length);
}
function comboExamAlive(e: VstEngine, tpAtr: number, slOfTp: number): boolean {
  const bag = execRelMem.get(e);
  return Boolean(bag?.combos.has(shortComboKey(tpAtr, slOfTp)));
}
function execRelPrefix(e: VstEngine, ind: string, tac: string): boolean {
  return Boolean(execRelMem.get(e)?.prefixes.has(`${ind}:${tac}`));
}
const comboRun = new WeakMap<VstEngine, Record<string, { n: number; gp: number; gl: number }>>();
const comboPreRun = new WeakMap<VstEngine, Record<string, { n: number; gp: number; gl: number }>>();

function bumpComboRun(e: VstEngine, key: string, pnl: number) {
  let bag = comboRun.get(e);
  if (!bag) {
    bag = {};
    comboRun.set(e, bag);
  }
  const row = bag[key] ?? (bag[key] = { n: 0, gp: 0, gl: 0 });
  row.n += 1;
  const x = Number(pnl) || 0;
  if (x > 0) row.gp += x;
  else row.gl -= x;
}
function noteShortComboClose(
  e: VstEngine,
  c: { connId?: string; id?: string; tpAtr?: number; slOfTp?: number; pnl?: number; validExec?: boolean; indication?: string; tactic?: string },
) {
  if (c.tpAtr == null || c.slOfTp == null) return;
  if (!deskTapeRow(e, c)) return;
  const key = shortComboKey(c.tpAtr, c.slOfTp);
  const live = Boolean(e.preEvalDone && c.validExec === true);
  const bag = live ? (e.shortComboLiveTape ?? (e.shortComboLiveTape = {})) : (e.shortComboTape ?? (e.shortComboTape = {}));
  const ring = bag[key] ?? (bag[key] = []);
  ring.unshift({ pnl: Number(c.pnl) || 0, ratio: Number(c.pnl) || 0 });
  if (ring.length > SHORT_COMBO_TAPE_CAP) ring.length = SHORT_COMBO_TAPE_CAP;
  if (!live) bumpComboRun(e, key, Number(c.pnl) || 0);
  noteRelClose(e, c);
}
function internCumulativeOk(rows: { pnl: number }[] | undefined, floor: number, minN: number): boolean {
  const st = comboTapeStats(rows);
  if (st.n < minN) return false;
  if (st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6) return false;
  return st.pf + 1e-9 >= floor && st.net > 1e-9;
}
function comboLastNPass(
  e: VstEngine,
  rows: { pnl: number }[] | undefined,
  minPf: number,
  basePf: number,
  _live: boolean,
): boolean {
  if (!rows || rows.length < 6) return false;
  const ln = lastNProgressOf(e);
  const d = decideLastN(rows, { ...ln, mode: "independent" }, minPf, basePf);
  if (!d.pass) return false;
  const evidence = selectedDisjointBlocks(ln, d) ? d.evalHits : d.validHits;
  const gated = evidence.filter((h) => h.samples >= h.n && h.pf + 1e-9 >= Math.max(GATED_MIN_PF, basePf, BASE_STAGE_PF) && h.net > 0);
  if (!gated.length) return false;
  const st = comboTapeStats(rows);
  if (st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6) return false;
  return true;
}
function shortComboRow(
  e: VstEngine,
  tpAtr: number,
  slOfTp: number,
): { n: number; pf: number; net: number; ok?: boolean } | undefined {
  const key = shortComboKey(tpAtr, slOfTp);
  const tape = e.shortComboTape?.[key];
  if (tape && tape.length) {
    const shortFloor = minPfFor(e, "short");
    const baseFloor = minPfFor(e, "shortBase");
    const sc = scoreLastNGroup(tape, lastNProgressOf(e), baseFloor, baseFloor);
    return { n: sc.n || tape.length, pf: sc.pf, net: sc.net, ok: sc.ok };
  }
  return e.progressEval?.shortCombos?.[key];
}
function internStartRows(e: VstEngine, key: string): { pnl: number }[] | undefined {
  const internLive = e.shortComboTape?.[key];
  const pre = e.shortComboPreTape?.[key];
  // After pre: intern-all is scoring-only. Live start is the frozen pre tape, never post-pre intern dump.
  if (e.preEvalDone) {
    if (pre && pre.length) return pre;
    return internLive;
  }
  if (internLive && internLive.length >= 4 && internStartOk(e, internLive)) return internLive;
  if (pre && pre.length) return pre;
  return internLive;
}
function internStartOk(e: VstEngine, rows: { pnl: number }[] | undefined): boolean {
  const st = comboTapeStats(rows);
  // Screenshot live floor: keep PF≥1, n≥4, net>0. Independent tape, not mixed last-240.
  if (st.n >= 4 && st.pf + 1e-9 >= 1 && st.net > 0) {
    if (st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6) return false;
    return true;
  }
  if (st.n >= 12 && st.pf + 1e-9 >= minPfFor(e, "short") && st.net > 0) return true;
  if (!internCumulativeOk(rows, 1, 4)) return false;
  const d = decideLastN(rows ?? [], lastNProgressOf(e), minPfFor(e, "short"), minPfFor(e, "shortBase"));
  return d.validHits.some((h) => h.n >= 8 && h.samples >= h.n && h.pf + 1e-9 >= 1 && h.avg > 0);
}
function internComboRank(e: VstEngine, tpAtr: number, slOfTp: number): number {
  const rows = internStartRows(e, shortComboKey(tpAtr, slOfTp));
  const st = comboTapeStats(rows);
  if (st.n < 4) return 0;
  if (!internStartOk(e, rows)) return st.n;
  const d = decideLastN(rows ?? [], lastNProgressOf(e), minPfFor(e, "short"), minPfFor(e, "shortBase"));
  const evalHit = [...d.evalHits].filter((h) => h.samples >= h.n && h.n >= 15).sort((a, b) => b.n - a.n)[0];
  const pf = evalHit?.pf ?? st.pf;
  return 1e6 + pf * 1e3 + st.n;
}
function internComboLiveOk(e: VstEngine, rows: { pnl: number }[] | undefined, shortFloor: number, baseFloor: number): boolean {
  if (!rows?.length) return false;
  if (internStartOk(e, rows)) return true;
  return comboLastNPass(e, rows, shortFloor, baseFloor, false);
}
/** Intern last-N (Base + valid) starts live. Live last-N continues/disables. Intern after-pre never mixes into live disable. No hardcoded set. */
export function shortComboProven(e: VstEngine, tpAtr: number, slOfTp: number): boolean {
  if (internAllPhase(e)) return true;
  if (completeOpenTape(e)) return true;
  if (e.shortComboOnly && paperMode(e)) return true;
  const key = shortComboKey(tpAtr, slOfTp);
  if (e.preEvalDone && !e.liveTape) {
    const pre = e.shortComboPreTape?.[key];
    const full = comboPreRun.get(e)?.[key];
    const fullPf = full ? profitFactor(full.gp, full.gl) : 0;
    const fullNet = full ? full.gp - full.gl : 0;
    // The whole exam decides. A cold last-80 tail must not erase a winning combo or keep a losing one.
    if (full && full.n >= 12) return fullPf + 1e-9 >= 1 && fullNet > 0;
    const fullOk = !!full && full.n >= 12 && fullPf + 1e-9 >= 1 && fullNet > 0;
    const gate = typeGateMem.get(e);
    if (performingLive(e) && gate) {
      const st = comboTapeStats(pre);
      const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-4;
      // Same bar the exam used (PF≥1). Do not re-raise it to the winner blend or a cold last-80 tail.
      const need = 1;
      const tailDead = st.n >= 8 && st.pf < 0.85 && st.net <= 0;
      const beats = st.n >= 4 && st.net > 1e-6 && !tiny && st.pf + 1e-9 >= need && st.pf < 6;
      if (tailDead && !fullOk) return false;
      if (!fullOk && !beats) return false;
      // Exam pass stays armed. A cold live ring must not shut the book off for the rest of the session.
      return true;
    }
    if (pre && pre.length) {
      const st = comboTapeStats(pre);
      const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
      const preOk = st.n >= 4 && st.pf + 1e-9 >= 1 && st.net > 1e-9 && !tiny;
      if (!preOk) {
        const liveSt = comboTapeStats(e.shortComboLiveTape?.[key]);
        if (liveSt.n >= 8 && liveSt.pf + 1e-9 >= 1 && liveSt.net > 1e-9) return true;
        if (internComboLiveOk(e, pre, minPfFor(e, "short"), minPfFor(e, "shortBase"))) return true;
        return false;
      }
    }
  }
  const shortFloor = minPfFor(e, "short");
  const baseFloor = minPfFor(e, "shortBase");
  const intern = internStartRows(e, key);
  const liveRows = e.shortComboLiveTape?.[key];
  if (e.preEvalDone && liveRows && liveRows.length >= 6) {
    if (liveRows.length >= 12) return comboLastNPass(e, liveRows, shortFloor, baseFloor, true);
    const liveSt = comboTapeStats(liveRows);
    if (liveSt.n >= 6 && liveSt.net <= 0 && liveSt.pf + 1e-9 < baseFloor) return false;
    if (liveSt.n >= 8) {
      if (liveSt.pf >= PF_NO_LOSS - 1e-9 && liveSt.net <= 1e-6) return false;
      if (liveSt.pf + 1e-9 >= Math.max(shortFloor, GATED_MIN_PF) && liveSt.net > 0) return true;
      return comboLastNPass(e, liveRows, shortFloor, baseFloor, true);
    }
    if (liveSt.net > 0 && liveSt.pf + 1e-9 >= baseFloor && internComboLiveOk(e, intern, shortFloor, baseFloor)) return true;
    return internComboLiveOk(e, liveRows, shortFloor, baseFloor);
  }
  if (intern && intern.length) {
    const st = comboTapeStats(intern);
    if (st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6) return false;
    if (intern.length < 6) {
      if (e.liveTape && !e.preEvalDone) return true;
      if (!e.preEvalDone) return true;
      return internStartOk(e, intern);
    }
    return internComboLiveOk(e, intern, shortFloor, baseFloor);
  }
  const row = e.progressEval?.shortCombos?.[key];
  if (!row || row.n < 6) {
    if (!e.preEvalDone) return true;
    if (internStartOk(e, intern)) return true;
    return row != null && row.n >= 4 && row.ok === true && row.pf + 1e-9 >= GATED_MIN_PF && row.net > 0;
  }
  const pf = Number(row.pf) || 0;
  const net = Number(row.net) || 0;
  if (pf >= PF_NO_LOSS - 1e-9 && net <= 1e-6) return false;
  return pf + 1e-9 >= shortFloor && net > 0;
}
function exchangeCloseId(id: string | undefined | null) {
  return String(id || "").startsWith("x:");
}
function deskTapeRow(e: VstEngine, c: { connId?: string; id?: string }) {
  if (!isDeskConn(c.connId)) return false;
  if (e.liveTape && !exchangeCloseId(c.id)) return false;
  return true;
}
function rememberLiveHint(
  e: VstEngine,
  rel: {
    symbol?: string;
    side?: Side;
    indication?: IndicationId;
    tactic?: TacticKind;
    playbook?: string;
    kind?: string;
    rangeType?: RangeType;
    tpAtr?: number;
    slOfTp?: number;
  },
) {
  const symbol = String(rel.symbol || "");
  if (!symbol) return;
  e.liveLegHint = e.liveLegHint ?? {};
  const prev = e.liveLegHint[symbol] ?? {};
  e.liveLegHint[symbol] = {
    ...prev,
    side: rel.side ?? prev.side,
    indication: rel.indication ?? prev.indication,
    tactic: rel.tactic ?? prev.tactic,
    playbook: rel.playbook ?? prev.playbook,
    kind: rel.kind ?? prev.kind,
    rangeType: rel.rangeType ?? prev.rangeType,
    tpAtr: rel.tpAtr ?? prev.tpAtr,
    slOfTp: rel.slOfTp ?? prev.slOfTp,
  };
}
function deskInteractive(e: VstEngine) {
  return Boolean(e.deskUi);
}
function maxPositions(e: VstEngine) {
  if (e.activeConnId === "bingx-x01") return LIVE_MAX_POSITIONS;
  if (deskInteractive(e)) return LIVE_MAX_POSITIONS;
  return paperMode(e) ? PAPER_MAX_POSITIONS : VST_MAX_POSITIONS;
}
function signalKey(symbol: string, side: string) {
  return `${symbol}:${side === "short" ? "short" : "long"}`;
}
/** One signal per symbol+direction. Extra internal rows on that key are orders, not more positions. */
function signalKeys(e: VstEngine, connId?: string): Set<string> {
  const keys = new Set<string>();
  const take = (id: string, symbol: string, side: string, playbook?: string) => {
    if (connId && id !== connId) return;
    if (!symbol || isBotPlay(playbook)) return;
    keys.add(signalKey(symbol, side));
  };
  for (const p of e.positions) {
    if (!(p.qty > 0)) continue;
    take(p.connId, p.symbol, p.side, p.playbook);
  }
  for (const o of e.queue) take(o.connId, o.symbol, o.side, o.playbook);
  for (const o of e.orders) {
    if (o.status !== "open" && o.status !== "partial" && o.status !== "queued") continue;
    take(o.connId, o.symbol, o.side, o.playbook);
  }
  return keys;
}
function takeSignal(keys: Set<string>, symbol: string, side: string, cap: number) {
  const key = signalKey(symbol, side);
  if (keys.has(key)) return true;
  if (keys.size >= cap) return false;
  keys.add(key);
  return true;
}
function maxQueue(e: VstEngine) {
  if (deskInteractive(e)) return 480;
  return paperMode(e) ? PAPER_MAX_QUEUE : VST_MAX_QUEUE;
}
function maxWorking(e: VstEngine) {
  if (e.activeConnId === "bingx-x01") return Number.MAX_SAFE_INTEGER;
  if (deskInteractive(e)) return 320;
  return paperMode(e) ? PAPER_MAX_WORKING : VST_MAX_WORKING_ORDERS;
}
export const VST_MAX_BATCHES = 12;
export const VST_FILL_KEEP = 240;
export const VST_CONN_IDS = ["bingx-vst-01", "bingx-vst-02"] as const;
export const LIVE_CONN_ID = "bingx-x01";
export const DESK_CONN_IDS = [...VST_CONN_IDS, LIVE_CONN_ID] as const;
export const VST_DEFAULT_CONN = VST_CONN_IDS[1];

export function isDeskConn(id: string | undefined | null): boolean {
  return Boolean(id && (DESK_CONN_IDS as readonly string[]).includes(id));
}

export function ownedByDesk<T extends { connId: string }>(row: T, connId?: string): boolean {
  if (!isDeskConn(row.connId)) return false;
  return connId ? row.connId === connId : true;
}


export const VST_SYMBOLS: VstSymbol[] = [
  [
    "BTCUSDT",
    "BTC",
    64250,
    .007
  ],
  [
    "ETHUSDT",
    "ETH",
    3412,
    .01
  ],
  [
    "SOLUSDT",
    "SOL",
    148.4,
    .014
  ],
  [
    "BNBUSDT",
    "BNB",
    582,
    .009
  ],
  [
    "XRPUSDT",
    "XRP",
    .624,
    .016
  ],
  [
    "DOGEUSDT",
    "DOGE",
    .158,
    .02
  ],
  [
    "AVAXUSDT",
    "AVAX",
    38.2,
    .015
  ],
  [
    "LINKUSDT",
    "LINK",
    14.35,
    .013
  ],
  [
    "ADAUSDT",
    "ADA",
    .452,
    .018
  ],
  [
    "DOTUSDT",
    "DOT",
    6.84,
    .016
  ],
  [
    "MATICUSDT",
    "MATIC",
    .538,
    .019
  ],
  [
    "ATOMUSDT",
    "ATOM",
    7.12,
    .015
  ],
  [
    "NEARUSDT",
    "NEAR",
    5.41,
    .018
  ],
  [
    "APTUSDT",
    "APT",
    9.22,
    .017
  ],
  [
    "SUIUSDT",
    "SUI",
    1.84,
    .02
  ],
  [
    "SEIUSDT",
    "SEI",
    .412,
    .022
  ],
  [
    "TIAUSDT",
    "TIA",
    6.05,
    .019
  ],
  [
    "INJUSDT",
    "INJ",
    23.4,
    .018
  ],
  [
    "FETUSDT",
    "FET",
    1.52,
    .021
  ],
  [
    "RENDERUSDT",
    "RENDER",
    7.88,
    .017
  ],
  [
    "OPUSDT",
    "OP",
    1.74,
    .018
  ],
  [
    "ARBUSDT",
    "ARB",
    .812,
    .019
  ],
  [
    "PEPEUSDT",
    "PEPE",
    98e-7,
    .028
  ],
  [
    "SHIBUSDT",
    "SHIB",
    174e-7,
    .024
  ],
  [
    "LTCUSDT",
    "LTC",
    84.2,
    .012
  ],
  [
    "BCHUSDT",
    "BCH",
    428,
    .013
  ],
  [
    "ETCUSDT",
    "ETC",
    24.6,
    .016
  ],
  [
    "FILUSDT",
    "FIL",
    4.18,
    .018
  ],
  [
    "UNIUSDT",
    "UNI",
    8.64,
    .016
  ],
  [
    "AAVEUSDT",
    "AAVE",
    148.2,
    .015
  ],
  [
    "TAOUSDT",
    "TAO",
    320,
    .02
  ],
  [
    "CRVUSDT",
    "CRV",
    .392,
    .02
  ],
  [
    "LDOUSDT",
    "LDO",
    1.64,
    .019
  ],
  [
    "GRTUSDT",
    "GRT",
    .184,
    .018
  ],
  [
    "SANDUSDT",
    "SAND",
    .312,
    .021
  ],
  [
    "MANAUSDT",
    "MANA",
    .338,
    .02
  ],
  [
    "AXSUSDT",
    "AXS",
    5.72,
    .018
  ],
  [
    "IMXUSDT",
    "IMX",
    1.46,
    .019
  ],
  [
    "STXUSDT",
    "STX",
    1.72,
    .017
  ],
  [
    "RUNEUSDT",
    "RUNE",
    5.08,
    .018
  ],
  [
    "ENAUSDT",
    "ENA",
    0.62,
    .022
  ],
  [
    "ALGOUSDT",
    "ALGO",
    .148,
    .019
  ],
  [
    "XLMUSDT",
    "XLM",
    .108,
    .016
  ],
  [
    "TRXUSDT",
    "TRX",
    .152,
    .012
  ],
  [
    "HBARUSDT",
    "HBAR",
    0.182,
    .018
  ],
  [
    "WLDUSDT",
    "WLD",
    2.18,
    .021
  ],
  [
    "JUPUSDT",
    "JUP",
    .842,
    .022
  ],
  [
    "PYTHUSDT",
    "PYTH",
    .368,
    .02
  ],
  [
    "ONDOUSDT",
    "ONDO",
    .912,
    .019
  ],
  [
    "WIFUSDT",
    "WIF",
    2.24,
    .026
  ],
  ["TONUSDT", "TON", 5.42, .018],
  ["ICPUSDT", "ICP", 8.15, .019],
  ["POLUSDT", "POL", 0.42, .02],
  ["GALAUSDT", "GALA", 0.028, .024],
  ["ORDIUSDT", "ORDI", 38.4, .022],
  ["BONKUSDT", "BONK", 2.1e-5, .028],
  ["FLOKIUSDT", "FLOKI", 1.4e-4, .026],
  ["APEUSDT", "APE", 1.22, .021],
  ["DYDXUSDT", "DYDX", 1.18, .02],
  ["PENDLEUSDT", "PENDLE", 4.62, .019],
  ["JTOUSDT", "JTO", 2.48, .021],
  ["ETHFIUSDT", "ETHFI", 1.86, .022],
  ["EIGENUSDT", "EIGEN", 3.12, .02],
  ["OMUSDT", "OM", 1.54, .023],
  ["NEOUSDT", "NEO", 14.8, .016],
  ["VETUSDT", "VET", 0.038, .018],
  ["EOSUSDT", "EOS", 0.62, .017],
  ["ZECUSDT", "ZEC", 42.5, .018],
  ["MASKUSDT", "MASK", 2.84, .021],
  ["GMXUSDT", "GMX", 28.6, .019],
  ["ARUSDT", "AR", 18.4, .018],
  ["STRKUSDT", "STRK", 0.52, .022],
  ["NOTUSDT", "NOT", 0.0074, .026],
  ["BOMEUSDT", "BOME", 0.0088, .027],
  ["PEOPLEUSDT", "PEOPLE", 0.052, .024],
  ["ENSUSDT", "ENS", 18.6, .017],
  ["MKRUSDT", "MKR", 1680, .015],
  ["COMPUSDT", "COMP", 52.4, .018],
  ["SNXUSDT", "SNX", 1.72, .02],
  ["TRUMPUSDT", "TRUMP", 8.4, .028],
  ["PENGUUSDT", "PENGU", 0.032, .03],
  ["VIRTUALUSDT", "VIRTUAL", 1.85, .028],
  ["NEIROUSDT", "NEIRO", 0.0018, .032],
  ["POPCATUSDT", "POPCAT", 0.92, .029],
  ["MEWUSDT", "MEW", 0.0064, .03],
  ["TURBOUSDT", "TURBO", 0.0058, .031],
  ["GOATUSDT", "GOAT", 0.084, .03],
  ["PNUTUSDT", "PNUT", 0.22, .028],
  ["ACTUSDT", "ACT", 0.048, .027],
  ["MOVEUSDT", "MOVE", 0.42, .026],
  ["KAITOUSDT", "KAITO", 1.12, .025],
  ["SUSDT", "S", 0.52, .024],
  ["CAKEUSDT", "CAKE", 2.15, .02],
  ["SUSHIUSDT", "SUSHI", 0.92, .021],
  ["CHZUSDT", "CHZ", 0.068, .022],
  ["FLOWUSDT", "FLOW", 0.62, .02],
  ["KAVAUSDT", "KAVA", 0.41, .021],
  ["SSVUSDT", "SSV", 24.8, .022],
  ["MAGICUSDT", "MAGIC", 0.48, .024],
  ["KASUSDT", "KAS", 0.128, .023],
  ["MINAUSDT", "MINA", 0.52, .021],
  ["TRBUSDT", "TRB", 72.4, .026],
  ["ZKUSDT", "ZK", 0.148, .025],
  ["WUSDT", "W", 0.084, .026],
  ["CFXUSDT", "CFX", 0.162, .022],
  ["JASMYUSDT", "JASMY", 0.018, .024],
  ["GMTUSDT", "GMT", 0.148, .023],
  ["YGGUSDT", "YGG", 0.52, .024],
  ["ILVUSDT", "ILV", 38.6, .021],
  ["SUPERUSDT", "SUPER", 0.92, .023],
  ["BLURUSDT", "BLUR", 0.24, .024],
  ["MEMEUSDT", "MEME", 0.012, .028],
  ["AEVOUSDT", "AEVO", 0.42, .025],
  ["MANTAUSDT", "MANTA", 0.82, .024],
  ["ALTUSDT", "ALT", 0.092, .026],
  ["BIGTIMEUSDT", "BIGTIME", 0.084, .025],
  ["RSRUSDT", "RSR", 0.0068, .023],
  ["IOTAUSDT", "IOTA", 0.18, .02],
  ["THETAUSDT", "THETA", 1.42, .019],
  ["ZILUSDT", "ZIL", 0.018, .021],
].map((row) => {
  const [id, base, start, vol] = row as [string, string, number, number];
  return { id, base, quote: "USDT", start, vol };
});
export function clampSymbolCount(n: number): number {
  return Math.min(VST_MAX_SYMBOLS, Math.max(8, Math.round(n)));
}
export function clampLiveSymbolCap(n: number, evalN = VST_MAX_SYMBOLS): number {
  const cap = Number.isFinite(n) ? Math.round(n) : VST_LIVE_SYMBOLS;
  return Math.min(clampSymbolCount(evalN), Math.max(8, cap || VST_LIVE_SYMBOLS));
}
export function universeSymbols(count = VST_MAX_SYMBOLS): VstSymbol[] {
  return VST_SYMBOLS.slice(0, clampSymbolCount(count));
}

/** Pull extra BingX USDT-M contracts into the eval universe (live cap stays separate). */
export function absorbEvalSymbols(
  extra: { id: string; base?: string; start?: number; vol?: number }[],
  max = VST_MAX_SYMBOLS,
): number {
  const have = new Set(VST_SYMBOLS.map((s) => s.id));
  let n = 0;
  const limit = clampSymbolCount(max);
  for (const s of extra) {
    const id = String(s?.id || "").trim().toUpperCase();
    if (!id || have.has(id)) continue;
    if (VST_SYMBOLS.length >= limit) break;
    const base = String(s.base || id.replace(/USDT$/i, "") || id);
    VST_SYMBOLS.push({
      id,
      base,
      quote: "USDT",
      start: Number(s.start) > 0 ? Number(s.start) : 1,
      vol: Number(s.vol) > 0 ? Number(s.vol) : 0.02,
    });
    have.add(id);
    n += 1;
  }
  return n;
}

export function ensureQuotes(e: VstEngine): number {
  let n = 0;
  for (const s of universeSymbols(e.symbolCount || VST_MAX_SYMBOLS)) {
    if (e.quotes[s.id]) continue;
    const px = s.start > 0 ? s.start : 1;
    e.quotes[s.id] = {
      id: s.id,
      base: s.base,
      px,
      hi: px,
      lo: px,
      atr: px * Math.max(0.004, s.vol) * 1.6,
      vol: s.vol,
      axis: px,
      chg: 0,
      vol1h: s.vol,
    };
    n += 1;
  }
  return n;
}

export function vol1hOf(q?: VstQuote): number {
  if (!q || !(q.px > 0)) return 0;
  if (Number(q.vol1h) > 0) return Number(q.vol1h);
  const span = Math.max(0, (q.hi || 0) - (q.lo || 0));
  return span / q.px;
}

function symbolScore(e: VstEngine, id: string): number {
  const q = e.quotes[id];
  const closed = e.closed.filter((c) => c.symbol === id).slice(0, 12);
  let pf = 1;
  if (closed.length) {
    const profit = closed.filter((c) => c.pnl > 0).reduce((s, c) => s + c.pnl, 0);
    const loss = Math.abs(closed.filter((c) => c.pnl < 0).reduce((s, c) => s + c.pnl, 0));
    pf = profitFactor(profit, loss);
  }
  const net = closed.reduce((s, c) => s + c.pnl, 0);
  const vol = finiteOr(q?.vol, 0);
  const chg = Math.abs(q?.chg ?? 0);
  const majors = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT"];
  const mi = majors.indexOf(id);
  return pf * 28 + (net > 0 ? 14 : net < 0 ? -8 : 0) + vol * 50 + chg * 40 + (mi >= 0 ? (8 - mi) * 6 : 0);
}

export function rankUniverse(e: VstEngine): VstSymbol[] {
  const perf = internAllPhase(e) ? new Set<string>() : new Set(e.performingSymbols ?? []);
  const after = Boolean(e.preEvalDone && !internAllPhase(e));
  const pfOf = (id: string) => {
    const t = e.symbolStats?.[id];
    if (!t || (t.trades ?? 0) < 2) return -1;
    return profitFactor(t.profit, t.loss);
  };
  return [...universeSymbols(e.symbolCount)].sort((a, b) => {
    if (after) {
      const pa = pfOf(a.id);
      const pb = pfOf(b.id);
      if ((pa >= 0 || pb >= 0) && Math.abs(pb - pa) > 0.02) return pb - pa;
    }
    if (perf.size) {
      const pa = perf.has(a.id) ? 1 : 0;
      const pb = perf.has(b.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
    }
    const dv = vol1hOf(e.quotes[b.id]) - vol1hOf(e.quotes[a.id]);
    if (Math.abs(dv) > 1e-8) return dv;
    return symbolScore(e, b.id) - symbolScore(e, a.id);
  });
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand(tick: number, salt: string): number {
  return hash(`${tick}:${salt}`) % 1e4 / 1e4;
}
function slDist(atr: number, spacing: number, slAtr: number, raw = false, px = 0): number {
  const mul = raw ? Math.max(0.05, Number(slAtr) || 0.05) : snapSlAtr(slAtr);
  const want = Math.max(atr * mul, 1e-12);
  return want; // The initial-stop floor applies after the requested TP is derived.
}
function tpDistFromSl(sl: number, ratio = TP_SL_RATIO, raw = false): number {
  return sl * (raw ? Math.max(0.3, Number(ratio) || 1) : snapTpRatio(ratio));
}
function clampPx(n: number, floor: number): number {
  if (!Number.isFinite(n)) return floor;
  return Math.max(n, floor * .25);
}
function protectLevels(entry: number, side: Side, sl0: number, tp0: number, _ratio = TP_SL_RATIO, _raw = false,
  cost = POSITION_RT_COST_PCT, minSlDistancePct = DEFAULT_MIN_SL_DISTANCE_PCT) {
  return initialProtection(side, entry, sl0, tp0, cost, minSlDistancePct);
}

function axisLadders(q: VstQuote, cfg: TacticConfig): { rangeType: RangeType; spacing: number; levels: number[] }[] {
  const n = Math.max(2, cfg.axisLevels);
  const atr = Math.max(q.atr, q.px * 0.0025, 1e-9);
  const atrStep = atr * Math.max(0.55, cfg.axisSpacing);
  const lin = q.px * (cfg.axisSpacing / 100) * 1.8 + atr * 0.35;
  const geoBase = Math.max(atr * 0.55, q.px * 0.0022);
  const vol = Math.max(atr * (1.15 - Math.min(q.vol * 8, 0.45)), atr * 0.7);
  const fibSwing = Math.max(atr * 1.15, q.px * 0.0038);
  const fibRatios = [0.5, 0.618, 0.786, 1, 1.272];
  const seq = (step: (i: number) => number) => {
    const levels: number[] = [];
    for (let i = 1; i <= n; i++) levels.push(Math.max(step(i), atr * 0.35));
    return levels;
  };
  return [
    { rangeType: "linear", spacing: lin, levels: seq((i) => lin * i) },
    { rangeType: "geometric", spacing: geoBase * 1.618, levels: seq((i) => geoBase * Math.pow(1.618, i - 1)) },
    { rangeType: "atr", spacing: atrStep, levels: seq((i) => atrStep * i) },
    { rangeType: "volume", spacing: vol, levels: seq((i) => vol * i) },
    {
      rangeType: "fibonacci",
      spacing: fibSwing * 0.618,
      levels: seq((i) => fibSwing * fibRatios[Math.min(i - 1, fibRatios.length - 1)]!),
    },
  ];
}

/** CTS-G style: each axis coordination is its own set. A paused one does not block the others. */
const AXIS_PHASES = ["ax-prev", "ax-last", "ax-cont", "ax-pause"] as const;
type AxisPhase = (typeof AXIS_PHASES)[number];

function axisPhaseSpace(phase: AxisPhase): number {
  if (phase === "ax-prev") return 1.15;
  if (phase === "ax-cont") return 0.8;
  if (phase === "ax-pause") return 0.7;
  return 1;
}

function axisPhasesOpen(e: VstEngine, q: VstQuote, side: Side): AxisPhase[] {
  const axis = q.axis > 0 ? q.axis : q.px;
  const atr = Math.max(q.atr, q.px * 0.0025, 1e-9);
  const out: AxisPhase[] = [];
  const prevExtreme = side === "long" ? q.lo : q.hi;
  const prevStretch = side === "long" ? axis - prevExtreme : prevExtreme - axis;
  if (prevStretch >= atr * 0.2) out.push("ax-prev");
  const recent: { pnl: number }[] = [];
  for (const c of e.closed) {
    if (c.symbol !== q.id || c.side !== side || c.playbook !== "axis") continue;
    recent.push(c);
    if (recent.length >= 3) break;
  }
  if (recent.length < 3 || recent.some((c) => c.pnl > 0)) out.push("ax-last");
  const fade = side === "long" ? q.px <= axis : q.px >= axis;
  const disp = Math.abs(q.px - axis) / atr;
  if (fade && disp >= 0.15 && disp <= 3.4) out.push("ax-cont");
  let paused = false;
  for (let i = 0; i < e.closed.length && i < 40; i++) {
    const c = e.closed[i]!;
    if (c.symbol === q.id && c.side === side && c.calc === "ax-pause" && c.pnl < 0 && e.tick - (c.tick || 0) < 8) {
      paused = true;
      break;
    }
  }
  if (!paused) out.push("ax-pause");
  return out;
}

function highestRange(q: VstQuote, cfg: TacticConfig) {
  return axisLadders(q, cfg).reduce((a, b) => b.spacing > a.spacing ? b : a);
}
function pickRange(q: VstQuote, cfg: TacticConfig, rangeType?: RangeType) {
  const ladders = axisLadders(q, cfg);
  if (rangeType) return ladders.find((l) => l.rangeType === rangeType) ?? highestRange(q, cfg);
  return highestRange(q, cfg);
}

/** Tight / middle / wide spacing. Five ladders, sorted once per symbol. */
export function rangeBands(q: VstQuote, cfg: TacticConfig): { low: RangeType; mid: RangeType; high: RangeType } {
  const rows = axisLadders(q, cfg).slice().sort((a, b) => a.spacing - b.spacing);
  const low = rows[0]?.rangeType ?? "geometric";
  const high = rows[rows.length - 1]?.rangeType ?? "volume";
  const mid = rows[Math.floor(rows.length / 2)]?.rangeType ?? "atr";
  return { low, mid, high };
}
function direction(q: VstQuote): Side {
  const ind = symbolIndications(q.id);
  if (ind.hits > 0 && ind.agree && Math.abs(ind.direction) >= 0.18) {
    return ind.direction > 0 ? "long" : "short";
  }
  if (ind.hits > 0 && Math.abs(ind.trend) >= 0.32 && Math.sign(ind.trend) === Math.sign(ind.direction || ind.trend)) {
    return ind.trend > 0 ? "long" : "short";
  }
  return q.px >= q.axis ? "short" : "long";
}
/** Axis trades the pullback with the lagging mean, not the fade. Price above the axis is a long dip. */
function axisEntrySide(q: VstQuote): Side {
  return q.px >= (q.axis || q.px) ? "long" : "short";
}
function cooldownKey(connId: string, symbol: string) {
  return `${connId}:${symbol}`;
}
function mkQuotes(): Record<string, VstQuote> {
  const out: Record<string, VstQuote> = {};
  for (const s of VST_SYMBOLS) {
    const jitter = (hash(s.id) % 400 - 200) / 1e4;
    const px = s.start * (1 + jitter);
    const atr = px * s.vol * 1.6;
    out[s.id] = {
      id: s.id,
      base: s.base,
      px,
      hi: px,
      lo: px,
      atr,
      vol: s.vol,
      axis: px * (1 - jitter * .4),
      chg: jitter,
      vol1h: s.vol,
    };
  }
  return out;
}
export function vstConnections(): Connection[] {
  return mkConns();
}
function mkConns(): Connection[] {
  const ids = VST_SYMBOLS.map((s) => s.id);
  const types: OrderTypeId[] = [
    "market",
    "limit",
    "stop",
    "stop_limit",
    "trailing_stop",
    "ioc",
    "fok",
  ];
  return [{
    id: "bingx-vst-01",
    venue: "bingx",
    label: "BingX VST-01",
    testnet: true,
    network: "paper",
    armed: false,
    hasKeys: false,
    status: "disconnected",
    apiKeyMasked: "—",
    permissions: ["read", "trade"],
    symbols: [...ids],
    orderTypesEnabled: types,
    rateLimitUsed: 0,
    rateLimitMax: VST_RATE_WINDOW,
    openOrderCount: 0,
    positionCount: 0,
    maxPositions: VST_MAX_POSITIONS,
    maxSymbols: VST_MAX_SYMBOLS,
    unlimitedOrders: true,
    lastPingMs: 0
  }, {
    id: "bingx-vst-02",
    venue: "bingx",
    label: "BingX VST-02",
    testnet: true,
    network: "testnet",
    armed: false,
    hasKeys: false,
    status: "disconnected",
    apiKeyMasked: "—",
    permissions: ["read", "trade"],
    symbols: [...ids],
    orderTypesEnabled: types,
    rateLimitUsed: 0,
    rateLimitMax: 100,
    openOrderCount: 0,
    positionCount: 0,
    maxPositions: 100,
    maxSymbols: 50,
    unlimitedOrders: true,
    lastPingMs: 0
  }, {
    id: "bingx-x01",
    venue: "bingx",
    label: "BingX Live-01",
    testnet: false,
    network: "mainnet",
    armed: false,
    hasKeys: false,
    status: "disconnected",
    apiKeyMasked: "—",
    permissions: ["read", "trade"],
    symbols: [...ids],
    orderTypesEnabled: types,
    rateLimitUsed: 0,
    rateLimitMax: VST_RATE_WINDOW,
    openOrderCount: 0,
    positionCount: 0,
    maxPositions: LIVE_MAX_POSITIONS,
    maxSymbols: 50,
    unlimitedOrders: true,
    lastPingMs: 0
  }];
}
function emptyStats() {
  return {
    pf: 0,
    wr: 0,
    net: 0,
    mdd: 0,
    trades: 0,
    wins: 0,
    openOrders: 0,
    queued: 0,
    positions: 0,
    partials: 0,
    equity: 1e4,
    ddt: 0,
  };
}
function emptyLedger(): VstLedger {
  return {
    trades: 0,
    wins: 0,
    profit: 0,
    loss: 0,
    slExits: 0,
    tpExits: 0,
    timeExits: 0,
    peak: 1e4,
    maxMdd: 0,
    capRejects: 0,
    rateSkips: 0,
    maxPositions: 0,
    maxOrders: 0,
    winStreak: 0,
    lossStreak: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    ordersPlaced: 0,
    ordersFilled: 0,
    ordersCancelled: 0,
    ordersRejected: 0,
    ddTicks: 0,
    maxDdt: 0,
    ratioProfit: 0,
    ratioLoss: 0,
    ratioWins: 0,
  };
}

export function ensureEngine(e: VstEngine): VstEngine {
  e.lastTactic = e.lastTactic ?? "hybrid";
  e.lastRange = e.lastRange ?? "atr";
  e.lastBlockAt = e.lastBlockAt ?? 0;
  if (!e.ledger) e.ledger = emptyLedger();
  e.ledger.ddTicks = e.ledger.ddTicks ?? 0;
  e.ledger.maxDdt = e.ledger.maxDdt ?? 0;
  if (!e.stats) e.stats = emptyStats();
  e.stats.ddt = e.stats.ddt ?? 0;
  e.startEquity = Number(e.startEquity) > 0 ? Number(e.startEquity) : 1e4;
  e.closed = e.closed ?? [];
  e.fills = e.fills ?? [];
  e.orders = e.orders ?? [];
  e.queue = e.queue ?? [];
  e.positions = e.positions ?? [];
  e.symbolStats = e.symbolStats ?? {};
  e.tokens = e.tokens ?? {};
  e.cooldown = e.cooldown ?? {};
  e.blockLanes = e.blockLanes ?? {};
  e.blockWindows = e.blockWindows ?? {};
  e.blockWindowsBySymbol = e.blockWindowsBySymbol ?? {};
  e.blockWindowsBySide = e.blockWindowsBySide ?? {};
  e.blockWindowsByIndication = e.blockWindowsByIndication ?? {};
  e.blockWindowsByType = e.blockWindowsByType ?? {};
  e.blockWindowsByIndicationType = e.blockWindowsByIndicationType ?? {};
  e.blockRelWindows = e.blockRelWindows ?? {};
  e.blockRelBest = e.blockRelBest ?? {};
  e.lastRelEvalTick = e.lastRelEvalTick ?? 0;
  e.relVolumeFactor = e.relVolumeFactor ?? 0;
  e.intervalVolScale = e.intervalVolScale ?? 1;
  e.intervalPf = e.intervalPf ?? 0;
  e.liveDisabled = e.liveDisabled ?? {};
  e.manualClosed = e.manualClosed ?? {};
  e.liveHealth = e.liveHealth ?? { n: 12, at: 0, disabled: [], kept: [] };
  e.symbolEval = e.symbolEval ?? {};
  e.performingSymbols = e.performingSymbols ?? [];
  e.hourCoord = e.hourCoord ?? { hour: 0, performing: [], skipped: [], at: 0 };
  e.minPf = e.minPf ?? DEFAULT_THRESHOLDS.minPf;
  e.basePf = e.basePf ?? DEFAULT_THRESHOLDS.basePf;
  e.axisPf = e.axisPf ?? DEFAULT_THRESHOLDS.axisPf;
  e.blockPf = e.blockPf ?? DEFAULT_THRESHOLDS.blockPf;
  e.shortPf = e.shortPf ?? DEFAULT_THRESHOLDS.shortPf;
  e.shortBasePf = e.shortBasePf ?? DEFAULT_THRESHOLDS.shortBasePf;
  e.shortAxisPf = e.shortAxisPf ?? DEFAULT_THRESHOLDS.shortAxisPf;
  e.shortBlockPf = e.shortBlockPf ?? DEFAULT_THRESHOLDS.shortBlockPf;
  e.shortRange = e.shortRange ?? false;
  e.shortProgress = sanitizeShortProgress(e.shortProgress);
  e.intervalStrategy = sanitizeIntervalStrategy(e.intervalStrategy);
  e.lastNProgress = sanitizeLastNProgress(e.lastNProgress);
  e.completeSim = e.completeSim ?? false;
  e.shortComboOnly = e.shortComboOnly ?? false;
  e.shortComboTape = e.shortComboTape ?? {};
  e.shortComboPreTape = e.shortComboPreTape ?? {};
  e.shortComboLiveTape = e.shortComboLiveTape ?? {};
  e.shortRelTape = e.shortRelTape ?? {};
  e.shortRelPreTape = e.shortRelPreTape ?? {};
  e.validRelKeys = e.validRelKeys ?? {};
  if (e.blockCfg) {
    e.blockCfg.volumeRatio = clampBlockVol(e.blockCfg.volumeRatio);
    e.blockCfg.overallVolumeRatio = clampOverallVol(e.blockCfg.overallVolumeRatio ?? DEFAULT_OVERALL_BLOCK_VOLUME_RATIO);
    e.blockCfg.sharedVolumeRatio = clampSharedVol(e.blockCfg.sharedVolumeRatio ?? DEFAULT_SHARED_BLOCK_VOLUME_RATIO);
    e.blockCfg.relVolumeRatio = clampBlockVol(e.blockCfg.relVolumeRatio ?? e.blockCfg.volumeRatio);
    e.blockCfg.maxVolumeMultiplier = clampMaxVolumeMul(e.blockCfg.maxVolumeMultiplier ?? DEFAULT_MAX_VOLUME_MULTIPLIER);
    if (e.blockCfg.overallMode !== "additive" && e.blockCfg.overallMode !== "parallel") e.blockCfg.overallMode = "shared";
    if (e.blockCfg.overallSymbol !== false) e.blockCfg.overallSymbol = true;
    if (e.blockCfg.overallDirection !== false) e.blockCfg.overallDirection = true;
    if (e.blockCfg.overallIndication !== false) e.blockCfg.overallIndication = true;
    if (e.blockCfg.overallType !== false) e.blockCfg.overallType = true;
    if (e.blockCfg.overallSharedStack !== "split") e.blockCfg.overallSharedStack = "additive";
    e.blockCfg.counts = sanitizeBlockCounts(e.blockCfg.counts);
  }
  e.liveTape = e.liveTape ?? false;
  for (const lane of Object.values(e.blockLanes)) {
    lane.active = lane.active ?? true;
    lane.pauseRemaining = lane.pauseRemaining ?? {};
    lane.heldFactor = lane.heldFactor ?? {};
    lane.baseEntry = lane.baseEntry ?? 0;
    lane.satisfied = lane.satisfied ?? {};
    lane.pfRing = lane.pfRing ?? {};
    lane.parentPf = lane.parentPf ?? [];
  }
  return e;
}

/** Unknown venue commissions are estimates, with no second slippage charge. */
export function actualPositionFeeEstimate(e: VstEngine, symbol: string, entry: number, exit: number, qty: number): number {
  const rates = resolveFeePolicy(e.fees ?? {}, e.feeSnapshots?.[symbol], {
    exchange: "bingx", account: e.activeConnId, symbol, now: e.feeAsOfMs ?? Date.now(),
  });
  return actualFillFee(qty, entry, rates).fee + actualFillFee(qty, exit, rates).fee;
}

/** Snapshot a symbol's account rate at modeled admission. Unmeasured rates stay estimates. */
export function modeledPositionCost(e: VstEngine, symbol: string): number {
  const rates = resolveFeePolicy(e.fees ?? {}, e.feeSnapshots?.[symbol], {
    exchange: "bingx", account: e.activeConnId, symbol, now: e.feeAsOfMs ?? Date.now(),
  });
  return roundTripFeeRate(rates);
}

export function initVstEngine(cfg: TacticConfig = DEFAULT_CFG, opts: { warmup?: number; symbolCount?: number; liveSymbolCap?: number; orderType?: OrderTypeId; arm?: boolean; block?: BlockConfig; equity?: number; costStep?: number; complete?: boolean; comboOnly?: boolean } = {}): VstEngine {
  resetIndicationHistory();
  const use = cfgUsesShortRange(cfg) ? snapShortTacticConfig(cfg) : cfg;
  const startEq = Number(opts.equity) > 0 ? Number(opts.equity) : 1e4;
  const costStep = Number.isFinite(Number(opts.costStep)) ? Math.min(30, Math.max(3, Number(opts.costStep))) : 10;
  const stats = emptyStats();
  stats.equity = startEq;
  const ledger = emptyLedger();
  ledger.peak = startEq;
  const engine: VstEngine = {
    minSlDistancePct: normalizeMinSlDistancePct(cfg.minSlDistancePct),
    microMinSlDistancePct: cfg.microMinSlDistancePct, microMinTrailDistancePct: cfg.microMinTrailDistancePct,
    indicationSourceIds: indicationSourceIds(cfg.indicationSourceIds),
    fees: feePolicy(cfg.fees),
    stepPf: { ...DEFAULT_STEP_PF, ...cfg.stepPf },
    quotes: mkQuotes(),
    queue: [],
    orders: [],
    positions: [],
    fills: [],
    closed: [],
    batches: [],
    tick: 0,
    running: true,
    phase: "running",
    lastMsg: `VST x02 armed · TP/SL ${snapTpRatio(use.tpRatio)}R`,
    seq: 1,
    tokens: {
      "bingx-vst-01": VST_RATE_BURST,
      "bingx-vst-02": VST_RATE_BURST,
      "bingx-x01": VST_RATE_BURST,
    },
    stats,
    ledger,
    sim: null,
    cooldown: {},
    symbolCount: clampSymbolCount(opts.symbolCount ?? VST_MAX_SYMBOLS),
    liveSymbolCap: opts.liveSymbolCap != null ? clampLiveSymbolCap(opts.liveSymbolCap, opts.symbolCount ?? VST_MAX_SYMBOLS) : undefined,
    orderType: opts.orderType ?? "limit",
    symbolStats: {},
    activeConnId: VST_DEFAULT_CONN,
    healCount: 0,
    lastHeal: "",
    tpRatio: snapTpRatio(use.tpRatio ?? TP_SL_RATIO),
    costStep,
    startEquity: startEq,
    lastTactic: "hybrid",
    lastRange: "fibonacci",
    lastBlockAt: 0,
    blockLanes: {},
    blockWindows: {},
    blockWindowsBySymbol: {},
    blockWindowsBySide: {},
    blockWindowsByIndication: {},
    blockWindowsByType: {},
    blockWindowsByIndicationType: {},
    blockRelWindows: {},
    blockRelBest: {},
    lastRelEvalTick: 0,
    relVolumeFactor: 0,
    intervalVolScale: 1,
    losingHour: {
      red: false,
      net: 0,
      pf: 0,
      n: 0,
      greenPlays: [...DEFAULT_LOSING_HOUR_PLAYS],
      greenInds: [...DEFAULT_LOSING_HOUR_INDS],
      stayPlays: {},
      stayInds: {},
      at: 0,
    },
    intervalPf: 0,
    liveDisabled: {},
    liveHealth: { n: 12, at: 0, disabled: [], kept: [] },
    indRangeBest: {},
    indTacticBest: {},
    blockCfg: opts.block ?? DEFAULT_BLOCK_CONFIG,
    symbolEval: {},
    performingSymbols: [],
    hourCoord: { hour: 0, performing: [], skipped: [], at: 0 },
    minPf: DEFAULT_THRESHOLDS.minPf,
    basePf: DEFAULT_THRESHOLDS.basePf,
    axisPf: DEFAULT_THRESHOLDS.axisPf,
    blockPf: DEFAULT_THRESHOLDS.blockPf,
    shortPf: DEFAULT_THRESHOLDS.shortPf,
    shortBasePf: DEFAULT_THRESHOLDS.shortBasePf,
    shortRange: Boolean(use.shortRange),
    microRange: Boolean(use.microRange),
    shortProgress: sanitizeShortProgress(undefined),
    intervalStrategy: sanitizeIntervalStrategy(undefined),
    lastNProgress: sanitizeLastNProgress(opts.block?.lastNProgress),
    progressEval: undefined,
    lastNCoord: undefined,
    completeSim: Boolean(opts.complete),
    shortComboOnly: Boolean(opts.comboOnly),
    shortComboTape: {},
    shortComboPreTape: {},
    shortComboLiveTape: {},
    shortRelTape: {},
    shortRelPreTape: {},
    validRelKeys: {},
    validRelShare: 0,
    liveTape: false,
    strategyToggles: { ...DEFAULT_STRATEGY_TOGGLES },
  };
  if (opts.arm !== false) armUniverse(engine, use, "hybrid");
  const warm = opts.arm === false ? 0 : (opts.warmup ?? 12);
  for (let i = 0; i < warm; i++) tickVst(engine, use, "hybrid");
  engine.lastMsg = opts.arm === false
    ? `Idle book · ${engine.symbolCount} symbols · waiting live tape`
    : `Warm book · ${engine.symbolCount} symbols · two BingX VST sessions`;
  return ensureEngine(engine);
}
function nextId(e: VstEngine, pfx: string): string {
  e.seq += 1;
  return `${pfx}${e.tick}-${e.seq}`;
}
function isBotPlay(play?: string): boolean {
  return String(play || "").startsWith("bot:");
}
function occupiedSymbols(e: VstEngine, connId?: string): Set<string> {
  const s = new Set<string>();
  const on = (id: string) => (connId ? id === connId : isDeskConn(id));
  for (const p of e.positions) if (on(p.connId) && !isBotPlay(p.playbook)) s.add(p.symbol);
  for (const o of e.orders) if (on(o.connId) && !isBotPlay(o.playbook) && (o.status === "open" || o.status === "partial")) s.add(o.symbol);
  for (const o of e.queue) if (on(o.connId) && !isBotPlay(o.playbook)) s.add(o.symbol);
  return s;
}
function laneBusyKey(row: { strategyId?: string; symbol: string; side: string; indication?: string; playbook?: string; kind?: string; tpAtr?: number; slOfTp?: number; microRange?: boolean; minimalRange?: boolean; shortRange?: boolean; calc?: string; controllingRange?: string; rangeType?: string; priceStopPct?: number; priceTrailPct?: number; maxHoldTicks?: number; modelRtCost?: number; minSlDistancePct?: number; microMinSlDistancePct?: number; microMinTrailDistancePct?: number } & TrailingPolicyIdentity): string {
  const combo = row.priceStopPct != null || (row.tpAtr != null && row.slOfTp != null) ? exactProtectionCombo(row) : "x";
  const range = row.controllingRange || row.rangeType || "";
  return `${row.symbol}:${row.side}:${row.indication || ""}:${row.tactic || ""}:${row.playbook || ""}:${row.kind || ""}:${combo}:${row.calc || "base"}:${range}:${protectionPolicyKey(row)}${row.strategyId ? `:source-strategy=${row.strategyId}` : ""}`;
}
/** Pair coordination groups indications, but never different configuration parents. */
function pairCoordinationKey(row: ConfigIdentity & { symbol: string; side: Side }): string {
  return JSON.stringify([row.connId ?? "", row.symbol, row.side, row.tactic, row.rangeType, row.playbook, row.kind,
    row.calc ?? "base", exactProtectionCombo(row), row.trailPct, row.modelRtCost, row.minSlDistancePct,
    ...(row.microRange ? [row.microMinSlDistancePct, row.microMinTrailDistancePct] : []),
    ...(row.strategyId ? ["source-strategy", row.strategyId] : [])]);
}
function occupiedLegs(e: VstEngine, connId?: string): Set<string> {
  const s = new Set<string>();
  const on = (id: string) => (connId ? id === connId : isDeskConn(id));
  const mark = (row: Parameters<typeof laneBusyKey>[0] & { connId: string; playbook?: string }) => {
    if (!on(row.connId) || isBotPlay(row.playbook)) return;
    s.add(laneBusyKey(row));
  };
  for (const p of e.positions) mark(p);
  for (const o of e.orders) if (o.status === "open" || o.status === "partial") mark(o);
  for (const o of e.queue) mark(o);
  return s;
}
function isTerminal(status: LiveOrder['status']): boolean {
  return status === "filled" || status === "cancelled" || status === "rejected";
}
function countPlaced(e: VstEngine, n = 1) {
  e.ledger.ordersPlaced += n;
}
const orderSnaps = new WeakMap<VstEngine, { tick: number; placed: number; filled: number }[]>();
function noteOrderSnap(e: VstEngine) {
  let row = orderSnaps.get(e);
  if (!row) {
    row = [];
    orderSnaps.set(e, row);
  }
  const placed = e.ledger.ordersPlaced;
  const filled = e.ledger.ordersFilled;
  const last = row[row.length - 1];
  if (last && last.tick === e.tick) {
    last.placed = placed;
    last.filled = filled;
    return;
  }
  row.push({ tick: e.tick, placed, filled });
  if (row.length > 5000) row.splice(0, row.length - 5000);
}
function orderWindow(e: VstEngine, minutes: number): { placed: number; filled: number } {
  noteOrderSnap(e);
  const row = orderSnaps.get(e) ?? [];
  const from = e.tick - Math.max(1, minutes);
  let base = { tick: 0, placed: 0, filled: 0 };
  for (const s of row) {
    if (s.tick <= from) base = s;
    else break;
  }
  return {
    placed: Math.max(0, e.ledger.ordersPlaced - base.placed),
    filled: Math.max(0, e.ledger.ordersFilled - base.filled),
  };
}
let lanePass: VstEngine | null = null;
let laneMap: Map<string, LiveOrder[]> | null = null;
function beginLanePass(e: VstEngine) {
  lanePass = e;
  laneMap = null;
}
function endLanePass() {
  lanePass = null;
  laneMap = null;
}
function ensureLaneMap(e: VstEngine): Map<string, LiveOrder[]> | null {
  if (lanePass !== e) return null;
  if (laneMap) return laneMap;
  laneMap = new Map();
  for (const o of e.orders) {
    if (o.status !== "open" && o.status !== "partial" && o.status !== "queued") continue;
    const k = bookKey(o.connId, o.symbol, o.side);
    const list = laneMap.get(k);
    if (list) list.push(o);
    else laneMap.set(k, [o]);
  }
  return laneMap;
}
function markTerminal(e: VstEngine, o: LiveOrder, status: 'filled' | 'cancelled' | 'rejected') {
  if (isTerminal(o.status)) return;
  o.status = status;
  if (status === "filled") o.remaining = 0;
  else o.remaining = Math.max(0, o.qty - o.filled);
  if (status !== "filled" && o.remaining > 1e-12 && o.filled > 1e-12) {
    const pos = e.positions.find((p) => p.connId === o.connId && p.symbol === o.symbol && p.side === o.side && p.legs.some(l => l.orderId === o.id));
    if (pos && pos.legs.some((l) => l.orderId === o.id)) {
      pos.plannedQty = Math.max(pos.qty, (pos.plannedQty || 0) - o.remaining);
      const complete = splitBookLanes(e);
      const mapped = ensureLaneMap(e);
      const pool = mapped ? mapped.get(bookKey(o.connId, o.symbol, o.side)) ?? [] : e.orders;
      const working = pool.some(
        (x) =>
          x !== o &&
          (mapped || (x.connId === o.connId && x.symbol === o.symbol && x.side === o.side)) &&
          (x.status === "open" || x.status === "partial") &&
          x.remaining > 1e-12 &&
          sameProtectLane(pos, x, complete),
      );
      if (!working && pos.qty + 1e-12 >= pos.plannedQty * 0.98) pos.status = "open";
    }
  }
  if (status === "filled") e.ledger.ordersFilled += 1;
  else if (status === "cancelled") e.ledger.ordersCancelled += 1;
  else e.ledger.ordersRejected += 1;
}
function cancelQueued(e: VstEngine, drop: (o: LiveOrder) => boolean) {
  const keep = [];
  for (const o of e.queue) if (drop(o)) markTerminal(e, o, "cancelled");
  else keep.push(o);
  e.queue = keep;
}
export function bookCounts(e: VstEngine) {
  const keys = new Set<string>();
  const symbols = new Set<string>();
  let long = 0;
  let short = 0;
  for (const p of e.positions) {
    symbols.add(p.symbol);
    const k = `${p.symbol}:${p.side}`;
    if (keys.has(k)) continue;
    keys.add(k);
    if (p.side === "long") long += 1;
    else short += 1;
  }
  let open = 0;
  let partial = 0;
  for (const o of e.orders) if (o.status === "open") open += 1;
  else if (o.status === "partial") partial += 1;
  const queued = e.queue.length;
  const working = open + partial;
  return {
    positions: {
      slots: keys.size,
      long,
      short,
      symbols: symbols.size,
      longOnly: [...symbols].filter((id) => keys.has(`${id}:long`) && !keys.has(`${id}:short`)).length,
      shortOnly: [...symbols].filter((id) => keys.has(`${id}:short`) && !keys.has(`${id}:long`)).length,
      both: [...symbols].filter((id) => keys.has(`${id}:long`) && keys.has(`${id}:short`)).length,
      legs: e.positions.length,
      maxSlots: e.symbolCount * 2,
      maxLegs: VST_MAX_POSITIONS
    },
    orders: {
      queued,
      open,
      partial,
      filled: e.ledger.ordersFilled,
      cancelled: e.ledger.ordersCancelled,
      rejected: e.ledger.ordersRejected,
      working,
      internal: e.positions.length,
      live: queued + working + e.positions.length,
      placed: e.ledger.ordersPlaced
    }
  };
}
export function lastIntervalNet(e: VstEngine, minutes = intervalMinutesOf(e)): { net: number; n: number } {
  const s = lastIntervalStats(e, minutes);
  return { net: s.net, n: s.n };
}

/** After the exam, intern paper and hour-protect scratches must not move the 20m scale. */
function intervalTapeRow(e: VstEngine, c: { connId?: string; validExec?: boolean; protect?: boolean }): boolean {
  if (!isDeskConn(c.connId)) return false;
  if (c.protect) return false;
  if (e.completeSim && e.preEvalDone && c.validExec !== true) return false;
  return true;
}

export function lastIntervalStats(e: VstEngine, minutes = intervalMinutesOf(e)) {
  const minTick = e.tick - minutes;
  const rows: { pnl: number }[] = [];
  for (const c of e.closed) {
    if ((c.tick || 0) < minTick) continue;
    if (!intervalTapeRow(e, c)) continue;
    rows.push(c);
  }
  return laneLastNStats(rows);
}

export function currentIntervalNet(e: VstEngine, minutes = intervalMinutesOf(e)): { net: number; n: number } {
  const start = Math.floor(Math.max(0, e.tick) / minutes) * minutes;
  let net = 0;
  let n = 0;
  for (const c of e.closed) {
    if ((c.tick || 0) < start) continue;
    if (!intervalTapeRow(e, c)) continue;
    net += edgePnl(c);
    n += 1;
  }
  return { net, n };
}

/** Completed 20m buckets (newest first), excluding the in-progress window. */
export function intervalWindowHistory(
  e: VstEngine,
  minutes = intervalMinutesOf(e),
  count = intervalCfg(e).histWindows,
): { i: number; pf: number; net: number; n: number }[] {
  const cur = Math.floor(Math.max(0, e.tick) / minutes);
  const from = Math.max(0, cur - count);
  const buckets = new Map<number, { pnl: number }[]>();
  for (const c of e.closed) {
    if (!intervalTapeRow(e, c)) continue;
    const b = Math.floor(Math.max(0, c.tick || 0) / minutes);
    if (b < from || b >= cur) continue;
    const row = buckets.get(b);
    if (row) row.push(c);
    else buckets.set(b, [c]);
  }
  const out: { i: number; pf: number; net: number; n: number }[] = [];
  for (let i = cur - 1; i >= from; i--) {
    const rows = buckets.get(i);
    if (!rows?.length) continue;
    const st = laneLastNStats(rows);
    out.push({ i, pf: st.pf, net: st.net, n: st.n });
  }
  return out;
}

/**
 * Interval is an eval / volume-scale horizon — never a halt.
 * Overall tape scale: green windows lean in; red cuts *losing* lanes only.
 * Block / hour-winners keep size via blockIntervalScale / entryVolumeScale.
 */
export function intervalVolumeScale(e: VstEngine, minutes = intervalMinutesOf(e)): number {
  const iv = intervalCfg(e);
  if (!iv.enabled || !iv.scaleVol) return 1;
  if (e.tick < minutes) return 1;
  const s = lastIntervalStats(e, minutes);
  if (s.n < 2) return 1;
  const hist = intervalWindowHistory(e, minutes, iv.histWindows);
  const green = hist.filter((h) => h.n >= 1 && h.net >= 0 && h.pf >= 1).length;
  const red = hist.filter((h) => h.n >= 1 && h.net < 0).length;
  let scale = 1;
  if (s.pf >= iv.leanPf && s.net > 0) scale = Math.min(iv.maxScale, 1.15);
  else if (s.pf >= 1.2 && s.net >= 0) scale = Math.min(iv.maxScale, 1.05);
  else if (s.pf >= 1.05) scale = 1;
  else if (s.pf >= iv.cutPf) scale = Math.max(iv.minScale, 0.72);
  else scale = iv.minScale;
  if (green >= iv.stableGreen) scale = Math.min(iv.maxScale, scale + 0.08);
  if (red >= iv.redCut && green === 0) scale = Math.min(scale, Math.max(iv.minScale, 0.5));
  return Math.min(iv.maxScale, Math.max(iv.minScale, scale));
}

/** Kept for callers: entries always process. 20m only scales Block vol / evals. */
export function intervalAllowsEntry(_e: VstEngine, _minutes = INTERVAL_MINUTES): boolean {
  return true;
}

type StrategyProcessingContext = {
  indication?: string;
  rangeType?: RangeType;
  controllingRange?: RangeType;
  microRange?: boolean;
  minimalRange?: boolean;
  shortRange?: boolean;
};

export function pickLiveTactic(e: VstEngine, ind: IndicationId, fallback: TacticKind, context?: StrategyProcessingContext): TacticKind {
  const tog = context ? strategyProcessingFor(e, context) : e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
  const hinted = tacticForIndication(ind, { axis: tog.axis !== false, trailing: tog.trailing !== false });
  const preferred = e.indTacticBest?.[ind];
  const allow = (t: TacticKind | undefined): t is TacticKind => {
    if (!t) return false;
    if (t === "dca" && !tog.dca) return false;
    if (t === "axis" && tog.axis === false) return false;
    if (t === "trailing" && tog.trailing === false) return false;
    return t === "trailing" || t === "axis" || t === "hybrid" || t === "dca";
  };
  if (fallback === "axis" && allow("axis")) return "axis";
  if (allow(preferred)) return preferred;
  if (allow(hinted)) return hinted;
  if (allow(fallback)) return fallback;
  return tog.axis !== false ? "hybrid" : "trailing";
}

/** Every enabled tactic — no skip of trailing/axis/hybrid. DCA only if toggle on. A switch that is off stays off, including during the eval. */
export function enabledLiveTactics(e: VstEngine, context?: StrategyProcessingContext): TacticKind[] {
  const tog = strategyProcessingFor(e, context);
  const intern = internAllPhase(e);
  const out: TacticKind[] = [];
  if (tog.trailing !== false && (intern || tog.normal !== false || tog.block)) out.push("trailing");
  if (tog.axis !== false) out.push("axis");
  if (intern || tog.normal !== false || tog.block) out.push("hybrid");
  if (tog.dca) out.push("dca");
  return out;
}

export function strategyProcessingFor(e: VstEngine, rel?: StrategyProcessingContext) {
  const micro = rel?.microRange ?? e.microRange;
  const minimal = rel?.minimalRange ?? e.minimalRange;
  const short = rel?.shortRange ?? e.shortRange;
  const tier = micro ? "micro" : minimal ? "minimal" : short ? "short" : "normal";
  const lowRange = rel?.indication?.startsWith("low-range-");
  const geometry = rel?.rangeType ?? rel?.controllingRange ?? e.lastRange;
  return strategyTogglesForRange(e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES,
    lowRange ? "low-range" : tier, geometry, lowRange ? tier : undefined);
}

function trailingOverlayOn(e: VstEngine, rel: StrategyProcessingContext): boolean {
  return strategyProcessingFor(e, rel).trailing;
}

/** All catalog indications, winner and higher-quality first. Never drops a lane. */
function liveLaneScore(e: VstEngine, ind: string): number {
  const bag = liveIndTally.get(e);
  if (!bag) return 0;
  const recent: number[] = [];
  for (const [key, row] of Object.entries(bag)) {
    if (key !== ind && !key.startsWith(`${ind}|`)) continue;
    if (row.recent?.length) recent.push(...row.recent.slice(-8));
    if (recent.length >= 32) break;
  }
  const verdict = recentLanePays(recent);
  if (verdict == null) return 0;
  return verdict ? 60 : -80;
}

function allEngineIndications(e?:VstEngine):IndicationId[]{return [...new Set([...SHORT_PROGRESS_INDICATIONS,...(e?.indicationSourceIds??[])])];}

function liveTacticScore(e: VstEngine, tac: string): number {
  const bag = liveIndTally.get(e);
  if (!bag) return 0;
  const recent: number[] = [];
  for (const [key, row] of Object.entries(bag)) {
    if (!key.endsWith(`|${tac}`) || !row.recent?.length) continue;
    recent.push(...row.recent.slice(-12));
    if (recent.length >= 32) break;
  }
  const verdict = recentLanePays(recent);
  if (verdict == null) return 0;
  return verdict ? 40 : -40;
}

export function rankIndications(e: VstEngine, pack: Parameters<typeof indicationQuality>[1], winner: IndicationId): IndicationId[] {
  const picked = (e.shortProgress?.indications?.length ? e.shortProgress.indications : SHORT_PROGRESS_INDICATIONS) as IndicationId[];
  const catalog = [...new Set<IndicationId>([...COMMON_INDICATIONS, ...picked,...(e?.indicationSourceIds??[])])];
  const after = Boolean(e.preEvalDone && !internAllPhase(e));
  const score = (id: IndicationId) => {
    const q = indicationQuality(id, pack);
    const ev = e.progressEval?.indications?.[id];
    const mag = Math.abs(Number((pack as unknown as Record<string, number>)[id]) || 0);
    if (after) {
      const validated = Boolean(ev && ev.n >= 4 && ev.ok && ev.pf + 1e-9 >= GATED_MIN_PF && ev.net >= 0);
      return (validated ? 1000 + ev!.pf * 100 : 0) + q + mag + liveLaneScore(e, id);
    }
    return (id === winner ? 80 : 0) + q * 8 + (ev && ev.n >= 3 ? ev.pf * 4 : 0) + mag + liveLaneScore(e, id);
  };
  const skip = new Set(e.skipIndications ?? []);
  return catalog.filter((id) => !skip.has(id)).slice().sort((a, b) => score(b) - score(a));
}

/** All enabled tactics, best validated PF first after the base exam. */
export function rankTactics(e: VstEngine, preferred: TacticKind, context?: StrategyProcessingContext): TacticKind[] {
  const after = Boolean(e.preEvalDone && !internAllPhase(e));
  const score = (t: TacticKind) => {
    const ev = e.progressEval?.tactics?.[t];
    if (after) {
      const validated = Boolean(ev && ev.n >= 4 && ev.ok && ev.pf + 1e-9 >= GATED_MIN_PF && ev.net >= 0);
      return (validated ? 1000 + ev!.pf * 100 : 0) + liveTacticScore(e, t);
    }
    return (t === preferred ? 80 : 0) + (ev && ev.n >= 3 ? ev.pf : 1) + liveTacticScore(e, t);
  };
  return enabledLiveTactics(e, context).slice().sort((a, b) => score(b) - score(a));
}

const TICKS_PER_LOSING_HOUR = 60;
export const DEFAULT_LOSING_HOUR_PLAYS = ["block"] as const;
export const DEFAULT_LOSING_HOUR_INDS = ["ema", "direction", "bollinger"] as const;

const tapeCache = new WeakMap<VstEngine, { tick: number; red: boolean; iv: number }>();

function tapeSnap(e: VstEngine): { tick: number; red: boolean; iv: number } {
  const hit = tapeCache.get(e);
  if (hit && hit.tick === e.tick) return hit;
  const iv = intervalVolumeScale(e);
  const minutes = intervalMinutesOf(e);
  let red = Boolean(e.losingHour?.red);
  if (!red && e.tick >= minutes) {
    const st = lastIntervalStats(e);
    if (st.n >= 12 && st.net < -1e-4 && st.pf + 1e-9 < 0.95) red = true;
    else {
      const cur = currentIntervalNet(e);
      if (cur.n >= 16 && cur.net < -0.004) red = true;
    }
  }
  const snap = { tick: e.tick, red, iv };
  tapeCache.set(e, snap);
  return snap;
}

function pfOfRows(rows: { pnl?: number; ratio?: number }[]) {
  let gp = 0;
  let gl = 0;
  let net = 0;
  for (const r of rows) {
    const p = edgePnl(r);
    net += p;
    if (p > 0) gp += p;
    else if (p < 0) gl -= p;
  }
  return { n: rows.length, net, pf: profitFactor(gp, gl) };
}

export function refreshLosingHour(e: VstEngine) {
  const from = Math.max(0, e.tick - TICKS_PER_LOSING_HOUR);
  const rows = e.closed.filter((c) => intervalTapeRow(e, c) && (c.tick || 0) > from && (c.tick || 0) <= e.tick);
  const prev = e.losingHour;
  const stayPlays = { ...(prev?.stayPlays ?? {}) };
  const stayInds = { ...(prev?.stayInds ?? {}) };
  const sc = pfOfRows(rows);
  const byPlay = new Map<string, { pnl: number }[]>();
  const byInd = new Map<string, { pnl: number }[]>();
  for (const c of rows) {
    const play = String(c.playbook || "short");
    const ind = String(c.indication || "trend");
    (byPlay.get(play) ?? (byPlay.set(play, []), byPlay.get(play)!)).push(c);
    (byInd.get(ind) ?? (byInd.set(ind, []), byInd.get(ind)!)).push(c);
  }
  const greenPlays: string[] = [];
  const greenInds: string[] = [];
  const red = rows.length >= 12 && sc.net < -1e-4 && sc.pf + 1e-9 < 0.95;
  if (red) {
    for (const [k, list] of byPlay) {
      const st = pfOfRows(list);
      const rec = stayPlays[k] ?? { redH: 0, greenH: 0 };
      rec.redH += 1;
      if (st.n >= 2 && st.pf + 1e-9 >= 1 && st.net >= 0) {
        rec.greenH += 1;
        greenPlays.push(k);
      }
      stayPlays[k] = rec;
    }
    for (const [k, list] of byInd) {
      const st = pfOfRows(list);
      const rec = stayInds[k] ?? { redH: 0, greenH: 0 };
      rec.redH += 1;
      if (st.n >= 2 && st.pf + 1e-9 >= 1 && st.net >= 0) {
        rec.greenH += 1;
        greenInds.push(k);
      }
      stayInds[k] = rec;
    }
  } else {
    for (const [k, list] of byPlay) {
      const st = pfOfRows(list);
      if (st.n >= 2 && st.pf + 1e-9 >= 1 && st.net >= 0) greenPlays.push(k);
    }
    for (const [k, list] of byInd) {
      const st = pfOfRows(list);
      if (st.n >= 2 && st.pf + 1e-9 >= 1 && st.net >= 0) greenInds.push(k);
    }
  }
  const plays = greenPlays.length ? greenPlays : [...DEFAULT_LOSING_HOUR_PLAYS];
  const inds = greenInds.length ? greenInds : [...DEFAULT_LOSING_HOUR_INDS];
  e.losingHour = { red, net: sc.net, pf: sc.pf, n: sc.n, greenPlays: plays, greenInds: inds, stayPlays, stayInds, at: e.tick };
  return e.losingHour;
}

/** When last hour / 20m tape is red, lean into Block / ema / direction / bollinger; cut Short / trend / move. */
export function losingHourScale(
  e: VstEngine,
  rel: { playbook?: string; indication?: string; kind?: string; note?: string; blockLevel?: number },
): number {
  const lh = e.losingHour;
  const red = Boolean(lh?.red) || tapeSnap(e).red;
  if (!red) return 1;
  const play = String(rel.playbook || "");
  const ind = String(rel.indication || "");
  const note = String(rel.note || "");
  const blockFill = play === "block" || (rel.blockLevel ?? 0) >= 1 || /Block/i.test(note);
  if (blockFill) {
    if (!lh || lh.greenPlays.includes("block") || !("block" in (lh.stayPlays || {}))) return 1.32;
    return 0.72;
  }
  if (lh?.greenPlays?.includes(play)) return 1.18;
  if (ind && (lh?.greenInds?.includes(ind) || (DEFAULT_LOSING_HOUR_INDS as readonly string[]).includes(ind))) return 1.16;
  if (play === "short" || play === "normal" || rel.kind === "short" || rel.kind === "normal") return 0.78;
  if (ind === "trend" || ind === "move" || ind === "active") return 0.8;
  return 0.88;
}

export function tapeRed(e: VstEngine): boolean {
  return tapeSnap(e).red;
}

/** Red tape: keep Block at least 1× (lean 1.12); never inherit the short-lane haircut. */
export function blockIntervalScale(e: VstEngine): number {
  const snap = tapeSnap(e);
  if (snap.iv >= 1) return snap.iv;
  return snap.red ? 1.12 : 1;
}

function pfLaneScale(row: { n: number; pf: number; net: number; ok?: boolean } | undefined): number {
  if (!row || row.n < 6) return 1;
  if (row.pf >= 1.4 && row.net >= 0) return 1.12;
  if (row.pf >= 1 && row.net >= 0) return 1;
  if (row.pf >= 0.9) return 0.94;
  if (row.pf >= 0.75) return 0.86;
  return 0.75;
}

/** Size by last-N PF of playbook / indication / tactic. Losing lanes stay armed (high n) but tiny. */
export function progressLaneScale(
  e: VstEngine,
  rel: { playbook?: string; indication?: string; tactic?: string; kind?: string },
): number {
  const ev = e.progressEval;
  if (!ev) return 1;
  const play = String(rel.playbook || rel.kind || "");
  const ind = String(rel.indication || "");
  const tac = String(rel.tactic || "");
  const playScale = pfLaneScale(ev.playbooks?.[play]);
  const indScale = pfLaneScale(ev.indications?.[ind]);
  const tacScale = pfLaneScale(ev.tactics?.[tac]);
  const lh = e.losingHour;
  const winnerPlay = play === "block" || Boolean(lh?.greenPlays?.includes(play));
  const winnerInd = Boolean(ind && (lh?.greenInds?.includes(ind) || (DEFAULT_LOSING_HOUR_INDS as readonly string[]).includes(ind)));
  if (play === "block") return playScale >= 1 ? Math.max(playScale, 1.08) : playScale;
  if (winnerPlay) return Math.max(playScale, 1.05);
  if (lh?.red && winnerInd) return Math.max(indScale, 0.9);
  return Math.min(playScale, indScale, tacScale);
}

/** Combined entry size: interval × hour-tilt × PF lane. Always process; never oversize. */
export function entryVolumeScale(
  e: VstEngine,
  rel: { playbook?: string; indication?: string; tactic?: string; kind?: string; note?: string; blockLevel?: number },
): number {
  const play = String(rel.playbook || "");
  const blockFill = play === "block" || (rel.blockLevel ?? 0) >= 1 || /Block/i.test(String(rel.note || ""));
  const iv = blockFill ? blockIntervalScale(e) : tapeSnap(e).iv;
  const lose = losingHourScale(e, rel);
  const prog = progressLaneScale(e, rel);
  const maxMul = clampMaxVolumeMul(e.blockCfg?.maxVolumeMultiplier ?? DEFAULT_MAX_VOLUME_MULTIPLIER);
  const specified = Math.max(0.4, Number(intervalCfg(e).minScale) || 0.4);
  return Math.min(maxMul, Math.max(specified, iv * lose * prog));
}

export function shortProtectGrid(e: VstEngine, cfg: TacticConfig) {
  if (e.shortComboOnly && cfg.tpAtr != null && cfg.slOfTp != null) {
    const tpAtr = snapShortTpAtr(cfg.tpAtr);
    const slOfTp = snapShortSlOfTp(cfg.slOfTp);
    return [{
      tpAtr,
      slOfTp,
      slAtr: shortSlAtrOf(tpAtr, slOfTp),
      tpRatio: shortTpRatioOf(slOfTp),
      shortRange: true as const,
    }];
  }
  const sp = e.shortProgress ?? DEFAULT_SHORT_PROGRESS;
  const floors = shortProtectGridFor({
    minTpAtr: sp.minTpAtr,
    minSlOfTp: sp.minSlOfTp,
    maxTpAtr: sp.maxTpAtr,
    positiveOnly: sp.evalPositiveOnly !== false,
  });
  const inRange = (c: (typeof floors)[number]) => cfgUsesShortRange({ ...cfg, ...c, shortRange: true });
  const withinFloors = (c: { tpAtr: number; slOfTp: number }) => {
    if (c.tpAtr + 1e-9 < snapShortTpAtr(sp.minTpAtr)) return false;
    if (c.slOfTp + 1e-9 < snapShortSlOfTp(sp.minSlOfTp)) return false;
    if (c.tpAtr - 1e-9 > snapShortTpAtr(sp.maxTpAtr ?? 0.6)) return false;
    return true;
  };
  // Enabled band is the live grid. The exam still scores every short TP×SL so a cell outside today's floor can prove itself.
  if (internAllPhase(e)) return allShortTpSlCombos().filter(inRange);
  const intern = e.progressEval?.shortCombos;
  const gated = Boolean(e.preEvalDone || e.liveTape);
  // A pooled TP×SL score is discovery/ranking evidence, not a veto on an
  // independently qualified symbol/indication/calculation cell. Enumerate the
  // requested band; the final exact order identity is judged after geometry.
  if (gated) return allShortTpSlCombos().filter(c => withinFloors(c) && inRange(c));
  if (intern) {
    const keep = floors.filter((c) => {
      const row = intern[shortComboKey(c.tpAtr, c.slOfTp)];
      if (!row || row.n < 6) return true;
      return shortComboProven(e, c.tpAtr, c.slOfTp);
    });
    return keep.filter(inRange);
  }
  return floors.filter(inRange);
}

/** Every enabled low-range cell gets its own geometry; an isolated study keeps its selected cell. */
export function lowRangeProtectGrid(e: VstEngine, cfg: TacticConfig, tactic: TacticKind = e.lastTactic,
  symbol = Object.keys(e.quotes)[0] ?? "BTCUSDT") {
  const exactPrices = priceDistanceVariants(cfg, tactic);
  if (exactPrices.length) return exactPrices;
  if (cfg.lowRange?.enabled) {
    const cells = lowRangeGridProtects(cfg.lowRange, modeledPositionCost(e, symbol), 5, e.minSlDistancePct);
    return cells.flatMap(cell => {
      const base = { tpAtr: cell.tp * 100, slOfTp: cell.sl / cell.tp, trailPct: cell.trail * 100,
        lowRangeOnly: true as const, maxHoldTicks: cell.hold };
      if (!(cell.trail > 0) || tactic === "axis" || tactic === "dca") return [base];
      return [base, { ...base, trailingDistance: "fixed" as const }];
    });
  }
  if (cfg.microRange === true) {
    const all = allMicroCombos();
    return e.completeSim && !e.shortComboOnly ? all : all.filter(c =>
      c.tpAtr === snapMicroTpPct(cfg.tpAtr ?? .2) && c.slOfTp === snapSlOfTp(cfg.slOfTp ?? .5));
  }
  if (cfgUsesMinimalRange(cfg)) {
    const all = allMinimalCombos();
    return e.completeSim && !e.shortComboOnly ? all : all.filter(c =>
      c.tpAtr === snapMinimalTpCost(cfg.tpAtr ?? MINIMAL_WINNER.tpCost)
      && c.slOfTp === snapMinimalSlOfTp(cfg.slOfTp ?? MINIMAL_WINNER.slOfTp));
  }
  return [];
}

/**
 * After pre: intern-all is scoring-only. Never promote intern (validExec=false / n<6) into live.
 * Keep only independently proven short combos as live-counted.
 * Coordination note (future configs): intern always scores the full TP×SL × indication grid
 * on intern-all (pre) and intern-only symbols (after pre). Live executes currently
 * performing cells only — exclusive 1 combo+indication per symbol:side so intern isolated
 * PF transfers. Mixed last-240 / last-N must not decide live. Independent shortComboTape
 * (Base eval at shortBase, live start at short floor n≥20, live disable on live tape)
 * does. No hardcoded combo set.
 */
function flattenNonPerforming(e: VstEngine) {
  if (!e.preEvalDone) return;
  refreshPrePassKeys(e, { intern: true });
  const internKeys = { ...(e.prePassKeys ?? {}) };
  const snap: Record<string, { pnl: number }[]> = {};
  for (const [k, rows] of Object.entries(e.shortComboTape ?? {})) {
    snap[k] = rows.map((r) => ({ pnl: r.pnl }));
  }
  e.shortComboPreTape = snap;
  e.shortComboTape = {};
  comboPreRun.set(e, comboRun.get(e) ?? {});
  comboRun.set(e, {});
  const relSnap: Record<string, { pnl: number }[]> = {};
  for (const [k, rows] of Object.entries(e.shortRelTape ?? {})) {
    relSnap[k] = rows.map((r) => ({ pnl: r.pnl }));
  }
  e.shortRelPreTape = relSnap;
  e.shortRelTape = {};
  relPreRun.set(e, relRun.get(e) ?? {});
  relRun.set(e, {});
  refreshValidRelKeys(e);
  if (Object.keys(internKeys).length) e.prePassKeys = internKeys;
  freezeLiveTypeGate(e);
  for (const o of e.queue) if (o.validExec !== true) markTerminal(e, o, "cancelled");
  e.queue = e.queue.filter((o) => o.validExec === true && o.status === "queued");
  const keepO: LiveOrder[] = [];
  for (const o of e.orders) {
    if ((o.status === "open" || o.status === "partial" || o.status === "queued") && o.validExec !== true) {
      markTerminal(e, o, "cancelled");
      continue;
    }
    keepO.push(o);
  }
  e.orders = keepO;
  const keepPos: typeof e.positions = [];
  for (const p of e.positions) {
    if (p.validExec === true) {
      keepPos.push(p);
      continue;
    }
    p.validExec = false;
    const px = p.mark > 0 ? p.mark : p.avgEntry;
    closePosition(e, p, px, "time", { skipComboTape: true });
  }
  e.positions = keepPos;
}

function sliceShortGrid(
  e: VstEngine,
  all: ReturnType<typeof shortProtectGrid>,
  rank: number,
  symbol: string,
  side?: string,
  internExplore = false,
) {
  if (!all.length) return all;
  const isolatedLive = Boolean(e.completeSim) && Boolean(e.preEvalDone) && !internExplore && !completeOpenTape(e);
  const provenPreview: typeof all = [];
  for (const c of all) {
    if (c && (shortComboProven(e, c.tpAtr, c.slOfTp) || relComboAlive(e, c.tpAtr, c.slOfTp) || comboExamAlive(e, c.tpAtr, c.slOfTp))) provenPreview.push(c);
  }
  const comboPf = (c: (typeof all)[number]) => {
    if (!c) return 0;
    const row = e.progressEval?.shortCombos?.[shortComboKey(c.tpAtr, c.slOfTp)];
    return row && row.n >= 4 ? row.pf : 0;
  };
  provenPreview.sort((a, b) => comboPf(b) - comboPf(a) || b.tpAtr - a.tpAtr);
  // Stage eval scores every enabled TP×SL together. Overall and the hours after Base
  // keep every short config and lane. Proven cells stay first, nothing is dropped.
  if (isolatedLive) {
    const rest = all.filter((c) => c && !provenPreview.includes(c));
    return [...provenPreview, ...rest];
  }
  return all;
}

function thinCrowdedLanes(e: VstEngine, connId: string) {
  const cap = maxQueue(e);
  if (e.queue.length < Math.floor(cap * 0.9)) return;
  const groups = new Map<string, LiveOrder[]>();
  for (const o of e.queue) {
    if (o.connId !== connId || isBotPlay(o.playbook)) continue;
    const row = groups.get(laneBusyKey(o));
    if (row) row.push(o);
    else groups.set(laneBusyKey(o), [o]);
  }
  const kill = new Set<LiveOrder>();
  for (const rows of groups.values()) {
    if (rows.length <= 2) continue;
    const ranked = rows.slice().sort((a, b) => {
      const qa = e.quotes[a.symbol];
      const qb = e.quotes[b.symbol];
      const da = qa && a.price > 0 ? Math.abs(a.price - qa.px) : 9;
      const db = qb && b.price > 0 ? Math.abs(b.price - qb.px) : 9;
      return da - db;
    });
    for (const o of ranked.slice(2)) kill.add(o);
  }
  if (kill.size < 4) return;
  dropLaneOrders(e, (o) => kill.has(o));
}

function spinList<T>(arr: T[], tick: number, rank: number): T[] {
  if (arr.length < 2) return arr;
  const i = Math.abs(tick + rank * 3) % arr.length;
  return i === 0 ? arr : arr.slice(i).concat(arr.slice(0, i));
}

export function armUniverse(e: VstEngine, cfg: TacticConfig, _tactic: TacticKind, rangeType?: RangeType) {
  if (!isDeskConn(e.activeConnId)) e.activeConnId = VST_DEFAULT_CONN;
  const connId = e.activeConnId;
  // Arming is synchronous and closes no positions. Reuse a verdict only within
  // this call, keyed by the complete configuration; the next call re-evaluates it.
  const entryVerdicts = new Map<string, boolean>();
  const relate = relateConfig(cfg.relate);
  const relateRows = new Map<string, ConfigTapeRow[]>();
  const relatePlans = new Map<string, ReturnType<typeof planRelate>>();
  const relationRows = new Map<string, ConfigTapeRow[]>();
  const relationEvidence = new Map<string, RelateEvidence>();
  const relationSources = relate.scope === "overall"
    ? RELATE_SOURCES.filter(source => source !== "config" && (relate.volumeFactors?.[source] ?? 1) > 0) : [];
  const eligibleRelate = (row: ConfigTapeRow) => row.validExec === true && !row.examFlat &&
    typeof row.tick === "number" && row.tick < e.tick && row.connId === connId && Boolean(row.id) && deskTapeRow(e, row);
  if (relate.enabled && (e.preEvalDone || e.liveTape)) for (const row of e.closed) {
    if (!eligibleRelate(row)) continue;
    const key = completeStrategyConfigSampleKey(row);
    if (!key) continue;
    let own = relateRows.get(key);
    if (!own) relateRows.set(key, own = []);
    if (own.length < relate.lastN) own.push(row);
    if (relationSources.length) {
      const keys = deskRelateKeys(row, key);
      for (const source of relationSources) {
        const relation = keys[source];
        let rows = relationRows.get(relation);
        if (!rows) relationRows.set(relation, rows = []);
        if (rows.length < relate.lastN) rows.push(row);
      }
    }
  }
  keepCatalogLanes(e, connId);
  thinCrowdedLanes(e, connId);
  const qMax = maxQueue(e);
  const hardMax = maxPositions(e);
  const pMax = hardMax;
  const signals = signalKeys(e, connId);
  let qn = 0;
  const symLoad = new Map<string, number>();
  const tacLoad = new Map<string, number>();
  const noteLoad = (id: string) => symLoad.set(id, (symLoad.get(id) || 0) + 1);
  for (const o of e.queue) if (o.connId === connId && !isBotPlay(o.playbook)) {
    qn += 1;
    noteLoad(o.symbol);
    const t = String(o.tactic || "x");
    tacLoad.set(t, (tacLoad.get(t) || 0) + 1);
  }
  if (connId === "bingx-x01" && !paperMode(e) && qn > qMax) {
    const next = [];
    let kept = 0;
    for (const o of e.queue) {
      if (o.connId === connId && !isBotPlay(o.playbook)) {
        if (kept >= qMax) continue;
        kept += 1;
      }
      next.push(o);
    }
    e.queue = next;
    qn = kept;
  }
  for (const o of e.orders) {
    if (o.connId !== connId || isBotPlay(o.playbook) || (o.status !== "open" && o.status !== "partial")) continue;
    noteLoad(o.symbol);
  }
  for (const p of e.positions) if (p.connId === connId && !isBotPlay(p.playbook)) noteLoad(p.symbol);
  const symTac = new Map<string, number>();
  for (const o of e.queue) {
    if (o.connId !== connId || isBotPlay(o.playbook)) continue;
    const k = `${o.symbol}:${String(o.tactic || "x")}`;
    symTac.set(k, (symTac.get(k) || 0) + 1);
  }
  const symCap = 1e9;
  const shareOn = performingLive(e);
  const shareCap = shareOn ? Math.max(120, Math.floor(qMax / Math.max(2, enabledLiveTactics(e).length))) : qMax;
  const laneN = Math.max(1, Math.min(50, Math.max(1, e.symbolCount || 8)));
  if (shareOn) trimShortBook(e, Math.max(shortRestCap(e, shareCap) * laneN, laneN * 4));
  if (qn >= qMax) return;
  const busy = occupiedSymbols(e, connId);
  const busyLegs = occupiedLegs(e, connId);
  const universe = rankUniverse(e);
  const winN = Math.min(16, Math.max(1, Math.round(e.blockCfg?.evalPosCount || 6)));
  const complete = Boolean(e.completeSim) && paperMode(e);
  const internAll0 = internAllPhase(e);
  const openTape = completeOpenTape(e);
  const livePace = openTape || performingLive(e);
  const gated0 = Boolean(e.preEvalDone || e.liveTape);
  const nativePaper = !complete && paperMode(e) && cfg.priceDistanceGrid?.enabled === true;
  const frozenCandidates = gated0 && paperMode(e) && cfg.priceDistanceGrid?.enabled === true && e.frozenBaseSamples !== undefined
    ? frozenNativeCandidatesFor(e) : undefined;
  const sourceOnsets = new Map<string, ReadonlySet<IndicationId>>();
  const sourceIds = e.indicationSourceIds ?? [];
  if (sourceIds.length) for (const { id } of universe) {
    const directions = e.quotes[id]?.portedDirections;
    if (!directions) continue;
    const active = sourceIds.filter(source => directions[source] === 1 || directions[source] === -1);
    if (active.length) sourceOnsets.set(id, new Set(active));
  }
  const liveCap = clampLiveSymbolCap(Number(e.liveSymbolCap) || (e.liveTape ? VST_LIVE_SYMBOLS : e.symbolCount), e.symbolCount);
  // After pre: spare symbols keep intern-all scoring (future config changes). Live never shares those legs.
  // Open tape (prehours:0 screenshot): every symbol is live — intern-slot starved later hours to n=0.
  const internOnlyFloor =
    livePace
      ? -1
      : complete && gated0 && !internAll0
      ? Math.max(0, universe.length - Math.min(8, Math.max(4, Math.floor(universe.length / 5))))
      : -1;
  const internReserve =
    livePace
      ? 0
      : !internAll0 && (Boolean(e.liveTape) || (complete && gated0))
      ? Math.max(64, Math.min(Math.floor(qMax * 0.25), 2000))
      : 0;
  const armSymbol = (s: VstSymbol, rank: number) => {
    const q = e.quotes[s.id];
    if (!q || !(q.px > 0)) return;
    const beyondLive =
      Boolean(e.liveTape) &&
      rank >= liveCap &&
      !busy.has(s.id) &&
      !busyLegs.has(`${s.id}:long`) &&
      !busyLegs.has(`${s.id}:short`);
    const internSlot = livePace ? false : rank >= liveCap || (internOnlyFloor >= 0 && rank >= internOnlyFloor) || beyondLive;
    const qStop = !internSlot && internReserve ? qMax - internReserve : qMax;
    if (!openTape && (e.liveTape || (complete && gated0 && !internAll0)) && rank >= liveCap && !internSlot) return;
    if (!internSlot && internReserve && qn >= qMax - internReserve) return;
    // Native paper Base collects own evidence, and each validation cell
    // passes its exact gate below. Symbol Block pauses still apply here.
    if (!internSlot && (nativePaper ? symbolBlockPaused(e, s.id, winN) : skipLiveSymbol(e, s.id, winN))) return;
    if ((e.cooldown[cooldownKey(connId, s.id)] ?? 0) > e.tick) return;
    if ((symLoad.get(s.id) || 0) >= symCap) return;
    const mode = e.blockCfg?.sides ?? "both";
    const atr = Math.max(q.atr, q.px * 0.0008, 1e-9);
    const disp = Math.abs(q.px - (q.axis || q.px)) / atr;
    const meanSide: Side = q.px >= (q.axis || q.px) ? "short" : "long";
    const pack = symbolIndications(s.id);
    const symbolBands = openTape || performingLive(e) || internAll0 ? rangeBands(q, cfg) : undefined;
    const winner = classifyIndication(e, s.id);
    let liveInd: IndicationId = winner;
    if (!complete && winner !== "break" && winner !== "ema" && winner !== "macd" && winner !== "rsi") {
      const qb = indicationQuality("break", pack);
      const qw = indicationQuality(winner, pack);
      if (
        Math.abs(pack.break) >= 0.14 &&
        qb >= indicationQualityFloor("break") * 0.9 &&
        qb + 0.06 >= qw * 0.82
      ) {
        liveInd = "break";
      }
    }
    // Screenshot 20h comboOnly: winner indication + last tactic (independent TP×SL tape).
    // Intern-all / intern-eval / liveTape: all lanes best-first, no exclusive lock.
    const allLanes = internAll0 || internSlot || (complete && !e.shortComboOnly) || Boolean(e.liveTape) || Boolean(e.x01Progress);
    // Axis-only books still require a stretch. Parallel books must not drop trailing/DCA because the seed tactic is axis.
    const axisOnly = !allLanes && e.lastTactic === "axis";
    if (axisOnly && (disp < 0.35 || disp > 2.6)) return;
    const onsets = sourceOnsets.get(s.id);
    const inds = spinList(allLanes ? rankIndications(e, pack, liveInd)
      : onsets ? [...new Set([liveInd, ...onsets])] : [liveInd], e.tick, rank);
    if (e.completeSim && paperMode(e) && allLanes) {
      const have = new Set<string>();
      for (const o of e.queue) if (o.symbol === s.id && o.indication) have.add(o.indication);
      for (const o of e.orders) {
        if (o.symbol !== s.id || !o.indication) continue;
        if (o.status === "open" || o.status === "partial" || o.status === "queued") have.add(o.indication);
      }
      inds.sort((a, b) => Number(have.has(a)) - Number(have.has(b)));
    }
    if (!gated0 && onsets) inds.sort((a, b) => Number(onsets.has(b)) - Number(onsets.has(a)));
    let fresh = 0;
    const freshCap = e.completeSim && paperMode(e) ? 1e9 : e.queue.length > 400 ? 16 : 1e9;
    let trySides = axisOnly ? [meanSide] : symbolSideSet(s.id, mode, direction(q));
    trySides = trySides.filter((side) => !e.manualClosed?.[`${s.id}:${side}`]);
    if (!trySides.length) return;
    const dual = trySides.length === 2;
    if (!dual && !complete && e.blockCfg?.windows !== false && symbolBlockPaused(e, s.id, winN)) return;
    const pairBook = new Map<string, {
      inds: Set<string>;
      connId: string;
      symbol: string;
      side: Side;
      px: number;
      qty: number;
      sl: number;
      tp: number;
      slDist: number;
      tpDist: number;
      rangeType: RangeType;
      indication: IndicationId;
      kind?: StrategyKind;
      playbook?: string;
      tactic: TacticKind;
      validExec: boolean;
      tpAtr?: number;
      slOfTp?: number;
      trailPct?: number;
      trailingDistance?: TrailingDistance;
      priceStopPct?: number;
      priceTrailPct?: number;
      maxHoldTicks?: number;
      calc?: LiveOrder["calc"];
      microRange?: boolean;
      minimalRange?: boolean;
      shortRange?: boolean;
      modelRtCost?: number;
      minSlDistancePct?: number;
      microMinSlDistancePct?: number;
      microMinTrailDistancePct?: number;
    }>();
    const configuredTrailingDistance: TrailingDistance | undefined = cfg.trailingDistance === "fixed" ? "fixed" : undefined;
    const rangeContext = {
      rangeType: rangeType ?? e.lastRange,
      microRange: cfg.microRange,
      minimalRange: cfgUsesMinimalRange(cfg),
      shortRange: cfgUsesShortRange(cfg),
    };
    for (const ind of inds) {
      const lowRange = ind.startsWith("low-range-");
      if (lowRange && !rangeContext.microRange && !rangeContext.minimalRange && !rangeContext.shortRange) continue;
      const exactSource = isPortedIndication(ind);
      const sourceSide=exactSource?stable02EntrySide(q,ind):null;
      if(exactSource&&!sourceSide)continue;
      if (fresh >= freshCap) break;
      if (e.skipIndications?.includes(ind)) continue;
      let sides = trySides;
      if (!complete && !axisOnly && ind === "break") {
        const spanNow = (q.hi - q.lo) / atr;
        const weak = Math.abs(pack.break) < 0.08 && spanNow < 1.08 && Math.abs(q.chg) < 0.0022;
        if (weak) continue;
        const brk: Side =
          pack.break > 0.06 ? "long" : pack.break < -0.06 ? "short" : q.px >= (q.axis || q.px) ? "long" : "short";
        if (mode === "long" || mode === "short") {
          if (brk !== mode) continue;
          sides = [mode];
        } else if (mode === "one") {
          sides = trySides.filter((x) => x === brk);
          if (!sides.length) continue;
        } else {
          sides = [brk];
        }
      }
      const added = stable02EntrySide(q, ind);
      if (added && !sides.includes(added) && mode !== "long" && mode !== "short") sides = [...sides, added];
      const ownProcessing = lowRange ? { ...rangeContext, indication: ind } : undefined;
      const tacs = spinList(allLanes
        ? rankTactics(e, pickLiveTactic(e, ind, e.lastTactic, ownProcessing), ownProcessing)
        : [e.lastTactic], e.tick, rank);
      const strategyProcessing = strategyProcessingFor(e, ownProcessing ?? rangeContext);
      const liveFactor = stable02Factor(q);
      for (const tac of tacs) {
      if (fresh >= freshCap) break;
      if (lowRange && tac === "trailing" && !strategyProcessing.trailing) continue;
      const processed = livePace || e.liveTape ? stable02ProcessSide(q, ind, tac) : undefined;
      if (processed === null && tac === "axis") continue;
      const symTacCap = shareOn && (tac === "trailing" || tac === "hybrid") ? Math.max(8, shortRestCap(e, shareCap)) : shareCap;
      if (shareOn && symTacCap <= 0) continue;
      if (shareOn && (symTac.get(`${s.id}:${tac}`) || 0) >= symTacCap) continue;
      if (shareOn && (tacLoad.get(tac) || 0) >= shareCap) continue;
      const liveQuality = openTape || performingLive(e) || Boolean(e.liveTape);
      if (!(e.completeSim && paperMode(e)) && tac === "axis" && !internAllPhase(e) && disp > 1.05) continue;
      if (tac === "dca" && dcaOverlayOff(e)) continue;
      if (liveQuality && !liveIndStillPays(e, ind)) continue;
      if ((performingLive(e) || e.liveTape) && !(e.completeSim && paperMode(e))) {
        const gate = typeGateMem.get(e);
        const indRow = gate?.indications?.[ind];
        const tacRow = gate?.tactics?.[tac];
        const shortBook = cfgUsesShortRange(cfg);
        // Mixed-intern indication PF must not blank a proven short combo. Dead tactics stay off.
        if (!shortBook && gate && indRow && indRow.n >= 4 && !indRow.ok) continue;
        if (gate && tacRow && tacRow.n >= 8 && tacRow.pf + 1e-9 < 0.9 && tacRow.net <= 0) {
          const keepTac =
            Object.keys(e.validRelKeys ?? {}).some((k) => k.startsWith(`${ind}:${tac}:`)) ||
            execRelPrefix(e, ind, tac) ||
            Object.keys(e.shortComboPreTape ?? e.shortComboTape ?? {}).some((k) => {
              const [tpS, slS] = k.split(":");
              const tp = Number(tpS);
              const sl = Number(slS);
              return Number.isFinite(tp) && Number.isFinite(sl) && shortComboProven(e, tp, sl);
            });
          if (!keepTac) continue;
        }
      }
      const axisInd = tac === "axis";
      const normalOff = !strategyProcessing.normal;
      const book = tac === "dca"
        ? "dca"
        : tac === "axis"
          ? "axis"
          : tac === "hybrid"
            ? (cfgUsesShortRange(cfg) ? "short" : "normal")
            : cfgUsesShortRange(cfg)
              ? "short"
              : openPlaybook(tac, ind);
      const kind = cfgUsesShortRange(cfg) ? "short" : kindFromIndication(ind, book, tac);
      const range = pickIndicationRange(e, ind, rangeType ?? e.lastRange ?? "atr");
      const shortLane = cfgUsesShortRange(cfg);
      const plainNormal = normalOff && unadjustedNormalOrder({ playbook: book, kind, tactic: tac });
      const keepInd =
        book === "block" ||
        (DEFAULT_LOSING_HOUR_INDS as readonly string[]).includes(ind) ||
        ind === "break" ||
        ind === "active";
      const fadeSide = (exactSource ? (sourceSide&&sides.includes(sourceSide)?[sourceSide]:[]) : tac === "axis" ? [processed || axisEntrySide(q)] : tac === "dca" ? [direction(q)] : sides).filter(
        (side) => !e.manualClosed?.[`${s.id}:${side}`] && !(processed === null && side === stable02EntrySide(q, ind)),
      );
      for (const side of fadeSide) {
        if (fresh >= freshCap || qn >= qStop) break;
        if (!takeSignal(signals, s.id, side, pMax)) continue;
        if (!complete && dual && e.blockCfg?.windows !== false && blockRelPaused(e, `leg:${s.id}:${side}`, winN)) continue;
        if (
          !complete &&
          blockComboPaused(
            e,
            { symbol: s.id, side, indication: ind, kind, tactic: tac, rangeType: range, playbook: book },
            winN,
          )
        )
          continue;
        const execRel = {
          symbol: s.id,
          side,
          indication: ind,
          kind,
          tactic: tac,
          rangeType: range,
          playbook: book,
        };
        const gatedExec = Boolean(e.preEvalDone || e.liveTape);
        const internAll = internAllPhase(e);
        const internScore = Boolean(e.completeSim && paperMode(e));
        const internKeep = internAll || internSlot;
        const internHere = internAll || internSlot;
        const validExec = internHere || plainNormal ? false : (!gatedExec || liveShouldExecute(e, execRel));
        const afterBase = gatedExec && !internHere && !internKeep;
        // Coarse check has no TP×SL yet. Stage eval keeps every config; after Base the leg loop keeps only a validated one.
        if (plainNormal && (e.liveTape || (!internHere && !internKeep))) continue;
        if (!afterBase && !internKeep && !internHere && !validExec && !keepInd && !shortLane) continue;
        const short = shortLane;
        // The native catalog takes precedence over the legacy ratio grid.
        const nativeGrid = cfg.priceDistanceGrid?.enabled === true ? priceDistanceVariants(cfg, tac) : [];
        const costLowGrid = lowRange && !nativeGrid.length && cfg.lowRange?.enabled
          ? lowRangeProtectGrid(e, cfg, tac, s.id) : [];
        const evalGrid = nativeGrid.length || costLowGrid.length ? [] : internHere && short
          ? (internAll
            ? (() => {
              const all = allShortTpSlCombos().filter((c) => cfgUsesShortRange({ ...cfg, ...c, shortRange: true }));
              const floors = shortProtectGridFor({
                minTpAtr: DEFAULT_SHORT_MIN_TP_ATR,
                minSlOfTp: DEFAULT_SHORT_MIN_SL_OF_TP,
                maxTpAtr: 0.6,
                positiveOnly: false,
              });
              const seen = new Set(floors.map((c) => shortComboKey(c.tpAtr, c.slOfTp)));
              const rest = all.filter((c) => !seen.has(shortComboKey(c.tpAtr, c.slOfTp)));
              return [...floors, ...rest];
            })()
            : allShortTpSlCombos().filter((c) => cfgUsesShortRange({ ...cfg, ...c, shortRange: true })))
          : short
            ? shortProtectGrid(e, cfg)
            : [null];
        let boundedNativeGrid: readonly (typeof nativeGrid)[number][] = nativeGrid;
        if (nativeGrid.length) {
          const parentKey = JSON.stringify([s.id, side, ind, tac, book, kind, range,
            cfg.tpAtr, cfg.slOfTp, !!cfg.microRange, !!cfg.minimalRange, !!cfg.shortRange, cfg.priceDistanceGrid]);
          if (afterBase && frozenCandidates) {
            // This lookup only enumerates candidates. The complete range, calculation,
            // cost and protection identity must still pass the entry gate below.
            const parentTp = cfg.microRange
              ? snapMicroTpPct(cfg.tpAtr ?? .2)
              : cfgUsesMinimalRange(cfg)
                ? snapMinimalTpCost(cfg.tpAtr ?? MINIMAL_WINNER.tpCost)
                : cfg.tpAtr;
            const parentSl = cfg.microRange
              ? snapSlOfTp(cfg.slOfTp ?? .5)
              : cfgUsesMinimalRange(cfg)
                ? snapMinimalSlOfTp(cfg.slOfTp ?? MINIMAL_WINNER.slOfTp)
                : cfg.slOfTp;
            const shapes = frozenCandidates.get(nativeCandidateOwner({ ...execRel, connId,
              tpAtr: parentTp, slOfTp: parentSl,
              microRange: cfg.microRange === true, minimalRange: cfgUsesMinimalRange(cfg), shortRange: short,
              modelRtCost: modeledPositionCost(e, s.id), minSlDistancePct: normalizeMinSlDistancePct(e.minSlDistancePct),
              ...(cfg.microRange ? { microMinSlDistancePct: e.microMinSlDistancePct,
                microMinTrailDistancePct: e.microMinTrailDistancePct } : {}) }));
            const candidates = shapes ? nativeGrid.filter(cell => shapes.has(nativeGeometryKey(cell))) : [];
            boundedNativeGrid = candidates.length <= 16 ? candidates
              : priceDistanceParentBatch(candidates, e.priceDistanceValidationBatches ??= {}, parentKey);
          } else {
            const progressCfg = lastNProgressOf(e);
            const policies = progressCfg.policies?.length ? progressCfg.policies : [progressCfg];
            const baseWindows = policies.flatMap(policy => policy.evalNs);
            const parentSamples = e.priceDistanceParentSamples ??= {};
            boundedNativeGrid = priceDistanceParentBatch(nativeGrid, parentSamples, parentKey, 16, Math.min(...baseWindows));
          }
        }
        const lowGrid = short || nativeGrid.length || costLowGrid.length ? [] : lowRangeProtectGrid(e, cfg, tac);
        const grid = nativeGrid.length
          ? boundedNativeGrid
          : costLowGrid.length ? costLowGrid
          : short
            ? sliceShortGrid(e, evalGrid as ReturnType<typeof shortProtectGrid>, rank, s.id, side, internSlot || internKeep || !gatedExec)
            : lowGrid.length ? lowGrid : [null];
        const hourBusy = livePace && hourTapeBusy(e);
        const trailBase = snapTrailPct(cfg.trailingPct);
        for (const prot of grid) {
          const protection = prot as null | { tpAtr?: number; slOfTp?: number; slAtr?: number; tpRatio?: number;
            trailPct?: number; lowRangeOnly?: boolean; maxHoldTicks?: number;
            priceStopPct?: number; priceTrailPct?: number; trailingDistance?: TrailingDistance };
          if (fresh >= freshCap || qn >= qStop) break;
          const trailingDistance: TrailingDistance | undefined = protection?.trailingDistance ?? configuredTrailingDistance;
          const comboKey = prot ? exactProtectionCombo({ ...prot, microRange: cfg.microRange, minimalRange: cfg.minimalRange, shortRange: short }) : "";
          const relOk = Boolean(short && prot && performingLive(e) && (internRelProven(e, { indication: ind, tactic: tac, tpAtr: prot.tpAtr!, slOfTp: prot.slOfTp! }) || relExamPass(e, { indication: ind, tactic: tac, tpAtr: prot.tpAtr!, slOfTp: prot.slOfTp! })));
          const comboOk = !short || !prot || internAll || internSlot || internKeep || shortComboProven(e, prot.tpAtr!, prot.slOfTp!) || relOk;
          const comboExec = internHere
            ? false
            : afterBase ? false : !gatedExec || liveShouldExecute(e, prot ? { ...execRel, tpAtr: prot.tpAtr!, slOfTp: prot.slOfTp! } : execRel);
          if (gatedExec && short && prot && !internHere && !(e.shortComboOnly && paperMode(e))) {
            if (!comboOk && !afterBase) continue;
            if (!comboExec && !internKeep && !(keepInd && !afterBase) && !afterBase) continue;
          }
          let laneValid = internHere ? false : comboExec && comboOk;
          if (afterBase && !internHere) laneValid = true;
          if (
            performingLive(e) &&
            tac === "dca" &&
            examRelReady(e) &&
            prot &&
            !relExamPass(e, { indication: ind, tactic: "dca", tpAtr: prot.tpAtr!, slOfTp: prot.slOfTp! }) &&
            !shortComboProven(e, prot.tpAtr!, prot.slOfTp!) &&
            !validatedSet(e, { indication: ind, tactic: "dca", playbook: book, kind, rangeType: range, tpAtr: prot.tpAtr!, slOfTp: prot.slOfTp! })
          )
            continue;
          // Mixed intern indication PF must not skip a proven independent short combo.
          if (complete && gatedExec && laneValid && !short && !(paperMode(e))) {
            const indRow = e.progressEval?.indications?.[ind];
            if (indRow && indRow.n >= 6 && !indRow.ok && !keepInd) continue;
          }
          if (!laneValid && !internHere && !internKeep) continue;
          const downHour = livePace && highTradeHourDown(e);
          const dirExam = ind === "direction" && performingLive(e);
          const paysHour = dirExam || (livePace && indicationPaysThisHour(e, ind));
          const ddNow = livePace || internAll0 ? sessionDrawdown(e) : 0;
          const ddCut = ddNow >= 0.018 ? 0.72 : 1;
          const relAlign = meanSide === "short" ? (pack.prevRel ?? 0) : -(pack.prevRel ?? 0);
          const bands = livePace || dirExam ? symbolBands : undefined;
          const useCalc = openTape || dirExam;
          const parallelRanges = allLanes ? expandPayRanges(ind, range) : [range];
          const legs: IndCalcLeg[] = !useCalc
            ? parallelRanges.map((r, i) => ({
                kind: i === 0 ? "base" as const : "rng" as const,
                range: r,
                spaceMul: 1,
                sizeMul: i === 0 ? 1 : 0.55,
                near: 0.11,
              }))
            : downHour && !paysHour && ind !== "direction"
              ? [{ kind: "base", range: "atr", spaceMul: 1, sizeMul: 0.4 * ddCut, near: 0.11 }]
              : indicationCalcLegs({
                  id: ind,
                  primary: range,
                  dd: ddNow,
                  pxStretch: disp,
                  pays: paysHour,
                  busy: hourBusy,
                  ddActivity: pack.drawdown ?? 0,
                  relAlign,
                  factor: liveFactor,
                  bands,
                  tactic: tac,
                }).map((leg) => ({ ...leg, sizeMul: leg.sizeMul * ddCut }));
          if (!useCalc && paysHour && tac !== "dca" && (performingLive(e) || openTape || e.liveTape)) {
            const extra = indicationCalcLegs({
              id: ind,
              primary: range,
              dd: ddNow,
              pxStretch: disp,
              pays: true,
              busy: hourBusy,
              ddActivity: pack.drawdown ?? 0,
              relAlign,
              factor: liveFactor,
              bands,
              tactic: tac,
            });
            for (const leg of extra) {
              if (leg.kind === "base") continue;
              if (legs.length >= 4) break;
              if (legs.some((l) => l.kind === leg.kind && l.range === leg.range)) continue;
              legs.push({ ...leg, sizeMul: leg.sizeMul * ddCut });
            }
          }
          if (allLanes && ((e.completeSim && paperMode(e)) || (!afterBase && (e.liveTape || e.x01Progress || e.completeSim)))) {
            const have = new Set(legs.map((l) => l.range));
            for (const r of RANGE_TYPES) {
              if (have.has(r)) continue;
              legs.push({ kind: "rng", range: r, spaceMul: 1, sizeMul: 0.55, near: 0.11 });
              have.add(r);
            }
          }
          if (!afterBase && tac === "axis" && laneValid && ind === inds[0] && qn < Math.floor(qStop * 0.75)) {
            for (const phase of axisPhasesOpen(e, q, side)) {
              for (const r of RANGE_TYPES) {
                if (legs.some((l) => l.kind === phase && l.range === r)) continue;
                legs.push({ kind: phase, range: r, spaceMul: axisPhaseSpace(phase), sizeMul: 0.35, near: 0.16 });
              }
            }
          }
          let legOk = laneValid;
          for (const leg of legs) {
          if (fresh >= freshCap) break;
          if (!(e.completeSim && paperMode(e)) && tac === "dca" && leg.range === "volume") continue;
          if (!(e.completeSim && paperMode(e)) && tac === "axis" && !internAllPhase(e) && leg.range === "volume" && disp < 0.18) continue;
          if (afterBase && !internHere) {
            // This is only a geometry candidate. Missing calc/trail/range and
            // economics here would let sibling outcomes veto the exact cell.
            legOk = false;
          } else legOk = laneValid;
          const hi0 = pickRange(q, cfg, leg.range);
          const scale = leg.spaceMul > 0 && leg.spaceMul !== 1 ? leg.spaceMul : 1;
          const hi = scale === 1 ? { ...hi0, rangeType: leg.range } : { ...hi0, rangeType: leg.range, spacing: hi0.spacing * scale, levels: hi0.levels.map((lv) => lv * scale) };
          const useBusy = hourBusy && (BUSY_WEAK_INDS.has(ind) || indicationProtect(ind).tpMul >= 1.2);
          const shortFlat = short && ind !== "break";
          const protMul = useBusy
            ? busyIndicationProtect(ind)
            : shortFlat
              ? { slMul: 1, tpMul: 1, holdMul: 0.7 }
              : indicationProtect(ind);
          const pxHint = meanSide === "long" || !axisInd
            ? (side === "long" ? q.axis - (hi.levels[0] || hi.spacing) : q.axis + (hi.levels[0] || hi.spacing))
            : side === "long"
              ? q.axis - (hi.levels[0] || hi.spacing)
              : q.axis + (hi.levels[0] || hi.spacing);
          const axisLv = axisInd && !short ? axisProtect(pxHint > 0 ? pxHint : q.px, side, q, hi.spacing, cfg, hi.rangeType, modeledPositionCost(e, s.id)) : null;
          const slAtrUse = protection?.slAtr ?? cfg.slAtr ?? SL_ATR_MULT;
          const tpRatioUse = short
            ? Math.max(0.3, protection?.tpRatio ?? cfg.tpRatio ?? TP_SL_RATIO)
            : snapTpRatio(cfg.tpRatio ?? TP_SL_RATIO);
          const slBase = slDist(q.atr, hi.spacing, slAtrUse, short, q.px);
          const sl0 = axisLv ? axisLv.slDist : slBase * protMul.slMul;
          const tp0 = axisLv ? axisLv.tpDist : slBase * tpRatioUse * protMul.tpMul;
          const volMul = Math.min(1.05, Math.max(0.7, finiteOr(q.vol, 0.012) / 0.014));
          const nStack = complete ? 1 : laneLastNStack(e, {
            symbol: s.id,
            side,
            indication: ind,
            kind,
            tactic: tac,
            rangeType: range,
            playbook: book,
          });
          const loseScale = entryVolumeScale(e, { playbook: book, indication: ind, kind, tactic: tac, blockLevel: 0 }) * leg.sizeMul;
          if (!internSlot && !complete && rank > 24 && finiteOr(q.vol, 0) < MIN_QUOTE_VOL) return;
          const notional = positionNotional(paperSizeEquity(e), e.costStep || 10) * volMul * nStack * loseScale;
          const axisPartial = internHere || internKeep || e.shortComboOnly || !laneValid || (complete && paperMode(e))
            ? 1
            : clampAxisPartial(cfg.axisPartialRatio);
          const pfDepth = validatedOrderDepth(e, ind, prot?.tpAtr, prot?.slOfTp, hi.levels.length, tac);
          if (pfDepth === 0) continue;
          const depth = pfDepth > 0
            ? pfDepth
            : book === "dca"
            ? 1
            : leg.kind !== "base"
            ? 1
            : internSlot || internHere
            ? 1
            : complete
            ? hi.levels.length
            : axisInd
              ? Math.min(Math.max(2, cfg.axisLevels), hi.levels.length, axisPartial >= 2 ? 2 : 5)
              : hi.levels.length;
          const addedLegs = new Set<string>();
          hi.levels.slice(0, Math.max(1, depth)).forEach((offset, li) => {
            if (fresh >= freshCap || qn >= qStop) return;
            if ((symLoad.get(s.id) || 0) >= symCap) return;
            const trailPct = protection?.priceTrailPct ?? protection?.trailPct ??
              (ind === "trend" || ind === "break"
                ? trendBreakTrailPct((leg.range === "geometric" ? 1 : leg.range === "fibonacci" ? 2 : 0) + li)
                : trailBase);
            const nearBook = livePace || internAll0;
            const nearOff = nearBook
              ? Math.min(offset, atr * (leg.kind === "base" && li > 0 ? 0.24 : leg.near))
              : offset;
            const anchor = nearBook ? q.px * 0.7 + q.axis * 0.3 : q.axis;
            const px = side === "long" ? anchor - nearOff : anchor + nearOff;
            if (px <= 0) return;
            const baseQty = notional / px * laneVolumeFactor(cfg.relationalVolumeRatios,{symbol:s.id,indication:ind,tactic:tac,playbook:book,microRange:cfg.microRange,minimalRange:cfgUsesMinimalRange(cfg),shortRange:short,rangeType:leg.range});
            const unscaledQty = axisInd ? baseQty * axisPartial : baseQty;
            const lv0 = !short && (axisInd || book === "dca")
              ? axisProtect(px, side, q, hi.spacing, cfg, hi.rangeType, modeledPositionCost(e, s.id))
              : protectLevels(px, side, sl0, tp0, sl0 > 1e-12 ? tp0 / sl0 : 1, true, modeledPositionCost(e, s.id), e.minSlDistancePct);
            const microOn = cfg.microRange === true;
            const minimalOn = cfgUsesMinimalRange(cfg);
            const mini = microOn
              ? microControlPrices(side, px, prot?.tpAtr ?? cfg.tpAtr, prot?.slOfTp ?? cfg.slOfTp, modeledPositionCost(e, s.id), e.minSlDistancePct, e.microMinSlDistancePct)
              : minimalOn
              ? minimalControlPrices(side, px, prot?.tpAtr ?? cfg.tpAtr ?? MINIMAL_WINNER.tpCost, prot?.slOfTp ?? cfg.slOfTp ?? MINIMAL_WINNER.slOfTp, modeledPositionCost(e, s.id), e.minSlDistancePct)
              : null;
            const lowRangeLv = lowRange && protection?.lowRangeOnly && protection.tpAtr != null && protection.slOfTp != null
              ? initialProtection(side, px, px * protection.tpAtr * protection.slOfTp / 100,
                px * protection.tpAtr / 100, modeledPositionCost(e, s.id), e.minSlDistancePct)
              : null;
            const baseLv = lowRangeLv
              ? lowRangeLv
              : mini
              ? { sl: mini.sl, tp: mini.tp, slDist: mini.slDist, tpDist: mini.tpDist }
              : lv0;
            const lv = protection?.priceStopPct != null
              ? absoluteProtection(side, px, protection.priceStopPct, baseLv.tpDist)
              : baseLv;
            const miniTp = microOn ? snapMicroTpPct(prot?.tpAtr ?? cfg.tpAtr ?? .2) : minimalOn ? snapMinimalTpCost(prot?.tpAtr ?? cfg.tpAtr ?? MINIMAL_WINNER.tpCost) : prot?.tpAtr;
            const miniSl = microOn ? snapSlOfTp(prot?.slOfTp ?? cfg.slOfTp ?? .5) : minimalOn ? snapMinimalSlOfTp(prot?.slOfTp ?? cfg.slOfTp ?? MINIMAL_WINNER.slOfTp) : prot?.slOfTp;
            const legKey = laneBusyKey({ ...execRel, calc: leg.kind, rangeType: hi.rangeType,
              tpAtr: miniTp, slOfTp: miniSl, microRange: microOn, minimalRange: minimalOn, shortRange: short,
              trailPct, trailingDistance, priceStopPct: protection?.priceStopPct, priceTrailPct: protection?.priceTrailPct,
              maxHoldTicks: protection?.maxHoldTicks, modelRtCost: modeledPositionCost(e, s.id),
              minSlDistancePct: normalizeMinSlDistancePct(e.minSlDistancePct),
              ...(microOn ? { microMinSlDistancePct: e.microMinSlDistancePct,
                microMinTrailDistancePct: e.microMinTrailDistancePct } : {}) });
            if (busyLegs.has(legKey)) return;
            let entryValid = legOk;
            let relateMultiplier = 1;
            let relateTrial: RelateTrialStamp | undefined;
            let relateRelationTrials: RelateRelationTrials | undefined;
            // The coarse selection above does not yet know the final calc/trail
            // or snapped distance. Admission must use the actual order identity.
            if (afterBase && !internHere) {
              const entryRel = { ...execRel, connId, rangeType: hi.rangeType, price: px, tpDist: lv.tpDist, slDist: lv.slDist,
                tpAtr: miniTp, slOfTp: miniSl, trailPct, trailingDistance, priceStopPct: protection?.priceStopPct, priceTrailPct: protection?.priceTrailPct,
                maxHoldTicks: protection?.maxHoldTicks, calc: leg.kind,
                microRange: microOn, minimalRange: minimalOn, shortRange: short,
                modelRtCost: modeledPositionCost(e, s.id), minSlDistancePct: normalizeMinSlDistancePct(e.minSlDistancePct),
                ...(microOn ? {microMinSlDistancePct:e.microMinSlDistancePct,microMinTrailDistancePct:e.microMinTrailDistancePct} : {}) } as const;
              registerSampleContext(e, entryRel);
              const proofKey = JSON.stringify([strategyConfigSampleKey(entryRel), configStepFloor(e, baseStageFloor(e), entryRel)]);
              let verdict = entryVerdicts.get(proofKey);
              if (verdict === undefined) {
                verdict = liveShouldExecute(e, entryRel);
                entryVerdicts.set(proofKey, verdict);
              }
              entryValid = verdict;
              if (!entryValid) return;
              if (relate.enabled && !axisInd && book !== "dca") {
                const key = completeStrategyConfigSampleKey(entryRel);
                if (key) {
                  const decisionKey = JSON.stringify([key, lv.slDist / lv.tpDist]);
                  let plan = relatePlans.get(decisionKey);
                  if (!plan) {
                    const own = extendOwnSampleHistory(relateRows.get(key) ?? [], historyRows(e, entryRel).filter(eligibleRelate), relate.lastN);
                    const keys = relationSources.length ? deskRelateKeys(entryRel, key) : undefined;
                    plan = planRelate(own.map(row => row.ratio), own.flatMap(row => row.relateTrial && row.tick !== undefined
                      ? [[row.tick, row.relateTrial.step, row.ratio ?? null, row.relateTrial.size]] : []),
                    e.tick, lv.slDist, lv.tpDist, relate, source => {
                      if (!keys) return undefined;
                      const relation = keys[source];
                      const cached = relationEvidence.get(relation);
                      if (cached) return cached;
                      const rows = relationRows.get(relation);
                      if (!rows?.length) return undefined;
                      const evidence: RelateEvidence = {returns: rows.map(row => row.ratio), trials: rows.flatMap(row => {
                        const trial = row.relateRelationTrials?.[source];
                        return trial && row.tick !== undefined ? [[row.tick, trial.step, row.ratio ?? null, trial.size]] : [];
                      })};
                      relationEvidence.set(relation, evidence);
                      return evidence;
                    });
                    relatePlans.set(decisionKey, plan);
                  }
                  relateMultiplier = plan.multiplier;
                  relateTrial = plan.trial;
                  relateRelationTrials = plan.relationTrials;
                }
              }
            }
            const qty = unscaledQty * relateMultiplier;
            queueOrder(e, {
              ...(relateMultiplier > 1 ? { relateMultiplier } : {}),
              ...(relateTrial && {relateTrial}),
              ...(relateRelationTrials && {relateRelationTrials}),
              id: nextId(e, "q"),
              connId,
              symbol: s.id,
              side,
              type: ladderOrderType(e.orderType, li),
              qty,
              filled: 0,
              price: px,
              remaining: qty,
              status: "queued",
              rangeType: hi.rangeType,
              level: li + 1,
              sl: lv.sl,
              tp: lv.tp,
              slDist: lv.slDist,
              tpDist: lv.tpDist,
              batchId: "",
              note: `${tac} ${hi.rangeType} ${ind} L${li + 1}${comboKey ? ` ${comboKey}` : ""} · ${connId}`,
              indication: ind,
              kind,
              playbook: book,
              tactic: tac,
              validExec: entryValid,
              tpAtr: miniTp,
              slOfTp: miniSl,
              trailPct,
              trailingDistance,
              priceStopPct: protection?.priceStopPct,
              priceTrailPct: protection?.priceTrailPct,
              maxHoldTicks: protection?.maxHoldTicks,
              minimalRange: minimalOn,
              microRange: microOn,
              shortRange: short,
              calc: leg.kind,
            });
            if (e.completeSim && paperMode(e) && axisInd && short && e.strategyToggles?.block !== false) {
              queueOrder(e, {
                id: nextId(e, "q"),
                connId,
                symbol: s.id,
                side,
                type: "limit",
                qty:qty*additionalLaneVolumeFactor(e.relationalVolumeRatios,{tactic:tac,playbook:book},"block"),
                filled: 0,
                price: px,
                remaining:qty*additionalLaneVolumeFactor(e.relationalVolumeRatios,{tactic:tac,playbook:book},"block"),
                status: "queued",
                rangeType: hi.rangeType,
                level: 1,
                sl: lv.sl,
                tp: lv.tp,
                slDist: lv.slDist,
                tpDist: lv.tpDist,
                batchId: "",
                note: `ax-add ${hi.rangeType} ${ind} · ${connId}`,
                indication: ind,
                kind: "block",
                playbook: "block",
                tactic: "axis",
                validExec: entryValid,
                tpAtr: miniTp,
                slOfTp: miniSl,
                trailPct,
                trailingDistance,
                priceStopPct: protection?.priceStopPct,
                priceTrailPct: protection?.priceTrailPct,
                maxHoldTicks: protection?.maxHoldTicks,
                minimalRange: minimalOn,
                microRange: microOn,
                shortRange: short,
                modelRtCost: modeledPositionCost(e, s.id),
                minSlDistancePct: normalizeMinSlDistancePct(e.minSlDistancePct),
                ...(microOn ? {
                  microMinSlDistancePct: e.microMinSlDistancePct,
                  microMinTrailDistancePct: e.microMinTrailDistancePct,
                } : {}),
                calc: leg.kind,
              });
              qn += 1;
              noteLoad(s.id);
              tacLoad.set(tac, (tacLoad.get(tac) || 0) + 1);
              symTac.set(`${s.id}:${tac}`, (symTac.get(`${s.id}:${tac}`) || 0) + 1);
              countPlaced(e);
            }
            noteCalcPlace(e, leg.kind);
            qn += 1;
            fresh += 1;
            noteLoad(s.id);
            tacLoad.set(tac, (tacLoad.get(tac) || 0) + 1);
            symTac.set(`${s.id}:${tac}`, (symTac.get(`${s.id}:${tac}`) || 0) + 1);
            countPlaced(e);
            if (li === 0 && pfCoordOn(e, "pairAdd") && livePace) {
              const pairIdentity = { ...execRel, connId, calc: leg.kind, tpAtr: miniTp, slOfTp: miniSl, trailPct,
                trailingDistance, priceStopPct: protection?.priceStopPct, priceTrailPct: protection?.priceTrailPct,
                maxHoldTicks: protection?.maxHoldTicks, microRange: microOn, minimalRange: minimalOn, shortRange: short,
                modelRtCost: modeledPositionCost(e, s.id), minSlDistancePct: normalizeMinSlDistancePct(e.minSlDistancePct),
                ...(microOn ? { microMinSlDistancePct: e.microMinSlDistancePct, microMinTrailDistancePct: e.microMinTrailDistancePct } : {}) };
              const pk = pairCoordinationKey(pairIdentity);
              let row = pairBook.get(pk);
              if (!row) {
                row = {
                  inds: new Set(),
                  connId,
                  symbol: s.id,
                  side,
                  px,
                  qty,
                  sl: lv.sl,
                  tp: lv.tp,
                  slDist: lv.slDist,
                  tpDist: lv.tpDist,
                  rangeType: hi.rangeType,
                  indication: ind,
                  kind,
                  playbook: book,
                  tactic: tac,
                  validExec: entryValid,
                  tpAtr: miniTp,
                  slOfTp: miniSl,
                  trailPct,
                  trailingDistance,
                  priceStopPct: protection?.priceStopPct,
                  priceTrailPct: protection?.priceTrailPct,
                  maxHoldTicks: protection?.maxHoldTicks,
                  calc: leg.kind,
                  microRange: microOn,
                  minimalRange: minimalOn,
                  shortRange: short,
                  modelRtCost: pairIdentity.modelRtCost,
                  minSlDistancePct: pairIdentity.minSlDistancePct,
                  microMinSlDistancePct: pairIdentity.microMinSlDistancePct,
                  microMinTrailDistancePct: pairIdentity.microMinTrailDistancePct,
                };
                pairBook.set(pk, row);
              }
              row.inds.add(ind);
            }
            addedLegs.add(legKey);
          });
          for (const key of addedLegs) busyLegs.add(key);
          }
          if (!complete && !comboKey) busy.add(s.id);
        }
      }
      }
    }
    if (pfCoordOn(e, "pairAdd") && livePace) {
      for (const [pk, row] of pairBook) {
        if (row.inds.size < 2 || qn >= qStop) continue;
        const sym = row.symbol;
        const side = row.side;
        if (e.queue.some((o) => o.connId === connId && o.note.includes("pf-pair") && pairCoordinationKey(o) === pk)) continue;
        const px = row.px;
        if (!(px > 0)) continue;
        const qty = row.qty;
        queueOrder(e, {
          id: nextId(e, "q"),
          connId,
          symbol: sym,
          side,
          type: e.orderType === "market" ? "market" : "limit",
          qty,
          filled: 0,
          price: px,
          remaining: qty,
          status: "queued",
          rangeType: row.rangeType,
          level: 1,
          sl: row.sl,
          tp: row.tp,
          slDist: row.slDist,
          tpDist: row.tpDist,
          batchId: "",
          note: `pf-pair ${[...row.inds].slice(0, 3).join("+")} · ${connId}`,
          indication: row.indication,
          kind: row.kind,
          playbook: row.playbook,
          tactic: row.tactic,
          validExec: row.validExec,
          tpAtr: row.tpAtr,
          slOfTp: row.slOfTp,
          trailPct: row.trailPct,
          trailingDistance: row.trailingDistance,
          priceStopPct: row.priceStopPct,
          priceTrailPct: row.priceTrailPct,
          maxHoldTicks: row.maxHoldTicks,
          calc: row.calc,
          microRange: row.microRange,
          minimalRange: row.minimalRange,
          shortRange: row.shortRange,
          modelRtCost: row.modelRtCost,
          minSlDistancePct: row.minSlDistancePct,
          microMinSlDistancePct: row.microMinSlDistancePct,
          microMinTrailDistancePct: row.microMinTrailDistancePct,
        });
        qn += 1;
        noteLoad(sym);
        countPlaced(e);
        notePfCoord(e, "pair");
      }
    }
  };
  // Closed-candle onsets expire before a later discovery pass can recover them.
  // Prioritize their discovery while retaining the original volume rank and gates.
  if (!gated0 && sourceOnsets.size) {
    universe.forEach((s, rank) => { if (sourceOnsets.has(s.id)) armSymbol(s, rank); });
    universe.forEach((s, rank) => { if (!sourceOnsets.has(s.id)) armSymbol(s, rank); });
  } else universe.forEach(armSymbol);
  e.lastMsg = `Queued ${qn} ladder orders on ${connId} · ${universe.length} symbols${complete ? " · complete inds" : " best-first"} · ${e.orderType}`;
}
function ladderOrderType(orderType: OrderTypeId, level: number): OrderTypeId {
  if (orderType === "market") return "market";
  if (level === 0 && (orderType === "stop" || orderType === "stop_limit" || orderType === "trailing_stop")) return "market";
  return orderType;
}
function refill(e: VstEngine) {
  const min = VST_RATE_PER_SEC;
  const paper = paperMode(e);
  const burst = paper ? Math.max(VST_RATE_BURST, 80) : VST_RATE_BURST;
  for (const id of Object.keys(e.tokens)) {
    let queued = 0;
    for (const o of e.queue) if (o.connId === id) queued += 1;
    const dyn = queued > 120 ? min * 2 : queued > 40 ? Math.round(min * 1.5) : min;
    const add = paper ? Math.max(min, dyn, 40) : Math.max(min, Math.min(burst, dyn));
    e.tokens[id] = Math.min(burst, (e.tokens[id] ?? 0) + add);
  }
}
function processBatches(e: VstEngine) {
  const byConn: Record<string, LiveOrder[]> = {};
  for (const o of e.queue) {
    if (!ownedByDesk(o, e.activeConnId)) continue;
    (byConn[o.connId] ??= []).push(o);
  }
  const keep: LiveOrder[] = e.queue.filter((o) => !ownedByDesk(o, e.activeConnId));
  const workMax = maxWorking(e);
  const qMax = maxQueue(e);
  const batch = paperMode(e) ? 80 : VST_BATCH_SIZE;
  for (const [connId, list] of Object.entries(byConn)) {
    let rest = list;
    const blockFirst = rest.filter((o) => /Block/i.test(o.note || ""));
    if (blockFirst.length) rest = blockFirst.concat(rest.filter((o) => !/Block/i.test(o.note || "")));
    let evicted = 0;
    while (rest.length && (e.tokens[connId] ?? 0) >= 1) {
      if (e.orders.length >= workMax) {
        const nextBlock = evicted < 12 && /Block/i.test(rest[0]?.note || "");
        const evictAt = nextBlock ? e.orders.findIndex((o) => !/Block/i.test(o.note || "") && (o.status === "open" || o.status === "partial")) : -1;
        if (evictAt >= 0) {
          markTerminal(e, e.orders[evictAt]!, "cancelled");
          e.orders.splice(evictAt, 1);
          evicted += 1;
        } else {
          keep.push(...rest);
          rest = [];
          e.ledger.capRejects += 1;
          break;
        }
      }
      const room = workMax - e.orders.length;
      const take = rest.slice(0, Math.min(batch, room));
      rest = rest.slice(take.length);
      e.tokens[connId] = (e.tokens[connId] ?? 0) - 1;
      const batchId = nextId(e, "b");
      take.forEach((o) => {
        o.status = "open";
        o.batchId = o.batchId && o.batchId.includes(":") ? o.batchId : `${connId}:${batchId}`;
        e.orders.push(o);
      });
      e.batches.unshift({
        id: batchId,
        connId,
        count: take.length,
        tick: e.tick,
        accepted: take.length,
        rejected: 0,
      });
      if (e.batches.length > VST_MAX_BATCHES) e.batches.length = VST_MAX_BATCHES;
    }
    if (rest.length) {
      e.ledger.rateSkips += 1;
      keep.push(...rest);
    }
  }
  if (keep.length > qMax) {
    const drop = keep.splice(qMax);
    for (const o of drop) markTerminal(e, o, "cancelled");
  }
  e.queue = keep;
}
function walkQuotes(e: VstEngine, freeze?: Set<string>) {
  const active = new Set(universeSymbols(e.symbolCount).map((s) => s.id));
  for (const q of Object.values(e.quotes)) {
    if (active.size && !active.has(q.id)) continue;
    const frozen = freeze?.has(q.id);
    const scale = (frozen ? 0.18 : 1) / Math.sqrt(15);
    const n = rand(e.tick, q.id) - .5;
    const shock = frozen ? 0 : rand(e.tick, q.id + "s") > .992 ? (rand(e.tick, q.id + "k") - .5) * 3 : 0;
    const sigma = Math.max(q.vol * scale, 1e-8);
    const ret = (n * 1.8 + shock) * sigma;
    const open = q.px;
    const close = Math.max(open * (1 + ret), open * 1e-8);
    const span = q.atr * (frozen ? 0.02 : .06 + rand(e.tick, q.id + "w") * .14);
    q.open = open;
    q.lo = Math.min(open, close) - span * rand(e.tick, q.id + "lo");
    q.hi = Math.max(open, close) + span * rand(e.tick, q.id + "hi");
    if (q.lo <= 0) q.lo = close * .5;
    if (q.hi < q.lo) q.hi = q.lo * 1.0001;
    q.px = close;
    q.atr = q.atr * .98 + (q.hi - q.lo) * .02;
    q.axis = q.axis * .985 + q.px * .015;
    if (!frozen) q.chg = ret;
    pushStable02Px(q);
  }
}
export function classifyIndication(e: VstEngine, symbol: string): IndicationId {
  const q = e.quotes[symbol];
  if (q && q.px > 0) refreshLiveIndications({ [symbol]: q });
  const pack = symbolIndications(symbol);
  const extra = Boolean(e.shortRange && e.shortProgress?.enabled !== false);
  const enabled = extra ? e.shortProgress?.indications : (["trend", "break", "active", "direction"] as IndicationId[]);
  const rankedPack: [IndicationId, number][] = (
    [
      ["trend", Math.abs(pack.trend)],
      ["break", Math.abs(pack.break)],
      ["active", Math.abs(pack.active)],
      ["direction", Math.abs(pack.direction)],
      ["move", Math.abs(pack.move ?? 0)],
      ["rsi", Math.abs(pack.rsi ?? 0)],
      ["bollinger", Math.abs(pack.bollinger ?? 0)],
      ["sar", Math.abs(pack.sar ?? 0)],
      ["macd", Math.abs(pack.macd ?? 0)],
      ["ema", Math.abs(pack.ema ?? 0)],
    ] as [IndicationId, number][]
  ).filter(([id]) => !enabled?.length || enabled.includes(id));
  rankedPack.sort((a, b) => b[1] - a[1]);
  if (!q) return (rankedPack[0]?.[1] ?? 0) > 1e-9 ? rankedPack[0]![0] : "trend";
  const atr = Math.max(q.atr, q.px * 0.0008, 1e-9);
  const span = (q.hi - q.lo) / atr;
  const chg = Number.isFinite…37993 tokens truncated…ys).length) {
    if (e.shortRange) return true;
    if (e.preEvalDone && (e.completeSim || e.liveTape)) return false;
    return true;
  }
  const ind = String(rel.indication || "");
  const play = String(rel.playbook || rel.kind || "");
  const tac = String(rel.tactic || "");
  if (play === "block" && (keys.block || keys[`${ind}:block`])) return true;
  if (keys[`${ind}:${play}:${tac}`] || keys[`${ind}:${play}`] || keys[play] || keys[ind]) return true;
  return false;
}

function selectLaneRowsByMinPf(e: VstEngine, rows: { pnl: number; indication?: string; playbook?: string; tactic?: string; qty?: number; blockQty?: number }[]) {
  const expanded: { pnl: number; indication?: string; playbook?: string; tactic?: string }[] = [];
  for (const r of rows) {
    const qty = Math.max(0, Number(r.qty) || 0);
    const bq = Math.min(qty, Math.max(0, Number(r.blockQty) || 0));
    const sh = qty > 1e-12 && bq > 1e-12 ? Math.min(1, bq / qty) : r.playbook === "block" ? 1 : 0;
    const origin = String(r.playbook || "short");
    if (sh > 0 && origin !== "block") {
      expanded.push({ ...r, playbook: origin, pnl: r.pnl * (1 - sh) });
      expanded.push({ ...r, playbook: "block", pnl: r.pnl * sh });
    } else {
      expanded.push({ ...r, playbook: origin });
    }
  }
  const byPlay = new Map<string, typeof expanded>();
  for (const r of expanded) {
    const play = String(r.playbook || "short");
    (byPlay.get(play) ?? (byPlay.set(play, []), byPlay.get(play)!)).push(r);
  }
  const out: typeof expanded = [];
  for (const [play, g] of byPlay) {
    if (g.length < 4) continue;
    const lane = playLaneOf(play, e.shortRange);
    const floor = minPfFor(e, lane);
    if (pfFromPnls(g) + 1e-9 >= floor) {
      out.push(...g);
      continue;
    }
    const byInd = new Map<string, typeof expanded>();
    for (const r of g) {
      const k = String(r.indication || "trend");
      (byInd.get(k) ?? (byInd.set(k, []), byInd.get(k)!)).push(r);
    }
    for (const [, ig] of byInd) {
      if (ig.length >= 4 && pfFromPnls(ig) + 1e-9 >= floor) out.push(...ig);
    }
  }
  return out;
}

export function refreshLiveDisable(e: VstEngine, block: BlockConfig = e.blockCfg ?? DEFAULT_BLOCK_CONFIG) {
  if (block.liveDisable === false) {
    e.liveDisabled = {};
    e.liveHealth = { n: block.liveLastN || 12, at: e.tick, disabled: [], kept: [] };
    return e.liveHealth;
  }
  const n = Math.max(4, Math.min(40, Math.round(block.liveLastN || 12)));
  const overall = activeMinPf(e);
  const minS = Math.max(3, Math.round(block.liveDisableMinSamples || 4));
  const disabled: Record<string, { pf: number; n: number; at: number }> = {};
  const kept: string[] = [];
  if (e.liveTape) {
    for (const [id, t] of Object.entries(e.symbolStats ?? {})) {
      if (!t || t.trades < 2) continue;
      const pf = profitFactor(t.profit, t.loss);
      const key = `sym:${id}`;
      if (pf + 1e-9 < overall) disabled[key] = { pf, n: t.trades, at: e.tick };
      else kept.push(key);
    }
  }
  const liveOnly = Boolean((e.liveTape || e.preEvalDone) && !internAllPhase(e));
  const take = e.closed.filter((c) => deskTapeRow(e, c) && (!liveOnly || c.validExec === true));
  if (e.shortRange) {
    // Independent TP×SL tapes only — never mix 0.50 SL into 1.7, never kill a whole symbol/indication.
    const ln = lastNProgressOf(e);
    const disableNs = (e.lastNCoord?.disableNs?.length ? e.lastNCoord.disableNs : ln.disableNs);
    const tapes = { ...(e.shortComboPreTape ?? {}), ...(e.shortComboTape ?? {}), ...(e.shortComboLiveTape ?? {}) };
    const liveTapes = e.preEvalDone ? (e.shortComboLiveTape ?? e.shortComboTape ?? {}) : tapes;
    for (const [k, rows] of Object.entries(liveTapes)) {
      if (!rows || rows.length < minS) continue;
      const hits = lastNWindows(rows, disableNs);
      const sampled = hits.filter((h) => h.samples >= minS);
      if (!sampled.length) continue;
      const bad = sampled.filter((h) => h.avg < -1e-12);
      const st = comboTapeStats(rows);
      const kill = bad.length === sampled.length && !(st.n >= 8 && st.pf + 1e-9 >= 1 && st.net > 0);
      const key = `combo:${k}`;
      if (kill) disabled[key] = { pf: st.pf, n: st.n, at: e.tick };
      else kept.push(key);
    }
    e.liveDisabled = disabled;
    e.liveHealth = { n, at: e.tick, disabled: Object.keys(disabled), kept: [...new Set(kept)] };
    return e.liveHealth;
  }
  if (take.length >= minS) {
    const groups = new Map<string, { pnl: number }[]>();
    const add = (key: string, pnl: number) => {
      if (!key || key.endsWith(":block") || key === "book:block") return;
      const arr = groups.get(key);
      if (arr) arr.push({ pnl });
      else groups.set(key, [{ pnl }]);
    };
    for (const c of take) {
      const edge = edgePnl(c);
      add(`ind:${c.indication ?? "trend"}`, edge);
      add(`kind:${c.kind ?? "normal"}`, edge);
      add(`tac:${c.tactic ?? e.lastTactic}`, edge);
      add(`rng:${c.rangeType ?? e.lastRange}`, edge);
      add(`book:${c.playbook ?? "normal"}`, edge);
      add(`sym:${c.symbol}`, edge);
      add(comboDisableKey(c, e), edge);
    }
    const ln = lastNProgressOf(e);
    const disableNs = (e.lastNCoord?.disableNs?.length ? e.lastNCoord.disableNs : ln.disableNs);
    const validNs = (e.lastNCoord?.validNs?.length ? e.lastNCoord.validNs : ln.validNs);
    const byAxis = new Map<string, { key: string; pf: number; n: number; avg: number; kill: boolean }[]>();
    const mode = e.lastNCoord?.mode ?? ln.mode;
    for (const [key, rows] of groups) {
      if (rows.length < minS) continue;
      const hits = lastNWindows(rows, disableNs);
      const sampled = hits.filter((h) => h.samples >= minS);
      if (!sampled.length) continue;
      const bad = sampled.filter((h) => h.avg < -1e-12);
      const validHits = lastNWindows(rows, validNs);
      const validPass = validHits.some((h) => h.samples >= h.n && h.pf + 1e-9 >= overall && h.avg >= 0);
      const killDisable = mode === "combined"
        ? bad.length * 2 > sampled.length
        : bad.length === sampled.length;
      const kill = killDisable && !validPass;
      const sc = pfRows(rows.slice(0, sampled[sampled.length - 1]!.n));
      const avg = rows.slice(0, sampled[0]!.n).reduce((s, r) => s + r.pnl, 0) / Math.max(1, sampled[0]!.n);
      const axis = key.split(":")[0] ?? "x";
      const list = byAxis.get(axis) ?? [];
      list.push({ key, pf: sc.pf, n: sampled[sampled.length - 1]!.n, avg, kill });
      byAxis.set(axis, list);
    }
    for (const list of byAxis.values()) {
      list.sort((a, b) => b.pf - a.pf || b.n - a.n);
      for (const x of list) {
        if (e.liveTape && x.key.startsWith("sym:") && kept.includes(x.key)) continue;
        const negative = x.kill;
        if (negative) {
          disabled[x.key] = { pf: x.pf, n: x.n, at: e.tick };
        } else {
          kept.push(x.key);
          delete disabled[x.key];
        }
      }
    }
  }
  e.liveDisabled = disabled;
  if ((e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES).normal === false) {
    e.liveDisabled["kind:normal"] = { pf: 0, n: 99, at: e.tick };
  }
  e.liveHealth = { n, at: e.tick, disabled: Object.keys(e.liveDisabled), kept: [...new Set(kept)].filter((k) => k !== "kind:normal") };
  return e.liveHealth;
}

function comboDisableKey(
  c: { indication?: string; kind?: string; tactic?: string; rangeType?: string; playbook?: string; side?: string; tpAtr?: number; slOfTp?: number },
  e: VstEngine,
) {
  if (c.tpAtr != null && c.slOfTp != null) return `combo:${shortComboKey(c.tpAtr, c.slOfTp)}`;
  return `combo:${c.indication ?? "trend"}:${c.kind ?? "normal"}:${c.tactic ?? e.lastTactic}:${c.rangeType ?? e.lastRange}:${c.playbook ?? "normal"}:${c.side ?? "long"}`;
}

export function liveRelationDisabled(
  e: VstEngine,
  rel: {
    symbol: string;
    side: Side;
    indication?: IndicationId;
  kind?: string;
    tactic?: TacticKind;
    rangeType?: RangeType;
    playbook?: string;
    tpAtr?: number;
    slOfTp?: number;
  },
) {
  if (e.liveTape && (e.liveOpenN ?? 99) < 12) return false;
  const d = e.liveDisabled;
  if (!d || !Object.keys(d).length) return false;
  if (rel.tpAtr != null && rel.slOfTp != null) {
    return Boolean(d[`combo:${shortComboKey(rel.tpAtr, rel.slOfTp)}`]);
  }
  if (e.shortRange) return false;
  const combo =
    rel.indication && rel.kind && rel.tactic && rel.rangeType
      ? comboDisableKey(rel, e)
      : "";
  if (combo) {
    if (d[combo]) return true;
    return false;
  }
  const keys = [
    `sym:${rel.symbol}`,
    `side:${rel.side}`,
    rel.indication ? `ind:${rel.indication}` : "",
    rel.kind && rel.kind !== "normal" ? `kind:${rel.kind}` : "",
    rel.tactic ? `tac:${rel.tactic}` : "",
    rel.rangeType ? `rng:${rel.rangeType}` : "",
    rel.playbook && rel.playbook !== "block" && rel.playbook !== "normal" ? `book:${rel.playbook}` : "",
  ].filter(Boolean);
  return keys.some((k) => Boolean(d[k]));
}

function pruneBlockRelWindows(e: VstEngine, max = 256) {
  const maps = e.blockRelWindows ?? {};
  const keys = Object.keys(maps);
  if (keys.length <= max) return;
  const scored = keys.map((k) => {
    let closed = 0;
    let pause = 0;
    for (const w of Object.values(maps[k] ?? {})) {
      closed += w.closed || 0;
      pause += w.pauseLeft || 0;
    }
    return { k, closed, pause };
  }).sort((a, b) => a.pause - b.pause || a.closed - b.closed);
  for (const x of scored) {
    if (Object.keys(maps).length <= max) break;
    if (x.pause > 0) continue;
    delete maps[x.k];
  }
}

function emptyBlockLane(symbol: string, side: Side, baseQty: number, baseEntry: number): BlockLaneState {
  return {
    symbol,
    side,
    baseQty: Math.max(0, baseQty),
    baseEntry: Math.max(0, baseEntry),
    confirmedAdd: 0,
    satisfied: {},
    countFills: {},
    pfRing: {},
    parentPf: [],
    active: true,
    pauseRemaining: {},
    heldFactor: {},
  };
}

function isBlockOrder(o: LiveOrder) {
  return o.parentPositionId !== undefined || /Block/i.test(o.note || "");
}
function isBlockRelationExtra(o: LiveOrder) {
  return /^Block extra\b/i.test(o.note || "");
}
function blockParent(e: VstEngine, o: LiveOrder): LivePosition | undefined {
  const matches = e.positions.filter((p) => p.qty > 0 && blockTargets(o, p));
  return matches.length === 1 ? matches[0] : undefined;
}
function blockTargets(o: LiveOrder, p: LivePosition): boolean {
  return p.connId === o.connId && p.symbol === o.symbol && p.side === o.side &&
    blockParentId(o) === p.id;
}
function blockParentId(o: LiveOrder): string | undefined {
  if (o.parentPositionId !== undefined) return o.parentPositionId || undefined;
  const legacy = /^(.*):(book|symbol|dir|indication|type|indType):(\d+)$/.exec(o.batchId || "");
  return legacy && Number(legacy[3]) === o.level ? legacy[1] : undefined;
}
function originalParentQty(p: LivePosition): number {
  const first = p.legs[0];
  // A parent entry can have several partial fills. All slices of that original order are its base.
  return first ? p.legs.reduce((n, leg) => n + (leg.orderId === first.orderId ? Math.max(0, leg.qty) : 0), 0)
    : Math.max(0, p.qty - (p.blockQty ?? 0) - (p.dcaQty ?? 0));
}
function isOverallBlockOrder(o: LiveOrder) {
  return /Overall Block/i.test(o.note || "") || /^ob/i.test(o.id || "");
}
type OverallScope = "book" | "symbol" | "dir" | "indication" | "type" | "indType";
function overallScopes(block?: BlockConfig): OverallScope[] {
  if (block?.overall === false) return [];
  const xs: OverallScope[] = ["book"];
  if (block?.overallSymbol !== false) xs.push("symbol");
  if (block?.overallDirection !== false) xs.push("dir");
  if (block?.overallIndication !== false) xs.push("indication");
  if (block?.overallType !== false) xs.push("type");
  if (block?.overallIndicationType !== false) xs.push("indType");
  return xs;
}
function overallScopeOf(o: { note?: string }): OverallScope | null {
  if (!isOverallBlockOrder(o as LiveOrder)) return null;
  const n = o.note || "";
  if (/Overall Block indication type/i.test(n)) return "indType";
  if (/Overall Block symbol/i.test(n)) return "symbol";
  if (/Overall Block indication/i.test(n)) return "indication";
  if (/Overall Block type/i.test(n)) return "type";
  if (/Overall Block dir/i.test(n)) return "dir";
  return "book";
}
function emptyOvLevels(): Record<OverallScope, Set<number>> {
  return { book: new Set(), symbol: new Set(), dir: new Set(), indication: new Set(), type: new Set(), indType: new Set() };
}
function emptyOvQty(): Record<OverallScope, number> {
  return { book: 0, symbol: 0, dir: 0, indication: 0, type: 0, indType: 0 };
}
function openScopePf(
  e: VstEngine,
  scope: OverallScope,
  p: { symbol: string; side: Side; indication?: string; tactic?: string },
) {
  let profit = 0;
  let loss = 0;
  let n = 0;
  for (const x of e.positions) {
    if (x.qty <= 0) continue;
    if (scope === "symbol" && x.symbol !== p.symbol) continue;
    if (scope === "dir" && x.side !== p.side) continue;
    if (scope === "indication" && (x.indication || "") !== (p.indication || "")) continue;
    if (scope === "type" && (x.tactic || "") !== (p.tactic || "")) continue;
    if (scope === "indType" && ((x.indication || "") !== (p.indication || "") || (x.tactic || "") !== (p.tactic || ""))) continue;
    const u = Number(x.unrealized) || 0;
    if (u > 0) profit += u;
    else if (u < 0) loss += Math.abs(u);
    n += 1;
  }
  if (!n) return 0;
  if (loss <= 1e-12) return profit > 0 ? 4 : 0;
  return profitFactor(profit, loss);
}

function overallWindowOk(
  e: VstEngine,
  scope: OverallScope,
  p: { symbol: string; side: Side; indication?: string; tactic?: string },
  next: number,
  minPf: number,
) {
  if (internAllPhase(e)) return true;
  if (e.blockCfg?.windows === false) return true;
  const need = Math.max(8, next);
  const strict = completeOpenTape(e) || performingLive(e);
  const floor = strict
    ? next <= 1
      ? 1.45
      : 1.3
    : next <= 1
      ? Math.max(1.15, Math.min(minPf || 1.2, 1.25))
      : Math.max(1.05, Math.min(minPf || 1.05, 1.2));
  const pass = (w?: { closed?: number; lastPf?: number }) => {
    if (w && (w.closed || 0) >= need) return (Number(w.lastPf) || 0) + 1e-9 >= floor;
    if (strict && next > 1) return false;
    // Overall and future keep indication and type coverage until that scope has a
    // full window. A thin lane or config is not dropped. A full window still clears PF.
    if (!e.liveTape) return true;
    let n = 0;
    for (const x of e.positions) {
      if (x.qty <= 0) continue;
      if (scope === "symbol" && x.symbol !== p.symbol) continue;
      if (scope === "dir" && x.side !== p.side) continue;
      if (scope === "indication" && (x.indication || "") !== (p.indication || "")) continue;
      if (scope === "type" && (x.tactic || "") !== (p.tactic || "")) continue;
      if (scope === "indType" && ((x.indication || "") !== (p.indication || "") || (x.tactic || "") !== (p.tactic || ""))) continue;
      n += 1;
    }
    if (n < 4) return true;
    return openScopePf(e, scope, p) + 1e-9 >= floor;
  };
  if (scope === "book") {
    if (!e.liveTape) return blockCountPositive(e, next, minPf);
    const w = e.blockWindows?.[next];
    return pass(w);
  }
  if (scope === "symbol") return pass(e.blockWindowsBySymbol?.[p.symbol]?.[next]);
  if (scope === "dir") return pass(e.blockWindowsBySide?.[p.side]?.[next]);
  if (scope === "indication") {
    if (!p.indication) return false;
    return pass(e.blockWindowsByIndication?.[p.indication]?.[next]);
  }
  if (scope === "indType") {
    if (!p.indication || !p.tactic) return false;
    return pass(e.blockWindowsByIndicationType?.[`${p.indication}:${p.tactic}`]?.[next]);
  }
  if (!p.tactic) return false;
  return pass(e.blockWindowsByType?.[p.tactic]?.[next]);
}

function collectBlockOrders(e: VstEngine, conn: string) {
  return [
    ...e.queue.filter((o) => o.connId === conn && isBlockOrder(o)),
    ...e.orders.filter((o) => o.connId === conn && isBlockOrder(o) && (o.status === "open" || o.status === "partial" || o.status === "queued")),
  ];
}

function syncBlockParents(e: VstEngine, conn: string, block?: BlockConfig) {
  e.blockLanes = e.blockLanes ?? {};
  const activeParents = new Set(e.positions.filter((p) => p.qty > 0).map((p) => p.id));
  const modes = liveVolumeModes(block ?? e.blockCfg);
  for (const p of e.positions) {
    if (p.connId !== conn || p.qty <= 0) continue;
    p.protectionKey ??= geometryKey(p);
    const first = originalParentQty(p);
    for (const mode of modes) {
      const k = blockLaneKey(p, mode);
      let lane = e.blockLanes[k];
      if (!lane) {
        lane = emptyBlockLane(p.symbol, p.side, first, p.avgEntry);
        lane.parentPositionId = p.id;
        e.blockLanes[k] = lane;
      }
      blockCountFills(lane);
      // Ambiguous duplicate episodes may not share live pending/satisfied state.
      if (lane.parentPositionId && lane.parentPositionId !== p.id && lane.active && activeParents.has(lane.parentPositionId)) continue;
      if (!lane.active || lane.baseQty <= 0 || lane.parentPositionId !== p.id) {
        lane.active = true;
        lane.parentPositionId = p.id;
        lane.baseQty = first;
        lane.baseEntry = p.avgEntry;
        lane.confirmedAdd = 0;
        lane.satisfied = {};
        lane.countFills = {};
        lane.pending = undefined;
        lane.settledPnl = 0;
        lane.settledNotional = 0;
        lane.settledUnknown = false;
        // Keep pauseRemaining + pfRing — they are the live Block gate across parents.
        continue;
      }
      // Later slices of the original entry may complete it; strategy additions never become new base volume.
      lane.baseQty = Math.max(lane.baseQty, first);
    }
  }
  for (const lane of Object.values(e.blockLanes)) {
    if (!lane.parentPositionId || !activeParents.has(lane.parentPositionId)) lane.active = false;
  }
}

function blockCountFills(lane: BlockLaneState) {
  // Previous snapshots mixed parent results among counts and volume modes.
  if (!lane.countFills) {
    lane.countFills = {};
    lane.pfRing = {};
  }
  return lane.countFills;
}

function recordBlockFill(e: VstEngine, o: LiveOrder, take: number, px: number, p: LivePosition) {
  if (!isBlockOrder(o)) return;
  if (isOverallBlockOrder(o) || isBlockRelationExtra(o)) return;
  e.blockLanes = e.blockLanes ?? {};
  const mode = blockModeOf(o);
  const k = blockLaneKey(p, mode);
  const lane = e.blockLanes[k];
  if (!lane || lane.parentPositionId !== p.id) return;
  lane.confirmedAdd += take;
  const n = o.level;
  if (!Number.isInteger(n) || n < 1 || n > 6) return;
  const fill = (blockCountFills(lane)[n] ??= { qty: 0, notional: 0, pnl: 0, settledNotional: 0 });
  fill.qty += take;
  fill.notional += take * px;
  const cfg = e.blockCfg ?? DEFAULT_BLOCK_CONFIG;
  const vr = mode === "shared" ? clampSharedVol(cfg.sharedVolumeRatio) : clampBlockVol(cfg.volumeRatio);
  const maxMul = clampMaxVolumeMul(cfg.maxVolumeMultiplier ?? DEFAULT_MAX_VOLUME_MULTIPLIER);
  const extraCap = Math.max(0, maxMul - 1);
  const target =
    lane.baseQty *
    (mode === "shared" ? blockMaxAdditionalRatio(n, vr, maxMul, mode) : Math.min(n * vr, extraCap));
  const done = o.remaining <= 1e-12;
  if (done) {
    if (lane.confirmedAdd + 1e-12 >= target) lane.satisfied[n] = true;
    if (lane.pending === n) lane.pending = undefined;
  } else {
    lane.pending = n;
  }
}

function recordBlockClose(e: VstEngine, p: LivePosition, ratio: number, exit: number, final = true, notional = p.qty * p.avgEntry) {
  const block = e.blockCfg ?? DEFAULT_BLOCK_CONFIG;
  const keep = block.keepAdjusted === true;
  const need = clampSetBlockSamples(block.setBlockPauseLastN, 12);
  for (const mode of ["shared", "additive"] as const) {
    const k = blockLaneKey(p, mode);
    const lane = e.blockLanes?.[k];
    if (!lane || !lane.active || lane.parentPositionId !== p.id) continue;
    const countFills = blockCountFills(lane);
    for (const fill of Object.values(countFills)) {
      if (!(fill.qty > 0 && fill.notional > 0)) continue;
      const pnl = closePnl(p.side === "long" ? 1 : -1, fill.notional / fill.qty, exit, fill.qty,
        p.modelRtCost ?? modeledPositionCost(e, p.symbol));
      fill.pnl = fill.pnl !== null && Number.isFinite(fill.pnl + pnl) ? fill.pnl + pnl : null;
      fill.settledNotional += fill.notional;
      fill.qty = 0;
      fill.notional = 0;
    }
    const slicePnl = ratio * notional;
    if (!Number.isFinite(ratio) || !Number.isFinite(notional) || !(notional > 0) || !Number.isFinite(slicePnl)) {
      lane.settledUnknown = true;
    } else {
      lane.settledPnl = (lane.settledPnl ?? 0) + slicePnl;
      lane.settledNotional = (lane.settledNotional ?? 0) + notional;
      if (!Number.isFinite(lane.settledPnl) || !Number.isFinite(lane.settledNotional)) {
        lane.settledUnknown = true;
        lane.settledPnl = 0; lane.settledNotional = 0;
      }
    }
    // Peeling only the overlay does not end the parent, advance Last-N or consume a pause.
    if (!final) continue;
    const frac = lane.settledUnknown || !(lane.settledNotional! > 0)
      ? null : lane.settledPnl! / lane.settledNotional!;
    for (const count of Object.keys(lane.pauseRemaining)) {
      const n = Number(count);
      lane.pauseRemaining[n] = Math.max(0, (lane.pauseRemaining[n] || 0) - 1);
    }
    for (const [key, fill] of Object.entries(countFills)) {
      if (!(fill.settledNotional > 0)) continue;
      const n = Number(key);
      const net = fill.pnl === null ? null : fill.pnl / fill.settledNotional;
      (lane.pfRing[n] ??= []).push(net !== null && Number.isFinite(net) ? net : null);
      if (lane.pfRing[n]!.length > 75) lane.pfRing[n] = lane.pfRing[n]!.slice(-75);
      const ring = (lane.pfRing[n] ?? []).slice(-need);
      if (ring.length >= need) {
        const pf = blockRingPf(ring);
        if (pf < 1.05 && !keep) lane.pauseRemaining[n] = Math.max(lane.pauseRemaining[n] || 0, n);
      }
    }
    lane.parentPf.push(frac);
    if (lane.parentPf.length > 75) lane.parentPf = lane.parentPf.slice(-75);
    lane.active = false;
    lane.baseQty = 0;
    lane.confirmedAdd = 0;
    lane.pending = undefined;
    lane.satisfied = {};
    lane.countFills = {};
    lane.settledPnl = 0;
    lane.settledNotional = 0;
    lane.settledUnknown = false;
  }
}

function blockRingPf(ring: readonly (number | null)[]): number {
  let gp = 0, gl = 0;
  for (const x of ring) {
    if (typeof x !== "number" || !Number.isFinite(x)) return 0;
    if (x > 0) gp += x; else gl -= x;
  }
  return profitFactor(gp, gl);
}

const blockOvCache = new WeakMap<VstEngine, { tick: number; stamp: string; n: number; pf: number }>();

export function blockOverlayStats(e: VstEngine): { n: number; pf: number } {
  const stamp = `${e.activeConnId}:${e.preEvalDone}:${e.liveTape}:${e.closed.length}:${e.closed[0]?.id || ""}`;
  const hit = blockOvCache.get(e);
  if (hit && hit.tick === e.tick && hit.stamp === stamp) return hit;
  let gp = 0;
  let gl = 0;
  let n = 0;
  let unknown = false;
  for (const c of e.closed) {
    if (n >= 60) break;
    if (c.protect || c.connId !== e.activeConnId) continue;
    if ((e.preEvalDone || e.liveTape) && c.validExec !== true) continue;
    const sh = blockOverlayShare(c.qty ?? 0, c.blockQty, c.playbook);
    if (!(sh > 0)) continue;
    n += 1;
    // Every measured close, including flat/tiny losses, occupies its own window slot.
    // A legacy cash PnL cannot stand in for missing unit-return evidence.
    if (typeof c.ratio !== "number" || !Number.isFinite(c.ratio)) { unknown = true; continue; }
    const edge = c.ratio * sh;
    if (!Number.isFinite(edge)) { unknown = true; continue; }
    if (edge > 0) gp += edge;
    else gl -= edge;
  }
  const row = { tick: e.tick, stamp, n, pf: unknown ? 0 : profitFactor(gp, gl) };
  blockOvCache.set(e, row);
  return row;
}

function blockCountPositive(e: VstEngine, n: number, minPf: number, ownWindow = e.blockWindows?.[n]) {
  if (n < 1 || n > 6) return false;
  if (internAllPhase(e)) return true;
  const w = ownWindow;
  const need = Math.max(8, n);
  const strict = completeOpenTape(e) || performingLive(e);
  const floor = strict
    ? n <= 1
      ? 1.45
      : 1.3
    : n <= 1
      ? Math.max(1.15, Math.min(minPf || 1.2, 1.25))
      : Math.max(1.05, Math.min(minPf || 1.05, 1.2));
  if (!w || w.closed < need) {
    if (strict && n > 1) return false;
    if (!e.liveTape) return true;
    const openN = e.positions.filter((x) => x.qty > 0).length;
    if (openN < 4) return true;
    const openFloor = n <= 1 ? Math.max(1.15, Math.min(minPf || 1.2, 1.25)) : Math.max(1.05, minPf || 1.05);
    return openScopePf(e, "book", { symbol: "", side: "long" }) + 1e-9 >= openFloor;
  }
  return w.lastPf + 1e-9 >= floor;
}

/** A complete parent uses its own full count window once one exists.
 * Until then, retain the established pooled discovery behavior. */
function blockParentCountWindow(e: VstEngine, p: LivePosition, n: number) {
  const exactKey = blockRelationKeys({ ...p, rangeType: p.controllingRange }).find((key) => key.startsWith("cfg:"));
  return exactKey ? e.blockRelWindows?.[exactKey]?.[n] : undefined;
}

function blockParentCountPositive(e: VstEngine, p: LivePosition, n: number, minPf: number) {
  const own = blockParentCountWindow(e, p, n);
  return own && own.closed >= Math.max(8, n)
    ? blockCountPositive(e, n, minPf, own)
    : blockCountPositive(e, n, minPf);
}

function blockPfOk(
  lane: BlockLaneState,
  count: number,
  block: BlockConfig,
  minPf: number,
  volumeIncrement = clampBlockVol(block.volumeRatio) * Math.max(1, count),
) {
  if ((lane.pauseRemaining[count] || 0) > 0) {
    return false;
  }
  if (minPf <= 0) return true;
  const need = clampSetBlockSamples(block.setBlockLastN, 8);
  const ring = (lane.pfRing[count] ?? []).slice(-need);
  if (ring.some((x) => typeof x !== "number" || !Number.isFinite(x))) return false;
  if (ring.length < need) return true;
  const pf = blockRingPf(ring);
  const floor = Math.max(minPf, blockMinimumProfitFactor(minPf, block.pfRatio || 1.25, volumeIncrement) || minPf);
  if (pf + 1e-9 < floor) {
    if (block.keepAdjusted) {
      lane.heldFactor[count] = 1;
      return false;
    }
    lane.heldFactor[count] = count;
    const pauseN = Math.max(1, Math.round((block.pauseCountRatio ?? 2) * count));
    lane.pauseRemaining[count] = pauseN;
    return false;
  }
  lane.heldFactor[count] = 1;
  return true;
}
export { blockPfOk };

export function collectActiveOrderBlocks(e: VstEngine, connId?: string) {
  const conn = connId && isDeskConn(connId) ? connId : e.activeConnId;
  const live = collectBlockOrders(e, conn);
  const map = new Map<string, LiveOrder[]>();
  for (const o of live) {
    const k = JSON.stringify([o.connId, o.symbol, o.side, blockParentId(o) ?? o.batchId, blockModeOf(o)]);
    const arr = map.get(k);
    if (arr) arr.push(o);
    else map.set(k, [o]);
  }
  return [...map.entries()].map(([k, orders]) => {
    const { symbol, side } = orders[0];
    return { id: k, symbol, side, orders, multiple: orders.length };
  });
}

function blockProveScale(e: VstEngine, next: number, p?: LivePosition): number {
  if (!(completeOpenTape(e) || performingLive(e))) return 1;
  if (e.blockCfg?.windows === false) return 1;
  const need = Math.max(8, next);
  const own = p ? blockParentCountWindow(e, p, next) : undefined;
  const w = own && own.closed >= need ? own : e.blockWindows?.[next];
  const pf = w && (w.closed || 0) >= need ? Number(w.lastPf) || 0 : 0;
  if (pf >= 1.8) return 1;
  if (pf >= 1.35) return 0.7;
  return 0.4;
}

/** Hour, bank, and lane-cool have to agree before another Block add. Pair and win-again stay on their own paths. */
function blockCoordsAllow(e: VstEngine, p: LivePosition, move: number): boolean {
  if (!(completeOpenTape(e) || performingLive(e))) return true;
  if (e.blockCfg?.windows === false) return true;
  if (pfCoordOn(e, "laneCool") && laneCooled(e, p)) return false;
  if (pfCoordOn(e, "hourKeep")) {
    const bag = hourLaneOf(e, blockHourLaneKey(p));
    if (bag.p + bag.l > 1e-6) {
      const pf = profitFactor(bag.p, bag.l);
      if (pf + 1e-9 < STABLE_HOUR_PF) return false;
    }
  }
  if (pfCoordOn(e, "bankWin")) {
    const tpFrac = p.avgEntry > 0 && p.tpDist > 0 ? p.tpDist / p.avgEntry : 0.004;
    if (!(move >= Math.max(0.0004, tpFrac * 0.2))) return false;
  }
  return true;
}

export function adjustActiveBlocks(
  e: VstEngine,
  cfg: TacticConfig,
  tactic: TacticKind,
  block: BlockConfig = DEFAULT_BLOCK_CONFIG,
  rangeType?: RangeType,
  opts?: { endStage?: boolean },
): BlockAdjustResult {
  const empty: BlockAdjustResult = { cancelled: 0, added: 0, flattened: 0, blocks: 0 };
  const toggles = e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
  const tacticOn = Boolean(toggles.block) && block.enabled !== false;
  // Block tactic stays off. Overall still sizes the book when that scope is on and the tactic is disabled.
  const overallOnly = !tacticOn && block.overall !== false && block.enabled === false && toggles.block === false;
  if (!tacticOn && !overallOnly) return empty;
  if (!overallOnly && !block.enabled) return empty;
  if (block.endStageOnly && !opts?.endStage) return empty;
  const conn = isDeskConn(e.activeConnId) ? e.activeConnId : VST_DEFAULT_CONN;
  let cancelled = 0;
  let added = 0;
  let flattened = 0;
  const maxM = Math.max(1, Math.round(block.maxMultiple));
  const minM = Math.max(1, Math.round(block.minMultiple));
  let blocks = collectActiveOrderBlocks(e, conn);
  const queued = new Set(e.queue);

  const dropOrder = (o: LiveOrder) => {
    if (!isBlockOrder(o)) return;
    if (queued.has(o)) {
      queued.delete(o);
      e.queue = e.queue.filter((x) => x !== o);
      markTerminal(e, o, "cancelled");
      cancelled += 1;
      return;
    }
    if (o.status === "open" || o.status === "partial" || o.status === "queued") {
      markTerminal(e, o, "cancelled");
      cancelled += 1;
    }
  };

  if (block.flattenConflict && block.sides !== "both" && block.sides !== "mixed") {
    const bySym = new Map<string, { long: typeof blocks; short: typeof blocks }>();
    for (const b of blocks) {
      const row = bySym.get(b.symbol) ?? { long: [], short: [] };
      row[b.side].push(b);
      bySym.set(b.symbol, row);
    }
    for (const [sym, sides] of bySym) {
      if (!sides.long.length || !sides.short.length) continue;
      let longU = 0;
      let shortU = 0;
      for (const p of e.positions) {
        if (p.connId !== conn || p.symbol !== sym) continue;
        if (p.side === "long") longU += p.unrealized;
        else shortU += p.unrealized;
      }
      const victim = longU <= shortU ? sides.long : sides.short;
      for (const group of victim) for (const o of group.orders) dropOrder(o);
      flattened += 1;
    }
    if (flattened) blocks = collectActiveOrderBlocks(e, conn);
  }

  for (const b of blocks) {
    // maxMultiple bounds the configured step. Relation/scoped Overall orders at
    // the same step are independent streams, not additional step numbers.
    for (const o of b.orders) if (Math.max(1, o.level || 1) > maxM) dropOrder(o);
  }

  syncBlockParents(e, conn, block);
  const counts = liveBlockCounts(block);
  const iv = intervalCfg(e);
  const ivScale = iv.enabled && iv.scaleVol ? intervalVolumeScale(e) : 1;
  const blkScale = iv.enabled && iv.scaleVol ? blockIntervalScale(e) : 1;
  e.intervalVolScale = ivScale;
  e.intervalPf = lastIntervalStats(e).pf;
  const vrRel = clampBlockVol(block.volumeRatio) * blkScale;
  const vrShared = clampSharedVol(block.sharedVolumeRatio ?? DEFAULT_SHARED_BLOCK_VOLUME_RATIO) * blkScale;
  const vrOv = clampOverallVol(block.overallVolumeRatio ?? DEFAULT_OVERALL_BLOCK_VOLUME_RATIO) * blkScale;
  const maxMul = clampMaxVolumeMul(block.maxVolumeMultiplier ?? DEFAULT_MAX_VOLUME_MULTIPLIER);
  const minPf = internAllPhase(e) ? 0 : (block.minRelPf ?? minPfFor(e, "block"));
  const evalN = Math.min(16, Math.max(1, Math.round(block.evalPosCount || 6)));
  const overall = block.overall !== false;
  const overallPause = !overall && block.windows !== false && blockPosPaused(e, evalN);
  const volModes = liveVolumeModes(block);
  const overlay = block.windows !== false && (e.liveTape || performingLive(e)) ? blockOverlayStats(e) : null;
  const overlayOff = Boolean(overlay && overlay.n >= 16 && overlay.pf + 1e-9 < 0.9);

  // Last-N / relation PF / indication sets must be current before Overall Block sizes extra volume.
  if ((e.lastRelEvalTick || 0) !== e.tick && (e.progressEval?.at || 0) !== e.tick) {
    if (block.autoEval !== false && !(e.lastRelEvalTick)) evalBlockRelations(e, block);
    else refreshProgressEvals(e, block);
  }

  if (block.stack !== false && (e.liveTape || e.completeSim || completeOpenTape(e) || performingLive(e) || e.queue.filter((o) => o.connId === conn && !isBlockOrder(o)).length < maxQueue(e) - 2)) {
    let adds = 0;
    const addCap = Math.min(
      maxQueue(e) - 8,
      Math.max(counts.length * volModes.length * Math.max(8, e.positions.length), 48),
    );
    const blockByLeg = new Map<string, LiveOrder[]>();
    const rememberBlock = (o: LiveOrder) => {
      const k = `${o.symbol}\0${o.side}`;
      const row = blockByLeg.get(k);
      if (row) row.push(o);
      else blockByLeg.set(k, [o]);
    };
    for (const o of collectBlockOrders(e, conn)) rememberBlock(o);
    const legBlocks = (p: LivePosition) => (blockByLeg.get(`${p.symbol}\0${p.side}`) ?? []).filter((o) => blockTargets(o, p));
    for (const p of e.positions) {
      if (adds >= addCap) break;
      if (!ownedByDesk(p, conn)) continue;
      if (p.qty <= 0) continue;
      if (overlayOff) continue;
      if (p.indication && e.skipIndications?.includes(p.indication)) continue;
      if (e.preEvalDone && !internAllPhase(e) && !completeOpenTape(e) && p.validExec !== true) continue;
      if (!overall) {
        const allow = symbolSideSet(p.symbol, block.sides, p.side);
        if (!allow.includes(p.side)) continue;
      }
      const move = p.unrealized / Math.max(p.avgEntry * p.qty, 1e-9);
      if (block.addOnWin && move <= 0) continue;
      if (overallPause) continue;
      if (!overall && symbolBlockPaused(e, p.symbol, evalN)) continue;
      const q = e.quotes[p.symbol];
      if (!q || finiteOr(q.vol, 0) < MIN_QUOTE_VOL) continue;
      const mark = q.px > 0 ? q.px : p.mark || p.avgEntry;
      const adverse = p.side === "long"
        ? (p.avgEntry - mark) / Math.max(p.avgEntry, 1e-12)
        : (mark - p.avgEntry) / Math.max(p.avgEntry, 1e-12);
      const stopFrac = p.slDist > 0 && p.avgEntry > 0 ? p.slDist / p.avgEntry : 0.008;
      const liveBook = Boolean(e.liveTape || performingLive(e));
      if (liveBook) {
        if (adverse > 0.0008 || adverse > stopFrac * 0.5) continue;
      } else {
        const stopOk = p.side === "long" ? p.sl < p.avgEntry : p.sl > p.avgEntry;
        const through = stopOk && (p.side === "long" ? mark <= p.sl : mark >= p.sl);
        if (through || adverse > stopFrac * 0.15) continue;
      }
      const axisParent = p.playbook === "axis" || p.tactic === "axis";
      if (axisParent) {
        const withAxis = p.side === "long" ? q.px + 1e-12 >= p.avgEntry : q.px - 1e-12 <= p.avgEntry;
        if (!withAxis) continue;
      }
      if ((p.playbook === "dca" || p.tactic === "dca") && move < 0) continue;
      if ((e.cooldown[cooldownKey(conn, p.symbol)] ?? 0) > e.tick) continue;
      if (!blockCoordsAllow(e, p, move)) continue;
      let usedQty = 0;
      for (const o of legBlocks(p)) {
        if (o.status === "cancelled" || o.status === "filled" || o.status === "rejected") continue;
        usedQty += Math.max(0, o.remaining || 0);
      }
      const plannedRel: {
        overallKind: boolean;
        next: number;
        qty: number;
        scope: OverallScope;
        mode: "additive" | "shared";
        lane: BlockLaneState;
        relExtra?: boolean;
      }[] = [];
      const plannedOv: typeof plannedRel = [];
      const parentBase = originalParentQty(p);
      if (!(parentBase > 0)) continue;
      const stackLimit = parentBase * Math.min(8, maxMul);
      let stackQty = p.qty + usedQty;
      const plannedCount = () => plannedRel.length + plannedOv.length;
      let relExtraAttached = false;
      for (const mode of volModes) {
        if (adds + plannedCount() >= addCap) break;
        const k = blockLaneKey(p, mode);
        const lane = e.blockLanes[k];
        if (!lane || !lane.active || lane.baseQty <= 0 || lane.parentPositionId !== p.id) continue;
        const liveBlock = legBlocks(p).filter(
          (o) =>
            o.status !== "cancelled" &&
            o.status !== "filled" &&
            o.status !== "rejected" &&
            blockModeOf(o) === mode,
        );
        const liveRelLevels = new Set(liveBlock.filter((o) => !isOverallBlockOrder(o) && !isBlockRelationExtra(o)).map((o) => Math.max(1, o.level || 1)));
        const scopes = overallVolumeModes(block).includes(mode) ? overallScopes(block) : [];
        const liveOvLevels = emptyOvLevels();
        const ovQty = emptyOvQty();
        for (const o of liveBlock.filter(isOverallBlockOrder)) {
          const sc = overallScopeOf(o) ?? "book";
          liveOvLevels[sc].add(Math.max(1, o.level || 1));
          ovQty[sc] += Math.max(0, o.qty || 0);
        }
        let relQty = liveBlock.filter((o) => !isOverallBlockOrder(o)).reduce((s, o) => s + Math.max(0, o.qty || 0), 0);
        let modeAdds = 0;
        const stackAdd = block.overallSharedStack !== "split";
        const ovVrScale = !stackAdd && mode === "shared" && scopes.length > 1 ? 1 / scopes.length : 1;
        const extraCap = Math.max(0, maxMul - 1);
        const relVol =
          block.relAdditive === false
            ? 0
            : winningRelVolume(e, {
                symbol: p.symbol,
                side: p.side,
                indication: p.indication,
                kind: p.kind,
                tactic: p.tactic ?? tactic,
                rangeType: p.controllingRange ?? rangeType,
                playbook: p.playbook,
                tpAtr: p.tpAtr, slOfTp: p.slOfTp,
                trailPct: p.trailPct,
                trailingDistance: p.trailingDistance,
                priceStopPct: p.priceStopPct,
                priceTrailPct: p.priceTrailPct,
                maxHoldTicks: p.maxHoldTicks,
                calc: p.calc,
                microRange: p.microRange,
                minimalRange: p.minimalRange,
                shortRange: p.shortRange,
                modelRtCost: p.modelRtCost,
                minSlDistancePct: p.minSlDistancePct,
                microMinSlDistancePct: p.microMinSlDistancePct,
                microMinTrailDistancePct: p.microMinTrailDistancePct,
              });
        const extraOnce = Math.max(0, relVol) * lane.baseQty;
        const relPlannedAt = () => plannedRel.length;
        const plan = (kind: "relation" | "overall", next: number, vr: number, extraQty: number, scope: OverallScope = "book", relExtra = false) => {
          const overallKind = kind === "overall";
          const stepMode: "additive" | "shared" = mode;
          const prove = blockProveScale(e, next, p);
          const step = relExtra ? 0 : blockStepQty(lane.baseQty, next, vr * prove, maxMul, 1, 0, stepMode);
          const qty = (step + Math.max(0, extraQty))*additionalLaneVolumeFactor(e.relationalVolumeRatios,p,"block");
          if (!(qty > 0)) return false;
          (overallKind ? plannedOv : plannedRel).push({ overallKind, next, qty, scope, mode, lane, relExtra });
          if (overallKind) {
            liveOvLevels[scope].add(next);
            ovQty[scope] += qty;
          } else if (!relExtra) {
            liveRelLevels.add(next);
            relQty += qty;
          } else {
            relQty += qty;
          }
          modeAdds += 1;
          return true;
        };
        const nBefore = relPlannedAt();
        for (const next of counts) {
          if (adds + plannedCount() >= addCap || modeAdds >= counts.length * (1 + scopes.length)) break;
          if (!(move > 0)) break;
          if (next < minM || next > maxM) continue;
          if (next < Math.max(1, Math.round(block.minActiveLevel || 1))) continue;
          const vrModeRel = mode === "shared" ? vrShared : vrRel;
          const expansion = Math.min(next * vrModeRel, extraCap);
          const relCap = lane.baseQty * expansion;
          if (
            tacticOn &&
            blockVolumeModes(block).includes(mode) &&
            block.sets !== false &&
            !lane.satisfied[next] &&
            !liveRelLevels.has(next) &&
            lane.pending !== next &&
            relQty + 1e-12 < relCap &&
            blockPfOk(lane, next, block, minPf, expansion) &&
            (block.windows === false || blockParentCountPositive(e, p, next, minPf))
          ) {
            // Independent N step only. Winning-rel extra is applied once after all N=1–6.
            plan("relation", next, vrModeRel, 0);
          }
        }
        if (tacticOn && extraOnce > 0 && !relExtraAttached && plannedRel.length > nBefore) {
          plan("relation", counts[0] ?? 1, 0, extraOnce, "book", true);
          relExtraAttached = true;
        }
        // Overall Block after relation/set plans for this mode so last-N extras are already in usedQty/relQty.
        if (overall && overallVolumeModes(block).includes(mode)) {
          for (const next of counts) {
            if (adds + plannedCount() >= addCap) break;
            if (next < minM || next > maxM) continue;
            if (next < Math.max(1, Math.round(block.minActiveLevel || 1))) continue;
            const vrModeOv = mode === "shared" ? vrShared : vrOv;
            const scopePos = {
              symbol: p.symbol,
              side: p.side,
              indication: p.indication,
              tactic: (p.tactic || tactic) as TacticKind,
            };
            for (const scope of scopes) {
              if (adds + plannedCount() >= addCap) break;
              if (scope !== "book" && !(move > 0)) continue;
              if (scope === "book" && e.completeSim && !e.liveTape && move <= 0) continue;
              if (!overallWindowOk(e, scope, scopePos, next, minPf)) continue;
              if (liveOvLevels[scope].has(next)) continue;
              const vrThis = vrModeOv * ovVrScale;
              const ovCap = lane.baseQty * Math.min(next * vrThis, extraCap);
              if (ovQty[scope] + 1e-12 < ovCap) plan("overall", next, vrThis, 0, scope);
            }
          }
        }
      }
      const flushPlanned = (planned: typeof plannedRel) => {
        const room = stackLimit - stackQty;
        if (!(room > 1e-12) || !planned.length) return;
        const raw = planned.reduce((s, x) => s + x.qty, 0);
        const scale = raw > room ? room / raw : 1;
        const hi = pickRange(q, cfg, (p.controllingRange as RangeType | undefined) || rangeType);
        const sl0 = p.slDist > 1e-12 ? p.slDist : slDist(q.atr, hi.spacing, cfg.slAtr ?? SL_ATR_MULT, cfgUsesShortRange(cfg), q.px);
        const tp0 = p.tpDist > 1e-12 ? p.tpDist : tpDistFromSl(sl0, cfg.tpRatio, cfgUsesShortRange(cfg));
        const atr = Math.max(q.atr, mark * 0.0008, 1e-9);
        const pad = atr * 0.035;
        let px = p.side === "long" ? mark - pad : mark + pad;
        if (!(px > 0)) px = mark;
        if (!(px > 0)) return;
        const lv = protectLevels(px, p.side, sl0, tp0, sl0 > 1e-12 ? tp0 / sl0 : 1, true, modeledPositionCost(e, p.symbol), e.minSlDistancePct);
        for (const item of planned) {
          if (adds >= addCap) break;
          const qty = item.qty * scale;
          if (!(qty > 0)) continue;
          const tag = item.relExtra
            ? "Block extra"
            : !item.overallKind
              ? "Block"
              : item.scope === "symbol"
                ? "Overall Block symbol"
                : item.scope === "dir"
                  ? "Overall Block dir"
                  : item.scope === "indication"
                    ? "Overall Block indication"
                    : item.scope === "type"
                      ? "Overall Block type"
                      : item.scope === "indType"
                        ? "Overall Block indication type"
                        : "Overall Block";
          const oid = nextId(
            e,
            item.overallKind
              ? item.scope === "symbol"
                ? "obs"
                : item.scope === "dir"
                  ? "obd"
                  : item.scope === "indication"
                    ? "obi"
                    : item.scope === "type"
                      ? "obt"
                      : item.scope === "indType"
                        ? "obx"
                        : "ob"
              : "b",
          );
          queueOrder(e, {
            id: oid,
            strategyId: p.strategyId,
            connId: conn,
            symbol: p.symbol,
            side: p.side,
            type: "limit",
            qty,
            filled: 0,
            price: px,
            remaining: qty,
            status: "queued",
            rangeType: hi.rangeType,
            level: item.next,
            sl: lv.sl,
            tp: lv.tp,
            slDist: lv.slDist,
            tpDist: lv.tpDist,
            batchId: `${p.id}:${item.scope}:${item.next}`,
            parentPositionId: p.id,
            tactic: p.tactic ?? tactic,
            indication: p.indication,
            kind: "block",
            playbook: "block",
            validExec: internAllPhase(e) ? false : p.validExec === true,
            tpAtr: p.tpAtr,
            slOfTp: p.slOfTp,
            trailPct: p.trailPct,
            trailingDistance: p.trailingDistance,
            priceStopPct: p.priceStopPct,
            priceTrailPct: p.priceTrailPct,
            maxHoldTicks: p.maxHoldTicks,
            minimalRange: p.minimalRange,
            microRange: p.microRange,
            shortRange: p.shortRange,
            modelRtCost: p.modelRtCost,
            minSlDistancePct: p.minSlDistancePct,
            microMinSlDistancePct: p.microMinSlDistancePct,
            microMinTrailDistancePct: p.microMinTrailDistancePct,
            calc: p.calc ?? "base",
            note: `${tag} ${item.mode} #${item.next} ${p.symbol} ${p.side} · ${oid} · ${p.id} · ${conn}`,
          });
          rememberBlock(e.queue[e.queue.length - 1]!);
          if (!item.overallKind && !item.relExtra) item.lane.pending = item.next;
          countPlaced(e);
          usedQty += qty;
          stackQty += qty;
          added += 1;
          adds += 1;
          bumpBookCount(e, "adds");
          e.lastBlockAt = e.tick;
        }
      };
      // Each enabled stream keeps its own request; share the parent's remaining total cap proportionally.
      // Flushing one family first starved the other family even when both had qualifying independent plans.
      flushPlanned([...plannedRel, ...plannedOv]);
    }
  }

  const blockN = collectActiveOrderBlocks(e, conn).length;
  if (cancelled || added || flattened) {
    e.lastMsg = `Block adjust · ${blockN} blocks · −${cancelled} +${added} flatten ${flattened} · ${tactic}`;
    e.lastBlockAt = e.tick;
  }
  return { cancelled, added, flattened, blocks: blockN };
}

function dropUnadjustedNormal(e: VstEngine) {
  const plain = (o: LiveOrder) => !strategyProcessingFor(e, o).normal && ownedByDesk(o, e.activeConnId) && unadjustedNormalOrder(o);
  if (e.queue.some(plain)) {
    for (const o of e.queue) if (plain(o)) markTerminal(e, o, "cancelled");
    e.queue = e.queue.filter((o) => !plain(o));
  }
  for (const o of e.orders) {
    if (plain(o) && (o.status === "open" || o.status === "queued" || o.status === "partial")) markTerminal(e, o, "cancelled");
  }
}

function capBookCheap(e: VstEngine) {
  const qCap = maxQueue(e);
  if (e.queue.length > qCap) {
    const block: LiveOrder[] = [];
    const bot: LiveOrder[] = [];
    const foreign: LiveOrder[] = [];
    const rest: LiveOrder[] = [];
    for (const o of e.queue) {
      if (!isDeskConn(o.connId)) foreign.push(o);
      else if (isBotPlay(o.playbook)) bot.push(o);
      else if (isBlockOrder(o)) block.push(o);
      else rest.push(o);
    }
    const blockKeep = block.slice(-2400);
    const room = Math.max(0, qCap - blockKeep.length);
    const restKeep = rest.slice(-room);
    const drop = block.slice(0, Math.max(0, block.length - 2400)).concat(rest.slice(0, Math.max(0, rest.length - room)));
    for (const o of drop) markTerminal(e, o, "cancelled");
    e.queue = blockKeep.concat(restKeep, bot, foreign);
  }
  const wCap = maxWorking(e);
  if (e.orders.length > wCap) {
    const keep: LiveOrder[] = [];
    const extra: LiveOrder[] = [];
    for (const o of e.orders) {
      if (!isDeskConn(o.connId) || isBotPlay(o.playbook) || isBlockOrder(o)) keep.push(o);
      else extra.push(o);
    }
    const room = Math.max(0, wCap - keep.length);
    const extraKeep = extra.slice(-room);
    for (const o of extra.slice(0, Math.max(0, extra.length - room))) markTerminal(e, o, "cancelled");
    e.orders = keep.concat(extraKeep);
  }
}

export function tickVst(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, opts?: { indicationTime?:number; syntheticReplay?: boolean; freezeIds?: Set<string>; skipWalk?: boolean; skipMatch?: boolean; bookOnly?: boolean; rangeType?: RangeType; symbolCount?: number; orderType?: OrderTypeId; block?: BlockConfig; endStage?: boolean }) {
  ensureEngine(e);
  e.relationalVolumeRatios=cfg.relationalVolumeRatios;
  e.indicationSourceIds=indicationSourceIds(cfg.indicationSourceIds);
  refreshPortedIndications(e,e.indicationSourceIds,opts?.indicationTime??Date.now());
  for(const q of Object.values(e.quotes))if(q.portedDirections)publishPortedIndications(q.id,q.portedDirections);
  if (cfg.microMinSlDistancePct !== undefined) e.microMinSlDistancePct = cfg.microMinSlDistancePct;
  if (cfg.microMinTrailDistancePct !== undefined) e.microMinTrailDistancePct = cfg.microMinTrailDistancePct;
  if (cfg.minSlDistancePct !== undefined) e.minSlDistancePct = normalizeMinSlDistancePct(cfg.minSlDistancePct);
  if (cfg.fees) e.fees = feePolicy(cfg.fees);
  if (cfg.stepPf) e.stepPf = { ...DEFAULT_STEP_PF, ...cfg.stepPf };
  capBookCheap(e);
  dropUnadjustedNormal(e);
  if (opts?.bookOnly) {
    e.lastTactic = tactic;
    safeStage(e, "refill", () => refill(e));
    safeStage(e, "batch", () => processBatches(e));
    if (!opts.skipMatch) safeStage(e, "match", () => matchOrders(e));
    safeStage(e, "positions", () => managePositions(e, tactic, cfg, { minHold: 1, liveTape: false }));
    safeStage(e, "stats", () => recomputeStats(e));
    return e;
  }
  if (e.botMode && !(e.x01Progress && e.activeConnId === "bingx-x01")) {
    if (opts?.symbolCount != null) e.symbolCount = clampSymbolCount(opts.symbolCount);
    if (opts?.orderType) e.orderType = opts.orderType;
    e.lastTactic = tactic;
    e.lastRange = opts?.rangeType ?? e.lastRange ?? "atr";
    e.tick += 1;
    if (e.tick % 48 === 1) safeStage(e, "sanitize", () => sanitizeBook(e));
    safeStage(e, "refill", () => refill(e));
    safeStage(e, "walk", () => {
      if (!opts?.skipWalk) walkQuotes(e);
    });
    safeStage(e, "batch", () => processBatches(e));
    if (!opts?.skipMatch) safeStage(e, "match", () => matchOrders(e));
    safeStage(e, "positions", () => managePositions(e, tactic, cfg, { minHold: 1, liveTape: false }));
    if (e.tick % 2 === 0) safeStage(e, "stats", () => recomputeStats(e));
    if (e.x01Progress && e.activeConnId === "bingx-x01" && e.tick % 2 === 0) {
      const qn = e.queue.filter((o) => o.connId === e.activeConnId && !String(o.playbook || "").startsWith("bot:")).length;
      const workN = e.orders.filter((o) => o.connId === e.activeConnId && !String(o.playbook || "").startsWith("bot:") && (o.status === "open" || o.status === "partial")).length;
      const posN = e.positions.filter((p) => p.connId === e.activeConnId && !String(p.playbook || "").startsWith("bot:")).length;
      if (qn < 80 && workN < 120 && posN < 400) safeStage(e, "progress-arm", () => armUniverse(e, cfg, tactic, opts?.rangeType));
    }
    return e;
  }
  if (opts?.skipWalk) e.liveTape = true;
  const t0 = Date.now();
  const over = () => {
    if (paperMode(e) && (e.completeSim || opts?.syntheticReplay)) return false;
    const n = e.symbolCount || 0;
    const budget = e.liveTape ? Math.min(800, 280 + n * 4) : n >= 80 ? 400 : 140;
    return Date.now() - t0 > budget;
  };
  if (opts?.symbolCount != null) e.symbolCount = clampSymbolCount(opts.symbolCount);
  if (opts?.orderType) e.orderType = opts.orderType;
  e.tpRatio = snapTpRatio(cfg.tpRatio);
  e.lastTactic = tactic;
  e.lastRange = opts?.rangeType ?? e.lastRange ?? "atr";
  e.tick += 1;
  if (e.tick % 24 === 1) sanitizeBook(e);
  safeStage(e, "refill", () => refill(e));
  safeStage(e, "walk", () => {
    if (opts?.skipWalk) return;
    if (opts?.freezeIds) walkQuotes(e, opts.freezeIds);
    else walkQuotes(e);
  });
  if (e.tick % 2 === 0) safeStage(e, "indications", () => refreshLiveIndications(e.quotes));
  safeStage(e, "batch", () => processBatches(e));
  if (!opts?.skipMatch) safeStage(e, "match", () => matchOrders(e));
  safeStage(e, "positions", () => managePositions(e, tactic, cfg, { minHold: opts?.skipWalk ? 80 : 1, liveTape: Boolean(opts?.skipWalk) }));
  if (e.tick % 8 === 0 && !over()) safeStage(e, "coord", () => applySessionCoord(e));
  const block = opts?.block ?? e.blockCfg ?? DEFAULT_BLOCK_CONFIG;
  e.blockCfg = block;
  const cadence = Math.max(4, Math.round(block.cadence || 8));
  const endTick = 16 * TICKS_PER_HOUR;
  const overallOnly = block.overall !== false && block.enabled === false && (e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES).block === false;
  const blockDue =
    Boolean(opts?.endStage) ||
    ((block.enabled || overallOnly) &&
      (block.endStageOnly && !overallOnly ? e.tick >= endTick && e.tick % cadence === 0 : e.tick % cadence === 0));
  const iv = intervalCfg(e);
  const ivTicks = ticksPerIntervalOf(e);
  const evalEvery = (e.completeSim || e.liveTape) && iv.enabled && iv.evalOnCadence
    ? ivTicks
    : Math.max(ivTicks, Math.round((block.evalHours || 2) * TICKS_PER_HOUR));
  let progressed = false;
  const evalDue = e.tick > 0 && e.tick % evalEvery === 0;
  // Relation last-N / PF evals before Overall Block so extra volume uses current winners.
  if ((blockDue || evalDue) && !over()) {
    const needRelEval = block.autoEval !== false && (block.enabled || overallOnly) && (evalDue || !(e.lastRelEvalTick));
    if (needRelEval) {
      safeStage(e, "block-eval", () => {
        evalBlockRelations(e, block);
      });
      progressed = true;
    } else {
      safeStage(e, "progress-eval", () => {
        refreshProgressEvals(e, block);
      });
      progressed = true;
    }
  }
  if (blockDue && (!over() || e.liveTape) && (!e.botMode || (e.x01Progress && e.activeConnId === "bingx-x01"))) {
    safeStage(e, "block", () => {
      adjustActiveBlocks(e, cfg, tactic, block, opts?.rangeType, { endStage: opts?.endStage || e.tick >= endTick });
    });
  }
  if (!progressed && e.tick > 0 && e.tick % ivTicks === 0 && e.closed.length >= 6 && !over()) {
    safeStage(e, "progress-eval", () => {
      refreshProgressEvals(e, block);
    });
  }
  if (block.liveDisable !== false && e.tick % 30 === 0 && e.closed.length >= (block.liveLastN || 12) && !over()) {
    safeStage(e, "live-disable", () => {
      refreshLiveDisable(e, block);
    });
  }
  if (e.tick % 30 === 0 && e.closed.length >= 6 && !over()) {
    safeStage(e, "symbol-hour", () => {
      refreshSymbolHourEval(e, { hours: block.symbolEvalHours ?? SYMBOL_EVAL_HOURS });
    });
  }
  if (e.tick > 0 && (e.tick % ivTicks === 0 || e.tick % TICKS_PER_HOUR === 0) && !over()) {
    safeStage(e, "losing-hour", () => {
      refreshLosingHour(e);
    });
  }
  if ((e.tick % 4 === 0 || (opts?.skipWalk && e.orders.length > maxWorking(e))) && !over()) {
    safeStage(e, "compact", () => {
      compactOrders(e);
    });
  }
  const armEvery = internAllPhase(e) ? 1 : completeOpenTape(e) || performingLive(e) || (e.completeSim && paperMode(e)) ? 2 : e.completeSim ? 6 : tapeRed(e) ? 8 : 12;
  if (completeOpenTape(e) || performingLive(e)) rollHourLanes(e);
  if (!opts?.skipWalk && e.tick % armEvery === 0 && (completeOpenTape(e) || performingLive(e))) recycleOpenLadders(e);
  const progressLane = e.x01Progress && e.activeConnId === "bingx-x01";
  const qn = e.queue.filter((o) => o.connId === e.activeConnId && !isBotPlay(o.playbook)).length;
  const qArm = e.completeSim ? Math.max(80, maxQueue(e) * 0.55) : Math.max(320, maxQueue(e) * 0.4);
  const workN = e.orders.filter((o) => o.connId === e.activeConnId && !isBotPlay(o.playbook) && (o.status === "open" || o.status === "partial")).length;
  const workArm = e.completeSim ? Math.floor(maxWorking(e) * 0.85) : maxWorking(e);
  const posN = e.positions.filter((p) => p.connId === e.activeConnId && !isBotPlay(p.playbook)).length;
  const emptyLive = Boolean(e.liveTape) && qn === 0 && workN === 0 && posN === 0;
  if (
    (!opts?.skipWalk || e.liveTape) &&
    (!e.botMode || progressLane) &&
    (e.tick % armEvery === 0 || emptyLive) &&
    !over() &&
    qn < qArm &&
    workN < workArm
  ) {
    safeStage(e, "arm", () => armUniverse(e, cfg, tactic, opts?.rangeType));
  }
  if (e.tick % 40 === 0 && !over()) healEngine(e, cfg, tactic, opts?.rangeType);
  if (!opts?.skipWalk || e.tick % 2 === 0) safeStage(e, "stats", () => recomputeStats(e));
  return e;
}
export function resetBook(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, rangeType?: RangeType, connId?: string) {
  const scope = connId && isDeskConn(connId) ? connId : undefined;
  if (scope) {
    cancelQueued(e, (o) => ownedByDesk(o, scope));
    e.orders = e.orders.filter((o) => {
      if (!ownedByDesk(o, scope)) return true;
      if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
      return false;
    });
    e.positions = e.positions.filter((p) => !ownedByDesk(p, scope));
    e.fills = e.fills.filter((f) => f.connId !== scope);
    const prev = e.activeConnId;
    e.activeConnId = scope;
    armUniverse(e, cfg, tactic, rangeType);
    e.activeConnId = prev;
    e.lastMsg = `Session ${scope} rearmed · other connections held`;
    return;
  }
  e.queue = e.queue.filter((o) => !isDeskConn(o.connId));
  e.orders = e.orders.filter((o) => !isDeskConn(o.connId));
  e.positions = e.positions.filter((p) => !isDeskConn(p.connId));
  e.fills = e.fills.filter((f) => !isDeskConn(f.connId));
  e.closed = [];
  e.batches = [];
  e.cooldown = {};
  e.ledger = emptyLedger();
  e.stats = emptyStats();
  e.symbolStats = {};
  armUniverse(e, cfg, tactic, rangeType);
  e.lastMsg = "Desk book rearmed · foreign exchange orders untouched";
}

/** Drop paper legs that vanished on the live book. Manual closes stay shut; other legs keep arming. */
export function releaseVanished(e: VstEngine, occupied: Set<string>, connId?: string, hold?: Set<string>) {
  const conn = connId && isDeskConn(connId) ? connId : e.activeConnId;
  ensureEngine(e);
  const keep = [];
  let n = 0;
  for (const p of e.positions) {
    if (!ownedByDesk(p, conn) || occupied.has(`${p.symbol}:${p.side}`)) {
      keep.push(p);
      continue;
    }
    const key = `${p.symbol}:${p.side}`;
    cancelLane(e, p);
    const manual = !hold || hold.has(key);
    if (manual) {
      e.manualClosed![key] = e.tick || 1;
      cancelQueued(e, (o) => o.connId === conn && o.symbol === p.symbol && o.side === p.side && !isBotPlay(o.playbook));
      for (const o of e.orders) {
        if (o.connId !== conn || o.symbol !== p.symbol || o.side !== p.side || isBotPlay(o.playbook)) continue;
        if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
      }
    } else {
      e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick;
    }
    n += 1;
  }
  if (n) {
    e.positions = keep;
    const held = Object.keys(e.manualClosed ?? {}).length;
    e.lastMsg = `Released ${n} vanished legs · ${held} manual held · keep processing`;
  }
  return n;
}

export function haltEngine(e: VstEngine, connId?: string) {
  e.running = false;
  e.phase = "stopped";
  const scope = connId && isDeskConn(connId) ? connId : undefined;
  for (const o of e.orders) {
    if (!ownedByDesk(o, scope)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
  cancelQueued(e, (o) => ownedByDesk(o, scope));
  e.lastMsg = scope
    ? `Stopped ${scope} · pending cancelled, other sessions held`
    : "Stopped · desk pending cancelled, open positions frozen";
}
export function requeueFree(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, rangeType?: RangeType, connId?: string) {
  const scope = connId && isDeskConn(connId) ? connId : e.activeConnId;
  const held = new Set(e.positions.filter((p) => ownedByDesk(p, scope)).map((p: LivePosition) => p.symbol));
  cancelQueued(e, (o) => ownedByDesk(o, scope) && !held.has(o.symbol));
  for (const o of e.orders) {
    if (!ownedByDesk(o, scope)) continue;
    if (held.has(o.symbol)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
  const prev = e.activeConnId;
  if (isDeskConn(scope)) e.activeConnId = scope;
  armUniverse(e, cfg, tactic, rangeType);
  e.activeConnId = prev;
  e.lastMsg = `Ladders rebuilt on ${scope} · ${tactic} · ${rangeType ?? "auto"}`;
}

export function mirrorEffectiveLanes(
  e: VstEngine,
  symbols: string[],
  cfg: TacticConfig,
  tactic: TacticKind,
  rangeType?: RangeType,
) {
  const allow = new Set(symbols);
  requeueFree(e, cfg, tactic, rangeType);
  if (!allow.size) return;
  cancelQueued(e, (o) => ownedByDesk(o, e.activeConnId) && !allow.has(o.symbol));
  for (const o of e.orders) {
    if (!ownedByDesk(o, e.activeConnId)) continue;
    if (allow.has(o.symbol)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
  e.lastMsg = `Stage-eval mirrored · ${allow.size} effective symbols · ${tactic} · ${rangeType ?? "auto"}`;
}
export function resetSession(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, rangeType?: RangeType) {
  resetBook(e, cfg, tactic, rangeType);
  e.tick = 0;
  e.running = false;
  e.phase = "idle";
  e.seq = 1;
  e.tokens = {
    "bingx-vst-01": VST_RATE_BURST,
    "bingx-vst-02": VST_RATE_BURST,
    "bingx-x01": VST_RATE_BURST,
  };
  e.lastMsg = "Reset · ladders rearmed, press Start";
}
export function enqueueManual(e: VstEngine, input: { connId: string; symbol: string; side: Side; type: LiveOrder['type']; cost: number; price?: number }): string {
  if (!isDeskConn(input.connId)) return "Unknown desk connection — exchange orders on other sessions are not touched.";
  const q = e.quotes[input.symbol];
  if (!q) return "Unknown symbol on VST universe.";
  if (!signalKeys(e, input.connId).has(signalKey(input.symbol, input.side)) && signalKeys(e, input.connId).size >= maxPositions(e)) {
    return `Signal cap ${maxPositions(e)} — new ${input.symbol} ${input.side} is blocked. Orders on an open symbol+direction stay open.`;
  }
  const px = input.price ?? q.px;
  const hi = highestRange(q, DEFAULT_CFG);
  const sl0 = slDist(q.atr, hi.spacing, DEFAULT_CFG.slAtr ?? SL_ATR_MULT, false, q.px);
  const tp0 = tpDistFromSl(sl0, e.tpRatio);
  const lv = protectLevels(px, input.side, sl0, tp0, e.tpRatio, false, modeledPositionCost(e, input.symbol), e.minSlDistancePct);
  const qty = input.cost / px;
  queueOrder(e, {
    id: nextId(e, "m"),
    connId: input.connId,
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    qty,
    filled: 0,
    price: px,
    remaining: qty,
    status: "queued",
    rangeType: hi.rangeType,
    level: 1,
    sl: lv.sl,
    tp: lv.tp,
    slDist: lv.slDist,
    tpDist: lv.tpDist,
    batchId: "",
    note: "Manual ticket"
  });
  countPlaced(e);
  e.lastMsg = `Queued ${input.side} ${input.symbol} on ${input.connId}`;
  return e.lastMsg;
}
export function applyUniverse(e: VstEngine, count: number, orderType?: OrderTypeId) {
  e.symbolCount = clampSymbolCount(count);
  if (orderType) e.orderType = orderType;
  const keep = new Set(universeSymbols(e.symbolCount).map((s) => s.id));
  const scope = isDeskConn(e.activeConnId) ? e.activeConnId : undefined;
  cancelQueued(e, (o) => ownedByDesk(o, scope) && !keep.has(o.symbol));
  for (const o of e.orders) {
    if (!ownedByDesk(o, scope)) continue;
    if (keep.has(o.symbol)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
}
export function cancelLiveOrder(e: VstEngine, id: string) {
  const o = e.orders.find((x) => x.id === id) ?? e.queue.find((x) => x.id === id);
  if (!o || !ownedByDesk(o)) return;
  markTerminal(e, o, "cancelled");
  e.queue = e.queue.filter((x) => x.id !== id);
  e.lastMsg = `Cancelled ${id} on ${o.connId}`;
}
export function syncConnections(conns: Connection[], e: VstEngine): Connection[] {
  return conns.map((c) => {
    const open = e.orders.filter((o) => o.connId === c.id && (o.status === "open" || o.status === "partial")).length;
    const pos = e.positions.filter((p) => p.connId === c.id).length;
    const used = Math.round(VST_RATE_WINDOW - ((e.tokens[c.id] ?? 0) / VST_RATE_BURST) * VST_RATE_WINDOW);
    return {
      ...c,
      openOrderCount: open + e.queue.filter((o) => o.connId === c.id).length,
      positionCount: pos,
      rateLimitUsed: Math.max(0, Math.min(VST_RATE_WINDOW, used)),
    };
  });
}
export function auditEngine(e: VstEngine) {
  const issues = [];
  let ratioViolations = 0;
  let nativeStopViolations = 0;
  let negativePx = 0;
  let nanCount = 0;
  for (const q of Object.values(e.quotes)) {
    if (!Number.isFinite(q.px) || !Number.isFinite(q.hi) || !Number.isFinite(q.lo)) nanCount += 1;
    if (q.px <= 0 || q.lo <= 0) negativePx += 1;
  }
  for (const p of e.positions) {
    let minimum = 0;
    try { minimum = minimumStopDistance(p.avgEntry, p.modelRtCost ?? modeledPositionCost(e, p.symbol),
      p.minSlDistancePct ?? e.minSlDistancePct); } catch { nanCount++; }
    if (p.priceStopPct != null) {
      const entry = nativeProtectionEntry(p);
      const risk = p.side === "long" ? entry - p.sl : p.sl - entry;
      const allow = entry * p.priceStopPct / 100 + Math.max(1e-12, entry * 1e-8);
      if (!STOP_DISTANCE_PCTS.includes(p.priceStopPct) || !(p.sl > 0) || !Number.isFinite(risk) || risk > allow)
        nativeStopViolations++;
    } else {
      const slD = Math.abs(p.sl - p.avgEntry);
      const tpD = Math.abs(p.tp - p.avgEntry);
      const trailed = p.side === "long" ? p.sl >= p.avgEntry : p.sl <= p.avgEntry;
      const ratio = p.slOfTp != null && p.slOfTp > 0 ? Math.max(0.3, 1 / p.slOfTp) : snapTpRatio(e.tpRatio || TP_SL_RATIO);
      // Axis/hybrid may pull TP in to 0.95× risk.
      const allow = Math.max(tpD / ratio / 0.95, minimum) + Math.max(1e-6, tpD * 1e-4);
      if (!trailed && tpD > 0 && slD > allow) ratioViolations += 1;
    }
    if (!Number.isFinite(p.avgEntry) || !Number.isFinite(p.unrealized)) nanCount += 1;
  }
  if (signalKeys(e).size > maxPositions(e)) issues.push("Signal cap exceeded");
  if (Object.keys(e.quotes).length > VST_MAX_SYMBOLS) issues.push("Symbol cap exceeded");
  for (const id of Object.keys(e.tokens)) if ((e.tokens[id] ?? 0) < -1e-6) issues.push(`Negative rate tokens on ${id}`);
  if (nanCount) issues.push(`${nanCount} NaN values`);
  if (negativePx) issues.push(`${negativePx} non-positive prices`);
  if (ratioViolations) issues.push(`${ratioViolations} SL/TP ratio violations`);
  if (nativeStopViolations) issues.push(`${nativeStopViolations} absolute stop distance violations`);
  const counted = bookCounts(e);
  const accounted = counted.orders.queued + counted.orders.open + counted.orders.partial + counted.orders.filled + counted.orders.cancelled + counted.orders.rejected;
  if (counted.orders.placed !== accounted) issues.push(`Order count mismatch placed ${counted.orders.placed} vs ${accounted}`);
  if (counted.positions.slots !== counted.positions.long + counted.positions.short) issues.push("Position slot long/short mismatch");
  return {
    ratioViolations: ratioViolations + nativeStopViolations,
    nativeStopViolations,
    negativePx,
    nanCount,
    issues
  };
}

export function scoreHorizon(hours: number, trades: number, pf: number, wr: number, net: number, mdd: number, slExits: number, tpExits: number, nanCount: number): { ok: boolean; score: number } {
  const pfN = Number.isFinite(pf) ? pf : 0;
  const wrN = Number.isFinite(wr) ? wr : 0;
  const netN = Number.isFinite(net) ? net : 0;
  const mddN = Number.isFinite(mdd) ? mdd : 1;
  let score = pfN * 36 + wrN * 18 + Math.tanh(netN / 40) * 16 + Math.max(0, 12 - mddN * 60);
  if (trades >= 1) score += 4;
  if (hours >= 8 && slExits >= 1) score += 3;
  if (hours >= 8 && tpExits >= 1) score += 3;
  const ok =
    nanCount === 0 &&
    trades >= 1 &&
    mddN <= (hours >= 32 ? 0.2 : 0.28) &&
    (hours < 16
      ? pfN >= 0.45
      : netN > 0 && pfN >= 1 && slExits >= 1 && tpExits >= 1);
  if (!ok) score -= 25;
  return { ok, score };
}

export function horizonFromEngine(e: VstEngine, hours: number, _peak?: number): HorizonMark {
  const audit = auditEngine(e);
  const { ok, score } = scoreHorizon(
    hours,
    e.ledger.trades,
    e.stats.pf,
    e.stats.wr,
    e.stats.net,
    e.stats.mdd,
    e.ledger.slExits,
    e.ledger.tpExits,
    audit.nanCount + audit.ratioViolations,
  );
  return {
    hours,
    trades: e.ledger.trades,
    pf: e.stats.pf,
    wr: e.stats.wr,
    net: e.stats.net,
    mdd: e.stats.mdd,
    equity: e.stats.equity,
    slExits: e.ledger.slExits,
    tpExits: e.ledger.tpExits,
    ok,
    score,
  };
}

/** Intern exam spends a side book. Live starts again from the session equity so a red exam cannot take the account under the floor. */
function resetLiveBook(e: VstEngine) {
  const base = Number(e.startEquity) > 0 ? Number(e.startEquity) : 10;
  e.ledger.profit = 0;
  e.ledger.loss = 0;
  e.ledger.ratioProfit = 0;
  e.ledger.ratioLoss = 0;
  e.ledger.ratioWins = 0;
  e.ledger.peak = base;
  e.ledger.ddTicks = 0;
  e.ledger.maxDdt = 0;
  e.stats.net = 0;
  e.stats.pf = 0;
  e.stats.mdd = 0;
  e.stats.ddt = 0;
  e.stats.equity = base;
}

/** Reproducible simulation policy only; never credentials, orders or account positions. */
export type SimulationPolicy = Partial<Pick<VstEngine,
  "activeConnId" | "fees" | "feeSnapshots" | "feeAsOfMs" | "minSlDistancePct" | "microMinSlDistancePct" | "microMinTrailDistancePct" | "stepPf" |
  "lastNProgress" | "shortProgress" | "intervalStrategy" | "minPf" | "basePf" | "blockPf" |
  "axisPf" | "shortPf" | "shortBasePf" | "shortAxisPf" | "shortBlockPf">>;

export function simulateHours(hours: number, cfg: TacticConfig = DEFAULT_CFG, tactic: TacticKind = 'hybrid', opts?: { policy?: SimulationPolicy; symbolCount?: number; orderType?: OrderTypeId; rangeType?: RangeType; marks?: number[]; block?: BlockConfig; equity?: number; costStep?: number; complete?: boolean; comboOnly?: boolean; prehours?: number; minPf?: number; basePf?: number; blockPf?: number; shortPf?: number; shortBasePf?: number; shortBlockPf?: number; pfCoords?: Partial<PfCoordToggles> | false; strategyToggles?: Partial<StrategyToggles>; skipIndications?: string[];
  onSettlement?: (row: Readonly<VstEngine["closed"][number]>, phase: "selection" | "validation") => void;
  onHour?: (row: { h: number; eq: number; net: number; hourPf: number; pf: number; gatedN?: number; gatedPf?: number; trades?: number; mdd?: number; avgPos?: number; avgOrd?: number; pos?: number; orders?: number }) => void }) {
  const hadPair = cfg.tpAtr != null && cfg.slOfTp != null;
  const use = cfgUsesShortRange(cfg) ? snapShortTacticConfig(cfg) : cfg;
  const ticks = Math.max(1, Math.round(hours * TICKS_PER_HOUR));
  const rangeType = opts?.rangeType ?? "atr";
  const startEq = Number(opts?.equity) > 0 ? Number(opts?.equity) : 1e4;
  const costStep = Number.isFinite(Number(opts?.costStep)) ? Math.min(30, Math.max(3, Number(opts?.costStep))) : 10;
  const complete = Boolean(opts?.complete);
  const comboOnly = opts?.comboOnly != null
    ? Boolean(opts.comboOnly)
    : (!complete && cfgUsesShortRange(use) && hadPair);
  const prehours = opts?.prehours != null
    ? Math.max(0, Math.round(opts.prehours))
    : complete && hours >= 12 ? prehistoryHours(opts?.policy?.shortProgress?.evalHours) : 0;
  const preTicks = prehours * TICKS_PER_HOUR;
  const totalTicks = preTicks + ticks;
  const nativeReplay = use.priceDistanceGrid?.enabled === true;
  const syntheticStart = Date.UTC(2020, 0, 1);
  const engine = initVstEngine(use, {
    warmup: 0,
    symbolCount: opts?.symbolCount,
    orderType: opts?.orderType,
    block: opts?.block,
    equity: startEq,
    costStep,
    complete,
    comboOnly,
    arm: false,
  });
  if (nativeReplay) syntheticPaperReplays.add(engine);
  Object.assign(engine, structuredClone(Object.fromEntries(
    Object.entries(opts?.policy ?? {}).filter(([, value]) => value !== undefined),
  )));
  engine.completeSim = complete;
  engine.openCompleteTape = complete && preTicks <= 0;
  // A quick geometry/discovery simulation without prehistory has not passed
  // Base. Only the explicit complete open-tape diagnostic skips that phase.
  engine.preEvalDone = complete && preTicks <= 0;
  engine.shortRange = Boolean(use.shortRange);
  engine.minimalRange = Boolean(use.minimalRange);
  engine.microRange = Boolean(use.microRange);
  engine.shortComboOnly = Boolean(comboOnly);
  engine.lastTactic = tactic;
  engine.lastRange = rangeType;
  // Default sims count the tactic under test. Normal-off drops trailing/hybrid and prints PF 0.
  // An explicit normal:false still keeps that book calc-only.
  engine.strategyToggles = {
    ...(engine.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES),
    ...(opts?.strategyToggles ?? {}),
  };
  if (opts?.strategyToggles?.normal == null) engine.strategyToggles.normal = true;
  if (opts?.skipIndications?.length) engine.skipIndications = opts.skipIndications;
  if (opts?.pfCoords === false) {
    engine.pfCoords = { hourKeep: false, bankWin: false, pairAdd: false, laneCool: false, winAgain: false };
  } else if (complete || (opts?.pfCoords && typeof opts.pfCoords === "object")) {
    engine.pfCoords = { ...DEFAULT_PF_COORDS, ...(typeof opts?.pfCoords === "object" ? opts.pfCoords : {}) };
  }
  const applySimFloors = () => {
    if (opts?.minPf != null) engine.minPf = opts.minPf;
    if (opts?.basePf != null) engine.basePf = opts.basePf;
    if (opts?.blockPf != null) {
      engine.blockPf = opts.blockPf;
      if (engine.shortRange && opts.shortBlockPf == null) engine.shortBlockPf = opts.blockPf;
    }
    if (opts?.shortPf != null) engine.shortPf = opts.shortPf;
    if (opts?.shortBasePf != null) engine.shortBasePf = opts.shortBasePf;
    if (opts?.shortBlockPf != null) engine.shortBlockPf = opts.shortBlockPf;
  };
  applySimFloors();
  engine.shortProgress = sanitizeShortProgress(engine.shortProgress);
  engine.intervalStrategy = sanitizeIntervalStrategy(engine.intervalStrategy);
  engine.lastNProgress = sanitizeLastNProgress(opts?.policy?.lastNProgress ?? opts?.block?.lastNProgress ?? engine.lastNProgress);
  // Geometry, fees, windows and floors must apply to the very first order too.
  armUniverse(engine, use, tactic, rangeType);
  let peak = startEq;
  const curve = [{
    t: 0,
    eq: startEq,
    dd: 0
  }];
  const sampleEvery = Math.max(1, Math.round(ticks / 24));
  const hourly = [];
  const intervals = [];
  const markAt = new Set((opts?.marks ?? []).map((n) => Math.round(n)).filter((n) => n > 0 && n <= hours));
  const marks: HorizonMark[] = [];
  let hourTrades = 0;
  let prevClosed = 0;
  let prevNet = 0;
  let prevProfit = 0;
  let prevLoss = 0;
  let prevIntClosed = 0;
  let prevIntNet = 0;
  let prevIntProfit = 0;
  let prevIntLoss = 0;
  let posSum = 0;
  let ordSum = 0;
  let slotSum = 0;
  let blockOrdSum = 0;
  let notionalSum = 0;
  let marginSum = 0;
  let maxMarginSeen = 0;
  let scoredMaxPositions = 0, scoredMaxOrders = 0;
  let preCapRejects = 0, preRateSkips = 0;
  const MARGIN_LEV = 125;
  const rSlots = [
    {
      bin: "< −1R",
      lo: -Infinity,
      hi: -1,
      n: 0
    },
    {
      bin: "−1–0R",
      lo: -1,
      hi: 0,
      n: 0
    },
    {
      bin: "0–1R",
      lo: 0,
      hi: 1,
      n: 0
    },
    {
      bin: "1–2R",
      lo: 1,
      hi: 2,
      n: 0
    },
    {
      bin: "2–2.5R",
      lo: 2,
      hi: 2.5,
      n: 0
    },
    {
      bin: "2.5R+",
      lo: 2.5,
      hi: Infinity,
      n: 0
    }
  ];
  let rSum = 0;
  let rN = 0;
  let seenClosed = 0;
  let missedCloses = 0;
  const accMap = () => new Map<string, { id: string; n: number; wins: number; profit: number; loss: number }>();
  const indAcc = accMap();
  const tacAcc = accMap();
  const playAcc = accMap();
  const playIndAcc = accMap();
  const kindAcc = accMap();
  const rangeAcc = accMap();
  const protectionRangeAcc = accMap();
  const scoredSymbols = new Map<string, { id: string; trades: number; wins: number; profit: number; loss: number; gp: number; gl: number; sl: number; tp: number }>();
  const hourIndAcc = accMap();
  const hourPlayAcc = accMap();
  const hourPlayIndAcc = accMap();
  const hourKindAcc = accMap();
  const hourTacAcc = accMap();
  const hourRangeAcc = accMap();
  let hourGatedN = 0;
  let hourGatedP = 0;
  let hourGatedL = 0;
  let hourGatedRatioP = 0;
  let hourGatedRatioL = 0;
  let hourRatioP = 0;
  let hourRatioL = 0;
  let liveRatioP = 0;
  let liveRatioL = 0;
  let intRatioP = 0;
  let intRatioL = 0;
  let hourPaperN = 0;
  let hourPaperP = 0;
  let hourPaperL = 0;
  let hourPosAcc = 0;
  let hourOrdAcc = 0;
  let hourMarginAcc = 0;
  let hourMaxMargin = 0;
  let hourNotionalAcc = 0;
  let hourTickN = 0;
  let prevSl = 0;
  let prevTp = 0;
  let prevWins = 0;
  let prevPlaced = 0;
  let prevFilled = 0;
  const bump = (map: ReturnType<typeof accMap>, id: string, pnl: number) => {
    const key = id || "na";
    let row = map.get(key);
    if (!row) {
      row = { id: key, n: 0, wins: 0, profit: 0, loss: 0 };
      map.set(key, row);
    }
    row.n += 1;
    if (pnl > 0) {
      row.wins += 1;
      row.profit += pnl;
    } else row.loss += Math.abs(pnl);
  };
  const bumpClose = (t: { microRange?: boolean; minimalRange?: boolean; shortRange?: boolean; pnl?: number; ratio?: number; indication?: string; tactic?: string; playbook?: string; kind?: string; qty?: number; blockQty?: number; dcaQty?: number; rangeType?: string; controllingRange?: string }) => {
    const pnl = edgePnl(t);
    const ind = String(t.indication || "trend");
    bump(indAcc, ind, pnl);
    bump(tacAcc, String(t.tactic || tactic), pnl);
    bump(kindAcc, String(t.kind || "normal"), pnl);
    bump(hourIndAcc, ind, pnl);
    bump(hourKindAcc, String(t.kind || "normal"), pnl);
    bump(hourTacAcc, String(t.tactic || tactic), pnl);
    const rangeId = String(t.rangeType || t.controllingRange || "na");
    bump(hourRangeAcc, rangeId, pnl);
    bump(rangeAcc, rangeId, pnl);
    bump(protectionRangeAcc, t.microRange ? "Micro" : t.minimalRange ? "Minimal" : t.shortRange || t.playbook === "short" ? "Short" : "Normal", pnl);
    const qty = Math.max(0, Number(t.qty) || 0);
    const bq = Math.min(qty, Math.max(0, Number(t.blockQty) || 0));
    const blockShare = qty > 1e-12 && bq > 1e-12 ? Math.min(1, bq / qty) : t.playbook === "block" ? 1 : 0;
    const origin = String(t.playbook || "normal");
    const dcaShare = origin === "dca" ? 0 : dcaOverlayShare(qty, t.dcaQty, origin, t.tactic);
    const split = (play: string, share: number) => {
      bump(playAcc, play, share);
      bump(playIndAcc, `${play}:${ind}`, share);
      bump(hourPlayAcc, play, share);
      bump(hourPlayIndAcc, `${play}:${ind}`, share);
    };
    let rest = 1;
    let blockPart = 0;
    if (blockShare > 0 && origin !== "block") {
      blockPart = Math.min(1, blockShare);
      rest -= blockPart;
    }
    const dcaPart = Math.min(Math.max(0, rest), dcaShare);
    rest -= dcaPart;
    if (rest > 1e-12) split(origin, pnl * rest);
    if (blockPart > 1e-12) split("block", pnl * blockPart);
    if (dcaPart > 1e-12) split("dca", pnl * dcaPart);
  };
  const finish = (map: ReturnType<typeof accMap>) =>
    [...map.values()]
      .map((r) => ({ ...r, pf: profitFactor(r.profit, r.loss), wr: r.n ? r.wins / r.n : 0 }))
      .sort((a, b) => b.n - a.n);
  const clearAcc = (map: ReturnType<typeof accMap>) => map.clear();
  let internStage: import("./types.ts").SimStageTape = { n: 0, pf: 0, net: 0, wr: 0 };
  let afterEvalStage: import("./types.ts").SimStageTape = { n: 0, pf: 0, net: 0, wr: 0 };
  let afterTypesStage: import("./types.ts").SimStageTape = { n: 0, pf: 0, net: 0, wr: 0 };
  let prehistorySampleCoverage: SampleCoverage | undefined;
  let preSnap = {
    hours: prehours,
    trades: 0,
    wins: 0,
    profit: 0,
    loss: 0,
    pf: 0,
    wr: 0,
    realized: 0,
    slExits: 0,
    tpExits: 0,
    equity: startEq,
  };
  let liveProfit = 0;
  let liveLoss = 0;
  let livePeak = startEq;
  let scoredMaxDd = 0;
  let scoredWinStreak = 0, scoredLossStreak = 0, scoredMaxWins = 0, scoredMaxLosses = 0;
  for (let i = 0; i < totalTicks; i++) {
    tickVst(engine, use, tactic, {
      rangeType,
      symbolCount: opts?.symbolCount,
      orderType: opts?.orderType,
      block: opts?.block,
      ...(nativeReplay ? { syntheticReplay: true, indicationTime: syntheticStart + (i + 1) * 60_000 } : {}),
    });
    if (preTicks > 0 && i + 1 === preTicks) {
      const examTrades = engine.ledger.trades;
      const examPf = engine.stats.pf;
      const examNet = engine.stats.net;
      const examWr = engine.stats.wr;
      const examOrders = engine.ledger.ordersPlaced;
      const examFills = engine.ledger.ordersFilled;
      const examEq = engine.stats.equity;
      const blk = opts?.block ?? engine.blockCfg ?? DEFAULT_BLOCK_CONFIG;
      // Everything still working came from the exam. Keep only settled evidence
      // when finishBaseEval cancels the warmup orders and flattens its positions.
      for (const order of engine.queue) order.validExec = false;
      for (const order of engine.orders) {
        if (order.status === "queued" || order.status === "open" || order.status === "partial") order.validExec = false;
      }
      for (const position of engine.positions) position.validExec = false;
      finishBaseEval(engine, blk);
      prehistorySampleCoverage = lastNSampleCoverage(engine);
      internStage = {
        n: examTrades,
        pf: examPf,
        net: examNet,
        wr: examWr,
        orders: examOrders,
        fills: examFills,
        equity: examEq,
        comboCovered: Object.keys(engine.progressEval?.shortCombos ?? {}).length,
        modes: engine.progressEval?.lastNModes,
        overall: engine.progressEval?.lastNOverall,
        complete: engine.progressEval?.lastNComplete,
      };
      const pe0 = engine.progressEval;
      const evalRow = pe0?.evalNs?.["50"] ?? pe0?.evalNs?.["15"];
      const validRow = pe0?.validNs?.["15"] ?? pe0?.validNs?.["8"];
      const okComboTape: { pnl: number }[] = [];
      let comboPositive = 0;
      for (const [k, row] of Object.entries(pe0?.shortCombos ?? {})) {
        if (row.ok && row.n >= 4) {
          comboPositive += 1;
          const tape = internStartRows(engine, k);
          if (tape?.length) okComboTape.push(...tape);
        }
      }
      const okSt = comboTapeStats(okComboTape);
      afterEvalStage = {
        ...internStage,
        n: okSt.n || internStage.n,
        pf: okSt.n ? okSt.pf : internStage.pf,
        net: okSt.n ? okSt.net : internStage.net,
        evalN: evalRow?.n ?? 0,
        evalPf: evalRow?.pf ?? internStage.pf,
        validN: validRow?.n ?? 0,
        validPf: validRow?.pf ?? 0,
        comboPositive,
      };
      const provenTape: { pnl: number }[] = [];
      for (const [k, tape] of Object.entries(engine.shortComboPreTape ?? {})) {
        const parts = k.split(":");
        const tp = Number(parts[0]);
        const sl = Number(parts[1]);
        if (!Number.isFinite(tp) || !Number.isFinite(sl) || !tape?.length) continue;
        if (shortComboProven(engine, tp, sl)) provenTape.push(...tape);
      }
      const provenSt = comboTapeStats(provenTape);
      const frozen = frozenTypeBlend(engine);
      const okPool = okTypePool(engine);
      const relRows: { pnl: number }[] = [];
      const relTapes = engine.shortRelPreTape ?? {};
      for (const k of Object.keys(engine.validRelKeys ?? {})) {
        const rows = relTapes[k];
        if (rows?.length) relRows.push(...rows);
      }
      const relSt = comboTapeStats(relRows);
      const broadRows: { pnl: number }[] = [];
      for (const rows of Object.values(relTapes)) {
        if (!rows?.length) continue;
        const st = comboTapeStats(rows);
        if (st.n < 4 || st.net <= 0 || st.pf + 1e-9 < 1 || st.pf >= PF_NO_LOSS - 1e-9) continue;
        broadRows.push(...rows);
      }
      const broadSt = comboTapeStats(broadRows);
      const typeSt = frozen?.n
        ? frozen
        : broadSt.n >= 4
          ? broadSt
          : okPool?.n
            ? okPool
            : provenSt.n
              ? provenSt
              : relSt.n >= 4
                ? relSt
                : null;
      const pe1 = engine.progressEval;
      afterTypesStage = {
        n: typeSt?.n || 0,
        pf: typeSt?.pf || 0,
        net: typeSt?.net || 0,
        wr: internStage.wr,
        orders: internStage.orders,
        fills: internStage.fills,
        equity: engine.stats.equity,
        evalN: pe1?.evalNs?.["50"]?.n ?? afterEvalStage.evalN,
        evalPf: pe1?.evalNs?.["50"]?.pf ?? afterEvalStage.evalPf,
        validN: pe1?.validNs?.["15"]?.n ?? afterEvalStage.validN,
        validPf: pe1?.validNs?.["15"]?.pf ?? afterEvalStage.validPf,
        comboPositive: Object.values(pe1?.shortCombos ?? {}).filter((r) => r.ok && r.n >= 4).length,
        comboCovered: Object.keys(pe1?.shortCombos ?? {}).length,
        modes: pe1?.lastNModes,
        overall: pe1?.lastNOverall,
        complete: pe1?.lastNComplete,
      };
      prevClosed = engine.ledger.trades;
      prevProfit = engine.ledger.profit;
      prevLoss = engine.ledger.loss;
      prevNet = engine.stats.net;
      prevIntClosed = engine.ledger.trades;
      prevIntProfit = engine.ledger.profit;
      prevIntLoss = engine.ledger.loss;
      prevIntNet = engine.stats.net;
      preSnap = {
        hours: prehours,
        trades: engine.ledger.trades,
        wins: engine.ledger.wins,
        profit: engine.ledger.profit,
        loss: engine.ledger.loss,
        pf: engine.stats.pf,
        wr: engine.stats.wr,
        realized: engine.ledger.profit - engine.ledger.loss,
        slExits: engine.ledger.slExits,
        tpExits: engine.ledger.tpExits,
        equity: engine.stats.equity,
      };
      peak = engine.stats.equity;
      livePeak = peak;
      resetLiveBook(engine);
      resetLiveHourState(engine);
      prevProfit = 0;
      prevLoss = 0;
      prevNet = 0;
      prevIntProfit = 0;
      prevIntLoss = 0;
      prevIntNet = 0;
      peak = engine.stats.equity;
      livePeak = peak;
      rSum = 0;
      rN = 0;
      for (const s of rSlots) s.n = 0;
      clearAcc(indAcc);
      clearAcc(tacAcc);
      clearAcc(playAcc);
      clearAcc(playIndAcc);
      clearAcc(kindAcc);
      clearAcc(rangeAcc);
      clearAcc(protectionRangeAcc);
      seenClosed = engine.ledger.trades;
      prevSl = engine.ledger.slExits;
      prevTp = engine.ledger.tpExits;
      prevWins = engine.ledger.wins;
      prevPlaced = engine.ledger.ordersPlaced;
      prevFilled = engine.ledger.ordersFilled;
      preCapRejects = engine.ledger.capRejects;
      preRateSkips = engine.ledger.rateSkips;
    }
    const inLive = i >= preTicks;
    if (engine.ledger.trades > seenClosed || tickCloses(engine).length > 0) {
      const fresh = tickCloses(engine);
      const added = engine.ledger.trades - seenClosed;
      if (fresh.length < added) missedCloses += added - fresh.length;
      for (const t of fresh) {
        if (!deskTapeRow(engine, t) || isBotPlay(t.playbook)) continue;
        if (!t.examFlat) opts?.onSettlement?.(t, inLive ? "validation" : "selection");
        if (!inLive) continue;
        const edge = edgePnl(t);
        const sym = scoredSymbols.get(t.symbol) ?? { id: t.symbol, trades: 0, wins: 0, profit: 0, loss: 0, gp: 0, gl: 0, sl: 0, tp: 0 };
        scoredSymbols.set(t.symbol, sym);
        sym.trades++;
        if (t.pnl > 0) {
          sym.wins++; sym.profit += t.pnl;
          scoredMaxWins = Math.max(scoredMaxWins, ++scoredWinStreak); scoredLossStreak = 0;
        } else if (t.pnl < 0) {
          sym.loss -= t.pnl;
          scoredMaxLosses = Math.max(scoredMaxLosses, ++scoredLossStreak); scoredWinStreak = 0;
        }
        if (edge > 0) sym.gp += edge; else sym.gl -= edge;
        if (t.reason === "sl") sym.sl++; else if (t.reason === "tp") sym.tp++;
        rSum += t.r;
        rN++;
        const slot = rSlots.find((b) => t.r >= b.lo && t.r < b.hi) ?? rSlots[rSlots.length - 1];
        slot.n++;
        bumpClose(t);
        if (edge > 0) {
          hourRatioP += edge;
          intRatioP += edge;
        } else if (edge < 0) {
          hourRatioL += -edge;
          intRatioL += -edge;
        }
        if (t.protect) {
          hourGatedN += 1;
          if (t.pnl > 0) hourGatedP += t.pnl;
          else hourGatedL += Math.abs(t.pnl);
          if (edge > 0) hourGatedRatioP += edge; else hourGatedRatioL -= edge;
          continue;
        }
        if (t.validExec !== true) {
          hourPaperN += 1;
          if (edge > 0) hourPaperP += edge;
          else hourPaperL += Math.abs(edge);
          continue;
        }
        hourGatedN += 1;
        if (t.pnl > 0) hourGatedP += t.pnl;
        else hourGatedL += Math.abs(t.pnl);
        if (edge > 0) hourGatedRatioP += edge; else hourGatedRatioL -= edge;
      }
      seenClosed = engine.ledger.trades;
    }
    const eq = engine.stats.equity;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? Math.max(0, (peak - eq) / peak) : 0;
    if (!inLive) continue;
    if (eq > livePeak) livePeak = eq;
    scoredMaxDd = Math.max(scoredMaxDd, livePeak > 0 ? (livePeak - eq) / livePeak : 0);
    scoredMaxPositions = Math.max(scoredMaxPositions, signalKeys(engine).size);
    scoredMaxOrders = Math.max(scoredMaxOrders, engine.orders.length + engine.queue.length + engine.positions.length);
    posSum += engine.positions.length;
    ordSum += engine.stats.openOrders || engine.orders.filter((o) => o.status === "open" || o.status === "partial").length;
    slotSum += bookCounts(engine).positions.slots;
    let hourNotional = 0;
    let hourBlock = 0;
    for (const p of engine.positions) {
      hourNotional += Math.abs(p.qty * p.avgEntry);
      if (p.playbook === "block" || (p.blockQty || 0) > 0) hourBlock += 1;
    }
    for (const o of engine.orders) {
      if (o.playbook === "block" || /Block/i.test(String(o.note || ""))) hourBlock += 1;
    }
    for (const o of engine.queue) {
      if (o.playbook === "block" || /Block/i.test(String(o.note || ""))) hourBlock += 1;
    }
    blockOrdSum += hourBlock;
    notionalSum += hourNotional;
    const hourMargin = hourNotional / MARGIN_LEV;
    marginSum += hourMargin;
    if (hourMargin > maxMarginSeen) maxMarginSeen = hourMargin;
    if (hourMargin > hourMaxMargin) hourMaxMargin = hourMargin;
    hourPosAcc += engine.positions.length;
    hourOrdAcc += engine.stats.openOrders || engine.orders.filter((o) => o.status === "open" || o.status === "partial").length;
    hourMarginAcc += hourMargin;
    hourNotionalAcc += hourNotional;
    hourTickN += 1;
    const liveI = i - preTicks;
    if ((liveI + 1) % sampleEvery === 0) curve.push({
      t: (liveI + 1) / TICKS_PER_HOUR,
      eq,
      dd
    });
    if ((liveI + 1) % TICKS_PER_HOUR === 0 || i === totalTicks - 1) {
      const h = Math.ceil((liveI + 1) / TICKS_PER_HOUR);
      hourTrades = engine.ledger.trades - prevClosed;
      prevClosed = engine.ledger.trades;
      const hp = engine.ledger.profit - prevProfit;
      const hl = engine.ledger.loss - prevLoss;
      prevProfit = engine.ledger.profit;
      prevLoss = engine.ledger.loss;
      liveProfit += hp;
      liveLoss += hl;
      liveRatioP += hourRatioP;
      liveRatioL += hourRatioL;
      const realized = hp - hl;
      const hourMtm = engine.stats.net - prevNet;
      prevNet = engine.stats.net;
      const hourProfitNow = hourRatioP;
      const hourLossNow = hourRatioL;
      const hourPf = profitFactor(hourProfitNow, hourLossNow);
      const livePf = profitFactor(liveRatioP, liveRatioL);
      const book = bookCounts(engine);
      const hourIndSnap = finish(hourIndAcc);
      const hourPlaySnap = finish(hourPlayAcc);
      const hourPlayIndSnap = finish(hourPlayIndAcc);
      const hourKindSnap = finish(hourKindAcc);
      const hourTacSnap = finish(hourTacAcc);
      const hourRangeSnap = finish(hourRangeAcc);
      const asBag = (rows: ReturnType<typeof finish>) =>
        Object.fromEntries(rows.map((r) => [r.id, { n: r.n, pf: r.pf, wr: r.wr, net: r.profit - r.loss, profit: r.profit, loss: r.loss }]));
      const coverBag = (bag: Record<string, { n: number; pf: number; wr: number; net: number; profit: number; loss: number }>, keys: readonly string[]) => {
        const out = { ...bag };
        for (const id of keys) {
          if (!out[id]) out[id] = { n: 0, pf: 0, wr: 0, net: 0, profit: 0, loss: 0 };
        }
        return out;
      };
      const liveWinsNow = engine.ledger.wins - preSnap.wins;
      const liveTradesNow = engine.ledger.trades - preSnap.trades;
      const unreal = engine.positions.reduce((s, p) => s + (p.unrealized || 0), 0);
      const hourSl = engine.ledger.slExits - prevSl;
      const hourTp = engine.ledger.tpExits - prevTp;
      const hourWins = engine.ledger.wins - prevWins;
      prevSl = engine.ledger.slExits;
      prevTp = engine.ledger.tpExits;
      prevWins = engine.ledger.wins;
      const hourPlaced = engine.ledger.ordersPlaced - prevPlaced;
      const hourFilled = engine.ledger.ordersFilled - prevFilled;
      prevPlaced = engine.ledger.ordersPlaced;
      prevFilled = engine.ledger.ordersFilled;
      const avgPosH = hourTickN ? hourPosAcc / hourTickN : engine.positions.length;
      const avgOrdH = hourTickN ? hourOrdAcc / hourTickN : book.orders.working;
      const avgMarginH = hourTickN ? hourMarginAcc / hourTickN : hourMargin;
      const avgNotionalH = hourTickN ? hourNotionalAcc / hourTickN : hourNotional;
      const hourRow = {
        h,
        net: realized,
        mtm: hourMtm,
        unreal,
        trades: hourTrades,
        eq,
        pf: livePf,
        hourPf,
        hourProfit: hourProfitNow,
        hourLoss: hourLossNow,
        wr: liveTradesNow > 0 ? liveWinsNow / liveTradesNow : 0,
        hourWr: hourTrades > 0 ? hourWins / hourTrades : 0,
        mdd: scoredMaxDd,
        ddt: engine.stats.ddt,
        pos: engine.positions.length,
        avgPos: avgPosH,
        slots: book.positions.slots,
        orders: book.orders.working,
        avgOrd: avgOrdH,
        queued: book.orders.queued,
        sl: engine.ledger.slExits - preSnap.slExits,
        tp: engine.ledger.tpExits - preSnap.tpExits,
        hourSl,
        hourTp,
        placed: hourPlaced,
        filled: hourFilled,
        netCum: liveProfit - liveLoss,
        vol: engine.relVolumeFactor ?? 0,
        notional: hourNotional,
        avgNotional: avgNotionalH,
        margin: hourMargin,
        maxMargin: hourMaxMargin,
        avgMargin: avgMarginH,
        marginPct: eq > 0 ? hourMargin / eq : 0,
        eqUsePct: eq > 0 ? avgMarginH / eq : 0,
        blockOrd: hourBlock,
        gatedN: hourGatedN,
        gatedPf: profitFactor(hourGatedRatioP, hourGatedRatioL),
        gatedNet: hourGatedP - hourGatedL,
        paperN: hourPaperN,
        paperPf: hourPaperN ? profitFactor(hourPaperP, hourPaperL) : 0,
        paperNet: hourPaperN ? hourPaperP - hourPaperL : 0,
        inds: coverBag(asBag(hourIndSnap), allEngineIndications(engine)),
        plays: coverBag(asBag(hourPlaySnap), ["short", "block", "axis", "normal", "dca"]),
        playInds: Object.fromEntries(hourPlayIndSnap.map((r) => [r.id, { n: r.n, pf: r.pf, net: r.profit - r.loss, profit: r.profit, loss: r.loss }])),
        kinds: Object.fromEntries(hourKindSnap.map((r) => [r.id, { n: r.n, pf: r.pf }])),
        tacs: coverBag(asBag(hourTacSnap), ["trailing", "axis", "hybrid", "dca"]),
        ranges: coverBag(asBag(hourRangeSnap), RANGE_TYPES),
      };
      hourly.push(hourRow);
      opts?.onHour?.(hourRow);
      clearAcc(hourIndAcc);
      clearAcc(hourPlayAcc);
      clearAcc(hourPlayIndAcc);
      clearAcc(hourKindAcc);
      clearAcc(hourTacAcc);
      clearAcc(hourRangeAcc);
      hourGatedN = 0;
      hourGatedP = 0;
      hourGatedL = 0;
      hourGatedRatioP = 0;
      hourGatedRatioL = 0;
      hourRatioP = 0;
      hourRatioL = 0;
      hourPaperN = 0;
      hourPaperP = 0;
      hourPaperL = 0;
      hourPosAcc = 0;
      hourOrdAcc = 0;
      hourMarginAcc = 0;
      hourMaxMargin = 0;
      hourNotionalAcc = 0;
      hourTickN = 0;
      if (markAt.has(h)) {
        const net = eq - startEq, slExits = engine.ledger.slExits - preSnap.slExits,
          tpExits = engine.ledger.tpExits - preSnap.tpExits;
        const wr = liveTradesNow ? liveWinsNow / liveTradesNow : 0;
        marks.push({ hours: h, trades: liveTradesNow, pf: livePf, wr, net, mdd: scoredMaxDd,
          equity: eq, slExits, tpExits,
          ...scoreHorizon(h, liveTradesNow, livePf, wr, net, scoredMaxDd, slExits, tpExits, auditEngine(engine).nanCount) });
      }
    }
    if ((liveI + 1) % ticksPerIntervalOf(engine) === 0 || i === totalTicks - 1) {
      const step = ticksPerIntervalOf(engine);
      const m = Math.ceil((liveI + 1) / step);
      const intTrades = engine.ledger.trades - prevIntClosed;
      prevIntClosed = engine.ledger.trades;
      const ip = engine.ledger.profit - prevIntProfit;
      const il = engine.ledger.loss - prevIntLoss;
      prevIntProfit = engine.ledger.profit;
      prevIntLoss = engine.ledger.loss;
      const intMtm = engine.stats.net - prevIntNet;
      prevIntNet = engine.stats.net;
      intervals.push({
        m,
        minutes: intervalMinutesOf(engine),
        net: ip - il,
        mtm: intMtm,
        trades: intTrades,
        eq,
        pf: profitFactor(intRatioP, intRatioL),
        hourPf: profitFactor(intRatioP, intRatioL),
        hourProfit: intRatioP,
        hourLoss: intRatioL,
        mdd: scoredMaxDd,
        ddt: engine.stats.ddt,
        pos: engine.positions.length,
        netCum: engine.ledger.profit - engine.ledger.loss,
      });
      intRatioP = 0;
      intRatioL = 0;
    }
  }
  refreshProgressEvals(engine, opts?.block ?? engine.blockCfg ?? DEFAULT_BLOCK_CONFIG);
  const audit = auditEngine(engine);
  const issues = [...audit.issues];
  if (missedCloses > 0) issues.push(`Hour tape missed ${missedCloses} closes`);
  const profit = engine.ledger.profit;
  const loss = engine.ledger.loss;
  const tradesAll = engine.ledger.trades;
  const winsAll = engine.ledger.wins;
  const liveTrades = Math.max(0, tradesAll - preSnap.trades);
  const liveWinsCount = Math.max(0, winsAll - preSnap.wins);
  const liveSl = Math.max(0, engine.ledger.slExits - preSnap.slExits);
  const liveTp = Math.max(0, engine.ledger.tpExits - preSnap.tpExits);
  const liveRealized = liveProfit - liveLoss;
  const livePf = profitFactor(liveRatioP, liveRatioL);
  const liveWr = liveTrades ? liveWinsCount / liveTrades : 0;
  const liveMdd = scoredMaxDd;
  if ((prehours > 0 ? liveTrades : tradesAll) < 1) issues.push("No closed trades");
  if (hours >= 8) {
    if ((prehours > 0 ? liveSl : engine.ledger.slExits) < 1) issues.push("No stop-loss exits");
    if ((prehours > 0 ? liveTp : engine.ledger.tpExits) < 1) issues.push("No take-profit exits");
  }
  const trades = prehours > 0 ? liveTrades : tradesAll;
  const wins = prehours > 0 ? liveWinsCount : winsAll;
  const liveProfitRep = prehours > 0 ? liveProfit : profit;
  const liveLossRep = prehours > 0 ? liveLoss : loss;
  const bySymbol = [...scoredSymbols.values()].map((s) => ({
    id: s.id,
    trades: s.trades,
    net: s.profit - s.loss,
    wr: s.trades ? s.wins / s.trades : 0,
    pf: profitFactor(s.gp, s.gl),
    returnProfit: s.gp,
    returnLoss: s.gl,
    sl: s.sl,
    tp: s.tp
  })).sort((a, b) => b.net - a.net);
  const coverRows = (rows: ReturnType<typeof finish>, keys: readonly string[]) => {
    const have = new Set(rows.map((r) => r.id));
    const extra = keys
      .filter((id) => !have.has(id))
      .map((id) => ({ id, n: 0, wins: 0, profit: 0, loss: 0, pf: 0, wr: 0 }));
    return [...rows, ...extra];
  };
  const byIndication = coverRows(finish(indAcc), allEngineIndications(engine));
  const byTactic = coverRows(finish(tacAcc), ["trailing", "axis", "hybrid", "dca"]);
  const byPlaybook = coverRows(finish(playAcc), ["short", "block", "axis", "normal", "dca"]);
  const byPlayInd = finish(playIndAcc);
  const byKind = finish(kindAcc);
  const byRange = coverRows(finish(rangeAcc), RANGE_TYPES);
  applySimFloors();
  const avgR = rN ? rSum / rN : 0;
  const rHist = rSlots.map(({ bin, n }) => ({
    bin,
    n
  }));
  const deskClosed = engine.closed.filter((c) => deskTapeRow(engine, c));
  const lastNSnap = (n: number) => {
  const rows = deskClosed.filter((c) => !complete || c.validExec === true).slice(0, n);
    const st = laneLastNStats(rows);
    return { n: st.n, pf: st.pf, net: st.net, avg: st.avg };
  };
  const ln = lastNProgressOf(engine);
  const lastNByIndication: Record<string, { eval: ReturnType<typeof lastNSnap>; valid: ReturnType<typeof lastNSnap>; exec: ReturnType<typeof lastNSnap>; disable: ReturnType<typeof lastNSnap> }> = {};
  const seenInd = new Set<string>();
  for (const c of deskClosed) {
    const id = String(c.indication || "trend");
    if (seenInd.has(id)) continue;
    seenInd.add(id);
    lastNByIndication[id] = {
      eval: laneLastNStats(laneClosed(engine, { indication: id }, EVAL_POS_N)),
      valid: laneLastNStats(laneClosed(engine, { indication: id }, VALID_EXEC_POS_N)),
      exec: laneLastNStats(laneClosed(engine, { indication: id }, VALID_EXEC_POS_N)),
      disable: laneLastNStats(laneClosed(engine, { indication: id }, LIVE_DISABLE_N)),
    };
  }
  for (const id of allEngineIndications(engine)) {
    if (lastNByIndication[id]) continue;
    const empty = laneLastNStats([]);
    lastNByIndication[id] = { eval: empty, valid: empty, exec: empty, disable: empty };
  }
  const liveTapeRows = deskClosed.filter((c) => (c.tick || 0) > preTicks);
  const gatedRows = liveTapeRows.filter((c) => c.validExec === true);
  const keptGate = gatedRows.filter((c) => {
    if (c.protect || c.tpAtr == null || c.slOfTp == null) return false;
    const key = shortComboKey(c.tpAtr, c.slOfTp);
    const liveSt = comboTapeStats(engine.shortComboLiveTape?.[key]);
    if (liveSt.n >= 8) return liveSt.pf + 1e-9 >= BASE_STAGE_PF && liveSt.net > 0;
    const preSt = comboTapeStats(engine.shortComboPreTape?.[key]);
    return preSt.n >= 8 && preSt.pf + 1e-9 >= BASE_STAGE_PF && preSt.net > 0;
  });
  const keptStats = comboTapeStats(keptGate);
  const liveGated = {
    n: keptStats.n,
    pf: keptStats.n >= 4 ? keptStats.pf : 0,
    net: keptStats.net,
    avg: keptStats.n ? keptStats.net / keptStats.n : 0,
    of: liveTapeRows.length,
  };
  const picked = selectMinPfCells(engine, byPlaybook, byPlayInd);
  const selPlayIds = new Set(picked.cells.filter((c) => !String(c.id).includes(":")).map((c) => c.id));
  const selPlayIndIds = new Set(picked.cells.filter((c) => String(c.id).includes(":")).map((c) => c.id));
  let greenHours = 0;
  for (const h of hourly as Array<{
    net?: number;
    plays?: Record<string, { n?: number; profit?: number; loss?: number; net?: number }>;
    playInds?: Record<string, { n?: number; profit?: number; loss?: number; net?: number }>;
    selNet?: number;
    selPf?: number;
    selN?: number;
    gatedN?: number;
    gatedNet?: number;
  }>) {
    let gp = 0;
    let gl = 0;
    let sn = 0;
    for (const id of selPlayIds) {
      const r = h.plays?.[id];
      if (!r) continue;
      gp += Number(r.profit) || 0;
      gl += Number(r.loss) || 0;
      sn += Number(r.n) || 0;
    }
    for (const id of selPlayIndIds) {
      const r = h.playInds?.[id];
      if (!r) continue;
      gp += Number(r.profit) || 0;
      gl += Number(r.loss) || 0;
      sn += Number(r.n) || 0;
    }
    h.selNet = gp - gl;
    h.selPf = profitFactor(gp, gl);
    h.selN = sn;
    const shown = Number(h.net);
    const nTrades = Number((h as { trades?: number }).trades) || Number(h.gatedN) || 0;
    if (nTrades > 0 && shown >= -1e-9) greenHours += 1;
  }
  const selected = {
    n: picked.n,
    pf: picked.pf,
    net: picked.net,
    avg: picked.avg,
    of: liveTapeRows.length,
    keys: picked.keys,
    greenHours,
    hours: hourly.length,
  };
  // Executed headline statistics use every owned close in the scored interval. Selection,
  // candidate-stage and final winning-subset diagnostics must never replace this cohort.
  const paperPf = livePf;
  const reportPf = livePf;
  const floors = {
    overall: minPfFor(engine, "overall"),
    base: minPfFor(engine, engine.shortRange ? "shortBase" : "base"),
    short: minPfFor(engine, "short"),
    block: minPfFor(engine, "block"),
    axis: minPfFor(engine, "axis"),
  };
  const reportWr = prehours > 0 ? liveWr : engine.stats.wr;
  const reportNet = engine.stats.equity - startEq;
  const reportMdd = prehours > 0 ? liveMdd : engine.stats.mdd;
  const report = {
    hours,
    ticks,
    symbols: engine.symbolCount,
    trades,
    wins,
    wr: reportWr,
    pf: reportPf,
    cashPf: profitFactor(liveProfitRep, liveLossRep),
    returnProfit: liveRatioP,
    returnLoss: liveRatioL,
    settledSlices: [...scoredSymbols.values()].reduce((n, row) => n + row.trades, 0),
    qualification: prehours > 0 ? "post-base" as const : "discovery" as const,
    sampleCoverage: lastNSampleCoverage(engine),
    prehistorySampleCoverage,
    statisticsScope: prehours > 0
      ? "Synthetic model: owned settled slices after Base; prehistory and selected subsets excluded"
      : "Synthetic discovery only: no completed Base qualification; not a live-readiness result",
    net: reportNet,
    netScope: "Modeled marked equity change; includes open positions and retained discovery inventory",
    settledNet: liveRealized,
    markedMinusSettledNet: reportNet - liveRealized,
    mdd: reportMdd,
    equity: engine.stats.equity,
    slExits: prehours > 0 ? liveSl : engine.ledger.slExits,
    tpExits: prehours > 0 ? liveTp : engine.ledger.tpExits,
    openPositions: engine.positions.length,
    openOrders: engine.stats.openOrders,
    maxPositionsSeen: scoredMaxPositions,
    maxOrdersSeen: scoredMaxOrders,
    capRejects: engine.ledger.capRejects - preCapRejects,
    rateSkips: engine.ledger.rateSkips - preRateSkips,
    ratioViolations: audit.ratioViolations,
    negativePx: audit.negativePx,
    nanCount: audit.nanCount,
    passed: issues.length === 0,
    issues,
    curve,
    expectancy: trades ? (prehours > 0 ? liveRealized : engine.stats.net) / trades : 0,
    avgWin: wins ? liveProfitRep / wins : 0,
    avgLoss: trades - wins ? liveLossRep / (trades - wins) : 0,
    recovery: reportMdd > 1e-9 ? (prehours > 0 ? liveRealized : engine.stats.net) / (reportMdd * startEq) : (prehours > 0 ? liveRealized : engine.stats.net) > 0 ? 8 : 0,
    profit: liveProfitRep,
    loss: liveLossRep,
    maxWinStreak: scoredMaxWins,
    maxLossStreak: scoredMaxLosses,
    bySymbol,
    byIndication,
    byTactic,
    byPlaybook,
    byPlayInd,
    byKind,
    byRange,
    byProtectionRange: finish(protectionRangeAcc),
    ordersPlaced: Math.max(0, engine.ledger.ordersPlaced - (internStage.orders ?? 0)),
    ordersFilled: Math.max(0, engine.ledger.ordersFilled - (internStage.fills ?? 0)),
    hourly,
    intervals,
    avgR,
    rHist,
    book: bookCounts(engine),
    marks,
    ddt: engine.stats.ddt,
    avgPositions: ticks ? posSum / ticks : 0,
    avgOrders: ticks ? ordSum / ticks : 0,
    avgSlots: ticks ? slotSum / ticks : 0,
    avgBlockOrd: ticks ? blockOrdSum / ticks : 0,
    avgNotional: ticks ? notionalSum / ticks : 0,
    avgMargin: ticks ? marginSum / ticks : 0,
    maxMargin: maxMarginSeen,
    startEquity: startEq,
    costStep,
    unitNotional: positionNotional(startEq, costStep),
    realizedNet: liveRealized,
    prehours,
    pre: preSnap,
    lastN: {
      eval: lastNSnap(EVAL_POS_N),
      valid: lastNSnap(VALID_EXEC_POS_N),
      exec: lastNSnap(VALID_EXEC_POS_N),
      disable: lastNSnap(LIVE_DISABLE_N),
      byIndication: lastNByIndication,
      mode: ln.mode,
      evalNs: Object.fromEntries(ln.evalNs.map((n) => [n, lastNSnap(n)])),
      validNs: Object.fromEntries(ln.validNs.map((n) => [n, lastNSnap(n)])),
      disableNs: Object.fromEntries(ln.disableNs.map((n) => [n, lastNSnap(n)])),
      modes: engine.progressEval?.lastNModes,
      overall: engine.progressEval?.lastNOverall,
      complete: engine.progressEval?.lastNComplete,
    },
    disabled: Object.keys(engine.liveDisabled ?? {}),
    liveGated,
    selected,
    paperPf,
    greenHours,
    floors,
    stages: {
      intern: internStage,
      afterEval: afterEvalStage,
      afterTypes: afterTypesStage,
    },
    internOrders: internStage.orders ?? 0,
    livePlaced: Math.max(0, engine.ledger.ordersPlaced - (internStage.orders ?? 0)),
    liveFilled: Math.max(0, engine.ledger.ordersFilled - (internStage.fills ?? 0)),
    mixedLeaks: gatedRows.filter((c) => c.validExec !== true).length,
    basePositive: afterEvalStage.comboPositive ?? 0,
    calcDiff: calcDiffOf(engine),
    comboTapes: Object.fromEntries(
      [
        [0.48, 0.75],
        [0.42, 1.5],
        [0.48, 1],
      ].map(([tp, sl]) => {
        const k = shortComboKey(tp, sl);
        const rows = internStartRows(engine, k);
        return [k, { ...comboTapeStats(rows), ok: shortComboProven(engine, tp, sl) }];
      }),
    ),
    eqUse: engine.stats.equity > 0 ? maxMarginSeen / engine.stats.equity : 0,
  };
  engine.sim = report;
  engine.lastMsg = report.passed ? `${hours}h sim passed · ${report.trades} trades · PF ${report.pf.toFixed(2)}` : `${hours}h sim issues: ${issues.slice(0, 3).join("; ")}`;
  return {
    engine,
    report
  };
}

export type OverallBucket = {
  key: string;
  n: number;
  wins: number;
  pf: number;
  wr: number;
  net: number;
  ddt: number;
  mdd: number;
  symbols?: number;
  orders?: number;
  avgOrders?: number;
  avgPositions?: number;
  openN?: number;
};

export type ConfigCell = {
  tactic: TacticKind;
  range: RangeType;
  pf: number;
  wr: number;
  net: number;
  trades: number;
  ok: boolean;
  tpAtr?: number;
  slOfTp?: number;
  slAtr?: number;
  tpRatio?: number;
  shortRange?: boolean;
};

function pnlBucket(rows: { pnl: number; ratio?: number }[], key = "all"): OverallBucket {
  const n = rows.length;
  let wins = 0;
  let profit = 0;
  let loss = 0;
  let net = 0;
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  let dd = 0;
  let maxDd = 0;
  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    const dollars = Number(row.pnl) || 0;
    const ratio = Number(row.ratio);
    const edge = Number.isFinite(ratio) ? ratio : dollars;
    net += dollars;
    if (edge > 0) {
      wins += 1;
      profit += edge;
    } else if (edge < 0) {
      loss -= edge;
    }
  }
  const usedRatio = rows.some((r) => Number.isFinite(Number(r.ratio)));
  const pf = usedRatio ? ratioProfitFactor(profit, loss, wins) : profitFactor(profit, loss);
  for (let i = n - 1; i >= 0; i--) {
    eq += Number(rows[i]!.pnl) || 0;
    if (eq > peak) peak = eq;
    const d = peak > 0 ? Math.min(1, Math.max(0, (peak - eq) / Math.max(peak, 1e-9))) : 0;
    if (d > mdd) mdd = d;
    if (d > 1e-9) {
      dd += 1;
      if (dd > maxDd) maxDd = dd;
    } else dd = 0;
  }
  return {
    key,
    n,
    wins,
    pf: Number.isFinite(pf) ? pf : 0,
    wr: n ? wins / n : 0,
    net,
    ddt: maxDd,
    mdd,
  };
}

export const LIVE_POS_NS = [5, 10, 12, 15, 30, 40, 120, 650] as const;
export const LIVE_HOUR_NS = [1, 2, 4, 6, 8, 12, 45, 50] as const;
export const LIVE_INTERVAL_MINS = [20] as const;
export const OVERVIEW_POS_NS = [12, 40, 120, 650] as const;
export const OVERVIEW_HOUR_NS = [2, 6, 12, 45] as const;
export const LIVE_POS_LABELS: Record<string, string> = Object.fromEntries(LIVE_POS_NS.map((n) => [`n${n}`, `Last ${n}`]));

export type LivePnlRow = { t: number; v: number; symbol?: string; side?: "long" | "short"; indication?: string; playbook?: string; kind?: string; tactic?: string };
export type WindowPoint = { i: number; eq: number; dd: number; pf: number; vol: number; net: number };

function finitePnl(pnl: LivePnlRow[]) {
  return pnl.filter((r) => Number.isFinite(Number(r.v)) && Number.isFinite(Number(r.t)));
}

/** Chronological equity / rolling PF / drawdown / |pnl| volume for the newest `n` closes. */
export function tapeWindowCurve(pnl: LivePnlRow[], n: number): WindowPoint[] {
  const newest = finitePnl(pnl)
    .sort((a, b) => Number(b.t) - Number(a.t))
    .slice(0, Math.max(1, Math.round(n)));
  const chrono = [...newest].reverse();
  let eq = 0;
  let peak = 0;
  let gp = 0;
  let gl = 0;
  let vol = 0;
  const out: WindowPoint[] = [];
  for (let i = 0; i < chrono.length; i++) {
    const v = Number(chrono[i]!.v) || 0;
    eq += v;
    vol += Math.abs(v);
    if (v > 0) gp += v;
    else if (v < 0) gl -= v;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? Math.min(1, Math.max(0, (peak - eq) / Math.max(peak, 1e-9))) : 0;
    out.push({ i: i + 1, eq, dd, pf: profitFactor(gp, gl), vol, net: eq });
  }
  return out;
}

export function tapeHourCurve(pnl: LivePnlRow[], hours: number, now = Date.now()): WindowPoint[] {
  const since = now - Math.max(0.1, hours) * 3_600_000;
  return tapeWindowCurve(
    finitePnl(pnl).filter((r) => Number(r.t) >= since),
    10_000,
  );
}

/** Desk closes as a tape. `v` is the position ratio when the close has one, else dollars. `t` is the engine tick. */
export function overviewTape(e: VstEngine): LivePnlRow[] {
  const conn = isDeskConn(e.activeConnId) ? e.activeConnId : undefined;
  const out: LivePnlRow[] = [];
  for (const c of e.closed) {
    if (!ownedByDesk(c, conn) || !deskTapeRow(e, c) || c.protect) continue;
    const ratio = Number(c.ratio);
    out.push({
      t: c.tick,
      v: Number.isFinite(ratio) ? ratio : Number(c.pnl) || 0,
      symbol: c.symbol,
      side: c.side,
      indication: c.indication,
      playbook: c.playbook,
      kind: c.kind,
      tactic: c.tactic,
    });
  }
  return out;
}

/** Hour window from engine ticks (60 ticks = 1h), not wall clock. */
export function overviewHourCurve(e: VstEngine, hours: number, tape?: LivePnlRow[]): WindowPoint[] {
  const rows = tape ?? overviewTape(e);
  const minTick = e.tick - Math.max(1, hours) * TICKS_PER_HOUR;
  return tapeWindowCurve(rows.filter((r) => r.t >= minTick), 10_000);
}

export function overlayWindowCurves(pnl: LivePnlRow[], now = Date.now()) {
  const pos = Object.fromEntries(OVERVIEW_POS_NS.map((n) => [String(n), tapeWindowCurve(pnl, n)]));
  const hours = Object.fromEntries(OVERVIEW_HOUR_NS.map((h) => [String(h), tapeHourCurve(pnl, h, now)]));
  return { pos, hours };
}

/** Overlay BingX realized PnL onto last-N and hour windows (paper closed is ignored). */
export function overlayLiveExecutions(
  stats: {
    lastN?: Record<string, OverallBucket>;
    hours?: Record<string, OverallBucket>;
    intervals?: Record<string, OverallBucket>;
    bySymbol?: OverallBucket[];
    bySide?: OverallBucket[];
    byIndication?: OverallBucket[];
    byKind?: OverallBucket[];
    byTactic?: OverallBucket[];
    byPlaybook?: OverallBucket[];
    byRange?: OverallBucket[];
  },
  pnl: LivePnlRow[],
  now = Date.now(),
  e?: VstEngine,
) {
  if (!stats || !Array.isArray(pnl) || !pnl.length) return stats;
  const newest = pnl
    .filter((r) => Number.isFinite(Number(r.v)) && Number.isFinite(Number(r.t)))
    .sort((a, b) => Number(b.t) - Number(a.t));
  if (!newest.length) return stats;
  const asRows = (rows: LivePnlRow[]) => rows.map((r) => ({ pnl: Number(r.v) || 0 }));
  if (stats.lastN) {
    for (const n of LIVE_POS_NS) {
      const take = newest.slice(0, n);
      if (take.length) stats.lastN[String(n)] = pnlBucket(asRows(take), `n${n}`);
    }
  }
  if (stats.hours) {
    for (const h of LIVE_HOUR_NS) {
      const since = now - h * 3_600_000;
      const take = newest.filter((r) => Number(r.t) >= since);
      const b = pnlBucket(asRows(take), `${h}h`);
      const symbols = new Set(take.map((r) => String(r.symbol || "")).filter(Boolean)).size;
      const act = e ? orderWindow(e, h * 60) : null;
      const prev = stats.hours[String(h)];
      stats.hours[String(h)] = {
        ...b,
        symbols,
        orders: act ? act.placed : prev?.orders ?? 0,
        avgOrders: act ? act.placed / Math.max(h, 1) : prev?.avgOrders ?? 0,
      };
    }
  }
  if (stats.intervals) {
    for (const m of LIVE_INTERVAL_MINS) {
      const since = now - m * 60_000;
      const take = newest.filter((r) => Number(r.t) >= since);
      const b = pnlBucket(asRows(take), `${m}m`);
      const symbols = new Set(take.map((r) => String(r.symbol || "")).filter(Boolean)).size;
      const act = e ? orderWindow(e, m) : null;
      const prev = stats.intervals[String(m)];
      stats.intervals[String(m)] = {
        ...b,
        symbols,
        orders: act ? act.placed : prev?.orders ?? 0,
        avgOrders: act ? act.placed : prev?.avgOrders ?? 0,
      };
    }
  }
  if (stats.bySymbol) {
    const map = new Map<string, LivePnlRow[]>();
    for (const r of newest) {
      const s = String(r.symbol || "");
      if (!s) continue;
      const arr = map.get(s) ?? [];
      arr.push(r);
      map.set(s, arr);
    }
    stats.bySymbol = [...map.entries()]
      .map(([k, rows]) => pnlBucket(asRows(rows), k))
      .sort((a, b) => b.net - a.net);
  }
  const tagOf = (r: LivePnlRow) => {
    const symbol = String(r.symbol || "");
    const hint = e?.liveLegHint?.[symbol];
    const closed = e?.closed.find((c) => c.symbol === symbol && Math.abs(Number(c.at || 0) - Number(r.t)) < 180_000);
    return {
      side: String(r.side || closed?.side || hint?.side || ""),
      indication: String(r.indication || closed?.indication || hint?.indication || ""),
      tactic: String(r.tactic || closed?.tactic || hint?.tactic || ""),
      playbook: String(r.playbook || closed?.playbook || hint?.playbook || ""),
      kind: String(r.kind || closed?.kind || hint?.kind || ""),
    };
  };
  const overlayNamed = <K extends string>(
    dest: OverallBucket[] | undefined,
    keys: readonly K[],
    pick: (t: ReturnType<typeof tagOf>) => string,
  ) => {
    if (!dest) return dest;
    if (!newest.some((r) => pick(tagOf(r)))) return dest;
    return keys.map((k) => pnlBucket(asRows(newest.filter((r) => pick(tagOf(r)) === k)), k));
  };
  stats.bySide = overlayNamed(stats.bySide, ["long", "short"] as const, (t) => t.side);
  stats.byIndication = overlayNamed(stats.byIndication, allEngineIndications(e), (t) => t.indication);
  stats.byTactic = overlayNamed(stats.byTactic, ["trailing", "dca", "axis", "hybrid"] as const, (t) => t.tactic);
  stats.byPlaybook = overlayNamed(stats.byPlaybook, ["normal", "axis", "block", "dca", "short"] as const, (t) => t.playbook);
  stats.byKind = overlayNamed(
    stats.byKind,
    ["normal", "trend", "mean", "breakout", "volume", "hybrid", "active", "block", "short"] as const,
    (t) => t.kind,
  );
  return stats;
}

export type PlaybookDetail = OverallBucket & {
  active: OverallBucket;
  steps: OverallBucket[];
};

function windowHours<T extends { tick: number; at?: number }>(rows: T[], nowTick: number, hours: number) {
  const dated = rows.filter((c) => typeof c.at === "number" && c.at > 0);
  let span = 0;
  if (dated.length >= 3) {
    let minAt = Infinity;
    let maxAt = 0;
    for (const c of dated) {
      const t = Number(c.at);
      if (t < minAt) minAt = t;
      if (t > maxAt) maxAt = t;
    }
    span = maxAt - minAt;
  }
  if (span >= hours * 3_600_000 * 0.25) {
    const cutoff = Date.now() - hours * 3_600_000;
    return rows.filter((c) => Number(c.at ?? 0) >= cutoff);
  }
  const minTick = nowTick - hours * TICKS_PER_HOUR;
  return rows.filter((c) => c.tick >= minTick);
}

function hourBucket(e: VstEngine, hours: number): OverallBucket {
  const conn = isDeskConn(e.activeConnId) ? e.activeConnId : undefined;
  const rows = windowHours(
    e.closed.filter((c) => ownedByDesk(c, conn) && deskTapeRow(e, c) && !c.protect),
    e.tick,
    hours,
  );
  const base = pnlBucket(rows, `${hours}h`);
  const symbols = new Set(rows.map((c) => c.symbol)).size;
  const act = orderWindow(e, hours * 60);
  const orders = act.placed;
  const spanH = Math.max(1 / 60, Math.min(hours, Math.max(e.tick, 1) / TICKS_PER_HOUR));
  const avgOrders = orders / spanH;
  return {
    ...base,
    symbols,
    orders,
    avgOrders,
  };
}

function windowMinutes<T extends { tick: number; at?: number; connId?: string }>(rows: T[], nowTick: number, minutes: number) {
  const desk = rows.filter((c) => !c.connId || isDeskConn(c.connId));
  const dated = desk.filter((c) => typeof c.at === "number" && c.at > 0);
  let span = 0;
  if (dated.length >= 3) {
    let minAt = Infinity;
    let maxAt = 0;
    for (const c of dated) {
      const t = Number(c.at);
      if (t < minAt) minAt = t;
      if (t > maxAt) maxAt = t;
    }
    span = maxAt - minAt;
  }
  if (span >= minutes * 60_000 * 0.25) {
    const cutoff = Date.now() - minutes * 60_000;
    return desk.filter((c) => Number(c.at ?? 0) >= cutoff);
  }
  const minTick = nowTick - minutes;
  return desk.filter((c) => c.tick >= minTick);
}

function intervalBucket(e: VstEngine, minutes: number): OverallBucket {
  const conn = isDeskConn(e.activeConnId) ? e.activeConnId : undefined;
  const scoped = e.closed.filter((c) => ownedByDesk(c, conn) && deskTapeRow(e, c) && !c.protect);
  const rows = windowMinutes(scoped, e.tick, minutes);
  const base = pnlBucket(rows, `${minutes}m`);
  const symbols = new Set(rows.map((c) => (c as { symbol?: string }).symbol).filter(Boolean)).size;
  const act = orderWindow(e, minutes);
  return { ...base, symbols, orders: act.placed, avgOrders: act.placed };
}

type SeedableStats = {
  researchSeeded?: boolean;
  hours?: Record<string, OverallBucket>;
  lastN?: Record<string, OverallBucket>;
  overall?: OverallBucket;
  trades?: number;
  pf?: number;
  wr?: number;
  net?: number;
  avgConfigPf?: number;
};

export function seedStatsFromComplete(stats: SeedableStats, e: VstEngine): SeedableStats {
  if (e?.liveTape) return stats;
  const winner = (e as { completeWinner?: CompleteCell }).completeWinner;
  const cells = (e as { completeCells?: CompleteCell[] }).completeCells ?? [];
  if (!winner && !cells.length) return stats;
  stats.researchSeeded = true;
  const byH = new Map<number, CompleteCell>();
  for (const c of cells) {
    const h = Number(c.hours);
    if (!Number.isFinite(h)) continue;
    const prev = byH.get(h);
    if (!prev || c.pf > prev.pf) byH.set(h, c);
  }
  const nearest = (h: number): CompleteCell | undefined => {
    if (byH.has(h)) return byH.get(h);
    let best: CompleteCell | undefined;
    let dist = Infinity;
    for (const [k, c] of byH) {
      const d = Math.abs(k - h);
      if (d < dist) {
        dist = d;
        best = c;
      }
    }
    return best ?? winner;
  };
  const fillBucket = (b: OverallBucket | undefined, cell: CompleteCell | undefined, take?: number) => {
    if (!b || !cell) return;
    if ((b.n || 0) > 0) return;
    const n = Math.max(1, take ?? cell.trades ?? 0);
    b.n = n;
    b.wins = Math.round((cell.wr || 0) * n);
    b.pf = cell.pf;
    b.wr = cell.wr;
    b.net = cell.net;
    b.mdd = cell.mdd ?? b.mdd;
  };
  if (stats.hours) {
    for (const key of Object.keys(stats.hours)) {
      fillBucket(stats.hours[key], nearest(Number(key)));
    }
  }
  if (stats.lastN && winner) {
    for (const key of Object.keys(stats.lastN)) {
      const take = Number(String(key).replace(/\D/g, "")) || winner.trades;
      fillBucket(stats.lastN[key], winner, Math.min(take, winner.trades || take));
    }
  }
  if (!(Number(stats.trades) > 0) && winner && winner.pf > 0) {
    stats.pf = winner.pf;
    stats.wr = winner.wr;
    stats.net = winner.net;
    stats.trades = winner.trades;
    stats.avgConfigPf = stats.avgConfigPf || winner.pf;
    if (stats.overall && !(stats.overall.n > 0)) {
      fillBucket(stats.overall, winner);
    }
  }
  return stats;
}

export function overallLiveStats(e: VstEngine, opts?: { seed?: boolean }) {
  const conn = isDeskConn(e.activeConnId) ? e.activeConnId : undefined;
  const closed = e.closed.filter((c) => ownedByDesk(c, conn) && deskTapeRow(e, c) && !c.protect);
  const deskPos = e.positions.filter((p) => ownedByDesk(p, conn));
  const bySymbol: OverallBucket[] = Object.values(e.symbolStats)
    .map((s) => {
      const ratioN = (s.ratioProfit ?? 0) + (s.ratioLoss ?? 0);
      const gp = ratioN > 0 ? (s.ratioProfit ?? 0) : s.profit;
      const gl = ratioN > 0 ? (s.ratioLoss ?? 0) : s.loss;
      const pf = ratioN > 0 ? ratioProfitFactor(gp, gl, s.wins) : profitFactor(gp, gl);
      return {
        key: s.id,
        n: s.trades,
        wins: s.wins,
        pf: Number.isFinite(pf) ? pf : 0,
        wr: s.trades ? s.wins / s.trades : 0,
        net: s.profit - s.loss,
        ddt: 0,
        mdd: 0,
      };
    })
    .sort((a, b) => b.net - a.net);
  const rankedPf = [...bySymbol].filter((s) => s.n >= 2).sort((a, b) => b.pf - a.pf || b.net - a.net);
  const byReason = (["sl", "tp", "time"] as const).map((k) =>
    pnlBucket(closed.filter((c) => c.reason === k), k),
  );
  const bySide = (["long", "short"] as const).map((k) => pnlBucket(closed.filter((c) => (c.side || "long") === k), k));
  const byIndication = allEngineIndications(e).map((k) =>
    pnlBucket(closed.filter((c) => (c.indication || "trend") === k), k),
  );
  const byKind = (["normal", "trend", "mean", "breakout", "volume", "hybrid", "active", "block", "short"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.kind || "normal") === k), k),
  );
  const byTactic = (["trailing", "dca", "axis", "hybrid"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.tactic || e.lastTactic || "trailing") === k), k),
  );
  const bookKeys = ["normal", "axis", "block", "dca", "short"] as const;
  const seenBooks = new Set<string>(bookKeys);
  for (const c of closed) {
    const k = String(c.playbook || "");
    if (k) seenBooks.add(k);
  }
  const byPlaybook = [...seenBooks].map((k) =>
    pnlBucket(closed.filter((c) => (c.playbook || "normal") === k), k),
  );
  const byRange = (["linear", "geometric", "atr", "volume", "fibonacci"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.rangeType || e.lastRange || "atr") === k), k),
  );
  const playbooks: PlaybookDetail[] = (["normal", "axis", "block", "dca", "short"] as const).map((k) => {
    const rows = closed.filter((c) => (c.playbook || "normal") === k);
    const active = rows.filter((c) => c.indication === "active" || c.kind === "active");
    const maxStep = k === "block" || k === "dca" || k === "axis" ? 6 : 0;
    const steps = maxStep
      ? Array.from({ length: maxStep }, (_, i) =>
          pnlBucket(
            rows.filter((c) => (c.level ?? 1) === i + 1),
            `${k}:${i + 1}`,
          ),
        )
      : [];
    return { ...pnlBucket(rows, k), active: pnlBucket(active, `${k}:active`), steps };
  });
  const lastN = Object.fromEntries(
    LIVE_POS_NS.map((n) => [String(n), pnlBucket(closed.slice(0, n), `n${n}`)]),
  ) as Record<string, OverallBucket>;
  const hours = Object.fromEntries(
    LIVE_HOUR_NS.map((h) => [String(h), hourBucket(e, h)]),
  ) as Record<string, OverallBucket>;
  const intervalMins = [intervalMinutesOf(e)];
  const intervals = Object.fromEntries(
    intervalMins.map((m) => [String(m), intervalBucket(e, m)]),
  ) as Record<string, OverallBucket>;
  const liveBuckets = [...byPlaybook, ...byIndication, ...byTactic, ...byRange].filter((b) => b.n > 0);
  const open = pnlBucket(
    deskPos.map((p) => ({ pnl: p.unrealized + p.realized })),
    "open",
  );
  const ov = pnlBucket(closed, "closed");
  const workingOrders = e.orders.filter((o) => ownedByDesk(o, conn) && (o.status === "open" || o.status === "partial"));
  const working = workingOrders.length;
  const blockLive = collectBlockOrders(e, e.activeConnId);
  const blockPart = blockLive.filter((o) => o.status === "partial" || (o.filled > 0 && o.remaining > 1e-12));
  const blockClosed = closed.filter((c) => (c.blockQty || 0) > 0 || c.playbook === "block");
  const blockVol = deskPos.reduce((s, p) => s + (p.blockQty || 0), 0) + blockClosed.reduce((s, c) => s + (c.blockQty || 0), 0);
  const blockBucket = {
    ...pnlBucket(blockClosed, "block"),
    orders: blockLive.length,
    partials: blockPart.length,
    ids: blockLive.slice(0, 48).map((o) => o.id),
    volume: blockVol,
    queued: e.queue.filter((o) => isBlockOrder(o) && ownedByDesk(o, conn)).length,
    overall: e.blockCfg?.overall !== false,
  };
  const activePos =
    (e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES).normal === false
      ? deskPos.filter((p) => (p.kind ?? "") !== "normal")
      : deskPos;
  const stats = {
    researchSeeded: false,
    overall: ov,
    open,
    bySymbol,
    byReason,
    bySide,
    byIndication,
    byKind,
    byTactic,
    byPlaybook,
    byRange,
    playbooks,
    lastN,
    hours,
    intervals,
    bestSymbols: rankedPf.slice(0, 6),
    worstSymbols: [...rankedPf].reverse().slice(0, 6),
    runningSymbols: new Set(activePos.map((p) => p.symbol)).size,
    avgPositions: activePos.length,
    avgOrders: orderWindow(e, 60).placed,
    maxPositions: e.ledger.maxPositions,
    maxOrders: e.ledger.maxOrders,
    configsLive: liveBuckets.length,
    configsActive: activePos.length,
    avgConfigPf: ov.pf,
    symbols: e.symbolCount,
    occupied: new Set(activePos.map((p) => p.symbol)).size,
    slots: activePos.length,
    trades: closed.length,
    pf: ov.pf,
    wr: ov.wr,
    net: ov.net,
    mdd: e.stats.mdd,
    ddt: e.stats.ddt ?? ov.ddt,
    block: blockBucket,
    intervalVolScale: e.intervalVolScale ?? intervalVolumeScale(e),
    intervalPf: e.intervalPf ?? lastIntervalStats(e).pf,
  };
  // Empty execution windows remain empty. A research preview must opt in explicitly.
  if (opts?.seed === true) seedStatsFromComplete(stats, e);
  return stats;
}

export function overlayExchangeBook(
  stats: ReturnType<typeof overallLiveStats>,
  book: Pick<ExchangeBook, "positions" | "orders"> | { positions?: ExchangeBook["positions"]; orders?: ExchangeBook["orders"] } | null | undefined,
  e: VstEngine,
): ReturnType<typeof overallLiveStats> {
  if (!stats) return stats;
  const conn = isDeskConn(e.activeConnId) ? e.activeConnId : undefined;
  const pos = (book?.positions ?? []).filter((p) => {
    if ((p as { owned?: boolean }).owned === false) return false;
    if (p.connId && conn && p.connId !== conn && isDeskConn(p.connId)) return false;
    return true;
  });
  const orders = (book?.orders ?? []).filter((o) => {
    if (o.owned === false) return false;
    if (o.clientOrderId && conn && !o.owned && o.clientOrderId) {
      const id = String(o.clientOrderId);
      if (id && !id.toUpperCase().startsWith("CTSA")) return false;
    }
    return true;
  });
  const occ = new Set(pos.map((p) => p.symbol).filter(Boolean));
  if (book && !pos.length) {
    stats.open = { key: "open", n: 0, wins: 0, pf: 0, wr: 0, net: 0, ddt: 0, mdd: 0, openN: 0 };
    stats.avgPositions = 0;
    stats.slots = 0;
    stats.configsActive = 0;
    stats.runningSymbols = 0;
    stats.occupied = 0;
  }
  if (occ.size) {
    stats.runningSymbols = occ.size;
    stats.occupied = occ.size;
  }
  if (pos.length) {
    stats.avgPositions = pos.length;
    stats.slots = pos.length;
    stats.configsActive = pos.length;
    stats.maxPositions = Math.max(Number(stats.maxPositions) || 0, pos.length);
  }
  if (orders.length) {
    stats.avgOrders = orders.length;
    stats.maxOrders = Math.max(Number(stats.maxOrders) || 0, orders.length);
  }
  const openRows = pos.map((p) => {
    const enginePos = e.positions.find((x) => x.symbol === p.symbol && x.side === p.side);
    const indication = enginePos?.indication || classifyIndication(e, p.symbol);
    const tactic = enginePos?.tactic || tacticForIndication(indication);
    const playbook = enginePos?.playbook && enginePos.playbook !== "normal"
      ? enginePos.playbook
      : liveExecPlaybook(e, tactic, indication, enginePos?.playbook);
    return {
      indication,
      kind: enginePos?.kind || kindFromIndication(indication, playbook, tactic),
      playbook,
      tactic,
      rangeType: enginePos?.controllingRange || pickIndicationRange(e, indication, e.lastRange),
      pnl: Number(p.pnl) || 0,
      symbol: p.symbol,
    };
  });
  const bump = (rows: OverallBucket[] | undefined, keyOf: (r: (typeof openRows)[number]) => string) => {
    if (!rows?.length) return;
    for (const b of rows) {
      const open = openRows.filter((r) => keyOf(r) === b.key);
      b.openN = open.length;
      if ((b.n || 0) === 0 && open.length) {
        b.openN = open.length;
      }
    }
  };
  bump(stats.byIndication, (r) => r.indication);
  bump(stats.byKind, (r) => r.kind);
  bump(stats.byTactic, (r) => r.tactic);
  bump(stats.byPlaybook, (r) => r.playbook);
  bump(stats.byRange, (r) => r.rangeType);
  if (stats.playbooks?.length) {
    for (const pb of stats.playbooks) {
      const open = openRows.filter((r) => r.playbook === pb.key);
      const wins = open.filter((o) => o.pnl > 0).length;
      const profit = open.filter((o) => o.pnl > 0).reduce((s, o) => s + o.pnl, 0);
      const loss = Math.abs(open.filter((o) => o.pnl < 0).reduce((s, o) => s + o.pnl, 0));
      pb.active = {
        key: `${pb.key}:active`,
        n: open.length,
        wins,
        pf: profitFactor(profit, loss),
        wr: open.length ? wins / open.length : 0,
        net: open.reduce((s, o) => s + o.pnl, 0),
        ddt: 0,
        mdd: 0,
        openN: open.length,
      };
      pb.openN = open.length;
    }
  }
  if (pos.length) {
    const wins = pos.filter((p) => (Number(p.pnl) || 0) > 0).length;
    const profit = pos.filter((p) => (Number(p.pnl) || 0) > 0).reduce((s, p) => s + (Number(p.pnl) || 0), 0);
    const loss = Math.abs(pos.filter((p) => (Number(p.pnl) || 0) < 0).reduce((s, p) => s + (Number(p.pnl) || 0), 0));
    const net = pos.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
    stats.open = {
      key: "open",
      n: pos.length,
      wins,
      pf: profitFactor(profit, loss),
      wr: pos.length ? wins / pos.length : 0,
      net,
      ddt: 0,
      mdd: 0,
      openN: pos.length,
    };
    const map = new Map((stats.bySymbol ?? []).map((s) => [s.key, { ...s }]));
    for (const p of pos) {
      const cur = map.get(p.symbol) ?? { key: p.symbol, n: 0, wins: 0, pf: 0, wr: 0, net: 0, ddt: 0, mdd: 0 };
      cur.openN = (cur.openN ?? 0) + 1;
      cur.net += Number(p.pnl) || 0;
      map.set(p.symbol, cur);
    }
    const bySymbol = [...map.values()].sort((a, b) => b.net - a.net);
    stats.bySymbol = bySymbol;
    const ranked = [...bySymbol].filter((s) => (s.n ?? 0) + (s.openN ?? 0) > 0).sort((a, b) => b.net - a.net);
    stats.bestSymbols = ranked.slice(0, 6);
    stats.worstSymbols = [...ranked].reverse().slice(0, 6);
  }
  const liveBuckets = [...(stats.byPlaybook ?? []), ...(stats.byIndication ?? []), ...(stats.byTactic ?? []), ...(stats.byRange ?? [])].filter(
    (b) => b.n > 0 || (b.openN ?? 0) > 0,
  );
  stats.configsLive = liveBuckets.length;
  stats.avgConfigPf = typeof stats.pf === "number" && stats.trades > 0 ? stats.pf : 0;
  if (stats.hours) {
    for (const b of Object.values(stats.hours)) {
      if (!b) continue;
      b.symbols = Math.max(b.symbols || 0, occ.size);
      b.orders = Math.max(b.orders || 0, orders.length);
      b.avgOrders = orders.length || b.avgOrders;
      b.openN = pos.length;
    }
  }
  if (stats.lastN) {
    for (const b of Object.values(stats.lastN)) {
      if (!b) continue;
      b.openN = pos.length;
    }
  }
  return stats;
}

export const LIVE_TACTICS: TacticKind[] = ["trailing", "axis", "hybrid"];

export function sweepBlockRelations(
  hours = 8,
  symbolCount = 8,
  cfg: TacticConfig = DEFAULT_CFG,
): {
  hours: number;
  symbolCount: number;
  at: number;
  runs: {
    tactic: TacticKind;
    range: RangeType;
    sides: "long" | "short" | "both";
    pf: number;
    wr: number;
    net: number;
    trades: number;
    blockN: number;
    relKeys: number;
    byIndication: { k: string; n: number; pf: number; net: number }[];
    byKind: { k: string; n: number; pf: number; net: number }[];
    byPlaybook: { k: string; n: number; pf: number; net: number }[];
  }[];
} {
  const pfOf = (rows: { pnl: number }[]) => {
    const gp = rows.filter((c) => c.pnl > 0).reduce((s, c) => s + c.pnl, 0);
    const gl = Math.abs(rows.filter((c) => c.pnl < 0).reduce((s, c) => s + c.pnl, 0));
    return {
      n: rows.length,
      net: rows.reduce((s, c) => s + c.pnl, 0),
      pf: profitFactor(gp, gl),
    };
  };
  const group = (rows: { pnl: number; indication?: string; kind?: string; playbook?: string }[], key: "indication" | "kind" | "playbook") => {
    const map = new Map<string, { pnl: number }[]>();
    for (const r of rows) {
      const k = String(r[key] ?? "_");
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    return [...map.entries()].map(([k, v]) => ({ k, ...pfOf(v) })).sort((a, b) => b.n - a.n);
  };
  const runs = [];
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      for (const sides of ["long", "short", "both"] as const) {
        const { report, engine } = simulateHours(hours, cfg, tactic, {
          symbolCount,
          rangeType: range,
          block: { ...DEFAULT_BLOCK_CONFIG, sides, volumeMode: "shared", stack: true, windows: true },
        });
        const closed = engine.closed;
        const blockN = closed.filter((c) => c.playbook === "block").length;
        runs.push({
          tactic,
          range,
          sides,
          pf: report.pf,
          wr: report.wr,
          net: report.net,
          trades: report.trades,
          blockN,
          relKeys: Object.keys(engine.blockRelWindows ?? {}).length,
          byIndication: group(closed, "indication"),
          byKind: group(closed, "kind"),
          byPlaybook: group(closed, "playbook"),
        });
      }
    }
  }
  return { hours, symbolCount, at: Date.now(), runs };
}

export function sweepAllConfigs(
  hours = 8,
  symbolCount = 12,
  cfg: TacticConfig = DEFAULT_CFG,
): { hours: number; symbolCount: number; at: number; cells: ConfigCell[]; winner: ConfigCell | null } {
  const cells: ConfigCell[] = [];
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      const { report } = simulateHours(hours, cfg, tactic, { symbolCount, rangeType: range });
      cells.push({
        tactic,
        range,
        pf: report.pf,
        wr: report.wr,
        net: report.net,
        trades: report.trades,
        ok: cellPass(report.pf, report.net, report.trades, 8, cfg),
      });
    }
  }
  const winner = [...cells].sort((a, b) => b.pf - a.pf || b.net - a.net)[0] ?? null;
  return { hours, symbolCount, at: Date.now(), cells, winner };
}

export function sweepPlaybooks(
  hours = 8,
  symbolCount = 12,
  cfg: TacticConfig = DEFAULT_CFG,
): { hours: number; at: number; books: (OverallBucket & { tactic: TacticKind; range: RangeType })[] } {
  const specs: { key: string; tactic: TacticKind; range: RangeType; block?: boolean }[] = [
    { key: "normal", tactic: "hybrid", range: "volume" },
    { key: "axis", tactic: "axis", range: "atr" },
    { key: "block", tactic: "hybrid", range: "volume", block: true },
  ];
  const books = specs.map((s) => {
    const { engine, report } = simulateHours(hours, cfg, s.tactic, { symbolCount, rangeType: s.range });
    if (s.block) {
      for (let i = 0; i < 8; i++) {
        tickVst(engine, cfg, s.tactic, { rangeType: s.range, block: { ...DEFAULT_BLOCK_CONFIG, enabled: true, endStageOnly: false, cadence: 4 }, endStage: true });
      }
    }
    const live = overallLiveStats(engine);
    return {
      ...pnlBucket(engine.closed, s.key),
      tactic: s.tactic,
      range: s.range,
      pf: report.pf || live.pf,
      wr: report.wr || live.wr,
      net: report.net || live.net,
      n: report.trades || live.trades,
      mdd: report.mdd || live.mdd,
      ddt: live.ddt,
    };
  });
  return { hours, at: Date.now(), books };
}

export type CompleteCell = ConfigCell & { hours: number; mdd: number };

export type CompleteComputeReport = {
  at: number;
  hours: number[];
  prehours: number;
  symbolCount: number;
  cells: CompleteCell[];
  byHours: Record<string, { winner: CompleteCell | null; ok: number; n: number; avgPf: number }>;
  winner: CompleteCell | null;
  playbooks: ReturnType<typeof sweepPlaybooks>;
  indications: OverallBucket[];
  kinds: OverallBucket[];
  elapsedMs: number;
  /** One book with every tactic, range and indication after the prehistoric window. */
  full?: { prehours: number; hours: number; pf: number; wr: number; net: number; trades: number; mdd: number; ok: boolean };
};

function cellPass(pf: number, net: number, trades: number, minTrades: number, cfg?: TacticConfig) {
  const floor = cfgUsesShortRange(cfg) ? DEFAULT_SHORT_BASE_PF : 1;
  return pf + 1e-9 >= floor && net > 0 && trades >= minTrades;
}

function cellFromRows(
  rows: { pnl: number }[],
  tactic: TacticKind,
  range: RangeType,
  hours: number,
  mdd: number,
  cfg?: TacticConfig,
): CompleteCell {
  const profit = rows.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const loss = Math.abs(rows.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const pf = profitFactor(profit, loss);
  const wins = rows.filter((t) => t.pnl > 0).length;
  const net = profit - loss;
  return {
    tactic,
    range,
    hours,
    pf: Number.isFinite(pf) ? pf : 0,
    wr: rows.length ? wins / rows.length : 0,
    net,
    trades: rows.length,
    mdd,
    ok: cellPass(pf, net, rows.length, 4, cfg),
  };
}

function oneCompleteCell(
  cfg: TacticConfig,
  tactic: TacticKind,
  range: RangeType,
  hours: number,
  symbolCount: number,
): CompleteCell {
  const span = hours < 8 ? 16 : hours;
  const { engine, report } = simulateHours(span, cfg, tactic, { symbolCount, rangeType: range });
  if (span === hours) {
    return {
      tactic,
      range,
      hours,
      pf: report.pf,
      wr: report.wr,
      net: report.net,
      trades: report.trades,
      mdd: report.mdd,
      ok: cellPass(report.pf, report.net, report.trades, 4, cfg),
    };
  }
  const minTick = engine.tick - hours * TICKS_PER_HOUR;
  return cellFromRows(
    engine.closed.filter((c) => c.tick >= minTick),
    tactic,
    range,
    hours,
    report.mdd,
    cfg,
  );
}

function completeCellsForPair(
  cfg: TacticConfig,
  tactic: TacticKind,
  range: RangeType,
  hours: number[],
  symbolCount: number,
  sim?: { prehours?: number; complete?: boolean; strategyToggles?: Partial<StrategyToggles> },
): CompleteCell[] {
  const prehours = Math.max(0, Math.round(sim?.prehours ?? 0));
  const need = Math.max(...hours, hours.some((h) => h < 8) ? 16 : 0);
  const { engine, report } = simulateHours(need, cfg, tactic, {
    symbolCount,
    rangeType: range,
    prehours,
    complete: Boolean(sim?.complete),
    strategyToggles: sim?.strategyToggles,
  });
  return hours.map((h) => {
    if (h >= need) {
      return {
        tactic,
        range,
        hours: h,
        pf: report.pf,
        wr: report.wr,
        net: report.net,
        trades: report.trades,
        mdd: report.mdd,
        ok: cellPass(report.pf, report.net, report.trades, 4, cfg),
      };
    }
    const minTick = engine.tick - h * TICKS_PER_HOUR;
    return cellFromRows(
      engine.closed.filter((c) => c.tick >= minTick),
      tactic,
      range,
      h,
      report.mdd,
      cfg,
    );
  });
}

function foldComplete(cells: CompleteCell[], hours: number[], playbooks: ReturnType<typeof sweepPlaybooks>, t0: number, symbolCount: number, hint?: { indications: OverallBucket[]; kinds: OverallBucket[] }, prehours = 0): CompleteComputeReport {
  const byHours: CompleteComputeReport["byHours"] = {};
  for (const h of hours) {
    const slice = cells.filter((c) => c.hours === h);
    const winner = [...slice].sort((a, b) => b.pf - a.pf || b.net - a.net)[0] ?? null;
    const ok = slice.filter((c) => c.ok).length;
    const avgPf = slice.length ? slice.reduce((s, c) => s + c.pf, 0) / slice.length : 0;
    byHours[String(h)] = { winner, ok, n: slice.length, avgPf };
  }
  const longest = Math.max(...hours);
  const longCells = cells.filter((c) => c.hours === longest);
  const winner = [...(longCells.length ? longCells : cells)].sort((a, b) => b.pf - a.pf || b.net - a.net)[0] ?? null;
  return {
    at: Date.now(),
    hours,
    prehours,
    symbolCount,
    cells,
    byHours,
    winner,
    playbooks,
    indications: hint?.indications ?? [],
    kinds: hint?.kinds ?? [],
    elapsedMs: Date.now() - t0,
  };
}

/** Independent full compute: every live tactic × range × stage hours. Optional independent short TP×SL. */
export function completeComputations(
  cfg: TacticConfig = DEFAULT_CFG,
  opts?: { symbolCount?: number; hours?: number[]; shorts?: boolean; prehours?: number; complete?: boolean; strategyToggles?: Partial<StrategyToggles> },
): CompleteComputeReport {
  const hours = (opts?.hours ?? [...STAGE_HOURS]).map((n) => Math.max(1, Math.round(n)));
  const symbolCount = opts?.symbolCount ?? 8;
  const prehours = opts?.prehours != null ? Math.max(0, Math.round(opts.prehours)) : SHORT_EVAL_HOURS;
  const t0 = Date.now();
  const cells: CompleteCell[] = [];
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      cells.push(...completeCellsForPair(cfg, tactic, range, hours, symbolCount, { prehours, complete: Boolean(opts?.complete), strategyToggles: opts?.strategyToggles }));
    }
  }
  if (opts?.shorts) {
    const h = hours[0] ?? 4;
    const run = evaluateShortCombosIndependent({
      hours: h,
      prehours: opts.prehours ?? SHORT_EVAL_HOURS,
      symbolCount,
      tactic: "trailing",
      block: false,
    });
    for (const c of run.cells) {
      cells.push({
        tactic: "trailing",
        range: "atr",
        hours: h,
        pf: c.pf,
        wr: c.wr,
        net: c.net,
        trades: c.trades,
        mdd: c.mdd,
        ok: c.ok,
        tpAtr: c.tpAtr,
        slOfTp: c.slOfTp,
        slAtr: c.slAtr,
        tpRatio: c.tpRatio,
        shortRange: true,
      });
    }
  }
  const playbooks = sweepPlaybooks(hours.includes(8) ? 8 : hours[hours.length - 1]!, symbolCount, cfg);
  return foldComplete(cells, hours, playbooks, t0, symbolCount, undefined, prehours);
}

export function sweepShortRange(
  hours = 24,
  symbolCount = 20,
  base: TacticConfig = DEFAULT_CFG,
): {
  hours: number;
  symbolCount: number;
  at: number;
  cells: (ConfigCell & { block: boolean; set: "short" })[];
  winner: (ConfigCell & { block: boolean; set: "short" }) | null;
  withBlock: { pf: number; n: number; ok: number };
  withoutBlock: { pf: number; n: number; ok: number };
} {
  const cells: (ConfigCell & { block: boolean; set: "short" })[] = [];
  const tactics: TacticKind[] = ["trailing", "hybrid"];
  const blockOn = { ...DEFAULT_BLOCK_CONFIG, enabled: true, volumeMode: "parallel" as const, sides: "both" as const };
  const blockOff = { ...DEFAULT_BLOCK_CONFIG, enabled: false };
  for (const tactic of tactics) {
    for (const prot of allShortTpSlCombos()) {
      for (const block of [true, false]) {
        const cfg = {
          ...base,
          trailingPct: 1.5,
          slAtr: prot.slAtr,
          tpRatio: prot.tpRatio,
          tpAtr: prot.tpAtr,
          slOfTp: prot.slOfTp,
          shortRange: true,
          maxHoldTicks: 12,
          maxHoldBars: 2,
        };
        const { report } = simulateHours(hours, cfg, tactic, {
          symbolCount,
          rangeType: "atr",
          block: block ? blockOn : blockOff,
        });
        cells.push({
          tactic,
          range: "atr",
          pf: report.pf,
          wr: report.wr,
          net: report.net,
          trades: report.trades,
          ok: cellPass(report.pf, report.net, report.trades, 8, cfg),
          tpAtr: prot.tpAtr,
          slOfTp: prot.slOfTp,
          slAtr: prot.slAtr,
          tpRatio: prot.tpRatio,
          shortRange: true,
          block,
          set: "short",
        });
      }
    }
  }
  const winner = [...cells].filter((c) => c.ok).sort((a, b) => b.pf - a.pf || b.net - a.net)[0]
    ?? [...cells].sort((a, b) => b.pf - a.pf || b.net - a.net)[0]
    ?? null;
  const avg = (xs: typeof cells) => ({
    pf: xs.length ? xs.reduce((s, c) => s + c.pf, 0) / xs.length : 0,
    n: xs.reduce((s, c) => s + c.trades, 0),
    ok: xs.filter((c) => c.ok).length,
  });
  return {
    hours,
    symbolCount,
    at: Date.now(),
    cells,
    winner,
    withBlock: avg(cells.filter((c) => c.block)),
    withoutBlock: avg(cells.filter((c) => !c.block)),
  };
}

/** Each TP×SL combo is its own tape (shortComboOnly). Never mix the GRID. */
export function evaluateShortCombosIndependent(opts?: {
  hours?: number;
  prehours?: number;
  symbolCount?: number;
  tactic?: TacticKind;
  block?: boolean;
  combos?: ReturnType<typeof allShortTpSlCombos>;
  base?: TacticConfig;
}): {
  hours: number;
  prehours: number;
  symbolCount: number;
  tactic: TacticKind;
  block: boolean;
  at: number;
  cells: {
    tpAtr: number;
    slOfTp: number;
    slAtr: number;
    tpRatio: number;
    combo: string;
    pf: number;
    wr: number;
    net: number;
    trades: number;
    mdd: number;
    ok: boolean;
    orders: number;
    maxOrders: number;
    maxPositions: number;
    leaked: number;
  }[];
  ok: { n: number; pf: number; trades: number; orders: number };
  all: { n: number; pf: number; trades: number; orders: number };
} {
  const hours = Math.max(1, Math.round(opts?.hours ?? 4));
  const prehours = Math.max(0, Math.round(opts?.prehours ?? 4));
  const symbolCount = opts?.symbolCount ?? 12;
  const tactic: TacticKind = opts?.tactic ?? "trailing";
  const combos = opts?.combos ?? allShortTpSlCombos();
  const base = opts?.base ?? DEFAULT_CFG;
  const blockOn = Boolean(opts?.block);
  const block = blockOn
    ? { ...DEFAULT_BLOCK_CONFIG, enabled: true, volumeMode: "parallel" as const, sides: "both" as const }
    : { ...DEFAULT_BLOCK_CONFIG, enabled: false };
  const cells: {
    tpAtr: number;
    slOfTp: number;
    slAtr: number;
    tpRatio: number;
    combo: string;
    pf: number;
    wr: number;
    net: number;
    trades: number;
    mdd: number;
    ok: boolean;
    orders: number;
    maxOrders: number;
    maxPositions: number;
    leaked: number;
  }[] = [];
  for (const prot of combos) {
    const cfg = snapShortTacticConfig({
      ...base,
      trailingPct: 1.5,
      slAtr: prot.slAtr,
      tpRatio: prot.tpRatio,
      tpAtr: prot.tpAtr,
      slOfTp: prot.slOfTp,
      shortRange: true as const,
      maxHoldTicks: 12,
      maxHoldBars: 2,
    });
    const { report, engine } = simulateHours(hours, cfg, tactic, {
      symbolCount,
      rangeType: "atr",
      block,
      prehours,
      complete: false,
      shortBasePf: DEFAULT_SHORT_BASE_PF,
      shortPf: DEFAULT_SHORT_PF,
    });
    const want = shortComboKey(prot.tpAtr, prot.slOfTp);
    let leaked = 0;
    for (const c of engine.closed) {
      if (c.tpAtr == null || c.slOfTp == null) continue;
      if (shortComboKey(c.tpAtr, c.slOfTp) !== want) leaked += 1;
    }
    cells.push({
      tpAtr: cfg.tpAtr!,
      slOfTp: cfg.slOfTp!,
      slAtr: cfg.slAtr,
      tpRatio: cfg.tpRatio,
      combo: want,
      pf: report.pf,
      wr: report.wr,
      net: report.net,
      trades: report.trades,
      mdd: report.mdd,
      ok: cellPass(report.pf, report.net, report.trades, 6, cfg),
      orders: engine.ledger.ordersPlaced,
      maxOrders: engine.ledger.maxOrders,
      maxPositions: engine.ledger.maxPositions,
      leaked,
    });
  }
  const fold = (xs: typeof cells) => ({
    n: xs.length,
    pf: xs.length ? xs.reduce((s, c) => s + c.pf, 0) / xs.length : 0,
    trades: xs.reduce((s, c) => s + c.trades, 0),
    orders: xs.reduce((s, c) => s + c.orders, 0),
  });
  return {
    hours,
    prehours,
    symbolCount,
    tactic,
    block: blockOn,
    at: Date.now(),
    cells,
    ok: fold(cells.filter((c) => c.ok)),
    all: fold(cells),
  };
}

/** Hours-scale independent trade sim: every short TP×SL tape + optional tactic×range complete cells. */
export function completeIndependentTradeSim(opts?: {
  hours?: number;
  prehours?: number;
  symbolCount?: number;
  tactic?: TacticKind;
  block?: boolean;
  combos?: ReturnType<typeof allShortTpSlCombos>;
  tactics?: boolean;
  tacticHours?: number[];
}): {
  at: number;
  hours: number;
  prehours: number;
  symbolCount: number;
  tactic: TacticKind;
  block: boolean;
  short: ReturnType<typeof evaluateShortCombosIndependent>;
  complete: CompleteComputeReport | null;
  elapsedMs: number;
  orders: number;
  trades: number;
  leaked: number;
} {
  const t0 = Date.now();
  const hours = Math.max(1, Math.round(opts?.hours ?? 4));
  const prehours = Math.max(0, Math.round(opts?.prehours ?? 4));
  const symbolCount = opts?.symbolCount ?? 20;
  const tactic: TacticKind = opts?.tactic ?? "trailing";
  const short = evaluateShortCombosIndependent({
    hours,
    prehours,
    symbolCount,
    tactic,
    block: Boolean(opts?.block),
    combos: opts?.combos,
  });
  const complete = opts?.tactics
    ? completeComputations(DEFAULT_CFG, {
        symbolCount: Math.min(8, symbolCount),
        hours: opts.tacticHours ?? [Math.min(4, hours)],
      })
    : null;
  return {
    at: Date.now(),
    hours,
    prehours,
    symbolCount,
    tactic,
    block: Boolean(opts?.block),
    short,
    complete,
    elapsedMs: Date.now() - t0,
    orders: short.all.orders + (complete?.cells.reduce((s, c) => s + c.trades, 0) ?? 0),
    trades: short.all.trades,
    leaked: short.cells.reduce((s, c) => s + c.leaked, 0),
  };
}

export async function completeComputationsAsync(
  cfg: TacticConfig = DEFAULT_CFG,
  opts?: {
    symbolCount?: number;
    hours?: number[];
    yieldFn?: () => Promise<void>;
    onCell?: (cell: CompleteCell, i: number, total: number) => void;
    protect?: boolean;
    /** Prehistoric hours before each scored window. Default 20. */
    prehours?: number;
    /** Also run one full book (every tactic, range and indication) after that prehistory. */
    complete?: boolean;
    /** Live switches. Omitted cells still turn Normal on so trailing/hybrid are not an empty book. */
    strategyToggles?: Partial<StrategyToggles>;
  },
): Promise<CompleteComputeReport> {
  const hours = (opts?.hours ?? [...STAGE_HOURS]).map((n) => Math.max(1, Math.round(n)));
  const symbolCount = opts?.symbolCount ?? 8;
  const prehours = opts?.prehours != null ? Math.max(0, Math.round(opts.prehours)) : SHORT_EVAL_HOURS;
  const yieldFn = opts?.yieldFn ?? (() => new Promise<void>((r) => setImmediate(r)));
  const t0 = Date.now();
  const cells: CompleteCell[] = [];
  const combos = opts?.protect === false ? [] : allTpSlCombos();
  const shorts = opts?.protect === false ? [] : allShortTpSlCombos();
  const shortTactics: TacticKind[] = ["trailing"];
  const shortSpan = Math.max(...hours);
  const shortHours = [shortSpan];
  const total =
    LIVE_TACTICS.length * RANGE_TYPES.length * hours.length + combos.length * LIVE_TACTICS.length + shorts.length * shortTactics.length * shortHours.length;
  let i = 0;
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      const batch = completeCellsForPair(cfg, tactic, range, hours, symbolCount, { prehours, strategyToggles: opts?.strategyToggles });
      for (const cell of batch) {
        cells.push(cell);
        i += 1;
        opts?.onCell?.(cell, i, total);
      }
      await yieldFn();
    }
  }
  for (const tactic of LIVE_TACTICS) {
    for (const prot of combos) {
      const cfg2 = { ...cfg, slAtr: prot.slAtr, tpRatio: prot.tpRatio, tpAtr: prot.tpAtr, slOfTp: prot.slOfTp };
      const batch = completeCellsForPair(cfg2, tactic, "atr", [4], Math.min(8, symbolCount), { prehours, strategyToggles: opts?.strategyToggles });
      for (const cell of batch) {
        cells.push({ ...cell, tpAtr: prot.tpAtr, slOfTp: prot.slOfTp, slAtr: prot.slAtr, tpRatio: prot.tpRatio });
        i += 1;
        opts?.onCell?.(cell, i, total);
      }
      await yieldFn();
    }
  }
  for (const tactic of shortTactics) {
    for (const prot of shorts) {
      const cfg2 = snapShortTacticConfig({
        ...cfg,
        slAtr: prot.slAtr,
        tpRatio: prot.tpRatio,
        tpAtr: prot.tpAtr,
        slOfTp: prot.slOfTp,
        shortRange: true,
      });
      const { report } = simulateHours(shortSpan, cfg2, tactic, {
        symbolCount: Math.min(8, symbolCount),
        rangeType: "atr",
        complete: false,
        prehours,
        strategyToggles: opts?.strategyToggles,
      });
      cells.push({
        tactic,
        range: "atr",
        hours: shortSpan,
        pf: report.pf,
        wr: report.wr,
        net: report.net,
        trades: report.trades,
        mdd: report.mdd,
        ok: cellPass(report.pf, report.net, report.trades, 4, cfg2),
        tpAtr: prot.tpAtr,
        slOfTp: prot.slOfTp,
        slAtr: prot.slAtr,
        tpRatio: prot.tpRatio,
        shortRange: true,
      });
      i += 1;
      opts?.onCell?.(cells[cells.length - 1]!, i, total);
      await yieldFn();
    }
  }
  let full: CompleteComputeReport["full"];
  if (opts?.complete !== false) {
    const span = Math.max(...hours);
    const { report } = simulateHours(span, cfg, "hybrid", {
      symbolCount,
      rangeType: "atr",
      complete: true,
      prehours,
    });
    full = {
      prehours,
      hours: span,
      pf: report.pf,
      wr: report.wr,
      net: report.net,
      trades: report.trades,
      mdd: report.mdd,
      ok: cellPass(report.pf, report.net, report.trades, 4, cfg),
    };
    await yieldFn();
  }
  const playbooks = sweepPlaybooks(hours.includes(8) ? 8 : hours[hours.length - 1]!, symbolCount, cfg);
  await yieldFn();
  const folded = foldComplete(cells, hours, playbooks, t0, symbolCount, undefined, prehours);
  if (full) folded.full = full;
  return folded;
}

export function formatTickClock(tick: number): string {
  const sec = Math.max(0, Math.floor((tick * VST_TICK_MS) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface SystemLoad {
  id: string;
  label: string;
  value: number;
  max: number;
  hint: string;
}

export function systemSnapshot(
  e: VstEngine,
  extra?: {
    combos?: { total: number; positive: number };
    feed?: { state: string; latencyMs: number; count: number; missing: number };
    connections?: { rateLimitUsed: number; rateLimitMax: number }[];
  },
) {
  const book = bookCounts(e);
  const sessions = Math.max(1, Object.keys(e.tokens).length);
  const tokenMax = sessions * VST_RATE_BURST;
  const tokenLeft = Object.values(e.tokens).reduce((a, n) => a + n, 0);
  const tokenUsed = Math.max(0, tokenMax - tokenLeft);
  const connRateUsed = extra?.connections?.reduce((a, c) => a + c.rateLimitUsed, 0) ?? tokenUsed;
  const connRateMax = extra?.connections?.reduce((a, c) => a + c.rateLimitMax, 0) || VST_RATE_WINDOW * sessions;
  const lastBatch = e.batches[0] ?? null;
  const cooldownN = Object.values(e.cooldown).filter((t) => t > e.tick).length;
  const hourTick = e.tick % TICKS_PER_HOUR;
  const queueCap = VST_BATCH_SIZE * sessions;
  const rateUsed = Math.max(connRateUsed, 0);
  const rateMax = Math.max(connRateMax, 1);

  const loads: SystemLoad[] = [
    {
      id: "slots",
      label: "Position slots",
      value: book.positions.slots,
      max: Math.max(book.positions.maxSlots, 1),
      hint: `${book.positions.slots}/${book.positions.maxSlots} · ${book.positions.long}L ${book.positions.short}S`,
    },
    {
      id: "legs",
      label: "Position legs",
      value: book.positions.legs,
      max: book.positions.maxLegs,
      hint: `${book.positions.legs}/${book.positions.maxLegs}`,
    },
    {
      id: "symbols",
      label: "Occupied symbols",
      value: book.positions.symbols,
      max: Math.max(e.symbolCount, 1),
      hint: `${book.positions.symbols}/${e.symbolCount}`,
    },
    {
      id: "orders",
      label: "Order pipeline",
      value: book.orders.live,
      max: Math.max(book.orders.live, queueCap, 1),
      hint: `${book.orders.queued}q ${book.orders.open}o ${book.orders.partial}p · ${book.orders.placed} placed`,
    },
    {
      id: "queue",
      label: "Queue load",
      value: book.orders.queued,
      max: Math.max(queueCap, book.orders.queued, 1),
      hint: `${book.orders.queued} waiting · batch ${VST_BATCH_SIZE}`,
    },
    {
      id: "rate",
      label: "Rate tokens",
      value: rateUsed,
      max: rateMax,
      hint: `${Math.round(rateUsed)}/${rateMax}`,
    },
    {
      id: "hour",
      label: "Session hour",
      value: hourTick,
      max: TICKS_PER_HOUR,
      hint: `${Math.round((hourTick / TICKS_PER_HOUR) * 100)}% · tick ${e.tick} · ${formatTickClock(e.tick)}`,
    },
    {
      id: "batch",
      label: "Last batch",
      value: lastBatch?.accepted ?? 0,
      max: Math.max(lastBatch?.count ?? VST_BATCH_SIZE, 1),
      hint: lastBatch ? `${lastBatch.accepted}/${lastBatch.count} acc · ${lastBatch.rejected} rej` : "none yet",
    },
    {
      id: "cooldown",
      label: "Cooldown",
      value: cooldownN,
      max: Math.max(e.symbolCount, 1),
      hint: `${cooldownN} symbols cooling`,
    },
  ];
  if (extra?.combos) {
    loads.push({
      id: "combos",
      label: "Positive combos",
      value: extra.combos.positive,
      max: Math.max(extra.combos.total, 1),
      hint: `${extra.combos.positive.toLocaleString()}/${extra.combos.total.toLocaleString()}`,
    });
  }
  if (extra?.feed) {
    const cover = extra.feed.count + extra.feed.missing;
    loads.push({
      id: "tape",
      label: "Tape coverage",
      value: extra.feed.count,
      max: Math.max(cover, 1),
      hint: `${extra.feed.count} live · ${extra.feed.missing} missing · ${extra.feed.latencyMs} ms`,
    });
  }

  return {
    book,
    loads,
    rateUsed,
    rateMax,
    lastBatch,
    cooldownN,
    hourTick,
    queueCap,
    fills: e.fills.length,
    closed: e.closed.length,
    batches: e.batches.length,
    clock: formatTickClock(e.tick),
    healCount: e.healCount ?? 0,
    lastHeal: e.lastHeal ?? "",
  };
}

export function liveDeskBook(
  e: VstEngine,
  connId: string,
  lastN: number,
): { last: Position[]; ongoing: Position[] } {
  const ongoing: Position[] = e.positions
    .filter((p) => ownedByDesk(p, connId) && p.qty > 0)
    .map((p) => ({
      id: p.id,
      symbol: p.symbol,
      strategyId: p.playbook || "live",
      side: p.side,
      status: "open" as const,
      entry: p.avgEntry,
      mark: p.mark > 0 ? p.mark : p.avgEntry,
      qty: p.qty,
      cost: Math.abs(p.qty * p.avgEntry),
      pnl: p.unrealized,
      pnlPct: p.avgEntry ? p.unrealized / Math.max(Math.abs(p.qty * p.avgEntry), 1e-9) : 0,
      openedBar: p.openedTick,
      closedBar: null,
      tactic: "hybrid" as const,
      rangeType: p.controllingRange,
      blockId: p.playbook || p.id,
      venue: "bingx" as const,
      orderType: "market" as const,
    }));
  const last: Position[] = e.closed
    .filter((t) => ownedByDesk(t, connId) && !t.protect)
    .slice(0, lastN)
    .map((t) => ({
      id: t.id,
      symbol: t.symbol,
      strategyId: t.playbook || "live",
      side: t.side,
      status: "closed" as const,
      entry: t.entry,
      mark: t.exit,
      qty: t.qty,
      cost: Math.abs(t.qty * t.entry),
      pnl: t.pnl,
      pnlPct: t.entry ? (t.pnl || 0) / Math.max(Math.abs((t.qty || 0) * t.entry), 1e-9) : 0,
      openedBar: Math.max(0, t.tick - 1),
      closedBar: t.tick,
      tactic: "hybrid" as const,
      rangeType: "atr" as const,
      blockId: t.id,
      venue: "bingx" as const,
      orderType: "market" as const,
    }));
  return { last, ongoing };
}

export function exchangeAsPositions(book: ExchangeBook | null | undefined): Position[] {
  if (!book?.ok) return [];
  return book.positions.map((p, i) => ({
    id: `ex-${p.symbol}-${p.side}-${i}`,
    symbol: p.symbol,
    strategyId: "live",
    side: p.side,
    status: "open" as const,
    entry: p.entry,
    mark: p.mark,
    qty: p.qty,
    cost: Math.abs(p.qty * (p.entry || p.mark || 0)),
    pnl: p.pnl,
    pnlPct: p.entry ? p.pnl / Math.max(Math.abs(p.qty * p.entry), 1e-9) : 0,
    openedBar: 0,
    closedBar: null,
    tactic: "hybrid" as const,
    rangeType: "atr" as const,
    blockId: `${p.symbol}:${p.side}`,
    venue: "bingx" as const,
    orderType: "market" as const,
  }));
}

export function positionsAsTrades(pos: Position[]): import("./types.ts").Trade[] {
  return pos.map((p) => ({
    id: p.id,
    strategyId: p.strategyId,
    symbol: p.symbol,
    side: p.side,
    entryBar: p.openedBar,
    exitBar: p.closedBar ?? p.openedBar,
    entry: p.entry,
    exit: p.mark,
    pnl: p.pnl,
    volume: Math.max(Math.abs(p.qty * p.entry), p.cost || 0),
    cost: p.cost,
  }));
}

export function matchingWinningRels(
  e: VstEngine,
  rel: Parameters<typeof blockRelationKeys>[0],
) {
  const best = e.blockRelBest ?? {};
  if (!Object.keys(best).length) return [];
  const keys = blockRelationKeys(rel);
  const out: { key: string; n: number; pf: number; net: number; vol: number; major: boolean }[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const p = best[k];
    if (!p || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push(p);
  }
  return out.sort((a, b) => b.pf - a.pf || b.net - a.net).slice(0, 8);
}

/** Additive extra from each matching winning relation (independent). */
export function winningRelVolume(
  e: VstEngine,
  rel: Parameters<typeof matchingWinningRels>[1],
): number {
  const t = e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
  if (t.block === false) return 0;
  const block = e.blockCfg ?? DEFAULT_BLOCK_CONFIG;
  if (block.relAdditive === false) return 0;
  return matchingWinningRels(e, rel).reduce((s, p) => s + Math.max(0, Number(p.vol) || 0), 0);
}

export function winningRelLive(
  e: VstEngine,
  rel: Parameters<typeof matchingWinningRels>[1],
): boolean {
  const hits = matchingWinningRels(e, rel);
  if (!hits.length) return false;
  return hits.some((p) => p.major && !String(p.key).startsWith("side:"));
}

export function positionBlockAdjusted(e: VstEngine, symbol: string, side: Side): boolean {
  const pos = e.positions.find((p) => p.symbol === symbol && p.side === side && ownedByDesk(p));
  if (pos && (pos.blockLevel ?? 0) >= 1) return true;
  for (const lane of Object.values(e.blockLanes ?? {})) {
    if (lane.symbol !== symbol || lane.side !== side) continue;
    if ((lane.confirmedAdd ?? 0) > 0) return true;
    if (Object.values(lane.satisfied ?? {}).some(Boolean)) return true;
  }
  return false;
}

export function lastNProgressOf(e: VstEngine): LastNProgressConfig {
  return sanitizeLastNProgress(e.lastNProgress ?? e.blockCfg?.lastNProgress);
}

export function laneLastNDecision(
  e: VstEngine,
  rel: Parameters<typeof lanePassExec>[1],
) {
  const nClosed = e.closed.length;
  const head = laneDecTapeSig(e);
  let bag = laneDecCache.get(e);
  if (!bag || bag.at !== e.tick || bag.n !== nClosed || bag.head !== head) {
    bag = { at: e.tick, n: nClosed, head, map: new Map() };
    laneDecCache.set(e, bag);
  }
  const cfg = lastNProgressOf(e);
  const minPf = entryMinPfFor(e, rel);
  const basePf = configStepFloor(e, minPfFor(e, rel.kind === "short" || rel.playbook === "short" ? "shortBase" : "base"), rel);
  const key = JSON.stringify([laneDecKey(rel), cfg, minPf, basePf, e.activeConnId, e.liveTape, e.preEvalDone]);
  const cached = bag.map.get(key);
  if (cached) return cached;
  const need = lastNMaxOf(cfg);
  const identity = {...rel,connId:e.activeConnId};
  const rows = hasConfigProvenance(identity) ? currentConfigRows(e,identity,need) : laneClosed(e,rel,need);
  const d = decideLastN(rows, cfg, minPf, basePf);
  bag.map.set(key, d);
  return d;
}

export function lanePassExec(
  e: VstEngine,
  rel: ConfigIdentity & {
    symbol?: string;
    side?: Side;
    indication?: IndicationId;
    kind?: string;
    tactic?: TacticKind;
    rangeType?: RangeType;
    playbook?: string;
    tpPct?: number;
    tpAtr?: number;
    slOfTp?: number;
  },
): boolean {
  if (internAllPhase(e) || completeOpenTape(e)) return true;
  if (e.preEvalDone && !validatedSet(e, rel)) return false;
  if (e.preEvalDone) {
    // A measured protection cell and its siblings can share TP and SL ratio.
    // The legacy pooled pause only applies to callers without exact proof.
    if (!hasConfigProvenance({ ...rel, connId: e.activeConnId }) &&
      liveRelationDisabled(e, rel as Parameters<typeof liveRelationDisabled>[1])) return false;
    return true;
  }
  // Independent combo tape: intern always processes this TP×SL; last-N is scored, not a self-kill.
  if (e.shortComboOnly && paperMode(e)) return true;
  if (liveRelationDisabled(e, rel as Parameters<typeof liveRelationDisabled>[1])) return false;
  if (rel.tpAtr != null && rel.slOfTp != null && isShortComboRel(e, rel)) {
    return shortComboProven(e, rel.tpAtr, rel.slOfTp) || internRelProven(e, rel) || relExamPass(e, rel);
  }
  const coord = e.lastNCoord;
  if (coord) {
    const shortLane = rel.kind === "short" || rel.playbook === "short" || e.shortRange;
    if (!shortLane) {
      const ck = relComboKey(rel, { tactic: e.lastTactic, range: e.lastRange });
      const combo = coord.combos[ck];
      if (combo && combo.n >= 4) return combo.ok;
    }
    if (!keepCoordRel(rel) && !shortLane) {
      const ind = String(rel.indication || "");
      const scoredInd = e.progressEval?.indications?.[ind];
      if (ind && scoredInd && scoredInd.n >= 4 && coord.activeInds.length && !coord.activeInds.includes(ind)) return false;
      const play = String(rel.playbook || rel.kind || "");
      const scoredPlay = e.progressEval?.playbooks?.[play];
      if (play && scoredPlay && scoredPlay.n >= 4 && coord.activePlays.length && !coord.activePlays.includes(play)) return false;
      const tac = String(rel.tactic || "");
      const scoredTac = e.progressEval?.tactics?.[tac];
      if (tac && scoredTac && scoredTac.n >= 4 && coord.activeTacs.length && !coord.activeTacs.includes(tac)) return false;
    }
  }
  return laneLastNDecision(e, rel).pass;
}

function laneExecProven(
  e: VstEngine,
  rel: Parameters<typeof lanePassExec>[1],
): boolean {
  const cfg = lastNProgressOf(e);
  if (hasDisjointBlocks(cfg)) {
    const d = laneLastNDecision(e, rel);
    if (selectedDisjointBlocks(cfg, d)) return d.pass;
  }
  const coord = e.lastNCoord;
  if (coord) {
    const combo = coord.combos[relComboKey(rel, { tactic: e.lastTactic, range: e.lastRange })];
    if (combo && combo.n >= 8 && combo.ok && combo.pf + 1e-9 >= baseStageFloor(e) && combo.net > 0) return true;
  }
  const d = laneLastNDecision(e, rel);
  const base = baseStageFloor(e);
  return d.validHits.some((h) => h.samples >= h.n && h.pf + 1e-9 >= base && h.net > 0);
}

export function laneLastNStack(
  e: VstEngine,
  rel: Parameters<typeof lanePassExec>[1],
): number {
  if (internAllPhase(e)) return 1;
  const coord = e.lastNCoord;
  if (coord) {
    const combo = coord.combos[relComboKey(rel, { tactic: e.lastTactic, range: e.lastRange })];
    if (combo && combo.n >= 4) return combo.ok ? coord.stack : 1;
  }
  const d = laneLastNDecision(e, rel);
  if (!d.pass) return 1;
  return d.stack;
}

/** Live / Real counted execute: only lanes that passed progress valid-execute. */
export function isShortComboRel(
  e: VstEngine,
  rel: { tpAtr?: number; slOfTp?: number },
): boolean {
  if (!e.shortRange) return false;
  const tp = Number(rel.tpAtr);
  const sl = Number(rel.slOfTp);
  return Number.isFinite(tp) && Number.isFinite(sl) && tp <= 0.6 + 1e-9;
}

export function liveShouldExecute(
  e: VstEngine,
  rel: ConfigIdentity & StepPfContext & {
    symbol: string;
    side: Side;
    tactic?: TacticKind;
    playbook?: string;
    kind?: string;
    note?: string;
    blockLevel?: number;
    indication?: IndicationId;
    rangeType?: RangeType;
    tpAtr?: number;
    slOfTp?: number;
  },
): boolean {
  registerSampleContext(e, { ...rel, connId: e.activeConnId });
  const t = strategyProcessingFor(e, rel);
  const note = String(rel.note || "");
  const play = String(rel.playbook || "");
  if (rel.indication && e.skipIndications?.includes(rel.indication)) return false;
  // After Base, Block / Overall execute only when this set's own last-N passed.
  const overall = /Overall Block/i.test(note);
  const blockFill = play === "block" || /Block/i.test(note) || (rel.blockLevel ?? 0) >= 1;
  if (blockFill) {
    if (overall && e.blockCfg?.overall === false) return false;
    if (!overall && t.block === false) return false;
    if (!e.preEvalDone || internAllPhase(e) || completeOpenTape(e)) return true;
    return validatedSet(e, rel);
  }
  const isDca = play === "dca" || rel.tactic === "dca" || /^DCA/i.test(note);
  if (isDca && t.dca === false) return false;
  const ready = Boolean(e.preEvalDone && validatedSet(e, rel));
  // After Base, the funded paper path must use the same exact proof as live.
  // Learning/exam entries remain upstream (internAllPhase/completeOpenTape);
  // an unobserved paper sibling is never a qualified execution.
  if (!t.normal && unadjustedNormalOrder(rel)) return false;
  if (e.preEvalDone && !ready) return false;
  const extra = play === "block" || play === "axis" || play === "dca" || rel.tactic === "axis" || rel.tactic === "dca" || /Block/i.test(note) || (rel.blockLevel ?? 0) >= 1;
  if (t.trailing === false && rel.tactic === "trailing" && !extra) return false;
  if (isDca) return t.dca;
  const shortCombo = isShortComboRel(e, rel);
  if (shortCombo && !ready && !(e.shortComboOnly && paperMode(e)) && !shortComboProven(e, rel.tpAtr!, rel.slOfTp!) && !internRelProven(e, rel) && !relExamPass(e, rel)) return false;
  if (!ready && !shortCombo && (e.preEvalDone || e.liveTape) && !prePassOk(e, rel)) return false;
  if ((e.preEvalDone || e.liveTape) && !lanePassExec(e, rel) && unadjustedNormalOrder(rel)) return false;
  const gated = Boolean(e.preEvalDone || e.liveTape);
  if (!blockFill && gated && laneExecProven(e, rel)) {
    if (rel.kind === "normal" || play === "normal" || play === "short" || rel.kind === "short") {
      return !unadjustedNormalOrder(rel) || t.normal;
    }
    if (play === "axis" || rel.tactic === "axis") return t.axis;
    if (rel.tactic === "trailing") return t.trailing !== false;
    if (rel.tactic === "hybrid") return t.normal !== false;
    return Boolean(t.trailing || t.axis || t.block);
  }
  if (t.block && winningRelLive(e, rel)) return true;
  const isBlockFill = play === "block" || /Block/i.test(note) || (rel.blockLevel ?? 0) >= 1;
  const isBlock = isBlockFill || positionBlockAdjusted(e, rel.symbol, rel.side);
  if (isBlock) {
    if (!t.block) return false;
    if (e.blockCfg?.activeLive === false) return true;
    return isBlockFill || positionBlockAdjusted(e, rel.symbol, rel.side);
  }
  if (play === "axis" || rel.tactic === "axis") {
    if (!t.axis) return false;
    if (!ready && e.liveTape) {
      const take = laneClosed(e, { tactic: "axis", playbook: play || "axis" }, 40);
      if (take.length >= 8 && pfFromPnls(take) + 1e-9 < minPfFor(e, "axis")) return false;
    }
    return true;
  }
  if (!ready && rel.indication === "direction" && e.liveTape) {
    const take = laneClosed(e, { indication: "direction", kind: rel.kind, playbook: play }, 40);
    if (take.length >= 8 && pfFromPnls(take) + 1e-9 < minPfFor(e, e.shortRange ? "short" : "overall")) return false;
  }
  if (t.trailing === false && rel.tactic === "trailing" && play !== "block" && play !== "axis" && play !== "dca" && !/Block/i.test(note)) return false;
  if (!ready && e.liveTape && (rel.tactic === "trailing" || rel.tactic === "hybrid")) {
    const take = laneClosed(e, { tactic: rel.tactic, indication: rel.indication, kind: rel.kind, playbook: play }, 40);
    if (take.length >= 8 && pfFromPnls(take) + 1e-9 < minPfFor(e, e.shortRange ? "short" : "overall")) return false;
  }
  if (rel.kind === "normal" || play === "normal") return t.normal || ready;
  return t.normal || ready;
}

export function queueOrder(e: VstEngine, o: LiveOrder): void {
  o.protectionKey ??= geometryKey(o);
  o.shortRange ??= e.shortRange === true;
  o.microRange ??= e.microRange === true;
  o.modelRtCost ??= modeledPositionCost(e, o.symbol);
  o.minSlDistancePct ??= normalizeMinSlDistancePct(e.minSlDistancePct);
  if (o.microRange) { o.microMinSlDistancePct ??= e.microMinSlDistancePct; o.microMinTrailDistancePct ??= e.microMinTrailDistancePct; }
  registerSampleContext(e, o);
  e.queue.push(o);
}

function trailingPolicyKey(row: TrailingPolicyIdentity): string {
  const fixed = row.trailingDistance === "fixed";
  const basis = fixed ? ":fixed-distance" : "";
  return fixed || row.tactic === "trailing" || row.tactic === "hybrid"
    ? `${basis}:trail=${Number.isFinite(row.trailPct) ? row.trailPct : "legacy"}`
    : basis;
}

function protectionPolicyKey(row: { modelRtCost?: number; minSlDistancePct?: number; microMinSlDistancePct?: number; microMinTrailDistancePct?: number } & TrailingPolicyIdentity): string {
  return `${row.modelRtCost ?? POSITION_RT_COST_PCT}:${normalizeMinSlDistancePct(row.minSlDistancePct)}:${row.microMinSlDistancePct ?? "legacy"}:${row.microMinTrailDistancePct ?? "legacy"}${trailingPolicyKey(row)}`;
}

/** Identity does not snap Minimal cost multiples through the Short ATR grid. */
export function exactProtectionCombo(row: { tpAtr?: number; slOfTp?: number; minimalRange?: boolean; microRange?: boolean; shortRange?: boolean;
  priceStopPct?: number; priceTrailPct?: number; trailingDistance?: TrailingDistance; maxHoldTicks?: number }): string {
  return JSON.stringify([row.microRange === true ? "micro" : row.minimalRange === true ? "minimal" : row.shortRange === true ? "short" : "normal",
    row.tpAtr, row.slOfTp, row.priceStopPct, row.priceTrailPct, row.trailingDistance === "fixed" ? "fixed" : "dynamic",
    ...(Number.isFinite(row.maxHoldTicks) ? ["hold-ticks", row.maxHoldTicks] : [])]);
}
