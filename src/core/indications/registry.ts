// Indication registry: 10 kinds × independent configs. Each returns a per-bar directional STATE
// (+1 bullish, -1 bearish, 0 neutral) using only bars 0..i. Bots use it as an agree-filter; the
// "follow" bot enters on state onsets.
import type { IndicationDef, IndicationKind } from "../domain/types.ts";
import type { SeriesCache } from "./cache.ts";

export interface IndicationSpec extends IndicationDef {
  fn: (k: SeriesCache) => Int8Array;
}

const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const ok = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

function state(n: number, f: (i: number) => number): Int8Array {
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const v = f(i);
    out[i] = Number.isFinite(v) ? (sgn(v) as -1 | 0 | 1) : 0;
  }
  return out;
}

/** Extend event bars into a state that persists `keep` bars (latest event wins). */
function hold(ev: Int8Array, keep: number): Int8Array {
  const out = new Int8Array(ev.length);
  let cur = 0;
  let left = 0;
  for (let i = 0; i < ev.length; i++) {
    if (ev[i] !== 0) {
      cur = ev[i];
      left = keep;
    }
    if (left > 0) {
      out[i] = cur;
      left--;
    }
  }
  return out;
}

function spec(
  kind: IndicationKind,
  id: string,
  label: string,
  params: Record<string, number>,
  fn: (k: SeriesCache) => Int8Array,
): IndicationSpec {
  return { id, kind, label, params, fn };
}

