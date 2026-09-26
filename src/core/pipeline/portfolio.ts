// Bot portfolio: many uncorrelated configs trading together raise the order count AND smooth the
// hourly result. Members are picked greedily on IN-SAMPLE data to maximise the hour-aware score of
// the combined gated tape; the out-of-sample half reports what that portfolio actually did.
//
// Hour guard (honest): within a clock hour, once trades that have ALREADY CLOSED in that hour are down
// by `stop`%, new entries wait for the next hour. Open trades keep their own exits.
import type { Gates, Stats, Trade } from "../domain/types.ts";
import { gatedTrades } from "../lastn/optimizer.ts";
import { hourlyNet, scoreStats, statsOf } from "../metrics/stats.ts";

const H = 3_600_000;

export interface PortfolioCandidate {
  id: string;
  trades: readonly Trade[];
  bestN: number;
}

export interface HourPoint {
  t: number;
  net: number;
  n: number;
}

export interface Portfolio {
  members: string[];
  guardPct: number;
  is: Stats;
  oos: Stats;
  full: Stats;
  hourly: HourPoint[];
  tape: Trade[];
}

/** Apply the hour guard; `tape` in any order, result in exit order. stopPct 0 = off. */
export function applyHourGuard(tape: readonly Trade[], stopPct: number): Trade[] {
  const byExit = [...tape].sort((a, b) => a.exitT - b.exitT);
  if (stopPct <= 0) return byExit;
  const byEntry = [...tape].sort((a, b) => a.entryT - b.entryT || a.exitT - b.exitT);
  const taken: Trade[] = [];
  const open: Trade[] = []; // taken, not yet counted; sorted by exit
  const hourNet = new Map<number, number>();
  for (const tr of byEntry) {
    while (open.length && open[0].exitT <= tr.entryT) {
      const x = open.shift()!;
      const k = Math.floor(x.exitT / H);
      hourNet.set(k, (hourNet.get(k) ?? 0) + x.r * 100);
    }
    if ((hourNet.get(Math.floor(tr.entryT / H)) ?? 0) <= -stopPct) continue;
    taken.push(tr);
    let j = open.length;
    open.push(tr);
    while (j > 0 && open[j - 1].exitT > tr.exitT) {
      open[j] = open[j - 1];
      j--;
    }
    open[j] = tr;
  }
  return taken.sort((a, b) => a.exitT - b.exitT);
}

const GUARD_OPTIONS = [0, 0.3, 0.6, 1.0];

function split(tape: readonly Trade[], splitT: number) {
  const is: Trade[] = [];
  const oos: Trade[] = [];
  for (const t of tape) (t.entryT < splitT ? is : oos).push(t);
  return { is, oos };
}

export function buildPortfolio(
  cands: readonly PortfolioCandidate[],
  o: { gates: Gates; splitT: number; nowT: number; maxSize: number; tolerance?: number; ghSlack?: number },
): Portfolio {
  const gated = cands.map((c) => ({ id: c.id, tape: gatedTrades(c.trades, c.bestN, o.gates) }));
  const isScore = (tape: readonly Trade[]) => {
    const s = statsOf(split(tape, o.splitT).is, o.splitT);
    return { s, j: scoreStats(s, 8) };
  };
  const members: number[] = [];
  let combo: Trade[] = [];
  let cur = { s: statsOf([]), j: -Infinity };
  const used = new Set<number>();
  while (members.length < o.maxSize) {
    let best = -1;
    let bestRes = cur;
    let bestTape: Trade[] = combo;
    for (let i = 0; i < gated.length; i++) {
      if (used.has(i) || gated[i].tape.length === 0) continue;
      const tape = combo.concat(gated[i].tape);
      const r = isScore(tape);
      const accept = members.length === 0 ? r.j > bestRes.j : r.j >= Math.max(bestRes.j, cur.j * (o.tolerance ?? 0.97)) && r.s.gh >= cur.s.gh - (o.ghSlack ?? 0.02);
      if (accept && (best < 0 || r.j > bestRes.j)) {
        best = i;
        bestRes = r;
        bestTape = tape;
      }
    }
    if (best < 0 || bestRes.j <= 0) break;
    used.add(best);
    members.push(best);
    combo = bestTape;
    cur = bestRes;
  }
  // choose the hour guard in-sample
  let guardPct = 0;
  let guardJ = cur.j;
  for (const g of GUARD_OPTIONS) {
    if (g === 0) continue;
    const r = isScore(applyHourGuard(combo, g));
    if (r.j > guardJ * 1.02) {
      guardJ = r.j;
      guardPct = g;
    }
  }
  const tape = applyHourGuard(combo, guardPct);
  const parts = split(tape, o.splitT);
  const hn = hourlyNet(tape);
  const hourly: HourPoint[] = [...hn.entries()].sort((a, b) => a[0] - b[0]).map(([t, e]) => ({ t, net: e.net, n: e.n }));
  return {
    members: members.map((i) => gated[i].id),
    guardPct,
    is: statsOf(parts.is, o.splitT),
    oos: statsOf(parts.oos, o.nowT),
    full: statsOf(tape, o.nowT),
    hourly,
    tape,
  };
}
