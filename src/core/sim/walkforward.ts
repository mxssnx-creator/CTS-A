// Walk-forward trade simulation ("simulated trade runs") — the Base → Main → Real → Live coordination.
//
//   Base  every indication × bot type × protect × sub-strategy (normal, trailing, DCA, DCA Active) has a
//         causal tape, always computed (intern), independent of execution toggles.
//   Main  at each step t, configs whose LONG window (closed before t) passes min PF / DDT and whose
//         bot × indication pair is parameter-robust.
//   Real  Main configs that are still working in the PRE-HISTORIC window (default 20h) and are allowed by
//         the toggles; ranked, one per pair, top `portfolio`. Their entries are executed on paper:
//           - last-N check (last N closes before the entry must hold PF >= neutral)
//           - Block: last-N windows 1..maxLevel checked independently; level = passing windows;
//             volume = 1 + ratio·level (capped); Block Active executes only level >= minActiveLevel
//           - Normal off: plain normal entries only execute when Block-adjusted (level >= 1)
//           - max positions per symbol / total, honest hour guard
//   Live  the Real entries due now are handed to the live adapter (gated, off by default).
import { allCombos, configId } from "../pipeline/pipeline.ts";
import type { Universe } from "../pipeline/pipeline.ts";
import { comboSignal } from "../bots/bots.ts";
import { DEFAULT_BLOCK, DEFAULT_DCA, DEFAULT_TOGGLES, PF_NEUTRAL, type CoreSettings } from "../config.ts";
import type { BlockConfig, BotType, DcaConfig, Gates, OpenPosition, Protect, Stats, StratKind, StrategyToggles, Trade } from "../domain/types.ts";
import { hourlyNet, profitFactor, scoreStats, statsOf } from "../metrics/stats.ts";
import { simulate } from "./backtest.ts";
import { simulateDca } from "./dca.ts";

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
  /** long (Main) window in hours */
  longH: number;
  /** share of a pair's variants that must pass the long window */
  robustFrac: number;
  rank: "score" | "lcb";
  toggles: StrategyToggles;
  block: BlockConfig;
  dca: DcaConfig;
  gates: Gates;
  cost: number;
  protects: readonly Protect[];
  dcaProtects: readonly Protect[];
}

/** Normal + trailing protect variants (hold in bars). */
export function protectGrid(tfMin: number): Protect[] {
  const hold = Math.max(4, Math.round(480 / tfMin)); // 8h
  const out: Protect[] = [];
  for (const tp of [0.018, 0.026, 0.035, 0.05])
    for (const k of [1, 1.5])
      for (const trail of [0, 0.4]) out.push({ tp, sl: +(tp * k).toFixed(4), trail: trail ? +(tp * trail).toFixed(4) : 0, hold });
  return out;
}

export function dcaProtectGrid(tfMin: number): Protect[] {
  const hold = Math.max(4, Math.round(480 / tfMin));
  return [0.026, 0.035].map((tp) => ({ tp, sl: +(tp * 1.5).toFixed(4), trail: 0, hold }));
}

export const WF_PROTECTS: readonly Protect[] = protectGrid(15);

export function defaultWalkForward(s: CoreSettings): WalkForwardOptions {
  return {
    preH: 20,
    simH: 48,
    stepH: 1,
    portfolio: 12,
    lastN: 12,
    lastNMinPf: PF_NEUTRAL,
    maxPerSymbol: 2,
    maxOpen: 60,
    guardPct: 1,
    longH: 168,
    robustFrac: 0.6,
    rank: "lcb",
    toggles: { ...DEFAULT_TOGGLES, ...(s.toggles ?? {}) },
    block: { ...DEFAULT_BLOCK, ...(s.block ?? {}) },
    dca: { ...DEFAULT_DCA, ...(s.dca ?? {}) },
    gates: s.gates,
    cost: s.cost,
    protects: protectGrid(s.tfMin),
    dcaProtects: dcaProtectGrid(s.tfMin),
  };
}

export interface ConfigTape {
  id: string;
  bot: BotType;
  ind: string;
  protect: Protect;
  kind: StratKind;
  /** by exit time */
  trades: Trade[];
  exitT: Float64Array;
  /** positions still open at the last bar (normal / trailing only) */
  open: OpenPosition[];
  /** signals on the last closed bar (enter at the next open) */
  pending: Array<{ sym: string; side: 1 | -1 }>;
}

function finish(id: string, bot: BotType, ind: string, protect: Protect, kind: StratKind, trades: Trade[], open: OpenPosition[], pending: ConfigTape["pending"]): ConfigTape {
  trades.sort((a, b) => a.exitT - b.exitT || a.entryT - b.entryT);
  return { id, bot, ind, protect, kind, trades, exitT: Float64Array.from(trades, (t) => t.exitT), open, pending };
}

