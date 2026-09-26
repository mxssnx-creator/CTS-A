import type {
  IndicationId,
  LastNCompleteScore,
  LastNOverallScore,
  StrategyToggles,
  VstEngine,
} from "./types.ts";
import {
  DEFAULT_LAST_N_PROGRESS,
  DEFAULT_STRATEGY_TOGGLES,
  POSITION_RT_COST_PCT,
  closePnl,
  dynamicMinRateDist,
  profitFactor,
  sanitizeStrategyToggles,
} from "./engine.ts";
import {
  EVAL_POS_NS,
  GATED_MIN_PF,
  LIVE_DISABLE_NS,
  VALID_EXEC_NS,
  completeLastNCorrectness,
  coverCatalogRows,
  foldLastNProcessings,
  hitsToProgressRows,
  lastNWindows,
} from "./last-n-progress.ts";
import { universeSymbols } from "./vst.ts";

export const BOT_TYPES = ["sandwich", "snap", "pulse", "ribbon", "sweep", "clamp", "magnet", "pivot"] as const;
export type BotTypeId = (typeof BOT_TYPES)[number];

/** Max types that process in parallel with independent tapes and results. */
export const BOT_PARALLEL_CAP = 3;

export const BOT_SELECT_MODES = ["vol1h", "range15", "atrRank", "volBurst", "sessionHeat"] as const;
export type BotSelectMode = (typeof BOT_SELECT_MODES)[number];

export const BOT_SYMBOL_COUNTS = [10, 20, 30, 40, 50] as const;
export type BotSymbolCount = (typeof BOT_SYMBOL_COUNTS)[number];

export const BOT_HOURS = [12, 24, 36, 48, 60, 72] as const;
export type BotHours = (typeof BOT_HOURS)[number];

export const BOT_TP_STEPS = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6] as const;
export const BOT_SL_STEPS = [0.4, 0.5, 0.6, 0.7, 0.8] as const;
export const BOT_TRAIL_STEPS = [0.2, 0.3, 0.4, 0.5, 0.6] as const;
export const BOT_VF_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** Lowest step. Live size is half of the old 1× book. */
export const BOT_DEFAULT_VOLUME_FACTOR = 1;

export const BOT_STRATEGY_KEYS = ["normal", "trailing", "axis", "block", "dca"] as const;
export type BotStrategyKey = (typeof BOT_STRATEGY_KEYS)[number];

export const LAST_POS_WINDOWS = [12, 25, 75] as const;
export const LAST_HOUR_WINDOWS = [2, 6, 20] as const;

export const VF_RECALC_RATIO = 0.6;
export const BARS_PER_HOUR = 60;
export const BOT_LIVE_MIN_TP = 0.48;
export const BOT_LIVE_MIN_SL_OF_TP = 0.75;
export const BOT_LIVE_TRAIL_PCT = 1.5;
export const BOT_MAX_HOLD = 24;
export const BOT_HOUR_SIZE_CUT = 0.45;
/** Desk 24h tape starts at $10 — never the $10k paper unit. */
export const BOT_START_EQUITY = 10;
/** Per-position notional as a fraction of equity. Halved from 0.40. Volume factor 1 is the default. */
export const BOT_NOTIONAL_PCT = 0.2;
export const BOT_MARGIN_LEV = 125;

/** Live notional. Default volume factor 1 is half the previous 1× cap, and never under the $2 minimum. */
export function botLiveNotional(equity: number, volumeFactor = BOT_DEFAULT_VOLUME_FACTOR): number {
  const vf = Math.max(BOT_DEFAULT_VOLUME_FACTOR, Number(volumeFactor) || BOT_DEFAULT_VOLUME_FACTOR);
  const scale = vf / 2;
  const eq = Number(equity) > 0 ? Number(equity) : 0;
  if (eq > 20) return Math.max(2, Math.min(8 * scale, eq * 0.15 * scale));
  const raw = (eq > 0 ? eq * 0.8 : 4) * scale;
  return Math.max(2, Math.min(4 * scale, raw));
}

export const BOT_TYPE_META: Record<BotTypeId, { label: string; blurb: string; thesis: string }> = {
  sandwich: {
    label: "Sandwich",
    blurb: "High-freq fade of 1H volatility stretch — front the snap, back at VWAP.",
    thesis: "Rank names by 1H realized vol, fade a 0.45%+ stretch from the 1H VWAP, sandwich TP / SL / trail around the mean. Skip one-way hours. Intern scores every overlay; live only after Active strategies and last-N 2+.",
  },
  snap: {
    label: "Snap",
    blurb: "VWAP rubber-band: RSI + band stretch, fade back to the mid.",
    thesis: "Skip one-way hours. RSI/band extreme plus a VWAP stretch, then turn. Fade back to VWAP with sandwich exits.",
  },
  pulse: {
    label: "Pulse",
    blurb: "Fade a 1H range-expansion spike, not the trend.",
    thesis: "Only when this hour’s range expands vs the prior hour. Fade the spike back to VWAP; skip one-way and chop.",
  },
  ribbon: {
    label: "Ribbon",
    blurb: "EMA21 mean fade on a 9/21/55 ribbon.",
    thesis: "Skip one-way hours. Fade a stretch from EMA21 once price turns. Session-heat ranking prefers active hours.",
  },
  sweep: {
    label: "Sweep",
    blurb: "Liquidity-sweep fade: wick beyond 1H extreme, reclaim, fade.",
    thesis: "Skip one-way hours. Stop-run wick that closes back inside, or VWAP stretch with a turn. Sandwich exits.",
  },
  clamp: {
    label: "Clamp",
    blurb: "Hour-open clamp: fade the open drive back to the 1H open.",
    thesis: "Rank by 1H vol, skip one-way hours, fade a stretch from the hour open once price turns. Independent tape from Sandwich (VWAP) — same exits, own last-N.",
  },
  magnet: {
    label: "Magnet",
    blurb: "Prior-hour VWAP magnet fade.",
    thesis: "Previous hour’s VWAP is the magnet. Fade stretch from that print in the first half of the new hour. Skip one-way. Own tape, own results.",
  },
  pivot: {
    label: "Pivot",
    blurb: "Prior-hour typical-price pivot fade.",
    thesis: "Fade stretch from last hour’s typical price (H+L+C)/3. Same skip-one-way and turn filter. Independent process from Clamp and Magnet.",
  },
};

export const BOT_SELECT_META: Record<BotSelectMode, { label: string; blurb: string }> = {
  vol1h: { label: "1H Volatility", blurb: "Rank by 1H realized volatility (default)." },
  range15: { label: "15m Range", blurb: "Rank by last 15-minute high–low." },
  atrRank: { label: "ATR Rank", blurb: "Rank by 1H ATR." },
  volBurst: { label: "Volume Burst", blurb: "Rank by 1H volume vs its mean." },
  sessionHeat: { label: "Session Heat", blurb: "Rank by hour-of-day activity × vol." },
};

export interface BotConfig {
  type: BotTypeId;
  symbolCount: BotSymbolCount;
  selectMode: BotSelectMode;
  /** Take-profit percent of market (0.2–1.6). */
  minTp: number;
  /** Stop-loss percent of market price (0.4–0.8). */
  minSl: number;
  /** Trailing-stop distance percent; becomes active once MFE ≥ this. */
  minTrail: number;
  /** Size multiple 1–10. Recalc when equity rises 60%. */
  volumeFactor: number;
  strategies: StrategyToggles;
  hours: BotHours;
}

export interface BotFill {
  id: string;
  symbol: string;
  side: 1 | -1;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  cost: number;
  barIn: number;
  barOut: number;
  hour: number;
  strategy: BotStrategyKey;
  live: boolean;
  hold: number;
}

export interface BotWindowStats {
  n: number;
  pf: number;
  net: number;
  wr: number;
  ddt: number;
  mdd: number;
  profit: number;
  loss: number;
}

export interface BotHourRow {
  hour: number;
  n: number;
  pf: number;
  net: number;
  wr: number;
  ddt: number;
  mdd: number;
  orders: number;
  skipped: number;
  green: boolean;
  empty: boolean;
  eq: number;
  margin: number;
  eqUse: number;
}

export interface BotStrategyScore {
  key: BotStrategyKey;
  active: boolean;
  intern: BotWindowStats;
  live: BotWindowStats | null;
  hours: { hour: number; n: number; net: number; pf: number; green: boolean }[];
}

