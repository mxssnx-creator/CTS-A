import type {
  Backtest,
  BlockConfig,
  Candle,
  ComboBreakdown,
  ComboBucket,
  ComboHistBin,
  ComboPoint,
  ComboResult,
  Connection,
  Coordination,
  DeskData,
  HeatCell,
  IndicationId,
  IndicatorPack,
  LastNConfig,
  LastNStage,
  Lane,
  LastNEvalRow,
  OrderTypeId,
  Position,
  PositionBlock,
  RangeType,
  Side,
  SliceStats,
  Stats,
  StrategyAdj,
  StrategyDef,
  StrategyKind,
  TacticConfig,
  TacticKind,
  Thresholds,
  Trade,
  Venue,
  VolumeCoord,
} from "./types";

export const BARS = 240;
export const WARMUP = 55;
export const BASE_EQUITY = 10_000;
/** System-internal default position cost: 0.1% of equity. */
export const POSITION_COST_PCT = 0.001;
export const UNIT_NOTIONAL = BASE_EQUITY * POSITION_COST_PCT;
/** Hard floor — volume factor cannot be gated below this. */
export const MIN_VOLUME_FACTOR = 1.05;
export const MIN_QUOTE_VOL = 0.006;
export const TRAIL_PCTS = [0.8, 1.1, 1.4, 1.7, 2.0, 2.4] as const;
/** Take-profit / stop-loss R-multiples: 0.25 … 3.00. */
export const TP_SL_RATIO_MIN = 0.25;
export const TP_SL_RATIO_MAX = 3;
export const TP_SL_RATIO_STEP = 0.25;
export const TP_SL_RATIOS = Array.from(
  { length: Math.round((TP_SL_RATIO_MAX - TP_SL_RATIO_MIN) / TP_SL_RATIO_STEP) + 1 },
  (_, i) => Math.round((TP_SL_RATIO_MIN + i * TP_SL_RATIO_STEP) * 100) / 100,
) as readonly number[];

export function snapTpRatio(n: number): number {
  if (!Number.isFinite(n)) return 2.5;
  const x = Math.min(TP_SL_RATIO_MAX, Math.max(TP_SL_RATIO_MIN, n));
  return Math.round(x / TP_SL_RATIO_STEP) * TP_SL_RATIO_STEP;
}
export const T0 = 1_725_000_000_000;
export const BAR_MS = 15 * 60 * 1000;

export const COST_STEPS: number[] = Array.from({ length: 28 }, (_, i) => i + 3);
export const LAST_N_OPTIONS = [3, 5, 10, 15, 20, 50] as const;
export type LastNChoice = (typeof LAST_N_OPTIONS)[number];

/** Auto-eval historic stages (hours). */
export const STAGE_HOURS = [4, 8, 16] as const;
export type StageHour = (typeof STAGE_HOURS)[number];
export type StageId = "pre" | "mid" | "end";
export const STAGE_META: { id: StageId; hours: StageHour; label: string; blurb: string }[] = [
  { id: "pre", hours: 4, label: "Pre", blurb: "4h pre-historic full compute" },
  { id: "mid", hours: 8, label: "Mid", blurb: "8h mid-historic independent validate" },
  { id: "end", hours: 16, label: "End", blurb: "16h end-stage — PF avg of effective valids" },
];
/** Automated last-N pos evals for lanes / live mirror. */
export const LANE_EVAL_NS = [5, 10, 15] as const;

export const LAST_N_STAGE_META: { id: LastNStage; label: string; blurb: string; usedFor: string }[] = [
  {
    id: "picks",
    label: "Picks evals",
    blurb: "Last N closed trades rank playbooks and set volume factor.",
    usedFor: "Strategies ranking",
  },
  {
    id: "lanes",
    label: "Lane pos",
    blurb: "Last N pos evals on validated and candidate lanes.",
    usedFor: "Lanes · Tactics",
  },
  {
    id: "last",
    label: "Last pos",
    blurb: "Last N closed positions for last-side coordination.",
    usedFor: "Positions · Last",
  },
  {
    id: "ongoing",
    label: "Ongoing pos",
    blurb: "Last N open positions for live inventory evals.",
    usedFor: "Positions · Ongoing",
  },
  {
    id: "next",
    label: "Next pos",
    blurb: "Last N upcoming grid positions for next-step coordination.",
    usedFor: "Positions · Next",
  },
  {
    id: "combos",
    label: "Combo evals",
    blurb: "Last N window for combination PF, WR and last-N positivity.",
    usedFor: "Combinations · Stats",
  },
];

export const DEFAULT_LAST_N: LastNChoice = 10;
export const DEFAULT_LAST_N_CONFIG: LastNConfig = {
  picks: 10,
  lanes: 10,
  last: 10,
  ongoing: 10,
  next: 10,
  combos: 10,
};

export function clampLastN(n: number): LastNChoice {
  const hit = LAST_N_OPTIONS.find((x) => x === n);
  return hit ?? DEFAULT_LAST_N;
}
export const RANGE_TYPES: RangeType[] = [
  "linear",
  "geometric",
  "atr",
  "volume",
  "fibonacci",
];
export const TACTICS: TacticKind[] = ["trailing", "dca", "axis", "hybrid"];

export const STRATEGY_KINDS: { id: StrategyKind; label: string; blurb: string }[] = [
  { id: "normal", label: "Normal", blurb: "General configs and lanes — no strategy-type adjustment" },
  { id: "trend", label: "Trend", blurb: "EMA, MACD, Supertrend, ADX — independent trend indications" },
  { id: "mean", label: "Mean", blurb: "RSI, Bollinger, Stochastic" },
  { id: "breakout", label: "Break", blurb: "Range / volume / ATR breaks on expansion" },
  { id: "volume", label: "Volume", blurb: "Volume-factor confirmation" },
  { id: "hybrid", label: "Hybrid", blurb: "Confluence of independent confirms" },
  { id: "active", label: "Active", blurb: "High-frequency activity and ranging changes" },
  { id: "block", label: "Block", blurb: "Book-level block adjust of overall active orders — independent of lanes" },
];

export const DEFAULT_ENABLED_KINDS: StrategyKind[] = STRATEGY_KINDS.map((k) => k.id);

export const VENUE_ORDER_TYPES: Record<Venue, OrderTypeId[]> = {
  bingx: ["market", "limit", "stop", "stop_limit", "trailing_stop", "post_only", "ioc", "fok"],
  bybit: ["market", "limit", "stop", "stop_limit", "trailing_stop", "post_only", "ioc", "fok"],
};

export const SYMBOL_COUNT_MIN = 8;
export const SYMBOL_COUNT_MAX = 50;

export const SYMBOLS = [
  { id: "BTCUSDT", base: "BTC", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 64250, vol: 0.007 },
  { id: "ETHUSDT", base: "ETH", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 3412, vol: 0.01 },
  { id: "SOLUSDT", base: "SOL", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 148.4, vol: 0.014 },
  { id: "BNBUSDT", base: "BNB", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 582, vol: 0.009 },
  { id: "XRPUSDT", base: "XRP", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 0.624, vol: 0.016 },
  { id: "DOGEUSDT", base: "DOGE", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 0.158, vol: 0.02 },
  { id: "AVAXUSDT", base: "AVAX", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 38.2, vol: 0.015 },
  { id: "LINKUSDT", base: "LINK", quote: "USDT", venues: ["bingx", "bybit"] as const, start: 14.35, vol: 0.013 },
];

export const ORDER_TYPES = [
  { id: "market", label: "Market" },
  { id: "limit", label: "Limit" },
  { id: "stop", label: "Stop" },
  { id: "stop_limit", label: "Stop Limit" },
  { id: "trailing_stop", label: "Trailing Stop" },
  { id: "post_only", label: "Post Only" },
  { id: "ioc", label: "IOC" },
  { id: "fok", label: "FOK" },
] as const;

export const RANGE_META: Record<RangeType, { label: string; blurb: string }> = {
  linear: { label: "Linear", blurb: "Equal price steps from the axis" },
  geometric: { label: "Geometric", blurb: "Percent compounding grid" },
  atr: { label: "ATR", blurb: "Volatility-scaled ranges" },
  volume: { label: "Volume", blurb: "Volume-weighted levels" },
  fibonacci: { label: "Fibonacci", blurb: "Fib retrace / extension grid" },
};

export const TACTIC_META: Record<TacticKind, { label: string; blurb: string }> = {
  trailing: { label: "Trailing", blurb: "Trail winners, cut losers at ATR" },
  dca: { label: "DCA", blurb: "Scale in on drawdown steps" },
  axis: { label: "Axis", blurb: "Anchor grid to VWAP / EMA axis" },
  hybrid: { label: "Hybrid", blurb: "Axis entry, DCA fills, trailing exit" },
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  minPf: 1.85,
  maxMdd: 0.12,
  minWr: 0.55,
  minVf: 1.12,
  maxDdt: 18,
};

export const DEFAULT_TACTIC_CONFIG: TacticConfig = {
  trailingPct: 0.8,
  dcaCount: 1,
  dcaDrawdown: 0.8,
  axisSpacing: 0.55,
  axisLevels: 4,
  slAtr: 0.4,
  tpRatio: 2.75,
  maxHoldBars: 3,
  maxHoldTicks: 16,
};

export const BLOCK_COUNTS = [1, 2];
export const BLOCK_POS_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

export const DEFAULT_BLOCK_CONFIG: BlockConfig = {
  enabled: true,
  maxMultiple: 2,
  minMultiple: 1,
  addOnWin: true,
  flattenConflict: true,
  endStageOnly: false,
  cadence: 6,
  overall: true,
  counts: [...BLOCK_COUNTS],
  volumeRatio: 1.25,
  maxVolumeMultiplier: 2.25,
  pfRatio: 1.45,
  pauseCountRatio: 2,
  evalPosCount: 16,
  activeLive: true,
  minActiveLevel: 0,
};

export function sharedBlockVolumeRatio(ratio: number, liveCount: number, extraCap = 1) {
  const vr = Math.min(2.5, Math.max(0.05, ratio || 1.25));
  const extra = Math.max(0, extraCap);
  const n = Math.max(1, liveCount | 0);
  if (n > 2 && extra > 0 && vr + 1e-12 >= extra) return extra / n;
  return extra > 0 ? Math.min(vr, extra) : vr;
}

export function blockVolumeIncrement(count: number, volumeRatio: number) {
  if (!(count > 0) || !(volumeRatio > 0)) return 0;
  return Math.trunc(count) * volumeRatio;
}

export function blockMaxAdditionalRatio(maxStack: number, volumeRatio: number, maxMultiplier = 2.25) {
  const cap = Math.min(3, Math.max(1, maxMultiplier || 2.25));
  return Math.min(cap - 1, blockVolumeIncrement(maxStack, volumeRatio));
}

export function blockMinimumProfitFactor(defaultMinPf: number, blockPfRatio: number, volumeIncrement: number) {
  if (defaultMinPf <= 0 || blockPfRatio <= 0 || volumeIncrement <= 0) return 0;
  const bounded = Math.min(5, Math.max(0.5, blockPfRatio));
  return 1 + Math.max(0, defaultMinPf - 1) * bounded * volumeIncrement;
}

export function blockStepQty(baseQty: number, count: number, volumeRatio: number, maxMultiplier = 2.25, liveCount = 2, minQty = 0) {
  const vr = sharedBlockVolumeRatio(volumeRatio, liveCount, Math.max(0, maxMultiplier - 1));
  const floor = Math.max(0, minQty) * 1.08;
  let ratio = vr;
  if (floor > 0 && baseQty > 0) {
    const need = floor / baseQty;
    if (need > ratio) ratio = need;
  }
  const n = Math.max(1, Math.trunc(count));
  const cur = baseQty * blockMaxAdditionalRatio(n, ratio, maxMultiplier);
  const prev = n <= 1 ? 0 : baseQty * blockMaxAdditionalRatio(n - 1, ratio, maxMultiplier);
  const step = Math.max(0, cur - prev);
  if (step > 0 && floor > 0 && step < floor) return floor;
  return step;
}
export const DEFAULT_MAX_HOLD_BARS = 3;
export const DEFAULT_MAX_HOLD_TICKS = 16;
export const SHORT_SL_ATR = 1.15;

export function positionNotional(equity = BASE_EQUITY, costStep = 10): number {
  const step = Math.min(30, Math.max(3, costStep));
  return Math.max(equity * POSITION_COST_PCT * (step / 10), equity * POSITION_COST_PCT * 0.3);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sma(src: number[], period: number): number[] {
  const out = Array(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i]!;
    if (i >= period) sum -= src[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(src: number[], period: number): number[] {
  const out = Array(src.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = 0;
  let started = false;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    if (i < period) {
      sum += src[i]!;
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
        started = true;
      }
      continue;
    }
    if (!started) continue;
    prev = src[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(closes: number[], period = 14): number[] {
  const out = Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function trueRange(c: Candle[], i: number): number {
  if (i === 0) return c[i]!.h - c[i]!.l;
  const prev = c[i - 1]!.c;
  return Math.max(c[i]!.h - c[i]!.l, Math.abs(c[i]!.h - prev), Math.abs(c[i]!.l - prev));
}

function atr(candles: Candle[], period = 14): number[] {
  const tr = candles.map((_, i) => trueRange(candles, i));
  return ema(tr, period);
}

function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const eFast = ema(closes, fast);
  const eSlow = ema(closes, slow);
  const line = closes.map((_, i) => eFast[i]! - eSlow[i]!);
  const sig = ema(
    line.map((v) => (Number.isFinite(v) ? v : 0)),
    signal,
  );
  const hist = line.map((v, i) => v - sig[i]!);
  return { line, sig, hist };
}

function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = Array(closes.length).fill(NaN);
  const lower = Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let ss = 0;
    const m = mid[i]!;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j]! - m;
      ss += d * d;
    }
    const sd = Math.sqrt(ss / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  const k = Array(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j]!.h);
      lo = Math.min(lo, candles[j]!.l);
    }
    k[i] = hi === lo ? 50 : ((candles[i]!.c - lo) / (hi - lo)) * 100;
  }
  const d = sma(
    k.map((v) => (Number.isFinite(v) ? v : 50)),
    dPeriod,
  );
  return { k, d };
}

