// Walk-forward trade simulation ("simulated trade runs").
//
// Every step (default 1h) the portfolio is re-selected from the PRE-HISTORIC window: only trades that
// CLOSED in the previous `preH` hours (default 20h) count. The selected configs then trade the next step.
// All tapes are causal (signal at bar close → entry next open), so a decision at time T never sees T+.
//
// The broker applies the live rules on the combined order stream:
//   - last-N check per config (last N closed trades before the entry must hold PF >= neutral)
//   - max concurrent positions per symbol and in total
//   - honest hour guard (closed trades in the current hour down by guard% → wait for the next hour)
import { allCombos, configId } from "../pipeline/pipeline.ts";
import type { Universe } from "../pipeline/pipeline.ts";
import { comboSignal } from "../bots/bots.ts";
import { PF_NEUTRAL, type CoreSettings } from "../config.ts";
import type { BotType, Gates, OpenPosition, Protect, Stats, Trade } from "../domain/types.ts";
import { hourlyNet, profitFactor, scoreStats, statsOf } from "../metrics/stats.ts";
import { simulate } from "./backtest.ts";

const H = 3_600_000;

export interface WalkForwardOptions {
  preH: number;
  simH: number;
  stepH: number;
  /** simulation start; default = end - simH */
  startT?: number;
  portfolio: number;
  /** last-N check; 0 = off */
  lastN: number;
  lastNMinPf: number;
  maxPerSymbol: number;
  maxOpen: number;
  guardPct: number;
  /** long agreement window (hours, 0 = off): config must also pass minPf over this longer history */
  longH: number;
  /** share of a pair's protect variants that must pass the long window */
  robustFrac: number;
  /** ranking: "score" (hour-aware composite) or "lcb" (lower confidence bound of mean return) */
  rank: "score" | "lcb";
  gates: Gates;
  cost: number;
  protects: readonly Protect[];
}

/** Protect variants for the walk-forward tapes. Hold is in bars of 15m (3h and 8h). */
export const WF_PROTECTS: readonly Protect[] = (() => {
  const out: Protect[] = [];
  for (const tp of [0.018, 0.026, 0.035, 0.05])
    for (const k of [1, 1.5])
      for (const hold of [12, 32]) out.push({ tp, sl: +(tp * k).toFixed(4), trail: 0, hold });
  return out;
})();

export function defaultWalkForward(s: CoreSettings): WalkForwardOptions {
  return {
    preH: 20,
    simH: 48,
    stepH: 1,
    portfolio: 12,
    lastN: 12,
    lastNMinPf: PF_NEUTRAL,
    maxPerSymbol: 2,
    maxOpen: 40,
    guardPct: 1,
    longH: 168,
    robustFrac: 0.6,
    rank: "lcb",
    gates: s.gates,
    cost: s.cost,
    protects: WF_PROTECTS,
  };
}

export interface ConfigTape {
  id: string;
  bot: BotType;
  ind: string;
  protect: Protect;
  /** by exit time */
  trades: Trade[];
  exitT: Float64Array;
  /** positions still open at the last bar */
  open: OpenPosition[];
  /** signals on the last closed bar (enter at the next open) */
  pending: Array<{ sym: string; side: 1 | -1 }>;
}

/** Causal tapes for every combo × protect over the whole universe. Generator so callers can time-slice. */
export function* buildTapesGen(u: Universe, protects: readonly Protect[], cost: number): Generator<{ done: number; total: number }, ConfigTape[]> {
  const combos = allCombos();
  const out: ConfigTape[] = [];
  const total = combos.length * protects.length;
  let done = 0;
  for (const c of combos) {
    const sigs = u.caches.map((k) => comboSignal(c.bot, c.ind, k));
    if (sigs.some((x) => x === null)) {
      done += protects.length;
      continue;
    }
    for (const p of protects) {
      const id = configId(c.bot, c.ind, p);
      const trades: Trade[] = [];
      const open: OpenPosition[] = [];
      const pending: Array<{ sym: string; side: 1 | -1 }> = [];
      for (let s = 0; s < u.bars.length; s++) {
        const res = simulate(id, u.bars[s], sigs[s]!, p, { cost });
        for (const tr of res.trades) trades.push(tr);
        if (res.open) open.push(res.open);
        if (res.pending) pending.push({ sym: u.bars[s].sym, side: res.pending });
      }
      trades.sort((a, b) => a.exitT - b.exitT || a.entryT - b.entryT);
      out.push({ id, bot: c.bot, ind: c.ind, protect: p, trades, exitT: Float64Array.from(trades, (t) => t.exitT), open, pending });
      done++;
      if (done % 8 === 0) yield { done, total };
    }
  }
  return out;
}