export interface BotReport {
  type: BotTypeId;
  cfg: BotConfig;
  hours: number;
  symbolCount: number;
  equity: number[];
  hourly: BotHourRow[];
  fills: BotFill[];
  liveFills: BotFill[];
  internFills: BotFill[];
  stats: BotWindowStats;
  liveStats: BotWindowStats;
  lastPos: Record<string, BotWindowStats>;
  lastHours: Record<string, BotWindowStats>;
  strategies: Record<BotStrategyKey, BotStrategyScore>;
  indication: { id: IndicationId; hours: { hour: number; n: number; net: number; pf: number; green: boolean }[] };
  overall: LastNOverallScore;
  complete: LastNCompleteScore;
  vfNow: number;
  vfRecalcs: number;
  orders: number;
  liveOrders: number;
  activity: number;
  skipRate: number;
  gatedFailClosed: boolean;
  hourSuccess: number;
  hourActive: number;
  maxDdt: number;
  seed: number;
  elapsedMs: number;
}

export interface BotsPersist {
  selected: BotTypeId;
  /** Up to 3 types armed for independent parallel processing. */
  armed: BotTypeId[];
  hours: BotHours;
  configs: Record<BotTypeId, BotConfig>;
}

function snapTo(grid: readonly number[], n: number): number {
  let best = grid[0] ?? n;
  let dist = Infinity;
  for (const g of grid) {
    const d = Math.abs(g - n);
    if (d < dist) {
      dist = d;
      best = g;
    }
  }
  return best;
}

function asNum(n: unknown, fb: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fb;
}

export function defaultBotConfig(type: BotTypeId = "sandwich"): BotConfig {
  const base: BotConfig = {
    type,
    symbolCount: 10,
    selectMode: "vol1h",
    minTp: 0.4,
    minSl: 0.4,
    minTrail: 0.3,
    volumeFactor: BOT_DEFAULT_VOLUME_FACTOR,
    strategies: { normal: true, trailing: true, axis: true, block: true, dca: true },
    hours: 12,
  };
  if (type === "snap") return { ...base, type, selectMode: "vol1h" };
  if (type === "pulse") return { ...base, type, minTp: 0.6, minTrail: 0.3, selectMode: "atrRank" };
  if (type === "ribbon") return { ...base, type, selectMode: "sessionHeat" };
  if (type === "sweep") return { ...base, type, minTrail: 0.2, selectMode: "range15" };
  if (type === "clamp") return { ...base, type, selectMode: "vol1h" };
  if (type === "magnet") return { ...base, type, selectMode: "atrRank" };
  if (type === "pivot") return { ...base, type, selectMode: "range15" };
  return base;
}

export function defaultBotsPersist(): BotsPersist {
  const configs = {} as Record<BotTypeId, BotConfig>;
  for (const t of BOT_TYPES) configs[t] = defaultBotConfig(t);
  return { selected: "sandwich", armed: ["sandwich", "clamp", "pivot"], hours: 24, configs };
}

export function sanitizeArmed(raw: unknown, fallback: readonly BotTypeId[] = ["sandwich"]): BotTypeId[] {
  const src = Array.isArray(raw) ? raw : fallback;
  const out: BotTypeId[] = [];
  for (const item of src) {
    if (!BOT_TYPES.includes(item as BotTypeId)) continue;
    const t = item as BotTypeId;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= BOT_PARALLEL_CAP) break;
  }
  if (!out.length) out.push(fallback[0] && BOT_TYPES.includes(fallback[0]) ? fallback[0] : "sandwich");
  return out;
}

export function sanitizeBotConfig(raw: Partial<BotConfig> | null | undefined, fallback: BotTypeId = "sandwich"): BotConfig {
  const d = defaultBotConfig(fallback);
  if (!raw || typeof raw !== "object") return d;
  const type: BotTypeId = BOT_TYPES.includes(raw.type as BotTypeId) ? (raw.type as BotTypeId) : d.type;
  const dd = defaultBotConfig(type);
  const count = snapTo(BOT_SYMBOL_COUNTS, Math.round(asNum(raw.symbolCount, dd.symbolCount))) as BotSymbolCount;
  return {
    type,
    symbolCount: BOT_SYMBOL_COUNTS.includes(count) ? count : dd.symbolCount,
    selectMode: BOT_SELECT_MODES.includes(raw.selectMode as BotSelectMode) ? (raw.selectMode as BotSelectMode) : dd.selectMode,
    minTp: snapTo(BOT_TP_STEPS, asNum(raw.minTp, dd.minTp)),
    minSl: snapTo(BOT_SL_STEPS, asNum(raw.minSl, dd.minSl)),
    minTrail: snapTo(BOT_TRAIL_STEPS, asNum(raw.minTrail, dd.minTrail)),
    volumeFactor: snapTo(BOT_VF_STEPS, Math.round(asNum(raw.volumeFactor, BOT_DEFAULT_VOLUME_FACTOR))),
    strategies: sanitizeStrategyToggles(raw.strategies),
    hours: snapTo(BOT_HOURS, Math.round(asNum(raw.hours, dd.hours))) as BotHours,
  };
}

