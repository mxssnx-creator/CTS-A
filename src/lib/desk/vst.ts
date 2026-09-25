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
  SymbolTape,
  TacticConfig,
  TacticKind,
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
  BLOCK_POS_COUNTS,
  DEFAULT_MAX_HOLD_TICKS,
  MIN_QUOTE_VOL,
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
  profitFactor,
  ratioProfitFactor,
  pfFromPnls,
  PF_NO_LOSS,
  allTpSlCombos,
  allShortTpSlCombos,
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
  BUSY_HOUR_WEAK_PROTECT,
  HIGH_TRADE_PAY_INDICATIONS,
  clampBlockVol,
  DEFAULT_OVERALL_BLOCK_VOLUME_RATIO,
  clampSharedVol,
  clampOverallVol,
  clampMaxVolumeMul,
  DEFAULT_SHARED_BLOCK_VOLUME_RATIO,
  DEFAULT_MAX_VOLUME_MULTIPLIER,
  clampAxisPartial,
  trailStopFromPeak,
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
  DEFAULT_SHORT_PROGRESS,
  sanitizeIntervalStrategy,
  sanitizeLastNProgress,
  decideLastN,
  lastNWindows,
  lastNPrefix,
  coordinateLastNFromPrefix,
  scoreLastNGroup,
  foldLastNProcessings,
  completeLastNCorrectness,
  coverCatalogRows,
  hitsToProgressRows,
  relComboKey,
  lastNMaxOf,
  GATED_MIN_PF,
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
const typeGateMem = new WeakMap<VstEngine, { indications: Record<string, TypeGateRow>; tactics: Record<string, TypeGateRow>; floor: number; blendN: number; blendPf: number; blendNet: number }>();
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
  const pf = gl > 1e-12 ? gp / gl : gp > 0 ? PF_NO_LOSS : 0;
  if (pf < 0.9 && gp - gl <= 0) return false;
  return true;
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
  const bag = liveIndTally.get(e);
  if (!bag) return true;
  const verdict = recentLanePays(indicationRecent(e, ind));
  if (verdict !== false) {
    const bare = bag[ind];
    if (bare) bare.fail = false;
    return true;
  }
  const bare = bag[ind] ?? (bag[ind] = { n: 0, gp: 0, gl: 0, recent: [] });
  if (bare.fail !== true) {
    bare.fail = true;
    dropQueuedLane(e, ind);
  }
  if (e.tick % 30 !== 0) return false;
  if (bare.probeTick !== e.tick) {
    bare.probeTick = e.tick;
    bare.probes = 0;
  }
  if ((bare.probes ?? 0) >= 2) return false;
  bare.probes = (bare.probes ?? 0) + 1;
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
    const pf = gl > 1e-12 ? gp / gl : gp > 0 ? PF_NO_LOSS : 0;
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
  for (const [k, rows] of Object.entries(indP)) indications[k] = scoreTypeGate(rows);
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
  typeGateMem.set(e, { indications, tactics, floor, blendN: blend.n, blendPf: blend.pf, blendNet: blend.net });
}

export function frozenTypeBlend(e: VstEngine): { n: number; pf: number; net: number } | null {
  const g = typeGateMem.get(e);
  if (!g || g.blendN < 4) return null;
  return { n: g.blendN, pf: g.blendPf, net: g.blendNet };
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
  const gate = typeGateMem.get(e);
  if (!gate) return -1;
  const indRow = gate.indications[ind];
  if (!indRow?.ok) return 0;
  let pf = indRow.pf;
  if (tactic) {
    const tacRow = gate.tactics[tactic];
    if (tacRow && tacRow.n >= 4 && !tacRow.ok) return 0;
    if (tacRow?.ok) pf = Math.min(pf, tacRow.pf);
  }
  if (tpAtr != null && slOfTp != null) {
    const st = comboTapeStats(e.shortComboPreTape?.[shortComboKey(tpAtr, slOfTp)]);
    if (st.n >= 4) {
      const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
      if (st.pf + 1e-9 < 1 || st.net <= 1e-9 || tiny) return 0;
      if (gate.floor > 1 && !(st.pf > gate.floor + 1e-9)) return 0;
      pf = Math.min(pf, st.pf);
    } else if (!shortComboProven(e, tpAtr, slOfTp)) return 0;
  }
  const liveEv = e.progressEval?.indications?.[ind];
  if (liveEv && liveEv.n >= 8 && (liveEv.ok === false || liveEv.pf + 1e-9 < 1)) return 0;
  if (!liveIndStillPays(e, ind)) return 0;
  if (!(pf >= 1)) return 0;
  const used = Math.min(pf, 1.6);
  const extra = Math.floor((used - 1) / 0.2);
  return Math.max(1, Math.min(Math.max(1, levels), 1 + extra));
}