/** Base: causal tapes for every combo × protect × sub-strategy. Generator so callers can time-slice. */
export function* buildTapesGen(
  u: Universe,
  protects: readonly Protect[],
  cost: number,
  dcaOpt?: { protects: readonly Protect[]; dca: DcaConfig },
): Generator<{ done: number; total: number }, ConfigTape[]> {
  const combos = allCombos();
  const out: ConfigTape[] = [];
  const per = protects.length + (dcaOpt ? dcaOpt.protects.length * 2 : 0);
  const total = combos.length * per;
  let done = 0;
  for (const c of combos) {
    const sigs = u.caches.map((k) => comboSignal(c.bot, c.ind, k));
    if (sigs.some((x) => x === null)) {
      done += per;
      continue;
    }
    for (const p of protects) {
      const kind: StratKind = p.trail > 0 ? "trailing" : "normal";
      const id = configId(c.bot, c.ind, p);
      const trades: Trade[] = [];
      const open: OpenPosition[] = [];
      const pending: ConfigTape["pending"] = [];
      for (let s = 0; s < u.bars.length; s++) {
        const res = simulate(id, u.bars[s], sigs[s]!, p, { cost });
        for (const tr of res.trades) {
          tr.kind = kind;
          trades.push(tr);
        }
        if (res.open) open.push(res.open);
        if (res.pending) pending.push({ sym: u.bars[s].sym, side: res.pending });
      }
      out.push(finish(id, c.bot, c.ind, p, kind, trades, open, pending));
      done++;
      if (done % 8 === 0) yield { done, total };
    }
    if (dcaOpt) {
      for (const p of dcaOpt.protects) {
        for (const active of [false, true]) {
          const kind: StratKind = active ? "dca-active" : "dca";
          const id = configId(c.bot, c.ind, p, kind);
          const trades: Trade[] = [];
          const pending: ConfigTape["pending"] = [];
          for (let s = 0; s < u.bars.length; s++) {
            const res = simulateDca(id, u.bars[s], sigs[s]!, p, dcaOpt.dca, active, cost);
            for (const tr of res.trades) trades.push(tr);
            if (res.pending) pending.push({ sym: u.bars[s].sym, side: res.pending });
          }
          out.push(finish(id, c.bot, c.ind, p, kind, trades, [], pending));
          done++;
          if (done % 8 === 0) yield { done, total };
        }
      }
    }
  }
  return out;
}