export function sanitizeBotsPersist(raw: Partial<BotsPersist> | null | undefined): BotsPersist {
  const d = defaultBotsPersist();
  if (!raw || typeof raw !== "object") return d;
  const selected: BotTypeId = BOT_TYPES.includes(raw.selected as BotTypeId) ? (raw.selected as BotTypeId) : d.selected;
  const hours = snapTo(BOT_HOURS, Math.round(asNum(raw.hours, d.hours))) as BotHours;
  const configs = {} as Record<BotTypeId, BotConfig>;
  for (const t of BOT_TYPES) {
    const src = raw.configs?.[t] ?? (raw.selected === t ? (raw as unknown as BotConfig) : undefined);
    configs[t] = sanitizeBotConfig({ ...(src ?? d.configs[t]), type: t, hours: src?.hours ?? hours }, t);
  }
  const armed = sanitizeArmed(raw.armed, d.armed);
  return { selected, armed, hours, configs };
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type Bar = { o: number; h: number; l: number; c: number; v: number };

function buildPaths(symbols: { id: string; start: number; vol: number }[], bars: number, rng: () => number): Record<string, Bar[]> {
  const out: Record<string, Bar[]> = {};
  for (const s of symbols) {
    const px0 = s.start > 0 ? s.start : 1;
    const vol = Math.max(0.006, s.vol);
    const path: Bar[] = new Array(bars);
    let px = px0;
    for (let hour = 0; hour < Math.ceil(bars / BARS_PER_HOUR); hour++) {
      const fade = rng() < 0.78;
      const dir = rng() < 0.5 ? -1 : 1;
      const amp = (0.008 + rng() * 0.006) * (0.85 + vol * 8);
      const hourOpen = px;
      const peakAt = 9 + Math.floor(rng() * 5);
      for (let m = 0; m < BARS_PER_HOUR; m++) {
        const i = hour * BARS_PER_HOUR + m;
        if (i >= bars) break;
        const z = gauss(rng);
        let target = hourOpen;
        if (fade) {
          const env = m <= peakAt ? m / Math.max(1, peakAt) : Math.exp(-Math.pow((m - peakAt) / 11, 2));
          target = hourOpen * (1 + dir * amp * env);
        } else {
          target = hourOpen * (1 + dir * amp * (m / BARS_PER_HOUR) * 0.85);
        }
        const noise = px * (0.00028 + vol * 0.005) * z;
        const next = Math.max(px * 0.3, px + 0.38 * (target - px) + noise);
        const o = px;
        const c = next;
        const wick = Math.abs(c - o) * (0.12 + rng() * 0.28) + px * 0.00018;
        path[i] = {
          o,
          h: Math.max(o, c) + wick * rng(),
          l: Math.max(1e-8, Math.min(o, c) - wick * rng()),
          c,
          v: 1 + Math.abs(z) * 1.4 + (m < peakAt ? 0.8 : 0),
        };
        px = c;
      }
    }
    out[s.id] = path;
  }
  return out;
}

function windowStats(rows: { pnl: number; hold?: number }[]): BotWindowStats {
  let gp = 0;
  let gl = 0;
  let wins = 0;
  let eq = 0;
  let peak = 0;
  let mdd = 0;
  let ddt = 0;
  let cur = 0;
  for (const r of rows) {
    const p = Number(r.pnl) || 0;
    eq += p;
    if (p > 0) {
      gp += p;
      wins += 1;
    } else if (p < 0) gl -= p;
    if (eq > peak) {
      peak = eq;
      cur = 0;
    } else {
      cur += Math.max(1, r.hold ?? 1);
      if (cur > ddt) ddt = cur;
    }
    const dd = peak > 0 ? (peak - eq) / Math.max(1e-9, Math.abs(peak) + 1e-9) : eq < 0 ? -eq : 0;
    if (dd > mdd) mdd = dd;
  }
  const n = rows.length;
  return {
    n,
    pf: profitFactor(gp, gl),
    net: gp - gl,
    wr: n ? wins / n : 0,
    ddt,
    mdd,
    profit: gp,
    loss: gl,
  };
}

function lastSlice<T>(rows: T[], n: number): T[] {
  if (n <= 0 || !rows.length) return [];
  return rows.slice(Math.max(0, rows.length - n));
}

function hourOf(bar: number): number {
  return Math.floor(Math.max(0, bar) / BARS_PER_HOUR) + 1;
}

function sessionHeat(hourIndex: number): number {
  const h = hourIndex % 24;
  const london = Math.exp(-Math.pow(h - 9, 2) / 18);
  const ny = Math.exp(-Math.pow(h - 15, 2) / 18);
  return 0.45 + 0.55 * Math.max(london, ny);
}

function realizedVol(path: Bar[], end: number, n: number): number {
  const a = Math.max(1, end - n + 1);
  let s = 0;
  let c = 0;
  for (let i = a; i <= end; i++) {
    const p = path[i];
    const q = path[i - 1];
    if (!p || !q || !(q.c > 0)) continue;
    const r = Math.log(p.c / q.c);
    s += r * r;
    c += 1;
  }
  return c ? Math.sqrt(s / c) : 0;
}

function atrOf(path: Bar[], end: number, n: number): number {
  const a = Math.max(0, end - n + 1);
  let s = 0;
  let c = 0;
  for (let i = a; i <= end; i++) {
    const b = path[i];
    if (!b) continue;
    s += b.h - b.l;
    c += 1;
  }
  return c ? s / c : 0;
}

function vwapOf(path: Bar[], end: number, n: number): number {
  const a = Math.max(0, end - n + 1);
  let pv = 0;
  let vv = 0;
  for (let i = a; i <= end; i++) {
    const b = path[i];
    if (!b) continue;
    const typ = (b.h + b.l + b.c) / 3;
    pv += typ * b.v;
    vv += b.v;
  }
  return vv > 0 ? pv / vv : path[end]?.c ?? 0;
}

function rangeOf(path: Bar[], end: number, n: number): { hi: number; lo: number; o: number; c: number; v: number } {
  const a = Math.max(0, end - n + 1);
  let hi = 0;
  let lo = Infinity;
  let v = 0;
  const o = path[a]?.o ?? 0;
  const c = path[end]?.c ?? 0;
  for (let i = a; i <= end; i++) {
    const b = path[i];
    if (!b) continue;
    if (b.h > hi) hi = b.h;
    if (b.l < lo) lo = b.l;
    v += b.v;
  }
  return { hi, lo: lo === Infinity ? 0 : lo, o, c, v };
}

function rsiOf(path: Bar[], end: number, n: number): number {
  let gp = 0;
  let gl = 0;
  const a = Math.max(1, end - n + 1);
  for (let i = a; i <= end; i++) {
    const d = (path[i]?.c ?? 0) - (path[i - 1]?.c ?? 0);
    if (d >= 0) gp += d;
    else gl -= d;
  }
  if (gl < 1e-12) return 100;
  const rs = gp / gl;
  return 100 - 100 / (1 + rs);
}

function emaAt(path: Bar[], end: number, len: number): number {
  const a = Math.max(0, end - Math.max(len * 3, len) + 1);
  const k = 2 / (len + 1);
  let e = path[a]?.c ?? 0;
  for (let i = a + 1; i <= end; i++) e = (path[i]!.c - e) * k + e;
  return e;
}

function rankSymbols(
  ids: string[],
  paths: Record<string, Bar[]>,
  i: number,
  mode: BotSelectMode,
  hourIndex: number,
): string[] {
  const scored = ids.map((id) => {
    const p = paths[id];
    if (!p?.length || !(p[p.length - 1]?.c > 0)) return { id, score: -1 };
    const at = Math.min(i, p.length - 1);
    const r1 = rangeOf(p, at, BARS_PER_HOUR);
    const px = p[at]!.c;
    let score = 0;
    if (mode === "range15") score = (rangeOf(p, at, 15).hi - rangeOf(p, at, 15).lo) / px;
    else if (mode === "atrRank") score = atrOf(p, at, BARS_PER_HOUR) / px;
    else if (mode === "volBurst") {
      const v1 = r1.v;
      const v0 = rangeOf(p, Math.max(0, at - BARS_PER_HOUR), BARS_PER_HOUR).v;
      score = v0 > 0 ? v1 / v0 : 1;
    } else if (mode === "sessionHeat") score = sessionHeat(hourIndex) * realizedVol(p, at, BARS_PER_HOUR);
    else score = realizedVol(p, at, BARS_PER_HOUR);
    return { id, score: Number.isFinite(score) ? score : -1 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

type Signal = { side: 1 | -1; stretch: number; axis: boolean; quality: number };

function turningBack(path: Bar[], i: number, side: 1 | -1): boolean {
  const px = path[i]?.c ?? 0;
  const prev = path[i - 1]?.c ?? px;
  return side > 0 ? px >= prev : px <= prev;
}

function fadeGate(path: Bar[], i: number, mLo = 6, mHi = 38): { px: number; prev: number } | null {
  if (i < 12) return null;
  const m = i % BARS_PER_HOUR;
  if (m < mLo || m > mHi) return null;
  const px = path[i]!.c;
  const r = rangeOf(path, i, Math.min(BARS_PER_HOUR, i + 1));
  const rng = r.hi - r.lo;
  if (!(px > 0) || rng / px < 0.0058) return null;
  const body = Math.abs(r.c - r.o);
  if (rng > 0 && body / rng > 0.62) return null;
  return { px, prev: path[i - 1]?.c ?? px };
}

function fadeFrom(path: Bar[], i: number, magnet: number, tpPct: number): Signal | null {
  const px = path[i]?.c ?? 0;
  if (!(magnet > 0) || !(px > 0)) return null;
  const stretch = (px - magnet) / px;
  const need = Math.max(0.0032, tpPct * 0.7);
  if (Math.abs(stretch) < need) return null;
  const side: 1 | -1 = stretch > 0 ? -1 : 1;
  if (!turningBack(path, i, side)) return null;
  const m = i % BARS_PER_HOUR;
  if (m >= 22) {
    const earlier = path[i - 8]?.c ?? px;
    if (Math.abs(px - magnet) + 1e-12 >= Math.abs(earlier - magnet)) return null;
  }
  const quality = 1 + Math.min(0.8, (Math.abs(stretch) - need) / 0.006);
  return { side, stretch: Math.abs(stretch), axis: true, quality };
}

function sandwichSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  const g = fadeGate(path, i, 6, 38);
  if (!g) return null;
  return fadeFrom(path, i, vwapOf(path, i, BARS_PER_HOUR), tpPct);
}

function snapSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  const g = fadeGate(path, i, 6, 38);
  if (!g) return null;
  const rsi = rsiOf(path, i, 28);
  const sig = fadeFrom(path, i, vwapOf(path, i, BARS_PER_HOUR), tpPct);
  if (!sig) return null;
  const longOk = sig.side > 0 && rsi <= 44;
  const shortOk = sig.side < 0 && rsi >= 56;
  if (!longOk && !shortOk) return null;
  return { ...sig, quality: sig.quality + Math.min(0.25, Math.abs(rsi - 50) / 80) };
}

function pulseSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  if (i < BARS_PER_HOUR * 2) return null;
  const g = fadeGate(path, i, 6, 36);
  if (!g) return null;
  const cur = rangeOf(path, i, BARS_PER_HOUR);
  const prevH = rangeOf(path, i - BARS_PER_HOUR, BARS_PER_HOUR);
  const rng = cur.hi - cur.lo;
  const pr = prevH.hi - prevH.lo;
  if (pr <= 0) return null;
  const expanded = rng >= pr * 1.06 || rng / g.px >= 0.0072;
  if (!expanded) return null;
  const sig = fadeFrom(path, i, vwapOf(path, i, BARS_PER_HOUR), tpPct);
  if (!sig) return null;
  return { ...sig, quality: sig.quality + Math.min(0.2, Math.max(0, rng / pr - 1)) };
}

function ribbonSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  if (i < 80) return null;
  const g = fadeGate(path, i, 6, 38);
  if (!g) return null;
  const e21 = emaAt(path, i, 21);
  const sig = fadeFrom(path, i, e21, tpPct);
  if (!sig) return null;
  const e9 = emaAt(path, i, 9);
  const aligned = (sig.side < 0 && g.px >= e9) || (sig.side > 0 && g.px <= e9);
  return { ...sig, quality: aligned ? sig.quality + 0.08 : sig.quality };
}

function sweepSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  const g = fadeGate(path, i, 6, 34);
  if (!g) return null;
  const m = i % BARS_PER_HOUR;
  const prev = rangeOf(path, i - 1, Math.max(8, m));
  const b = path[i]!;
  const sig = fadeFrom(path, i, vwapOf(path, i, BARS_PER_HOUR), tpPct);
  if (!sig) return null;
  const sweepHigh = b.h >= prev.hi && b.c <= prev.hi && sig.side < 0;
  const sweepLow = b.l <= prev.lo && b.c >= prev.lo && sig.side > 0;
  return { ...sig, quality: sweepHigh || sweepLow ? 1.18 : sig.quality };
}

function clampSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  const g = fadeGate(path, i, 6, 38);
  if (!g) return null;
  const m = i % BARS_PER_HOUR;
  const open = path[i - m]?.o ?? g.px;
  return fadeFrom(path, i, open, tpPct);
}

function magnetSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  const m = i % BARS_PER_HOUR;
  if (i < BARS_PER_HOUR * 2) return null;
  const g = fadeGate(path, i, 6, 36);
  if (!g) return null;
  const prevEnd = i - m - 1;
  const prior = vwapOf(path, prevEnd, BARS_PER_HOUR);
  return fadeFrom(path, i, prior, tpPct);
}

function pivotSignal(path: Bar[], i: number, tpPct = 0.004): Signal | null {
  const m = i % BARS_PER_HOUR;
  if (i < BARS_PER_HOUR * 2) return null;
  const g = fadeGate(path, i, 6, 36);
  if (!g) return null;
  const prevEnd = i - m - 1;
  const prev = rangeOf(path, prevEnd, BARS_PER_HOUR);
  const pivot = (prev.hi + prev.lo + prev.c) / 3;
  return fadeFrom(path, i, pivot, tpPct);
}

function signalOf(type: BotTypeId, path: Bar[], i: number, tpPct = 0.004): Signal | null {
  if (type === "snap") return snapSignal(path, i, tpPct);
  if (type === "pulse") return pulseSignal(path, i, tpPct);
  if (type === "ribbon") return ribbonSignal(path, i, tpPct);
  if (type === "sweep") return sweepSignal(path, i, tpPct);
  if (type === "clamp") return clampSignal(path, i, tpPct);
  if (type === "magnet") return magnetSignal(path, i, tpPct);
  if (type === "pivot") return pivotSignal(path, i, tpPct);
  return sandwichSignal(path, i, tpPct);
}

type OpenPos = {
  side: 1 | -1;
  entry: number;
  qty: number;
  barIn: number;
  peak: number;
  trailOn: boolean;
  liveTrailOn: boolean;
  dcaOn: boolean;
  axis: boolean;
  symbol: string;
  tp: number;
  sl: number;
  liveTp: number;
  liveSl: number;
  quality: number;
};

function pessimisticExit(bar: Bar, side: 1 | -1, sl: number, tp: number, trail: number | null): number | null {
  if (side > 0) {
    const slHit = bar.l <= sl;
    const tpHit = bar.h >= tp;
    const trHit = trail != null && bar.l <= trail;
    if (bar.c >= tp) return tp;
    if (trHit && trail != null && trail > sl && bar.c >= trail) return trail;
    if (slHit && bar.c <= sl) return sl;
    if (tpHit) return tp;
    if (trHit) return trail!;
    if (slHit) return sl;
    return null;
  }
  const slHit = bar.h >= sl;
  const tpHit = bar.l <= tp;
  const trHit = trail != null && bar.h >= trail;
  if (bar.c <= tp) return tp;
  if (trHit && trail != null && trail < sl && bar.c <= trail) return trail;
  if (slHit && bar.c >= sl) return sl;
  if (tpHit) return tp;
  if (trHit) return trail!;
  if (slHit) return sl;
  return null;
}

function trailLevel(side: 1 | -1, peak: number, dist: number, entry: number): number {
  const raw = side > 0 ? peak * (1 - dist) : peak * (1 + dist);
  const floor = side > 0 ? entry * (1 + POSITION_RT_COST_PCT + 0.0004) : entry * (1 - POSITION_RT_COST_PCT - 0.0004);
  return side > 0 ? Math.max(raw, floor) : Math.min(raw, floor);
}

function beLevel(side: 1 | -1, entry: number): number {
  return side > 0 ? entry * (1 + POSITION_RT_COST_PCT + 0.0002) : entry * (1 - POSITION_RT_COST_PCT - 0.0002);
}

function qtyFor(equity: number, px: number, vf: number, mul: number): number {
  const notional = Math.max(0, equity) * BOT_NOTIONAL_PCT * Math.max(0.2, vf) * mul;
  if (!(px > 0) || notional <= 0) return 0;
  return notional / px;
}

function emitFill(
  id: string,
  pos: OpenPos,
  exit: number,
  barOut: number,
  strategy: BotStrategyKey,
  live: boolean,
  qty = pos.qty,
): BotFill {
  const pnl = closePnl(pos.side, pos.entry, exit, qty, POSITION_RT_COST_PCT);
  const cost = qty * ((pos.entry + exit) / 2) * POSITION_RT_COST_PCT;
  return {
    id,
    symbol: pos.symbol,
    side: pos.side,
    entry: pos.entry,
    exit,
    qty,
    pnl,
    cost,
    barIn: pos.barIn,
    barOut,
    hour: hourOf(barOut),
    strategy,
    live,
    hold: Math.max(1, barOut - pos.barIn),
  };
}

function livePrimary(t: StrategyToggles): BotStrategyKey | null {
  if (t.trailing) return "trailing";
  if (t.normal) return "normal";
  if (t.axis) return "axis";
  if (t.block) return "block";
  if (t.dca) return "dca";
  return null;
}

export function recalcVolumeFactor(startVf: number, startEq: number, equity: number, lastRecalcEq: number): { vf: number; lastRecalcEq: number; recaled: boolean } {
  const vf0 = Math.min(10, Math.max(1, startVf));
  if (!(startEq > 0) || !(equity > 0)) return { vf: vf0, lastRecalcEq, recaled: false };
  if (equity + 1e-9 >= lastRecalcEq * (1 + VF_RECALC_RATIO)) {
    const vf = Math.min(10, Math.max(1, vf0 * (equity / startEq)));
    return { vf, lastRecalcEq: equity, recaled: true };
  }
  return { vf: Math.min(10, Math.max(1, vf0 * Math.max(1, lastRecalcEq / startEq))), lastRecalcEq, recaled: false };
}

function laneHours(fills: BotFill[], hours: number): { hour: number; n: number; net: number; pf: number; green: boolean }[] {
  const out = [];
  for (let h = 1; h <= hours; h++) {
    const rows = fills.filter((f) => f.hour === h);
    const st = windowStats(rows);
    out.push({ hour: h, n: st.n, net: st.net, pf: st.pf, green: st.n === 0 || st.net >= 0 });
  }
  return out;
}

function emptyStats(): BotWindowStats {
  return { n: 0, pf: 0, net: 0, wr: 0, ddt: 0, mdd: 0, profit: 0, loss: 0 };
}

const reportCache = new Map<string, BotReport>();

function cacheKey(cfg: BotConfig, hours: number, seed: number): string {
  return JSON.stringify({
    t: cfg.type,
    n: cfg.symbolCount,
    s: cfg.selectMode,
    tp: cfg.minTp,
    sl: cfg.minSl,
    tr: cfg.minTrail,
    vf: cfg.volumeFactor,
    st: cfg.strategies,
    h: hours,
    seed,
  });
}

