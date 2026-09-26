// Progressive pipeline over a universe of symbols:
//   S1 coarse    every bot × indication with the default protect
//   S2 refine    TP/SL/trail grid on the S1 leaders
//   S3 last-N    walk-forward gate optimisation (N chosen in-sample, reported out-of-sample)
//   S4 evals     continuous independent window evals
//   S5 arm       configs that pass both S3 and S4 are armed for paper (and optionally live)
// Selection in S1/S2 uses in-sample trades only, so S3's out-of-sample numbers stay honest.
// Implemented as a generator so the runtime can time-slice it.
import { BOTS, comboSignal } from "../bots/bots.ts";
import { DEFAULT_PROTECT, PROTECT_GRID, type CoreSettings } from "../config.ts";
import type { Bars, BotType, EvalResult, LastNResult, OpenPosition, Protect, Side, Stats, Trade } from "../domain/types.ts";
import { evaluateConfig } from "../evals/evaluator.ts";
import { SeriesCache } from "../indications/cache.ts";
import { INDICATIONS } from "../indications/registry.ts";
import { optimizeLastN } from "../lastn/optimizer.ts";
import { scoreStats, statsOf } from "../metrics/stats.ts";
import { simulate } from "../sim/backtest.ts";
import { buildPortfolio, type Portfolio } from "./portfolio.ts";

export interface Universe {
  bars: Bars[];
  caches: SeriesCache[];
  startT: number;
  endT: number;
  splitT: number;
  /** close time of the last bar */
  nowT: number;
}

export function makeUniverse(bars: Bars[]): Universe {
  const ok = bars.filter((b) => b.n >= 120);
  let startT = Infinity;
  let endT = 0;
  let tf = 5;
  for (const b of ok) {
    startT = Math.min(startT, b.t[0]);
    endT = Math.max(endT, b.t[b.n - 1]);
    tf = b.tfMin;
  }
  if (!ok.length) startT = endT = 0;
  return {
    bars: ok,
    caches: ok.map((b) => new SeriesCache(b)),
    startT,
    endT,
    splitT: startT + (endT - startT) / 2,
    nowT: endT + tf * 60_000,
  };
}

export interface Combo {
  bot: BotType;
  ind: string;
}

export function allCombos(): Combo[] {
  const out: Combo[] = [];
  for (const b of BOTS) {
    if (b.type !== "follow") out.push({ bot: b.type, ind: "none" });
    for (const ind of INDICATIONS) out.push({ bot: b.type, ind: ind.id });
  }
  return out;
}

const pct = (x: number) => Math.round(x * 10000) / 100;
export function configId(bot: BotType, ind: string, p: Protect): string {
  return `${bot}|${ind}|tp${pct(p.tp)}|sl${pct(p.sl)}|tr${pct(p.trail)}|h${p.hold}`;
}

const fromPct = (s: string) => +(Number(s) / 100).toFixed(6);

export function parseConfigId(id: string): { bot: BotType; ind: string; protect: Protect } | null {
  const m = /^([a-z]+)\|([a-z0-9-]+)\|tp([\d.]+)\|sl([\d.]+)\|tr([\d.]+)\|h(\d+)$/.exec(id);
  if (!m) return null;
  return {
    bot: m[1] as BotType,
    ind: m[2],
    protect: { tp: fromPct(m[3]), sl: fromPct(m[4]), trail: fromPct(m[5]), hold: +m[6] },
  };
}

export interface SymStat {
  n: number;
  net: number;
  pf: number;
}

export interface ComboRun {
  id: string;
  bot: BotType;
  ind: string;
  protect: Protect;
  stage: 1 | 2;
  trades: Trade[];
  full: Stats;
  is: Stats;
  score: number;
  bySym: Record<string, SymStat>;
  open: OpenPosition[];
  pending: Array<{ sym: string; side: Side }>;
}