function dmi(candles: Candle[], period = 14) {
  const plusDM = Array(candles.length).fill(0);
  const minusDM = Array(candles.length).fill(0);
  const tr = candles.map((_, i) => trueRange(candles, i));
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i]!.h - candles[i - 1]!.h;
    const down = candles[i - 1]!.l - candles[i]!.l;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const smTR = ema(tr, period);
  const smP = ema(plusDM, period);
  const smM = ema(minusDM, period);
  const plusDI = smP.map((v, i) => (smTR[i] ? (100 * v) / smTR[i]! : NaN));
  const minusDI = smM.map((v, i) => (smTR[i] ? (100 * v) / smTR[i]! : NaN));
  const dx = plusDI.map((p, i) => {
    const m = minusDI[i]!;
    const s = p + m;
    return s === 0 || !Number.isFinite(s) ? NaN : (100 * Math.abs(p - m)) / s;
  });
  const adx = ema(
    dx.map((v) => (Number.isFinite(v) ? v : 0)),
    period,
  );
  return { plusDI, minusDI, adx };
}

function vwap(candles: Candle[]): number[] {
  const out = Array(candles.length).fill(NaN);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i]!.h + candles[i]!.l + candles[i]!.c) / 3;
    pv += tp * candles[i]!.v;
    vol += candles[i]!.v;
    out[i] = vol === 0 ? tp : pv / vol;
  }
  return out;
}

function supertrend(candles: Candle[], atrArr: number[], period = 10, mult = 3) {
  const st = Array(candles.length).fill(NaN);
  const dir = Array(candles.length).fill(0);
  let upper = 0;
  let lower = 0;
  let d = 1;
  for (let i = 0; i < candles.length; i++) {
    const a = atrArr[i];
    if (!Number.isFinite(a)) continue;
    const hl2 = (candles[i]!.h + candles[i]!.l) / 2;
    const bu = hl2 + mult * a!;
    const bl = hl2 - mult * a!;
    if (i === 0 || !Number.isFinite(st[i - 1]!)) {
      upper = bu;
      lower = bl;
      d = candles[i]!.c >= hl2 ? 1 : -1;
    } else {
      lower = bl > lower || candles[i - 1]!.c < lower ? bl : lower;
      upper = bu < upper || candles[i - 1]!.c > upper ? bu : upper;
      if (d === 1 && candles[i]!.c < lower) d = -1;
      else if (d === -1 && candles[i]!.c > upper) d = 1;
    }
    dir[i] = d;
    st[i] = d === 1 ? lower : upper;
  }
  return { st, dir };
}

function cci(candles: Candle[], period = 20): number[] {
  const tp = candles.map((c) => (c.h + c.l + c.c) / 3);
  const mid = sma(tp, period);
  const out = Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let mad = 0;
    for (let j = i - period + 1; j <= i; j++) mad += Math.abs(tp[j]! - mid[i]!);
    mad /= period;
    out[i] = mad === 0 ? 0 : (tp[i]! - mid[i]!) / (0.015 * mad);
  }
  return out;
}

function regimeDrift(i: number, n: number): number {
  const p = i / n;
  if (p < 0.22) return 0.00045;
  if (p < 0.38) return -0.00035;
  if (p < 0.52) return 0.00004;
  if (p < 0.74) return 0.0007;
  return -0.00028;
}

function generateCandles(
  seed: number,
  startPrice: number,
  vol: number,
  n: number,
): Candle[] {
  const rng = mulberry32(seed);
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const drift = regimeDrift(i, n) + (rng() - 0.5) * vol;
    const shock = rng() < 0.035 ? (rng() - 0.5) * vol * 5 : 0;
    const open = price;
    const close = Math.max(startPrice * 0.15, price * (1 + drift + shock));
    const wick = vol * (0.25 + rng() * 0.7);
    const high = Math.max(open, close) * (1 + rng() * wick);
    const low = Math.min(open, close) * (1 - rng() * wick);
    const body = Math.abs(close - open) / open;
    const volume = (80 + rng() * 920) * (1 + body * 18) * (rng() < 0.08 ? 2.4 : 1);
    candles.push({ t: T0 + i * BAR_MS, o: open, h: high, l: low, c: close, v: volume });
    price = close;
  }
  return candles;
}

export function computeIndicators(candles: Candle[]): IndicatorPack {
  const close = candles.map((c) => c.c);
  const vol = candles.map((c) => c.v);
  const m = macd(close);
  const bb = bollinger(close);
  const stoch = stochastic(candles);
  const d = dmi(candles);
  const atr14 = atr(candles, 14);
  const st = supertrend(candles, atr14);
  return {
    sma20: sma(close, 20),
    ema9: ema(close, 9),
    ema21: ema(close, 21),
    ema55: ema(close, 55),
    rsi14: rsi(close, 14),
    macd: m.line,
    macdSignal: m.sig,
    macdHist: m.hist,
    bbMid: bb.mid,
    bbUpper: bb.upper,
    bbLower: bb.lower,
    stochK: stoch.k,
    stochD: stoch.d,
    adx: d.adx,
    plusDI: d.plusDI,
    minusDI: d.minusDI,
    atr: atr14,
    vwap: vwap(candles),
    supertrend: st.st,
    stDir: st.dir,
    volSma: sma(vol, 20),
    cci: cci(candles),
    activity: activitySeries(candles, atr14, sma(vol, 20)),
    rangeChange: rangeChangeSeries(candles, atr14),
  };
}

function rangeChangeSeries(candles: Candle[], atr14: number[]): number[] {
  const out = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const a = atr14[i] || 0;
    const range = candles[i]!.h - candles[i]!.l;
    const shift = Math.abs(candles[i]!.c - candles[i - 1]!.c);
    out[i] = a > 0 ? (range + shift) / a : 0;
  }
  return out;
}

function activitySeries(candles: Candle[], atr14: number[], volSma: number[]): number[] {
  const rc = rangeChangeSeries(candles, atr14);
  const out = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const vs = volSma[i] || 0;
    const volX = vs > 0 ? candles[i]!.v / vs : 1;
    const fast = i >= 2 ? (candles[i]!.v + candles[i - 1]!.v) / Math.max((volSma[i] ?? 1) * 2, 1e-9) : volX;
    out[i] = Math.min(4, (volX * 0.55 + fast * 0.45) * (0.4 + rc[i]! * 0.6));
  }
  return out;
}

export interface ActivityRelation {
  pulse: number;
  range: number;
  vol: number;
  dir: number;
  volRange: number;
  pulseDir: number;
  rangeDir: number;
  agree: number;
  hf: boolean;
  timing: number;
}

export function activityRelations(pack: IndicatorPack, i: number, dir = 0): ActivityRelation {
  const pulse = Number.isFinite(pack.activity[i]) ? pack.activity[i]! : 0;
  const range = Number.isFinite(pack.rangeChange[i]) ? pack.rangeChange[i]! : 0;
  const vol = pulse / Math.max(0.4 + range * 0.6, 0.2);
  const hf = pulse >= 1.08 || (vol >= 1.15 && range >= 1.05);
  const volRange = vol >= 1.08 && range >= 1.0 ? Math.min(1, (vol - 1) * 0.6 + (range - 1) * 0.5) : 0;
  const pulseDir = pulse >= 1.02 && dir !== 0 ? Math.sign(dir) * Math.min(1, pulse / 1.35) : 0;
  const rangeDir = range >= 1.05 && dir !== 0 ? Math.sign(dir) * Math.min(1, range / 1.6) : 0;
  const flags = [pulse >= 1.05, range >= 1.05, vol >= 1.08, dir !== 0];
  const agree = flags.filter(Boolean).length / flags.length;
  const timing = clamp((dir !== 0 ? 0.55 : 0.15) + (hf ? 0.25 : 0) + agree * 0.2, 0, 1);
  return { pulse, range, vol, dir, volRange, pulseDir, rangeDir, agree, hf, timing };
}

function finite(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function crossUp(a: number[], b: number[], i: number): boolean {
  return i > 0 && finite(a[i]) && finite(b[i]) && finite(a[i - 1]) && finite(b[i - 1]) && a[i - 1]! <= b[i - 1]! && a[i]! > b[i]!;
}

function crossDn(a: number[], b: number[], i: number): boolean {
  return i > 0 && finite(a[i]) && finite(b[i]) && finite(a[i - 1]) && finite(b[i - 1]) && a[i - 1]! >= b[i - 1]! && a[i]! < b[i]!;
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: "normal",
    name: "Normal",
    kind: "normal",
    thesis: "General configs and lanes. Cost, range and tactic only — no extra strategy-type adjustment.",
    indicators: [
      { id: "ema", label: "EMA fast", params: { period: 9 } },
      { id: "ema", label: "EMA slow", params: { period: 21 } },
      { id: "vwap", label: "VWAP", params: {} },
    ],
  },
  {
    id: "ema-cross",
    name: "EMA Cross Pulse",
    kind: "trend",
    thesis: "9/21 EMA cross gated by ADX and volume expansion.",
    indicators: [
      { id: "ema", label: "EMA fast", params: { period: 9 } },
      { id: "ema", label: "EMA slow", params: { period: 21 } },
      { id: "adx", label: "ADX gate", params: { period: 14, threshold: 18 } },
      { id: "vol", label: "Volume SMA", params: { period: 20 } },
    ],
  },
  {
    id: "rsi-revert",
    name: "RSI Mean Revert",
    kind: "mean",
    thesis: "Fade RSI extremes at Bollinger bands.",
    indicators: [
      { id: "rsi", label: "RSI", params: { period: 14, oversold: 30, overbought: 70 } },
      { id: "bb", label: "Bollinger", params: { period: 20, std: 2 } },
    ],
  },
  {
    id: "macd-mom",
    name: "MACD Momentum",
    kind: "trend",
    thesis: "MACD histogram cross with signal confirmation.",
    indicators: [{ id: "macd", label: "MACD", params: { fast: 12, slow: 26, signal: 9 } }],
  },
  {
    id: "st-trail",
    name: "Supertrend Trail",
    kind: "trend",
    thesis: "Ride Supertrend flips, trail with ATR.",
    indicators: [
      { id: "supertrend", label: "Supertrend", params: { period: 10, multiplier: 3 } },
      { id: "atr", label: "ATR", params: { period: 14 } },
    ],
  },
  {
    id: "bb-bounce",
    name: "Bollinger Bounce",
    kind: "mean",
    thesis: "Reclaim of the band with Stochastic confirmation.",
    indicators: [
      { id: "bb", label: "Bollinger", params: { period: 20, std: 2 } },
      { id: "stoch", label: "Stochastic", params: { k: 14, d: 3 } },
    ],
  },
  {
    id: "vwap-axis",
    name: "VWAP Axis",
    kind: "hybrid",
    thesis: "Trades around session VWAP as the axis of value.",
    indicators: [
      { id: "vwap", label: "VWAP", params: {} },
      { id: "ema", label: "EMA 21", params: { period: 21 } },
      { id: "vol", label: "Volume SMA", params: { period: 20 } },
    ],
  },
  {
    id: "vol-break",
    name: "Volume Breakout",
    kind: "volume",
    thesis: "Range break on 2× volume with SMA bias.",
    indicators: [
      { id: "vol", label: "Volume SMA", params: { period: 20 } },
      { id: "sma", label: "SMA 20", params: { period: 20 } },
      { id: "atr", label: "ATR", params: { period: 14 } },
    ],
  },
  {
    id: "adx-gate",
    name: "ADX Trend Gate",
    kind: "trend",
    thesis: "+DI/−DI with ADX > 22, EMA 55 slope.",
    indicators: [
      { id: "adx", label: "ADX", params: { period: 14, threshold: 22 } },
      { id: "ema", label: "EMA 55", params: { period: 55 } },
    ],
  },
  {
    id: "stoch-swing",
    name: "Stoch Swing",
    kind: "mean",
    thesis: "Stochastic cycle turns with CCI filter.",
    indicators: [
      { id: "stoch", label: "Stochastic", params: { k: 14, d: 3 } },
      { id: "cci", label: "CCI", params: { period: 20 } },
    ],
  },
  {
    id: "confluence",
    name: "Confluence 3",
    kind: "hybrid",
    thesis: "Requires three of five independent confirms.",
    indicators: [
      { id: "ema", label: "EMA stack", params: { fast: 9, slow: 21 } },
      { id: "macd", label: "MACD", params: { fast: 12, slow: 26, signal: 9 } },
      { id: "supertrend", label: "Supertrend", params: { period: 10, multiplier: 3 } },
      { id: "rsi", label: "RSI", params: { period: 14 } },
      { id: "vol", label: "Volume SMA", params: { period: 20 } },
    ],
  },
  {
    id: "range-break",
    name: "Range Break",
    kind: "breakout",
    thesis: "20-bar high/low break with ATR expansion.",
    indicators: [
      { id: "atr", label: "ATR", params: { period: 14, multiplier: 1.2 } },
      { id: "sma", label: "SMA 20", params: { period: 20 } },
      { id: "vol", label: "Volume SMA", params: { period: 20 } },
    ],
  },
  {
    id: "atr-break",
    name: "ATR Break",
    kind: "breakout",
    thesis: "Close beyond ATR envelope on rising range.",
    indicators: [
      { id: "atr", label: "ATR", params: { period: 14, multiplier: 1.5 } },
      { id: "ema", label: "EMA 21", params: { period: 21 } },
    ],
  },
  {
    id: "active-hf",
    name: "Active High-Freq",
    kind: "active",
    thesis: "High activity prints — volume burst and ranging change.",
    indicators: [
      { id: "vol", label: "Volume SMA", params: { period: 8 } },
      { id: "atr", label: "ATR", params: { period: 7 } },
      { id: "ema", label: "EMA fast", params: { period: 9 } },
    ],
  },
  {
    id: "range-shift",
    name: "Range Shift",
    kind: "active",
    thesis: "Regime change when range expands and activity stays high.",
    indicators: [
      { id: "atr", label: "ATR", params: { period: 14 } },
      { id: "bb", label: "Bollinger", params: { period: 20, std: 2 } },
      { id: "vol", label: "Volume SMA", params: { period: 12 } },
    ],
  },
  {
    id: "block-stack",
    name: "Block Stack",
    kind: "block",
    thesis: "Same-side consecutive fills form a block; scale or cut the whole book, not the lane.",
    indicators: [
      { id: "ema", label: "EMA fast", params: { period: 9 } },
      { id: "vol", label: "Volume SMA", params: { period: 12 } },
      { id: "atr", label: "ATR", params: { period: 10 } },
    ],
  },
  {
    id: "block-scale",
    name: "Block Scale",
    kind: "block",
    thesis: "Winning blocks add, conflicting blocks flatten — overall active orders only.",
    indicators: [
      { id: "vwap", label: "VWAP", params: {} },
      { id: "adx", label: "ADX", params: { period: 14, threshold: 16 } },
      { id: "vol", label: "Volume SMA", params: { period: 8 } },
    ],
  },
];