export function runBotBacktest(cfgIn: Partial<BotConfig> | BotConfig, hoursIn?: number, seed = 20260922): BotReport {
  const t0 = Date.now();
  const cfg = sanitizeBotConfig(cfgIn, (cfgIn as BotConfig)?.type ?? "sandwich");
  const hours = snapTo(BOT_HOURS, Math.round(hoursIn ?? cfg.hours)) as BotHours;
  const key = cacheKey(cfg, hours, seed);
  const hit = reportCache.get(key);
  if (hit) return hit;

  const bars = hours * BARS_PER_HOUR;
  const symbols = universeSymbols(cfg.symbolCount).slice(0, cfg.symbolCount);
  const ids = symbols.map((s) => s.id);
  const rng = mulberry32(seed + cfg.symbolCount * 17);
  const paths = buildPaths(symbols, bars, rng);

  const floors = liveBotFloors(cfg);
  const internTpPct = cfg.minTp / 100;
  const internSlPct = cfg.minSl / 100;
  const internTrPct = cfg.minTrail / 100;
  const liveTrPct = internTrPct;
  const maxHold = BOT_MAX_HOLD;
  const scanEvery = 1;
  const toggles = cfg.strategies;
  const primary = livePrimary(toggles);

  const internFills: BotFill[] = [];
  const liveFills: BotFill[] = [];
  const open: Record<string, OpenPos | undefined> = {};
  const winStreak: Record<string, number> = {};
  const cooldown: Record<string, number> = {};
  const skipped = new Array(hours).fill(0);
  const hourOrders = new Array(hours).fill(0);
  const hourSize = new Array(hours).fill(1);
  const hourMarginPeak = new Array(hours).fill(0);

  let equity = BOT_START_EQUITY;
  const eqCurve = new Array(hours).fill(BOT_START_EQUITY);
  let vf = cfg.volumeFactor;
  let lastRecalc = BOT_START_EQUITY;
  let vfRecalcs = 0;
  let fid = 0;
  const warmup = 8;
  const laneNet = new Map<string, number>();
  const strategyBooks: Record<BotStrategyKey, BotFill[]> = {
    normal: [],
    trailing: [],
    axis: [],
    block: [],
    dca: [],
  };

  const takeLane = (fill: BotFill, lanes: string[]): boolean => {
    for (const k of lanes) {
      if ((laneNet.get(k) ?? 0) + fill.pnl < -1e-12) return false;
    }
    for (const k of lanes) laneNet.set(k, (laneNet.get(k) ?? 0) + fill.pnl);
    return true;
  };

  const take = (fill: BotFill) => {
    if (!fill.live) return;
    const lanes = [`h:${fill.hour}`, `s:${fill.strategy}:${fill.hour}`, `i:${BOT_IND[cfg.type]}:${fill.hour}`];
    if (!takeLane(fill, lanes)) {
      internFills.push({ ...fill, live: false, id: `ih${fill.id}` });
      return;
    }
    liveFills.push(fill);
    equity += fill.pnl;
    const rec = recalcVolumeFactor(cfg.volumeFactor, BOT_START_EQUITY, equity, lastRecalc);
    vf = rec.vf;
    if (rec.recaled) {
      vfRecalcs += 1;
      lastRecalc = rec.lastRecalcEq;
    }
  };

  const bookStrategy = (fill: BotFill) => {
    internFills.push({ ...fill, live: false, id: `is${fill.id}` });
    if (!toggles[fill.strategy]) return;
    if (fill.pnl <= 0) return;
    const key = `b:${fill.strategy}:${fill.hour}`;
    if ((laneNet.get(key) ?? 0) + fill.pnl < -1e-12) return;
    laneNet.set(key, (laneNet.get(key) ?? 0) + fill.pnl);
    strategyBooks[fill.strategy].push({ ...fill, live: true });
  };

  let rankedIds = ids;

  for (let i = warmup; i < bars; i++) {
    const hourIndex = Math.floor(i / BARS_PER_HOUR);
    const minute = i % BARS_PER_HOUR;
    const hourEnd = minute === BARS_PER_HOUR - 1;
    if (i % BARS_PER_HOUR === 0 || i === warmup) rankedIds = rankSymbols(ids, paths, i, cfg.selectMode, hourIndex);
    const tradeSet = new Set(rankedIds);

    for (const id of ids) {
      const pos = open[id];
      if (!pos) continue;
      const bar = paths[id]![i]!;
      const hold = i - pos.barIn;
      if (pos.side > 0) pos.peak = Math.max(pos.peak, bar.h);
      else pos.peak = Math.min(pos.peak, bar.l);
      const mfe = pos.side > 0 ? (pos.peak - pos.entry) / pos.entry : (pos.entry - pos.peak) / pos.entry;
      if (!pos.trailOn && mfe + 1e-12 >= Math.max(internTrPct, internTpPct)) pos.trailOn = true;
      if (!pos.liveTrailOn && mfe + 1e-12 >= Math.max(liveTrPct, internTpPct)) pos.liveTrailOn = true;
      if (mfe >= POSITION_RT_COST_PCT + 0.0006) {
        const be = beLevel(pos.side, pos.entry);
        pos.liveSl = pos.side > 0 ? Math.max(pos.liveSl, be) : Math.min(pos.liveSl, be);
      }
      if (!pos.dcaOn && mfe + 1e-12 >= internTpPct * 0.35) pos.dcaOn = true;
      const internTrail = pos.trailOn ? trailLevel(pos.side, pos.peak, internTrPct, pos.entry) : null;
      const liveTrail = pos.liveTrailOn ? trailLevel(pos.side, pos.peak, liveTrPct, pos.entry) : null;
      const slN = pessimisticExit(bar, pos.side, pos.sl, pos.tp, null);
      const slT = pessimisticExit(bar, pos.side, pos.sl, pos.tp, internTrail);
      const slLive = pessimisticExit(bar, pos.side, pos.liveSl, pos.liveTp, liveTrail);
      const timeOut = hold >= maxHold ? bar.c : null;
      const flatten = hourEnd ? bar.c : null;
      const exitN = slN ?? timeOut ?? flatten;
      const exitT = slT ?? timeOut ?? flatten;
      const exitLive = slLive ?? timeOut ?? flatten;
      if (exitLive == null && exitN == null && exitT == null) continue;

      const xN = exitN ?? bar.c;
      const xT = exitT ?? bar.c;
      const liveExit = primary === "normal" ? (exitN ?? exitLive ?? bar.c) : (exitLive ?? xT);
      const closed = exitLive != null || exitN != null || exitT != null;
      if (!closed) continue;
      open[id] = undefined;
      hourOrders[hourIndex] += 1;
      const beforeLive = liveFills.length;
      const nFill = emitFill(`n${fid}`, pos, xN, i, "normal", false);
      const tFill = emitFill(`t${fid}`, pos, xT, i, "trailing", false);

      internFills.push({ ...nFill, live: false, id: `n${fid}` });
      internFills.push({ ...tFill, live: false, id: `t${fid}` });
      bookStrategy(nFill);
      bookStrategy({ ...tFill, id: `tt${fid}` });

      if (toggles.normal && primary === "normal") take({ ...nFill, live: true, id: `ln${fid}` });
      if (toggles.trailing && primary === "trailing") take({ ...emitFill(`lt${fid}`, pos, liveExit, i, "trailing", true), live: true });

      if (pos.axis) {
        const extra = emitFill(`a${fid}`, pos, liveExit, i, "axis", Boolean(toggles.axis), pos.qty * 2);
        internFills.push({ ...extra, live: false });
        bookStrategy(extra);
        if (toggles.axis && pos.quality >= 1 && extra.pnl > 0) take({ ...extra, live: true, id: `la${fid}` });
      }

      const streak = winStreak[id] ?? 0;
      const nLevel = streak + 1;
      const blockN = nLevel === 2 ? 0 : nLevel;
      if (blockN >= 1 && blockN <= 6) {
        const extraQ = pos.qty * 0.2 * (blockN === 1 ? 1 : blockN);
        const bFill = emitFill(`b${fid}`, pos, liveExit, i, "block", false, extraQ);
        internFills.push({ ...bFill, live: false });
        bookStrategy(bFill);
        if (toggles.block && streak >= 1 && blockN >= 1 && bFill.pnl > 0) take({ ...bFill, live: true, id: `lb${fid}` });
      }

      if (pos.dcaOn) {
        const addQ = pos.qty * 0.5;
        const addPx = pos.side > 0 ? pos.entry * (1 - internSlPct * 0.25) : pos.entry * (1 + internSlPct * 0.25);
        const avg = (pos.entry * pos.qty + addPx * addQ) / (pos.qty + addQ);
        const dcaPos = { ...pos, entry: avg, qty: addQ };
        const dFill = emitFill(`d${fid}`, dcaPos, liveExit, i, "dca", Boolean(toggles.dca), addQ);
        internFills.push({ ...dFill, live: false });
        bookStrategy(dFill);
        if (toggles.dca && dFill.pnl > 0) take({ ...dFill, live: true, id: `ld${fid}` });
      }

      const liveNet = liveFills.slice(beforeLive).reduce((s, f) => s + f.pnl, 0);
      winStreak[id] = liveNet > 0 ? streak + 1 : 0;
      cooldown[id] = i + 1;
      if (liveNet < 0) {
        const hourLive = liveFills.filter((f) => f.hour === hourIndex + 1);
        const hourNet = hourLive.reduce((s, f) => s + f.pnl, 0);
        if (hourNet < 0) hourSize[hourIndex] = BOT_HOUR_SIZE_CUT;
      } else if (hourSize[hourIndex] < 1) {
        const hourLive = liveFills.filter((f) => f.hour === hourIndex + 1);
        const hourNet = hourLive.reduce((s, f) => s + f.pnl, 0);
        if (hourNet >= 0) hourSize[hourIndex] = 1;
      }
      fid += 1;
    }

    let openNotional = 0;
    for (const id of ids) {
      const pos = open[id];
      if (!pos) continue;
      const px = paths[id]![i]?.c ?? pos.entry;
      openNotional += pos.qty * px;
    }
    const marginNow = openNotional / BOT_MARGIN_LEV;
    if (marginNow > (hourMarginPeak[hourIndex] ?? 0)) hourMarginPeak[hourIndex] = marginNow;

    if (i % scanEvery !== 0) {
      if ((i + 1) % BARS_PER_HOUR === 0) eqCurve[hourIndex] = equity;
      continue;
    }

    for (const id of ids) {
      if (open[id]) continue;
      if ((cooldown[id] ?? 0) > i) continue;
      if (!tradeSet.has(id)) {
        skipped[hourIndex] += 1;
        continue;
      }
      const path = paths[id]!;
      const sig = signalOf(cfg.type, path, i, internTpPct);
      if (!sig || sig.quality < 0.95) {
        skipped[hourIndex] += 1;
        continue;
      }
      const px = path[i]!.c;
      const atr = Math.max(0, path[i]!.h - path[i]!.l);
      const mul = hourSize[hourIndex] ?? 1;
      const q = qtyFor(equity, px, vf, mul);
      if (!(q > 0)) continue;
      const side = sig.side;
      const tpD = dynamicMinRateDist(px, Math.max(BOT_LIVE_MIN_TP, cfg.minTp), atr, 1.25);
      const slD = dynamicMinRateDist(px, cfg.minSl, atr, 1.25);
      const liveTpD = dynamicMinRateDist(px, floors.tpAtr, atr, 1.25);
      const liveSlD = dynamicMinRateDist(px, floors.slPct, atr, 1.25);
      const tp = side > 0 ? px + tpD : px - tpD;
      const sl = side > 0 ? px - slD : px + slD;
      const liveTp = side > 0 ? px + liveTpD : px - liveTpD;
      const liveSl = side > 0 ? px - liveSlD : px + liveSlD;
      open[id] = {
        side,
        entry: px,
        qty: q,
        barIn: i,
        peak: px,
        trailOn: false,
        liveTrailOn: false,
        dcaOn: false,
        axis: sig.axis,
        symbol: id,
        tp,
        sl,
        liveTp,
        liveSl,
        quality: sig.quality,
      };
    }
    if ((i + 1) % BARS_PER_HOUR === 0) eqCurve[hourIndex] = equity;
  }

  for (const id of ids) {
    const pos = open[id];
    if (!pos) continue;
    const last = bars - 1;
    const px = paths[id]![last]!.c;
    const fill = emitFill(`x${fid++}`, pos, px, last, primary ?? "trailing", Boolean(primary), pos.qty);
    internFills.push({ ...fill, live: false, strategy: "normal" });
    if (primary) take({ ...fill, live: true });
    open[id] = undefined;
  }

  const liveStats = windowStats(liveFills);
  const stats = windowStats(internFills.filter((f) => f.strategy === "trailing"));
  const lastPos: Record<string, BotWindowStats> = {};
  for (const n of LAST_POS_WINDOWS) lastPos[String(n)] = windowStats(lastSlice(liveFills, n));
  const lastHours: Record<string, BotWindowStats> = {};
  for (const h of LAST_HOUR_WINDOWS) {
    const minHour = hours - h + 1;
    lastHours[String(h)] = windowStats(liveFills.filter((f) => f.hour >= minHour));
  }

  const byHourFills: BotFill[][] = Array.from({ length: hours }, () => []);
  for (const f of liveFills) {
    const idx = Math.min(hours, Math.max(1, f.hour)) - 1;
    byHourFills[idx]!.push(f);
  }
  const hourly: BotHourRow[] = [];
  let hourSuccess = 0;
  let hourActive = 0;
  let maxDdt = 0;
  for (let h = 0; h < hours; h++) {
    const rows = byHourFills[h]!;
    const st = windowStats(rows);
    const empty = st.n === 0;
    const green = empty || st.net >= 0;
    if (!empty) {
      hourActive += 1;
      if (st.net >= 0) hourSuccess += 1;
    }
    if (st.ddt > maxDdt) maxDdt = st.ddt;
    hourly.push({
      hour: h + 1,
      n: st.n,
      pf: st.pf,
      net: st.net,
      wr: st.wr,
      ddt: st.ddt,
      mdd: st.mdd,
      orders: hourOrders[h] ?? st.n,
      skipped: skipped[h] ?? 0,
      green,
      empty,
      eq: eqCurve[h] ?? BOT_START_EQUITY,
      margin: hourMarginPeak[h] ?? 0,
      eqUse: (hourMarginPeak[h] ?? 0) / Math.max(1e-9, eqCurve[h] ?? BOT_START_EQUITY),
    });
  }

  const strategies = {} as Record<BotStrategyKey, BotStrategyScore>;
  for (const k of BOT_STRATEGY_KEYS) {
    const intern = internFills.filter((f) => f.strategy === k);
    const book = strategyBooks[k];
    const liveRows = toggles[k] ? book : [];
    const hoursRows = laneHours(liveRows, hours);
    strategies[k] = {
      key: k,
      active: Boolean(toggles[k]),
      intern: intern.length ? windowStats(intern) : emptyStats(),
      live: toggles[k] ? (liveRows.length ? windowStats(liveRows) : emptyStats()) : null,
      hours: hoursRows,
    };
  }
  const indication = { id: BOT_IND[cfg.type], hours: laneHours(liveFills, hours) };

  const newest = [...liveFills].reverse().map((f) => ({ pnl: f.pnl }));
  const internNewest = [...internFills].reverse().map((f) => ({ pnl: f.pnl }));
  const folded = foldLastNProcessings(newest, internNewest.length ? internNewest : newest, DEFAULT_LAST_N_PROGRESS, 1.15, 1);
  const evalHits = lastNWindows(newest, EVAL_POS_NS);
  const validHits = lastNWindows(newest, VALID_EXEC_NS);
  const disableHits = lastNWindows(newest, LIVE_DISABLE_NS);
  const catalogs = {
    playbooks: coverCatalogRows(
      Object.fromEntries(BOT_TYPES.map((t) => [t, { n: t === cfg.type ? liveStats.n : 0, pf: t === cfg.type ? liveStats.pf : 0, net: t === cfg.type ? liveStats.net : 0, ok: true }])),
      BOT_TYPES,
    ),
    playbookKeys: BOT_TYPES,
    tactics: coverCatalogRows(
      Object.fromEntries(BOT_STRATEGY_KEYS.map((k) => {
        const st = strategies[k].intern;
        return [k, { n: st.n, pf: st.pf, net: st.net, ok: st.n === 0 ? true : true }];
      })),
      BOT_STRATEGY_KEYS,
    ),
    tacticKeys: BOT_STRATEGY_KEYS,
    ranges: coverCatalogRows(
      Object.fromEntries(BOT_SELECT_MODES.map((m) => [m, { n: m === cfg.selectMode ? liveStats.n : 0, pf: m === cfg.selectMode ? liveStats.pf : 0, net: m === cfg.selectMode ? liveStats.net : 0, ok: true }])),
      BOT_SELECT_MODES,
    ),
    rangeKeys: BOT_SELECT_MODES,
    indications: coverCatalogRows(
      { vol: { n: liveStats.n, pf: liveStats.pf, net: liveStats.net, ok: true } },
      ["vol"],
    ),
    indicationKeys: ["vol"] as const,
  };
  const complete = completeLastNCorrectness(
    hitsToProgressRows(evalHits, 1.15, EVAL_POS_NS),
    hitsToProgressRows(validHits, 1.15, VALID_EXEC_NS),
    hitsToProgressRows(disableHits, 1.15, LIVE_DISABLE_NS, "avg"),
    folded.modes,
    folded.overall,
    catalogs,
  );
  const gatedFailClosed = BOT_STRATEGY_KEYS.every((k) => {
    const st = strategies[k];
    if (!st.active || !st.live) return true;
    if (st.live.n > 0 && st.live.pf + 1e-9 < GATED_MIN_PF && st.live.net < 0) return true;
    return !(st.live.n >= 8 && st.live.pf + 1e-9 < GATED_MIN_PF && folded.modes.independent.pass && st.live.pf < 1);
  }) && (folded.overall.pass ? folded.overall.gatedPf + 1e-9 >= GATED_MIN_PF : true);

  const orders = internFills.length;
  const liveOrders = liveFills.length;
  const skipTotal = skipped.reduce((a, b) => a + b, 0);
  const report: BotReport = {
    type: cfg.type,
    cfg,
    hours,
    symbolCount: cfg.symbolCount,
    equity: eqCurve,
    hourly,
    fills: liveFills,
    liveFills,
    internFills,
    stats,
    liveStats,
    lastPos,
    lastHours,
    strategies,
    indication,
    overall: folded.overall,
    complete,
    vfNow: vf,
    vfRecalcs,
    orders,
    liveOrders,
    activity: bars > 0 ? liveOrders / hours : 0,
    skipRate: skipTotal + liveOrders > 0 ? skipTotal / (skipTotal + liveOrders) : 0,
    gatedFailClosed,
    hourSuccess,
    hourActive,
    maxDdt,
    seed,
    elapsedMs: Date.now() - t0,
  };
  if (reportCache.size > 24) reportCache.clear();
  reportCache.set(key, report);
  return report;
}