export function buildTapes(u: Universe, protects: readonly Protect[], cost: number, onProgress?: (done: number, total: number) => void): ConfigTape[] {
  const gen = buildTapesGen(u, protects, cost);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
    if (onProgress && r.value.done % 200 === 0) onProgress(r.value.done, r.value.total);
  }
}

/** First index with exitT >= t. */
function lowerBound(a: Float64Array, t: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m] < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export interface StepLog {
  t: number;
  selected: string[];
  eligible: number;
  taken: number;
  skipped: number;
  net: number;
}

export interface WalkForwardResult {
  startT: number;
  endT: number;
  opts: Omit<WalkForwardOptions, "protects" | "gates"> & { gates: Gates };
  trades: Trade[];
  stats: Stats;
  hourly: Array<{ t: number; net: number; n: number; pf: number }>;
  /** PF per consecutive block (default 8h): stability view */
  blocks: Array<{ t: number; n: number; pf: number; net: number }>;
  steps: StepLog[];
  byConfig: Array<{ id: string; n: number; net: number; pf: number }>;
  stable: boolean;
}

export interface Selection {
  id: string;
  score: number;
  window: Stats;
}

/**
 * Selection at time t (uses only trades closed before t):
 *   1. long window (longH): a variant is eligible with n >= minLong, PF >= minPf, net > 0, DDT <= maxDdtH
 *   2. robustness: a bot × indication pair needs >= robustFrac of its protect variants eligible
 *      (a lone lucky parameter set is rejected)
 *   3. pre-historic check (preH, default 20h): the variant must still be working, i.e. PF >= neutral and
 *      net >= 0 over the last preH hours (a quiet window with < 3 closes is allowed)
 *   4. rank by the lower confidence bound of the long-window return; best variant per pair; top `portfolio`
 */
export function selectAt(tapes: readonly ConfigTape[], t: number, o: WalkForwardOptions): { picks: Selection[]; eligible: number } {
  const longH = Math.max(o.longH, o.preH);
  const fromLong = t - longH * H;
  const fromPre = t - o.preH * H;
  const minLong = Math.max(8, o.gates.minTrades);
  const pairTotal = new Map<string, number>();
  const pairOk = new Map<string, number>();
  const cand: Array<Selection & { pair: string }> = [];
  for (const tp of tapes) {
    const a = lowerBound(tp.exitT, fromLong);
    const b = lowerBound(tp.exitT, t);
    if (b - a < minLong) continue;
    const pair = `${tp.bot}|${tp.ind}`;
    pairTotal.set(pair, (pairTotal.get(pair) ?? 0) + 1);
    const w = statsOf(tp.trades.slice(a, b), t);
    // DDT limit scales with the window: maxDdtH is defined per 72h of history
    if (w.net <= 0 || w.pf < o.gates.minPf || w.ddt > (o.gates.maxDdtH * longH) / 72) continue;
    pairOk.set(pair, (pairOk.get(pair) ?? 0) + 1);
    const pa = lowerBound(tp.exitT, fromPre);
    const pre = statsOf(tp.trades.slice(pa, b), t);
    if (pre.n >= 3 && (pre.pf < PF_NEUTRAL || pre.net < 0)) continue;
    const score = o.rank === "lcb" ? lcb(tp.trades, a, b) : scoreStats(w, minLong);
    if (!(score > 0)) continue;
    cand.push({ id: tp.id, score, window: w, pair });
  }
  const robust = (pair: string) => (pairOk.get(pair) ?? 0) / Math.max(1, pairTotal.get(pair) ?? 0) >= o.robustFrac;
  const scored = cand.filter((c) => robust(c.pair)).sort((x, y) => y.score - x.score);
  const pairs = new Set<string>();
  const picks: Selection[] = [];
  for (const s of scored) {
    if (pairs.has(s.pair)) continue;
    pairs.add(s.pair);
    picks.push({ id: s.id, score: s.score, window: s.window });
    if (picks.length >= o.portfolio) break;
  }
  return { picks, eligible: scored.length };
}

/** Lower confidence bound (≈ 1σ) of the summed return: mean·n − sd·√n, in percent. */
function lcb(trades: readonly Trade[], a: number, b: number): number {
  const n = b - a;
  if (n < 2) return 0;
  let s = 0;
  let s2 = 0;
  for (let i = a; i < b; i++) {
    s += trades[i].r;
    s2 += trades[i].r * trades[i].r;
  }
  const m = s / n;
  const sd = Math.sqrt(Math.max(0, (s2 - n * m * m) / (n - 1)));
  return (m * n - sd * Math.sqrt(n)) * 100;
}