const KIND_BY_ID: Record<string, StrategyKind> = Object.fromEntries(STRATEGIES.map((s) => [s.id, s.kind]));

const LASTN_CACHE = new Map<string, { pf: number; wr: number; net: number }>();
const LANE_MEMO = new Map<string, Lane[]>();
function lastNBase(bt: Backtest, n: number) {
  const k = `${bt.strategyId}:${bt.symbol}:${n}:${bt.trades.length}`;
  const hit = LASTN_CACHE.get(k);
  if (hit) return hit;
  const slice = bt.trades.slice(-n);
  const s = slice.length ? statsFromTrades(slice) : { pf: 0, wr: 0, net: 0 };
  const row = { pf: s.pf, wr: s.wr, net: s.net };
  if (LASTN_CACHE.size > 4000) LASTN_CACHE.clear();
  LASTN_CACHE.set(k, row);
  return row;
}

export interface IndicationConfig {
  id: string;
  kind: IndicationId;
  label: string;
  params: Record<string, number>;
}

export const INDICATION_CONFIGS: IndicationConfig[] = [
  { id: "trend-ema", kind: "trend", label: "Trend EMA 9/21", params: { adx: 16 } },
  { id: "trend-adx", kind: "trend", label: "Trend ADX 26", params: { adx: 26 } },
  { id: "trend-st", kind: "trend", label: "Trend Supertrend", params: { multiplier: 3 } },
  { id: "break-vol", kind: "break", label: "Break volume 1.6×", params: { volMult: 1.6 } },
  { id: "break-atr", kind: "break", label: "Break ATR 1.15×", params: { atrMult: 1.15 } },
  { id: "break-hi", kind: "break", label: "Break 8-bar range", params: { lookback: 8 } },
  { id: "active-hf", kind: "active", label: "Active high-freq", params: { lookback: 4, volMult: 1.15 } },
  { id: "active-range", kind: "active", label: "Active range shift", params: { lookback: 6, volMult: 1.05 } },
  { id: "active-burst", kind: "active", label: "Active burst", params: { lookback: 3, volMult: 1.5 } },
  { id: "dir-cross", kind: "direction", label: "Dir EMA cross", params: { lookback: 5 } },
  { id: "dir-st", kind: "direction", label: "Dir Supertrend flip", params: { lookback: 6 } },
  { id: "dir-axis", kind: "direction", label: "Dir axis VWAP", params: { lookback: 5 } },
  { id: "dir-macd", kind: "direction", label: "Dir MACD flip", params: { lookback: 5 } },
];

export const INDICATION_KINDS: { id: IndicationId; label: string; blurb: string }[] = [
  { id: "trend", label: "Trend", blurb: "Independent trend indications on every lane" },
  { id: "break", label: "Break", blurb: "Independent breakout indications on every lane" },
  { id: "active", label: "Active", blurb: "High-frequency activity and ranging-change indications" },
  { id: "direction", label: "Direction", blurb: "Direction-change tactics: EMA, Supertrend, VWAP axis, MACD" },
];

