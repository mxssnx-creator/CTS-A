import type { Side, VstQuote } from "./types";

/** CTS-GA Stable-02 indication and strategy entry, plus lock/peak exit. Additive. */

const PX_CAP = 48;

export function pushStable02Px(q: VstQuote) {
  const px = q.px;
  if (!(px > 0)) return;
  const hist = q.pxHist ?? (q.pxHist = []);
  const prev = hist[hist.length - 1];
  if (prev != null && Math.abs(prev - px) / px < 1e-8) return;
  hist.push(px);
  if (hist.length > PX_CAP) hist.splice(0, hist.length - PX_CAP);
}

function dirOf(values: number[]): number {
  if (values.length < 2 || !(values[0] > 0)) return 0;
  return (values[values.length - 1]! - values[0]!) / values[0]!;
}

function independentSide(steps: number[], minAgreement: number): Side | null {
  const ev = steps.filter((v) => v !== 0 && Number.isFinite(v));
  if (!ev.length) return null;
  let longN = 0;
  let shortN = 0;
  let longS = 0;
  let shortS = 0;
  for (const v of ev) {
    if (v > 0) {
      longN += 1;
      longS += v;
    } else {
      shortN += 1;
      shortS += -v;
    }
  }
  const longOk = longN >= 1 && longN / ev.length >= minAgreement;
  const shortOk = shortN >= 1 && shortN / ev.length >= minAgreement;
  if (longOk && shortOk) {
    if (longS === shortS) return null;
    return longS > shortS ? "long" : "short";
  }
  if (longOk) return "long";
  if (shortOk) return "short";
  return null;
}

/** Two equal windows, opposite sign. The new window is the entry side. */
export function stable02Direction(closes: number[], range = 10): Side | null {
  const rng = Math.max(4, range);
  if (closes.length < rng * 2) return null;
  const first = closes.slice(-(rng * 2), -rng);
  const second = closes.slice(-rng);
  const d1 = dirOf(first);
  const d2 = dirOf(second);
  if (Math.abs(d1) < 0.001 || Math.abs(d2) < 0.001 || d1 * d2 >= 0) return null;
  const steps = second.slice(1).map((v, i) => v - second[i]!);
  const want: Side = d2 > 0 ? "long" : "short";
  const picked = independentSide(steps, 0.5);
  if (picked && picked !== want) return null;
  return want;
}

/** Net displacement of one window, and the steps agree. */
export function stable02Move(closes: number[], range = 10): Side | null {
  const rng = Math.max(4, range);
  if (closes.length < rng) return null;
  const window = closes.slice(-rng);
  const d = dirOf(window);
  if (Math.abs(d) < 0.001) return null;
  const steps = window.slice(1).map((v, i) => v - window[i]!);
  const want: Side = d > 0 ? "long" : "short";
  const picked = independentSide(steps, 0.45);
  if (picked && picked !== want) return null;
  return want;
}

function pct(from: number, to: number): number {
  if (!(from > 0)) return 0;
  return ((to - from) / from) * 100;
}

/** Outbreak: this window is more active than the previous one and holds the break. */
export function stable02Active(closes: number[], range = 5): Side | null {
  for (const rng of range === 5 ? [3, 5, 10] : [range]) {
    const hit = stable02ActiveRange(closes, rng);
    if (hit) return hit;
  }
  return null;
}

function stable02ActiveRange(closes: number[], range: number): Side | null {
  const rng = Math.max(2, range);
  const need = rng * 2 + 1;
  if (closes.length < need) return null;
  const sample = closes.slice(-need);
  const previous = sample.slice(0, rng + 1);
  const current = sample.slice(rng);
  const newest = current[current.length - 1]!;
  const signed = pct(current[0]!, newest);
  if (Math.abs(signed) < 0.5) return null;
  const direction: Side = signed >= 0 ? "long" : "short";
  const steps = current.slice(1).map((v, i) => pct(current[i]!, v));
  const picked = independentSide(steps, 0.45);
  if (picked && picked !== direction) return null;
  const avg = (values: number[]) => {
    let t = 0;
    for (let i = 1; i < values.length; i++) t += Math.abs(pct(values[i - 1]!, values[i]!));
    return t / Math.max(1, values.length - 1);
  };
  if (avg(current) + 1e-9 < avg(previous)) return null;
  const ref = sample.slice(0, -1);
  const breakout = direction === "long" ? Math.max(0, pct(Math.max(...ref), newest)) : Math.max(0, -pct(Math.min(...ref), newest));
  if (breakout < 0.05) return null;
  let aligned = 0;
  for (let i = 1; i < current.length; i++) {
    const mv = current[i]! - current[i - 1]!;
    if ((direction === "long" && mv > 0) || (direction === "short" && mv < 0)) aligned += 1;
  }
  if (aligned / Math.max(1, current.length - 1) < 0.5) return null;
  return direction;
}

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0]!;
  for (let i = 1; i < values.length; i++) e = values[i]! * k + e * (1 - k);
  return e;
}

