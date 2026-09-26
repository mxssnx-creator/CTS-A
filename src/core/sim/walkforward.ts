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
import type { BlockConfig, BotType, ProtectGridSpec, DcaConfig, Gates, OpenPosition, Protect, Stats, StratKind, StrategyToggles, Trade } from "../domain/types.ts";
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
  rank: "score" | "lcb" | "net";
  /**
   * Selection mode.
   *  hourly  — re-rank every step on the long + pre-historic windows
   *  durable — keep durable winners: a config must be positive in >= durableFrac of `durableSplits`
   *            sub-windows of the long window (PF >= min overall); once held it stays until its long-window
   *            PF drops below neutral 1.0 (sticky, low churn)
   */
  mode: "hourly" | "durable";
  durableSplits: number;
  durableFrac: number;
  /** require the pre-historic window to still work (PF >= neutral) */
  preGate: boolean;
  /** restrict Main to these bot types (empty = all) */
  bots: readonly BotType[];
  /** max open positions per side (long / short) across the book: limits correlated stop-outs */
  maxPerSide: number;
  toggles: StrategyToggles;
  block: BlockConfig;
  dca: DcaConfig;
  gates: Gates;
  cost: number;
  protects: readonly Protect[];
  dcaProtects: readonly Protect[];
}

export const DEFAULT_GRID: ProtectGridSpec = {
  tp: [0.026, 0.035, 0.05, 0.07],
  slOfTp: [1, 1.5, 2, 2.5],
  trailOfTp: [0, 0.5],
  minTrail: 0.006,
  minSl: 0.01,
  holdH: [8, 24],
};