export function buildTapes(
  u: Universe,
  protects: readonly Protect[],
  cost: number,
  dcaOpt?: { protects: readonly Protect[]; dca: DcaConfig },
): ConfigTape[] {
  const gen = buildTapesGen(u, protects, cost, dcaOpt);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
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

/** Whether a sub-strategy may execute at all under the toggles (Block may still veto per trade). */
export function kindExecutable(kind: StratKind, tg: StrategyToggles): boolean {
  switch (kind) {
    case "normal":
      return tg.normal || tg.block; // Normal off still executes Block-adjusted entries
    case "trailing":
      return tg.trailing;
    case "dca":
      return tg.dca && !tg.dcaActive;
    case "dca-active":
      return tg.dca && tg.dcaActive;
  }
}

/** Block level from the config's own closes before `entryT`: independent last-n windows, n = 1..maxLevel. */
export function blockLevel(tp: ConfigTape, entryT: number, b: BlockConfig): number {
  const end = lowerBound(tp.exitT, entryT + 1);
  let level = 0;
  let sum = 0;
  for (let n = 1; n <= b.maxLevel && n <= end; n++) {
    sum += tp.trades[end - n].r;
    if (sum > 0) level++;
  }
  return level;
}

export interface StepLog {
  t: number;
  main: number;
  real: string[];
  taken: number;
  skipped: number;
  net: number;
}

export interface WalkForwardResult {
  startT: number;
  endT: number;
  opts: Omit<WalkForwardOptions, "protects" | "dcaProtects">;
  trades: Trade[];
  stats: Stats;
  hourly: Array<{ t: number; net: number; n: number; pf: number }>;
  /** PF per consecutive 8h block: stability view */
  blocks: Array<{ t: number; n: number; pf: number; net: number }>;
  steps: StepLog[];
  byConfig: Array<{ id: string; n: number; net: number; pf: number }>;
  byKind: Record<string, { n: number; net: number; pf: number }>;
  skips: Record<string, number>;
  stable: boolean;
}

export interface Selection {
  id: string;
  score: number;
  window: Stats;
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

/**
 * Main + Real selection at time t (only trades closed before t count).
 * Main: long window passes PF/DDT (DDT limit scales per 72h) and the pair is parameter-robust.
 * Real: still working over the pre-historic window (PF >= neutral, net >= 0; < 3 closes = quiet, allowed)
 *       and executable under the toggles. Best variant per pair, top `portfolio` by rank.
 */
export function selectAt(tapes: readonly ConfigTape[], t: number, o: WalkForwardOptions): { picks: Selection[]; eligible: number } {
  const longH = Math.max(o.longH, o.preH);
  const fromLong = t - longH * H;
  const fromPre = t - o.preH * H;
  const minLong = Math.max(8, o.gates.minTrades);
  const ddtMax = (o.gates.maxDdtH * longH) / 72;
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
    if (w.net <= 0 || w.pf < o.gates.minPf || w.ddt > ddtMax) continue;
    pairOk.set(pair, (pairOk.get(pair) ?? 0) + 1);
    if (!kindExecutable(tp.kind, o.toggles)) continue;
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

export type ExecDecision = { ok: true; level: number; vol: number } | { ok: false; why: string };

/** Real-stage execution rules for one candidate entry (toggles, last-N, Block / Block Active). */
export function execDecision(tp: ConfigTape, entryT: number, o: WalkForwardOptions): ExecDecision {
  const tg = o.toggles;
  if (!kindExecutable(tp.kind, tg)) return { ok: false, why: "toggle" };
  if (!lastNOk(tp, entryT, o.lastN, o.lastNMinPf)) return { ok: false, why: "lastN" };
  const level = tg.block ? blockLevel(tp, entryT, o.block) : 0;
  if (tg.block && tg.blockActive && level < o.block.minActiveLevel) return { ok: false, why: "blockActive" };
  if (tp.kind === "normal" && !tg.normal && level < 1) return { ok: false, why: "normalOff" };
  const vol = tg.block ? Math.min(o.block.maxMult, 1 + o.block.ratio * level) : 1;
  return { ok: true, level, vol };
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
  const skips: Record<string, number> = {};
  const skip = (why: string) => (skips[why] = (skips[why] ?? 0) + 1);
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
      let why = "";
      if (o.guardPct > 0 && (hourNet.get(hourKey) ?? 0) <= -o.guardPct) why = "hourGuard";
      else if (open.some((x) => x.sym === tr.sym && x.cfg === tr.cfg)) why = "dupe";
      else if (open.reduce((a, x) => a + (x.sym === tr.sym ? 1 : 0), 0) >= o.maxPerSymbol) why = "perSymbol";
      else if (open.length >= o.maxOpen) why = "maxOpen";
      const dec = why ? null : execDecision(tp, tr.entryT, o);
      if (dec && !dec.ok) why = dec.why;
      if (why || !dec || !dec.ok) {
        skipped++;
        skip(why);
        continue;
      }
      const x: Trade = { ...tr, r: tr.r * dec.vol, vol: (tr.vol ?? 1) * dec.vol, level: tp.kind.startsWith("dca") ? tr.level : dec.level };
      trades.push(x);
      taken++;
      net += x.r * 100;
      let j = open.length;
      open.push(x);
      while (j > 0 && open[j - 1].exitT > x.exitT) {
        open[j] = open[j - 1];
        j--;
      }
      open[j] = x;
    }
    steps.push({ t, main: eligible, real: picks.map((p) => p.id), taken, skipped, net });
  }

  trades.sort((a, b) => a.exitT - b.exitT);
  const stats = statsOf(trades, stopT);
  const hn = hourlyNet(trades);
  const perHour = new Map<number, { gp: number; gl: number }>();
  for (const x of trades) {
    const k = Math.floor(x.exitT / H) * H;
    const e = perHour.get(k) ?? { gp: 0, gl: 0 };
    if (x.r > 0) e.gp += x.r;
    else e.gl -= x.r;
    perHour.set(k, e);
  }
  const hourly = [...hn.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, e]) => ({ t, net: e.net, n: e.n, pf: profitFactor(perHour.get(t)?.gp ?? 0, perHour.get(t)?.gl ?? 0) }));
  const blockH = 8;
  const blocks: WalkForwardResult["blocks"] = [];
  for (let b = startT; b < stopT; b += blockH * H) {
    const s = statsOf(trades.filter((x) => x.exitT >= b && x.exitT < b + blockH * H));
    blocks.push({ t: b, n: s.n, pf: s.pf, net: s.net });
  }
  const group = (key: (t: Trade) => string) => {
    const m = new Map<string, Trade[]>();
    for (const tr of trades) {
      const k = key(tr);
      (m.get(k) ?? m.set(k, []).get(k)!).push(tr);
    }
    return m;
  };
  const byConfig = [...group((t) => t.cfg).entries()]
    .map(([id, xs]) => {
      const s = statsOf(xs);
      return { id, n: s.n, net: s.net, pf: s.pf };
    })
    .sort((a, b) => b.net - a.net);
  const byKind: WalkForwardResult["byKind"] = {};
  for (const [k, xs] of group((t) => t.kind ?? "normal")) {
    const s = statsOf(xs);
    byKind[k] = { n: s.n, net: s.net, pf: s.pf };
  }
  const activeBlocks = blocks.filter((b) => b.n >= 3);
  const stable = stats.pf >= o.gates.minPf && stats.net > 0 && activeBlocks.every((b) => b.pf >= PF_NEUTRAL * 0.9);
  const { protects: _p, dcaProtects: _d, ...rest } = o;
  return { startT, endT: stopT, opts: rest, trades, stats, hourly, blocks, steps, byConfig, byKind, skips, stable };
}