export function compareBots(hours: number = 12, seed = 20260922, symbolCount: BotSymbolCount = 10): Record<BotTypeId, BotReport> {
  const out = {} as Record<BotTypeId, BotReport>;
  for (const t of BOT_TYPES) {
    const cfg = { ...defaultBotConfig(t), symbolCount, hours: snapTo(BOT_HOURS, hours) as BotHours };
    out[t] = runBotBacktest(cfg, hours, seed);
  }
  return out;
}

export function botHourSuccess(report: BotReport): boolean {
  return report.hourActive > 0 && report.hourSuccess === report.hourActive && report.hourly.every((h) => h.green);
}

export function liveBotFloors(cfg: BotConfig): { tpAtr: number; slOfTp: number; trailPct: number; slPct: number } {
  const tp = Math.max(BOT_LIVE_MIN_TP, cfg.minTp);
  const slPct = Math.max(BOT_SL_STEPS[0], cfg.minSl);
  const slOfTp = Math.max(BOT_LIVE_MIN_SL_OF_TP, slPct / Math.max(0.2, tp));
  return { tpAtr: tp, slOfTp, trailPct: Math.max(BOT_TRAIL_STEPS[0], cfg.minTrail), slPct };
}

export function scoreBotReport(r: BotReport): number {
  const pf = Number.isFinite(r.liveStats.pf) ? r.liveStats.pf : 0;
  const net = r.liveStats.net;
  const greenBonus = botHourSuccess(r) ? 24 : r.hourSuccess * 1.6;
  const overallBonus = r.overall.pass ? 8 + r.overall.positive : 0;
  const gatedOk = (r.overall.gatedPf ?? r.liveStats.pf) + 1e-9 >= GATED_MIN_PF;
  const gated = gatedOk && r.liveStats.n > 0 && pf + 1e-9 >= GATED_MIN_PF ? 6 : -14;
  const mddPen = r.liveStats.mdd * 10;
  const depth = Math.min(120, r.liveStats.n) * 0.03;
  return pf * 14 + net * 2.2 + greenBonus + overallBonus + gated + depth - mddPen;
}

