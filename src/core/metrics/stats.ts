// Trade statistics: PF, WR, net, MDD, DDT (drawdown time), SQN, recovery.
import { PF_NO_LOSS } from "../config.ts";
import type { Stats } from "../domain/types.ts";

const H = 3_600_000;

/** Minimal trade shape for stats. `r` is net return on notional (fraction). */
export interface TradeLike {
  r: number;
  entryT: number;
  exitT: number;
}

export function profitFactor(gp: number, gl: number): number {
  if (gl <= 0) return gp > 0 ? PF_NO_LOSS : 0;
  return gp / gl;
}

export const EMPTY_STATS: Stats = Object.freeze({
  n: 0,
  wins: 0,
  losses: 0,
  wr: 0,
  pf: 0,
  net: 0,
  avg: 0,
  gp: 0,
  gl: 0,
  mdd: 0,
  ddt: 0,
  ddtNow: 0,
  expectancy: 0,
  sqn: 0,
  recovery: 0,
  avgHoldMin: 0,
  firstT: 0,
  lastT: 0,
  hours: 0,
  greenHours: 0,
  gh: 0,
  tph: 0,
  worstHour: 0,
}) as Stats;

/** Net per clock hour (by exit time), percent. */
export function hourlyNet(trades: readonly TradeLike[]): Map<number, { net: number; n: number }> {
  const m = new Map<number, { net: number; n: number }>();
  for (const t of trades) {
    const k = Math.floor(t.exitT / H) * H;
    const e = m.get(k);
    if (e) {
      e.net += t.r * 100;
      e.n++;
    } else m.set(k, { net: t.r * 100, n: 1 });
  }
  return m;
}

/**
 * Stats over trades in exit order. The equity curve is the cumulative sum of `r` (one notional per trade).
 * DDT = longest time (hours) from a curve peak until the curve regains it; an unrecovered drawdown counts
 * up to `nowT` (defaults to the last exit).
 */
export function statsOf(trades: readonly TradeLike[], nowT?: number): Stats {
  const n = trades.length;
  if (n === 0) return { ...EMPTY_STATS };
  let gp = 0;
  let gl = 0;
  let wins = 0;
  let sum = 0;
  let sum2 = 0;
  let hold = 0;
  let cum = 0;
  let peak = 0;
  let peakT = trades[0].entryT;
  let dipped = false;
  let mdd = 0;
  let ddt = 0;
  let firstT = Infinity;
  for (let i = 0; i < n; i++) {
    const tr = trades[i];
    const r = tr.r;
    if (r > 0) {
      gp += r;
      wins++;
    } else gl -= r;
    sum += r;
    sum2 += r * r;
    hold += tr.exitT - tr.entryT;
    if (tr.entryT < firstT) firstT = tr.entryT;
    cum += r;
    if (cum < peak) {
      dipped = true;
      if (peak - cum > mdd) mdd = peak - cum;
    } else {
      if (dipped && tr.exitT - peakT > ddt) ddt = tr.exitT - peakT;
      dipped = false;
      peak = cum;
      peakT = tr.exitT;
    }
  }
  const lastT = trades[n - 1].exitT;
  const end = Math.max(nowT ?? lastT, lastT);
  const ddtNow = dipped ? end - peakT : 0;
  if (ddtNow > ddt) ddt = ddtNow;
  const avg = sum / n;
  const variance = n > 1 ? Math.max(0, (sum2 - n * avg * avg) / (n - 1)) : 0;
  const sd = Math.sqrt(variance);
  const net = sum * 100;
  const hn = hourlyNet(trades);
  let greenHours = 0;
  let worstHour = 0;
  for (const e of hn.values()) {
    if (e.net > 0) greenHours++;
    if (e.net < worstHour) worstHour = e.net;
  }
  return {
    n,
    wins,
    losses: n - wins,
    wr: wins / n,
    pf: profitFactor(gp, gl),
    net,
    avg: avg * 100,
    gp: gp * 100,
    gl: gl * 100,
    mdd: mdd * 100,
    ddt: ddt / H,
    ddtNow: ddtNow / H,
    expectancy: avg * 100,
    sqn: sd > 0 ? (avg / sd) * Math.sqrt(Math.min(n, 100)) : 0,
    recovery: mdd > 0 ? sum / mdd : sum > 0 ? PF_NO_LOSS : 0,
    avgHoldMin: hold / n / 60_000,
    firstT,
    lastT,
    hours: hn.size,
    greenHours,
    gh: hn.size ? greenHours / hn.size : 0,
    tph: hn.size ? n / hn.size : 0,
    worstHour,
  };
}

/** Cumulative curve points (exitT, cum%) plus drawdown shading segments for charts. */
export function equityCurve(
  trades: readonly TradeLike[],
): { t: number[]; eq: number[]; dd: number[]; ddSpans: Array<[number, number]> } {
  const t: number[] = [];
  const eq: number[] = [];
  const dd: number[] = [];
  const ddSpans: Array<[number, number]> = [];
  let cum = 0;
  let peak = 0;
  let peakT = trades.length ? trades[0].entryT : 0;
  let inDd = false;
  for (const tr of trades) {
    cum += tr.r * 100;
    if (cum < peak) inDd = true;
    else {
      if (inDd) ddSpans.push([peakT, tr.exitT]);
      inDd = false;
      peak = cum;
      peakT = tr.exitT;
    }
    t.push(tr.exitT);
    eq.push(cum);
    dd.push(cum - peak);
  }
  if (inDd && trades.length) ddSpans.push([peakT, trades[trades.length - 1].exitT]);
  return { t, eq, dd, ddSpans };
}

/**
 * Composite rank score. Rewards net, PF, green-hour ratio and order count; penalises MDD and DDT.
 * Needs a minimum sample.
 */
export function scoreStats(s: Stats, minTrades = 8): number {
  if (s.n < minTrades || s.net <= 0) return Math.min(0, s.net) - (s.n < minTrades ? 1 : 0);
  const pf = Math.min(s.pf, 3);
  const sample = Math.sqrt(Math.min(s.n, 1000) / 20);
  const hourly = (0.35 + s.gh) ** 2;
  return (s.net * (pf - 0.8) * sample * hourly) / (1 + s.mdd / 4) / (1 + s.ddt / 48);
}
