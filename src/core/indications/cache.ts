// Per-symbol memo of indicator series so ~40 indications and 9 bots share one computation.
import type { Bars } from "../domain/types.ts";
import * as I from "../math/indicators.ts";

type Any = unknown;

export class SeriesCache {
  readonly b: Bars;
  private m = new Map<string, Any>();
  constructor(b: Bars) {
    this.b = b;
  }
  memo<T>(key: string, fn: () => T): T {
    const hit = this.m.get(key);
    if (hit !== undefined) return hit as T;
    const v = fn();
    this.m.set(key, v);
    return v;
  }
  ema(p: number) {
    return this.memo(`ema${p}`, () => I.ema(this.b.c, p));
  }
  sma(p: number) {
    return this.memo(`sma${p}`, () => I.sma(this.b.c, p));
  }
  rsi(p: number) {
    return this.memo(`rsi${p}`, () => I.rsi(this.b.c, p));
  }
  atr(p: number) {
    return this.memo(`atr${p}`, () => I.atr(this.b.h, this.b.l, this.b.c, p));
  }
  macd(f = 12, s = 26, g = 9) {
    return this.memo(`macd${f}.${s}.${g}`, () => I.macd(this.b.c, f, s, g));
  }
  bb(p = 20, k = 2) {
    return this.memo(`bb${p}.${k}`, () => I.bollinger(this.b.c, p, k));
  }
  psar(step = 0.02, max = 0.2) {
    return this.memo(`sar${step}.${max}`, () => I.psar(this.b.h, this.b.l, step, max));
  }
  dmi(p = 14) {
    return this.memo(`dmi${p}`, () => I.dmi(this.b.h, this.b.l, this.b.c, p));
  }
  st(p = 10, m = 3) {
    return this.memo(`st${p}.${m}`, () => I.supertrend(this.b.h, this.b.l, this.b.c, p, m));
  }
  don(p: number) {
    return this.memo(`don${p}`, () => I.donchianPrior(this.b.h, this.b.l, p));
  }
  vwap(p: number) {
    return this.memo(`vwap${p}`, () => I.vwapRolling(this.b.h, this.b.l, this.b.c, this.b.v, p));
  }
  volSma(p: number) {
    return this.memo(`vsma${p}`, () => I.sma(this.b.v, p));
  }
  roc(p: number) {
    return this.memo(`roc${p}`, () => I.roc(this.b.c, p));
  }
  stoch(p = 14, d = 3) {
    return this.memo(`stoch${p}.${d}`, () => I.stoch(this.b.h, this.b.l, this.b.c, p, d));
  }
  period(ms: number) {
    const b = this.b;
    return this.memo(`per${ms}`, () => I.periodLevels(b.t, b.h, b.l, b.c, b.o, b.v, ms));
  }
  rangeSma(p: number) {
    return this.memo(`rsma${p}`, () => {
      const r = new Float64Array(this.b.n);
      for (let i = 0; i < this.b.n; i++) r[i] = this.b.h[i] - this.b.l[i];
      return I.sma(r, p);
    });
  }
}