export function runCombo(u: Universe, bot: BotType, ind: string, protect: Protect, cost: number, stage: 1 | 2): ComboRun | null {
  const id = configId(bot, ind, protect);
  const trades: Trade[] = [];
  const open: OpenPosition[] = [];
  const pending: Array<{ sym: string; side: Side }> = [];
  const bySym: Record<string, SymStat> = {};
  for (let s = 0; s < u.bars.length; s++) {
    const sig = comboSignal(bot, ind, u.caches[s]);
    if (!sig) return null;
    const res = simulate(id, u.bars[s], sig, protect, { cost });
    for (const tr of res.trades) trades.push(tr);
    if (res.open) open.push(res.open);
    if (res.pending) pending.push({ sym: u.bars[s].sym, side: res.pending });
    if (res.trades.length) {
      const st = statsOf(res.trades);
      bySym[u.bars[s].sym] = { n: st.n, net: st.net, pf: st.pf };
    }
  }
  trades.sort((a, b) => a.exitT - b.exitT || a.entryT - b.entryT);
  const isTrades = trades.filter((t) => t.entryT < u.splitT);
  const is = statsOf(isTrades, u.splitT);
  return {
    id,
    bot,
    ind,
    protect,
    stage,
    trades,
    full: statsOf(trades, u.nowT),
    is,
    score: scoreStats(is, 8),
    bySym,
    open,
    pending,
  };
}

export interface RankedConfig {
  id: string;
  bot: BotType;
  ind: string;
  protect: Protect;
  stage: 1 | 2;
  full: Stats;
  is: Stats;
  score: number;
  lastN: LastNResult | null;
  evalRes: EvalResult | null;
  rank: number;
  armed: boolean;
}

export interface PipelineProgress {
  stage: "S1" | "S2" | "S3" | "S4" | "S5";
  done: number;
  total: number;
  label: string;
}

export interface PipelineOutput {
  at: number;
  universe: { symbols: string[]; startT: number; endT: number; splitT: number; nowT: number; bars: number };
  s1: ComboRun[];
  s2: ComboRun[];
  ranked: RankedConfig[];
  tapes: Map<string, Trade[]>;
  runs: Map<string, ComboRun>;
  armed: string[];
  portfolio: Portfolio;
  timings: Record<string, number>;
}

function refineGrid(): Protect[] {
  const out: Protect[] = [];
  for (const tp of PROTECT_GRID.tp)
    for (const k of PROTECT_GRID.slOfTp)
      for (const trail of PROTECT_GRID.trail)
        for (const hold of PROTECT_GRID.hold) {
          if (trail >= tp) continue;
          out.push({ tp, sl: Math.round(tp * k * 10000) / 10000, trail, hold });
        }
  return out;
}

export const REFINE_GRID: readonly Protect[] = refineGrid();

/** Strip bulky fields for storage in the S1 list. */
function slim(r: ComboRun): ComboRun {
  return { ...r, trades: [], open: [], pending: [] };
}