export const INDICATIONS: readonly IndicationSpec[] = [
  // ── trend ───────────────────────────────────────────────
  spec("trend", "trend-ema", "EMA 9/21 trend", { fast: 9, slow: 21 }, (k) => {
    const f = k.ema(9), s = k.ema(21), c = k.b.c;
    return state(k.b.n, (i) => (ok(f[i], s[i]) ? (f[i] > s[i] && c[i] > s[i] ? 1 : f[i] < s[i] && c[i] < s[i] ? -1 : 0) : NaN));
  }),
  spec("trend", "trend-adx", "ADX 25 + DI", { p: 14, min: 25 }, (k) => {
    const { adx, pdi, mdi } = k.dmi(14);
    return state(k.b.n, (i) => (ok(adx[i]) && adx[i] >= 25 ? pdi[i] - mdi[i] : 0));
  }),
  spec("trend", "trend-st", "Supertrend 10×3", { p: 10, m: 3 }, (k) => k.st(10, 3).dir),
  spec("trend", "trend-ribbon", "Ribbon 9/21/55", { a: 9, b: 21, c: 55 }, (k) => {
    const a = k.ema(9), b = k.ema(21), c = k.ema(55);
    return state(k.b.n, (i) => (ok(a[i], b[i], c[i]) ? (a[i] > b[i] && b[i] > c[i] ? 1 : a[i] < b[i] && b[i] < c[i] ? -1 : 0) : NaN));
  }),
  // ── break ───────────────────────────────────────────────
  spec("break", "break-don20", "Donchian 20 break", { p: 20, keep: 6 }, (k) => {
    const { hi, lo } = k.don(20), c = k.b.c;
    return hold(state(k.b.n, (i) => (c[i] > hi[i] ? 1 : c[i] < lo[i] ? -1 : 0)), 6);
  }),
  spec("break", "break-vol", "Break + volume 1.6×", { p: 20, vol: 1.6, keep: 6 }, (k) => {
    const { hi, lo } = k.don(20), c = k.b.c, v = k.b.v, vs = k.volSma(20);
    return hold(state(k.b.n, (i) => (v[i] > 1.6 * vs[i] ? (c[i] > hi[i] ? 1 : c[i] < lo[i] ? -1 : 0) : 0)), 6);
  }),
  spec("break", "break-atr", "ATR 1.15× expansion", { p: 14, mul: 1.15, keep: 4 }, (k) => {
    const a = k.atr(14), c = k.b.c;
    return hold(state(k.b.n, (i) => (i > 0 && ok(a[i - 1]) && Math.abs(c[i] - c[i - 1]) > 1.15 * a[i - 1] ? c[i] - c[i - 1] : 0)), 4);
  }),
  spec("break", "break-squeeze", "BB squeeze break", { p: 20, look: 60, keep: 8 }, (k) => {
    const { up, lo, width } = k.bb(20, 2), c = k.b.c, n = k.b.n;
    const ev = new Int8Array(n);
    for (let i = 60; i < n; i++) {
      let minW = Infinity;
      for (let j = i - 60; j < i; j++) if (width[j] < minW) minW = width[j];
      const squeezed = width[i - 1] <= minW * 1.15;
      if (squeezed) ev[i] = c[i] > up[i] ? 1 : c[i] < lo[i] ? -1 : 0;
    }
    return hold(ev, 8);
  }),
  spec("break", "break-retest", "Break retest hold", { p: 20, keep: 5 }, (k) => {
    const { hi, lo } = k.don(20), { c, l, h } = k.b, n = k.b.n;
    const ev = new Int8Array(n);
    let lastUp = -99, lastDn = -99, lvlU = 0, lvlD = 0;
    for (let i = 1; i < n; i++) {
      if (c[i] > hi[i]) { lastUp = i; lvlU = hi[i]; }
      if (c[i] < lo[i]) { lastDn = i; lvlD = lo[i]; }
      if (i - lastUp > 1 && i - lastUp <= 8 && l[i] <= lvlU * 1.001 && c[i] > lvlU) ev[i] = 1;
      if (i - lastDn > 1 && i - lastDn <= 8 && h[i] >= lvlD * 0.999 && c[i] < lvlD) ev[i] = -1;
    }
    return hold(ev, 5);
  }),
  spec("break", "break-fail", "Failed break fade", { p: 20, keep: 5 }, (k) => {
    const { hi, lo } = k.don(20), { c, h, l } = k.b;
    return hold(state(k.b.n, (i) => (h[i] > hi[i] && c[i] < hi[i] ? -1 : l[i] < lo[i] && c[i] > lo[i] ? 1 : 0)), 5);
  }),
  // ── active ──────────────────────────────────────────────
  spec("active", "act-burst", "Range burst 1.8×", { p: 20, mul: 1.8, keep: 4 }, (k) => {
    const rs = k.rangeSma(20), { o, c, h, l } = k.b;
    return hold(state(k.b.n, (i) => (i > 0 && h[i] - l[i] > 1.8 * rs[i - 1] ? c[i] - o[i] : 0)), 4);
  }),
  spec("active", "act-shift", "Range shift 20/60", { a: 20, b: 60 }, (k) => {
    const a = k.rangeSma(20), b = k.rangeSma(60), r = k.roc(10);
    return state(k.b.n, (i) => (ok(a[i], b[i], r[i]) && a[i] > 1.2 * b[i] ? r[i] : 0));
  }),
  spec("active", "act-hf", "HF momentum 3", { n: 3 }, (k) => {
    const a = k.atr(14), c = k.b.c;
    return state(k.b.n, (i) => {
      if (i < 3 || !ok(a[i])) return NaN;
      const d = c[i] - c[i - 3];
      return Math.abs(d) > 0.9 * a[i] ? d : 0;
    });
  }),
  spec("active", "act-chop", "Chop fade", { p: 14 }, (k) => {
    const { adx } = k.dmi(14), r = k.rsi(7);
    return state(k.b.n, (i) => (ok(adx[i], r[i]) && adx[i] < 18 ? (r[i] < 30 ? 1 : r[i] > 70 ? -1 : 0) : 0));
  }),
  // ── direction ───────────────────────────────────────────
  spec("direction", "dir-emax", "EMA 9/21 cross", { f: 9, s: 21 }, (k) => {
    const f = k.ema(9), s = k.ema(21);
    return state(k.b.n, (i) => f[i] - s[i]);
  }),
  spec("direction", "dir-st", "Supertrend 7×2 flip", { p: 7, m: 2 }, (k) => k.st(7, 2).dir),
  spec("direction", "dir-vwap", "VWAP 60 axis", { p: 60 }, (k) => {
    const w = k.vwap(60), c = k.b.c;
    return state(k.b.n, (i) => c[i] - w[i]);
  }),
  spec("direction", "dir-macd", "MACD hist sign", {}, (k) => {
    const { hist } = k.macd();
    return state(k.b.n, (i) => hist[i]);
  }),
  spec("direction", "dir-thrust", "3-bar thrust", { n: 3, keep: 3 }, (k) => {
    const { c, o } = k.b;
    return hold(state(k.b.n, (i) => {
      if (i < 2) return 0;
      const u = c[i] > o[i] && c[i - 1] > o[i - 1] && c[i - 2] > o[i - 2] && c[i] > c[i - 1] && c[i - 1] > c[i - 2];
      const d = c[i] < o[i] && c[i - 1] < o[i - 1] && c[i - 2] < o[i - 2] && c[i] < c[i - 1] && c[i - 1] < c[i - 2];
      return u ? 1 : d ? -1 : 0;
    }), 3);
  }),
  spec("direction", "dir-reclaim", "EMA21 reclaim", { p: 21, keep: 4 }, (k) => {
    const e = k.ema(21), c = k.b.c;
    return hold(state(k.b.n, (i) => (i > 0 && ok(e[i - 1]) ? (c[i - 1] < e[i - 1] && c[i] > e[i] ? 1 : c[i - 1] > e[i - 1] && c[i] < e[i] ? -1 : 0) : 0)), 4);
  }),
  // ── move ────────────────────────────────────────────────
  spec("move", "move-impulse", "Impulse 6 bars 1.5 ATR", { n: 6, mul: 1.5, keep: 4 }, (k) => {
    const a = k.atr(14), c = k.b.c;
    return hold(state(k.b.n, (i) => (i >= 6 && ok(a[i]) && Math.abs(c[i] - c[i - 6]) > 1.5 * a[i] ? c[i] - c[i - 6] : 0)), 4);
  }),
  spec("move", "move-swing", "Swing 8 mid", { n: 8 }, (k) => {
    const { hi, lo } = k.don(8), c = k.b.c;
    return state(k.b.n, (i) => (ok(hi[i], lo[i]) ? (c[i] > hi[i] - (hi[i] - lo[i]) * 0.25 ? 1 : c[i] < lo[i] + (hi[i] - lo[i]) * 0.25 ? -1 : 0) : NaN));
  }),
  spec("move", "move-cont", "Continuation ROC12", { n: 12 }, (k) => {
    const r12 = k.roc(12), r3 = k.roc(3);
    return state(k.b.n, (i) => (ok(r12[i], r3[i]) ? (r12[i] > 0.004 && r3[i] < 0 ? 1 : r12[i] < -0.004 && r3[i] > 0 ? -1 : 0) : NaN));
  }),
  // ── rsi ─────────────────────────────────────────────────
  spec("rsi", "rsi-extreme", "RSI14 30/70 revert", { p: 14, lo: 30, hi: 70 }, (k) => {
    const r = k.rsi(14);
    return state(k.b.n, (i) => (r[i] < 30 ? 1 : r[i] > 70 ? -1 : 0));
  }),
  spec("rsi", "rsi-mid", "RSI14 55/45 momentum", { p: 14 }, (k) => {
    const r = k.rsi(14);
    return state(k.b.n, (i) => (r[i] > 55 ? 1 : r[i] < 45 ? -1 : 0));
  }),
  spec("rsi", "rsi-fast", "RSI7 20/80 revert", { p: 7 }, (k) => {
    const r = k.rsi(7);
    return state(k.b.n, (i) => (r[i] < 20 ? 1 : r[i] > 80 ? -1 : 0));
  }),
  spec("rsi", "rsi-div", "RSI divergence 10", { p: 14, look: 10, keep: 4 }, (k) => {
    const r = k.rsi(14), c = k.b.c;
    return hold(state(k.b.n, (i) => {
      if (i < 10 || !ok(r[i], r[i - 10])) return 0;
      if (c[i] < c[i - 10] && r[i] > r[i - 10] + 4 && r[i] < 45) return 1;
      if (c[i] > c[i - 10] && r[i] < r[i - 10] - 4 && r[i] > 55) return -1;
      return 0;
    }), 4);
  }),
  // ── bollinger ───────────────────────────────────────────
  spec("bollinger", "bb-bounce", "BB bounce", { p: 20, k: 2 }, (k) => {
    const { up, lo } = k.bb(20, 2), c = k.b.c;
    return state(k.b.n, (i) => (c[i] < lo[i] ? 1 : c[i] > up[i] ? -1 : 0));
  }),
  spec("bollinger", "bb-walk", "BB band walk", { p: 20, k: 2 }, (k) => {
    const { up, lo } = k.bb(20, 2), c = k.b.c;
    return state(k.b.n, (i) => (i > 0 && c[i] > up[i] && c[i - 1] > up[i - 1] ? 1 : i > 0 && c[i] < lo[i] && c[i - 1] < lo[i - 1] ? -1 : 0));
  }),
  spec("bollinger", "bb-mid", "BB mid reclaim", { p: 20, keep: 4 }, (k) => {
    const { mid } = k.bb(20, 2), c = k.b.c;
    return hold(state(k.b.n, (i) => (i > 0 && ok(mid[i - 1]) ? (c[i - 1] < mid[i - 1] && c[i] > mid[i] ? 1 : c[i - 1] > mid[i - 1] && c[i] < mid[i] ? -1 : 0) : 0)), 4);
  }),
  spec("bollinger", "bb-wick", "BB wick tag", { p: 20, keep: 3 }, (k) => {
    const { up, lo } = k.bb(20, 2), { c, h, l } = k.b;
    return hold(state(k.b.n, (i) => (l[i] < lo[i] && c[i] > lo[i] ? 1 : h[i] > up[i] && c[i] < up[i] ? -1 : 0)), 3);
  }),
  // ── sar ─────────────────────────────────────────────────
  spec("sar", "sar-std", "PSAR 0.02", { step: 0.02 }, (k) => k.psar(0.02, 0.2).dir),
  spec("sar", "sar-fast", "PSAR 0.04 fast", { step: 0.04 }, (k) => k.psar(0.04, 0.3).dir),
  spec("sar", "sar-flip", "PSAR flip event", { step: 0.02, keep: 6 }, (k) => {
    const d = k.psar(0.02, 0.2).dir;
    return hold(state(k.b.n, (i) => (i > 0 && d[i] !== d[i - 1] ? d[i] : 0)), 6);
  }),
  // ── macd ────────────────────────────────────────────────
  spec("macd", "macd-cross", "MACD signal cross", { keep: 6 }, (k) => {
    const { line, signal } = k.macd();
    return hold(state(k.b.n, (i) => (i > 0 && ok(signal[i - 1]) ? (line[i - 1] < signal[i - 1] && line[i] > signal[i] ? 1 : line[i - 1] > signal[i - 1] && line[i] < signal[i] ? -1 : 0) : 0)), 6);
  }),
  spec("macd", "macd-hist", "MACD hist rising", {}, (k) => {
    const { hist } = k.macd();
    return state(k.b.n, (i) => (i > 1 && ok(hist[i - 2]) ? (hist[i] > hist[i - 1] && hist[i - 1] > hist[i - 2] ? 1 : hist[i] < hist[i - 1] && hist[i - 1] < hist[i - 2] ? -1 : 0) : NaN));
  }),
  spec("macd", "macd-zero", "MACD zero line", {}, (k) => {
    const { line } = k.macd();
    return state(k.b.n, (i) => line[i]);
  }),
  // ── ema ─────────────────────────────────────────────────
  spec("ema", "ema-21-55", "EMA 21/55", { f: 21, s: 55 }, (k) => {
    const f = k.ema(21), s = k.ema(55);
    return state(k.b.n, (i) => f[i] - s[i]);
  }),
  spec("ema", "ema-pullback", "EMA21 pullback", { p: 21 }, (k) => {
    const e21 = k.ema(21), e55 = k.ema(55), { c, l, h } = k.b;
    return state(k.b.n, (i) => {
      if (!ok(e21[i], e55[i])) return NaN;
      if (e21[i] > e55[i] && l[i] <= e21[i] && c[i] > e21[i]) return 1;
      if (e21[i] < e55[i] && h[i] >= e21[i] && c[i] < e21[i]) return -1;
      return 0;
    });
  }),
  spec("ema", "ema-slope", "EMA50 slope", { p: 50, n: 5 }, (k) => {
    const e = k.ema(50);
    return state(k.b.n, (i) => (i >= 5 && ok(e[i - 5]) ? (e[i] - e[i - 5]) / e[i] - 0 : NaN));
  }),
  spec("ema", "ema-stoch", "EMA trend + stoch dip", { p: 21 }, (k) => {
    const e = k.ema(21), e2 = k.ema(55), { k: st } = k.stoch(14, 3);
    return state(k.b.n, (i) => (ok(e[i], e2[i], st[i]) ? (e[i] > e2[i] && st[i] < 25 ? 1 : e[i] < e2[i] && st[i] > 75 ? -1 : 0) : NaN));
  }),
];

export const INDICATION_BY_ID: ReadonlyMap<string, IndicationSpec> = new Map(INDICATIONS.map((s) => [s.id, s]));

export function indicationState(id: string, k: SeriesCache): Int8Array | null {
  if (id === "none") return null;
  const s = INDICATION_BY_ID.get(id);
  if (!s) throw new Error(`unknown indication ${id}`);
  return k.memo(`ind:${id}`, () => s.fn(k));
}