/** Every protect variant of a grid (hold converted to bars). Each variant is computed independently. */
export function protectGrid(tfMin: number, g: ProtectGridSpec = DEFAULT_GRID): Protect[] {
  const out: Protect[] = [];
  const seen = new Set<string>();
  for (const tp of g.tp)
    for (const k of g.slOfTp)
      for (const tr of g.trailOfTp)
        for (const h of g.holdH) {
          const p: Protect = {
            tp,
            sl: +Math.max(g.minSl, tp * k).toFixed(4),
            trail: tr > 0 ? +Math.max(g.minTrail, tp * tr).toFixed(4) : 0,
            hold: Math.max(2, Math.round((h * 60) / tfMin)),
          };
          const key = `${p.tp}|${p.sl}|${p.trail}|${p.hold}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push(p);
          }
        }
  return out;
}

export function dcaProtectGrid(tfMin: number): Protect[] {
  const hold = Math.max(4, Math.round(480 / tfMin));
  return [0.026, 0.035].map((tp) => ({ tp, sl: +(tp * 1.5).toFixed(4), trail: 0, hold }));
}


export function defaultWalkForward(s: CoreSettings): WalkForwardOptions {
  return {
    preH: 20,
    simH: 48,
    stepH: 1,
    portfolio: 12,
    lastN: 12,
    lastNMinPf: PF_NEUTRAL,
    maxPerSymbol: 3,
    maxOpen: 60,
    guardPct: 1,
    longH: 336,
    robustFrac: 0.6,
    rank: "lcb",
    bots: [],
    mode: "durable",
    durableSplits: 4,
    durableFrac: 0.75,
    preGate: true,
    maxPerSide: 16,
    toggles: { ...DEFAULT_TOGGLES, ...(s.toggles ?? {}) },
    block: { ...DEFAULT_BLOCK, ...(s.block ?? {}) },
    dca: { ...DEFAULT_DCA, ...(s.dca ?? {}) },
    gates: s.gates,
    cost: s.cost,
    protects: protectGrid(s.tfMin, s.grid ?? DEFAULT_GRID),
    dcaProtects: dcaProtectGrid(s.tfMin),
  };
}

export interface ConfigTape {
  id: string;
  bot: BotType;
  ind: string;
  protect: Protect;
  kind: StratKind;
  /** number of closed trades; columns below are ordered by exit time */
  n: number;
  syms: readonly string[];
  exitT: Float64Array;
  entryT: Float64Array;
  r: Float64Array;
  entry: Float32Array;
  exit: Float32Array;
  symI: Uint16Array;
  side: Int8Array;
  reason: Uint8Array;
  bars: Uint16Array;
  vol: Float32Array;
  level: Uint8Array;
  /** prefix sums over trades (length n+1): gross profit, gross loss, r, r² */
  gp: Float64Array;
  gl: Float64Array;
  rs: Float64Array;
  r2: Float64Array;
  /** positions still open at the last bar (normal / trailing only) */
  open: OpenPosition[];
  /** signals on the last closed bar (enter at the next open) */
  pending: Array<{ sym: string; side: 1 | -1 }>;
}

const REASONS: Trade["reason"][] = ["tp", "sl", "trail", "time", "disarm"];

export function makeTape(
  id: string,
  bot: BotType,
  ind: string,
  protect: Protect,
  kind: StratKind,
  syms: readonly string[],
  trades: Trade[],
  open: OpenPosition[],
  pending: ConfigTape["pending"],
): ConfigTape {
  trades.sort((a, b) => a.exitT - b.exitT || a.entryT - b.entryT);
  const n = trades.length;
  const symIdx = new Map(syms.map((s, i) => [s, i]));
  // one backing buffer per tape: 9 float64 columns (5 × n, 4 × n+1) then float32, uint16 ×2, int8/uint8 ×3
  const f64 = 3 * n + 4 * (n + 1);
  const buf = new ArrayBuffer(f64 * 8 + n * 4 * 3 + n * 2 * 2 + n * 3);
  let off = 0;
  const F = (len: number) => {
    const a = new Float64Array(buf, off, len);
    off += len * 8;
    return a;
  };
  const exitT = F(n), entryT = F(n), r = F(n), gp = F(n + 1), gl = F(n + 1), rs = F(n + 1), r2 = F(n + 1);
  const entry = new Float32Array(buf, off, n);
  off += n * 4;
  const exit = new Float32Array(buf, off, n);
  off += n * 4;
  const vol = new Float32Array(buf, off, n);
  off += n * 4;
  const symI = new Uint16Array(buf, off, n);
  off += n * 2;
  const bars = new Uint16Array(buf, off, n);
  off += n * 2;
  const side = new Int8Array(buf, off, n);
  off += n;
  const reason = new Uint8Array(buf, off, n);
  off += n;
  const level = new Uint8Array(buf, off, n);
  const tp: ConfigTape = { id, bot, ind, protect, kind, n, syms, exitT, entryT, r, entry, exit, symI, side, reason, bars, vol, level, gp, gl, rs, r2, open, pending };
  for (let i = 0; i < n; i++) {
    const t = trades[i];
    tp.exitT[i] = t.exitT;
    tp.entryT[i] = t.entryT;
    tp.r[i] = t.r;
    tp.entry[i] = t.entry;
    tp.exit[i] = t.exit;
    tp.symI[i] = symIdx.get(t.sym) ?? 0;
    tp.side[i] = t.side;
    tp.reason[i] = Math.max(0, REASONS.indexOf(t.reason));
    tp.bars[i] = Math.min(65535, t.bars);
    tp.vol[i] = t.vol ?? 1;
    tp.level[i] = Math.min(255, t.level ?? 0);
    const r = t.r;
    tp.gp[i + 1] = tp.gp[i] + (r > 0 ? r : 0);
    tp.gl[i + 1] = tp.gl[i] + (r < 0 ? -r : 0);
    tp.rs[i + 1] = tp.rs[i] + r;
    tp.r2[i + 1] = tp.r2[i] + r * r;
  }
  return tp;
}

/** Materialise one trade of a compact tape. */
export function tradeAt(tp: ConfigTape, i: number): Trade {
  return {
    cfg: tp.id,
    sym: tp.syms[tp.symI[i]],
    side: tp.side[i] as 1 | -1,
    entryT: tp.entryT[i],
    exitT: tp.exitT[i],
    entry: tp.entry[i],
    exit: tp.exit[i],
    r: tp.r[i],
    reason: REASONS[tp.reason[i]],
    bars: tp.bars[i],
    mfe: 0,
    mae: 0,
    kind: tp.kind,
    vol: tp.vol[i],
    level: tp.level[i],
  };
}

export function tapeTrades(tp: ConfigTape, from = 0, to = tp.n): Trade[] {
  const out: Trade[] = [];
  for (let i = from; i < to; i++) out.push(tradeAt(tp, i));
  return out;
}

/** O(1) window numbers from prefix sums (net in percent). */
function win(tp: ConfigTape, a: number, b: number) {
  const gp = tp.gp[b] - tp.gp[a];
  const gl = tp.gl[b] - tp.gl[a];
  return { n: b - a, net: (tp.rs[b] - tp.rs[a]) * 100, pf: profitFactor(gp, gl) };
}

/** Longest time under the running peak inside [a, b), counting an open dip up to nowT (hours). */
function winDdt(tp: ConfigTape, a: number, b: number, nowT: number): number {
  if (b <= a) return 0;
  let cum = 0;
  let peak = 0;
  let peakT = tp.entryT[a];
  let dipped = false;
  let ddt = 0;
  for (let i = a; i < b; i++) {
    cum += tp.r[i];
    if (cum < peak) dipped = true;
    else {
      if (dipped && tp.exitT[i] - peakT > ddt) ddt = tp.exitT[i] - peakT;
      dipped = false;
      peak = cum;
      peakT = tp.exitT[i];
    }
  }
  if (dipped && nowT - peakT > ddt) ddt = nowT - peakT;
  return ddt / H;
}

/** Base: causal tapes for every combo × protect × sub-strategy. Generator so callers can time-slice. */
export function* buildTapesGen(
  u: Universe,
  protects: readonly Protect[],
  cost: number,
  dcaOpt?: { protects: readonly Protect[]; dca: DcaConfig },
  /** Main candidates as "bot|ind"; undefined = every combo */
  only?: ReadonlySet<string>,
): Generator<{ done: number; total: number }, ConfigTape[]> {
  const combos = allCombos().filter((c) => !only || only.has(`${c.bot}|${c.ind}`));
  const syms = u.bars.map((b) => b.sym);
  const out: ConfigTape[] = [];
  const per = protects.length + (dcaOpt ? dcaOpt.protects.length * 2 : 0);
  const total = combos.length * per;
  let done = 0;
  for (const c of combos) {
    const sigs: Array<Int8Array | null> = [];
    for (const k of u.caches) {
      sigs.push(comboSignal(c.bot, c.ind, k));
      // signal series for one symbol can be heavy on first use; let the caller yield per symbol
      yield { done, total };
    }
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
      out.push(makeTape(id, c.bot, c.ind, p, kind, syms, trades, open, pending));
      done++;
      yield { done, total };
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
          out.push(makeTape(id, c.bot, c.ind, p, kind, syms, trades, [], pending));
          done++;
          yield { done, total };
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
  only?: ReadonlySet<string>,
): ConfigTape[] {
  const gen = buildTapesGen(u, protects, cost, dcaOpt, only);
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
    sum += tp.r[end - n];
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
  window: { n: number; net: number; pf: number; ddt: number };
}

/** Lower confidence bound (≈ 1σ) of the summed return over [a, b): mean·n − sd·√n, in percent. */
function lcbFast(tp: ConfigTape, a: number, b: number): number {
  const n = b - a;
  if (n < 2) return 0;
  const s = tp.rs[b] - tp.rs[a];
  const s2 = tp.r2[b] - tp.r2[a];
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
  const botOk = o.bots.length ? new Set<string>(o.bots) : null;
  for (const tp of tapes) {
    if (botOk && !botOk.has(tp.bot)) continue;
    const a = lowerBound(tp.exitT, fromLong);
    const b = lowerBound(tp.exitT, t);
    if (b - a < minLong) continue;
    const pair = `${tp.bot}|${tp.ind}`;
    pairTotal.set(pair, (pairTotal.get(pair) ?? 0) + 1);
    const w = win(tp, a, b);
    if (w.net <= 0 || w.pf < o.gates.minPf) continue;
    const ddt = winDdt(tp, a, b, t);
    if (ddt > ddtMax) continue;
    pairOk.set(pair, (pairOk.get(pair) ?? 0) + 1);
    if (!kindExecutable(tp.kind, o.toggles)) continue;
    const pa = lowerBound(tp.exitT, fromPre);
    const pre = win(tp, pa, b);
    if (o.preGate && pre.n >= 3 && (pre.pf < PF_NEUTRAL || pre.net < 0)) continue;
    const score = o.rank === "lcb" ? lcbFast(tp, a, b) : o.rank === "net" ? w.net : scoreStats(statsOf(tapeTrades(tp, a, b), t), minLong);
    if (!(score > 0)) continue;
    cand.push({ id: tp.id, score, window: { ...w, ddt }, pair });
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

/** Durable winners at t: consistent across sub-windows of the long window. */
export function selectDurable(tapes: readonly ConfigTape[], t: number, o: WalkForwardOptions, held: ReadonlySet<string>): { picks: Selection[]; eligible: number } {
  const longH = Math.max(o.longH, o.preH);
  const from = t - longH * H;
  const minLong = Math.max(8, o.gates.minTrades);
  const k = Math.max(2, o.durableSplits);
  const span = (longH * H) / k;
  const botOk = o.bots.length ? new Set<string>(o.bots) : null;
  const keep: Array<Selection & { pair: string }> = [];
  const cand: Array<Selection & { pair: string }> = [];
  for (const tp of tapes) {
    if (botOk && !botOk.has(tp.bot)) continue;
    if (!kindExecutable(tp.kind, o.toggles)) continue;
    const a = lowerBound(tp.exitT, from);
    const b = lowerBound(tp.exitT, t);
    const w = win(tp, a, b);
    const pair = `${tp.bot}|${tp.ind}`;
    if (held.has(tp.id)) {
      // sticky: stay while the long window still pays (PF >= neutral)
      if (w.n >= 3 && w.pf >= PF_NEUTRAL && w.net > 0) keep.push({ id: tp.id, score: w.net, window: { ...w, ddt: 0 }, pair });
      continue;
    }
    if (w.n < minLong || w.net <= 0 || w.pf < o.gates.minPf) continue;
    let pos = 0;
    for (let i = 0; i < k; i++) {
      const sa = lowerBound(tp.exitT, from + i * span);
      const sb = lowerBound(tp.exitT, from + (i + 1) * span);
      if (sb > sa && tp.rs[sb] - tp.rs[sa] > 0) pos++;
    }
    if (pos / k < o.durableFrac) continue;
    if (o.preGate) {
      const pre = win(tp, lowerBound(tp.exitT, t - o.preH * H), b);
      if (pre.n >= 3 && (pre.pf < PF_NEUTRAL || pre.net < 0)) continue;
    }
    cand.push({ id: tp.id, score: lcbFast(tp, a, b), window: { ...w, ddt: 0 }, pair });
  }
  const pairs = new Set<string>();
  const picks: Selection[] = [];
  for (const s of keep.sort((x, y) => y.score - x.score)) {
    if (pairs.has(s.pair) || picks.length >= o.portfolio) continue;
    pairs.add(s.pair);
    picks.push(s);
  }
  for (const s of cand.sort((x, y) => y.score - x.score)) {
    if (picks.length >= o.portfolio) break;
    if (pairs.has(s.pair)) continue;
    pairs.add(s.pair);
    picks.push(s);
  }
  return { picks, eligible: keep.length + cand.length };
}

function lastNOk(tp: ConfigTape, entryT: number, n: number, minPf: number): boolean {
  if (n <= 0) return true;
  const b = lowerBound(tp.exitT, entryT + 1); // closed at or before entry
  if (b < n) return false;
  return profitFactor(tp.gp[b] - tp.gp[b - n], tp.gl[b] - tp.gl[b - n]) >= minPf;
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

/** Synchronous wrapper (CLI / tests). The runtime drives walkForwardGen so it can yield between hours. */
export function walkForward(u: Universe, tapes: readonly ConfigTape[], o: WalkForwardOptions): WalkForwardResult {
  const gen = walkForwardGen(u, tapes, o);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}

export function* walkForwardGen(u: Universe, tapes: readonly ConfigTape[], o: WalkForwardOptions): Generator<number, WalkForwardResult> {
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

  let held = new Set<string>();
  // re-evaluating more often than one bar cannot change anything: the step is at least one bar
  const barH = (u.bars[0]?.tfMin ?? 60) / 60;
  const stepH = Math.max(o.stepH, barH);
  for (let t = startT; t < stopT; t += stepH * H) {
    const { picks, eligible } = o.mode === "durable" ? selectDurable(tapes, t, o, held) : selectAt(tapes, t, o);
    held = new Set(picks.map((p) => p.id));
    const cands: Array<{ tr: Trade; tp: ConfigTape }> = [];
    for (const p of picks) {
      const tp = byId.get(p.id)!;
      for (let i = 0; i < tp.n; i++) {
        const e = tp.entryT[i];
        if (e >= t && e < t + stepH * H && e < stopT) cands.push({ tr: tradeAt(tp, i), tp });
      }
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
      else if (open.reduce((a, x) => a + (x.side === tr.side ? 1 : 0), 0) >= o.maxPerSide) why = "perSide";
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
    yield t;
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