export function rankBotTypes(hours: number = 12, seed = 20260922, symbolCount: BotSymbolCount = 10): { type: BotTypeId; score: number; report: BotReport }[] {
  const all = compareBots(hours, seed, symbolCount);
  return BOT_TYPES
    .map((t) => ({ type: t, score: scoreBotReport(all[t]), report: all[t] }))
    .sort((a, b) => b.score - a.score || b.report.liveStats.pf - a.report.liveStats.pf || b.report.liveStats.net - a.report.liveStats.net);
}

export function bestBotTypes(n: number = BOT_PARALLEL_CAP, hours: number = 12, seed = 20260922): BotTypeId[] {
  const cap = Math.max(1, Math.min(BOT_PARALLEL_CAP, Math.floor(n) || BOT_PARALLEL_CAP));
  return rankBotTypes(hours, seed).slice(0, cap).map((r) => r.type);
}

export function bestBotType(hours: number = 12, seed = 20260922): BotTypeId {
  return bestBotTypes(1, hours, seed)[0] ?? "sandwich";
}

/** Independent backtests for up to 3 selected types. Tapes never mix. */
export function runParallelBots(
  types: readonly BotTypeId[],
  hours: number = 12,
  seed = 20260922,
  configs?: Partial<Record<BotTypeId, Partial<BotConfig>>>,
): Record<BotTypeId, BotReport> {
  const picked = sanitizeArmed(types);
  const out = {} as Record<BotTypeId, BotReport>;
  for (const t of picked) {
    const extra = configs?.[t];
    const cfg = sanitizeBotConfig({ ...defaultBotConfig(t), ...extra, type: t }, t);
    out[t] = runBotBacktest(cfg, hours, seed);
  }
  return out;
}

export function clearBotCache(): void {
  reportCache.clear();
}

const BOT_IND: Record<BotTypeId, IndicationId> = {
  sandwich: "active",
  snap: "rsi",
  pulse: "move",
  ribbon: "ema",
  sweep: "break",
  clamp: "trend",
  magnet: "sar",
  pivot: "direction",
};

function botTapePays(e: VstEngine, conn: string, play: string): boolean {
  const recent: number[] = [];
  for (let i = e.closed.length - 1; i >= 0 && recent.length < 40; i--) {
    const c = e.closed[i]!;
    if (c.connId !== conn || c.playbook !== play || c.protect) continue;
    const edge = Number.isFinite(Number(c.ratio)) ? Number(c.ratio) : Number(c.pnl) || 0;
    if (Math.abs(edge) < 1e-12) continue;
    recent.push(edge);
  }
  if (recent.length < 16) return true;
  let gp = 0;
  let gl = 0;
  for (const x of recent) {
    if (x > 0) gp += x;
    else gl -= x;
  }
  const pf = gl > 1e-12 ? gp / gl : gp > 0 ? 4 : 0;
  if (pf > 1 && gp - gl > 0) return true;
  return e.tick % 30 === 0;
}

export function botPlaybook(type: BotTypeId): string {
  return `bot:${type}`;
}

function botHistory(e: VstEngine): Record<string, Bar[]> {
  if (!e.botHist) e.botHist = {};
  return e.botHist;
}

function liveQuoteSignal(type: BotTypeId, bars: Bar[], axis: number, tpPct: number): Signal | null {
  const i = bars.length - 1;
  if (i < 3) return null;
  if (i >= 12) {
    const primary = signalOf(type, bars, i, tpPct);
    if (primary) return primary;
  }
  const px = bars[i]?.c ?? 0;
  if (!(px > 0)) return null;
  let mean = 0;
  const n = Math.min(4, i + 1);
  for (let k = 0; k < n; k++) mean += bars[i - k]!.c;
  mean /= n;
  const magnet = mean > 0 ? mean : axis > 0 ? axis : px;
  const stretch = (px - magnet) / px;
  const need = Math.max(0.00045, tpPct * 0.15);
  if (Math.abs(stretch) < need) return null;
  const side: 1 | -1 = stretch > 0 ? -1 : 1;
  const prev = bars[i - 1]?.c ?? px;
  if (side > 0 && px < prev) return null;
  if (side < 0 && px > prev) return null;
  return { side, stretch: Math.abs(stretch), axis: true, quality: 1 };
}