function signalFor(id: string, candles: Candle[], ind: IndicatorPack): number[] {
  const out = Array(candles.length).fill(0);
  const closes = candles.map((x) => x.c);
  for (let i = WARMUP; i < candles.length; i++) {
    const c = candles[i]!.c;
    switch (id) {
      case "normal": {
        if (crossUp(ind.ema9, ind.ema21, i)) out[i] = 1;
        else if (crossDn(ind.ema9, ind.ema21, i)) out[i] = -1;
        break;
      }
      case "ema-cross": {
        const volOk = finite(ind.volSma[i]) && candles[i]!.v > ind.volSma[i]! * 1.05;
        const adxOk = finite(ind.adx[i]) && ind.adx[i]! > 18;
        if (crossUp(ind.ema9, ind.ema21, i) && adxOk && volOk) out[i] = 1;
        else if (crossDn(ind.ema9, ind.ema21, i) && adxOk && volOk) out[i] = -1;
        break;
      }
      case "rsi-revert": {
        if (finite(ind.rsi14[i]) && finite(ind.bbLower[i]) && ind.rsi14[i]! < 32 && c <= ind.bbLower[i]!) out[i] = 1;
        else if (finite(ind.rsi14[i]) && finite(ind.bbUpper[i]) && ind.rsi14[i]! > 68 && c >= ind.bbUpper[i]!) out[i] = -1;
        break;
      }
      case "macd-mom": {
        if (crossUp(ind.macd, ind.macdSignal, i) && (ind.macdHist[i] ?? 0) > 0) out[i] = 1;
        else if (crossDn(ind.macd, ind.macdSignal, i) && (ind.macdHist[i] ?? 0) < 0) out[i] = -1;
        break;
      }
      case "st-trail": {
        if (i > 0 && ind.stDir[i] === 1 && ind.stDir[i - 1] !== 1) out[i] = 1;
        else if (i > 0 && ind.stDir[i] === -1 && ind.stDir[i - 1] !== -1) out[i] = -1;
        break;
      }
      case "bb-bounce": {
        if (
          i > 0 &&
          finite(ind.bbLower[i]) &&
          candles[i - 1]!.c < ind.bbLower[i - 1]! &&
          c > ind.bbLower[i]! &&
          (ind.stochK[i] ?? 100) < 35
        )
          out[i] = 1;
        else if (
          i > 0 &&
          finite(ind.bbUpper[i]) &&
          candles[i - 1]!.c > ind.bbUpper[i - 1]! &&
          c < ind.bbUpper[i]! &&
          (ind.stochK[i] ?? 0) > 65
        )
          out[i] = -1;
        break;
      }
      case "vwap-axis": {
        const volOk = finite(ind.volSma[i]) && candles[i]!.v > ind.volSma[i]!;
        if (crossUp(closes, ind.vwap, i) && volOk && c > (ind.ema21[i] ?? c)) out[i] = 1;
        else if (crossDn(closes, ind.vwap, i) && volOk && c < (ind.ema21[i] ?? c)) out[i] = -1;
        break;
      }
      case "vol-break": {
        const volOk = finite(ind.volSma[i]) && candles[i]!.v > ind.volSma[i]! * 1.8;
        if (volOk && finite(ind.sma20[i]) && c > ind.sma20[i]! && c > candles[i]!.o) out[i] = 1;
        else if (volOk && finite(ind.sma20[i]) && c < ind.sma20[i]! && c < candles[i]!.o) out[i] = -1;
        break;
      }
      case "adx-gate": {
        if (
          finite(ind.adx[i]) &&
          ind.adx[i]! > 22 &&
          finite(ind.plusDI[i]) &&
          finite(ind.minusDI[i]) &&
          finite(ind.ema55[i]) &&
          finite(ind.ema55[i - 1])
        ) {
          const slope = ind.ema55[i]! - ind.ema55[i - 1]!;
          if (ind.plusDI[i]! > ind.minusDI[i]! && slope > 0) out[i] = 1;
          else if (ind.minusDI[i]! > ind.plusDI[i]! && slope < 0) out[i] = -1;
        }
        break;
      }
      case "stoch-swing": {
        if (crossUp(ind.stochK, ind.stochD, i) && (ind.stochK[i] ?? 50) < 28 && (ind.cci[i] ?? 0) < -50) out[i] = 1;
        else if (crossDn(ind.stochK, ind.stochD, i) && (ind.stochK[i] ?? 50) > 72 && (ind.cci[i] ?? 0) > 50) out[i] = -1;
        break;
      }
      case "confluence": {
        let long = 0;
        let short = 0;
        if (finite(ind.ema9[i]) && finite(ind.ema21[i]) && ind.ema9[i]! > ind.ema21[i]!) long++;
        else if (finite(ind.ema9[i]) && finite(ind.ema21[i]) && ind.ema9[i]! < ind.ema21[i]!) short++;
        if (finite(ind.macd[i]) && finite(ind.macdSignal[i]) && ind.macd[i]! > ind.macdSignal[i]!) long++;
        else if (finite(ind.macd[i]) && finite(ind.macdSignal[i])) short++;
        if (ind.stDir[i] === 1) long++;
        else if (ind.stDir[i] === -1) short++;
        if (finite(ind.rsi14[i]) && ind.rsi14[i]! > 45 && ind.rsi14[i]! < 70) long++;
        else if (finite(ind.rsi14[i]) && ind.rsi14[i]! < 55 && ind.rsi14[i]! > 30) short++;
        if (finite(ind.volSma[i]) && candles[i]!.v > ind.volSma[i]!) {
          if (c > candles[i]!.o) long++;
          else short++;
        }
        if (long >= 3 && long > short) out[i] = 1;
        else if (short >= 3 && short > long) out[i] = -1;
        break;
      }
      case "range-break": {
        const look = 20;
        if (i < look) break;
        let hi = -Infinity;
        let lo = Infinity;
        for (let k = i - look; k < i; k++) {
          hi = Math.max(hi, candles[k]!.h);
          lo = Math.min(lo, candles[k]!.l);
        }
        const volOk = finite(ind.volSma[i]) && candles[i]!.v > ind.volSma[i]! * 1.15;
        const expand = finite(ind.atr[i]) && candles[i]!.h - candles[i]!.l > ind.atr[i]! * 1.1;
        if (volOk && expand && c > hi) out[i] = 1;
        else if (volOk && expand && c < lo) out[i] = -1;
        break;
      }
      case "atr-break": {
        if (!finite(ind.atr[i]) || !finite(ind.ema21[i])) break;
        const band = ind.atr[i]! * 1.5;
        const expand = (ind.rangeChange[i] ?? 0) > 1.15;
        if (expand && c > ind.ema21[i]! + band) out[i] = 1;
        else if (expand && c < ind.ema21[i]! - band) out[i] = -1;
        break;
      }
      case "active-hf": {
        const act = ind.activity[i] ?? 0;
        if (act < 1.2) break;
        if (crossUp(ind.ema9, ind.ema21, i) || (c > candles[i]!.o && act > 1.6)) out[i] = 1;
        else if (crossDn(ind.ema9, ind.ema21, i) || (c < candles[i]!.o && act > 1.6)) out[i] = -1;
        break;
      }
      case "range-shift": {
        const rc = ind.rangeChange[i] ?? 0;
        const act = ind.activity[i] ?? 0;
        if (rc < 1.05 || act < 1.05) break;
        if (finite(ind.bbUpper[i]) && c > ind.bbUpper[i]! && c > candles[i]!.o) out[i] = 1;
        else if (finite(ind.bbLower[i]) && c < ind.bbLower[i]! && c < candles[i]!.o) out[i] = -1;
        break;
      }
      case "block-stack": {
        const look = 4;
        if (i < look) break;
        let up = 0;
        let dn = 0;
        for (let k = i - look + 1; k <= i; k++) {
          if (candles[k]!.c >= candles[k]!.o) up++;
          else dn++;
        }
        const volOk = finite(ind.volSma[i]) && candles[i]!.v > ind.volSma[i]! * 1.05;
        if (volOk && up >= 3 && c > (ind.ema9[i] ?? c)) out[i] = 1;
        else if (volOk && dn >= 3 && c < (ind.ema9[i] ?? c)) out[i] = -1;
        break;
      }
      case "block-scale": {
        const adxOk = finite(ind.adx[i]) && ind.adx[i]! >= 16;
        const volOk = finite(ind.volSma[i]) && candles[i]!.v > ind.volSma[i]!;
        const above = finite(ind.vwap[i]) && c > ind.vwap[i]!;
        if (adxOk && volOk && above) out[i] = 1;
        else if (adxOk && volOk && finite(ind.vwap[i]) && c < ind.vwap[i]!) out[i] = -1;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function mddAndDdt(equity: number[]): { mdd: number; ddt: number } {
  let peak = equity[0] ?? BASE_EQUITY;
  let maxDd = 0;
  let maxDur = 0;
  let dur = 0;
  for (const eq of equity) {
    if (eq >= peak) {
      peak = eq;
      dur = 0;
    } else {
      dur += 1;
      maxDur = Math.max(maxDur, dur);
      const dd = (peak - eq) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return { mdd: maxDd, ddt: maxDur };
}

export function statsFromTrades(trades: Trade[], equity?: number[]): Stats {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const profit = wins.reduce((s, t) => s + t.pnl, 0);
  const loss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const net = trades.reduce((s, t) => s + t.pnl, 0);
  const pf = loss === 0 ? (profit > 0 ? 4.5 : 0) : profit / loss;
  const wr = trades.length ? wins.length / trades.length : 0;
  const avgWin = wins.length ? profit / wins.length : 0;
  const avgLoss = losses.length ? loss / losses.length : 0;
  const expectancy = trades.length ? net / trades.length : 0;
  const eq =
    equity ??
    trades.reduce<number[]>((acc, t) => {
      acc.push((acc[acc.length - 1] ?? BASE_EQUITY) + t.pnl);
      return acc;
    }, []);
  const { mdd, ddt } = mddAndDdt(eq.length ? eq : [BASE_EQUITY]);
  const volSum = trades.reduce((s, t) => s + t.volume, 0);
  const eqAvg = trades.length ? net / trades.length : 0;
  const vw = volSum === 0 ? eqAvg : trades.reduce((s, t) => s + t.pnl * t.volume, 0) / volSum;
  const rawVf = eqAvg === 0 || !Number.isFinite(vw / eqAvg) ? 1 : vw / eqAvg;
  const volumeFactor = clamp(Number.isFinite(rawVf) ? rawVf : 1, 0.4, 2.2);
  const pnls = trades.map((t) => t.pnl);
  const mean = expectancy;
  const variance = pnls.length
    ? pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / pnls.length
    : 0;
  const std = Math.sqrt(variance);
  const sqn = std === 0 ? 0 : (mean / std) * Math.sqrt(Math.max(trades.length, 1));
  const recovery = mdd === 0 ? (net > 0 ? 5 : 0) : net / (mdd * BASE_EQUITY);
  const holds = trades.map((t) => Math.max(0, t.exitBar - t.entryBar));
  const avgHold = holds.length ? holds.reduce((s, n) => s + n, 0) / holds.length : 0;
  return {
    trades: trades.length,
    wins: wins.length,
    wr,
    pf,
    net,
    mdd,
    ddt,
    expectancy,
    volumeFactor,
    recovery,
    sqn,
    avgWin,
    avgLoss,
    profit,
    loss,
    avgHold,
  };
}

function runBacktest(
  strategyId: string,
  symbol: string,
  candles: Candle[],
  ind: IndicatorPack,
): Backtest {
  const signals = signalFor(strategyId, candles, ind);
  const trades: Trade[] = [];
  const equity: number[] = [];
  let side: 0 | 1 | -1 = 0;
  let entry = 0;
  let entryBar = 0;
  let entryVol = 0;
  let cash = BASE_EQUITY;
  let tradeN = 0;

  const closeNow = (i: number, px: number) => {
    if (side === 0) return;
    const pnl = ((side * (px - entry)) / entry) * UNIT_NOTIONAL;
    trades.push({
      id: `${strategyId}:${symbol}:${tradeN++}`,
      strategyId,
      symbol,
      side: side === 1 ? "long" : "short",
      entryBar,
      exitBar: i,
      entry,
      exit: px,
      pnl,
      volume: (entryVol + candles[i]!.v) / 2,
      cost: 10,
    });
    cash += pnl;
    side = 0;
  };

  for (let i = WARMUP; i < candles.length; i++) {
    const c = candles[i]!;
    const a = finite(ind.atr[i]) ? ind.atr[i]! : c.c * 0.01;
    if (side !== 0) {
      const stop = side === 1 ? entry - SHORT_SL_ATR * a : entry + SHORT_SL_ATR * a;
      const hitStop = side === 1 ? c.l <= stop : c.h >= stop;
      const flip = signals[i] === -side;
      const held = i - entryBar;
      const timeStop = held >= DEFAULT_MAX_HOLD_BARS;
      const stale = held >= 2 && (ind.activity[i] ?? 0) < 0.82 && !flip;
      if (hitStop || flip || timeStop || stale) closeNow(i, hitStop ? stop : c.c);
    }
    if (side === 0 && (signals[i] === 1 || signals[i] === -1)) {
      side = signals[i] as 1 | -1;
      entry = c.c;
      entryBar = i;
      entryVol = c.v;
    }
    let eq = cash;
    if (side !== 0) eq += ((side * (c.c - entry)) / entry) * UNIT_NOTIONAL;
    equity.push(eq);
  }
  if (side !== 0) closeNow(candles.length - 1, candles[candles.length - 1]!.c);

  return {
    strategyId,
    symbol,
    trades,
    equity,
    signals,
    stats: statsFromTrades(trades, equity),
  };
}

const RANGE_MOD: Record<RangeType, { pf: number; mdd: number; wr: number; vf: number; trades: number }> = {
  linear: { pf: 1.05, mdd: 0.96, wr: 1.03, vf: 1.02, trades: 1.08 },
  geometric: { pf: 1.02, mdd: 1.08, wr: 0.97, vf: 0.96, trades: 0.9 },
  atr: { pf: 1.14, mdd: 0.84, wr: 1.04, vf: 1.04, trades: 1.1 },
  volume: { pf: 1.06, mdd: 0.92, wr: 1.03, vf: 1.18, trades: 1.12 },
  fibonacci: { pf: 1.04, mdd: 0.98, wr: 1.02, vf: 1.0, trades: 1.02 },
};

const TACTIC_MOD: Record<TacticKind, { pf: number; mdd: number; wr: number; vf: number; trades: number }> = {
  trailing: { pf: 1.13, mdd: 0.76, wr: 0.94, vf: 1.0, trades: 0.84 },
  dca: { pf: 0.93, mdd: 0.68, wr: 1.15, vf: 1.05, trades: 1.38 },
  axis: { pf: 1.06, mdd: 0.86, wr: 1.07, vf: 1.1, trades: 1.18 },
  hybrid: { pf: 1.09, mdd: 0.8, wr: 1.05, vf: 1.07, trades: 1.1 },
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function costShape(cost: number, key: number) {
  const sweet = 6 + (key % 16);
  const dist = Math.abs(cost - sweet) / 16;
  const slip = (cost - 3) * 0.0035;
  return {
    pf: 1.16 - dist * 0.32 - slip,
    mdd: 0.82 + dist * 0.38 + (cost / 40) * 0.28,
    wr: 1.04 - dist * 0.12 - slip * 0.4,
  };
}

function tacticCfgMod(cfg: TacticConfig, tactic: TacticKind, trailPct?: number, tpRatio?: number) {
  const trail = 1 + (0.8 - (trailPct ?? cfg.trailingPct)) * 0.05;
  const dca = 1 + (cfg.dcaCount - 3) * 0.015 - Math.abs(cfg.dcaDrawdown - 0.8) * 0.04;
  const axis = 1 + (cfg.axisLevels - 4) * 0.012 - Math.abs(cfg.axisSpacing - 0.55) * 0.05;
  const ratio = snapTpRatio(tpRatio ?? cfg.tpRatio);
  const slr = 1 + (ratio - 2.75) * 0.04;
  const hold = 1 + (DEFAULT_MAX_HOLD_TICKS - (cfg.maxHoldTicks ?? DEFAULT_MAX_HOLD_TICKS)) * 0.006;
  if (tactic === "trailing") return { pf: trail * slr * hold, mdd: (2 - trail) / slr, wr: 1 / trail * (1 - (ratio - 2.75) * 0.015) };
  if (tactic === "dca") return { pf: dca * 0.98 * slr * hold, mdd: 1.1 / dca / slr, wr: dca };
  if (tactic === "axis") return { pf: axis * slr * hold, mdd: 1.05 / axis / slr, wr: (axis + 1) / 2 };
  return { pf: ((trail + dca + axis) / 3) * slr * hold, mdd: 0.95 / slr, wr: 1.02 };
}

export function isPositive(
  s: { pf: number; mdd: number; wr: number; volumeFactor: number; ddt?: number },
  th: Thresholds,
) {
  const vfFloor = Math.max(th.minVf, MIN_VOLUME_FACTOR);
  if (s.pf < th.minPf) return false;
  if (s.mdd > th.maxMdd) return false;
  if (s.wr < th.minWr) return false;
  if (s.volumeFactor < vfFloor) return false;
  if (s.ddt != null && s.ddt > th.maxDdt) return false;
  return true;
}

export interface IndicationHit {
  configId: string;
  kind: IndicationId;
  dir: number;
  strength: number;
  activity: number;
}

export interface IndicationSummary {
  trend: number;
  break: number;
  active: number;
  direction: number;
  activity: number;
  hf: boolean;
  agree: boolean;
  hits: number;
  timing: number;
  relations: ActivityRelation;
}

function clampDir(n: number) {
  return clamp(n, -1, 1);
}

export function processIndication(
  cfg: IndicationConfig,
  pack: IndicatorPack,
  candles: Candle[],
  i: number,
): IndicationHit {
  const c = candles[i];
  const activity = pack.activity[i] ?? 0;
  let dir = 0;
  let strength = 0;
  if (!c) return { configId: cfg.id, kind: cfg.kind, dir: 0, strength: 0, activity };
  if (cfg.kind === "trend") {
    const adxMin = cfg.params.adx ?? 18;
    const adxOk = finite(pack.adx[i]) && pack.adx[i]! >= adxMin;
    const emaUp = finite(pack.ema9[i]) && finite(pack.ema21[i]) && pack.ema9[i]! > pack.ema21[i]!;
    const stUp = pack.stDir[i] === 1;
    if (cfg.id === "trend-st") {
      dir = pack.stDir[i] ?? 0;
      strength = adxOk ? 0.85 : 0.45;
    } else if (cfg.id === "trend-adx") {
      if (adxOk && finite(pack.plusDI[i]) && finite(pack.minusDI[i])) {
        dir = pack.plusDI[i]! > pack.minusDI[i]! ? 1 : -1;
        strength = Math.min(1, pack.adx[i]! / 40);
      }
    } else {
      if (emaUp) dir = 1;
      else if (finite(pack.ema9[i]) && finite(pack.ema21[i])) dir = -1;
      strength = adxOk ? 0.7 : 0.4;
    }
    if (stUp && dir === 1) strength = Math.min(1, strength + 0.15);
    if (pack.stDir[i] === -1 && dir === -1) strength = Math.min(1, strength + 0.15);
  } else if (cfg.kind === "break") {
    const volMult = cfg.params.volMult ?? 1.5;
    const atrMult = cfg.params.atrMult ?? 1.3;
    const look = Math.max(4, Math.round(cfg.params.lookback ?? 16));
    const volOk = finite(pack.volSma[i]) && c.v > pack.volSma[i]! * volMult;
    const expand = (pack.rangeChange[i] ?? 0) >= atrMult * 0.7;
    if (cfg.id === "break-hi" && i >= look) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = i - look; k < i; k++) {
        hi = Math.max(hi, candles[k]!.h);
        lo = Math.min(lo, candles[k]!.l);
      }
      if (c.c > hi) dir = 1;
      else if (c.c < lo) dir = -1;
      strength = expand ? 0.8 : 0.45;
    } else if (volOk || expand) {
      dir = c.c >= c.o ? 1 : -1;
      strength = volOk && expand ? 0.9 : 0.55;
    }
  } else if (cfg.kind === "active") {
    const look = Math.max(3, Math.round(cfg.params.lookback ?? 6));
    const volMult = cfg.params.volMult ?? 1.2;
    let act = 0;
    const from = Math.max(1, i - look + 1);
    for (let k = from; k <= i; k++) act += pack.activity[k] ?? 0;
    act /= Math.max(1, i - from + 1);
    const volOk = finite(pack.volSma[i]) && c.v > pack.volSma[i]! * volMult;
    const ranging = (pack.rangeChange[i] ?? 0) > 0.85;
    if (act >= 1.05 && (volOk || ranging)) {
      dir = c.c >= c.o ? 1 : -1;
      strength = Math.min(1, 0.35 + act * 0.28);
    }
  } else if (cfg.kind === "direction" && i > 0) {
    const look = Math.max(2, Math.round(cfg.params.lookback ?? 8));
    const signAt = (k: number): number => {
      if (cfg.id === "dir-st") return pack.stDir[k] ?? 0;
      if (cfg.id === "dir-axis") {
        const v = pack.vwap[k];
        return finite(v) ? Math.sign(candles[k]!.c - v!) : 0;
      }
      if (cfg.id === "dir-macd") return Math.sign(pack.macdHist[k] ?? 0);
      const e9 = pack.ema9[k];
      const e21 = pack.ema21[k];
      return finite(e9) && finite(e21) ? Math.sign(e9! - e21!) : 0;
    };
    for (let k = i; k > i - look && k > 0; k--) {
      const now = signAt(k);
      const was = signAt(k - 1);
      if (now !== 0 && now !== was) {
        dir = now;
        const age = i - k;
        const base = cfg.id === "dir-st" ? 0.85 : cfg.id === "dir-axis" ? 0.8 : cfg.id === "dir-macd" ? 0.78 : 0.75;
        strength = base * (1 - age / look);
        break;
      }
    }
    if (dir !== 0 && (pack.activity[i] ?? 0) >= 1.1) strength = Math.min(1, strength + 0.12);
  }
  return { configId: cfg.id, kind: cfg.kind, dir, strength, activity };
}

export function processAllIndications(pack: IndicatorPack, candles: Candle[], i: number): IndicationHit[] {
  return INDICATION_CONFIGS.map((cfg) => processIndication(cfg, pack, candles, i));
}

export function summarizeIndications(hits: IndicationHit[]): IndicationSummary {
  const by: Record<IndicationId, { w: number; s: number; n: number }> = {
    trend: { w: 0, s: 0, n: 0 },
    break: { w: 0, s: 0, n: 0 },
    active: { w: 0, s: 0, n: 0 },
    direction: { w: 0, s: 0, n: 0 },
  };
  let activity = 0;
  for (const h of hits) {
    by[h.kind].w += h.dir * h.strength;
    by[h.kind].s += h.strength;
    by[h.kind].n += 1;
    activity += h.activity;
  }
  const trend = by.trend.s ? clampDir(by.trend.w / by.trend.s) : 0;
  const brk = by.break.s ? clampDir(by.break.w / by.break.s) : 0;
  const active = by.active.s ? clampDir(by.active.w / by.active.s) : 0;
  const direction = by.direction.s ? clampDir(by.direction.w / by.direction.s) : 0;
  activity = hits.length ? activity / hits.length : 0;
  const signed = [trend, brk, active, direction].filter((x) => Math.abs(x) > 0.12);
  const agree =
    signed.length >= 2 && signed.every((x) => Math.sign(x) === Math.sign(signed[0]!));
  const dummy: ActivityRelation = {
    pulse: activity,
    range: 0,
    vol: activity,
    dir: direction,
    volRange: 0,
    pulseDir: direction !== 0 && activity >= 1.05 ? Math.sign(direction) : 0,
    rangeDir: 0,
    agree: signed.length / 4,
    hf: activity >= 1.08 || Math.abs(direction) >= 0.6,
    timing: clamp((Math.abs(direction) > 0.12 ? 0.55 : 0.2) + (activity >= 1.08 ? 0.25 : 0) + (agree ? 0.15 : 0), 0, 1),
  };
  return {
    trend,
    break: brk,
    active,
    direction,
    activity,
    hf: dummy.hf,
    agree,
    hits: hits.filter((h) => h.dir !== 0).length,
    timing: dummy.timing,
    relations: dummy,
  };
}

export function symbolIndications(symbol: string): IndicationSummary {
  if (IND_CACHE[symbol]) return IND_CACHE[symbol]!;
  return {
    trend: 0,
    break: 0,
    active: 0,
    direction: 0,
    activity: 0,
    hf: false,
    agree: false,
    hits: 0,
    timing: 0,
    relations: {
      pulse: 0,
      range: 0,
      vol: 0,
      dir: 0,
      volRange: 0,
      pulseDir: 0,
      rangeDir: 0,
      agree: 0,
      hf: false,
      timing: 0,
    },
  };
}

const IND_CACHE: Record<string, IndicationSummary> = {};

function indicationLaneAdj(kind: StrategyKind, sum: IndicationSummary): StrategyAdj & { vf: number } {
  const w =
    kind === "trend"
      ? { t: 1.35, b: 0.8, a: 0.85, d: 1.1 }
      : kind === "breakout"
        ? { t: 0.8, b: 1.35, a: 1, d: 1.15 }
        : kind === "active"
          ? { t: 0.75, b: 1, a: 1.4, d: 1.05 }
          : kind === "hybrid"
            ? { t: 1, b: 1, a: 1.05, d: 1.25 }
            : kind === "block"
              ? { t: 0.9, b: 1.05, a: 1.1, d: 1.2 }
              : { t: 1, b: 1, a: 1, d: 1.1 };
  const aligned =
    (sum.trend * w.t + sum.break * w.b + sum.active * w.a + sum.direction * w.d) / (w.t + w.b + w.a + w.d);
  const mag = Math.abs(aligned);
  const hfBoost = sum.hf ? 0.05 : 0;
  const agreeBoost = sum.agree ? 0.06 : -0.02;
  const flipBoost = Math.abs(sum.direction) >= 0.5 ? 0.04 : 0;
  const timeBoost = sum.timing * 0.05;
  const relBoost = (sum.relations?.agree ?? 0) * 0.04;
  return {
    pf: clamp(1 + mag * 0.1 + hfBoost + agreeBoost + flipBoost + timeBoost + relBoost, 0.82, 1.28),
    mdd: clamp(1 + (sum.hf ? 0.04 : 0) + (sum.agree ? -0.04 : 0.05) + (Math.abs(sum.direction) >= 0.7 ? 0.03 : 0), 0.8, 1.25),
    wr: clamp(1 + mag * 0.06 + sum.active * 0.04 * w.a + agreeBoost + timeBoost * 0.5, 0.84, 1.18),
    vf: clamp(1 + sum.activity * 0.12 + (sum.hf ? 0.08 : 0) + Math.abs(sum.direction) * 0.05 + relBoost, 0.7, 1.55),
  };
}

export function deriveCombo(
  bt: Backtest,
  strategyName: string,
  cost: number,
  range: RangeType,
  tactic: TacticKind,
  lastN: number,
  cfg: TacticConfig,
  th: Thresholds,
  adj?: StrategyAdj,
  trailPct?: number,
  tpRatio?: number,
): ComboResult {
  const trail = trailPct ?? cfg.trailingPct;
  const ratio = snapTpRatio(tpRatio ?? cfg.tpRatio);
  const key = hashStr(`${bt.strategyId}:${bt.symbol}:${range}:${tactic}:${trail}:${ratio}`);
  const shape = costShape(cost, key);
  const rm = RANGE_MOD[range];
  const tm = TACTIC_MOD[tactic];
  const cm = tacticCfgMod(cfg, tactic, trail, ratio);
  const stKind = (KIND_BY_ID[bt.strategyId] ?? "normal") as StrategyKind;
  const indSum = symbolIndications(bt.symbol);
  const indAdj = indicationLaneAdj(stKind, indSum);
  const scale = cost / 10;
  const stack = rm.pf * tm.pf * shape.pf * cm.pf * (adj?.pf ?? 1) * indAdj.pf;
  const pf = clamp(bt.stats.pf * Math.pow(stack, 0.55), 0.28, 5.2);
  const mdd = clamp(
    (bt.stats.mdd / POSITION_COST_PCT) * rm.mdd * tm.mdd * shape.mdd * cm.mdd * (adj?.mdd ?? 1) * indAdj.mdd,
    0.001,
    0.72,
  );
  const wr = clamp(bt.stats.wr * rm.wr * tm.wr * shape.wr * cm.wr * (adj?.wr ?? 1) * indAdj.wr, 0.12, 0.92);
  const vf = clamp(bt.stats.volumeFactor * rm.vf * tm.vf * indAdj.vf, 0.4, 2.2);
  const trades = Math.max(1, Math.round(bt.stats.trades * rm.trades * tm.trades));
  const net = bt.stats.net * scale * (pf / Math.max(bt.stats.pf, 0.2));
  const lastBase = lastNBase(bt, lastN);
  const last = {
    pf: lastBase.pf * (0.85 + 0.15 * (pf / Math.max(bt.stats.pf, 0.2))),
    wr: lastBase.wr,
    net: lastBase.net * scale,
  };
  const ddt = Math.round(bt.stats.ddt * tm.mdd * shape.mdd);
  const positive = isPositive({ pf, mdd, wr, volumeFactor: vf, ddt }, th);
  const lastNPositive =
    last.pf >= th.minPf && last.wr >= th.minWr && last.net > 0 && vf >= Math.max(th.minVf, MIN_VOLUME_FACTOR) && ddt <= th.maxDdt;
  return {
    id: `${bt.strategyId}|${bt.symbol}|${cost}|${range}|${tactic}|${trail}|${ratio}`,
    strategyId: bt.strategyId,
    strategyName,
    symbol: bt.symbol,
    costStep: cost,
    rangeType: range,
    tactic,
    trailPct: trail,
    tpRatio: ratio,
    pf,
    mdd,
    ddt,
    wr,
    volumeFactor: vf,
    net,
    trades,
    lastNPf: last.pf,
    lastNWr: last.wr,
    lastNNet: last.net,
    positive,
    lastNPositive,
    rank: 0,
    sweet: shape.pf > 1.05,
  };
}

export function pickBestCombo(rows: ComboResult[]): ComboResult | null {
  if (!rows.length) return null;
  const gated = rows.filter((r) => r.positive && r.lastNPositive && r.volumeFactor >= MIN_VOLUME_FACTOR);
  const pool = gated.length ? gated : rows.filter((r) => r.volumeFactor >= MIN_VOLUME_FACTOR);
  const use = pool.length ? pool : rows;
  return [...use].sort((a, b) => b.pf - a.pf || b.wr - a.wr || a.mdd - b.mdd)[0] ?? null;
}

export function lastNEval(bt: Backtest | undefined | null, n: number): Stats {
  return statsFromTrades((bt?.trades ?? []).slice(-n));
}

function demoConnections(): Connection[] {
  const types: Connection["orderTypesEnabled"] = [
    "market",
    "limit",
    "stop",
    "stop_limit",
    "trailing_stop",
    "ioc",
    "fok",
  ];
  const ids = SYMBOLS.map((s) => s.id);
  return [
    {
      id: "bingx-vst-01",
      venue: "bingx",
      label: "BingX VST-01",
      testnet: true,
      network: "paper",
      armed: false,
      hasKeys: false,
      status: "disconnected",
      apiKeyMasked: "VST-01-•••A4",
      permissions: ["read", "trade"],
      symbols: [...ids],
      orderTypesEnabled: types,
      rateLimitUsed: 8,
      rateLimitMax: 100,
      openOrderCount: 0,
      positionCount: 0,
      maxPositions: 100,
      maxSymbols: 50,
      unlimitedOrders: true,
      lastPingMs: 54,
    },
    {
      id: "bingx-vst-02",
      venue: "bingx",
      label: "BingX VST-02",
      testnet: true,
      network: "testnet",
      armed: false,
      hasKeys: false,
      status: "disconnected",
      apiKeyMasked: "VST-02-•••C8",
      permissions: ["read", "trade"],
      symbols: [...ids],
      orderTypesEnabled: types,
      rateLimitUsed: 6,
      rateLimitMax: 100,
      openOrderCount: 0,
      positionCount: 0,
      maxPositions: 100,
      maxSymbols: 50,
      unlimitedOrders: true,
      lastPingMs: 61,
    },
    {
      id: "bingx-x01",
      venue: "bingx",
      label: "BingX Live-01",
      testnet: false,
      network: "mainnet",
      armed: false,
      hasKeys: false,
      status: "disconnected",
      apiKeyMasked: "X01-•••EQ",
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
      lastPingMs: 0,
    },
  ];
}

export function buildDesk(): DeskData {
  const candles: Record<string, Candle[]> = {};
  const indicators: Record<string, IndicatorPack> = {};
  const backtests: Record<string, Backtest> = {};

  for (const sym of SYMBOLS) {
    const cs = generateCandles(hashStr(sym.id) ^ 42, sym.start, sym.vol, BARS);
    candles[sym.id] = cs;
    indicators[sym.id] = computeIndicators(cs);
  }

  for (const st of STRATEGIES) {
    for (const sym of SYMBOLS) {
      const key = `${st.id}:${sym.id}`;
      backtests[key] = runBacktest(st.id, sym.id, candles[sym.id]!, indicators[sym.id]!);
    }
  }

  for (const id of Object.keys(candles)) {
    const cs = candles[id]!;
    const pk = indicators[id]!;
    const hits = processAllIndications(pk, cs, cs.length - 1);
    const sum = summarizeIndications(hits);
    const rel = activityRelations(pk, cs.length - 1, sum.direction);
    IND_CACHE[id] = { ...sum, relations: rel, timing: rel.timing, hf: rel.hf || sum.hf, activity: rel.pulse || sum.activity };
  }

  return {
    symbols: SYMBOLS.map((s) => ({ ...s, venues: [...s.venues] })),
    candles,
    indicators,
    strategies: STRATEGIES,
    backtests,
    combinations: [],
    connections: demoConnections(),
  };
}

export const DESK: DeskData = buildDesk();

export function btKey(strategyId: string, symbol: string) {
  return `${strategyId}:${symbol}`;
}

export function getBacktest(strategyId: string, symbol: string): Backtest {
  const hit = DESK.backtests[btKey(strategyId, symbol)];
  if (hit) return hit;
  return {
    strategyId,
    symbol,
    trades: [],
    equity: [10_000],
    signals: [],
    stats: statsFromTrades([]),
  };
}

export const REPLAY_RANGES = [
  { id: "4h", label: "4h", hours: 4 },
  { id: "8h", label: "8h", hours: 8 },
  { id: "12h", label: "12h", hours: 12 },
  { id: "1d", label: "1d", hours: 24 },
  { id: "2d", label: "2d", hours: 48 },
  { id: "4d", label: "4d", hours: 96 },
  { id: "8d", label: "8d", hours: 192 },
  { id: "12d", label: "12d", hours: 288 },
] as const;

export type ReplayRangeId = (typeof REPLAY_RANGES)[number]["id"];

export function replayBarsFor(hours: number): number {
  const tradeBars = Math.max(8, Math.round((hours * 60) / 15));
  return Math.min(12 * 24 * 4 + WARMUP, WARMUP + tradeBars);
}

export interface ReplayOccupancy {
  avgPos: number;
  avgOrd: number;
  peak: number;
}

export interface ReplayKindRow {
  key: IndicationId;
  hits: number;
  avgStrength: number;
  pf: number;
  wr: number;
  net: number;
  trades: number;
}

export interface ReplayStrategyRow {
  id: string;
  name: string;
  kind: StrategyKind;
  pf: number;
  wr: number;
  net: number;
  trades: number;
  mdd: number;
  avgPos: number;
  avgOrd: number;
}

export interface ReplayTape {
  symbol: string;
  hours: number;
  bars: number;
  candles: Candle[];
  indicators: IndicatorPack;
  backtests: Record<string, Backtest>;
  occupancy: ReplayOccupancy;
  kinds: ReplayKindRow[];
  configs: { id: string; kind: IndicationId; label: string; hits: number; avgStrength: number }[];
  strategies: ReplayStrategyRow[];
  equity: { i: number; eq: number }[];
  load: { i: number; pos: number; ord: number }[];
}

const REPLAY_CACHE = new Map<string, ReplayTape>();

function occupancyFromTrades(trades: Trade[], endBar: number): ReplayOccupancy & { load: { i: number; pos: number; ord: number }[] } {
  const end = Math.max(0, endBar);
  const d = new Int16Array(end + 2);
  for (const t of trades) {
    if (t.entryBar <= end) d[Math.max(0, t.entryBar)] += 1;
    if (t.exitBar <= end) d[Math.max(0, Math.min(end, t.exitBar))] -= 1;
  }
  let pos = 0;
  let sumP = 0;
  let sumO = 0;
  let peak = 0;
  const load: { i: number; pos: number; ord: number }[] = [];
  const step = Math.max(1, Math.floor((end + 1) / 240));
  for (let i = 0; i <= end; i++) {
    pos = Math.max(0, pos + d[i]!);
    const ord = pos * 2;
    sumP += pos;
    sumO += ord;
    if (pos > peak) peak = pos;
    if (i % step === 0 || i === end) load.push({ i, pos, ord });
  }
  const n = end + 1;
  return { avgPos: sumP / n, avgOrd: sumO / n, peak, load };
}

function kindFlipBacktest(kind: IndicationId, candles: Candle[], pack: IndicatorPack, endBar: number) {
  const trades: { pnl: number }[] = [];
  let side = 0;
  let entry = 0;
  for (let i = WARMUP; i <= endBar; i++) {
    const hits = processAllIndications(pack, candles, i);
    const sum = summarizeIndications(hits);
    const raw = sum[kind];
    const sig = Math.abs(raw) >= 0.28 ? Math.sign(raw) : 0;
    const px = candles[i]!.c;
    if (side !== 0 && (sig === -side || i === endBar)) {
      trades.push({ pnl: ((side * (px - entry)) / entry) * UNIT_NOTIONAL, volume: 1 } as Trade);
      side = 0;
    }
    if (side === 0 && (sig === 1 || sig === -1) && i < endBar) {
      side = sig;
      entry = px;
    }
  }
  return statsFromTrades(trades as Trade[]);
}

export function getReplayTape(symbol: string, hours: number): ReplayTape {
  const bars = replayBarsFor(hours);
  const key = `${symbol}:${bars}`;
  const hit = REPLAY_CACHE.get(key);
  if (hit) return hit;
  const spec = SYMBOLS.find((s) => s.id === symbol) ?? SYMBOLS[0]!;
  const candles = generateCandles(hashStr(spec.id) ^ 42, spec.start, spec.vol, bars);
  const indicators = computeIndicators(candles);
  const endBar = bars - 1;
  const backtests: Record<string, Backtest> = {};
  const strategies: ReplayStrategyRow[] = [];
  for (const st of STRATEGIES) {
    const bt = runBacktest(st.id, spec.id, candles, indicators);
    backtests[st.id] = bt;
    const occ = occupancyFromTrades(bt.trades, endBar);
    strategies.push({
      id: st.id,
      name: st.name,
      kind: st.kind,
      pf: bt.stats.pf,
      wr: bt.stats.wr,
      net: bt.stats.net,
      trades: bt.stats.trades,
      mdd: bt.stats.mdd,
      avgPos: occ.avgPos,
      avgOrd: occ.avgOrd,
    });
  }
  const primary = backtests.normal ?? Object.values(backtests)[0]!;
  const occ = occupancyFromTrades(primary.trades, endBar);
  const kindHits: Record<IndicationId, { hits: number; strength: number; n: number }> = {
    trend: { hits: 0, strength: 0, n: 0 },
    break: { hits: 0, strength: 0, n: 0 },
    active: { hits: 0, strength: 0, n: 0 },
    direction: { hits: 0, strength: 0, n: 0 },
  };
  const cfgHits = Object.fromEntries(INDICATION_CONFIGS.map((c) => [c.id, { hits: 0, strength: 0 }])) as Record<
    string,
    { hits: number; strength: number }
  >;
  const step = Math.max(1, Math.floor(bars / 420));
  let samples = 0;
  for (let i = WARMUP; i <= endBar; i += step) {
    const hits = processAllIndications(indicators, candles, i);
    const sum = summarizeIndications(hits);
    for (const k of INDICATION_KINDS) {
      const v = Math.abs(sum[k.id]);
      kindHits[k.id].n += 1;
      kindHits[k.id].strength += v;
      if (v >= 0.22) kindHits[k.id].hits += 1;
    }
    for (const h of hits) {
      const row = cfgHits[h.configId];
      if (!row) continue;
      row.strength += h.strength;
      if (h.strength >= 0.22 && h.dir !== 0) row.hits += 1;
    }
    samples += 1;
  }
  const kinds: ReplayKindRow[] = INDICATION_KINDS.map((k) => {
    const st = kindFlipBacktest(k.id, candles, indicators, endBar);
    const hh = kindHits[k.id];
    return {
      key: k.id,
      hits: hh.hits,
      avgStrength: samples ? hh.strength / samples : 0,
      pf: st.pf,
      wr: st.wr,
      net: st.net,
      trades: st.trades,
    };
  });
  const configs = INDICATION_CONFIGS.map((c) => ({
    id: c.id,
    kind: c.kind,
    label: c.label,
    hits: cfgHits[c.id]?.hits ?? 0,
    avgStrength: samples ? (cfgHits[c.id]?.strength ?? 0) / samples : 0,
  }));
  const equity = (primary.equity ?? []).map((eq, i) => ({ i, eq }));
  const tape: ReplayTape = {
    symbol: spec.id,
    hours,
    bars,
    candles,
    indicators,
    backtests,
    occupancy: { avgPos: occ.avgPos, avgOrd: occ.avgOrd, peak: occ.peak },
    kinds,
    configs,
    strategies,
    equity,
    load: occ.load,
  };
  if (REPLAY_CACHE.size > 16) REPLAY_CACHE.clear();
  REPLAY_CACHE.set(key, tape);
  return tape;
}

export function heatmapFor(
  strategyId: string,
  symbol: string,
  tactic: TacticKind,
  lastN: number,
  cfg: TacticConfig,
  th: Thresholds,
  adj?: StrategyAdj,
): HeatCell[] {
  const bt = getBacktest(strategyId, symbol);
  const name = STRATEGIES.find((s) => s.id === strategyId)?.name ?? strategyId;
  const cells: HeatCell[] = [];
  for (const range of RANGE_TYPES) {
    for (const cost of COST_STEPS) {
      let best: ComboResult | null = null;
      for (const trail of TRAIL_PCTS) {
        for (const ratio of TP_SL_RATIOS) {
          const c = deriveCombo(bt, name, cost, range, tactic, lastN, cfg, th, adj, trail, ratio);
          if (!best || c.pf > best.pf) best = c;
        }
      }
      const c = best!;
      cells.push({ cost, rangeType: range, pf: c.pf, mdd: c.mdd, positive: c.positive });
    }
  }
  return cells;
}

export function strategyMatchesKinds(st: StrategyDef, kinds: readonly StrategyKind[]): boolean {
  if (!kinds.length) return st.kind === "normal";
  if (kinds.includes(st.kind)) return true;
  if (kinds.includes("breakout") && st.id === "vol-break") return true;
  return false;
}

export function strategiesForKinds(kinds: readonly StrategyKind[]): StrategyDef[] {
  const list = STRATEGIES.filter((st) => strategyMatchesKinds(st, kinds));
  return list.length ? list : STRATEGIES.filter((st) => st.kind === "normal");
}

export function orderTypesForVenue(venue: Venue, enabled?: OrderTypeId[]): { id: OrderTypeId; label: string }[] {
  const allowed = new Set(VENUE_ORDER_TYPES[venue]);
  const list = ORDER_TYPES.filter((ot) => allowed.has(ot.id));
  if (!enabled || enabled.length === 0) return [...list];
  const on = list.filter((ot) => enabled.includes(ot.id));
  return on.length ? on : [...list];
}

export function combosFiltered(opts: {
  strategyId?: string;
  symbol?: string;
  tactic?: TacticKind | "all";
  rangeType?: RangeType | "all";
  costStep?: number | "all";
  lastN: number;
  cfg: TacticConfig;
  th: Thresholds;
  onlyPositive?: boolean;
  enabledKinds?: readonly StrategyKind[];
  trails?: readonly number[];
  tpRatios?: readonly number[];
  keepBest?: boolean;
}): ComboResult[] {
  const kinds = opts.enabledKinds ?? DEFAULT_ENABLED_KINDS;
  const allowed = new Set(strategiesForKinds(kinds).map((s) => s.id));
  const nameOf = Object.fromEntries(STRATEGIES.map((s) => [s.id, s.name]));
  const out: ComboResult[] = [];
  for (const bt of Object.values(DESK.backtests)) {
    if (opts.strategyId && bt.strategyId !== opts.strategyId) continue;
    if (opts.symbol && bt.symbol !== opts.symbol) continue;
    if (!allowed.has(bt.strategyId)) continue;
    const ranges = opts.rangeType && opts.rangeType !== "all" ? [opts.rangeType] : RANGE_TYPES;
    const tactics = opts.tactic && opts.tactic !== "all" ? [opts.tactic] : TACTICS;
    const costs = opts.costStep && opts.costStep !== "all" ? [opts.costStep] : COST_STEPS;
    const trails = opts.trails?.length ? opts.trails : TRAIL_PCTS;
    const ratios = opts.tpRatios?.length ? opts.tpRatios : TP_SL_RATIOS;
    for (const cost of costs) {
      for (const range of ranges) {
        for (const tactic of tactics) {
          let best: ComboResult | null = null;
          for (const trail of trails) {
            for (const ratio of ratios) {
          const c = deriveCombo(
            bt,
            nameOf[bt.strategyId] ?? bt.strategyId,
            cost,
            range,
            tactic,
            opts.lastN,
            opts.cfg,
            opts.th,
            undefined,
            trail,
            ratio,
          );
          if (opts.keepBest) {
            if (!best || (c.positive && !best.positive) || (c.positive === best.positive && c.pf > best.pf)) best = c;
            continue;
          }
          if (opts.onlyPositive && !c.positive) continue;
          out.push(c);
            }
          }
          if (opts.keepBest && best && (!opts.onlyPositive || best.positive)) out.push(best);
        }
      }
    }
  }
  out.sort((a, b) => b.pf - a.pf);
  out.forEach((c, i) => {
    c.rank = i + 1;
  });
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function groupCombos(rows: ComboResult[], key: (c: ComboResult) => string): Map<string, ComboResult[]> {
  const m = new Map<string, ComboResult[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function toBuckets(groups: Map<string, ComboResult[]>, labelOf: (id: string) => string): ComboBucket[] {
  const out: ComboBucket[] = [];
  for (const [id, xs] of groups) {
    out.push({
      id,
      label: labelOf(id),
      n: xs.length,
      avgPf: mean(xs.map((x) => x.pf)),
      avgWr: mean(xs.map((x) => x.wr)),
      avgMdd: mean(xs.map((x) => x.mdd)),
      avgVf: mean(xs.map((x) => x.volumeFactor)),
      avgDdt: mean(xs.map((x) => x.ddt)),
      pass: xs.filter((x) => x.positive && x.lastNPositive).length,
      net: xs.reduce((s, x) => s + x.net, 0),
    });
  }
  out.sort((a, b) => b.avgPf - a.avgPf);
  return out;
}

const PF_BINS: { bin: string; lo: number; hi: number }[] = [
  { bin: "<0.8", lo: 0, hi: 0.8 },
  { bin: "0.8–1.0", lo: 0.8, hi: 1 },
  { bin: "1.0–1.2", lo: 1, hi: 1.2 },
  { bin: "1.2–1.6", lo: 1.2, hi: 1.6 },
  { bin: "1.6–2.0", lo: 1.6, hi: 2 },
  { bin: "2.0–2.6", lo: 2, hi: 2.6 },
  { bin: "2.6–3.4", lo: 2.6, hi: 3.4 },
  { bin: "3.4+", lo: 3.4, hi: 99 },
];

export function comboBreakdown(rows: ComboResult[]): ComboBreakdown {
  const kindOf = Object.fromEntries(STRATEGIES.map((s) => [s.id, s.kind])) as Record<string, StrategyKind>;
  const kindLabel = Object.fromEntries(STRATEGY_KINDS.map((k) => [k.id, k.label]));
  const both = rows.filter((r) => r.positive && r.lastNPositive).length;
  const hist: ComboHistBin[] = PF_BINS.map((b) => ({ ...b, n: 0, pass: 0 }));
  for (const r of rows) {
    const slot = hist.find((b) => r.pf >= b.lo && r.pf < b.hi) ?? hist[hist.length - 1]!;
    slot.n += 1;
    if (r.positive && r.lastNPositive) slot.pass += 1;
  }
  const stride = Math.max(1, Math.floor(rows.length / 240));
  const scatter: ComboPoint[] = [];
  for (let i = 0; i < rows.length && scatter.length < 240; i += stride) {
    const r = rows[i]!;
    scatter.push({
      pf: r.pf,
      lastNPf: r.lastNPf,
      wr: r.wr,
      mdd: r.mdd,
      tactic: r.tactic,
      rangeType: r.rangeType,
      strategyId: r.strategyId,
    });
  }
  return {
    total: rows.length,
    positive: rows.filter((r) => r.positive).length,
    lastNPositive: rows.filter((r) => r.lastNPositive).length,
    both,
    avgPf: mean(rows.map((r) => r.pf)),
    avgMdd: mean(rows.map((r) => r.mdd)),
    avgWr: mean(rows.map((r) => r.wr)),
    avgVf: mean(rows.map((r) => r.volumeFactor)),
    avgDdt: mean(rows.map((r) => r.ddt)),
    uniquePf: new Set(rows.map((r) => r.pf.toFixed(4))).size,
    uniqueMdd: new Set(rows.map((r) => r.mdd.toFixed(5))).size,
    byStrategy: toBuckets(groupCombos(rows, (r) => r.strategyId), (id) => rows.find((r) => r.strategyId === id)?.strategyName ?? id),
    byTactic: toBuckets(groupCombos(rows, (r) => r.tactic), (id) => TACTIC_META[id as TacticKind]?.label ?? id),
    byRange: toBuckets(groupCombos(rows, (r) => r.rangeType), (id) => RANGE_META[id as RangeType]?.label ?? id),
    byKind: toBuckets(groupCombos(rows, (r) => kindOf[r.strategyId] ?? "normal"), (id) => kindLabel[id] ?? id),
    byCost: toBuckets(groupCombos(rows, (r) => String(r.costStep)), (id) => id).sort((a, b) => Number(a.id) - Number(b.id)),
    byTrail: toBuckets(groupCombos(rows, (r) => r.trailPct.toFixed(1)), (id) => `${id}%`),
    byTpRatio: toBuckets(groupCombos(rows, (r) => r.tpRatio.toFixed(2)), (id) => `${id}R`),
    pfHist: hist,
    scatter,
  };
}

export function buildLanes(
  lastN: number,
  cfg: TacticConfig,
  th: Thresholds,
  symbol?: string,
  enabledKinds: readonly StrategyKind[] = DEFAULT_ENABLED_KINDS,
): Lane[] {
  const memoKey = `${lastN}|${symbol ?? "*"}|${enabledKinds.join(",")}|${cfg.trailingPct}|${cfg.tpRatio}|${cfg.slAtr}|${cfg.dcaCount}|${th.minPf}|${th.minWr}|${th.minVf}|${th.maxMdd}|${th.maxDdt}`;
  const memoHit = LANE_MEMO.get(memoKey);
  if (memoHit) return memoHit;
  const lanes: Lane[] = [];
  const playbooks = strategiesForKinds(enabledKinds);
  for (const st of playbooks) {
    for (const sym of SYMBOLS) {
      if (symbol && sym.id !== symbol) continue;
      for (const tactic of TACTICS) {
        let best: ComboResult | null = null;
        const bt = getBacktest(st.id, sym.id);
        for (const range of RANGE_TYPES) {
          for (const cost of COST_STEPS) {
            const adj = st.kind === "normal" ? { pf: 1, mdd: 1, wr: 1 } : undefined;
            for (const trail of TRAIL_PCTS) {
              for (const ratio of TP_SL_RATIOS) {
              const c = deriveCombo(bt, st.name, cost, range, tactic, lastN, cfg, th, adj, trail, ratio);
              if (!best || (c.positive && !best.positive) || (c.positive === best.positive && c.pf > best.pf)) best = c;
              }
            }
          }
        }
        if (!best) continue;
        const lastOk = best.lastNPositive;
        const allOk = best.positive;
        const status = allOk && lastOk ? "validated" : allOk || lastOk ? "candidate" : "rejected";
        const bag = positionsFrom(st.id, sym.id, tactic, best.rangeType, best.costStep, "all");
        const blocks = buildBlocks(bag);
        const openN = bag.filter((p) => p.status === "open").length;
        const nextN = bag.filter((p) => p.status === "next").length;
        const evals: LastNEvalRow[] = LANE_EVAL_NS.map((n) => {
          const s = lastNEval(bt, n);
          return {
            n,
            pf: s.pf,
            wr: s.wr,
            net: s.net,
            trades: s.trades,
            ok: isPositive(s, th) || s.pf >= th.minPf * 0.92,
          };
        });
        const passing = evals.filter((r) => r.ok).length;
        const endOk = evals[evals.length - 1]?.ok ?? false;
        const effective = status === "validated" && passing >= Math.max(2, LANE_EVAL_NS.length - 1) && endOk;
        const ind = symbolIndications(sym.id);
        lanes.push({
          id: `${st.id}:${sym.id}:${tactic}`,
          strategyId: st.id,
          strategyName: st.name,
          symbol: sym.id,
          tactic,
          rangeType: best.rangeType,
          costStep: best.costStep,
          trailPct: best.trailPct,
          tpRatio: best.tpRatio,
          status,
          pf: best.pf,
          lastNPf: best.lastNPf,
          mdd: best.mdd,
          wr: best.wr,
          volumeFactor: best.volumeFactor,
          blockCount: blocks.length,
          ongoing: status === "rejected" ? 0 : openN,
          next: status === "rejected" ? 0 : nextN,
          ddt: best.ddt,
          net: best.net,
          kind: st.kind,
          activity: ind.activity,
          hf: ind.hf,
          indications: { trend: ind.trend, break: ind.break, active: ind.active, direction: ind.direction },
          timing: ind.timing,
          activityAgree: ind.relations.agree,
          evals,
          effective,
        });
      }
    }
  }
  const order = { validated: 0, candidate: 1, rejected: 2 };
  lanes.sort((a, b) => order[a.status] - order[b.status] || b.pf - a.pf);
  if (LANE_MEMO.size > 64) LANE_MEMO.clear();
  LANE_MEMO.set(memoKey, lanes);
  return lanes;
}

export function positionsFrom(
  strategyId: string,
  symbol: string,
  tactic: TacticKind,
  range: RangeType,
  cost: number,
  which: "closed" | "open" | "next" | "all",
): Position[] {
  const bt = getBacktest(strategyId, symbol);
  const candles = DESK.candles[symbol]!;
  const last = candles[candles.length - 1]!;
  const closed: Position[] = [];
  const trades = bt.trades;
  const closedTrades = trades.slice(0, Math.max(0, trades.length - 3));
  for (const t of closedTrades) {
    closed.push({
      id: t.id,
      symbol,
      strategyId,
      side: t.side,
      status: "closed",
      entry: t.entry,
      mark: t.exit,
      qty: cost / t.entry,
      cost,
      pnl: t.pnl * (cost / 10),
      pnlPct: (t.exit - t.entry) / t.entry * (t.side === "long" ? 1 : -1),
      openedBar: t.entryBar,
      closedBar: t.exitBar,
      tactic,
      rangeType: range,
      blockId: "",
      venue: "bingx",
      orderType: t.side === "long" ? "limit" : "market",
    });
  }
  const openTrades = trades.slice(-3);
  const open: Position[] = openTrades.map((t, i) => {
    const mark = last.c * (1 + ((hashStr(t.id) % 9) - 4) * 0.001);
    const pnlPct = ((mark - t.entry) / t.entry) * (t.side === "long" ? 1 : -1);
    return {
      id: `open:${t.id}`,
      symbol,
      strategyId,
      side: t.side,
      status: "open" as const,
      entry: t.entry,
      mark,
      qty: cost / t.entry,
      cost,
      pnl: pnlPct * cost,
      pnlPct,
      openedBar: t.entryBar,
      closedBar: null,
      tactic,
      rangeType: range,
      blockId: "",
      venue: "bingx",
      orderType: tactic === "trailing" ? "trailing_stop" : tactic === "dca" ? "limit" : "market",
    };
  });
  const atr = DESK.indicators[symbol]!.atr[candles.length - 1] ?? last.c * 0.01;
  const vwap = DESK.indicators[symbol]!.vwap[candles.length - 1] ?? last.c;
  const bias: Side = (bt.signals[bt.signals.length - 1] ?? 0) >= 0 ? "long" : "short";
  const next: Position[] = [];
  const levels = tactic === "dca" ? 4 : tactic === "axis" ? 5 : tactic === "hybrid" ? 3 : 1;
  for (let i = 1; i <= levels; i++) {
    const dir = bias === "long" ? -1 : 1;
    const spacing =
      range === "geometric"
        ? last.c * (0.006 * i)
        : range === "fibonacci"
          ? last.c * [0.004, 0.006, 0.01, 0.016, 0.026][i - 1]!
          : range === "volume"
            ? atr * (0.6 * i)
            : range === "atr"
              ? atr * i
              : atr * 0.8 * i;
    const px = tactic === "axis" ? vwap + dir * spacing : last.c + dir * spacing;
    next.push({
      id: `next:${strategyId}:${symbol}:${i}`,
      symbol,
      strategyId,
      side: bias,
      status: "next",
      entry: px,
      mark: last.c,
      qty: cost / px,
      cost,
      pnl: 0,
      pnlPct: 0,
      openedBar: candles.length,
      closedBar: null,
      tactic,
      rangeType: range,
      blockId: "",
      venue: "bingx",
      orderType: tactic === "dca" ? "limit" : "stop",
    });
  }

  const assignBlocks = (list: Position[]) => {
    let blockN = 0;
    let prev: Side | null = null;
    for (const p of list) {
      if (p.side !== prev) {
        blockN += 1;
        prev = p.side;
      }
      p.blockId = `B${blockN}`;
    }
  };
  assignBlocks(closed);
  assignBlocks(open);

  if (which === "closed") return closed;
  if (which === "open") return open;
  if (which === "next") return next;
  return [...closed, ...open, ...next];
}

export function buildBlocks(positions: Position[]): PositionBlock[] {
  const map = new Map<string, Position[]>();
  for (const p of positions) {
    if (!p.blockId) continue;
    const arr = map.get(p.blockId) ?? [];
    arr.push(p);
    map.set(p.blockId, arr);
  }
  const blocks: PositionBlock[] = [];
  for (const [id, arr] of map) {
    const side = arr[0]!.side;
    const net = arr.reduce((s, p) => s + p.pnl, 0);
    blocks.push({
      id,
      symbol: arr[0]!.symbol,
      side,
      count: arr.length,
      multiple: arr.length,
      net,
      tactic: arr[0]!.tactic,
    });
  }
  return blocks;
}

function positionNotionalOf(p: Position): number {
  const px = Number.isFinite(p.entry) && p.entry > 0 ? p.entry : Number.isFinite(p.mark) ? p.mark : 0;
  if (Number.isFinite(p.qty) && p.qty > 0 && px > 0) return Math.abs(p.qty * px);
  if (Number.isFinite(p.cost) && p.cost > 0 && p.cost <= 30) return positionNotional(BASE_EQUITY, p.cost);
  return Number.isFinite(p.cost) ? Math.abs(p.cost) : positionNotional(BASE_EQUITY, 10);
}

export function coordinate(
  last: Position[],
  ongoing: Position[],
  next: Position[],
  vf: number,
  symbol?: string,
): Coordination {
  const hold: Coordination = {
    heat: 0,
    aligned: false,
    conflict: false,
    netSide: "flat",
    lastNet: 0,
    ongoingNet: 0,
    nextNet: 0,
    volumeFactor: Number.isFinite(vf) ? clamp(vf, 0.4, 2.2) : 1,
    recommend: "hold",
    reason: "Coordinator recovered — holding until the next eval.",
    lastCount: last?.length ?? 0,
    ongoingCount: ongoing?.length ?? 0,
    nextCount: next?.length ?? 0,
    activity: 0,
    hf: false,
    indications: { trend: 0, break: 0, active: 0, direction: 0 },
    agree: false,
    timing: 0,
    activityAgree: 0,
  };
  try {
    const lastArr = Array.isArray(last) ? last : [];
    const ongoingArr = Array.isArray(ongoing) ? ongoing : [];
    const nextArr = Array.isArray(next) ? next : [];
    const lastNet = lastArr.reduce((s, p) => s + (Number.isFinite(p.pnl) ? p.pnl : 0), 0);
    const ongoingNet = ongoingArr.reduce((s, p) => s + (Number.isFinite(p.pnl) ? p.pnl : 0), 0);
    const nextExp = nextArr.reduce((s, p) => s + positionNotionalOf(p), 0);
    const nextNet = nextArr.reduce((s, p) => {
      const n = positionNotionalOf(p);
      return s + (p.side === "long" ? n : -n);
    }, 0);
    const score = (ps: Position[]) => ps.reduce((s, p) => s + (p.side === "long" ? 1 : -1), 0);
    const ls = score(lastArr);
    const os = score(ongoingArr);
    const ns = score(nextArr);
    const aligned = Math.sign(ls) === Math.sign(os) && Math.sign(os) === Math.sign(ns) && os !== 0;
    const conflict = Math.sign(os) !== 0 && Math.sign(ns) !== 0 && Math.sign(os) !== Math.sign(ns);
    const unit = Math.max(BASE_EQUITY * POSITION_COST_PCT, 1e-6);
    const ongoingExp = ongoingArr.reduce((s, p) => s + positionNotionalOf(p), 0);
    let heat = clamp((ongoingExp + nextExp) / (unit * 16), 0, 2);
    if (!Number.isFinite(heat)) heat = 0;
    const netSide: Side | "flat" = os > 0 ? "long" : os < 0 ? "short" : "flat";
    let recommend: Coordination["recommend"] = "hold";
    let reason = "Book is balanced — keep current lanes.";
    const vol = Number.isFinite(vf) ? clamp(vf, 0.4, 2.2) : 1;
    const vfFloor = MIN_VOLUME_FACTOR;
    if (!ongoingArr.length && !nextArr.length) {
      recommend = "hold";
      reason = "No ongoing or next inventory to coordinate.";
    } else if (conflict && heat > 0.35) {
      recommend = "reduce";
      reason = "Next grid fights ongoing inventory. Cut heat before filling.";
    } else if (aligned && vol >= vfFloor && lastNet > 0 && heat < 0.85) {
      recommend = "add";
      reason = "Last N, ongoing and next agree. Volume factor confirms add.";
    } else if (!aligned && lastNet < 0 && ongoingNet < 0) {
      recommend = "flip";
      reason = "Last and ongoing both red and opposing the next axis. Flip bias.";
    } else if (heat > 0.9) {
      recommend = "wait";
      reason = "Heat is elevated. Wait for a block to complete.";
    } else if (vol < vfFloor) {
      recommend = "wait";
      reason = "Volume factor is below the floor — coordination not confirmed.";
    }
    const pack = symbol ? symbolIndications(symbol) : null;
    const rel = pack?.relations;
    const activity = clamp(
      vol * 0.35 + heat * 0.3 + (pack ? pack.activity * 0.2 : 0) + (rel?.agree ?? 0) * 0.15 +
        Math.min(0.4, (lastArr.length + ongoingArr.length + nextArr.length) / 24),
      0,
      2,
    );
    const hf = Boolean(pack?.hf) || Boolean(rel?.hf) || activity >= 1.08 || vol >= 1.18;
    const timing = pack?.timing ?? rel?.timing ?? 0;
    const indications = {
      trend: clamp((ls / Math.max(3, lastArr.length)) * 0.55 + (pack?.trend ?? 0) * 0.45, -1, 1),
      break: clamp((ns / Math.max(2, nextArr.length)) * 0.55 + (pack?.break ?? 0) * 0.45, -1, 1),
      active: clamp((pack?.active ?? 0) * 0.65 + (hf ? 0.35 : 0.15) * Math.sign(os || ns || ls || 1), -1, 1),
      direction: clamp((pack?.direction ?? 0) * 0.7 + Math.sign(ns - os || pack?.direction || 0) * 0.3, -1, 1),
    };
    const signed = [indications.trend, indications.break, indications.active, indications.direction].filter(
      (x) => Math.abs(x) > 0.12,
    );
    const agree = signed.length >= 2 && signed.every((x) => Math.sign(x) === Math.sign(signed[0]!));
    if (hf && agree && lastNet > 0 && heat < 0.85 && vol >= vfFloor) {
      recommend = "add";
      reason = "High-frequency activity — Trend, Break, Active and Direction agree. Add.";
    } else if (hf && conflict) {
      recommend = "reduce";
      reason = "High-frequency conflict across indications. Cut opposing ladders.";
    } else if (hf && Math.abs(indications.direction) >= 0.45 && os !== 0 && Math.sign(indications.direction) !== Math.sign(os)) {
      recommend = "flip";
      reason = "Direction change vs ongoing book. Flip bias.";
    } else if ((rel?.agree ?? 0) >= 0.75 && timing >= 0.55 && lastNet > 0 && heat < 0.8 && vol >= vfFloor) {
      recommend = "add";
      reason = "Short-range activity relations (vol, range, pulse, dir) agree and are fresh. Add.";
    } else if (timing < 0.22 && recommend === "add") {
      recommend = "wait";
      reason = "Signal timing is stale — wait for a fresh pulse.";
    }
    return {
      heat,
      aligned,
      conflict,
      netSide,
      lastNet: Number.isFinite(lastNet) ? lastNet : 0,
      ongoingNet: Number.isFinite(ongoingNet) ? ongoingNet : 0,
      nextNet: Number.isFinite(nextNet) ? nextNet : 0,
      volumeFactor: vol,
      recommend,
      reason,
      lastCount: lastArr.length,
      ongoingCount: ongoingArr.length,
      nextCount: nextArr.length,
      activity: Number.isFinite(activity) ? activity : 0,
      hf,
      indications,
      agree,
      timing,
      activityAgree: rel?.agree ?? 0,
    };
  } catch {
    return hold;
  }
}

export function bookStats(
  lastN: number,
  cfg: TacticConfig,
  th: Thresholds,
  symbol?: string,
  enabledKinds: readonly StrategyKind[] = DEFAULT_ENABLED_KINDS,
) {
  const lanes = buildLanes(lastN, cfg, th, symbol, enabledKinds);
  const validated = lanes.filter((l) => l.status === "validated");
  const candidates = lanes.filter((l) => l.status === "candidate");
  const rejected = lanes.filter((l) => l.status === "rejected");
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const sample = lanes.slice(0, 40);
  const playbooks = strategiesForKinds(enabledKinds);
  const symbolsN = symbol ? 1 : SYMBOLS.length;
  const totalCombos =
    COST_STEPS.length * RANGE_TYPES.length * TACTICS.length * TRAIL_PCTS.length * TP_SL_RATIOS.length * playbooks.length * symbolsN;
  const passRate = lanes.length ? validated.length / lanes.length : 0;
  const positiveCombos = Math.round(passRate * totalCombos);
  return {
    pf: avg(validated.map((l) => l.pf)) || avg(sample.map((l) => l.pf)),
    mdd: avg(validated.map((l) => l.mdd)) || avg(sample.map((l) => l.mdd)),
    wr: avg(validated.map((l) => l.wr)) || avg(sample.map((l) => l.wr)),
    vf: avg(validated.map((l) => l.volumeFactor)) || avg(sample.map((l) => l.volumeFactor)),
    net: avg(validated.map((l) => l.net ?? 0)) || avg(sample.map((l) => l.net ?? 0)),
    ddt: avg(validated.map((l) => l.ddt)) || avg(sample.map((l) => l.ddt)),
    validated: validated.length,
    candidates: candidates.length,
    rejected: rejected.length,
    positiveCombos,
    totalCombos,
  };
}

export function equitySeries(strategyId: string, symbol: string): { i: number; eq: number; t: number }[] {
  const bt = getBacktest(strategyId, symbol);
  const candles = DESK.candles[symbol]!;
  return bt.equity.map((eq, i) => ({
    i,
    eq,
    t: candles[WARMUP + i]?.t ?? T0 + i * BAR_MS,
  }));
}

export function lastPrice(symbol: string): number {
  const cs = DESK.candles[symbol]!;
  return cs[cs.length - 1]!.c;
}

export function priceChange(symbol: string): number {
  const cs = DESK.candles[symbol]!;
  const a = cs[cs.length - 2]!.c;
  const b = cs[cs.length - 1]!.c;
  return (b - a) / a;
}

export function paramKey(strategyId: string, label: string, name: string) {
  return `${strategyId}:${label}:${name}`;
}

export function paramBounds(name: string, def: number): { min: number; max: number; step: number } {
  const n = name.toLowerCase();
  if (n.includes("overbought")) return { min: 55, max: 90, step: 1 };
  if (n.includes("oversold")) return { min: 10, max: 45, step: 1 };
  if (n === "std" || n === "multiplier") return { min: 1, max: 4, step: 0.1 };
  if (n === "threshold") return { min: 10, max: 40, step: 1 };
  if (n === "fast") return { min: 5, max: 20, step: 1 };
  if (n === "slow") return { min: 16, max: 48, step: 1 };
  if (n === "signal" || n === "d") return { min: 2, max: 12, step: 1 };
  if (n === "k" || n.includes("period")) {
    return { min: Math.max(3, Math.round(def * 0.4)), max: Math.round(def * 2.4 + 8), step: 1 };
  }
  return { min: Math.max(1, def * 0.4), max: def * 2.5 + 2, step: def < 5 ? 0.1 : 1 };
}

export function strategyAdjMod(strategy: StrategyDef, overrides: Record<string, number>): StrategyAdj {
  if (strategy.kind === "normal") return { pf: 1, mdd: 1, wr: 1 };
  let pf = 1;
  let mdd = 1;
  let wr = 1;
  for (const ind of strategy.indicators) {
    for (const [name, def] of Object.entries(ind.params)) {
      const cur = overrides[paramKey(strategy.id, ind.label, name)] ?? def;
      const rel = (cur - def) / Math.max(Math.abs(def), 1);
      pf *= 1 - Math.abs(rel) * 0.14 + (rel < 0 && name.includes("period") ? 0.03 : 0);
      mdd *= 1 + Math.abs(rel) * 0.1;
      wr *= 1 - Math.abs(rel) * 0.08;
    }
  }
  return { pf: clamp(pf, 0.72, 1.22), mdd: clamp(mdd, 0.82, 1.28), wr: clamp(wr, 0.86, 1.12) };
}

export function applyAdjToStats(stats: Stats, adj: StrategyAdj): Stats {
  return {
    ...stats,
    pf: clamp(stats.pf * adj.pf, 0.2, 4.5),
    mdd: clamp(stats.mdd * adj.mdd, 0.02, 0.8),
    wr: clamp(stats.wr * adj.wr, 0.1, 0.95),
    net: stats.net * adj.pf,
    volumeFactor: stats.volumeFactor,
  };
}

export function posSliceStats(positions: Position[]): SliceStats {
  if (!positions.length) return { n: 0, net: 0, wr: 0, pf: 0 };
  const wins = positions.filter((p) => p.pnl > 0);
  const profit = wins.reduce((s, p) => s + p.pnl, 0);
  const loss = Math.abs(positions.filter((p) => p.pnl < 0).reduce((s, p) => s + p.pnl, 0));
  const net = positions.reduce((s, p) => s + p.pnl, 0);
  const pf = loss === 0 ? (profit > 0 ? 3.2 : 0) : profit / loss;
  const wr = positions.length ? wins.length / positions.length : 0;
  return {
    n: positions.length,
    net,
    wr: Number.isFinite(wr) ? wr : 0,
    pf: Number.isFinite(pf) ? pf : 0,
  };
}

export function volumeCoord(trades: Trade[]): VolumeCoord {
  if (trades.length < 2) {
    return {
      vf: 1,
      highVolWr: 0,
      lowVolWr: 0,
      highVolNet: 0,
      lowVolNet: 0,
      confirm: "flat",
      reason: "Not enough fills to split volume.",
    };
  }
  const sorted = [...trades].sort((a, b) => a.volume - b.volume);
  const mid = sorted[Math.floor(sorted.length / 2)]!.volume;
  const hi = trades.filter((t) => t.volume >= mid);
  const lo = trades.filter((t) => t.volume < mid);
  const wr = (xs: Trade[]) => (xs.length ? xs.filter((t) => t.pnl > 0).length / xs.length : 0);
  const net = (xs: Trade[]) => xs.reduce((s, t) => s + t.pnl, 0);
  const highVolWr = wr(hi);
  const lowVolWr = wr(lo);
  const highVolNet = net(hi);
  const lowVolNet = net(lo);
  const eq = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const volSum = trades.reduce((s, t) => s + t.volume, 0);
  const vw = volSum === 0 ? eq : trades.reduce((s, t) => s + t.pnl * t.volume, 0) / volSum;
  const vf = clamp(eq === 0 || !Number.isFinite(vw / eq) ? 1 : vw / eq, 0.4, 2.2);
  let confirm: VolumeCoord["confirm"] = "flat";
  let reason = "Volume is mixed versus equal-weight PnL.";
  if (vf >= 1.05 && highVolWr >= lowVolWr) {
    confirm = "confirm";
    reason = "High-volume fills carry the book — volume factor confirms the lane.";
  } else if (vf < 0.95 || highVolWr + 0.08 < lowVolWr) {
    confirm = "diverge";
    reason = "Quiet prints win more than loud ones. Volume is diverging from price.";
  }
  return { vf, highVolWr, lowVolWr, highVolNet, lowVolNet, confirm, reason };
}