/** Desk Start uses the same open tape as the green 24h run: short 0.42/1.7, all indications, arm every 2. */
export const LIVE_RUN_CFG: TacticConfig = {
  trailingPct: 1.5,
  dcaCount: 1,
  dcaDrawdown: 0.8,
  axisSpacing: 0.7,
  axisLevels: 5,
  axisPartialRatio: 3,
  slAtr: 0.714,
  tpRatio: 1 / 1.7,
  tpAtr: 0.42,
  slOfTp: 1.7,
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
    sharedVolumeRatio: 3,
    volumeRatio: 0.4,
    relVolumeRatio: 0.4,
    overallVolumeRatio: 3,
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
  if ((e.ledger?.trades ?? 0) < 1 && (Number(e.startEquity) || 0) >= 1000) {
    e.startEquity = 10;
    e.ledger.peak = 10;
    e.stats.equity = 10;
    e.stats.net = 0;
  }
}
/** Paper $10 open tape uses 12× size so 24h equity can climb like the screenshot (~10→13). */
function paperSizeEquity(e: VstEngine): number {
  const eq = Number(e.stats?.equity) || 0;
  if (paperMode(e) && completeOpenTape(e) && eq > 0 && eq < 200) return eq * 12;
  return eq > 0 ? eq : 1e4;
}
function hourProtectSkip(e: VstEngine, pnl: number, validExec: boolean): boolean {
  if (!validExec || pnl >= -1e-12) return false;
  if (!(completeOpenTape(e) || (e.completeSim && paperMode(e)))) return false;
  const hour = Math.floor(Math.max(0, e.tick - 1) / TICKS_PER_HOUR);
  const bag = e.hourLive;
  if (!bag || bag.hour !== hour) return true;
  return bag.p - bag.l + pnl < 1e-9;
}
function noteHourLive(e: VstEngine, pnl: number, gated: boolean) {
  if (!gated) return;
  const hour = Math.floor(Math.max(0, e.tick - 1) / TICKS_PER_HOUR);
  let bag = e.hourLive;
  if (!bag || bag.hour !== hour) {
    bag = { hour, p: 0, l: 0, n: 0 };
    e.hourLive = bag;
  }
  bag.n += 1;
  if (pnl > 0) bag.p += pnl;
  else bag.l += Math.abs(pnl);
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
function internRelKey(ind: string | undefined, tac: string | undefined, tpAtr: number, slOfTp: number): string {
  return `${ind || "na"}:${tac || "na"}:${shortComboKey(tpAtr, slOfTp)}`;
}
function noteRelClose(
  e: VstEngine,
  c: { indication?: string; tactic?: string; tpAtr?: number; slOfTp?: number; pnl?: number; validExec?: boolean },
) {
  if (c.tpAtr == null || c.slOfTp == null) return;
  if (c.validExec === true && e.preEvalDone) return;
  const key = internRelKey(c.indication, c.tactic, c.tpAtr, c.slOfTp);
  const bag = e.shortRelTape ?? (e.shortRelTape = {});
  const ring = bag[key] ?? (bag[key] = []);
  ring.unshift({ pnl: Number(c.pnl) || 0, ratio: Number(c.pnl) || 0 });
  if (ring.length > SHORT_COMBO_TAPE_CAP) ring.length = SHORT_COMBO_TAPE_CAP;
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
}
export function internRelProven(
  e: VstEngine,
  rel: { indication?: string; tactic?: string; tpAtr?: number; slOfTp?: number },
): boolean {
  // Intern→valid share statistic only. Live execute uses independent shortComboProven / last-N.
  if (internAllPhase(e) || !e.preEvalDone) return true;
  if (!e.completeSim) return true;
  const keys = e.validRelKeys;
  if (!keys || !Object.keys(keys).length) return false;
  if (rel.tpAtr == null || rel.slOfTp == null) return false;
  const k = internRelKey(rel.indication, rel.tactic, rel.tpAtr, rel.slOfTp);
  if (keys[k]) return true;
  const combo = shortComboKey(rel.tpAtr, rel.slOfTp);
  const prefix = `${rel.indication || "na"}:`;
  return Object.keys(keys).some((x) => x.startsWith(prefix) && x.endsWith(`:${combo}`));
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
  const gated = d.validHits.filter((h) => h.samples >= h.n && h.pf + 1e-9 >= GATED_MIN_PF && h.net > 0);
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
    const gate = typeGateMem.get(e);
    if (performingLive(e) && gate) {
      const st = comboTapeStats(pre);
      const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
      const need = gate.floor > 1 ? gate.floor : 1;
      const beats = st.n >= 4 && st.net > 1e-9 && !tiny && (gate.floor > 1 ? st.pf > need + 1e-9 : st.pf + 1e-9 >= need);
      if (!beats) return false;
      const liveSt = comboTapeStats(e.shortComboLiveTape?.[key]);
      if (liveSt.n >= 8 && !(liveSt.pf > need + 1e-9 && liveSt.net > 0)) return false;
      return true;
    }
    if (pre && pre.length) {
      const st = comboTapeStats(pre);
      const tiny = st.pf >= PF_NO_LOSS - 1e-9 && st.net <= 1e-6;
      const preOk = st.n >= 4 && st.pf + 1e-9 >= 1 && st.net > 1e-9 && !tiny;
      if (!preOk) {
        const liveSt = comboTapeStats(e.shortComboLiveTape?.[key]);
        if (liveSt.n >= 8 && liveSt.pf + 1e-9 >= 1 && liveSt.net > 1e-9) return true;
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
      if (e.liveTape) return true;
      if (!e.preEvalDone) return true;
      return internStartOk(e, intern);
    }
    return internComboLiveOk(e, intern, shortFloor, baseFloor);
  }
  const row = e.progressEval?.shortCombos?.[key];
  if (!row || row.n < 6) {
    if (!e.preEvalDone) return true;
    if (e.liveTape) return true;
    if (!e.completeSim) return true;
    return internStartOk(e, intern) || (row != null && row.n >= 4 && row.pf + 1e-9 >= GATED_MIN_PF && row.net > 0);
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
function maxPositions(e: VstEngine) {
  return paperMode(e) ? PAPER_MAX_POSITIONS : VST_MAX_POSITIONS;
}
function maxQueue(e: VstEngine) {
  return paperMode(e) ? PAPER_MAX_QUEUE : VST_MAX_QUEUE;
}
function maxWorking(e: VstEngine) {
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
  return [...universeSymbols(e.symbolCount)].sort((a, b) => {
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
function slDist(atr: number, spacing: number, slAtr: number, raw = false): number {
  const mul = raw ? Math.max(0.05, Number(slAtr) || 0.05) : snapSlAtr(slAtr);
  const want = Math.max(atr * mul, 1e-12);
  if (spacing > 0 && spacing * 0.9 < want * 0.5) return want;
  return want;
}
function tpDistFromSl(sl: number, ratio = TP_SL_RATIO, raw = false): number {
  return sl * (raw ? Math.max(0.3, Number(ratio) || 1) : snapTpRatio(ratio));
}
function clampPx(n: number, floor: number): number {
  if (!Number.isFinite(n)) return floor;
  return Math.max(n, floor * .25);
}
function protectLevels(entry: number, side: Side, sl0: number, tp0: number, ratio = TP_SL_RATIO, raw = false) {
  const r = raw ? Math.max(0.3, Number(ratio) || 1) : snapTpRatio(ratio);
  const floor = Math.max(entry * 1e-6, 1e-12);
  let sl = side === "long" ? entry - sl0 : entry + sl0;
  let tp = side === "long" ? entry + tp0 : entry - tp0;
  sl = clampPx(sl, floor);
  tp = clampPx(tp, floor);
  if (side === "long" && sl >= entry) sl = entry * .995;
  if (side === "short" && sl <= entry) sl = entry * 1.005;
  if (side === "long" && tp <= entry) tp = entry * 1.005;
  if (side === "short" && tp >= entry) tp = entry * .995;
  const slD = Math.abs(entry - sl);
  if (r >= 1) {
    const tpD = Math.abs(tp - entry);
    if (slD > tpD / r + 1e-12) {
      const cap = tpD / r;
      sl = side === "long" ? entry - cap : entry + cap;
    }
  } else {
    const want = slD * r;
    tp = side === "long" ? entry + want : entry - want;
    tp = clampPx(tp, floor);
    if (side === "long" && tp <= entry) tp = entry + want;
    if (side === "short" && tp >= entry) tp = entry - want;
  }
  const tpD = Math.abs(tp - entry);
  return {
    sl,
    tp,
    slDist: Math.abs(entry - sl),
    tpDist: tpD
  };
}
function axisLadders(q: VstQuote, cfg: TacticConfig): { rangeType: RangeType; spacing: number; levels: number[] }[] {
  const n = Math.max(2, cfg.axisLevels);
  const atrStep = q.atr * cfg.axisSpacing;
  const lin = q.px * (cfg.axisSpacing / 100) * 1.8 + q.atr * .25;
  const geo = q.px * (cfg.axisSpacing / 80);
  const vol = q.atr * (1.15 - Math.min(q.vol * 8, .45));
  const fib = q.atr * .809;
  const steps: { rangeType: RangeType; spacing: number }[] = [
    { rangeType: "linear", spacing: lin },
    { rangeType: "geometric", spacing: geo },
    { rangeType: "atr", spacing: atrStep },
    { rangeType: "volume", spacing: vol },
    { rangeType: "fibonacci", spacing: fib },
  ];
  return steps.map((s) => {
    const levels: number[] = [];
    for (let i = 1; i <= n; i++) levels.push(s.spacing * i);
    return { ...s, levels };
  });
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
    maxPositions: VST_MAX_POSITIONS,
    maxSymbols: VST_MAX_SYMBOLS,
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
  e.blockRelWindows = e.blockRelWindows ?? {};
  e.blockRelBest = e.blockRelBest ?? {};
  e.lastRelEvalTick = e.lastRelEvalTick ?? 0;
  e.relVolumeFactor = e.relVolumeFactor ?? 0;
  e.intervalVolScale = e.intervalVolScale ?? 1;
  e.intervalPf = e.intervalPf ?? 0;
  e.liveDisabled = e.liveDisabled ?? {};
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
function occupiedLegs(e: VstEngine, connId?: string): Set<string> {
  const s = new Set<string>();
  const on = (id: string) => (connId ? id === connId : isDeskConn(id));
  for (const p of e.positions) if (on(p.connId) && !isBotPlay(p.playbook)) s.add(`${p.symbol}:${p.side}`);
  for (const o of e.orders) if (on(o.connId) && !isBotPlay(o.playbook) && (o.status === "open" || o.status === "partial")) s.add(`${o.symbol}:${o.side}`);
  for (const o of e.queue) if (on(o.connId) && !isBotPlay(o.playbook)) s.add(`${o.symbol}:${o.side}`);
  return s;
}
function isTerminal(status: LiveOrder['status']): boolean {
  return status === "filled" || status === "cancelled" || status === "rejected";
}
function countPlaced(e: VstEngine, n = 1) {
  e.ledger.ordersPlaced += n;
}
function markTerminal(e: VstEngine, o: LiveOrder, status: 'filled' | 'cancelled' | 'rejected') {
  if (isTerminal(o.status)) return;
  o.status = status;
  if (status === "filled") o.remaining = 0;
  else o.remaining = Math.max(0, o.qty - o.filled);
  if (status !== "filled" && o.remaining > 1e-12) {
    const pos = e.positions.find((p) => p.connId === o.connId && p.symbol === o.symbol && p.side === o.side && sameProtectLane(p, o, Boolean(e.completeSim)));
    if (pos && pos.legs.some((l) => l.orderId === o.id)) {
      pos.plannedQty = Math.max(pos.qty, (pos.plannedQty || 0) - o.remaining);
      const working = e.orders.some(
        (x) =>
          x !== o &&
          x.connId === o.connId &&
          x.symbol === o.symbol &&
          x.side === o.side &&
          (x.status === "open" || x.status === "partial") &&
          x.remaining > 1e-12 &&
          sameProtectLane(pos, x, Boolean(e.completeSim)),
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
      live: queued + working,
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

export function pickLiveTactic(e: VstEngine, ind: IndicationId, fallback: TacticKind): TacticKind {
  const tog = e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
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

/** Every enabled tactic — no skip of trailing/axis/hybrid. DCA only if toggle on. */
export function enabledLiveTactics(e: VstEngine): TacticKind[] {
  const tog = e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
  const out: TacticKind[] = [];
  if (tog.trailing !== false) out.push("trailing");
  if (tog.axis !== false) out.push("axis");
  out.push("hybrid");
  if (tog.dca) out.push("dca");
  return out;
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
  const catalog = (e.shortProgress?.indications?.length ? e.shortProgress.indications : SHORT_PROGRESS_INDICATIONS) as IndicationId[];
  const score = (id: IndicationId) => {
    const q = indicationQuality(id, pack);
    const ev = e.progressEval?.indications?.[id];
    const mag = Math.abs(Number((pack as unknown as Record<string, number>)[id]) || 0);
    return (id === winner ? 80 : 0) + q * 8 + (ev && ev.n >= 3 ? ev.pf * 4 : 0) + mag + liveLaneScore(e, id);
  };
  return catalog.slice().sort((a, b) => score(b) - score(a));
}

/** All enabled tactics, preferred / higher PF first. */
export function rankTactics(e: VstEngine, preferred: TacticKind): TacticKind[] {
  const score = (t: TacticKind) => {
    const ev = e.progressEval?.tactics?.[t];
    return (t === preferred ? 80 : 0) + (ev && ev.n >= 3 ? ev.pf : 1) + liveTacticScore(e, t);
  };
  return enabledLiveTactics(e).slice().sort((a, b) => score(b) - score(a));
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
  return Math.min(maxMul, Math.max(0.12, iv * lose * prog));
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
  if (internAllPhase(e)) return allShortTpSlCombos().filter(inRange);
  const intern = e.progressEval?.shortCombos;
  const withinFloors = (c: { tpAtr: number; slOfTp: number }) => {
    if (c.tpAtr + 1e-9 < snapShortTpAtr(sp.minTpAtr)) return false;
    if (c.slOfTp + 1e-9 < snapShortSlOfTp(sp.minSlOfTp)) return false;
    if (c.tpAtr - 1e-9 > snapShortTpAtr(sp.maxTpAtr ?? 0.6)) return false;
    return true;
  };
  const gated = Boolean(e.preEvalDone || e.liveTape);
  if (gated && intern) {
    return allShortTpSlCombos().filter((c) => {
      if (!withinFloors(c) || !inRange(c)) return false;
      return shortComboProven(e, c.tpAtr, c.slOfTp);
    });
  }
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
  const dropPending = (o: LiveOrder) => o.validExec !== true;
  for (const o of e.queue) {
    if (dropPending(o)) markTerminal(e, o, "cancelled");
  }
  e.queue = e.queue.filter((o) => !dropPending(o));
  for (const o of e.orders) {
    if ((o.status === "open" || o.status === "partial" || o.status === "queued") && dropPending(o)) markTerminal(e, o, "cancelled");
  }
  const keepPos: typeof e.positions = [];
  for (const p of e.positions) {
    if (p.validExec === true) {
      keepPos.push(p);
      continue;
    }
    p.validExec = false;
    const px = p.mark > 0 ? p.mark : p.avgEntry;
    closePosition(e, p, px, "time");
  }
  e.positions = keepPos;
  const snap: Record<string, { pnl: number }[]> = {};
  for (const [k, rows] of Object.entries(e.shortComboTape ?? {})) {
    snap[k] = rows.map((r) => ({ pnl: r.pnl }));
  }
  e.shortComboPreTape = snap;
  e.shortComboTape = {};
  const relSnap: Record<string, { pnl: number }[]> = {};
  for (const [k, rows] of Object.entries(e.shortRelTape ?? {})) {
    relSnap[k] = rows.map((r) => ({ pnl: r.pnl }));
  }
  e.shortRelPreTape = relSnap;
  e.shortRelTape = {};
  refreshValidRelKeys(e);
  if (Object.keys(internKeys).length) e.prePassKeys = internKeys;
  freezeLiveTypeGate(e);
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
  const internAll = internAllPhase(e);
  const isolatedLive = Boolean(e.completeSim) && Boolean(e.preEvalDone) && !internExplore && !completeOpenTape(e);
  const provenPreview: typeof all = [];
  for (const c of all) {
    if (c && shortComboProven(e, c.tpAtr, c.slOfTp)) provenPreview.push(c);
  }
  // No combo cap. Intern scores every live-floor pair. After types, live is only the pairs that passed.
  if (isolatedLive) return provenPreview;
  if (!internAll) return all;
  const sp = e.shortProgress;
  const minTp = snapShortTpAtr(sp?.minTpAtr ?? DEFAULT_SHORT_MIN_TP_ATR);
  const minSl = snapShortSlOfTp(sp?.minSlOfTp ?? DEFAULT_SHORT_MIN_SL_OF_TP);
  const floor = all.filter((c) => c && c.tpAtr + 1e-9 >= minTp && c.slOfTp + 1e-9 >= minSl);
  return floor.length ? floor : all;
}

export function armUniverse(e: VstEngine, cfg: TacticConfig, _tactic: TacticKind, rangeType?: RangeType) {
  if (!isDeskConn(e.activeConnId)) e.activeConnId = VST_DEFAULT_CONN;
  const connId = e.activeConnId;
  const qMax = maxQueue(e);
  const hardMax = maxPositions(e);
  const pMax = hardMax;
  let qn = 0;
  let pn = 0;
  const symLoad = new Map<string, number>();
  const noteLoad = (id: string) => symLoad.set(id, (symLoad.get(id) || 0) + 1);
  for (const o of e.queue) if (o.connId === connId && !isBotPlay(o.playbook)) {
    qn += 1;
    noteLoad(o.symbol);
  }
  for (const o of e.orders) {
    if (o.connId !== connId || isBotPlay(o.playbook) || (o.status !== "open" && o.status !== "partial")) continue;
    noteLoad(o.symbol);
  }
  for (const p of e.positions) if (p.connId === connId && !isBotPlay(p.playbook)) {
    pn += 1;
    noteLoad(p.symbol);
  }
  const symCap = 1e9;
  if (qn >= qMax || pn >= pMax) return;
  const busy = occupiedSymbols(e, connId);
  const busyLegs = occupiedLegs(e, connId);
  const universe = rankUniverse(e);
  const winN = Math.min(16, Math.max(1, Math.round(e.blockCfg?.evalPosCount || 6)));
  const complete = Boolean(e.completeSim) && paperMode(e);
  const internAll0 = internAllPhase(e);
  const openTape = completeOpenTape(e);
  const livePace = openTape || performingLive(e);
  const gated0 = Boolean(e.preEvalDone || e.liveTape);
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
  universe.forEach((s, rank) => {
    const q = e.quotes[s.id];
    if (!q || !(q.px > 0)) return;
    const beyondLive =
      Boolean(e.liveTape) &&
      rank >= liveCap &&
      !busy.has(s.id) &&
      !busyLegs.has(`${s.id}:long`) &&
      !busyLegs.has(`${s.id}:short`);
    const internSlot = livePace ? false : rank >= liveCap || (internOnlyFloor >= 0 && rank >= internOnlyFloor) || beyondLive;
    if (!openTape && (e.liveTape || (complete && gated0 && !internAll0)) && rank >= liveCap && !internSlot) return;
    if (!internSlot && internReserve && qn >= qMax - internReserve) return;
    if (!internSlot && skipLiveSymbol(e, s.id, winN)) return;
    if ((e.cooldown[cooldownKey(connId, s.id)] ?? 0) > e.tick) return;
    if (pn >= pMax) return;
    if ((symLoad.get(s.id) || 0) >= symCap) return;
    const mode = e.blockCfg?.sides ?? "both";
    const axisTactic = e.lastTactic === "axis";
    const atr = Math.max(q.atr, q.px * 0.0008, 1e-9);
    const disp = Math.abs(q.px - (q.axis || q.px)) / atr;
    if (axisTactic && (disp < 0.35 || disp > 2.6)) return;
    const meanSide: Side = q.px >= (q.axis || q.px) ? "short" : "long";
    const pack = symbolIndications(s.id);
    const symbolBands = openTape || performingLive(e) || internAll0 ? rangeBands(q, cfg) : undefined;
    const winner = classifyIndication(e, s.id);
    let liveInd: IndicationId = winner;
    if (!complete && winner !== "break") {
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
    const allLanes = internAll0 || internSlot || (complete && !e.shortComboOnly) || Boolean(e.liveTape);
    const inds = allLanes ? rankIndications(e, pack, liveInd) : [liveInd];
    let trySides = axisTactic ? [meanSide] : symbolSideSet(s.id, mode, direction(q));
    const dual = trySides.length === 2;
    if (!dual && !complete && e.blockCfg?.windows !== false && symbolBlockPaused(e, s.id, winN)) return;
    for (const ind of inds) {
      let sides = trySides;
      if (!complete && !axisTactic && ind === "break") {
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
      const tacs = allLanes ? rankTactics(e, pickLiveTactic(e, ind, e.lastTactic)) : [e.lastTactic];
      for (const tac of tacs) {
      if ((openTape || performingLive(e)) && !liveIndStillPays(e, ind)) continue;
      if (performingLive(e)) {
        const gate = typeGateMem.get(e);
        const indRow = gate?.indications?.[ind];
        const tacRow = gate?.tactics?.[tac];
        if (gate && !indRow?.ok) continue;
        if (gate && tacRow && tacRow.n >= 4 && !tacRow.ok) continue;
      }
      const axisInd = tac === "axis";
      const book = cfgUsesShortRange(cfg)
        ? "short"
        : tac === "dca"
          ? "dca"
          : tac === "axis"
            ? "axis"
            : e.strategyToggles?.normal === false
              ? "short"
              : openPlaybook(tac, ind);
      const kind = cfgUsesShortRange(cfg) ? "short" : kindFromIndication(ind, book, tac);
      const range = pickIndicationRange(e, ind, rangeType ?? e.lastRange ?? "atr");
      const shortLane = cfgUsesShortRange(cfg);
      const keepInd =
        book === "block" ||
        (DEFAULT_LOSING_HOUR_INDS as readonly string[]).includes(ind) ||
        ind === "break" ||
        ind === "active";
      for (const side of sides) {
        if (qn >= qMax || pn >= pMax) break;
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
        const validExec = internHere ? false : (!gatedExec || liveShouldExecute(e, execRel));
        if (!internKeep && !internHere && !validExec && !keepInd && !shortLane) continue;
        const short = shortLane;
        const evalGrid = internHere && short
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
        let grid = short ? sliceShortGrid(e, evalGrid as ReturnType<typeof shortProtectGrid>, rank, s.id, side, internSlot || internKeep || !gatedExec) : [null];
        if (performingLive(e) && short && grid.length > 1) {
          const indPf = typeGateMem.get(e)?.indications?.[ind]?.pf ?? 1;
          const breadth = Math.max(1, Math.min(grid.length, 1 + Math.floor((Math.min(indPf, 2) - 1) / 0.15)));
          grid = grid
            .map((c) => ({
              c,
              pf: c ? comboTapeStats(e.shortComboPreTape?.[shortComboKey(c.tpAtr, c.slOfTp)]).pf : 0,
            }))
            .sort((a, b) => b.pf - a.pf)
            .slice(0, breadth)
            .map((x) => x.c);
        }
        const hourBusy = livePace && hourTapeBusy(e);
        const trailPct = snapTrailPct(cfg.trailingPct);
        let internAllArmed = false;
        for (const prot of grid) {
          if (qn >= qMax || pn >= pMax) break;
          const comboKey = prot ? shortComboKey(prot.tpAtr, prot.slOfTp) : "";
          const comboOk = !prot || internAll || internSlot || internKeep || shortComboProven(e, prot.tpAtr, prot.slOfTp);
          const comboExec = internHere
            ? false
            : !gatedExec || liveShouldExecute(e, prot ? { ...execRel, tpAtr: prot.tpAtr, slOfTp: prot.slOfTp } : execRel);
          if (gatedExec && prot && !internHere && !(e.shortComboOnly && paperMode(e))) {
            if (!comboOk) continue;
            if (!comboExec && !keepInd && !internKeep) continue;
          }
          let laneValid = internHere ? false : comboExec && comboOk;
          // Mixed intern indication PF must not skip a proven independent short combo.
          if (complete && gatedExec && laneValid && !short) {
            const indRow = e.progressEval?.indications?.[ind];
            if (indRow && indRow.n >= 6 && !indRow.ok && !keepInd) continue;
          }
          if (!laneValid && !internHere && !internKeep) continue;
          if (!laneValid && (internHere || internKeep) && gatedExec && busyLegs.has(`${s.id}:${side}`)) continue;
          const exclusiveLeg = internSlot || (complete && gatedExec && !internHere && !livePace);
          const downHour = livePace && highTradeHourDown(e);
          const dirExam = ind === "direction" && performingLive(e);
          const paysHour = dirExam || (livePace && indicationPaysThisHour(e, ind));
          const ddNow = livePace || internAll0 ? sessionDrawdown(e) : 0;
          const ddCut = ddNow >= 0.018 ? 0.72 : 1;
          const relAlign = meanSide === "short" ? (pack.prevRel ?? 0) : -(pack.prevRel ?? 0);
          const bands = livePace || dirExam ? symbolBands : undefined;
          const useCalc = openTape || dirExam;
          const legs: IndCalcLeg[] = !useCalc
            ? [{ kind: "base", range, spaceMul: 1, sizeMul: 1, near: 0.11 }]
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
                  bands,
                }).map((leg) => ({ ...leg, sizeMul: leg.sizeMul * ddCut }));
          for (const leg of legs) {
          const legKey = exclusiveLeg
            ? `${s.id}:${side}`
            : `${s.id}:${side}:${ind}:${tac}:${comboKey || "x"}:${leg.kind}:${leg.range}`;
          if (busyLegs.has(legKey)) continue;
          if (!internAll && exclusiveLeg && busyLegs.has(`${s.id}:${side}`)) continue;
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
          const axisLv = axisInd && !short ? axisProtect(pxHint > 0 ? pxHint : q.px, side, q, hi.spacing, cfg) : null;
          const slAtrUse = prot?.slAtr ?? cfg.slAtr ?? SL_ATR_MULT;
          const tpRatioUse = short
            ? Math.max(0.3, prot?.tpRatio ?? cfg.tpRatio ?? TP_SL_RATIO)
            : snapTpRatio(cfg.tpRatio ?? TP_SL_RATIO);
          const slBase = slDist(q.atr, hi.spacing, slAtrUse, short);
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
            : leg.kind !== "base"
            ? 1
            : internSlot || internHere
            ? 1
            : complete
            ? hi.levels.length
            : axisInd
              ? Math.min(Math.max(2, cfg.axisLevels), hi.levels.length, axisPartial >= 2 ? 2 : 5)
              : hi.levels.length;
          hi.levels.slice(0, Math.max(1, depth)).forEach((offset, li) => {
            if (qn >= qMax) return;
            if ((symLoad.get(s.id) || 0) >= symCap) return;
            const nearBook = livePace || internAll0;
            const nearOff = nearBook ? Math.min(offset, atr * (leg.kind === "base" && li > 0 ? 0.24 : leg.near)) : offset;
            const anchor = nearBook ? q.px * 0.7 + q.axis * 0.3 : q.axis;
            const px = side === "long" ? anchor - nearOff : anchor + nearOff;
            if (px <= 0) return;
            const baseQty = notional / px;
            const qty = axisInd ? baseQty * axisPartial : baseQty;
            const lv = axisInd && !short ? axisProtect(px, side, q, hi.spacing, cfg) : protectLevels(px, side, sl0, tp0, sl0 > 1e-12 ? tp0 / sl0 : 1, true);
            e.queue.push({
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
              validExec: laneValid,
              tpAtr: prot?.tpAtr,
              slOfTp: prot?.slOfTp,
              trailPct,
              calc: leg.kind,
            });
            noteCalcPlace(e, leg.kind);
            qn += 1;
            noteLoad(s.id);
            countPlaced(e);
          });
          busyLegs.add(legKey);
          if (exclusiveLeg) busyLegs.add(`${s.id}:${side}`);
          }
          if (internAll) internAllArmed = true;
          if (!complete && !comboKey) busy.add(s.id);
        }
        if (internAll && internAllArmed) busyLegs.add(`${s.id}:${side}`);
      }
      }
    }
  });
  e.lastMsg = `Queued ${qn} ladder orders on ${connId} · ${universe.length} symbols${complete ? " · complete inds" : " best-first"} · ${e.orderType}`;
}
function ladderOrderType(orderType: OrderTypeId, level: number): OrderTypeId {
  if (orderType === "market") return "market";
  if (level === 0 && (orderType === "stop" || orderType === "stop_limit" || orderType === "trailing_stop")) return "market";
  return orderType;
}
function refill(e: VstEngine) {
  const add = paperMode(e) ? 40 : 16;
  const burst = paperMode(e) ? 80 : VST_RATE_BURST;
  for (const id of Object.keys(e.tokens)) e.tokens[id] = Math.min(burst, (e.tokens[id] ?? 0) + add);
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
    while (rest.length && (e.tokens[connId] ?? 0) >= 1) {
      if (e.orders.length >= workMax) {
        keep.push(...rest);
        rest = [];
        e.ledger.capRejects += 1;
        break;
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
    q.lo = Math.min(open, close) - span * rand(e.tick, q.id + "lo");
    q.hi = Math.max(open, close) + span * rand(e.tick, q.id + "hi");
    if (q.lo <= 0) q.lo = close * .5;
    if (q.hi < q.lo) q.hi = q.lo * 1.0001;
    q.px = close;
    q.atr = q.atr * .98 + (q.hi - q.lo) * .02;
    q.axis = q.axis * .985 + q.px * .015;
    if (!frozen) q.chg = ret;
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
  const chg = Number.isFinite(q.chg) ? q.chg : 0;
  const aligned = Math.sign(chg || 0) === Math.sign(q.px - q.axis || 0) || Math.abs(chg) < 1e-6;
  const rel = (pack.lastPart ?? 0) * 0.4 + (1 - (pack.drawdown ?? 0)) * 0.3 + Math.abs(pack.prevRel ?? 0) * 0.3;
  const scores: Partial<Record<IndicationId, number>> = {
    trend: Math.abs(pack.trend) * 1.55 + (aligned ? Math.abs(chg) * 14 : Math.abs(chg) * 2.2) + rel * 0.2,
    break:
      Math.abs(pack.break) * 4.05 +
      Math.max(0, span - 1.08) * 3.15 +
      ((q.vol1h ?? 0) > 0.014 && span > 1.1 ? 0.55 : 0) +
      (Math.abs(chg) > 0.004 && span > 1.12 ? 0.35 : 0),
    active: Math.abs(pack.active) * 2.2 + Math.min(2.0, (q.vol1h ?? 0) * 40) + rel * 0.15,
    direction: Math.abs(pack.direction) * 3.15 + (!aligned ? Math.abs(chg) * 28 + 0.9 : Math.abs(chg) * 5) + 0.18,
    move: Math.abs(pack.move ?? 0) * 2.8 + Math.max(0, span - 1) * 1.6,
    rsi: Math.abs(pack.rsi ?? 0) * 2.4 + (Math.abs(chg) < 0.002 ? 0.35 : 0),
    bollinger: Math.abs(pack.bollinger ?? 0) * 3.2 + (span < 1.12 ? 0.55 : 0.18) + (!aligned ? 0.22 : 0),
    sar: Math.abs(pack.sar ?? 0) * 2.3 + (aligned ? 0.35 : 0.15),
    macd: Math.abs(pack.macd ?? 0) * 2.2 + Math.abs(chg) * 12,
    ema: Math.abs(pack.ema ?? 0) * 3.15 + (aligned ? 0.55 : 0.18) + rel * 0.18,
  };
  if (Math.abs(pack.break) < 0.08 && span < 1.08 && Math.abs(chg) < 0.0025 && scores.break != null) scores.break *= 0.22;
  if (extra) {
    for (const id of Object.keys(scores) as IndicationId[]) {
      if (scores[id] == null) continue;
      const qn = indicationQuality(id, pack);
      if (qn < indicationQualityFloor(id)) scores[id]! *= 0.08;
      else scores[id]! *= 0.42 + 0.58 * Math.min(1.25, qn);
    }
  }
  const lead = rankedPack[0];
  if (lead && lead[1] >= 0.08 && scores[lead[0]] != null) scores[lead[0]]! += 0.85;
  const ranked = (Object.entries(scores) as [IndicationId, number][])
    .filter(([id]) => !enabled?.length || enabled.includes(id))
    .sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? lead?.[0] ?? "trend";
}

export function openPlaybook(tactic: TacticKind, indication: IndicationId): string {
  if (tactic === "dca") return "dca";
  if (tactic === "axis") return "axis";
  if (indication === "break") return "normal";
  if (indication === "active") return "normal";
  if (indication === "direction") return "normal";
  return "normal";
}

/** When Normal is off, live fills are short/Block — not general Normal lanes. */
export function liveExecPlaybook(
  e: VstEngine,
  tactic: TacticKind,
  indication: IndicationId,
  hinted?: string,
): string {
  if (hinted && hinted !== "normal") return hinted;
  if (tactic === "dca") return "dca";
  if (tactic === "axis") return "axis";
  const tog = e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
  if (!tog.normal) {
    if (tog.block && (e.blockCfg?.activeLive || e.blockCfg?.enabled)) return "block";
    return "short";
  }
  return hinted || openPlaybook(tactic, indication);
}

export function tacticForIndication(id: IndicationId, t?: { axis?: boolean; trailing?: boolean }): TacticKind {
  if (t?.axis === false) return "trailing";
  if (id === "direction" || id === "rsi" || id === "bollinger") return "axis";
  return "hybrid";
}

export function kindFromIndication(id: IndicationId, playbook: string, tactic: TacticKind): StrategyKind {
  if (playbook === "block") return "block";
  if (playbook === "short") return "short";
  if (id === "trend" || id === "move" || id === "ema" || id === "sar") return "trend";
  if (id === "break") return "breakout";
  if (id === "active") return "active";
  if (id === "direction" || id === "rsi" || id === "bollinger") return "mean";
  if (id === "macd") return "hybrid";
  if (tactic === "hybrid") return "hybrid";
  if (tactic === "axis") return "mean";
  if (tactic === "dca") return "volume";
  return "trend";
}

const IND_RANGE_PREF: Record<IndicationId, RangeType[]> = {
  trend: ["atr"],
  break: ["atr", "linear"],
  active: ["atr"],
  direction: ["linear", "atr"],
  move: ["atr"],
  rsi: ["atr"],
  bollinger: ["atr"],
  sar: ["atr", "linear"],
  macd: ["atr", "linear", "geometric"],
  ema: ["linear", "geometric", "fibonacci"],
};

const REDUNDANT_INDS: Partial<Record<IndicationId, IndicationId[]>> = {
  trend: ["sar", "macd"],
  ema: ["sar"],
  sar: ["trend", "ema"],
  macd: ["trend"],
  break: ["move"],
  move: ["break"],
  rsi: ["bollinger"],
  bollinger: ["rsi"],
};

export function indicationProtect(id: IndicationId): { slMul: number; tpMul: number; holdMul: number } {
  if (id === "break") return { slMul: 1.18, tpMul: 1.55, holdMul: 1.45 };
  if (id === "move") return { slMul: 1.28, tpMul: 1.52, holdMul: 1.38 };
  if (id === "sar") return { slMul: 1.16, tpMul: 1.40, holdMul: 1.32 };
  if (id === "active") return { slMul: 1.18, tpMul: 1.55, holdMul: 1.45 };
  if (id === "direction") return { slMul: 1.08, tpMul: 1.72, holdMul: 1.58 };
  if (id === "rsi") return { slMul: 1.18, tpMul: 1.55, holdMul: 1.45 };
  if (id === "bollinger") return { slMul: 1.18, tpMul: 1.55, holdMul: 1.45 };
  if (id === "ema") return { slMul: 1.16, tpMul: 1.40, holdMul: 1.32 };
  if (id === "macd") return { slMul: 1.14, tpMul: 1.42, holdMul: 1.34 };
  if (id === "trend") return { slMul: 1.18, tpMul: 1.55, holdMul: 1.45 };
  return { slMul: 1, tpMul: 1, holdMul: 1 };
}

const BUSY_WEAK_INDS = new Set<IndicationId>([]);

/** Busy hour: weak lanes take a wider target. Indications that already aim wide keep that protect. Flat scalp lanes (rsi) stay put. */
export function busyIndicationProtect(id: IndicationId): { slMul: number; tpMul: number; holdMul: number } {
  const tuned = BUSY_HOUR_WEAK_PROTECT[id];
  if (tuned) return tuned;
  return indicationProtect(id);
}

const hourFlowCache = new WeakMap<VstEngine, { hour: number; n: number; net: number; byInd: Record<string, { n: number; net: number }> }>();

function noteHourFlow(e: VstEngine, indication: IndicationId | undefined, pnl: number) {
  const hour = Math.floor(Math.max(0, e.tick) / TICKS_PER_HOUR);
  let bag = hourFlowCache.get(e);
  if (!bag || bag.hour !== hour) {
    bag = { hour, n: 0, net: 0, byInd: {} };
    hourFlowCache.set(e, bag);
  }
  const x = Number.isFinite(pnl) ? pnl : 0;
  bag.n += 1;
  bag.net += x;
  const id = indication || "trend";
  const row = bag.byInd[id] ?? (bag.byInd[id] = { n: 0, net: 0 });
  row.n += 1;
  row.net += x;
}

/** High-trade hour whose average position return is actually negative, not a one-fee dip. */
export function highTradeHourDown(e: VstEngine): boolean {
  const bag = hourFlowCache.get(e);
  const hour = Math.floor(Math.max(0, e.tick) / TICKS_PER_HOUR);
  if (!bag || bag.hour !== hour || bag.n < 80) return false;
  return bag.net / bag.n < -0.0008;
}

/** This hour: live net if the indication already has a sample, else the known high-trade pay set. */
export function indicationPaysThisHour(e: VstEngine, id: IndicationId): boolean {
  const bag = hourFlowCache.get(e);
  const hour = Math.floor(Math.max(0, e.tick) / TICKS_PER_HOUR);
  const row = bag && bag.hour === hour ? bag.byInd[id] : undefined;
  if (row && row.n >= 8) return row.net > 0;
  return (HIGH_TRADE_PAY_INDICATIONS as readonly string[]).includes(id);
}

/** Up to three range calcs. Primary first, then the indication's own pref list. */
export function expandPayRanges(id: IndicationId, primary: RangeType): RangeType[] {
  const out: RangeType[] = [];
  const push = (r: RangeType) => {
    if (r && !out.includes(r)) out.push(r);
  };
  push(primary);
  for (const r of IND_RANGE_PREF[id] || []) push(r);
  return out.slice(0, 3);
}

export type IndCalcLeg = { kind: IndCalcKind; range: RangeType; spaceMul: number; sizeMul: number; near: number };

/** Base ladder plus one context leg: drawdown uses the wide range near the market, past relation uses tight or wide, busy hours keep a middle extra. At most four legs. */
export function indicationCalcLegs(args: {
  id: IndicationId;
  primary: RangeType;
  dd: number;
  pxStretch: number;
  pays: boolean;
  busy: boolean;
  /** 0–1 price drawdown from the recent peak. */
  ddActivity?: number;
  /** Positive when the past relation agrees with this fade. */
  relAlign?: number;
  bands?: { low: RangeType; mid: RangeType; high: RangeType };
}): IndCalcLeg[] {
  const legs: IndCalcLeg[] = [{ kind: "base", range: args.primary, spaceMul: 1, sizeMul: 1, near: 0.11 }];
  const stretch = Number.isFinite(args.pxStretch) ? args.pxStretch : 0;
  const paysRange = (range: RangeType) => (IND_RANGE_PREF[args.id] || []).includes(range);
  if (args.pays && paysRange("linear") && stretch >= 0.28 && stretch <= 1.6) {
    const near = Math.min(0.14, Math.max(0.09, 0.11 + (stretch - 0.55) * 0.04));
    legs.push({
      kind: "px",
      range: "linear",
      spaceMul: 1,
      sizeMul: 0.55,
      near,
    });
  }
  if (args.pays && args.bands && args.id !== "break" && args.id !== "sar" && args.id !== "move" && args.id !== "direction") {
    const ddAct = Number.isFinite(args.ddActivity) ? Math.max(0, args.ddActivity!) : 0;
    const align = Number.isFinite(args.relAlign) ? args.relAlign! : 0;
    let leg: IndCalcLeg | null = null;
    if (ddAct >= 0.18) {
      leg = { kind: "dd", range: args.bands.high, spaceMul: 1, sizeMul: 0.42, near: align > 0.2 ? 0.09 : 0.12 };
    } else if (align >= 0.22) {
      leg = { kind: "rng", range: args.bands.low, spaceMul: 1, sizeMul: 0.5, near: 0.12 };
    } else if (align <= -0.22) {
      leg = { kind: "rng", range: args.bands.high, spaceMul: 1, sizeMul: 0.45, near: 0.2 };
    } else if (args.busy) {
      const mid = args.bands.mid !== args.primary ? args.bands.mid : args.bands.low;
      if (mid !== args.primary) leg = { kind: "rng", range: mid, spaceMul: 1, sizeMul: 0.55, near: 0.2 };
    }
    if (leg && paysRange(leg.range) && (leg.range !== args.primary || leg.kind === "dd")) legs.push(leg);
  } else if (args.pays && args.busy && args.id !== "break" && args.id !== "sar" && args.id !== "move" && args.id !== "direction") {
    const extra = expandPayRanges(args.id, args.primary).find((r) => r !== args.primary);
    if (extra) {
      legs.push({
        kind: "rng",
        range: extra,
        spaceMul: 1,
        sizeMul: 0.55,
        near: 0.2,
      });
    }
  }
  if ((args.id === "break" || args.id === "sar" || args.id === "move") && legs.length > 1) {
    return legs.filter((l) => l.kind === "base" || l.kind === "px");
  }
  if (args.id === "direction" && args.pays && args.bands) {
    const ddAct = Number.isFinite(args.ddActivity) ? Math.max(0, args.ddActivity!) : 0;
    const align = Number.isFinite(args.relAlign) ? args.relAlign! : 0;
    if (ddAct >= 0.08 && paysRange(args.bands.high) && !legs.some((l) => l.kind === "dd")) {
      legs.push({ kind: "dd", range: args.bands.high, spaceMul: 1, sizeMul: 0.48, near: 0.08 });
    }
    if (align >= 0.08 && paysRange(args.bands.low) && args.bands.low !== args.primary && !legs.some((l) => l.kind === "rng" && l.range === args.bands!.low)) {
      legs.push({ kind: "rng", range: args.bands.low, spaceMul: 1, sizeMul: 0.55, near: 0.1 });
    }
  }
  return legs.slice(0, 4);
}

/** Closed-tape drawdown only. Open mark-to-market must not shrink size after the book fills. */
function sessionDrawdown(e: VstEngine): number {
  const eq = Number(e.stats?.equity) || 0;
  const peak = Math.max(Number(e.ledger?.peak) || 0, Number(e.startEquity) || 0, eq);
  if (!(peak > 0) || !(eq > 0)) return 0;
  return Math.min(1, Math.max(0, (peak - eq) / peak));
}

type CalcBag = Record<IndCalcKind, { placed: number; n: number; profit: number; loss: number }>;
const calcStat = new WeakMap<VstEngine, CalcBag>();

function calcBagOf(e: VstEngine): CalcBag {
  let bag = calcStat.get(e);
  if (!bag) {
    const z = () => ({ placed: 0, n: 0, profit: 0, loss: 0 });
    bag = { base: z(), dd: z(), px: z(), rng: z() };
    calcStat.set(e, bag);
  }
  return bag;
}

function noteCalcPlace(e: VstEngine, kind: IndCalcKind) {
  calcBagOf(e)[kind].placed += 1;
}

function noteCalcClose(e: VstEngine, kind: IndCalcKind | undefined, pnl: number, count: boolean) {
  if (!count) return;
  const row = calcBagOf(e)[kind || "base"];
  row.n += 1;
  if (pnl > 0) row.profit += pnl;
  else row.loss += Math.abs(pnl);
}

type RangeCell = { n: number; profit: number; loss: number };
const indRangeStat = new WeakMap<VstEngine, Map<string, RangeCell>>();

function noteIndRange(e: VstEngine, indication: string | undefined, range: string | undefined, pnl: number, count: boolean) {
  if (!count) return;
  let bag = indRangeStat.get(e);
  if (!bag) {
    bag = new Map();
    indRangeStat.set(e, bag);
  }
  const key = `${indication || "trend"}:${range || "atr"}`;
  const row = bag.get(key) ?? { n: 0, profit: 0, loss: 0 };
  row.n += 1;
  if (pnl > 0) row.profit += pnl;
  else row.loss += Math.abs(pnl);
  bag.set(key, row);
}

export function indRangeStatsOf(e: VstEngine) {
  const bag = indRangeStat.get(e);
  if (!bag) return [] as { id: string; range: string; n: number; pf: number; net: number }[];
  return [...bag.entries()]
    .map(([key, r]) => {
      const i = key.indexOf(":");
      return { id: key.slice(0, i), range: key.slice(i + 1), n: r.n, pf: profitFactor(r.profit, r.loss), net: r.profit - r.loss };
    })
    .sort((a, b) => a.id.localeCompare(b.id) || b.net - a.net);
}

export function calcDiffOf(e: VstEngine) {
  const bag = calcBagOf(e);
  const kinds: IndCalcKind[] = ["base", "dd", "px", "rng"];
  const rows = kinds.map((kind) => {
    const r = bag[kind];
    return { kind, n: r.n, pf: profitFactor(r.profit, r.loss), net: r.profit - r.loss, placed: r.placed };
  });
  let extraP = 0;
  let extraL = 0;
  let extraN = 0;
  let ordersExtra = 0;
  for (const kind of kinds) {
    if (kind === "base") continue;
    const src = bag[kind];
    extraN += src.n;
    ordersExtra += src.placed;
    extraP += src.profit;
    extraL += src.loss;
  }
  const extraPf = profitFactor(extraP, extraL);
  const extraNet = extraP - extraL;
  const weak = rows.filter((r) => r.kind !== "base" && r.n >= 12 && r.pf + 1e-9 < 1);
  const good = extraN >= 8 && extraPf + 1e-9 >= 1 && extraNet > -1e-9 && weak.length === 0;
  const ddOrders = bag.dd.placed;
  const note = good
    ? `kept — extra orders ${ordersExtra} vs base ${rows[0]?.placed ?? 0}, PF ${extraPf.toFixed(2)}, net ${extraNet >= 0 ? "+" : ""}${extraNet.toFixed(3)}${ddOrders ? ` · drawdown legs ${ddOrders}` : ""}`
    : weak.length
      ? `check — ${weak.map((r) => `${r.kind} PF ${r.pf.toFixed(2)}`).join(", ")}`
      : extraN < 8
        ? "thin — extra legs have not filled enough yet"
        : `check — extra PF ${extraPf.toFixed(2)} net ${extraNet.toFixed(3)}`;
  return {
    rows,
    baseN: rows[0]?.n ?? 0,
    extraN,
    extraPf,
    extraNet,
    ordersBase: rows[0]?.placed ?? 0,
    ordersExtra,
    good,
    note,
  };
}

const hourBusyCache = new WeakMap<VstEngine, { tick: number; busy: boolean }>();

/** Hour is busy once fills are already stacking, or the last few ticks closed a thick tape. */
export function hourTapeBusy(e: VstEngine): boolean {
  const hit = hourBusyCache.get(e);
  if (hit && hit.tick === e.tick) return hit.busy;
  let busy = false;
  const hour = Math.floor(Math.max(0, e.tick - 1) / TICKS_PER_HOUR);
  const hl = e.hourLive;
  if (hl && hl.hour === hour && hl.n >= 24) busy = true;
  if (!busy && e.closed.length) {
    const from = e.tick - 12;
    let recent = 0;
    const cap = Math.min(80, e.closed.length);
    for (let i = 0; i < cap; i++) {
      const c = e.closed[i];
      if (!c || (c.tick || 0) <= from) break;
      recent += 1;
      if (recent >= 18) {
        busy = true;
        break;
      }
    }
  }
  hourBusyCache.set(e, { tick: e.tick, busy });
  return busy;
}

export function pickIndicationRange(e: VstEngine, id: IndicationId, fallback?: RangeType): RangeType {
  const pref = IND_RANGE_PREF[id] || [];
  const best = e.indRangeBest?.[id];
  if (best && pref.includes(best)) return best;
  if (fallback && pref.includes(fallback)) return fallback;
  return pref[0] ?? "atr";
}
export function playbookOf(e: VstEngine, o: LiveOrder): string {
  if (o.playbook && o.playbook !== "normal") return o.playbook;
  if (/^Block\b/i.test(o.note || "") || /Overall Block/i.test(o.note || "")) return "block";
  if (/^DCA/i.test(o.note || "") || e.lastTactic === "dca") return "dca";
  if (e.lastTactic === "axis" || /^axis\b/i.test(o.note || "")) return "axis";
  return "normal";
}
function sameProtectLane(p: { indication?: string; tpAtr?: number; slOfTp?: number; playbook?: string; calc?: string }, o: { indication?: string; tpAtr?: number; slOfTp?: number; playbook?: string; note?: string; calc?: string }, complete: boolean) {
  const botP = String(p.playbook || "");
  const botO = String(o.playbook || "");
  if (botP.startsWith("bot:") || botO.startsWith("bot:")) return botP !== "" && botP === botO;
  if (complete && (p.indication || "") !== (o.indication || p.indication || "")) return false;
  if (complete && (p.calc || "base") !== (o.calc || "base")) return false;
  const oBlock = o.playbook === "block" || /Block/i.test(o.note || "");
  if (p.tpAtr != null && p.slOfTp != null && o.tpAtr != null && o.slOfTp != null) {
    return shortComboKey(p.tpAtr, p.slOfTp) === shortComboKey(o.tpAtr, o.slOfTp);
  }
  if (oBlock && (o.tpAtr == null || o.slOfTp == null)) return true;
  if ((p.tpAtr != null) !== (o.tpAtr != null)) return false;
  return true;
}

function applyFill(e: VstEngine, o: LiveOrder, qty: number, px: number, kind: Fill['kind']) {
  if (!ownedByDesk(o)) return;
  if (qty <= 0 || !Number.isFinite(qty) || !Number.isFinite(px) || px <= 0) return;
  const unit = positionNotional(paperSizeEquity(e), e.costStep || 10);
  const want = Math.min(qty, o.remaining);
  const runaway = o.qty > 1000 || want * px > 2_000_000;
  const botOrder = String(o.playbook || "").startsWith("bot:");
  const take = !botOrder && runaway ? Math.min(want, (unit * 4) / px) : want;
  if (take <= 0) return;
  o.filled += take;
  o.remaining = Math.max(0, o.qty - o.filled);
  const done = o.remaining <= 1e-12;
  let pos = e.positions.find(
    (p) =>
      p.connId === o.connId &&
      p.symbol === o.symbol &&
      p.side === o.side &&
      sameProtectLane(p, o, Boolean(e.completeSim)),
  );
  const created = !pos;
  if (!pos) {
    if (e.positions.length >= maxPositions(e)) {
      o.filled -= take;
      o.remaining = o.qty - o.filled;
      markTerminal(e, o, "rejected");
      e.ledger.capRejects += 1;
      e.lastMsg = `Position cap ${maxPositions(e)} — rejected new lane`;
      return;
    }
    const rawR = o.slDist > 1e-12 ? o.tpDist / o.slDist : 1;
    const lv = protectLevels(px, o.side, o.slDist, o.tpDist, rawR, true);
    pos = {
      id: nextId(e, "p"),
      connId: o.connId,
      symbol: o.symbol,
      side: o.side,
      qty: 0,
      plannedQty: o.qty,
      avgEntry: px,
      mark: px,
      sl: lv.sl,
      tp: lv.tp,
      slDist: lv.slDist,
      tpDist: lv.tpDist,
      realized: 0,
      unrealized: 0,
      legs: [],
      controllingRange: o.rangeType,
      rangeSpacing: Math.abs(o.price - (e.quotes[o.symbol]?.axis ?? o.price)),
      status: "partial",
      openedTick: e.tick,
      tactic: o.tactic ?? e.lastTactic,
      indication: o.indication ?? classifyIndication(e, o.symbol),
      kind: o.kind ?? kindFromIndication(o.indication ?? classifyIndication(e, o.symbol), o.playbook ?? playbookOf(e, o), e.lastTactic),
      playbook: o.playbook ?? playbookOf(e, o),
      blockLevel: o.playbook === "block" || /^Block\b/i.test(o.note || "") || /Overall Block/i.test(o.note || "") ? Math.max(1, o.level || 1) : undefined,
      peakPx: px,
      validExec: o.validExec === true,
      tpAtr: o.tpAtr,
      slOfTp: o.slOfTp,
      trailPct: o.trailPct,
      calc: o.calc ?? "base",
    };
    e.positions.push(pos);
  } else if (!pos.legs.some((l) => l.orderId === o.id)) {
    pos.plannedQty += o.qty;
  }
  const newQty = pos.qty + take;
  pos.avgEntry = pos.qty <= 0 ? px : (pos.avgEntry * pos.qty + px * take) / newQty;
  pos.qty = newQty;
  pos.mark = px;
  pos.legs.push({
    orderId: o.id,
    qty: take,
    px
  });
  recordBlockFill(e, o, take);
  // validExec is sticky at open. Intern never promotes into live; intern never demotes live.
  if (/Block/i.test(o.note || "")) {
    pos.blockLevel = Math.max(pos.blockLevel || 1, o.level || 1);
    pos.blockQty = (pos.blockQty || 0) + take;
    if (created) {
      pos.playbook = "block";
      pos.kind = "block";
    }
  } else if (/^DCA/i.test(o.note || "")) {
    pos.playbook = pos.playbook === "block" ? "block" : "dca";
  }
  if (!created) {
    const sameCombo = o.tpAtr == null || pos.tpAtr == null || shortComboKey(pos.tpAtr, pos.slOfTp ?? 0) === shortComboKey(o.tpAtr, o.slOfTp ?? 0);
    if (sameCombo) {
      const slUse = Math.max(Number(o.slDist) || 0, Number(pos.slDist) || 0, 1e-12);
      const tpUse = Math.max(Number(o.tpDist) || 0, Number(pos.tpDist) || 0, 1e-12);
      const entry = pos.avgEntry;
      if (pos.side === "long") {
        pos.sl = Math.min(pos.sl, entry - slUse);
        pos.tp = Math.max(pos.tp, entry + tpUse);
      } else {
        pos.sl = Math.max(pos.sl, entry + slUse);
        pos.tp = Math.min(pos.tp, entry - tpUse);
      }
      pos.slDist = Math.abs(pos.sl - entry);
      pos.tpDist = Math.abs(pos.tp - entry);
      const slOf = Number(pos.slOfTp);
      if (slOf > 0 && pos.tpDist > 0 && pos.slDist > pos.tpDist * slOf + 1e-9) {
        pos.slDist = pos.tpDist * slOf;
        pos.sl = pos.side === "long" ? entry - pos.slDist : entry + pos.slDist;
      }
    }
  }
  const otherWorking = e.orders.some(
    (x) =>
      x !== o &&
      x.symbol === o.symbol &&
      x.side === o.side &&
      x.connId === o.connId &&
      (x.status === "open" || x.status === "partial") &&
      x.remaining > 1e-12 &&
      sameProtectLane(pos, x, Boolean(e.completeSim)),
  );
  const unfilled = pos.qty + 1e-12 < pos.plannedQty * 0.98;
  pos.status = !done || otherWorking || unfilled ? "partial" : "open";
  const qFill = {
    id: nextId(e, "f"),
    orderId: o.id,
    connId: o.connId,
    symbol: o.symbol,
    side: o.side,
    qty: take,
    px,
    pnl: 0,
    kind,
    tick: e.tick,
    remaining: Math.max(0, o.remaining),
    planned: o.qty,
  };
  e.fills.unshift(qFill);
  if (e.fills.length > VST_FILL_KEEP) e.fills.length = VST_FILL_KEEP;
  if (done) markTerminal(e, o, "filled");
  else o.status = "partial";
  rememberLiveHint(e, o);
}
function matchOrders(e: VstEngine) {
  for (const o of e.orders) {
    if (!ownedByDesk(o, e.activeConnId)) continue;
    if (o.status !== "open" && o.status !== "partial") continue;
    if (o.remaining <= 1e-12) {
      markTerminal(e, o, "filled");
      continue;
    }
    const q = e.quotes[o.symbol];
    if (!q || !(q.px > 0)) continue;
    const taker = o.type === "market" || o.type === "ioc" || o.type === "fok";
    const vol = finiteOr(q.vol, 0);
    const openTape = completeOpenTape(e);
    if (!taker && !openTape && vol < MIN_QUOTE_VOL * 0.35) continue;
    if (!(taker || o.side === "long" && q.lo <= o.price || o.side === "short" && q.hi >= o.price)) continue;
    const vf = Math.min(1.55, Math.max(0.32, vol / 0.014));
    const ready = openTape
      ? Math.min(1, 0.78 + rand(e.tick, o.id) * 0.22)
      : Math.min(1, (0.38 + rand(e.tick, o.id) * 0.55) * vf);
    let frac: number;
    if (o.type === "market") frac = 1;
    else if (o.type === "fok") {
      if (ready < 0.98) {
        markTerminal(e, o, "cancelled");
        continue;
      }
      frac = 1;
    } else {
      frac = ready;
    }
    const qty = Math.min(o.remaining, o.qty * frac);
    if (qty <= 0) continue;
    const px = taker && o.type !== "ioc" ? q.px : o.side === "long" ? Math.min(o.price || q.px, q.px) : Math.max(o.price || q.px, q.px);
    applyFill(e, o, qty, px, o.filled > 0 ? "partial" : "entry");
    if (o.status === "partial" && o.remaining > 0 && o.remaining <= Math.max(o.qty * 0.05, 1e-8)) {
      applyFill(e, o, o.remaining, px, "partial");
    }
    if (o.type === "ioc" && o.status === "partial") markTerminal(e, o, "cancelled");
  }
}
function cancelLane(e: VstEngine, p: LivePosition) {
  const complete = Boolean(e.completeSim);
  for (const o of e.orders) {
    if (o.symbol !== p.symbol || o.side !== p.side || o.connId !== p.connId) continue;
    if (!(o.status === "open" || o.status === "partial" || o.status === "queued")) continue;
    if (!sameProtectLane(p, o, complete)) continue;
    markTerminal(e, o, "cancelled");
  }
  cancelQueued(e, (o) => o.symbol === p.symbol && o.side === p.side && o.connId === p.connId && sameProtectLane(p, o, complete));
}
function bookRealized(e: VstEngine, pnl: number, reason: "sl" | "tp" | "time" | "partial") {
  const x = Number.isFinite(pnl) ? pnl : 0;
  if (reason !== "partial") e.ledger.trades += 1;
  if (x > 0) {
    if (reason !== "partial") e.ledger.wins += 1;
    e.ledger.profit += x;
  } else if (x < 0) {
    e.ledger.loss += -x;
  }
  return x;
}

const tickCloseTape = new WeakMap<VstEngine, { tick: number; rows: VstEngine["closed"] }>();

function noteTickClose(e: VstEngine, row: VstEngine["closed"][number]) {
  let bag = tickCloseTape.get(e);
  if (!bag || bag.tick !== e.tick) {
    bag = { tick: e.tick, rows: [] };
    tickCloseTape.set(e, bag);
  }
  bag.rows.push(row);
}

/** Closes booked this tick, oldest first. Survives the closed-tape trim. */
function tickCloses(e: VstEngine): VstEngine["closed"] {
  const bag = tickCloseTape.get(e);
  return bag && bag.tick === e.tick ? bag.rows : [];
}

function closePosition(e: VstEngine, p: LivePosition, exit: number, reason: "sl" | "tp" | "time", opts?: { skipComboTape?: boolean }) {
  if (!(p.qty > 0) || !Number.isFinite(p.qty) || !Number.isFinite(exit) || exit <= 0) {
    cancelLane(e, p);
    return;
  }
  const signed = p.side === "long" ? 1 : -1;
  let pnl = closePnl(signed, p.avgEntry, exit, p.qty);
  const risk = Math.max(p.slDist * p.qty, positionNotional(paperSizeEquity(e), e.costStep || 10) * 0.25, 1e-9);
  if (Math.abs(pnl) > risk * 8) pnl = Math.sign(pnl) * risk * 8;
  if (!Number.isFinite(pnl)) pnl = 0;
  const economic = pnl;
  const ratio0 = positionNetRatio(signed, p.avgEntry, exit);
  const botBook = String(p.playbook || "").startsWith("bot:");
  const protect = !botBook && p.validExec === true && hourProtectSkip(e, economic, true);
  if (protect) {
    exit = p.avgEntry;
    pnl = 0;
  }
  const ratio = protect ? 0 : ratio0;
  if (!botBook) {
    if (p.validExec === true && p.indication) noteLiveInd(e, p.indication, ratio, p.tactic);
    noteHourFlow(e, p.indication, ratio);
    noteCalcClose(e, p.calc, ratio, p.validExec === true);
    noteIndRange(e, p.indication, p.controllingRange, ratio, p.validExec === true);
  }
  p.realized += pnl;
  if (!botBook) {
    bookRealized(e, pnl, reason);
    if (ratio > 0) {
      e.ledger.ratioProfit = (e.ledger.ratioProfit ?? 0) + ratio;
      e.ledger.ratioWins = (e.ledger.ratioWins ?? 0) + 1;
    } else if (ratio < 0) e.ledger.ratioLoss = (e.ledger.ratioLoss ?? 0) + -ratio;
  }
  if (!botBook && reason === "sl") {
    e.ledger.slExits += 1;
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick + (completeOpenTape(e) || performingLive(e) ? 2 : 20);
  } else if (!botBook && reason === "time") {
    e.ledger.timeExits = (e.ledger.timeExits ?? 0) + 1;
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick + (completeOpenTape(e) || performingLive(e) ? 1 : 6);
  } else if (!botBook) {
    e.ledger.tpExits += 1;
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick + (completeOpenTape(e) || performingLive(e) ? 1 : 8);
  }
  if (!botBook && protect) {
    // Flat scratch is not a win or a loss. Do not grow the loss streak.
  } else if (!botBook && pnl > 0) {
    e.ledger.winStreak += 1;
    e.ledger.lossStreak = 0;
    if (e.ledger.winStreak > e.ledger.maxWinStreak) e.ledger.maxWinStreak = e.ledger.winStreak;
  } else if (!botBook && pnl < 0) {
    e.ledger.lossStreak += 1;
    e.ledger.winStreak = 0;
    if (e.ledger.lossStreak > e.ledger.maxLossStreak) e.ledger.maxLossStreak = e.ledger.lossStreak;
  }
  const r = pnl / Math.max(p.slDist * p.qty, 1e-9);
  const originBook = p.playbook || "normal";
  const originKind = p.kind;
  const tape = e.symbolStats[p.symbol] ??= {
    id: p.symbol,
    trades: 0,
    wins: 0,
    profit: 0,
    loss: 0,
    sl: 0,
    tp: 0
  };
  if (!botBook) {
    tape.trades += 1;
    if (pnl > 0) {
      tape.wins += 1;
      tape.profit += pnl;
    } else tape.loss += Math.abs(pnl);
    if (ratio > 0) tape.ratioProfit = (tape.ratioProfit ?? 0) + ratio;
    else if (ratio < 0) tape.ratioLoss = (tape.ratioLoss ?? 0) + -ratio;
    if (reason === "sl") tape.sl += 1;
    else if (reason === "tp") tape.tp += 1;
    noteHourLive(e, pnl, p.validExec === true && !protect);
  }
  const closedRow = {
    id: p.id,
    connId: p.connId,
    symbol: p.symbol,
    side: p.side,
    pnl,
    ratio,
    qty: p.qty,
    entry: p.avgEntry,
    exit,
    reason,
    tick: e.tick,
    r,
    holdTicks: Math.max(0, e.tick - p.openedTick),
    at: e.liveTape ? Date.now() : undefined,
    tactic: p.tactic ?? e.lastTactic,
    rangeType: p.controllingRange ?? e.lastRange,
    kind: originKind,
    indication: p.indication,
    playbook: originBook,
    level: p.blockLevel ?? Math.max(1, p.legs.length),
    blockQty: p.blockQty,
    validExec: p.validExec === true,
    protect: protect || undefined,
    tpAtr: p.tpAtr,
    slOfTp: p.slOfTp,
    trailPct: p.trailPct,
    calc: p.calc,
  };
  e.closed.unshift(closedRow);
  noteTickClose(e, closedRow);
  const gatedClose = p.validExec === true && !protect;
  if (!botBook && originBook !== "block" && !opts?.skipComboTape) {
    const sh = blockOverlayShare(p.qty, p.blockQty, originBook);
    noteShortComboClose(e, { connId: p.connId, id: p.id, tpAtr: p.tpAtr, slOfTp: p.slOfTp, pnl: ratio * (1 - sh), validExec: gatedClose, indication: p.indication, tactic: p.tactic ?? e.lastTactic });
  }
  if (!botBook && countsOnBlockTape(e, gatedClose)) {
    recordBlockClose(e, p, ratio);
    noteBlockPosClose(e, p.symbol, p.side, ratio, e.blockCfg, {
      indication: p.indication,
      kind: p.kind,
      tactic: p.tactic ?? e.lastTactic,
      rangeType: p.controllingRange ?? e.lastRange,
      playbook: p.playbook,
      tpRatio: e.tpRatio,
      slAtr: p.slDist / Math.max(e.quotes[p.symbol]?.atr || 1e-9, 1e-9),
      tpAtr: p.tpAtr,
      slOfTp: p.slOfTp,
    });
  }
  if (e.closed.length > (e.completeSim && paperMode(e) ? 2500 : 600)) {
    const cap = e.completeSim && paperMode(e) ? 2500 : 600;
    const keptBots = e.closed.filter((c) => isBotPlay(c.playbook));
    const rest = e.closed.filter((c) => !isBotPlay(c.playbook)).slice(0, cap);
    e.closed = [...rest, ...keptBots];
  }
  e.fills.unshift({
    id: nextId(e, "f"),
    orderId: p.id,
    connId: p.connId,
    symbol: p.symbol,
    side: p.side,
    qty: p.qty,
    px: exit,
    pnl,
    kind: reason,
    tick: e.tick,
    remaining: 0,
    planned: p.plannedQty,
  });
  if (e.fills.length > VST_FILL_KEEP) e.fills.length = VST_FILL_KEEP;
  cancelLane(e, p);
}
function handleDca(e: VstEngine, p: LivePosition, cfg: TacticConfig) {
  if (p.legs.length < 1 || p.legs.length >= cfg.dcaCount) return;
  const q = e.quotes[p.symbol];
  if (!q) return;
  const signed = p.side === "long" ? 1 : -1;
  const ddPct = Math.max(0, (-signed * (q.px - p.avgEntry)) / Math.max(p.avgEntry, 1e-9) * 100);
  if (ddPct < cfg.dcaDrawdown * p.legs.length) return;
  const tag = `DCA L${p.legs.length + 1}`;
  const pending = [...e.queue, ...e.orders].some(
    (o) =>
      ownedByDesk(o, p.connId) &&
      o.symbol === p.symbol &&
      o.side === p.side &&
      o.note.includes(tag) &&
      !isTerminal(o.status),
  );
  if (pending) return;
  if (e.queue.filter((o) => o.connId === p.connId).length >= maxQueue(e)) return;
  const offset = p.avgEntry * (cfg.dcaDrawdown / 100);
  const px = p.side === "long" ? Math.max(q.px - offset, q.px * 0.5) : q.px + offset;
  if (!(px > 0)) return;
  const qty = Math.max(positionNotional(paperSizeEquity(e), e.costStep || 10) / px, 1e-8);
  const sl0 = slDist(q.atr, p.rangeSpacing || q.atr, cfg.slAtr ?? SL_ATR_MULT, cfgUsesShortRange(cfg));
  const lv = protectLevels(px, p.side, sl0, tpDistFromSl(sl0, cfg.tpRatio, cfgUsesShortRange(cfg)), cfg.tpRatio, cfgUsesShortRange(cfg));
  e.queue.push({
    id: nextId(e, "d"),
    connId: p.connId,
    symbol: p.symbol,
    side: p.side,
    type: e.orderType === "market" ? "market" : "limit",
    qty,
    filled: 0,
    price: px,
    remaining: qty,
    status: "queued",
    rangeType: p.controllingRange,
    level: p.legs.length + 1,
    sl: lv.sl,
    tp: lv.tp,
    slDist: lv.slDist,
    tpDist: lv.tpDist,
    batchId: "",
    note: tag,
  });
  countPlaced(e);
}

function axisProtect(entry: number, side: Side, q: VstQuote, spacing: number, cfg: TacticConfig) {
  const step = Math.max(spacing, q.atr * 0.7, entry * 0.002);
  const axis = q.axis > 0 ? q.axis : q.px;
  let tp =
    side === "long"
      ? Math.max(axis + step * 0.25, entry + step * 0.85)
      : Math.min(axis - step * 0.25, entry - step * 0.85);
  let sl = side === "long" ? entry - step : entry + step;
  const sl0 = Math.abs(entry - sl);
  let tp0 = Math.abs(tp - entry);
  if (tp0 < sl0 * 0.9) {
    tp = side === "long" ? entry + sl0 : entry - sl0;
    tp0 = sl0;
  }
  const ratio = snapTpRatio(Math.min(2.2, Math.max(1, tp0 / Math.max(sl0, 1e-12))));
  return protectLevels(entry, side, sl0, tp0, ratio);
}

function handleAxis(e: VstEngine, p: LivePosition, cfg: TacticConfig) {
  const q = e.quotes[p.symbol];
  if (!q) return;
  const spacing = Math.max(p.rangeSpacing, q.atr * 0.5, p.avgEntry * 0.001);
  const axis = q.axis > 0 ? q.axis : q.px;
  const risk = Math.max(p.slDist, spacing, q.atr * 0.45);
  const profit = p.side === "long" ? q.px - p.avgEntry : p.avgEntry - q.px;
  if (p.side === "long") {
    const wantTp = Math.max(axis + spacing * 0.2, p.avgEntry + risk * 0.95);
    if (wantTp < p.tp && wantTp > p.avgEntry) p.tp = wantTp;
    if (profit >= risk * 0.85) p.sl = Math.max(p.sl, p.avgEntry);
  } else {
    const wantTp = Math.min(axis - spacing * 0.2, p.avgEntry - risk * 0.95);
    if (wantTp > p.tp && wantTp < p.avgEntry) p.tp = wantTp;
    if (profit >= risk * 0.85) p.sl = Math.min(p.sl, p.avgEntry);
  }
  p.slDist = Math.abs(p.sl - p.avgEntry);
  p.tpDist = Math.abs(p.tp - p.avgEntry);
}

function applySessionCoord(e: VstEngine) {
  try {
    const conn = e.activeConnId;
    if (!isDeskConn(conn)) return;
    const last = e.closed.filter((c) => c.connId === conn).slice(0, 8);
    const ongoing = e.positions.filter((p) => p.connId === conn);
    if (!last.length || !ongoing.length) return;
    const lastScore = last.reduce((s, c) => s + (c.side === "long" ? 1 : -1), 0);
    const onScore = ongoing.reduce((s, p) => s + (p.side === "long" ? 1 : -1), 0);
    let activity = 0;
    let n = 0;
    for (const p of ongoing) {
      const q = e.quotes[p.symbol];
      if (!q) continue;
      const px = Math.max(finiteOr(q.px, 1), 1e-9);
      const atr = Math.max(finiteOr(q.atr, px * 0.004), 1e-9);
      activity += Math.abs(finiteOr(q.chg, 0)) / Math.max(atr / px, 1e-6) + finiteOr(q.vol, 1) * 0.4;
      n += 1;
    }
    activity = n ? activity / n : 0;
    if (!Number.isFinite(activity)) activity = 0;
    const hf = activity >= 1.1;
    if (!lastScore || !onScore) return;
    if (Math.sign(lastScore) === Math.sign(onScore) && !hf) return;
    if (Math.sign(lastScore) === Math.sign(onScore)) return;
    const want: Side = onScore > 0 ? "long" : "short";
    const drop = e.queue.filter((o) => o.connId === conn && o.side !== want).length;
    const keep = e.queue.length - drop;
    if (keep < 2 && ongoing.length < 2) return;
    const before = e.queue.length;
    cancelQueued(e, (o) => o.connId === conn && o.side !== want);
    if (e.queue.length < before) {
      e.lastMsg = hf
        ? `HF coord reduce · ${conn} opposite ladders cancelled`
        : `Coord reduce · ${conn} opposite ladders cancelled`;
    }
  } catch {
    noteHeal(e, "coord recovered");
  }
}

function managePositions(e: VstEngine, tactic: TacticKind, cfg: TacticConfig, opts?: { minHold?: number; liveTape?: boolean }) {
  const keep = [];
  for (const p of e.positions) {
    if (!ownedByDesk(p, e.activeConnId)) {
      keep.push(p);
      continue;
    }
    const q = e.quotes[p.symbol];
    if (!q) {
      keep.push(p);
      continue;
    }
    p.mark = q.px;
    const signed = p.side === "long" ? 1 : -1;
    p.unrealized = q.px > 0 && p.avgEntry > 0 && p.qty > 0 ? closePnl(signed, p.avgEntry, q.px, p.qty) : 0;
    const fillRatio = p.plannedQty > 0 ? p.qty / p.plannedQty : 1;
    const ownTactic: TacticKind =
      p.tactic === "axis" || p.tactic === "trailing" || p.tactic === "hybrid" || p.tactic === "dca" ? p.tactic : tactic;
    const partial = ownTactic === "axis" ? false : p.status === "partial" || fillRatio < 0.55;
    const botBook = String(p.playbook || "").startsWith("bot:");
    const shortPos = botBook || cfgUsesShortRange(cfg) || p.playbook === "short";
    if (ownTactic === "dca" && (cfg.dcaCount ?? 0) > 1) handleDca(e, p, cfg);
    if (!shortPos && (ownTactic === "axis" || p.playbook === "axis" || ownTactic === "hybrid")) handleAxis(e, p, cfg);
    const holdR = shortPos && p.tpDist > 1e-12 && p.slDist > 1e-12 ? p.tpDist / p.slDist : e.tpRatio;
    if (!botBook) clampRatio(p, holdR, shortPos);
    if (e.tick === p.openedTick || e.tick - p.openedTick < Math.max(1, opts?.minHold ?? 1)) {
      keep.push(p);
      continue;
    }
    const hitSl = p.side === "long" ? q.lo <= p.sl : q.hi >= p.sl;
    const hitTp = p.side === "long" ? q.hi >= p.tp : q.lo <= p.tp;
    if (opts?.liveTape || e.liveTape) {
      const fav = p.side === "long" ? Math.max(q.hi, q.px) : Math.min(q.lo, q.px);
      p.peakPx = p.peakPx && p.peakPx > 0
        ? (p.side === "long" ? Math.max(p.peakPx, fav) : Math.min(p.peakPx, fav))
        : fav;
      if (ownTactic === "trailing" || ownTactic === "hybrid" || ownTactic !== "axis") {
        const next = trailStopFromPeak({
          side: p.side,
          entry: p.avgEntry,
          peak: p.peakPx,
          tp: p.tp,
          sl: p.sl,
          trailPct: p.trailPct ?? cfg.trailingPct,
          shortRange: cfgUsesShortRange(cfg) || p.playbook === "short",
        });
        if (p.side === "long" ? next > p.sl : next < p.sl) {
          p.sl = next;
          p.slDist = Math.abs(p.sl - p.avgEntry);
          clampRatio(p, holdR, shortPos);
        }
      }
      keep.push(p);
      continue;
    }
    const holdTicks = e.tick - p.openedTick;
    const openTape = completeOpenTape(e);
    const baseHold = indicationProtect(p.indication ?? "trend").holdMul;
    const holdMul =
      openTape && p.indication && BUSY_WEAK_INDS.has(p.indication) && hourTapeBusy(e)
        ? Math.min(baseHold, 0.5)
        : baseHold;
    const maxHold = botBook ? 180 : Math.max(4, Math.round((cfg.maxHoldTicks ?? DEFAULT_MAX_HOLD_TICKS) * holdMul));
    const timed = holdTicks >= maxHold && (!partial || openTape);
    if (timed && !hitSl && !hitTp) {
      if (openTape || p.unrealized <= 0) {
        closePosition(e, p, q.px, "time");
        continue;
      }
      if (p.side === "long") p.sl = Math.max(p.sl, p.avgEntry);
      else p.sl = Math.min(p.sl, p.avgEntry);
      p.slDist = Math.abs(p.sl - p.avgEntry);
    }
    if (hitSl || (hitTp && !partial)) {
      const reason: "sl" | "tp" = hitSl ? "sl" : "tp";
      closePosition(e, p, reason === "sl" ? p.sl : p.tp, reason);
      continue;
    }
    if (!botBook && (ownTactic === "trailing" || ownTactic === "hybrid" || Boolean(opts?.liveTape && ownTactic !== "axis"))) {
      const fav = p.side === "long" ? Math.max(q.hi, q.px) : Math.min(q.lo, q.px);
      p.peakPx = p.peakPx && p.peakPx > 0
        ? (p.side === "long" ? Math.max(p.peakPx, fav) : Math.min(p.peakPx, fav))
        : fav;
      const next = trailStopFromPeak({
        side: p.side,
        entry: p.avgEntry,
        peak: p.peakPx,
        tp: p.tp,
        sl: p.sl,
        trailPct: p.trailPct ?? cfg.trailingPct,
        shortRange: cfgUsesShortRange(cfg) || p.playbook === "short",
      });
      if (p.side === "long" ? next > p.sl : next < p.sl) {
        p.sl = next;
        p.slDist = Math.abs(p.sl - p.avgEntry);
        clampRatio(p, holdR, shortPos);
      }
    }
    keep.push(p);
  }
  e.positions = keep;
}
const orderBorn = new WeakMap<VstEngine, Map<string, number>>();
function recycleOpenLadders(e: VstEngine) {
  if (!(completeOpenTape(e) || performingLive(e))) return;
  let born = orderBorn.get(e);
  if (!born) {
    born = new Map();
    orderBorn.set(e, born);
  }
  const see = (o: LiveOrder) => {
    if (!born!.has(o.id)) born!.set(o.id, e.tick);
  };
  const liveIds = new Set<string>();
  for (const o of e.orders) {
    see(o);
    liveIds.add(o.id);
  }
  for (const o of e.queue) {
    see(o);
    liveIds.add(o.id);
  }
  if (born.size > liveIds.size + 4000) {
    for (const id of born.keys()) if (!liveIds.has(id)) born.delete(id);
  }
  const far = (o: LiveOrder) => {
    if (o.status !== "open" && o.status !== "partial" && o.status !== "queued") return false;
    const q = e.quotes[o.symbol];
    if (!q || !(q.px > 0) || !(o.price > 0)) return false;
    const atr = Math.max(q.atr, q.px * 0.0008, 1e-9);
    const d = Math.abs(o.price - q.px) / atr;
    if (d > 1.75) return true;
    const age = e.tick - (born!.get(o.id) ?? e.tick);
    return age >= 6 && d > 0.85;
  };
  for (const o of e.orders) {
    if (!ownedByDesk(o)) continue;
    if (String(o.playbook || "").startsWith("bot:")) continue;
    if (far(o)) markTerminal(e, o, "cancelled");
  }
  e.orders = e.orders.filter((o) => !ownedByDesk(o) || o.status === "open" || o.status === "partial");
  const keepQ: LiveOrder[] = [];
  for (const o of e.queue) {
    if (ownedByDesk(o) && !String(o.playbook || "").startsWith("bot:") && far(o)) {
      markTerminal(e, o, "cancelled");
      continue;
    }
    keepQ.push(o);
  }
  e.queue = keepQ;
  const desk = e.orders.filter((o) => ownedByDesk(o) && (o.status === "open" || o.status === "partial"));
  const cap = 2200;
  if (desk.length > cap) {
    const ranked = desk
      .map((o) => {
        const q = e.quotes[o.symbol];
        const atr = Math.max(q?.atr || 0, (q?.px || 1) * 0.0008, 1e-9);
        const dist = q && o.price > 0 ? Math.abs(o.price - q.px) / atr : 9;
        return { o, dist };
      })
      .sort((a, b) => b.dist - a.dist);
    const kill = new Set(ranked.slice(0, desk.length - cap).map((r) => r.o));
    for (const o of kill) markTerminal(e, o, "cancelled");
    e.orders = e.orders.filter((o) => !kill.has(o));
  }
}
function compactOrders(e: VstEngine) {
  recycleOpenLadders(e);
  const foreign = e.orders.filter((o) => !isDeskConn(o.connId));
  const bots = e.orders.filter((o) => isBotPlay(o.playbook) && (o.status === "open" || o.status === "partial" || o.status === "queued"));
  e.orders = e.orders.filter((o) => ownedByDesk(o) && !isBotPlay(o.playbook) && (o.status === "open" || o.status === "partial"));
  if (e.orders.length > maxWorking(e)) {
    const extra = e.orders.splice(maxWorking(e));
    for (const o of extra) markTerminal(e, o, "cancelled");
  }
  const deskQueue = e.queue.filter((o) => ownedByDesk(o) && !isBotPlay(o.playbook));
  const botQueue = e.queue.filter((o) => isBotPlay(o.playbook));
  const foreignQ = e.queue.filter((o) => !isDeskConn(o.connId));
  if (deskQueue.length > maxQueue(e)) {
    const drop = deskQueue.splice(maxQueue(e));
    for (const o of drop) markTerminal(e, o, "cancelled");
  }
  e.queue = [...deskQueue, ...botQueue, ...foreignQ];
  e.orders = [...e.orders, ...bots, ...foreign];
  if (completeOpenTape(e)) {
    const unfilled = e.orders.filter((o) => (o.status === "open" || o.status === "partial") && o.filled <= 1e-12);
    if (unfilled.length > 1600) {
      const ranked = unfilled
        .map((o) => {
          const q = e.quotes[o.symbol];
          const atr = Math.max(q?.atr || 0, (q?.px || 1) * 0.0008, 1e-9);
          const dist = q && o.price > 0 ? Math.abs(o.price - q.px) / atr : 9;
          return { o, dist };
        })
        .sort((a, b) => b.dist - a.dist);
      const kill = new Set(ranked.slice(0, unfilled.length - 1600).map((r) => r.o));
      for (const o of kill) markTerminal(e, o, "cancelled");
      e.orders = e.orders.filter((o) => (o.status === "open" || o.status === "partial") && !kill.has(o));
    }
    if (e.queue.length > 2400) {
      const rankedQ = e.queue
        .map((o) => {
          const q = e.quotes[o.symbol];
          const atr = Math.max(q?.atr || 0, (q?.px || 1) * 0.0008, 1e-9);
          const dist = q && o.price > 0 ? Math.abs(o.price - q.px) / atr : 9;
          return { o, dist };
        })
        .sort((a, b) => b.dist - a.dist);
      const killQ = new Set(rankedQ.slice(0, e.queue.length - 2400).map((r) => r.o));
      const dropQ = e.queue.filter((o) => killQ.has(o));
      e.queue = e.queue.filter((o) => !killQ.has(o));
      for (const o of dropQ) markTerminal(e, o, "cancelled");
    }
  }
  if (e.batches.length > VST_MAX_BATCHES) e.batches.length = VST_MAX_BATCHES;
  if (e.fills.length > VST_FILL_KEEP) e.fills.length = VST_FILL_KEEP;
  if (e.closed.length > (e.completeSim && paperMode(e) ? 2500 : 600)) {
    const cap = e.completeSim && paperMode(e) ? 2500 : 600;
    const keptBots = e.closed.filter((c) => isBotPlay(c.playbook));
    const rest = e.closed.filter((c) => !isBotPlay(c.playbook)).slice(0, cap);
    e.closed = [...rest, ...keptBots];
  }
  for (const id of Object.keys(e.cooldown)) {
    if ((e.cooldown[id] ?? 0) <= e.tick) delete e.cooldown[id];
  }
}

export function syncLivePartials(
  e: VstEngine,
  book: { positions?: { symbol: string; side: Side; qty: number; entry?: number; mark?: number }[] } | null | undefined,
) {
  const live = book?.positions ?? [];
  if (!live.length) return 0;
  let n = 0;
  for (const p of live) {
    if (!(p.qty > 0) || !p.symbol) continue;
    const pos = e.positions.find((x) => x.connId === e.activeConnId && x.symbol === p.symbol && x.side === p.side);
    if (!pos) continue;
    const qty = Number(p.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const px = Number(p.mark) > 0 ? Number(p.mark) : Number(p.entry) > 0 ? Number(p.entry) : pos.mark || pos.avgEntry;
    const dQty = qty - pos.qty;
    if (Math.abs(dQty) > 1e-12) {
      if (dQty > 0) {
        if (qty > pos.plannedQty) pos.plannedQty = qty;
        pos.qty = qty;
        pos.legs.push({ orderId: "live", qty: dQty, px });
        e.fills.unshift({
          id: nextId(e, "f"),
          orderId: pos.id,
          connId: pos.connId,
          symbol: pos.symbol,
          side: pos.side,
          qty: dQty,
          px,
          pnl: 0,
          kind: pos.legs.length <= 1 ? "entry" : "partial",
          tick: e.tick,
          remaining: Math.max(0, pos.plannedQty - pos.qty),
          planned: pos.plannedQty,
        });
      } else {
        const take = Math.abs(dQty);
        const signed = pos.side === "long" ? 1 : -1;
        const rawPnl = Number.isFinite(px) && px > 0 && pos.avgEntry > 0 ? closePnl(signed, pos.avgEntry, px, take) : 0;
        const pnl = bookRealized(e, rawPnl, "partial");
        pos.qty = qty;
        pos.realized += pnl;
        e.fills.unshift({
          id: nextId(e, "f"),
          orderId: pos.id,
          connId: pos.connId,
          symbol: pos.symbol,
          side: pos.side,
          qty: take,
          px,
          pnl: Number.isFinite(pnl) ? pnl : 0,
          kind: "partial",
          tick: e.tick,
          remaining: pos.qty,
          planned: pos.plannedQty,
        });
      }
      if (e.fills.length > VST_FILL_KEEP) e.fills.length = VST_FILL_KEEP;
      n += 1;
    }
    if (Number(p.entry) > 0) pos.avgEntry = Number(p.entry);
    if (Number(p.mark) > 0) pos.mark = Number(p.mark);
    pos.status = pos.plannedQty > 0 && pos.qty + 1e-12 < pos.plannedQty * 0.98 ? "partial" : "open";
  }
  return n;
}

function liveRatioPf(e: VstEngine): number {
  return ratioProfitFactor(e.ledger.ratioProfit || 0, e.ledger.ratioLoss || 0, e.ledger.ratioWins || 0);
}
function recomputeStats(e: VstEngine) {
  const unreal = e.positions.reduce((s, p) => s + (isBotPlay(p.playbook) ? 0 : p.unrealized), 0);
  const net = e.ledger.profit - e.ledger.loss + unreal;
  const base = Number(e.startEquity) > 0 ? Number(e.startEquity) : 1e4;
  const equity = base + net;
  if (equity > e.ledger.peak) e.ledger.peak = equity;
  const dd = e.ledger.peak > 0 ? Math.max(0, (e.ledger.peak - equity) / e.ledger.peak) : 0;
  if (dd > e.ledger.maxMdd) e.ledger.maxMdd = dd;
  if (dd > 1e-6) {
    e.ledger.ddTicks = (e.ledger.ddTicks || 0) + 1;
    if (e.ledger.ddTicks > (e.ledger.maxDdt || 0)) e.ledger.maxDdt = e.ledger.ddTicks;
  } else {
    e.ledger.ddTicks = 0;
  }
  const pf = liveRatioPf(e);
  const working = e.orders.length;
  e.ledger.maxPositions = Math.max(e.ledger.maxPositions, e.positions.length);
  e.ledger.maxOrders = Math.max(e.ledger.maxOrders, working + e.queue.length);
  let partials = 0;
  for (const p of e.positions) if (p.status === "partial") partials += 1;
  e.stats = {
    pf,
    wr: e.ledger.trades ? e.ledger.wins / e.ledger.trades : 0,
    net,
    mdd: e.ledger.maxMdd,
    trades: e.ledger.trades,
    wins: e.ledger.wins,
    openOrders: working,
    queued: e.queue.length,
    positions: e.positions.length,
    partials,
    equity,
    ddt: e.ledger.maxDdt,
  };
}
function finiteOr(n: number | undefined, fallback: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function noteHeal(e: VstEngine, reason: string) {
  e.healCount = (e.healCount ?? 0) + 1;
  e.lastHeal = reason;
  e.lastMsg = `Heal · ${reason}`;
}

function safeStage(e: VstEngine, name: string, fn: () => void) {
  try {
    fn();
  } catch {
    noteHeal(e, `${name} recovered`);
  }
}

function clampRatio(p: LivePosition, ratio = TP_SL_RATIO, raw = false) {
  const r = raw ? Math.max(0.25, Number(ratio) || 1) : snapTpRatio(ratio);
  const slD = Math.abs(p.sl - p.avgEntry);
  const tpD = Math.abs(p.tp - p.avgEntry);
  if (!(tpD > 0) || !Number.isFinite(slD) || !Number.isFinite(tpD)) return;
  if (slD > tpD / r + 1e-9) {
    const next = tpD / r;
    p.slDist = next;
    p.tpDist = tpD;
    p.sl = p.side === "long" ? p.avgEntry - next : p.avgEntry + next;
  }
}

export function sanitizeBook(e: VstEngine): number {
  let fixes = 0;
  if (!e.queue) e.queue = [];
  if (!e.orders) e.orders = [];
  if (!e.positions) e.positions = [];
  if (!e.fills) e.fills = [];
  if (!e.closed) e.closed = [];
  if (!e.batches) e.batches = [];
  if (!e.cooldown) e.cooldown = {};
  if (!e.tokens) e.tokens = {};
  if (!e.quotes) e.quotes = {};
  if (!e.symbolStats) e.symbolStats = {};
  if (!Number.isFinite(e.tick)) {
    e.tick = 0;
    fixes += 1;
  }
  if (!Number.isFinite(e.seq) || e.seq < 1) {
    e.seq = 1;
    fixes += 1;
  }
  if (!isDeskConn(e.activeConnId)) {
    e.activeConnId = VST_DEFAULT_CONN;
    fixes += 1;
  }
  for (const id of DESK_CONN_IDS) {
    const t = e.tokens[id];
    if (!Number.isFinite(t) || t < 0) {
      e.tokens[id] = VST_RATE_BURST;
      fixes += 1;
    } else if (t > VST_RATE_BURST) {
      e.tokens[id] = VST_RATE_BURST;
      fixes += 1;
    }
  }
  for (const q of Object.values(e.quotes)) {
    if (!Number.isFinite(q.px) || q.px <= 0) {
      q.px = Math.max(finiteOr(q.axis, 1), 1);
      fixes += 1;
    }
    if (!Number.isFinite(q.hi) || q.hi < q.px) {
      q.hi = q.px * 1.001;
      fixes += 1;
    }
    if (!Number.isFinite(q.lo) || q.lo <= 0 || q.lo > q.px) {
      q.lo = q.px * 0.999;
      fixes += 1;
    }
    if (!Number.isFinite(q.atr) || q.atr <= 0) {
      q.atr = q.px * 0.004;
      fixes += 1;
    }
    if (!Number.isFinite(q.axis) || q.axis <= 0) q.axis = q.px;
    if (!Number.isFinite(q.vol) || q.vol < 0 || q.vol > 0.2) q.vol = MIN_QUOTE_VOL;
    if (!Number.isFinite(q.chg)) q.chg = 0;
  }
  const livePos = [];
  for (const p of e.positions) {
    if (!p || !Number.isFinite(p.qty) || p.qty <= 0 || !Number.isFinite(p.avgEntry) || p.avgEntry <= 0) {
      fixes += 1;
      continue;
    }
    p.mark = finiteOr(p.mark, p.avgEntry);
    p.unrealized = finiteOr(p.unrealized, 0);
    p.realized = finiteOr(p.realized, 0);
    p.sl = finiteOr(p.sl, p.side === "long" ? p.avgEntry * 0.99 : p.avgEntry * 1.01);
    p.tp = finiteOr(p.tp, p.side === "long" ? p.avgEntry * 1.025 : p.avgEntry * 0.975);
    p.slDist = finiteOr(p.slDist, Math.abs(p.avgEntry - p.sl));
    p.tpDist = finiteOr(p.tpDist, Math.abs(p.tp - p.avgEntry));
    if (!Array.isArray(p.legs)) p.legs = [];
    if (!String(p.playbook || "").startsWith("bot:")) clampRatio(p, e.tpRatio || TP_SL_RATIO, Boolean(e.shortRange));
    livePos.push(p);
  }
  if (livePos.length !== e.positions.length) fixes += 1;
  e.positions = livePos;
  const liveOrd = [];
  for (const o of e.orders) {
    if (!o || !Number.isFinite(o.qty) || o.qty <= 0 || !Number.isFinite(o.price) || o.price <= 0) {
      fixes += 1;
      continue;
    }
    o.remaining = Math.max(0, finiteOr(o.remaining, o.qty));
    o.filled = finiteOr(o.filled, 0);
    liveOrd.push(o);
  }
  if (liveOrd.length !== e.orders.length) fixes += 1;
  e.orders = liveOrd;
  e.queue = e.queue.filter((o) => {
    if (!o || !Number.isFinite(o.qty) || o.qty <= 0 || !Number.isFinite(o.price) || o.price <= 0) {
      fixes += 1;
      return false;
    }
    return true;
  });
  if (e.queue.length > maxQueue(e)) {
    const bots = e.queue.filter((o) => isBotPlay(o.playbook));
    const rest = e.queue.filter((o) => !isBotPlay(o.playbook));
    rest.length = Math.min(rest.length, maxQueue(e));
    e.queue = [...rest, ...bots];
    fixes += 1;
  }
  if (e.orders.length > maxWorking(e)) {
    const bots = e.orders.filter((o) => isBotPlay(o.playbook));
    const rest = e.orders.filter((o) => !isBotPlay(o.playbook));
    rest.length = Math.min(rest.length, maxWorking(e));
    e.orders = [...rest, ...bots];
    fixes += 1;
  }
  if (e.positions.length > maxPositions(e)) {
    const bots = e.positions.filter((p) => isBotPlay(p.playbook));
    const rest = e.positions.filter((p) => !isBotPlay(p.playbook));
    rest.length = Math.min(rest.length, maxPositions(e));
    e.positions = [...rest, ...bots];
    fixes += 1;
  }
  for (const id of Object.keys(e.cooldown)) {
    const t = e.cooldown[id] ?? 0;
    if (!Number.isFinite(t) || t > e.tick + 400) {
      delete e.cooldown[id];
      fixes += 1;
    }
  }
  if (e.ledger) {
    const led = e.ledger as unknown as Record<string, number>;
    for (const k of Object.keys(led)) {
      if (typeof led[k] === "number" && !Number.isFinite(led[k])) {
        led[k] = 0;
        fixes += 1;
      }
    }
  }
  return fixes;
}

export function healEngine(
  e: VstEngine,
  cfg: TacticConfig = DEFAULT_CFG,
  tactic: TacticKind = "hybrid",
  rangeType?: RangeType,
): { healed: boolean; reason: string; fixes: number } {
  const fixes = sanitizeBook(e);
  let reason = fixes ? `sanitized ${fixes}` : "";
  const deskQ = e.queue.filter((o) => ownedByDesk(o, e.activeConnId)).length;
  const deskO = e.orders.filter((o) => ownedByDesk(o, e.activeConnId) && (o.status === "open" || o.status === "partial")).length;
  const deskP = e.positions.filter((p) => ownedByDesk(p, e.activeConnId)).length;
  if (e.running && e.phase === "running" && deskQ + deskO + deskP === 0 && !e.botMode) {
    armUniverse(e, cfg, tactic, rangeType);
    reason = reason ? `${reason} · empty book rearmed` : "empty book rearmed";
  }
  const starved = (e.tokens[e.activeConnId] ?? 0) <= 0 && deskQ > 0;
  if (starved) {
    e.tokens[e.activeConnId] = Math.max(4, VST_RATE_BURST / 2);
    reason = reason ? `${reason} · rate refill` : "rate refill";
  }
  pruneBlockRelWindows(e);
  const cfgBlock = e.blockCfg ?? DEFAULT_BLOCK_CONFIG;
  const evalEvery = Math.max(TICKS_PER_HOUR, Math.round((cfgBlock.evalHours || 2) * TICKS_PER_HOUR));
  if (!e.botMode && cfgBlock.autoEval !== false && cfgBlock.enabled && e.tick - (e.lastRelEvalTick || 0) >= evalEvery * 2) {
    evalBlockRelations(e, cfgBlock);
    reason = reason ? `${reason} · rel eval` : "rel eval";
  }
  if (e.running && e.phase !== "running" && e.phase !== "paused" && e.phase !== "stopped") {
    e.phase = "running";
    reason = reason ? `${reason} · phase restored` : "phase restored";
  }
  if (reason) noteHeal(e, reason);
  return { healed: Boolean(reason), reason, fixes };
}

function blockLaneKey(symbol: string, side: Side, mode: "shared" | "additive" = "shared") {
  return `${symbol}:${side}:${mode}`;
}

function blockVolumeModes(block?: BlockConfig): ("shared" | "additive")[] {
  const m = block?.volumeMode;
  if (m === "parallel") return ["additive", "shared"];
  if (m === "additive") return ["additive"];
  return ["shared"];
}

function liveVolumeModes(block?: BlockConfig): ("shared" | "additive")[] {
  return blockVolumeModes(block);
}

function overallVolumeModes(block?: BlockConfig): ("shared" | "additive")[] {
  const m = block?.overallMode;
  if (m === "parallel") return ["shared", "additive"];
  if (m === "additive") return ["additive"];
  return ["shared"];
}

function blockModeOf(o: { note?: string }): "shared" | "additive" {
  const n = o.note || "";
  if (/additive/i.test(n)) return "additive";
  if (/shared/i.test(n)) return "shared";
  return /Overall Block/i.test(n) ? "additive" : "shared";
}

function liveBlockCounts(block: BlockConfig) {
  const cap = Math.max(1, Math.min(6, Math.round(block.maxMultiple || 2)));
  return sanitizeBlockCounts(block.counts).filter((n) => n <= cap);
}

function evalBlockNs(block?: BlockConfig) {
  if (block && block.windows === false) return [];
  const cap = Math.min(6, Math.max(1, Math.round(block?.evalPosCount || 6)));
  return Array.from({ length: cap }, (_, i) => i + 1);
}

function emptyBlockWindow(n: number): BlockPosWindow {
  return {
    n,
    ring: [],
    closed: 0,
    pauseLeft: 0,
    lastAvg: 0,
    lastNet: 0,
    lastPf: 0,
    windows: 0,
    lossWindows: 0,
    adjusted: 0,
    losers: [],
    batchNets: [],
  };
}

function tickBlockWindow(w: BlockPosWindow, symbol: string, side: Side, pnl: number, pauseRatio = 1, keep = false) {
  w.ring.push({ symbol, side, pnl });
  const keepN = Math.max(48, w.n * 8);
  if (w.ring.length > keepN) w.ring = w.ring.slice(-keepN);
  w.closed += 1;
  if (w.pauseLeft > 0) {
    w.pauseLeft -= 1;
    w.adjusted += 1;
  }
  const last = w.ring.slice(-w.n);
  const net = last.reduce((s, x) => s + x.pnl, 0);
  w.lastNet = net;
  w.lastAvg = last.length ? net / last.length : 0;
  if (w.closed % w.n !== 0) {
    const nets = w.batchNets ?? [];
    if (nets.length) w.lastPf = profitFactor(nets.filter((x) => x > 0).reduce((s, x) => s + x, 0), Math.abs(nets.filter((x) => x < 0).reduce((s, x) => s + x, 0)));
    return w;
  }
  w.windows += 1;
  w.losers = [...new Set(last.filter((x) => x.pnl < 0).map((x) => x.symbol))];
  const batches = (w.batchNets ??= []);
  batches.push(net);
  if (batches.length > 24) w.batchNets = batches.slice(-24);
  const gp = (w.batchNets ?? []).filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const gl = Math.abs((w.batchNets ?? []).filter((x) => x < 0).reduce((s, x) => s + x, 0));
  w.lastPf = profitFactor(gp, gl);
  if (w.lastAvg < 0 || (last.length >= w.n && last.every((x) => x.pnl < 0))) {
    w.lossWindows += 1;
    if (!keep) w.pauseLeft = Math.max(0, Math.round(pauseRatio * w.n));
    else w.adjusted += 1;
  }
  return w;
}

export function blockRelationKeys(rel: {
  symbol: string;
  side: Side;
  indication?: IndicationId;
  kind?: string;
  tactic?: TacticKind;
  rangeType?: RangeType;
  playbook?: string;
  indicationCfg?: string;
  tpAtr?: number;
  slOfTp?: number;
  slAtr?: number;
  tpRatio?: number;
}): string[] {
  const keys = [`sym:${rel.symbol}`, `side:${rel.side}`, `leg:${rel.symbol}:${rel.side}`];
  if (rel.indication) keys.push(`ind:${rel.indication}`);
  if (rel.indicationCfg) keys.push(`cfg:${rel.indicationCfg}`);
  if (rel.kind) keys.push(`kind:${rel.kind}`);
  if (rel.playbook) keys.push(`book:${rel.playbook}`);
  if (rel.tactic) keys.push(`tac:${rel.tactic}`);
  if (rel.rangeType) keys.push(`rng:${rel.rangeType}`);
  if (rel.indication && rel.kind) keys.push(`sub:${rel.indication}:${rel.kind}`);
  if (rel.tpAtr != null && rel.slOfTp != null) {
    keys.push(`prot:${shortComboKey(snapShortTpAtr(rel.tpAtr), snapShortSlOfTp(rel.slOfTp))}`);
  }
  else if (rel.slAtr != null && rel.tpRatio != null) keys.push(`prot:${rel.tpRatio}:${rel.slAtr}`);
  if (rel.indication && rel.tactic && rel.rangeType) {
    keys.push(`combo:${rel.indication}:${rel.kind ?? "_"}:${rel.tactic}:${rel.rangeType}:${rel.side}`);
    if (rel.tpAtr != null && rel.slOfTp != null) {
      keys.push(`combo:${rel.indication}:${rel.tactic}:${rel.rangeType}:${shortComboKey(rel.tpAtr, rel.slOfTp)}:${rel.side}`);
    }
  }
  return keys;
}

export function noteBlockPosClose(
  e: VstEngine,
  symbol: string,
  side: Side,
  pnl: number,
  block: BlockConfig = DEFAULT_BLOCK_CONFIG,
  rel?: {
    indication?: IndicationId;
  kind?: string;
    tactic?: TacticKind;
    rangeType?: RangeType;
    playbook?: string;
    indicationCfg?: string;
    tpAtr?: number;
    slOfTp?: number;
    slAtr?: number;
    tpRatio?: number;
  },
) {
  e.blockWindows = e.blockWindows ?? {};
  e.blockWindowsBySymbol = e.blockWindowsBySymbol ?? {};
  e.blockWindowsBySide = e.blockWindowsBySide ?? {};
  e.blockRelWindows = e.blockRelWindows ?? {};
  const ns = evalBlockNs(block);
  const pauseRatio = Math.max(0, block.pauseCountRatio ?? 1);
  const keep = block.keepAdjusted === true;
  for (const n of ns) {
    e.blockWindows[n] = tickBlockWindow(e.blockWindows[n] ?? emptyBlockWindow(n), symbol, side, pnl, pauseRatio, keep);
    const by = (e.blockWindowsBySymbol[symbol] ??= {});
    by[n] = tickBlockWindow(by[n] ?? emptyBlockWindow(n), symbol, side, pnl, pauseRatio, keep);
    const sideMap = (e.blockWindowsBySide[side] ??= {});
    sideMap[n] = tickBlockWindow(sideMap[n] ?? emptyBlockWindow(n), symbol, side, pnl, pauseRatio, keep);
  }
  const keys = blockRelationKeys({ symbol, side, ...rel });
  for (const key of keys) {
    const map = (e.blockRelWindows[key] ??= {});
    for (const n of ns) map[n] = tickBlockWindow(map[n] ?? emptyBlockWindow(n), symbol, side, pnl, pauseRatio, keep);
  }
}

export function blockRelPaused(e: VstEngine, key: string, n = 6) {
  return (e.blockRelWindows?.[key]?.[n]?.pauseLeft || 0) > 0;
}

export function blockComboPaused(
  e: VstEngine,
  rel: {
    symbol: string;
    side: Side;
    indication?: IndicationId;
  kind?: string;
    tactic?: TacticKind;
    rangeType?: RangeType;
    playbook?: string;
    indicationCfg?: string;
  },
  n = 6,
) {
  return blockRelationKeys(rel)
    .filter((k) => k.startsWith("combo:") || k.startsWith("sub:") || k.startsWith("cfg:") || k.startsWith("prot:"))
    .some((k) => blockRelPaused(e, k, n));
}

/** Last-N overall window is in its "next N adjusted" pause. */
export function blockPosPaused(e: VstEngine, n = 6) {
  return (e.blockWindows?.[n]?.pauseLeft || 0) > 0;
}

/** This symbol's last-N average was a loss; next N of that symbol are adjusted. */
export function symbolBlockPaused(e: VstEngine, symbol: string, n?: number) {
  const map = e.blockWindowsBySymbol?.[symbol];
  if (!map) return false;
  if (n != null) return (map[n]?.pauseLeft || 0) > 0;
  return Object.values(map).some((w) => (w.pauseLeft || 0) > 0);
}

/** Fold BingX realized PnL into closed tape + block windows so live evals are real. */
export function ingestLivePnls(
  e: VstEngine,
  rows: {
    t: number;
    v: number;
    symbol: string;
    side?: Side;
    indication?: string;
    playbook?: string;
    kind?: string;
    tactic?: string;
  }[],
  block: BlockConfig = e.blockCfg ?? DEFAULT_BLOCK_CONFIG,
) {
  if (!rows?.length) return 0;
  const have = new Set(
    e.closed.filter((c) => (c.id || "").startsWith("x:")).map((c) => c.id),
  );
  let n = 0;
  const sorted = [...rows].sort((a, b) => Number(a.t) - Number(b.t));
  for (const r of sorted) {
    const symbol = String(r.symbol || "");
    const t = Number(r.t) || 0;
    const pnl = Number(r.v) || 0;
    if (!symbol || !(t > 0) || !Number.isFinite(pnl)) continue;
    const id = `x:${symbol}:${t}:${pnl.toFixed(6)}`;
    if (have.has(id)) continue;
    have.add(id);
    const hint = e.liveLegHint?.[symbol];
    const last = e.closed.find((c) => c.symbol === symbol && (c.side === "long" || c.side === "short"));
    const side: Side = r.side === "short" || r.side === "long" ? r.side : hint?.side === "short" || hint?.side === "long" ? hint.side : last?.side === "short" ? "short" : "long";
    const indication = (r.indication || hint?.indication || classifyIndication(e, symbol)) as IndicationId;
    const tactic = ((r.tactic || hint?.tactic || tacticForIndication(indication)) as TacticKind);
    const playbook = liveExecPlaybook(e, tactic, indication, r.playbook || hint?.playbook);
    const kind = (r.kind as StrategyKind | undefined) ?? (hint?.kind as StrategyKind | undefined) ?? kindFromIndication(indication, playbook, tactic);
    const rangeType = hint?.rangeType ?? pickIndicationRange(e, indication, e.lastRange);
    e.closed.unshift({
      id,
      connId: e.activeConnId,
      symbol,
      side,
      pnl,
      qty: 0,
      entry: 0,
      exit: 0,
      reason: pnl >= 0 ? "tp" : "sl",
      tick: e.tick,
      at: t,
      r: 0,
      tactic,
      rangeType,
      kind,
      indication,
      playbook,
      validExec: true,
      tpAtr: hint?.tpAtr,
      slOfTp: hint?.slOfTp,
    });
    noteShortComboClose(e, { connId: e.activeConnId, id, tpAtr: hint?.tpAtr, slOfTp: hint?.slOfTp, pnl, validExec: true });
    noteBlockPosClose(e, symbol, side, pnl, block, {
      indication,
      kind,
      tactic,
      rangeType,
      playbook,
      tpAtr: hint?.tpAtr,
      slOfTp: hint?.slOfTp,
    });
    n += 1;
  }
  if (e.closed.length > 800) e.closed.length = 800;
  if (n) {
    e.liveTape = true;
    refreshLiveDisable(e, block);
  }
  for (const c of e.closed) {
    if (!String(c.id || "").startsWith("x:")) continue;
    const pb = liveExecPlaybook(e, c.tactic ?? e.lastTactic, c.indication ?? "trend", c.playbook);
    c.playbook = pb;
    if ((pb === "block" || pb === "short") && (c.kind === "trend" || c.kind === "normal" || !c.kind)) {
      c.kind = pb === "short" ? "short" : "block";
    }
  }
  return n;
}

export function symbolTapePf(e: VstEngine, symbol: string): number | null {
  const rows = [];
  for (const c of e.closed) {
    if (c.symbol !== symbol || !deskTapeRow(e, c)) continue;
    rows.push(c);
    if (rows.length >= 40) break;
  }
  const need = e.liveTape ? 2 : 4;
  if (rows.length >= need) return pfFromPnls(rows);
  const t = e.symbolStats?.[symbol];
  if (!t || t.trades < need) return null;
  if ((t.ratioProfit || 0) + (t.ratioLoss || 0) > 0) return profitFactor(t.ratioProfit || 0, t.ratioLoss || 0);
  return profitFactor(t.profit, t.loss);
}

export type PfLane = "overall" | "base" | "axis" | "block" | "short" | "shortBase";

function numPf(n: number | undefined, fallback: number): number {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? x : fallback;
}

/** Overall is the live default. Axis/Block/Base/Short are independent (can be lower). */
export function minPfFor(e: VstEngine, lane: PfLane = "overall"): number {
  const overall = numPf(e.minPf, DEFAULT_THRESHOLDS.minPf);
  if (lane === "overall") return overall;
  if (lane === "base") return numPf(e.basePf, DEFAULT_THRESHOLDS.basePf);
  if (lane === "short") return numPf(e.shortPf, DEFAULT_THRESHOLDS.shortPf);
  if (lane === "shortBase") return numPf(e.shortBasePf, DEFAULT_THRESHOLDS.shortBasePf);
  if (lane === "axis") {
    return e.shortRange
      ? numPf(e.shortAxisPf, DEFAULT_THRESHOLDS.shortAxisPf ?? DEFAULT_SHORT_AXIS_PF)
      : numPf(e.axisPf, DEFAULT_THRESHOLDS.axisPf);
  }
  if (lane === "block") {
    return e.shortRange
      ? numPf(e.shortBlockPf, DEFAULT_THRESHOLDS.shortBlockPf ?? DEFAULT_SHORT_BLOCK_PF)
      : numPf(e.blockPf ?? e.blockCfg?.liveDisableMinPf, DEFAULT_THRESHOLDS.blockPf);
  }
  return numPf(e.blockPf ?? e.blockCfg?.liveDisableMinPf, DEFAULT_THRESHOLDS.blockPf);
}

export function pfLaneOf(rel: { tactic?: string; playbook?: string; kind?: string; note?: string; blockLevel?: number } | null | undefined): PfLane {
  const play = String(rel?.playbook || "");
  const note = String(rel?.note || "");
  const kind = String(rel?.kind || "");
  const tac = String(rel?.tactic || "");
  if (play === "block" || kind === "block" || /Block/i.test(note)) return "block";
  if (play === "axis" || tac === "axis" || kind === "axis") return "axis";
  if (play === "short" || kind === "short" || /short/i.test(note)) return "short";
  if (play === "normal" || kind === "normal") return "base";
  return "overall";
}

/** Lane floor for a playbook or playbook:indication cell. Independent of overall. */
export function playLaneOf(play: string, shortRange?: boolean): PfLane {
  const p = String(play || "").split(":")[0] || "";
  if (p === "block") return "block";
  if (p === "axis") return "axis";
  if (p === "short") return "short";
  if (p === "normal") return shortRange ? "shortBase" : "base";
  return shortRange ? "short" : "overall";
}

export type MinPfLaneRow = {
  id: string;
  n: number;
  wins?: number;
  profit: number;
  loss: number;
  pf: number;
  wr?: number;
};

/**
 * Keep playbooks that beat their own lane floor; otherwise keep winning indication cells
 * inside that playbook. Combined PF is always ≥ the lowest kept floor (no paper mix).
 */
export function selectMinPfCells(
  e: VstEngine,
  byPlaybook: MinPfLaneRow[],
  byPlayInd: MinPfLaneRow[] = [],
): {
  cells: MinPfLaneRow[];
  n: number;
  pf: number;
  net: number;
  avg: number;
  keys: string[];
} {
  const taken = new Set<string>();
  const cells: MinPfLaneRow[] = [];
  for (const p of byPlaybook) {
    if (!p || p.n < 4) continue;
    const play = String(p.id || "").split(":")[0] || "";
    if (p.pf + 1e-9 >= minPfFor(e, playLaneOf(play, e.shortRange))) {
      cells.push(p);
      taken.add(play);
    }
  }
  for (const c of byPlayInd) {
    if (!c || c.n < 4) continue;
    const play = String(c.id || "").split(":")[0] || "";
    if (taken.has(play)) continue;
    if (c.pf + 1e-9 >= minPfFor(e, playLaneOf(play, e.shortRange))) cells.push(c);
  }
  const gp = cells.reduce((s, p) => s + (Number(p.profit) || 0), 0);
  const gl = cells.reduce((s, p) => s + (Number(p.loss) || 0), 0);
  const n = cells.reduce((s, p) => s + p.n, 0);
  const net = gp - gl;
  const rawPf = n >= 4 ? profitFactor(gp, gl) : 0;
  return {
    cells,
    n,
    pf: rawPf > PF_NO_LOSS ? PF_NO_LOSS : rawPf,
    net,
    avg: n ? net / n : 0,
    keys: cells.map((p) => `${p.id}:${Number(p.pf).toFixed(2)}`),
  };
}

export function entryMinPfFor(e: VstEngine, rel?: Parameters<typeof pfLaneOf>[0]): number {
  return minPfFor(e, pfLaneOf(rel));
}

/** Lowest floor among enabled strategies — Short 1.2 can arm when Overall is 1.8. */
export function activeMinPf(e: VstEngine): number {
  const t = e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
  if (e.shortRange) {
    const xs = [minPfFor(e, "short")];
    if (t.axis) xs.push(minPfFor(e, "axis"));
    if (t.block) xs.push(minPfFor(e, "block"));
    return Math.min(...xs);
  }
  const xs = [minPfFor(e, "overall")];
  if (t.axis) xs.push(minPfFor(e, "axis"));
  if (t.block) xs.push(minPfFor(e, "block"));
  if (t.normal) xs.push(minPfFor(e, "base"));
  return Math.min(...xs);
}

function floorForDisableKey(e: VstEngine, key: string): number {
  if (key.startsWith("tac:axis") || key.includes(":axis:") || key.endsWith(":axis")) return minPfFor(e, "axis");
  if (key.startsWith("book:block") || key.startsWith("kind:block") || key.includes(":block:")) return minPfFor(e, "block");
  if (key.startsWith("kind:short") || key.startsWith("book:short")) return minPfFor(e, "short");
  if (key.startsWith("kind:normal") || key.startsWith("book:normal")) return minPfFor(e, e.shortRange ? "shortBase" : "base");
  return e.shortRange ? minPfFor(e, "short") : minPfFor(e, "overall");
}

/** Systemwide overall PF (trailing / hybrid / symbol). */
export function entryMinPf(e: VstEngine, _block: BlockConfig = e.blockCfg ?? DEFAULT_BLOCK_CONFIG): number {
  return minPfFor(e, "overall");
}

export function symbolLastNPf(e: VstEngine, symbol: string, n = 6): number | null {
  const take = e.closed.filter((c) => c.symbol === symbol && deskTapeRow(e, c)).slice(0, Math.max(4, n));
  if (take.length < 4) return null;
  return pfFromPnls(take);
}

/** Closed tape for an independent config/lane (indication × tactic × range × playbook × side). */
export function laneClosed(
  e: VstEngine,
  rel: {
    symbol?: string;
    side?: Side;
    indication?: string;
    kind?: string;
    tactic?: string;
    rangeType?: string;
    playbook?: string;
  },
  n: number,
) {
  const need = Math.max(1, Math.round(n) || 1);
  const out: { pnl: number }[] = [];
  for (const c of e.closed) {
    if (!deskTapeRow(e, c)) continue;
    if (rel.symbol && c.symbol !== rel.symbol) continue;
    if (rel.side && c.side !== rel.side) continue;
    if (rel.indication && (c.indication ?? "trend") !== rel.indication) continue;
    if (rel.kind && (c.kind ?? "") !== rel.kind) continue;
    if (rel.tactic && (c.tactic ?? "") !== rel.tactic) continue;
    if (rel.rangeType && (c.rangeType ?? "") !== rel.rangeType) continue;
    if (rel.playbook && (c.playbook ?? "") !== rel.playbook) continue;
    out.push(c);
    if (out.length >= need) break;
  }
  return out;
}

export function laneLastNStats(rows: { pnl?: number; ratio?: number }[]) {
  const n = rows.length;
  const net = rows.reduce((s, r) => s + edgePnl(r), 0);
  return { n, net, avg: n ? net / n : 0, pf: pfFromPnls(rows) };
}

export function applyRealizedSymbolStats(
  e: VstEngine,
  rows: { key?: string; id?: string; n?: number; trades?: number; pf?: number; wr?: number; net?: number; wins?: number; profit?: number; loss?: number }[],
) {
  const floor = entryMinPf(e);
  const disabled = { ...(e.liveDisabled ?? {}) };
  for (const s of rows) {
    const id = String(s.key || s.id || "");
    if (!id) continue;
    const n = Math.max(0, Math.round(Number(s.n ?? s.trades) || 0));
    if (n < 1) continue;
    const net = Number(s.net) || 0;
    const pf = Number(s.pf);
    let profit = Number(s.profit);
    let loss = Number(s.loss);
    if (!Number.isFinite(profit) || !Number.isFinite(loss)) {
      if (!Number.isFinite(pf) || pf <= 0) {
        profit = Math.max(0, net);
        loss = Math.max(0, -net);
      } else if (pf >= PF_NO_LOSS - 1e-9 || loss === 0) {
        profit = Math.max(0, net);
        loss = 0;
      } else {
        const gl = net >= 0 ? net / Math.max(1e-9, pf - 1) : -net / Math.max(1e-9, 1 - pf);
        loss = Math.max(0, gl);
        profit = Math.max(0, loss * pf);
      }
    }
    const wins = Math.round(Number(s.wins) || Math.max(0, n * (Number(s.wr) || 0)));
    const prev = e.symbolStats[id];
    e.symbolStats[id] = {
      id,
      trades: n,
      wins,
      profit,
      loss,
      sl: prev?.sl ?? 0,
      tp: prev?.tp ?? 0,
    };
    const tapePf = profitFactor(e.symbolStats[id]!.profit, e.symbolStats[id]!.loss);
    if (n >= 2 && tapePf + 1e-9 < floor) disabled[`sym:${id}`] = { pf: tapePf, n, at: e.tick };
    else delete disabled[`sym:${id}`];
  }
  e.liveDisabled = disabled;
  return Object.keys(disabled).length;
}

/** Skip new entries below system min PF, losing last-N, or 100h non-performers. */
export function skipLiveSymbol(e: VstEngine, symbol: string, evalN = 6) {
  if (internAllPhase(e) || completeOpenTape(e) || performingLive(e)) return false;
  if (e.shortComboOnly && paperMode(e)) return symbolBlockPaused(e, symbol, evalN);
  if (e.shortRange && !e.liveTape) return symbolBlockPaused(e, symbol, evalN);
  if (symbolBlockPaused(e, symbol, evalN)) return true;
  const floor = e.liveTape ? activeMinPf(e) : minPfFor(e, e.shortRange ? "shortBase" : "base");
  const liveFloor = floor;
  const st = e.symbolStats?.[symbol];
  const tape = symbolTapePf(e, symbol);
  const thin = Boolean(e.liveTape && (e.liveOpenN ?? 99) < 12);
  if (!thin && tape != null && tape + 1e-9 < liveFloor) return true;
  if (!thin && st && st.trades >= 6) {
    const stPf = profitFactor(st.profit, st.loss);
    if (stPf + 1e-9 < liveFloor) return true;
  }
  if (!thin && e.liveDisabled?.[`sym:${symbol}`] && (tape == null || tape + 1e-9 < liveFloor)) return true;
  if (e.liveTape && !thin) {
    let liveN = 0;
    let liveProfit = 0;
    let liveLoss = 0;
    for (const t of Object.values(e.symbolStats ?? {})) {
      liveN += t.trades || 0;
      liveProfit += t.profit || 0;
      liveLoss += t.loss || 0;
    }
    const livePf = liveN >= 8 ? profitFactor(liveProfit, liveLoss) : Number(e.stats.pf);
    const overallBad =
      (liveN >= 8 || (e.stats.trades || 0) >= 8) && Number.isFinite(livePf) && livePf > 0 && livePf + 1e-9 < liveFloor;
    if (overallBad) {
      if (!st || st.trades < 4) return true;
      const pf = tape ?? profitFactor(st.profit, st.loss);
      if (pf + 1e-9 < liveFloor) return true;
      if (st.trades >= 6 && pf + 1e-9 < liveFloor) return true;
    } else if (liveN >= 8 && (!st || st.trades < 2)) {
      return true;
    }
    if (!st || st.trades < 2) {
      const last = symbolLastNPf(e, symbol, evalN);
      if (last != null && last + 1e-9 < liveFloor) return true;
    }
    try {
      const ind = classifyIndication(e, symbol);
      if (ind === "direction" || ind === "break") {
        const take = e.closed.filter((c) => isDeskConn(c.connId) && c.indication === ind).slice(0, 40);
        const need = ind === "break" ? 24 : 12;
        const floorPf = ind === "break" ? 0.7 : 1;
        if (take.length >= need && pfFromPnls(take) + 1e-9 < floorPf) {
          if (ind === "break" && (e.liveOpenN ?? 99) < 18) {
            /* keep break filling until the live book is thick */
          } else return true;
        }
      }
    } catch {
      /* quotes may be thin */
    }
  } else if (!e.liveTape) {
    const last = symbolLastNPf(e, symbol, evalN);
    if (last != null && last + 1e-9 < floor) return true;
  }
  const perf = e.performingSymbols;
  const skipped = e.hourCoord?.skipped ?? [];
  if (!thin && skipped.includes(symbol)) return true;
  if (!thin && perf && perf.length > 0 && !perf.includes(symbol)) {
    const pf = tape ?? (st ? profitFactor(st.profit, st.loss) : null);
    if (st && st.trades >= 4 && pf != null && pf + 1e-9 < floor) return true;
    if (e.liveTape && st && st.trades >= 4 && pf != null && pf + 1e-9 < floor) return true;
  }
  if (!thin && e.symbolEval?.[symbol]?.hourOk === false) {
    const pf = tape ?? (st ? profitFactor(st.profit, st.loss) : null);
    if (pf != null && pf + 1e-9 < floor) return true;
    if (!e.liveTape && (st?.trades ?? 0) >= 4 && pf != null && pf + 1e-9 < floor) return true;
  }
  if (!e.completeSim && e.liveDisabled?.[`ind:trend`]) {
    try {
      if (classifyIndication(e, symbol) === "trend") return true;
    } catch {
      /* quotes may be thin */
    }
  }
  if (!e.completeSim) {
    try {
      const ind = classifyIndication(e, symbol);
      const kind = kindFromIndication(ind, openPlaybook(e.lastTactic, ind), e.lastTactic);
      if (!thin && e.liveDisabled?.[`kind:${kind}`]) return true;
      if (!thin && e.liveDisabled?.[`ind:${ind}`]) return true;
    } catch {
      /* quotes may be thin */
    }
  }
  if (!e.liveTape) {
    const trend = e.closed.filter((c) => isDeskConn(c.connId) && c.indication === "trend").slice(0, 8);
    if (trend.length >= 3) {
      const pf = pfFromPnls(trend);
      if (pf + 1e-9 < floor) {
        try {
          if (classifyIndication(e, symbol) === "trend") return true;
        } catch {
          /* keep */
        }
      }
    }
  }
  return false;
}

function sitHour(c: { tick: number; at?: number }): number {
  const at = Number(c.at);
  if (at > 1e12) return new Date(at).getUTCHours();
  return Math.floor(Math.max(0, Number(c.tick) || 0) / TICKS_PER_HOUR) % 24;
}

function bucketPnls(rows: { pnl?: number; ratio?: number }[]) {
  const n = rows.length;
  let wins = 0;
  let gp = 0;
  let gl = 0;
  let net = 0;
  for (const r of rows) {
    const p = edgePnl(r);
    net += p;
    if (p > 0) {
      wins += 1;
      gp += p;
    } else if (p < 0) gl += -p;
  }
  return { n, pf: profitFactor(gp, gl), wr: n ? wins / n : 0, net };
}

function bestKeyOf(m: Map<string, { pnl: number }[]>, minPf: number) {
  let best: { k: string; pf: number } | null = null;
  for (const [k, list] of m) {
    if (list.length < 3) continue;
    const sc = bucketPnls(list);
    if (sc.pf + 1e-9 < minPf) continue;
    if (!best || sc.pf > best.pf) best = { k, pf: sc.pf };
  }
  return best?.k;
}

export function refreshSymbolHourEval(
  e: VstEngine,
  opts?: { hours?: number; minPf?: number; minN?: number; now?: Date },
) {
  const hours = Math.max(4, Math.round(opts?.hours ?? e.blockCfg?.symbolEvalHours ?? SYMBOL_EVAL_HOURS));
  const minPf = opts?.minPf ?? (e.shortRange ? minPfFor(e, "short") : minPfFor(e, "overall"));
  const minN = Math.max(3, Math.round(opts?.minN ?? 6));
  const nowHour = (opts?.now ?? new Date()).getUTCHours();
  const rows = windowHours(e.closed.filter((c) => isDeskConn(c.connId)), e.tick, hours);
  const bySym = new Map<string, typeof rows>();
  for (const c of rows) {
    const arr = bySym.get(c.symbol) ?? [];
    arr.push(c);
    bySym.set(c.symbol, arr);
  }
  const evalMap: Record<string, SymbolHourRow> = {};
  const performing: string[] = [];
  const skipped: string[] = [];
  const hourRows = rows.filter((c) => sitHour(c) === nowHour);
  const hourInd = new Map<string, { pnl: number }[]>();
  const hourSide = new Map<string, { pnl: number }[]>();
  const hourTac = new Map<string, { pnl: number }[]>();
  for (const c of hourRows) {
    const ik = c.indication ?? "trend";
    const sk = c.side;
    const tk = String(c.tactic ?? e.lastTactic);
    (hourInd.get(ik) ?? (hourInd.set(ik, []), hourInd.get(ik)!)).push({ pnl: edgePnl(c) });
    (hourSide.get(sk) ?? (hourSide.set(sk, []), hourSide.get(sk)!)).push({ pnl: edgePnl(c) });
    (hourTac.get(tk) ?? (hourTac.set(tk, []), hourTac.get(tk)!)).push({ pnl: edgePnl(c) });
  }
  for (const s of universeSymbols(e.symbolCount)) {
    const list = bySym.get(s.id) ?? [];
    const sc = bucketPnls(list);
    const byHour: SymbolHourRow["byHour"] = {};
    const hourMap = new Map<number, { pnl: number }[]>();
    const indMap = new Map<string, { pnl: number }[]>();
    const sideMap = new Map<string, { pnl: number }[]>();
    const tacMap = new Map<string, { pnl: number }[]>();
    for (const c of list) {
      const h = sitHour(c);
      (hourMap.get(h) ?? (hourMap.set(h, []), hourMap.get(h)!)).push({ pnl: edgePnl(c) });
      const ik = c.indication ?? "trend";
      (indMap.get(ik) ?? (indMap.set(ik, []), indMap.get(ik)!)).push({ pnl: edgePnl(c) });
      (sideMap.get(c.side) ?? (sideMap.set(c.side, []), sideMap.get(c.side)!)).push({ pnl: edgePnl(c) });
      const tk = String(c.tactic ?? e.lastTactic);
      (tacMap.get(tk) ?? (tacMap.set(tk, []), tacMap.get(tk)!)).push({ pnl: edgePnl(c) });
    }
    let bestHour: number | undefined;
    let bestHourPf = -1;
    for (const [h, hs] of hourMap) {
      const b = bucketPnls(hs);
      byHour[String(h)] = { n: b.n, pf: b.pf, net: b.net };
      if (b.n >= 3 && b.pf > bestHourPf) {
        bestHourPf = b.pf;
        bestHour = h;
      }
    }
    const byWindow: SymbolHourRow["byWindow"] = {};
    for (const w of SYMBOL_HOUR_WINDOWS) {
      const slice = windowHours(list, e.tick, w);
      const b = bucketPnls(slice);
      byWindow[String(w)] = { n: b.n, pf: b.pf, net: b.net, ok: b.n >= minN && b.pf + 1e-9 >= minPf && b.net >= 0 };
    }
    const sit = byHour[String(nowHour)];
    const hourOk = !sit || sit.n < 3 ? true : sit.pf + 1e-9 >= minPf;
    const ok = sc.n >= minN && sc.pf + 1e-9 >= minPf && sc.net >= 0;
    evalMap[s.id] = {
      n: sc.n,
      pf: sc.pf,
      wr: sc.wr,
      net: sc.net,
      ok,
      hourOk,
      byHour,
      byWindow,
      bestInd: bestKeyOf(indMap, minPf),
      bestSide: bestKeyOf(sideMap, minPf),
      bestTac: bestKeyOf(tacMap, minPf),
      bestHour,
    };
    if (ok && hourOk) performing.push(s.id);
    else if (sc.n >= minN) skipped.push(s.id);
  }
  e.symbolEval = evalMap;
  const tapeHours = e.tick / TICKS_PER_HOUR;
  e.performingSymbols = tapeHours >= 16 ? performing : [];
  e.hourCoord = {
    hour: nowHour,
    performing,
    skipped,
    bestInd: bestKeyOf(hourInd, minPf),
    bestSide: bestKeyOf(hourSide, minPf),
    bestTac: bestKeyOf(hourTac, minPf),
    at: e.tick,
  };
  return { hours, performing, skipped, hour: nowHour, n: rows.length, symbols: Object.keys(evalMap).length };
}

export function mergeSymbolHourEval(dst: VstEngine, src: VstEngine, minN = 6) {
  const from = src.symbolEval ?? {};
  const into = { ...(dst.symbolEval ?? {}) };
  for (const [id, row] of Object.entries(from)) {
    if (!into[id] || into[id]!.n < minN) into[id] = row;
  }
  dst.symbolEval = into;
  dst.performingSymbols = Object.entries(into)
    .filter(([, r]) => r.ok && r.hourOk)
    .map(([id]) => id);
  if (src.hourCoord && (!dst.hourCoord || dst.hourCoord.performing.length < 2)) dst.hourCoord = src.hourCoord;
  return dst.performingSymbols;
}

export function validateSymbols100h(
  cfg: TacticConfig = DEFAULT_CFG,
  tactic: TacticKind = "trailing",
  opts?: { symbolCount?: number; rangeType?: RangeType; block?: BlockConfig; minPf?: number },
) {
  const hours = SYMBOL_EVAL_HOURS;
  const r = simulateHours(hours, cfg, tactic, {
    symbolCount: opts?.symbolCount ?? 8,
    rangeType: opts?.rangeType ?? "atr",
    block: opts?.block,
  });
  const scored = refreshSymbolHourEval(r.engine, { hours, minPf: opts?.minPf ?? DEFAULT_MIN_PF });
  return { report: r.report, engine: r.engine, ...scored, hours };
}

export function blockWindowSnapshot(e: VstEngine, n = 6) {
  const overall = e.blockWindows?.[n] ?? emptyBlockWindow(n);
  const symbols = Object.entries(e.blockWindowsBySymbol ?? {}).map(([symbol, map]) => {
    const w = map[n] ?? emptyBlockWindow(n);
    return {
      symbol,
      closed: w.closed,
      windows: w.windows,
      lossWindows: w.lossWindows,
      lastAvg: w.lastAvg,
      lastNet: w.lastNet,
      lastPf: w.lastPf,
      pauseLeft: w.pauseLeft,
      adjusted: w.adjusted,
      losers: w.losers,
    };
  }).sort((a, b) => a.lastAvg - b.lastAvg);
  return { n, overall, symbols };
}

const MAJOR_REL = new Set(["ind", "kind", "tac", "rng", "side", "book"]);
const MINOR_REL = new Set(["cfg", "sub", "combo"]);

function closedMatchesRelKey(
  c: { indication?: string; kind?: string; tactic?: string; rangeType?: string; side?: string; playbook?: string; symbol?: string; tpAtr?: number; slOfTp?: number },
  key: string,
): boolean {
  const i = key.indexOf(":");
  if (i < 0) return false;
  const prefix = key.slice(0, i);
  const val = key.slice(i + 1);
  if (prefix === "ind") return (c.indication ?? "") === val;
  if (prefix === "kind") return (c.kind ?? "") === val;
  if (prefix === "tac") return (c.tactic ?? "") === val;
  if (prefix === "rng") return (c.rangeType ?? "") === val;
  if (prefix === "side") return (c.side ?? "") === val;
  if (prefix === "book") return (c.playbook ?? "") === val;
  if (prefix === "sym") return (c.symbol ?? "") === val;
  if (prefix === "prot") {
    if (c.tpAtr == null || c.slOfTp == null) return false;
    const want = val.includes("x") ? val.replace("x", ":") : val;
    return shortComboKey(c.tpAtr, c.slOfTp) === want;
  }
  if (prefix === "sub") {
    const [ind, kind] = val.split(":");
    return (c.indication ?? "") === ind && (c.kind ?? "") === kind;
  }
  if (prefix === "combo") {
    const p = val.split(":");
    const side = p[p.length - 1] ?? "";
    if ((c.side ?? "") !== side) return false;
    if (p.length >= 6) {
      return (
        (c.indication ?? "") === (p[0] ?? "") &&
        (c.tactic ?? "") === (p[1] ?? "") &&
        (c.rangeType ?? "") === (p[2] ?? "") &&
        c.tpAtr != null &&
        c.slOfTp != null &&
        shortComboKey(c.tpAtr, c.slOfTp) === `${p[3]}:${p[4]}`
      );
    }
    return (
      (c.indication ?? "") === (p[0] ?? "") &&
      (c.kind ?? "") === (p[1] ?? "") &&
      (c.tactic ?? "") === (p[2] ?? "") &&
      (c.rangeType ?? "") === (p[3] ?? "")
    );
  }
  return false;
}

function internScoreBlockRelations(
  e: VstEngine,
  block: BlockConfig,
  minPf: number,
): {
  rows: Record<string, ProgressEvalRow>;
  bests: { key: string; n: number; pf: number; net: number; closed: number }[];
} {
  const ns = (block.evalLastNs?.length ? block.evalLastNs : [1, 2, 3, 4, 5, 6])
    .map((n) => Math.max(1, Math.min(6, Math.round(n))));
  const rows: Record<string, ProgressEvalRow> = {};
  const bests: { key: string; n: number; pf: number; net: number; closed: number }[] = [];
  for (const [key, byN] of Object.entries(e.blockRelWindows ?? {})) {
    let best: (typeof bests)[number] | null = null;
    for (const n of ns) {
      const w = byN[n];
      if (!w || w.closed < n) continue;
      const cand = { key, n, pf: w.lastPf, net: w.lastNet, closed: w.closed };
      if (!best) best = cand;
      else if (w.lastPf > best.pf + 0.2) best = cand;
      else if (w.lastPf + 0.2 >= best.pf && n > best.n) best = cand;
    }
    if (!best) continue;
    bests.push(best);
    rows[key] = {
      n: best.closed,
      pf: best.pf,
      net: best.net,
      ok: best.pf + 1e-9 >= minPf,
    };
  }
  return { rows, bests };
}

export function evalBlockRelations(e: VstEngine, block: BlockConfig = DEFAULT_BLOCK_CONFIG) {
  const minPf = internAllPhase(e) ? 0 : (block.minRelPf ?? minPfFor(e, "block"));
  const iv = intervalCfg(e);
  const minutes = iv.minutes;
  const ivScale = iv.enabled && iv.scaleVol ? intervalVolumeScale(e, minutes) : 1;
  e.intervalVolScale = ivScale;
  e.intervalPf = lastIntervalStats(e, minutes).pf;
  const vr = clampBlockVol(block.relVolumeRatio ?? block.volumeRatio);
  const intern = internScoreBlockRelations(e, block, minPf);
  const paper = internAllPhase(e);
  const candidates = intern.bests.filter((c) => paper || c.pf >= minPf);
  const ivMin = e.tick - minutes;
  const ivClosed = e.closed.filter((c) => isDeskConn(c.connId) && (c.tick || 0) >= ivMin);
  const ivFor = (key: string) => {
    const rows = ivClosed.filter((c) => closedMatchesRelKey(c, key));
    return laneLastNStats(rows);
  };
  const byPrefix = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    const p = c.key.split(":")[0] ?? "";
    if (!MAJOR_REL.has(p)) continue;
    const prev = byPrefix.get(p);
    if (!prev || c.pf > prev.pf) byPrefix.set(p, c);
  }
  const picks: { key: string; n: number; pf: number; net: number; vol: number; major: boolean }[] = [];
  for (const c of byPrefix.values()) picks.push({ ...c, vol: vr, major: true });
  for (const c of candidates) {
    const p = c.key.split(":")[0] ?? "";
    if (MINOR_REL.has(p)) picks.push({ ...c, vol: vr, major: false });
  }
  const seen = new Set<string>();
  const uniq = picks.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
  const scored = uniq.map((p) => {
    const ivRow = iv.enabled && iv.scoreRelations && e.tick >= minutes ? ivFor(p.key) : { n: 0, pf: 0, net: 0, avg: 0 };
    let volMul = ivScale;
    if (ivRow.n >= 3 && ivRow.pf + 1e-9 < 0.95) volMul *= iv.relationHaircut;
    else if (ivRow.n >= 3 && ivRow.pf >= minPf) volMul = Math.min(iv.maxScale, volMul * iv.relationBoost);
    return { ...p, vol: vr * volMul, ivN: ivRow.n, ivPf: ivRow.pf };
  });
  scored.sort((a, b) => {
    const ap = a.ivN >= 3 ? a.ivPf : a.pf;
    const bp = b.ivN >= 3 ? b.ivPf : b.pf;
    return bp - ap || b.net - a.net;
  });
  const kept = scored.filter((p, i) => i === 0 || p.ivN < 3 || p.ivPf >= iv.relationKeepPf);
  const used = kept.slice(0, 8).map(({ ivN: _n, ivPf: _p, ...row }) => row);
  e.blockRelBest = Object.fromEntries(used.map((p) => [p.key, p]));
  e.relVolumeFactor = block.relAdditive === false ? 0 : used.reduce((s, p) => s + Math.max(0, p.vol), 0);
  e.lastRelEvalTick = e.tick;
  pruneBlockRelWindows(e);
  refreshIndicationSets(e, block);
  refreshProgressEvals(e, block);
  if (e.progressEval) e.progressEval.relations = intern.rows;
  refreshLiveDisable(e, block);
  refreshSymbolHourEval(e, { hours: block.symbolEvalHours ?? SYMBOL_EVAL_HOURS, minPf: entryMinPf(e, block) });
  return { picks: used, winners: used.length, intern: intern.bests.length, factor: e.relVolumeFactor || 0, at: e.tick, candidates: uniq.length };
}

function refreshIndicationSets(e: VstEngine, block: BlockConfig) {
  const minPf = internAllPhase(e) ? 0 : (e.shortRange ? minPfFor(e, "short") : entryMinPf(e, block));
  const take = e.closed.filter((c) => isDeskConn(c.connId)).slice(0, 40);
  const byIndRange = new Map<string, { pnl: number }[]>();
  const byIndTac = new Map<string, { pnl: number }[]>();
  for (const c of take) {
    const ind = c.indication ?? "trend";
    const rng = c.rangeType ?? e.lastRange ?? "atr";
    const tac = c.tactic ?? e.lastTactic;
    const rk = `${ind}:${rng}`;
    const tk = `${ind}:${tac}`;
    (byIndRange.get(rk) ?? (byIndRange.set(rk, []), byIndRange.get(rk)!)).push({ pnl: edgePnl(c) });
    (byIndTac.get(tk) ?? (byIndTac.set(tk, []), byIndTac.get(tk)!)).push({ pnl: edgePnl(c) });
  }
  const ranges: Partial<Record<IndicationId, RangeType>> = {};
  const tacs: Partial<Record<IndicationId, TacticKind>> = {};
  const ids = INDICATION_KINDS.map((k) => k.id);
  for (const id of ids) {
    let bestR: { k: RangeType; pf: number; n: number } | null = null;
    let bestT: { k: TacticKind; pf: number; n: number } | null = null;
    for (const [key, rows] of byIndRange) {
      if (!key.startsWith(`${id}:`) || rows.length < 3) continue;
      const sc = pfRows(rows);
      const rng = key.slice(id.length + 1) as RangeType;
      if (!RANGE_TYPES.includes(rng)) continue;
      if (!(IND_RANGE_PREF[id] || []).includes(rng)) continue;
      if (sc.pf + 1e-9 < minPf) continue;
      if (!bestR || sc.pf > bestR.pf) bestR = { k: rng, pf: sc.pf, n: sc.n };
    }
    for (const [key, rows] of byIndTac) {
      if (!key.startsWith(`${id}:`) || rows.length < 3) continue;
      const sc = pfRows(rows);
      const tac = key.slice(id.length + 1) as TacticKind;
      if (sc.pf + 1e-9 < minPf) continue;
      if (!bestT || sc.pf > bestT.pf) bestT = { k: tac, pf: sc.pf, n: sc.n };
    }
    if (bestR) ranges[id] = bestR.k;
    else ranges[id] = IND_RANGE_PREF[id][0];
    if (bestT) tacs[id] = bestT.k;
  }
  e.indRangeBest = ranges;
  e.indTacticBest = tacs;
}

function groupPf(rows: { pnl: number }[], minPf: number, minN = 3): ProgressEvalRow {
  const sc = pfRows(rows);
  return { n: sc.n, pf: sc.pf, net: sc.net, ok: sc.n >= minN && sc.pf + 1e-9 >= minPf && sc.net >= 0 };
}

function pickPositiveKeys(rows: Record<string, ProgressEvalRow>, fallback: string[]): string[] {
  const ok = Object.entries(rows).filter(([, r]) => r.ok || r.n < 4).map(([k]) => k);
  return ok.length ? ok : fallback;
}

const LAST_N_GROUP_CAP = 80;
const LAST_N_LOOK = 240;

function takeNewestDeskClosed(e: VstEngine, cap: number, opts?: { liveOnly?: boolean }) {
  const out: VstEngine["closed"] = [];
  const liveOnly = Boolean(opts?.liveOnly);
  for (const c of e.closed) {
    if (!deskTapeRow(e, c)) continue;
    if (liveOnly && c.validExec !== true) continue;
    out.push(c);
    if (out.length >= cap) break;
  }
  if (out.length > 1 && (out[0]!.tick || 0) < (out[out.length - 1]!.tick || 0)) {
    out.sort((a, b) => (b.tick || 0) - (a.tick || 0));
  }
  return out;
}

function pushCapped(m: Map<string, { pnl: number }[]>, key: string, pnl: number, cap: number) {
  const a = m.get(key);
  if (a) {
    if (a.length < cap) a.push({ pnl });
  } else m.set(key, [{ pnl }]);
}

function groupClosedTypes(
  rows: { pnl: number; indication?: string; tactic?: string; rangeType?: string; playbook?: string; kind?: string; tpAtr?: number; slOfTp?: number }[],
  fallbackTac: string,
  fallbackRange: string,
) {
  const ind = new Map<string, { pnl: number }[]>();
  const tac = new Map<string, { pnl: number }[]>();
  const rng = new Map<string, { pnl: number }[]>();
  const play = new Map<string, { pnl: number }[]>();
  const combo = new Map<string, { pnl: number }[]>();
  const short = new Map<string, { pnl: number }[]>();
  for (const c of rows) {
    const i = String(c.indication || "trend");
    const t = String(c.tactic || fallbackTac);
    const r = String(c.rangeType || fallbackRange);
    const p = String(c.playbook || c.kind || "short");
    const pnl = edgePnl(c);
    pushCapped(ind, i, pnl, LAST_N_GROUP_CAP);
    pushCapped(tac, t, pnl, LAST_N_GROUP_CAP);
    pushCapped(rng, r, pnl, LAST_N_GROUP_CAP);
    pushCapped(play, p, pnl, LAST_N_GROUP_CAP);
    pushCapped(combo, `${i}:${t}:${r}:${p}`, pnl, LAST_N_GROUP_CAP);
    if (c.tpAtr != null && c.slOfTp != null) pushCapped(short, shortComboKey(c.tpAtr, c.slOfTp), pnl, LAST_N_GROUP_CAP);
  }
  return { ind, tac, rng, play, combo, short };
}

function scoreTypeMap(
  groups: Map<string, { pnl: number }[]>,
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): Record<string, ProgressEvalRow> {
  const out: Record<string, ProgressEvalRow> = {};
  for (const [k, rows] of groups) {
    const sc = scoreLastNGroup(rows, cfg, minPf, basePf);
    out[k] = { n: sc.n, pf: sc.pf, net: sc.net, ok: sc.ok };
  }
  return out;
}

function keepCoordRel(rel: { indication?: string; playbook?: string; kind?: string; blockLevel?: number }): boolean {
  const play = String(rel.playbook || rel.kind || "");
  if (play === "block" || (rel.blockLevel ?? 0) >= 1) return true;
  const ind = String(rel.indication || "");
  return ind === "break" || ind === "active" || (DEFAULT_LOSING_HOUR_INDS as readonly string[]).includes(ind);
}

const laneDecCache = new WeakMap<VstEngine, { at: number; n: number; head: string; map: Map<string, ReturnType<typeof decideLastN>> }>();

function bustLaneDecCache(e: VstEngine) {
  laneDecCache.delete(e);
}

function laneDecTapeSig(e: VstEngine) {
  const head = e.closed[0];
  return head ? `${head.id}:${head.pnl}:${head.tick}` : "";
}

function laneDecKey(rel: {
  symbol?: string;
  side?: string;
  indication?: string;
  kind?: string;
  tactic?: string;
  rangeType?: string;
  playbook?: string;
}) {
  return `${rel.indication ?? ""}|${rel.tactic ?? ""}|${rel.rangeType ?? ""}|${rel.playbook ?? rel.kind ?? ""}|${rel.symbol ?? ""}|${rel.side ?? ""}`;
}

/** Score every last-N / Block / indication / tactic / range type by PF.
 * Intern always evaluates the full grid (future config changes stay covered).
 * Base ok uses shortBase/base floors on independent tapes. Live last-N valid uses short/overall.
 * Never pin a hardcoded combo set.
 */
function independentPassingComboRows(
  e: VstEngine,
  ln: LastNProgressConfig,
  minPf: number,
  basePf: number,
): { pnl: number }[] {
  const live = e.shortComboLiveTape ?? {};
  const intern = e.preEvalDone ? (e.shortComboPreTape ?? {}) : (e.shortComboTape ?? {});
  const out: { pnl: number }[] = [];
  const seen = new Set<string>();
  for (const bag of [live, intern]) {
    for (const [k, rows] of Object.entries(bag)) {
      if (seen.has(k) || !rows?.length) continue;
      seen.add(k);
      const d = decideLastN(rows, { ...ln, mode: "independent" }, minPf, basePf);
      const gated = d.validHits.filter((h) => h.samples >= h.n && h.pf + 1e-9 >= GATED_MIN_PF && h.net > 0);
      if (!(gated.length || internStartOk(e, rows))) continue;
      out.push(...rows);
    }
  }
  return out;
}

export function refreshProgressEvals(e: VstEngine, block: BlockConfig = e.blockCfg ?? DEFAULT_BLOCK_CONFIG): ProgressEval {
  const ln = lastNProgressOf(e);
  const maxN = lastNMaxOf(ln);
  const look = Math.max(maxN * 2, LAST_N_LOOK);
  const newestAll = takeNewestDeskClosed(e, look);
  const gatedLive = Boolean(e.preEvalDone && !internAllPhase(e));
  const newestLive = gatedLive ? takeNewestDeskClosed(e, look, { liveOnly: true }) : newestAll;
  const newestCoord = newestLive.length ? newestLive : newestAll;
  const minPf = internAllPhase(e) ? 0 : (e.shortRange ? minPfFor(e, "short") : entryMinPf(e, block));
  const basePf = internAllPhase(e) ? 0 : minPfFor(e, e.shortRange ? "shortBase" : "base");
  const pre = lastNPrefix(newestCoord, maxN);
  const coordPick = coordinateLastNFromPrefix(pre, ln, minPf, basePf);
  const evalNs = hitsToProgressRows(coordPick.evalHits, basePf, ln.evalNs);
  const validNs = hitsToProgressRows(coordPick.validHits, minPf, ln.validNs);
  const disableNs = hitsToProgressRows(coordPick.disableHits, 0, ln.disableNs, "avg");

  const independentRows = independentPassingComboRows(e, ln, minPf, basePf);
  const folded = foldLastNProcessings(independentRows, newestCoord, ln, minPf, basePf);
  const lastNModes = folded.modes;
  const lastNOverall = folded.overall;
  const lastNMode = lastNModes.independent.pass
    ? lastNModes.combined.pass
      ? "parallel"
      : "independent"
    : lastNModes.combined.pass
      ? "combined"
      : lastNModes.majority.pass
        ? "majority"
        : coordPick.mode;

  const blockCounts: Record<string, ProgressEvalRow> = {};
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const w = e.blockWindows?.[n];
    const nClosed = w?.closed ?? 0;
    const pf = w?.lastPf ?? 0;
    const net = w?.lastNet ?? 0;
    blockCounts[String(n)] = { n: nClosed, pf, net, ok: blockCountPositive(e, n, minPf) };
  }
  const volumeModes: Record<string, ProgressEvalRow> = {};
  const sharedRows: { pnl: number }[] = [];
  const addRows: { pnl: number }[] = [];
  for (const [k, lane] of Object.entries(e.blockLanes ?? {})) {
    if (k.endsWith(":shared")) for (const x of lane.parentPf ?? []) sharedRows.push({ pnl: x });
    if (k.endsWith(":additive")) for (const x of lane.parentPf ?? []) addRows.push({ pnl: x });
  }
  volumeModes.shared = groupPf(sharedRows, minPf, 4);
  volumeModes.additive = groupPf(addRows, minPf, 4);
  volumeModes.parallel = groupPf([...sharedRows, ...addRows], minPf, 4);
  const overallModes = { ...volumeModes };

  const grouped = groupClosedTypes(newestCoord, String(e.lastTactic || "trailing"), String(e.lastRange || "atr"));
  const typeFloor = internAllPhase(e) ? GATED_MIN_PF : Math.max(GATED_MIN_PF, basePf);
  const indications = coverCatalogRows(
    scoreTypeMap(grouped.ind, ln, typeFloor, typeFloor),
    SHORT_PROGRESS_INDICATIONS,
  );
  const tactics = coverCatalogRows(
    scoreTypeMap(grouped.tac, ln, typeFloor, typeFloor),
    ["trailing", "axis", "hybrid"],
  );
  const ranges = coverCatalogRows(
    scoreTypeMap(grouped.rng, ln, typeFloor, typeFloor),
    RANGE_TYPES,
  );
  const playbooks = coverCatalogRows(
    scoreTypeMap(grouped.play, ln, minPf, basePf),
    ["short", "block", "axis", "normal"],
  );
  const combos = scoreTypeMap(grouped.combo, ln, minPf, basePf);
  const shortBaseFloor = minPfFor(e, e.shortRange ? "shortBase" : "base");
  const shortCombos: Record<string, ProgressEvalRow> = {};
  for (const c of allShortTpSlCombos()) {
    const k = shortComboKey(c.tpAtr, c.slOfTp);
    const tape =
      e.preEvalDone && (e.shortComboLiveTape?.[k]?.length ?? 0) >= 6
        ? e.shortComboLiveTape![k]
        : internStartRows(e, k);
    if (tape && tape.length) {
      const sc = scoreLastNGroup(tape, ln, shortBaseFloor, shortBaseFloor);
      const tinyNoLoss = sc.pf >= PF_NO_LOSS - 1e-9 && sc.net <= 1e-6;
      shortCombos[k] = {
        n: sc.n || tape.length,
        pf: sc.pf,
        net: sc.net,
        ok: sc.n >= 4 && sc.pf + 1e-9 >= shortBaseFloor && sc.net >= 0 && !tinyNoLoss,
      };
    } else {
      const fromMix = grouped.short.get(k);
      if (fromMix && fromMix.length) {
        const sc = scoreLastNGroup(fromMix, ln, shortBaseFloor, shortBaseFloor);
        const tinyNoLoss = sc.pf >= PF_NO_LOSS - 1e-9 && sc.net <= 1e-6;
        shortCombos[k] = {
          n: sc.n,
          pf: sc.pf,
          net: sc.net,
          ok: sc.n >= 4 && sc.pf + 1e-9 >= shortBaseFloor && sc.net >= 0 && !tinyNoLoss,
        };
      } else {
        shortCombos[k] = { n: 0, pf: 0, net: 0, ok: true };
      }
    }
  }
  const relMinPf = internAllPhase(e) ? 0 : (block.minRelPf ?? minPfFor(e, "block"));
  const relations = internScoreBlockRelations(e, block, relMinPf).rows;

  const activeInds = pickPositiveKeys(indications, [...grouped.ind.keys()]);
  const activeTacs = pickPositiveKeys(tactics, [...grouped.tac.keys()]);
  const activeRanges = pickPositiveKeys(ranges, [...grouped.rng.keys()]);
  const activePlays = pickPositiveKeys(playbooks, [...grouped.play.keys()]);
  const activeBlockNs = Object.entries(blockCounts)
    .filter(([, r]) => r.ok)
    .map(([k]) => Number(k))
    .filter((n) => n >= 1);
  const coord: LastNCoordState = {
    at: e.tick,
    mode: lastNMode,
    independent: lastNModes.independent.pass,
    combined: lastNModes.combined.pass,
    majority: lastNModes.majority.pass,
    stack: lastNMode === "parallel" && lastNModes.independent.pass && lastNModes.combined.pass
      ? (ln.parallelStack !== false ? ln.parallelVolRatio : 1)
      : 1,
    evalNs: coordPick.evalNs,
    validNs: coordPick.validNs,
    disableNs: coordPick.disableNs,
    bestEval: coordPick.bestEval,
    bestValid: coordPick.bestValid,
    bestDisable: coordPick.bestDisable,
    activeInds,
    activeTacs,
    activeRanges,
    activePlays,
    activeBlockNs: (activeBlockNs.length ? activeBlockNs : [...LIVE_BLOCK_COUNTS]).filter((n) => n !== 2),
    combos,
  };
  e.lastNCoord = coord;

  const snap: ProgressEval = {
    at: e.tick,
    lastNMode,
    lastNModes,
    lastNOverall,
    lastNComplete: completeLastNCorrectness(evalNs, validNs, disableNs, lastNModes, lastNOverall, {
      indications,
      ranges,
      tactics,
      playbooks,
      indicationKeys: SHORT_PROGRESS_INDICATIONS,
      rangeKeys: RANGE_TYPES,
      tacticKeys: ["trailing", "axis", "hybrid"],
      playbookKeys: ["short", "block", "axis", "normal"],
    }),
    evalNs,
    validNs,
    disableNs,
    blockCounts,
    volumeModes,
    overallModes,
    indications,
    tactics,
    ranges,
    playbooks,
    relations,
    shortCombos,
  };
  e.progressEval = snap;
  refreshPrePassKeys(e);
  bustLaneDecCache(e);
  return snap;
}

function pfRows(rows: { pnl?: number; ratio?: number }[]) {
  let gp = 0;
  let gl = 0;
  let net = 0;
  for (const c of rows) {
    const p = edgePnl(c);
    net += p;
    if (p > 0) gp += p;
    else if (p < 0) gl += -p;
  }
  return { n: rows.length, net, pf: profitFactor(gp, gl) };
}

export function refreshPrePassKeys(e: VstEngine, opts?: { intern?: boolean }) {
  const by = new Map<string, { pnl: number }[]>();
  const push = (k: string, pnl: number) => {
    const a = by.get(k) ?? (by.set(k, []), by.get(k)!);
    a.push({ pnl });
  };
  const intern = internAllPhase(e) || Boolean(opts?.intern);
  for (const c of e.closed) {
    if (!deskTapeRow(e, c)) continue;
    if (e.preEvalDone && !internAllPhase(e) && !intern && c.validExec !== true) continue;
    const ind = String(c.indication || "trend");
    const play = String(c.playbook || "short");
    const tac = String(c.tactic || e.lastTactic || "trailing");
    push(ind, edgePnl(c));
    push(`${ind}:${play}`, edgePnl(c));
    push(`${play}`, edgePnl(c));
    push(`${ind}:${play}:${tac}`, edgePnl(c));
  }
  const keys: Record<string, number> = {};
  for (const [k, rows] of by) {
    if (rows.length < 6) continue;
    const parts = k.split(":");
    const play = parts.length >= 2 ? parts[1]! : parts[0]!;
    const lane = playLaneOf(play, e.shortRange);
    const floor = intern ? Math.max(minPfFor(e, lane), 1.15) : minPfFor(e, lane);
    const pf = pfFromPnls(rows);
    if (pf + 1e-9 >= floor) keys[k] = pf;
  }
  if (!Object.keys(keys).length && e.prePassKeys && Object.keys(e.prePassKeys).length) return;
  e.prePassKeys = keys;
}

function prePassOk(e: VstEngine, rel: { indication?: string; playbook?: string; tactic?: string; kind?: string }): boolean {
  const keys = e.prePassKeys;
  if (!keys || !Object.keys(keys).length) {
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
    let bestPf = -1;
    let bestK = "";
    for (const [k, rows] of Object.entries(liveTapes)) {
      if (!rows || rows.length < minS) continue;
      const hits = lastNWindows(rows, disableNs);
      const sampled = hits.filter((h) => h.samples >= minS);
      if (!sampled.length) continue;
      const bad = sampled.filter((h) => h.avg < -1e-12);
      const st = comboTapeStats(rows);
      if (st.pf > bestPf) {
        bestPf = st.pf;
        bestK = k;
      }
      const kill = bad.length === sampled.length && !(st.n >= 8 && st.pf + 1e-9 >= 1 && st.net > 0);
      const key = `combo:${k}`;
      if (kill) disabled[key] = { pf: st.pf, n: st.n, at: e.tick };
      else kept.push(key);
    }
    if (bestK && !kept.length && disabled[`combo:${bestK}`]) {
      delete disabled[`combo:${bestK}`];
      kept.push(`combo:${bestK}`);
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
      const anyKept = list.some((y) => !disabled[y.key]);
      if (!anyKept && list.length) {
        const best = list[0]!;
        delete disabled[best.key];
        kept.push(best.key);
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
    pfRing: {},
    parentPf: [],
    active: true,
    pauseRemaining: {},
    heldFactor: {},
  };
}

function isBlockOrder(o: LiveOrder) {
  return /Block/i.test(o.note || "");
}
function isOverallBlockOrder(o: LiveOrder) {
  return /Overall Block/i.test(o.note || "") || /^ob/i.test(o.id || "");
}
type OverallScope = "book" | "symbol" | "dir";
function overallScopes(block?: BlockConfig): OverallScope[] {
  if (block?.overall === false) return [];
  const xs: OverallScope[] = ["book"];
  if (block?.overallSymbol !== false) xs.push("symbol");
  if (block?.overallDirection !== false) xs.push("dir");
  return xs;
}
function overallScopeOf(o: { note?: string }): OverallScope | null {
  if (!isOverallBlockOrder(o as LiveOrder)) return null;
  const n = o.note || "";
  if (/Overall Block symbol/i.test(n)) return "symbol";
  if (/Overall Block dir/i.test(n)) return "dir";
  return "book";
}
function overallWindowOk(
  e: VstEngine,
  scope: OverallScope,
  p: { symbol: string; side: Side },
  next: number,
  minPf: number,
) {
  if (internAllPhase(e)) return true;
  if (e.blockCfg?.windows === false) return true;
  const need = Math.max(8, next);
  if (scope === "book") return blockCountPositive(e, next, minPf);
  const w =
    scope === "symbol" ? e.blockWindowsBySymbol?.[p.symbol]?.[next] : e.blockWindowsBySide?.[p.side]?.[next];
  if (!w || w.closed < need) return true;
  const floor = next <= 1 ? Math.max(1.15, Math.min(minPf || 1.2, 1.25)) : Math.min(1.05, minPf || 1.05);
  return w.lastPf + 1e-9 >= floor;
}

function collectBlockOrders(e: VstEngine, conn: string) {
  return [
    ...e.queue.filter((o) => o.connId === conn && isBlockOrder(o)),
    ...e.orders.filter((o) => o.connId === conn && isBlockOrder(o) && (o.status === "open" || o.status === "partial" || o.status === "queued")),
  ];
}

function syncBlockParents(e: VstEngine, conn: string, block?: BlockConfig) {
  e.blockLanes = e.blockLanes ?? {};
  const live = new Set<string>();
  const modes = liveVolumeModes(block ?? e.blockCfg);
  for (const p of e.positions) {
    if (p.connId !== conn || p.qty <= 0) continue;
    const first = p.legs[0]?.qty || p.qty;
    for (const mode of modes) {
      const k = blockLaneKey(p.symbol, p.side, mode);
      live.add(k);
      let lane = e.blockLanes[k];
      if (!lane) {
        lane = emptyBlockLane(p.symbol, p.side, first, p.avgEntry);
        e.blockLanes[k] = lane;
      }
      if (!lane.active || lane.baseQty <= 0) {
        lane.active = true;
        lane.baseQty = first;
        lane.baseEntry = p.avgEntry;
        lane.confirmedAdd = 0;
        lane.satisfied = {};
        lane.pending = undefined;
        // Keep pauseRemaining + pfRing — they are the live Block gate across parents.
        continue;
      }
      if (e.blockCfg?.overall === false) {
        const grown = p.qty - (lane.baseQty + lane.confirmedAdd);
        if (grown > lane.baseQty * 0.15 && !lane.pending) {
          const prev = lane.baseQty;
          lane.baseQty = prev + grown;
          if (p.avgEntry > 0 && prev > 0) {
            lane.baseEntry = (lane.baseEntry * prev + p.avgEntry * grown) / Math.max(lane.baseQty, 1e-9);
          }
        }
      }
    }
  }
  for (const k of Object.keys(e.blockLanes)) {
    if (!live.has(k)) e.blockLanes[k].active = false;
  }
}

function recordBlockFill(e: VstEngine, o: LiveOrder, take: number) {
  if (!isBlockOrder(o)) return;
  if (isOverallBlockOrder(o)) return;
  e.blockLanes = e.blockLanes ?? {};
  const k = blockLaneKey(o.symbol, o.side, blockModeOf(o));
  const lane = e.blockLanes[k];
  if (!lane) return;
  lane.confirmedAdd += take;
  const n = Math.max(1, o.level || lane.pending || 1);
  const cfg = e.blockCfg ?? DEFAULT_BLOCK_CONFIG;
  const mode = blockModeOf(o);
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

function recordBlockClose(e: VstEngine, p: LivePosition, ratio: number) {
  const modes = liveVolumeModes(e.blockCfg);
  const frac = Number.isFinite(ratio) ? ratio : 0;
  const keep = (e.blockCfg ?? DEFAULT_BLOCK_CONFIG).keepAdjusted === true;
  for (const mode of modes) {
  const k = blockLaneKey(p.symbol, p.side, mode);
  const lane = e.blockLanes?.[k];
  if (!lane) continue;
  const hitNs = new Set<number>();
  for (const [key, ok] of Object.entries(lane.satisfied ?? {})) {
    if (ok) {
      const n = Math.max(1, Math.min(6, Number(key) || 0));
      if (n >= 1) hitNs.add(n);
    }
  }
  const lvl = Math.max(0, p.blockLevel || 0);
  if (lvl >= 1) {
    for (let n = 1; n <= Math.min(6, lvl); n++) hitNs.add(n);
  }
  if (!hitNs.size) hitNs.add(Math.max(1, lane.pending || 1));
  const need = Math.max(5, Math.min(75, 12));
  for (const n of hitNs) {
    (lane.pfRing[n] ??= []).push(frac);
    if (lane.pfRing[n]!.length > 75) lane.pfRing[n] = lane.pfRing[n]!.slice(-75);
    const ring = (lane.pfRing[n] ?? []).slice(-need);
    if (ring.length >= need) {
      const gp = ring.filter((x) => x > 0).reduce((s, x) => s + x, 0);
      const gl = Math.abs(ring.filter((x) => x < 0).reduce((s, x) => s + x, 0));
      const pf = profitFactor(gp, gl);
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
  }
}

function blockCountPositive(e: VstEngine, n: number, minPf: number) {
  if (n < 1 || n > 6) return false;
  if (internAllPhase(e)) return true;
  const w = e.blockWindows?.[n];
  const need = Math.max(8, n);
  if (!w || w.closed < need) return true;
  const floor = n <= 1 ? Math.max(1.15, Math.min(minPf || 1.2, 1.25)) : Math.min(minPf || 1.05, 1.2);
  return w.lastPf + 1e-9 >= floor;
}

function blockPfOk(lane: BlockLaneState, count: number, block: BlockConfig, minPf: number) {
  if ((lane.pauseRemaining[count] || 0) > 0) {
    lane.pauseRemaining[count] -= 1;
    return false;
  }
  if (minPf <= 0) return true;
  const need = Math.max(5, Math.min(24, 8));
  const ring = (lane.pfRing[count] ?? []).slice(-need);
  if (ring.length < need) return true;
  const gp = ring.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const gl = Math.abs(ring.filter((x) => x < 0).reduce((s, x) => s + x, 0));
  const pf = profitFactor(gp, gl);
  const vr = clampBlockVol(block.volumeRatio);
  const inc = vr * Math.max(1, count);
  const floor = Math.max(minPf, blockMinimumProfitFactor(minPf, block.pfRatio || 1.25, inc) || minPf);
  if (pf + 1e-9 < floor) {
    lane.heldFactor[count] = count;
    if (block.keepAdjusted) {
      // Hold existing extra through a loss window. Do NOT plan new Block adds on a losing PF.
      return false;
    }
    lane.pauseRemaining[count] = Math.max(0, Math.round((block.pauseCountRatio ?? 2) * count));
    if (lane.pauseRemaining[count] < 1) {
      lane.heldFactor[count] = 1;
      return true;
    }
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
    const k = `${o.symbol}:${o.side}:${blockModeOf(o)}`;
    const arr = map.get(k);
    if (arr) arr.push(o);
    else map.set(k, [o]);
  }
  return [...map.entries()].map(([k, orders]) => {
    const [symbol, side] = k.split(":") as [string, Side];
    return { id: k, symbol, side, orders, multiple: orders.length };
  });
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
  if (!toggles.block || block.enabled === false) return empty;
  if (!block.enabled) return empty;
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
    const bySym = new Map<string, { long?: (typeof blocks)[0]; short?: (typeof blocks)[0] }>();
    for (const b of blocks) {
      const row = bySym.get(b.symbol) ?? {};
      if (b.side === "long") row.long = b;
      else row.short = b;
      bySym.set(b.symbol, row);
    }
    for (const [sym, sides] of bySym) {
      if (!sides.long || !sides.short) continue;
      let longU = 0;
      let shortU = 0;
      for (const p of e.positions) {
        if (p.connId !== conn || p.symbol !== sym) continue;
        if (p.side === "long") longU += p.unrealized;
        else shortU += p.unrealized;
      }
      const victim = longU <= shortU ? sides.long : sides.short;
      for (const o of victim.orders) dropOrder(o);
      flattened += 1;
    }
    if (flattened) blocks = collectActiveOrderBlocks(e, conn);
  }

  for (const b of blocks) {
    if (b.multiple <= maxM) continue;
    for (const o of b.orders.slice(maxM)) dropOrder(o);
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

  // Last-N / relation PF / indication sets must be current before Overall Block sizes extra volume.
  if ((e.lastRelEvalTick || 0) !== e.tick && (e.progressEval?.at || 0) !== e.tick) {
    if (block.autoEval !== false && !(e.lastRelEvalTick)) evalBlockRelations(e, block);
    else refreshProgressEvals(e, block);
  }

  if (block.stack !== false && e.queue.filter((o) => o.connId === conn).length < maxQueue(e) - 2) {
    let adds = 0;
    const addCap = Math.min(
      maxQueue(e) - 8,
      Math.max(counts.length * volModes.length * Math.max(8, e.positions.length), 48),
    );
    for (const p of e.positions) {
      if (adds >= addCap) break;
      if (!ownedByDesk(p, conn)) continue;
      if (p.qty <= 0) continue;
      if (e.preEvalDone && !internAllPhase(e) && p.validExec !== true) continue;
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
      if ((e.cooldown[cooldownKey(conn, p.symbol)] ?? 0) > e.tick) continue;
      let usedQty = 0;
      for (const o of collectBlockOrders(e, conn)) {
        if (o.symbol === p.symbol && o.side === p.side) usedQty += Math.max(0, o.remaining || 0);
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
      let parentBase = Math.max(p.legs[0]?.qty || 0, 1e-12);
      const plannedCount = () => plannedRel.length + plannedOv.length;
      let relExtraAttached = false;
      for (const mode of volModes) {
        if (adds + plannedCount() >= addCap) break;
        const k = blockLaneKey(p.symbol, p.side, mode);
        const lane = e.blockLanes[k];
        if (!lane || !lane.active || lane.baseQty <= 0) continue;
        if (lane.baseQty > 0) parentBase = Math.min(parentBase, lane.baseQty);
        const liveBlock = collectBlockOrders(e, conn).filter((o) => o.symbol === p.symbol && o.side === p.side && blockModeOf(o) === mode);
        const liveRelLevels = new Set(liveBlock.filter((o) => !isOverallBlockOrder(o)).map((o) => Math.max(1, o.level || 1)));
        const scopes = overallVolumeModes(block).includes(mode) ? overallScopes(block) : [];
        const liveOvLevels: Record<OverallScope, Set<number>> = { book: new Set(), symbol: new Set(), dir: new Set() };
        const ovQty: Record<OverallScope, number> = { book: 0, symbol: 0, dir: 0 };
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
              });
        const extraOnce = Math.max(0, relVol) * lane.baseQty;
        const relPlannedAt = () => plannedRel.length;
        const plan = (kind: "relation" | "overall", next: number, vr: number, extraQty: number, scope: OverallScope = "book", relExtra = false) => {
          const overallKind = kind === "overall";
          const stepMode: "additive" | "shared" = overallKind && stackAdd ? "additive" : mode;
          const step = relExtra ? 0 : blockStepQty(lane.baseQty, next, vr, maxMul, 1, 0, stepMode);
          const qty = step + Math.max(0, extraQty);
          if (!(qty > 0)) return false;
          (overallKind ? plannedOv : plannedRel).push({ overallKind, next, qty, scope, mode, lane, relExtra });
          if (overallKind) {
            liveOvLevels[scope].add(next);
            ovQty[scope] += qty;
          } else if (!relExtra) {
            lane.pending = next;
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
          if (next < minM || next > maxM) continue;
          if (block.windows !== false && !blockCountPositive(e, next, minPf)) {
            /* relation still gated by book window; overall scopes use their own */
          }
          if (next < Math.max(1, Math.round(block.minActiveLevel || 1))) continue;
          const vrModeRel = mode === "shared" ? vrShared : vrRel;
          const relCap = lane.baseQty * (mode === "additive" ? Math.min(next * vrModeRel, extraCap) : blockMaxAdditionalRatio(next, vrModeRel, maxMul, mode));
          if (
            block.sets !== false &&
            !lane.satisfied[next] &&
            !liveRelLevels.has(next) &&
            lane.pending !== next &&
            relQty + 1e-12 < relCap &&
            blockPfOk(lane, next, block, minPf) &&
            (block.windows === false || blockCountPositive(e, next, minPf))
          ) {
            // Independent N step only. Winning-rel extra is applied once after all N=1–6.
            plan("relation", next, vrModeRel, 0);
          }
        }
        if (extraOnce > 0 && !relExtraAttached && plannedRel.length > nBefore) {
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
            for (const scope of scopes) {
              if (adds + plannedCount() >= addCap) break;
              if (!overallWindowOk(e, scope, p, next, minPf)) continue;
              if (liveOvLevels[scope].has(next)) continue;
              const vrThis = vrModeOv * ovVrScale;
              const ovCap = lane.baseQty * Math.min(next * vrThis, extraCap);
              if (ovQty[scope] + 1e-12 < ovCap) plan("overall", next, vrThis, 0, scope);
            }
          }
        }
      }
      const flushPlanned = (planned: typeof plannedRel) => {
        const capQty = parentBase * maxMul;
        const room = capQty - (parentBase + usedQty);
        if (!(room > 1e-12) || !planned.length) return;
        const raw = planned.reduce((s, x) => s + x.qty, 0);
        const scale = raw > room ? room / raw : 1;
        const hi = pickRange(q, cfg, rangeType);
        const sl0 = p.slDist > 1e-12 ? p.slDist : slDist(q.atr, hi.spacing, cfg.slAtr ?? SL_ATR_MULT, cfgUsesShortRange(cfg));
        const tp0 = p.tpDist > 1e-12 ? p.tpDist : tpDistFromSl(sl0, cfg.tpRatio, cfgUsesShortRange(cfg));
        const px = p.side === "long" ? Math.min(q.px, q.axis) : Math.max(q.px, q.axis);
        if (!(px > 0)) return;
        const lv = protectLevels(px, p.side, sl0, tp0, sl0 > 1e-12 ? tp0 / sl0 : 1, true);
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
                  : "Overall Block";
          const oid = nextId(e, item.overallKind ? (item.scope === "symbol" ? "obs" : item.scope === "dir" ? "obd" : "ob") : "b");
          e.queue.push({
            id: oid,
            connId: conn,
            symbol: p.symbol,
            side: p.side,
            type: e.orderType,
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
            tactic: p.tactic ?? tactic,
            indication: p.indication,
            kind: "block",
            playbook: "block",
            validExec: internAllPhase(e) ? false : p.validExec === true,
            tpAtr: p.tpAtr,
            slOfTp: p.slOfTp,
            trailPct: p.trailPct,
            note: `${tag} ${item.mode} #${item.next} ${p.symbol} ${p.side} · ${oid} · ${p.id} · ${conn}`,
          });
          countPlaced(e);
          usedQty += qty;
          added += 1;
          adds += 1;
          e.lastBlockAt = e.tick;
        }
      };
      // Sets / relation Block first, then Overall Block uses leftover room (additional, not share-scaled).
      flushPlanned(plannedRel);
      flushPlanned(plannedOv);
    }
  }

  const blockN = collectActiveOrderBlocks(e, conn).length;
  if (cancelled || added || flattened) {
    e.lastMsg = `Block adjust · ${blockN} blocks · −${cancelled} +${added} flatten ${flattened} · ${tactic}`;
    e.lastBlockAt = e.tick;
  }
  return { cancelled, added, flattened, blocks: blockN };
}

export function tickVst(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, opts?: { freezeIds?: Set<string>; skipWalk?: boolean; skipMatch?: boolean; bookOnly?: boolean; rangeType?: RangeType; symbolCount?: number; orderType?: OrderTypeId; block?: BlockConfig; endStage?: boolean }) {
  ensureEngine(e);
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
    if (e.completeSim && paperMode(e)) return false;
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
  const blockDue =
    Boolean(opts?.endStage) ||
    (block.enabled &&
      (block.endStageOnly ? e.tick >= endTick && e.tick % cadence === 0 : e.tick % cadence === 0));
  const iv = intervalCfg(e);
  const ivTicks = ticksPerIntervalOf(e);
  const evalEvery = (e.completeSim || e.liveTape) && iv.enabled && iv.evalOnCadence
    ? ivTicks
    : Math.max(ivTicks, Math.round((block.evalHours || 2) * TICKS_PER_HOUR));
  let progressed = false;
  const evalDue = e.tick > 0 && e.tick % evalEvery === 0;
  // Relation last-N / PF evals before Overall Block so extra volume uses current winners.
  if ((blockDue || evalDue) && !over()) {
    const needRelEval = block.autoEval !== false && block.enabled && (evalDue || !(e.lastRelEvalTick));
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
  if (blockDue && !over() && (!e.botMode || (e.x01Progress && e.activeConnId === "bingx-x01"))) {
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
  const armEvery = completeOpenTape(e) || performingLive(e) || (e.completeSim && paperMode(e)) ? 2 : e.completeSim ? 6 : tapeRed(e) ? 8 : 12;
  if (!opts?.skipWalk && e.tick % armEvery === 0 && (completeOpenTape(e) || performingLive(e))) recycleOpenLadders(e);
  const progressLane = e.x01Progress && e.activeConnId === "bingx-x01";
  const qn = e.queue.filter((o) => o.connId === e.activeConnId && !isBotPlay(o.playbook)).length;
  const qArm = e.completeSim ? Math.max(80, maxQueue(e) * 0.55) : Math.max(320, maxQueue(e) * 0.4);
  const workN = e.orders.filter((o) => o.connId === e.activeConnId && !isBotPlay(o.playbook) && (o.status === "open" || o.status === "partial")).length;
  const workArm = e.completeSim ? Math.floor(maxWorking(e) * 0.85) : maxWorking(e);
  if (
    !opts?.skipWalk &&
    (!e.botMode || progressLane) &&
    e.tick % armEvery === 0 &&
    !over() &&
    qn < qArm &&
    workN < workArm &&
    e.positions.filter((p) => p.connId === e.activeConnId && !isBotPlay(p.playbook)).length < maxPositions(e)
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

/** Drop paper legs that vanished on the live book (manual close / SL fill) so we keep arming. */
export function releaseVanished(e: VstEngine, occupied: Set<string>, connId?: string) {
  const conn = connId && isDeskConn(connId) ? connId : e.activeConnId;
  const keep = [];
  let n = 0;
  for (const p of e.positions) {
    if (!ownedByDesk(p, conn) || occupied.has(`${p.symbol}:${p.side}`)) {
      keep.push(p);
      continue;
    }
    cancelLane(e, p);
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick;
    n += 1;
  }
  if (n) {
    e.positions = keep;
    e.lastMsg = `Released ${n} vanished legs · keep processing`;
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
  if (e.positions.filter((p) => p.connId === input.connId).length >= maxPositions(e)) return `Position cap ${maxPositions(e)} reached on this session.`;
  const px = input.price ?? q.px;
  const hi = highestRange(q, DEFAULT_CFG);
  const sl0 = slDist(q.atr, hi.spacing, DEFAULT_CFG.slAtr ?? SL_ATR_MULT);
  const tp0 = tpDistFromSl(sl0, e.tpRatio);
  const lv = protectLevels(px, input.side, sl0, tp0, e.tpRatio);
  const qty = input.cost / px;
  e.queue.push({
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
  let negativePx = 0;
  let nanCount = 0;
  for (const q of Object.values(e.quotes)) {
    if (!Number.isFinite(q.px) || !Number.isFinite(q.hi) || !Number.isFinite(q.lo)) nanCount += 1;
    if (q.px <= 0 || q.lo <= 0) negativePx += 1;
  }
  for (const p of e.positions) {
    const slD = Math.abs(p.sl - p.avgEntry);
    const tpD = Math.abs(p.tp - p.avgEntry);
    const trailed = p.side === "long" ? p.sl >= p.avgEntry : p.sl <= p.avgEntry;
    const ratio = p.slOfTp != null && p.slOfTp > 0 ? Math.max(0.3, 1 / p.slOfTp) : snapTpRatio(e.tpRatio || TP_SL_RATIO);
    // Axis/hybrid may pull TP in to 0.95× risk. That is not a wider stop.
    const allow = tpD / ratio / 0.95 + Math.max(1e-6, tpD * 1e-4);
    if (!trailed && tpD > 0 && slD > allow) ratioViolations += 1;
    if (!Number.isFinite(p.avgEntry) || !Number.isFinite(p.unrealized)) nanCount += 1;
  }
  if (e.positions.length > maxPositions(e)) issues.push("Position cap exceeded");
  if (Object.keys(e.quotes).length > VST_MAX_SYMBOLS) issues.push("Symbol cap exceeded");
  for (const id of Object.keys(e.tokens)) if ((e.tokens[id] ?? 0) < -1e-6) issues.push(`Negative rate tokens on ${id}`);
  if (nanCount) issues.push(`${nanCount} NaN values`);
  if (negativePx) issues.push(`${negativePx} non-positive prices`);
  if (ratioViolations) issues.push(`${ratioViolations} SL/TP ratio violations`);
  const counted = bookCounts(e);
  const accounted = counted.orders.queued + counted.orders.open + counted.orders.partial + counted.orders.filled + counted.orders.cancelled + counted.orders.rejected;
  if (counted.orders.placed !== accounted) issues.push(`Order count mismatch placed ${counted.orders.placed} vs ${accounted}`);
  if (counted.positions.slots !== counted.positions.long + counted.positions.short) issues.push("Position slot long/short mismatch");
  return {
    ratioViolations,
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
  e.stats.net = 0;
  e.stats.pf = 0;
  e.stats.mdd = 0;
  e.stats.equity = base;
}

export function simulateHours(hours: number, cfg: TacticConfig = DEFAULT_CFG, tactic: TacticKind = 'hybrid', opts?: { symbolCount?: number; orderType?: OrderTypeId; rangeType?: RangeType; marks?: number[]; block?: BlockConfig; equity?: number; costStep?: number; complete?: boolean; comboOnly?: boolean; prehours?: number; minPf?: number; basePf?: number; blockPf?: number; shortPf?: number; shortBasePf?: number; shortBlockPf?: number; onHour?: (row: { h: number; eq: number; net: number; hourPf: number; pf: number; gatedN?: number; gatedPf?: number; trades?: number; mdd?: number; avgPos?: number; avgOrd?: number; pos?: number; orders?: number }) => void }) {
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
    : complete && hours >= 12 ? SHORT_EVAL_HOURS : 0;
  const preTicks = prehours * TICKS_PER_HOUR;
  const totalTicks = preTicks + ticks;
  const engine = initVstEngine(use, {
    warmup: 0,
    symbolCount: opts?.symbolCount,
    orderType: opts?.orderType,
    block: opts?.block,
    equity: startEq,
    costStep,
    complete,
    comboOnly,
    arm: complete ? false : undefined,
  });
  engine.completeSim = complete;
  engine.openCompleteTape = complete && preTicks <= 0;
  engine.preEvalDone = preTicks <= 0;
  engine.shortRange = Boolean(use.shortRange);
  engine.shortComboOnly = Boolean(comboOnly);
  // Arm only after the tape mode is set. Otherwise the first queue is intern/hybrid
  // and those orders fill as paper on the open book.
  if (complete) armUniverse(engine, use, tactic, rangeType);
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
  engine.lastNProgress = sanitizeLastNProgress(opts?.block?.lastNProgress ?? engine.lastNProgress);
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
  const hourIndAcc = accMap();
  const hourPlayAcc = accMap();
  const hourPlayIndAcc = accMap();
  const hourKindAcc = accMap();
  const hourTacAcc = accMap();
  let hourGatedN = 0;
  let hourGatedP = 0;
  let hourGatedL = 0;
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
  const bumpClose = (t: { pnl?: number; ratio?: number; indication?: string; tactic?: string; playbook?: string; kind?: string; qty?: number; blockQty?: number }) => {
    const pnl = edgePnl(t);
    const ind = String(t.indication || "trend");
    bump(indAcc, ind, pnl);
    bump(tacAcc, String(t.tactic || tactic), pnl);
    bump(kindAcc, String(t.kind || "normal"), pnl);
    bump(hourIndAcc, ind, pnl);
    bump(hourKindAcc, String(t.kind || "normal"), pnl);
    bump(hourTacAcc, String(t.tactic || tactic), pnl);
    const qty = Math.max(0, Number(t.qty) || 0);
    const bq = Math.min(qty, Math.max(0, Number(t.blockQty) || 0));
    const blockShare = qty > 1e-12 && bq > 1e-12 ? Math.min(1, bq / qty) : t.playbook === "block" ? 1 : 0;
    const origin = String(t.playbook || "normal");
    const split = (play: string, share: number) => {
      if (Math.abs(share) < 1e-15) return;
      bump(playAcc, play, share);
      bump(playIndAcc, `${play}:${ind}`, share);
      bump(hourPlayAcc, play, share);
      bump(hourPlayIndAcc, `${play}:${ind}`, share);
    };
    if (blockShare > 0 && origin !== "block") {
      split(origin, pnl * (1 - blockShare));
      split("block", pnl * blockShare);
    } else {
      split(origin, pnl);
    }
  };
  const finish = (map: ReturnType<typeof accMap>) =>
    [...map.values()]
      .map((r) => ({ ...r, pf: profitFactor(r.profit, r.loss), wr: r.n ? r.wins / r.n : 0 }))
      .sort((a, b) => b.n - a.n);
  const clearAcc = (map: ReturnType<typeof accMap>) => map.clear();
  let internStage: import("./types.ts").SimStageTape = { n: 0, pf: 0, net: 0, wr: 0 };
  let afterEvalStage: import("./types.ts").SimStageTape = { n: 0, pf: 0, net: 0, wr: 0 };
  let afterTypesStage: import("./types.ts").SimStageTape = { n: 0, pf: 0, net: 0, wr: 0 };
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
  let gatedLiveP = 0;
  let gatedLiveL = 0;
  let gatedLiveN = 0;
  for (let i = 0; i < totalTicks; i++) {
    tickVst(engine, use, tactic, {
      rangeType,
      symbolCount: opts?.symbolCount,
      orderType: opts?.orderType,
      block: opts?.block,
    });
    if (preTicks > 0 && i + 1 === preTicks) {
      engine.preEvalDone = true;
      const blk = opts?.block ?? engine.blockCfg ?? DEFAULT_BLOCK_CONFIG;
      evalBlockRelations(engine, blk);
      flattenNonPerforming(engine);
      refreshProgressEvals(engine, blk);
      refreshLiveDisable(engine, blk);
      internStage = {
        n: engine.ledger.trades,
        pf: engine.stats.pf,
        net: engine.stats.net,
        wr: engine.stats.wr,
        orders: engine.ledger.ordersPlaced,
        fills: engine.ledger.ordersFilled,
        equity: engine.stats.equity,
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
      const pe1 = engine.progressEval;
      afterTypesStage = {
        n: frozen?.n || provenSt.n,
        pf: frozen?.n ? frozen.pf : provenSt.pf,
        net: frozen?.n ? frozen.net : provenSt.net,
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
      seenClosed = engine.ledger.trades;
      prevSl = engine.ledger.slExits;
      prevTp = engine.ledger.tpExits;
      prevWins = engine.ledger.wins;
      prevPlaced = engine.ledger.ordersPlaced;
      prevFilled = engine.ledger.ordersFilled;
    }
    const inLive = i >= preTicks;
    if (engine.ledger.trades > seenClosed) {
      const fresh = tickCloses(engine);
      const added = engine.ledger.trades - seenClosed;
      if (fresh.length < added) missedCloses += added - fresh.length;
      for (const t of fresh) {
        if (!inLive) continue;
        const edge = edgePnl(t);
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
          continue;
        }
        if (t.validExec !== true) {
          hourPaperN += 1;
          if (edge > 0) hourPaperP += edge;
          else hourPaperL += Math.abs(edge);
          continue;
        }
        rSum += t.r;
        rN += 1;
        const slot = rSlots.find((b) => t.r >= b.lo && t.r < b.hi) ?? rSlots[rSlots.length - 1];
        slot.n += 1;
        bumpClose(t);
        hourGatedN += 1;
        if (t.pnl > 0) hourGatedP += t.pnl;
        else hourGatedL += Math.abs(t.pnl);
      }
      seenClosed = engine.ledger.trades;
    }
    const eq = engine.stats.equity;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? Math.max(0, (peak - eq) / peak) : 0;
    if (!inLive) continue;
    if (eq > livePeak) livePeak = eq;
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
      gatedLiveP += hourGatedP;
      gatedLiveL += hourGatedL;
      gatedLiveN += hourGatedN;
      liveRatioP += hourRatioP;
      liveRatioL += hourRatioL;
      const realized = hp - hl;
      const hourMtm = engine.stats.net - prevNet;
      prevNet = engine.stats.net;
      const hourProfitNow = hourRatioP;
      const hourLossNow = hourRatioL;
      const hourPf = profitFactor(hourProfitNow, hourLossNow);
      const gatedHourNet = hourGatedP - hourGatedL;
      const livePf = profitFactor(liveRatioP, liveRatioL);
      const book = bookCounts(engine);
      const hourIndSnap = finish(hourIndAcc);
      const hourPlaySnap = finish(hourPlayAcc);
      const hourPlayIndSnap = finish(hourPlayIndAcc);
      const hourKindSnap = finish(hourKindAcc);
      const hourTacSnap = finish(hourTacAcc);
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
        net: complete ? gatedHourNet : realized,
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
        mdd: livePeak > 0 ? Math.max(0, (livePeak - eq) / livePeak) : 0,
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
        netCum: complete ? gatedLiveP - gatedLiveL : liveProfit - liveLoss,
        vol: engine.relVolumeFactor ?? 0,
        notional: hourNotional,
        avgNotional: avgNotionalH,
        margin: hourMargin,
        avgMargin: avgMarginH,
        marginPct: eq > 0 ? hourMargin / eq : 0,
        eqUsePct: eq > 0 ? avgMarginH / eq : 0,
        blockOrd: hourBlock,
        gatedN: hourGatedN,
        gatedPf: profitFactor(hourRatioP, hourRatioL),
        gatedNet: hourGatedP - hourGatedL,
        paperN: hourPaperN,
        paperPf: hourPaperN ? profitFactor(hourPaperP, hourPaperL) : 0,
        paperNet: hourPaperN ? hourPaperP - hourPaperL : 0,
        inds: Object.fromEntries(hourIndSnap.map((r) => [r.id, { n: r.n, pf: r.pf, wr: r.wr, net: r.profit - r.loss, profit: r.profit, loss: r.loss }])),
        plays: Object.fromEntries(hourPlaySnap.map((r) => [r.id, { n: r.n, pf: r.pf, net: r.profit - r.loss, profit: r.profit, loss: r.loss }])),
        playInds: Object.fromEntries(hourPlayIndSnap.map((r) => [r.id, { n: r.n, pf: r.pf, net: r.profit - r.loss, profit: r.profit, loss: r.loss }])),
        kinds: Object.fromEntries(hourKindSnap.map((r) => [r.id, { n: r.n, pf: r.pf }])),
        tacs: Object.fromEntries(hourTacSnap.map((r) => [r.id, { n: r.n, pf: r.pf, wr: r.wr, net: r.profit - r.loss }])),
      };
      hourly.push(hourRow);
      opts?.onHour?.(hourRow);
      clearAcc(hourIndAcc);
      clearAcc(hourPlayAcc);
      clearAcc(hourPlayIndAcc);
      clearAcc(hourKindAcc);
      clearAcc(hourTacAcc);
      hourGatedN = 0;
      hourGatedP = 0;
      hourGatedL = 0;
      hourRatioP = 0;
      hourRatioL = 0;
      hourPaperN = 0;
      hourPaperP = 0;
      hourPaperL = 0;
      hourPosAcc = 0;
      hourOrdAcc = 0;
      hourMarginAcc = 0;
      hourNotionalAcc = 0;
      hourTickN = 0;
      if (markAt.has(h)) marks.push(horizonFromEngine(engine, h, peak));
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
        mdd: livePeak > 0 ? Math.max(0, (livePeak - eq) / livePeak) : 0,
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
  const ratioPf = ratioProfitFactor(engine.ledger.ratioProfit || 0, engine.ledger.ratioLoss || 0, engine.ledger.ratioWins || 0);
  const livePf = (engine.ledger.ratioProfit || 0) + (engine.ledger.ratioLoss || 0) > 0 ? ratioPf : profitFactor(liveProfit, liveLoss);
  const liveWr = liveTrades ? liveWinsCount / liveTrades : 0;
  const liveMdd = livePeak > 0 ? Math.max(0, (livePeak - engine.stats.equity) / livePeak) : 0;
  if ((prehours > 0 ? liveTrades : tradesAll) < 1) issues.push("No closed trades");
  if (hours >= 8) {
    if ((prehours > 0 ? liveSl : engine.ledger.slExits) < 1) issues.push("No stop-loss exits");
    if ((prehours > 0 ? liveTp : engine.ledger.tpExits) < 1) issues.push("No take-profit exits");
  }
  const trades = prehours > 0 ? liveTrades : tradesAll;
  const wins = prehours > 0 ? liveWinsCount : winsAll;
  const liveProfitRep = prehours > 0 ? liveProfit : profit;
  const liveLossRep = prehours > 0 ? liveLoss : loss;
  const bySymbol = Object.values(engine.symbolStats).map((s) => ({
    id: s.id,
    trades: s.trades,
    net: s.profit - s.loss,
    wr: s.trades ? s.wins / s.trades : 0,
    pf: profitFactor(s.profit, s.loss),
    sl: s.sl,
    tp: s.tp
  })).sort((a, b) => b.net - a.net);
  const byIndication = finish(indAcc);
  const byTactic = finish(tacAcc);
  const byPlaybook = finish(playAcc);
  const byPlayInd = finish(playIndAcc);
  const byKind = finish(kindAcc);
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
  const liveTapeRows = deskClosed.filter((c) => (c.tick || 0) > preTicks);
  const gatedRows = liveTapeRows.filter((c) => c.validExec === true);
  const typeBlend = frozenTypeBlend(engine);
  const typeFloor = typeBlend && typeBlend.n >= 4 ? typeBlend.pf : 1;
  const keptGate = gatedRows.filter((c) => {
    if (c.protect || c.tpAtr == null || c.slOfTp == null) return false;
    const key = shortComboKey(c.tpAtr, c.slOfTp);
    const liveSt = comboTapeStats(engine.shortComboLiveTape?.[key]);
    if (liveSt.n >= 8) return liveSt.pf > typeFloor + 1e-9 && liveSt.net > 0;
    const preSt = comboTapeStats(engine.shortComboPreTape?.[key]);
    return preSt.n >= 4 && preSt.pf > typeFloor + 1e-9 && preSt.net > 0;
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
  const gatedPf = liveGated.n >= 4 ? liveGated.pf : 0;
  const gatedNetVal = liveGated.net;
  const paperPf = prehours > 0 ? livePf : engine.stats.pf;
  const selectedPositive = selected.n >= 4 && selected.pf + 1e-9 >= GATED_MIN_PF && selected.net >= 0;
  const gatedPositive = liveGated.n >= 4 && gatedPf + 1e-9 >= GATED_MIN_PF && gatedNetVal >= 0;
  const proc = engine.progressEval?.lastNModes;
  const procMode = engine.progressEval?.lastNMode ?? ln.mode;
  const overallProc = engine.progressEval?.lastNOverall;
  const procRow = overallProc?.pass
    ? overallProc
    : procMode === "combined"
      ? proc?.combined
      : procMode === "majority"
        ? proc?.majority
        : proc?.independent;
  const procPf = Number(procRow?.gatedPf ?? procRow?.pf) || 0;
  const procN = Number(procRow?.gatedN ?? procRow?.n) || 0;
  const procNet = Number(procRow?.net) || 0;
  const procPositive = Boolean(procRow?.pass) && procN >= 4 && procPf + 1e-9 >= GATED_MIN_PF && procNet >= -1e-12;
  const reportPf = prehours > 0 && liveGated.n >= 4
    ? liveGated.pf
    : engine.shortComboOnly
    ? paperPf
    : complete && ((engine.ledger.ratioProfit || 0) + (engine.ledger.ratioLoss || 0) > 0)
      ? paperPf
      : selectedPositive
      ? selected.pf
      : procPositive
        ? procPf
        : gatedPositive
          ? gatedPf
          : afterTypesStage.n >= 4 && afterTypesStage.pf + 1e-9 >= GATED_MIN_PF && afterTypesStage.net > 0
            ? afterTypesStage.pf
            : 0;
  const floors = {
    overall: minPfFor(engine, "overall"),
    base: minPfFor(engine, engine.shortRange ? "shortBase" : "base"),
    short: minPfFor(engine, "short"),
    block: minPfFor(engine, "block"),
    axis: minPfFor(engine, "axis"),
  };
  const reportWr = prehours > 0 ? liveWr : engine.stats.wr;
  const gatedRealized = gatedLiveP - gatedLiveL;
  const closedNet = prehours > 0 ? (complete ? gatedRealized : liveRealized) : profit - loss;
  const reportNet = engine.shortComboOnly
    ? closedNet
    : selectedPositive
      ? selected.net
      : prehours > 0
        ? closedNet + engine.positions.reduce((s, p) => s + (p.unrealized || 0), 0)
        : engine.stats.net;
  const reportMdd = prehours > 0 ? liveMdd : engine.stats.mdd;
  const report = {
    hours,
    ticks,
    symbols: engine.symbolCount,
    trades,
    wins,
    wr: reportWr,
    pf: reportPf,
    net: reportNet,
    mdd: reportMdd,
    equity: engine.stats.equity,
    slExits: prehours > 0 ? liveSl : engine.ledger.slExits,
    tpExits: prehours > 0 ? liveTp : engine.ledger.tpExits,
    openPositions: engine.positions.length,
    openOrders: engine.stats.openOrders,
    maxPositionsSeen: engine.ledger.maxPositions,
    maxOrdersSeen: engine.ledger.maxOrders,
    capRejects: engine.ledger.capRejects,
    rateSkips: engine.ledger.rateSkips,
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
    maxWinStreak: engine.ledger.maxWinStreak,
    maxLossStreak: engine.ledger.maxLossStreak,
    bySymbol,
    byIndication,
    byTactic,
    byPlaybook,
    byPlayInd,
    byKind,
    ordersPlaced: engine.ledger.ordersPlaced,
    ordersFilled: engine.ledger.ordersFilled,
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
    realizedNet: prehours > 0 ? (complete ? gatedRealized : liveRealized) : profit - loss,
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
      stats.hours[String(h)] = { ...b, symbols, orders: take.length, avgOrders: take.length };
    }
  }
  if (stats.intervals) {
    for (const m of LIVE_INTERVAL_MINS) {
      const since = now - m * 60_000;
      const take = newest.filter((r) => Number(r.t) >= since);
      const b = pnlBucket(asRows(take), `${m}m`);
      const symbols = new Set(take.map((r) => String(r.symbol || "")).filter(Boolean)).size;
      stats.intervals[String(m)] = { ...b, symbols, orders: take.length, avgOrders: take.length };
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
  stats.byIndication = overlayNamed(stats.byIndication, SHORT_PROGRESS_INDICATIONS, (t) => t.indication);
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
  const lived = Math.max(e.tick, 1);
  const windowTicks = Math.min(hours * TICKS_PER_HOUR, lived);
  const frac = windowTicks / lived;
  const orders = Math.round((e.ledger.ordersFilled || e.ledger.ordersPlaced || rows.length) * frac);
  const liveOrd = e.orders.filter((o) => ownedByDesk(o, conn) && (o.status === "open" || o.status === "partial")).length;
  const avgOrders = (liveOrd + (e.ledger.maxOrders || liveOrd)) / 2;
  return {
    ...base,
    symbols,
    orders,
    avgOrders: Number.isFinite(avgOrders) ? avgOrders : liveOrd,
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
  return { ...base, symbols, orders: rows.length, avgOrders: rows.length };
}

type SeedableStats = {
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
  const byIndication = SHORT_PROGRESS_INDICATIONS.map((k) =>
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
    ids: blockLive.map((o) => o.id),
    volume: blockVol,
    queued: e.queue.filter((o) => isBlockOrder(o) && ownedByDesk(o, conn)).length,
    overall: e.blockCfg?.overall !== false,
  };
  const activePos =
    (e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES).normal === false
      ? deskPos.filter((p) => (p.kind ?? "") !== "normal")
      : deskPos;
  const stats = {
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
    avgOrders: working,
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
  if (opts?.seed !== false) seedStatsFromComplete(stats, e);
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
  const winner = (e as { completeWinner?: { pf: number } }).completeWinner;
  if (winner && Number(winner.pf) > 0 && !(stats.trades > 0)) stats.avgConfigPf = Number(winner.pf);
  else if (typeof stats.pf === "number" && stats.trades > 0) stats.avgConfigPf = stats.pf;
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
  seedStatsFromComplete(stats, e);
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
  symbolCount: number;
  cells: CompleteCell[];
  byHours: Record<string, { winner: CompleteCell | null; ok: number; n: number; avgPf: number }>;
  winner: CompleteCell | null;
  playbooks: ReturnType<typeof sweepPlaybooks>;
  indications: OverallBucket[];
  kinds: OverallBucket[];
  elapsedMs: number;
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
): CompleteCell[] {
  const need = Math.max(...hours, hours.some((h) => h < 8) ? 16 : 0);
  const { engine, report } = simulateHours(need, cfg, tactic, { symbolCount, rangeType: range });
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

function foldComplete(cells: CompleteCell[], hours: number[], playbooks: ReturnType<typeof sweepPlaybooks>, t0: number, symbolCount: number, hint?: { indications: OverallBucket[]; kinds: OverallBucket[] }): CompleteComputeReport {
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
  opts?: { symbolCount?: number; hours?: number[]; shorts?: boolean; prehours?: number },
): CompleteComputeReport {
  const hours = (opts?.hours ?? [...STAGE_HOURS]).map((n) => Math.max(1, Math.round(n)));
  const symbolCount = opts?.symbolCount ?? 8;
  const t0 = Date.now();
  const cells: CompleteCell[] = [];
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      cells.push(...completeCellsForPair(cfg, tactic, range, hours, symbolCount));
    }
  }
  if (opts?.shorts) {
    const h = hours[0] ?? 4;
    const run = evaluateShortCombosIndependent({
      hours: h,
      prehours: opts.prehours ?? 0,
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
  return foldComplete(cells, hours, playbooks, t0, symbolCount);
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
  },
): Promise<CompleteComputeReport> {
  const hours = (opts?.hours ?? [...STAGE_HOURS]).map((n) => Math.max(1, Math.round(n)));
  const symbolCount = opts?.symbolCount ?? 8;
  const yieldFn = opts?.yieldFn ?? (() => new Promise<void>((r) => setImmediate(r)));
  const t0 = Date.now();
  const cells: CompleteCell[] = [];
  const combos = opts?.protect === false ? [] : allTpSlCombos();
  const shorts = opts?.protect === false ? [] : allShortTpSlCombos();
  const shortTactics: TacticKind[] = ["trailing"];
  const shortHours = [4];
  const total =
    LIVE_TACTICS.length * RANGE_TYPES.length * hours.length + combos.length * LIVE_TACTICS.length + shorts.length * shortTactics.length * shortHours.length;
  let i = 0;
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      const batch = completeCellsForPair(cfg, tactic, range, hours, symbolCount);
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
      const batch = completeCellsForPair(cfg2, tactic, "atr", [4], Math.min(8, symbolCount));
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
      const { report } = simulateHours(4, cfg2, tactic, {
        symbolCount: Math.min(8, symbolCount),
        rangeType: "atr",
        complete: false,
        prehours: 4,
      });
      cells.push({
        tactic,
        range: "atr",
        hours: 4,
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
  const playbooks = sweepPlaybooks(hours.includes(8) ? 8 : hours[hours.length - 1]!, symbolCount, cfg);
  await yieldFn();
  return foldComplete(cells, hours, playbooks, t0, symbolCount);
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
  rel: {
    symbol: string;
    side: Side;
    indication?: IndicationId;
    kind?: string;
    tactic?: TacticKind;
    rangeType?: RangeType;
    playbook?: string;
  },
) {
  const best = e.blockRelBest ?? {};
  if (!Object.keys(best).length) return [];
  const keys = blockRelationKeys({
    symbol: rel.symbol,
    side: rel.side,
    indication: rel.indication,
    kind: rel.kind as StrategyKind | undefined,
    tactic: rel.tactic,
    rangeType: rel.rangeType,
    playbook: rel.playbook,
  });
  const out: { key: string; n: number; pf: number; net: number; vol: number; major: boolean }[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const p = best[k];
    if (!p || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push(p);
  }
  return out;
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
  const key = laneDecKey(rel);
  const cached = bag.map.get(key);
  if (cached) return cached;
  const cfg = lastNProgressOf(e);
  const need = lastNMaxOf(cfg);
  const rows = laneClosed(e, rel, need);
  const minPf = entryMinPfFor(e, rel);
  const basePf = minPfFor(e, rel.kind === "short" || rel.playbook === "short" ? "shortBase" : "base");
  const d = decideLastN(rows, cfg, minPf, basePf);
  bag.map.set(key, d);
  return d;
}

export function lanePassExec(
  e: VstEngine,
  rel: {
    symbol?: string;
    side?: Side;
    indication?: IndicationId;
    kind?: string;
    tactic?: TacticKind;
    rangeType?: RangeType;
    playbook?: string;
    tpAtr?: number;
    slOfTp?: number;
  },
): boolean {
  if (internAllPhase(e) || completeOpenTape(e)) return true;
  // Independent combo tape: intern always processes this TP×SL; last-N is scored, not a self-kill.
  if (e.shortComboOnly && paperMode(e)) return true;
  if (liveRelationDisabled(e, rel as Parameters<typeof liveRelationDisabled>[1])) return false;
  if (rel.tpAtr != null && rel.slOfTp != null && isShortComboRel(e, rel)) {
    return shortComboProven(e, rel.tpAtr, rel.slOfTp);
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
  const coord = e.lastNCoord;
  if (coord) {
    const combo = coord.combos[relComboKey(rel, { tactic: e.lastTactic, range: e.lastRange })];
    if (combo && combo.n >= 4) return true;
  }
  const d = laneLastNDecision(e, rel);
  return d.validHits.some((h) => h.samples >= h.n);
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
  rel: {
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
  const t = e.strategyToggles ?? DEFAULT_STRATEGY_TOGGLES;
  const note = String(rel.note || "");
  const play = String(rel.playbook || "");
  const isDca = play === "dca" || rel.tactic === "dca" || /^DCA/i.test(note);
  if (isDca) return t.dca;
  const blockFill = play === "block" || /Block/i.test(note) || (rel.blockLevel ?? 0) >= 1;
  if (blockFill) {
    if (t.block === false) return false;
    const shortComboBlk = isShortComboRel(e, rel);
    if (shortComboBlk && e.preEvalDone && !(e.shortComboOnly && paperMode(e)) && !shortComboProven(e, rel.tpAtr!, rel.slOfTp!)) return false;
    return true;
  }
  const shortCombo = isShortComboRel(e, rel);
  const shortLane = rel.kind === "short" || play === "short" || /short/i.test(note) || Boolean(e.shortRange && shortCombo);
  if (shortCombo && !(e.shortComboOnly && paperMode(e))) {
    if (!shortComboProven(e, rel.tpAtr!, rel.slOfTp!)) return false;
    if (!(t.block || t.trailing || t.axis)) return false;
    return true;
  }
  if (!shortCombo && (e.preEvalDone || e.liveTape) && !prePassOk(e, rel)) return false;
  if ((e.preEvalDone || e.liveTape) && !lanePassExec(e, rel)) return false;
  if (shortCombo) {
    if (!(t.block || t.trailing || t.axis)) return false;
    return true;
  }
  const gated = Boolean(e.preEvalDone || e.liveTape);
  if (!blockFill && gated && laneExecProven(e, rel)) {
    if (rel.kind === "normal" || play === "normal") return t.normal;
    if (rel.kind === "short" || play === "short" || /short/i.test(note)) return Boolean(t.block || t.trailing || t.axis);
    if (play === "axis" || rel.tactic === "axis") return t.axis;
    if (rel.tactic === "trailing" || rel.tactic === "hybrid") return t.trailing !== false;
    return Boolean(t.trailing || t.axis || t.block);
  }
  if (rel.kind === "short" || play === "short" || /short/i.test(note)) {
    if (!(t.block || t.trailing || t.axis)) return false;
    if (t.block && e.blockCfg?.activeLive !== false && e.liveTape) {
      if (play === "block" || /Block/i.test(note) || (rel.blockLevel ?? 0) >= 1) return true;
      if (positionBlockAdjusted(e, rel.symbol, rel.side)) return true;
      if (winningRelLive(e, rel) && !liveRelationDisabled(e, rel)) return true;
      return true;
    }
    if (e.liveTape) {
      const take = laneClosed(e, { indication: rel.indication, kind: rel.kind, tactic: rel.tactic, playbook: play || "short" }, 40);
      if (take.length >= 8 && pfFromPnls(take) + 1e-9 < minPfFor(e, "shortBase")) return false;
    }
    return true;
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
    if (e.liveTape) {
      const take = laneClosed(e, { tactic: "axis", playbook: play || "axis" }, 40);
      if (take.length >= 8 && pfFromPnls(take) + 1e-9 < minPfFor(e, "axis")) return false;
    }
    return true;
  }
  if (rel.indication === "direction" && e.liveTape) {
    const take = laneClosed(e, { indication: "direction", kind: rel.kind, playbook: play }, 40);
    if (take.length >= 8 && pfFromPnls(take) + 1e-9 < minPfFor(e, e.shortRange ? "short" : "overall")) return false;
  }
  if (!t.trailing && (rel.tactic === "trailing" || rel.tactic === "hybrid")) return false;
  if (e.liveTape && (rel.tactic === "trailing" || rel.tactic === "hybrid")) {
    const take = laneClosed(e, { tactic: rel.tactic, indication: rel.indication, kind: rel.kind, playbook: play }, 40);
    if (take.length >= 8 && pfFromPnls(take) + 1e-9 < minPfFor(e, e.shortRange ? "short" : "overall")) return false;
  }
  if (rel.kind === "normal" || play === "normal") return t.normal;
  return t.normal;
}