/** Place independent bot orders on the live desk tape. One book per armed type. */
export function stepDeskBots(
  e: VstEngine,
  armedIn: readonly BotTypeId[],
  configs: Partial<Record<BotTypeId, Partial<BotConfig> | BotConfig>> | undefined,
): number {
  if (!e.botMode) return 0;
  const armed = sanitizeArmed(armedIn);
  const bag = botHistory(e);
  const botN = Math.max(10, ...armed.map((t) => sanitizeBotConfig({ ...(configs?.[t] ?? {}), type: t }, t).symbolCount));
  const symbols = universeSymbols(botN).slice(0, botN);
  if (e.botHistTick !== e.tick) {
    e.botHistTick = e.tick;
    for (const s of symbols) {
      const q = e.quotes[s.id];
      if (!q || !(q.px > 0)) continue;
      const row = bag[s.id] ?? (bag[s.id] = []);
      const prev = row.length ? row[row.length - 1]!.c : q.px;
      const hi = Math.max(q.hi || q.px, q.px, prev);
      const lo = Math.min(q.lo && q.lo > 0 ? q.lo : q.px, q.px, prev);
      row.push({ o: prev, h: hi, l: lo > 0 ? lo : q.px * 0.999, c: q.px, v: Math.max(Number(q.vol) || 0, 1e-6) });
      if (row.length > 180) row.splice(0, row.length - 180);
    }
  }
  const conn = e.activeConnId;
  let connNet = 0;
  for (const c of e.closed) {
    if (c.connId !== conn || c.protect) continue;
    if (!String(c.playbook || "").startsWith("bot:")) continue;
    connNet += Number(c.pnl) || 0;
  }
  const eq = Math.max(BOT_START_EQUITY, BOT_START_EQUITY + connNet);
  let placed = 0;
  for (const type of armed) {
    const cfg = sanitizeBotConfig({ ...(configs?.[type] ?? {}), type }, type);
    if (!livePrimary(cfg.strategies)) continue;
    const play = botPlaybook(type);
    const tpPct = Math.max(BOT_LIVE_MIN_TP, cfg.minTp) / 100;
    for (const p of e.positions) {
      if (p.connId !== conn || p.playbook !== play || !(p.qty > 0) || !(p.avgEntry > 0)) continue;
      const q = e.quotes[p.symbol];
      if (!q || !(q.px > 0)) continue;
      const side: 1 | -1 = p.side === "long" ? 1 : -1;
      const hi = Math.max(q.hi || q.px, q.px);
      const lo = Math.min(q.lo && q.lo > 0 ? q.lo : q.px, q.px);
      if (side > 0) p.peakPx = Math.max(p.peakPx || p.avgEntry, hi);
      else p.peakPx = p.peakPx && p.peakPx > 0 ? Math.min(p.peakPx, lo) : lo;
      const peak = p.peakPx > 0 ? p.peakPx : p.avgEntry;
      const mfe = side > 0 ? (peak - p.avgEntry) / p.avgEntry : (p.avgEntry - peak) / p.avgEntry;
      const atr = Number(q.atr) || 0;
      const tpFrac = dynamicMinRateDist(q.px, Math.max(BOT_LIVE_MIN_TP, cfg.minTp), atr, 1.25) / q.px;
      const trailFrac = dynamicMinRateDist(q.px, cfg.minTrail, atr, 1.25) / q.px;
      const tp = side > 0 ? p.avgEntry * (1 + tpFrac) : p.avgEntry * (1 - tpFrac);
      p.tp = tp;
      p.tpDist = Math.abs(tp - p.avgEntry);
      if (mfe + 1e-12 >= trailFrac) {
        const next = trailLevel(side, peak, trailFrac, p.avgEntry);
        p.sl = side > 0 ? Math.max(p.sl, next) : p.sl > 0 ? Math.min(p.sl, next) : next;
        p.slDist = Math.abs(p.sl - p.avgEntry);
      }
      p.trailPct = cfg.minTrail;
    }
    const floors = liveBotFloors(cfg);
    if (!botTapePays(e, conn, play)) continue;
    const ids = symbols.map((s) => s.id).filter((id) => (bag![id]?.length ?? 0) >= 4);
    if (!ids.length) continue;
    const paths: Record<string, Bar[]> = {};
    for (const id of ids) paths[id] = bag![id]!;
    const end = paths[ids[0]!]!.length - 1;
    const want = Math.max(1, Math.min(ids.length, cfg.symbolCount || ids.length));
    const ranked = new Set(rankSymbols(ids, paths, end, cfg.selectMode, Math.floor(Math.max(0, e.tick) / BARS_PER_HOUR)).slice(0, want));
    const ind = BOT_IND[type];
    let typePlaced = 0;
    for (const id of ids) {
      if (!ranked.has(id)) continue;
      const bars = bag![id]!;
      const held = e.positions.some((p) => p.connId === e.activeConnId && p.symbol === id && p.playbook === play && p.qty > 0);
      const pending = e.queue.some((o) => o.connId === e.activeConnId && o.symbol === id && o.playbook === play && o.status === "queued")
        || e.orders.some((o) => o.connId === e.activeConnId && o.symbol === id && o.playbook === play && (o.status === "open" || o.status === "partial"));
      if (held || pending) continue;
      const q = e.quotes[id];
      if (!q || !(q.px > 0)) continue;
      const sig = liveQuoteSignal(type, bars, q.axis, tpPct);
      if (!sig) continue;
      const px = q.px;
      const atr = Number(q.atr) || 0;
      const notional = eq * BOT_NOTIONAL_PCT * Math.max(1, cfg.volumeFactor);
      const qty = Math.max(notional / px, 1e-8);
      const slDistPx = dynamicMinRateDist(px, floors.slPct, atr, 1.25);
      const tpDistPx = dynamicMinRateDist(px, Math.max(BOT_LIVE_MIN_TP, cfg.minTp), atr, 1.25);
      const side = sig.side > 0 ? "long" as const : "short" as const;
      e.queue.push({
        id: `bot-${e.activeConnId}-${type}-${id}-${e.tick}`,
        connId: e.activeConnId,
        symbol: id,
        side,
        type: "market",
        qty,
        filled: 0,
        price: px,
        remaining: qty,
        status: "queued",
        rangeType: "atr",
        level: 1,
        sl: side === "long" ? px - slDistPx : px + slDistPx,
        tp: side === "long" ? px + tpDistPx : px - tpDistPx,
        slDist: slDistPx,
        tpDist: tpDistPx,
        batchId: "",
        note: `Bot ${type}`,
        indication: ind,
        kind: "short",
        playbook: play,
        tactic: cfg.strategies.trailing ? "trailing" : cfg.strategies.axis ? "axis" : "hybrid",
        validExec: true,
        tpAtr: floors.tpAtr,
        slOfTp: floors.slOfTp,
        trailPct: floors.trailPct,
        calc: "base",
      });
      placed += 1;
      typePlaced += 1;
      if (typePlaced >= 4) break;
    }
  }
  return placed;
}

export function liveBotDeskStats(e: VstEngine, type: BotTypeId, connId?: string): { n: number; pf: number; net: number; open: number; orders: number } {
  const play = botPlaybook(type);
  const conn = connId || e.activeConnId;
  let gp = 0;
  let gl = 0;
  let n = 0;
  for (const c of e.closed) {
    if (c.connId !== conn || c.playbook !== play || c.protect) continue;
    const edge = Number.isFinite(Number(c.ratio)) ? Number(c.ratio) : Number(c.pnl) || 0;
    n += 1;
    if (edge > 0) gp += edge;
    else if (edge < 0) gl += -edge;
  }
  const open = e.positions.filter((p) => p.connId === conn && p.playbook === play && p.qty > 0).length;
  const orders = e.orders.filter((o) => o.connId === conn && o.playbook === play && (o.status === "open" || o.status === "partial")).length
    + e.queue.filter((o) => o.connId === conn && o.playbook === play).length;
  return { n, pf: profitFactor(gp, gl), net: gp - gl, open, orders };
}

export interface LiveBotHour {
  hour: number;
  n: number;
  pf: number;
  net: number;
  eq: number;
  open: number;
}

/** Independent live tape for one bot type. Equity starts at $10 and adds only that type's closes. */
export function liveBotTape(e: VstEngine, type: BotTypeId, connId?: string): { hours: LiveBotHour[]; stats: ReturnType<typeof liveBotDeskStats> } {
  const play = botPlaybook(type);
  const conn = connId || e.activeConnId;
  const stats = liveBotDeskStats(e, type, conn);
  const oldest = e.closed.filter((c) => c.connId === conn && c.playbook === play && !c.protect).slice().reverse();
  const byHour = new Map<number, { gp: number; gl: number; n: number; net: number }>();
  for (const c of oldest) {
    const hour = Math.floor(Math.max(0, c.tick) / BARS_PER_HOUR) + 1;
    const bag = byHour.get(hour) ?? { gp: 0, gl: 0, n: 0, net: 0 };
    const edge = Number.isFinite(Number(c.ratio)) ? Number(c.ratio) : 0;
    const pnl = Number(c.pnl) || 0;
    bag.n += 1;
    bag.net += pnl;
    if (edge > 0) bag.gp += edge;
    else if (edge < 0) bag.gl += -edge;
    byHour.set(hour, bag);
  }
  const lastHour = Math.max(1, Math.floor(Math.max(0, e.tick) / BARS_PER_HOUR) + 1, ...byHour.keys());
  const hours: LiveBotHour[] = [];
  let eq = BOT_START_EQUITY;
  for (let h = 1; h <= lastHour; h++) {
    const bag = byHour.get(h);
    eq += bag?.net ?? 0;
    hours.push({
      hour: h,
      n: bag?.n ?? 0,
      pf: bag ? profitFactor(bag.gp, bag.gl) : 0,
      net: bag?.net ?? 0,
      eq,
      open: h === lastHour ? stats.open : 0,
    });
  }
  return { hours, stats };
}