function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  const window = values.slice(-(period + 1));
  for (let i = 1; i < window.length; i++) {
    const d = window[i]! - window[i - 1]!;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** Common indication: RSI, MACD histogram, EMA 20/50, EMA 200, Bollinger. */
export function stable02Common(closes: number[]): Side | null {
  if (closes.length < 26) return null;
  const r = rsi(closes, 14);
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macd = fast - slow;
  const prevFast = ema(closes.slice(0, -1), 12);
  const prevSlow = ema(closes.slice(0, -1), 26);
  const prev = prevFast - prevSlow;
  const hist = macd - prev * 0.2 - macd * 0.8;
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = closes.length >= 80 ? ema(closes, 200) : ema50;
  const window = closes.slice(-20);
  const mid = window.reduce((s, v) => s + v, 0) / window.length;
  const sd = Math.sqrt(window.reduce((s, v) => s + (v - mid) ** 2, 0) / window.length);
  const last = closes[closes.length - 1]!;
  let buy = 0;
  let sell = 0;
  if (r < 30) buy += 1;
  if (r > 70) sell += 1;
  if (hist > 0 && macd > 0) buy += 1;
  if (hist < 0 && macd < 0) sell += 1;
  if (ema20 > ema50) buy += 1;
  if (ema20 < ema50) sell += 1;
  if (last > ema200) buy += 1;
  if (last < ema200) sell += 1;
  if (last <= mid - 2 * sd) buy += 1;
  if (last >= mid + 2 * sd) sell += 1;
  if (buy === sell || Math.max(buy, sell) / 5 < 0.2) return null;
  return buy > sell ? "long" : "short";
}

/** Strategy pack: RSI 7, EMA 8/21, break, momentum, range fade. Needs 0.58 and a 0.10 lead. */
export function stable02Strategy(closes: number[]): Side | null {
  if (closes.length < 16) return null;
  const last = closes[closes.length - 1]!;
  if (!(last > 0)) return null;
  const r = rsi(closes, 7);
  const e8 = ema(closes, 8);
  const e21 = ema(closes, 21);
  const slope = (e8 - e21) / last;
  const prev = closes[closes.length - 2]!;
  const prior = closes.slice(-8, -1);
  const prevHi = Math.max(...prior);
  const prevLo = Math.min(...prior);
  const mom = closes.length >= 4 && closes[closes.length - 4]! > 0 ? (last - closes[closes.length - 4]!) / closes[closes.length - 4]! : 0;
  const lo = Math.min(...closes.slice(-8));
  const hi = Math.max(...closes.slice(-8));
  const rng = Math.max(hi - lo, last * 0.002);
  const loc = (last - lo) / rng;
  let longC = 0;
  let shortC = 0;
  if (r < 32) longC += 0.34;
  else if (r < 42) longC += 0.16;
  if (r > 68) shortC += 0.34;
  else if (r > 58) shortC += 0.16;
  if (slope > 0.00015) longC += 0.22;
  if (slope < -0.00015) shortC += 0.22;
  if (last > prev && last > prevHi) longC += 0.18;
  if (last < prev && last < prevLo) shortC += 0.18;
  if (mom > 0.0012) longC += 0.12;
  if (mom < -0.0012) shortC += 0.12;
  if (loc < 0.18 && r < 45) longC += 0.2;
  if (loc > 0.82 && r > 55) shortC += 0.2;
  if (longC >= 0.58 && longC > shortC + 0.1) return "long";
  if (shortC >= 0.58 && shortC > longC + 0.1) return "short";
  return null;
}

export type Stable02Book = {
  direction: Side | null;
  move: Side | null;
  active: Side | null;
  common: Side | null;
  strategy: Side | null;
};

export function stable02Book(q: VstQuote | undefined): Stable02Book {
  const closes = q?.pxHist ?? [];
  return {
    direction: stable02Direction(closes),
    move: stable02Move(closes),
    active: stable02Active(closes),
    common: stable02Common(closes),
    strategy: stable02Strategy(closes),
  };
}

const IND_ENTRY = new Set(["direction", "move", "active", "rsi", "macd", "ema", "bollinger", "trend", "break", "sar"]);

/** Where price sits in the recent range. Lower third leans long, upper third short, unless the short slope fights it. */
export function stable02Logistics(closes: number[]): Side | null {
  if (closes.length < 12) return null;
  const last = closes[closes.length - 1]!;
  if (!(last > 0)) return null;
  const win = closes.slice(-12);
  const lo = Math.min(...win);
  const hi = Math.max(...win);
  const rng = Math.max(hi - lo, last * 0.002);
  const loc = (last - lo) / rng;
  const slope = dirOf(closes.slice(-6));
  if (loc <= 0.28 && slope > -0.0008) return "long";
  if (loc >= 0.72 && slope < 0.0008) return "short";
  return null;
}

/** How many independent signals share a side. `agree` is the majority over the full pack, not just the votes. */
export function stable02Relation(book: Stable02Book, logistics?: Side | null): { side: Side | null; agree: number } {
  const votes = [book.direction, book.move, book.active, book.common, book.strategy, logistics ?? null];
  let longN = 0;
  let shortN = 0;
  for (const v of votes) {
    if (v === "long") longN += 1;
    else if (v === "short") shortN += 1;
  }
  if (longN === shortN) return { side: null, agree: 0 };
  const side: Side = longN > shortN ? "long" : "short";
  return { side, agree: Math.max(longN, shortN) / votes.length };
}

/** 0–1 activity factor from relative volume and the bar's move. */
export function stable02Factor(q: VstQuote | undefined): number {
  if (!q || !(q.px > 0)) return 0;
  const volScore = Math.min(1, Math.max(0, Number(q.vol) || 0) / 0.02);
  const chgScore = Math.min(1, Math.abs(Number(q.chg) || 0) / 0.004);
  return Math.min(1, volScore * 0.6 + chgScore * 0.4);
}

/**
 * Processing tactic. Axis keeps the continuation side only when logistics and the relation pack do not oppose it.
 * Other tactics return the indication's own side, or null when the pack strongly disagrees so that side is not added.
 */
export function stable02ProcessSide(q: VstQuote | undefined, indication: string, tactic: string): Side | null {
  if (!q || !(q.px > 0)) return null;
  const book = stable02Book(q);
  const logistics = stable02Logistics(q.pxHist ?? []);
  const rel = stable02Relation(book, logistics);
  const ax: Side = q.px >= (q.axis || q.px) ? "long" : "short";
  if (tactic === "axis") {
    if (rel.side && rel.side !== ax && rel.agree >= 0.5) return null;
    if (logistics && logistics !== ax && rel.agree >= 0.34) return null;
    return ax;
  }
  const own = stable02EntrySide(q, indication);
  if (own && rel.side && own !== rel.side && rel.agree >= 0.67) return null;
  return own;
}

/** Extra side this indication or strategy wants. Null means no added entry. */
export function stable02EntrySide(q: VstQuote | undefined, indication: string): Side | null {
  if (!IND_ENTRY.has(indication)) return null;
  const book = stable02Book(q);
  if (indication === "direction") return book.direction;
  if (indication === "move") return book.move;
  if (indication === "active") return book.active;
  if (indication === "rsi" || indication === "macd" || indication === "ema" || indication === "bollinger") return book.common;
  return book.strategy;
}

const LOCK_PCT = 0.0015;
const BE_BUFFER = 0.0004;
const PEAK_GIVE = 0.003;

/**
 * Stable-02 exit: lock to breakeven after 0.15%, then trail 0.30% off the peak.
 * Never loosens the stop. Hard SL stays the floor.
 */
export function stable02ExitSl(side: Side, entry: number, peak: number, sl: number, ageTicks: number): number | null {
  if (!(entry > 0) || !(sl > 0) || ageTicks < 1) return null;
  const long = side === "long";
  const pxPeak = peak > 0 ? peak : entry;
  const mfe = long ? (pxPeak - entry) / entry : (entry - pxPeak) / entry;
  let next = sl;
  if (mfe >= LOCK_PCT) {
    const lock = long ? entry * (1 + BE_BUFFER) : entry * (1 - BE_BUFFER);
    next = long ? Math.max(next, lock) : Math.min(next, lock);
  }
  if (mfe >= PEAK_GIVE) {
    const trailed = long ? pxPeak * (1 - PEAK_GIVE) : pxPeak * (1 + PEAK_GIVE);
    const floor = long ? entry * (1 + BE_BUFFER) : entry * (1 - BE_BUFFER);
    const peakSl = long ? Math.max(trailed, floor) : Math.min(trailed, floor);
    next = long ? Math.max(next, peakSl) : Math.min(next, peakSl);
  }
  if (long ? next > sl + 1e-12 : next < sl - 1e-12) return next;
  return null;
}