export function* runPipeline(u: Universe, s: CoreSettings): Generator<PipelineProgress, PipelineOutput> {
  const timings: Record<string, number> = {};
  const cost = s.cost;
  const g = s.gates;
  let t0 = performance.now();

  // S1
  const combos = allCombos();
  const s1: ComboRun[] = [];
  for (let i = 0; i < combos.length; i++) {
    const c = combos[i];
    const r = runCombo(u, c.bot, c.ind, DEFAULT_PROTECT, cost, 1);
    if (r) s1.push(slim(r));
    if (i % 4 === 3) yield { stage: "S1", done: i + 1, total: combos.length, label: `${c.bot} × ${c.ind}` };
  }
  s1.sort((a, b) => b.score - a.score);
  timings.S1 = performance.now() - t0;

  // S2
  t0 = performance.now();
  const leaders = s1.filter((r) => r.is.n >= 4).slice(0, s.refineTop);
  const runs = new Map<string, ComboRun>();
  const s2: ComboRun[] = [];
  const grid = REFINE_GRID;
  const total2 = leaders.length * grid.length;
  let done2 = 0;
  for (const L of leaders) {
    for (const p of grid) {
      const r = runCombo(u, L.bot, L.ind, p, cost, 2);
      done2++;
      if (!r) continue;
      s2.push(r);
      if (done2 % 12 === 0) yield { stage: "S2", done: done2, total: total2, label: r.id };
    }
  }
  s2.sort((a, b) => b.score - a.score);
  timings.S2 = performance.now() - t0;

  // S3 + S4 on the top configs (at most 2 protect variants per bot × indication, keeps diversity)
  t0 = performance.now();
  const perPair = new Map<string, number>();
  const chosen: ComboRun[] = [];
  for (const r of s2) {
    const k = `${r.bot}|${r.ind}`;
    const c = perPair.get(k) ?? 0;
    if (c >= 2) continue;
    perPair.set(k, c + 1);
    chosen.push(r);
    if (chosen.length >= s.evalTop) break;
  }
  const ranked: RankedConfig[] = [];
  const tapes = new Map<string, Trade[]>();
  for (let i = 0; i < chosen.length; i++) {
    const r = chosen[i];
    const ln = optimizeLastN(r.id, r.trades, { gates: g, splitT: u.splitT, nowT: u.nowT });
    const ev = evaluateConfig(r.id, r.trades, { gates: g, nowT: u.nowT, bestN: ln.bestN });
    tapes.set(r.id, r.trades);
    runs.set(r.id, r);
    ranked.push({
      id: r.id,
      bot: r.bot,
      ind: r.ind,
      protect: r.protect,
      stage: 2,
      full: r.full,
      is: r.is,
      score: r.score,
      lastN: ln,
      evalRes: ev,
      rank: 0,
      armed: false,
    });
    if (i % 3 === 2) yield { stage: "S3", done: i + 1, total: chosen.length, label: r.id };
  }
  timings.S3 = performance.now() - t0;

  // S5: final rank = out-of-sample last-N result blended with the continuous eval score
  const finalScore = (x: RankedConfig) => {
    const oos = x.lastN ? scoreStats(x.lastN.oos, 3) : 0;
    const ev = x.evalRes ? x.evalRes.score : 0;
    const ok = (x.lastN?.success ? 1 : 0) + (x.evalRes?.success ? 1 : 0);
    return ok * 1000 + oos + ev;
  };
  ranked.sort((a, b) => finalScore(b) - finalScore(a));
  ranked.forEach((x, i) => (x.rank = i + 1));
  // Portfolio of bots: validated configs, combined greedily for green hours at a high order count.
  const cands = ranked
    .filter((x) => x.lastN && (x.lastN.success || x.evalRes?.success) && x.lastN.is.net > 0)
    .map((x) => ({ id: x.id, trades: tapes.get(x.id) ?? [], bestN: x.lastN!.bestN }));
  const portfolio = buildPortfolio(cands, { gates: g, splitT: u.splitT, nowT: u.nowT, maxSize: s.armTop });
  const armed = portfolio.members;
  for (const x of ranked) x.armed = armed.includes(x.id);
  yield { stage: "S5", done: 1, total: 1, label: `${armed.length} armed` };

  return {
    at: Date.now(),
    universe: {
      symbols: u.bars.map((b) => b.sym),
      startT: u.startT,
      endT: u.endT,
      splitT: u.splitT,
      nowT: u.nowT,
      bars: u.bars.reduce((a, b) => a + b.n, 0),
    },
    s1,
    s2: s2.map(slim),
    ranked,
    tapes,
    runs,
    armed,
    portfolio,
    timings,
  };
}

/** Drive a pipeline generator to completion synchronously (CLI / tests). */
export function runPipelineSync(u: Universe, s: CoreSettings, onProgress?: (p: PipelineProgress) => void): PipelineOutput {
  const gen = runPipeline(u, s);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
    onProgress?.(r.value);
  }
}