function lastNOk(tp: ConfigTape, entryT: number, n: number, minPf: number): boolean {
  if (n <= 0) return true;
  const b = lowerBound(tp.exitT, entryT + 1); // closed at or before entry
  if (b < n) return false;
  let gp = 0;
  let gl = 0;
  for (let i = b - n; i < b; i++) {
    const r = tp.trades[i].r;
    if (r > 0) gp += r;
    else gl -= r;
  }
  return profitFactor(gp, gl) >= minPf;
}

export function walkForward(u: Universe, tapes: readonly ConfigTape[], o: WalkForwardOptions): WalkForwardResult {
  const byId = new Map(tapes.map((t) => [t.id, t]));
  const endT = u.nowT;
  const startT = o.startT ?? Math.floor((endT - o.simH * H) / H) * H;
  const stopT = Math.min(endT, startT + o.simH * H);
  const steps: StepLog[] = [];
  const trades: Trade[] = [];
  const open: Trade[] = []; // taken, sorted by exit
  const hourNet = new Map<number, number>();
  const settle = (t: number) => {
    while (open.length && open[0].exitT <= t) {
      const x = open.shift()!;
      const k = Math.floor(x.exitT / H);
      hourNet.set(k, (hourNet.get(k) ?? 0) + x.r * 100);
    }
  };

  for (let t = startT; t < stopT; t += o.stepH * H) {
    const { picks, eligible } = selectAt(tapes, t, o);
    const cands: Array<{ tr: Trade; tp: ConfigTape }> = [];
    for (const p of picks) {
      const tp = byId.get(p.id)!;
      for (const tr of tp.trades) if (tr.entryT >= t && tr.entryT < t + o.stepH * H && tr.entryT < stopT) cands.push({ tr, tp });
    }
    cands.sort((a, b) => a.tr.entryT - b.tr.entryT || a.tr.cfg.localeCompare(b.tr.cfg));
    let taken = 0;
    let skipped = 0;
    let net = 0;
    for (const { tr, tp } of cands) {
      settle(tr.entryT);
      const hourKey = Math.floor(tr.entryT / H);
      const guardHit = o.guardPct > 0 && (hourNet.get(hourKey) ?? 0) <= -o.guardPct;
      const symOpen = open.reduce((a, x) => a + (x.sym === tr.sym ? 1 : 0), 0);
      const dupe = open.some((x) => x.sym === tr.sym && x.side === tr.side && x.cfg === tr.cfg);
      if (guardHit || dupe || symOpen >= o.maxPerSymbol || open.length >= o.maxOpen || !lastNOk(tp, tr.entryT, o.lastN, o.lastNMinPf)) {
        skipped++;
        continue;
      }
      trades.push(tr);
      taken++;
      net += tr.r * 100;
      let j = open.length;
      open.push(tr);
      while (j > 0 && open[j - 1].exitT > tr.exitT) {
        open[j] = open[j - 1];
        j--;
      }
      open[j] = tr;
    }
    steps.push({ t, selected: picks.map((p) => p.id), eligible, taken, skipped, net });
  }

  trades.sort((a, b) => a.exitT - b.exitT);
  const stats = statsOf(trades, stopT);
  const hn = hourlyNet(trades);
  const hourly = [...hn.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, e]) => {
      const inH = trades.filter((x) => Math.floor(x.exitT / H) * H === t);
      let gp = 0;
      let gl = 0;
      for (const x of inH) x.r > 0 ? (gp += x.r) : (gl -= x.r);
      return { t, net: e.net, n: e.n, pf: profitFactor(gp, gl) };
    });
  const blockH = 8;
  const blocks: WalkForwardResult["blocks"] = [];
  for (let b = startT; b < stopT; b += blockH * H) {
    const sel = trades.filter((x) => x.exitT >= b && x.exitT < b + blockH * H);
    const s = statsOf(sel);
    blocks.push({ t: b, n: s.n, pf: s.pf, net: s.net });
  }
  const cfgMap = new Map<string, Trade[]>();
  for (const tr of trades) (cfgMap.get(tr.cfg) ?? cfgMap.set(tr.cfg, []).get(tr.cfg)!).push(tr);
  const byConfig = [...cfgMap.entries()]
    .map(([id, xs]) => {
      const s = statsOf(xs);
      return { id, n: s.n, net: s.net, pf: s.pf };
    })
    .sort((a, b) => b.net - a.net);
  const activeBlocks = blocks.filter((b) => b.n >= 3);
  const stable = stats.pf >= o.gates.minPf && stats.net > 0 && activeBlocks.every((b) => b.pf >= PF_NEUTRAL * 0.9);
  const { protects: _p, ...rest } = o;
  return { startT, endT: stopT, opts: rest, trades, stats, hourly, blocks, steps, byConfig, stable };
}
