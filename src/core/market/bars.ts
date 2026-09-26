// Bars construction and a deterministic synthetic feed (tests / offline fallback).
import type { Bars, Candle } from "../domain/types.ts";

export function barsFromCandles(sym: string, tfMin: number, candles: readonly Candle[]): Bars {
  const n = candles.length;
  const b: Bars = {
    sym,
    tfMin,
    n,
    t: new Float64Array(n),
    o: new Float64Array(n),
    h: new Float64Array(n),
    l: new Float64Array(n),
    c: new Float64Array(n),
    v: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const k = candles[i];
    b.t[i] = k.t;
    b.o[i] = k.o;
    b.h[i] = k.h;
    b.l[i] = k.l;
    b.c[i] = k.c;
    b.v[i] = k.v;
  }
  return b;
}

/** Keep only the last `max` bars. */
export function tailBars(b: Bars, max: number): Bars {
  if (b.n <= max) return b;
  const s = b.n - max;
  return {
    sym: b.sym,
    tfMin: b.tfMin,
    n: max,
    t: b.t.slice(s),
    o: b.o.slice(s),
    h: b.h.slice(s),
    l: b.l.slice(s),
    c: b.c.slice(s),
    v: b.v.slice(s),
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
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

/**
 * Deterministic regime-switching random walk with intraday mean reversion.
 * Same (sym, seed, endT) → same candles.
 */
export function syntheticCandles(sym: string, tfMin: number, count: number, endT: number, seed = 7): Candle[] {
  const rnd = mulberry32(hashStr(sym) ^ seed);
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const tfMs = tfMin * 60_000;
  const start = Math.floor(endT / tfMs) * tfMs - (count - 1) * tfMs;
  let px = 20 + (hashStr(sym) % 5000) / 10;
  const baseVol = 0.0018 * Math.sqrt(tfMin / 5) * (0.7 + rnd() * 0.8);
  let drift = 0;
  let regimeLeft = 0;
  let anchor = px;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    if (regimeLeft <= 0) {
      regimeLeft = 20 + Math.floor(rnd() * 120);
      drift = (rnd() - 0.5) * baseVol * 0.6;
      anchor = px;
    }
    regimeLeft--;
    const vol = baseVol * (0.6 + rnd() * 0.9);
    const pull = ((anchor - px) / px) * 0.04;
    const ret = drift + pull + gauss() * vol;
    const o = px;
    const c = Math.max(1e-6, o * (1 + ret));
    const wick = Math.abs(gauss()) * vol * 0.6;
    const h = Math.max(o, c) * (1 + wick * rnd());
    const l = Math.min(o, c) * (1 - wick * rnd());
    const v = 1000 * (0.5 + rnd()) * (1 + Math.abs(ret) / baseVol);
    out.push({ t: start + i * tfMs, o, h, l, c, v });
    px = c;
  }
  return out;
}

/** Resample candles to a larger timeframe (tfMin must be a multiple of the source). Incomplete buckets are dropped. */
export function resample(candles: readonly Candle[], srcMin: number, tfMin: number): Candle[] {
  if (tfMin === srcMin) return [...candles];
  const k = tfMin / srcMin;
  const tfMs = tfMin * 60_000;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let cnt = 0;
  for (const c of candles) {
    const b = Math.floor(c.t / tfMs) * tfMs;
    if (!cur || cur.t !== b) {
      if (cur && cnt === k) out.push(cur);
      cur = { t: b, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
      cnt = 1;
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
      cnt++;
    }
  }
  if (cur && cnt === k) out.push(cur);
  return out;
}
