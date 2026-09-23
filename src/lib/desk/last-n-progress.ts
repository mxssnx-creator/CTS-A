import type { LastNCompleteScore, LastNOverallScore, LastNPassMode, LastNProgressConfig } from "./types";

function seq(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to + 1e-9; n += step) out.push(Math.round(n));
  return out;
}

/** Base eval last-N: 15–80 step 5. */
export const EVAL_POS_NS = seq(15, 80, 5);
/** Valid execute last-N: 8–24 step 4. */
export const VALID_EXEC_NS = seq(8, 24, 4);
/** Disable last-N: 6–20 step 2. */
export const LIVE_DISABLE_NS = seq(6, 20, 2);

export const EVAL_POS_N = 50;
export const VALID_EXEC_POS_N = 15;
export const LIVE_DISABLE_N = 12;

/** PF scores the position return, not the dollar balance. `ratio` is net vs entry (0 = base 1). */
export function edgePnl(row: { pnl?: number; ratio?: number } | null | undefined): number {
  if (!row) return 0;
  const ratio = Number(row.ratio);
  if (Number.isFinite(ratio)) return ratio;
  const pnl = Number(row.pnl);
  return Number.isFinite(pnl) ? pnl : 0;
}

/** Average position multiple. 1 is flat after round-trip cost. Dollar qty and balance are ignored. */
export function positionAverageRatio(rows: { pnl?: number; ratio?: number }[] | null | undefined): number {
  if (!rows?.length) return 1;
  let sum = 0;
  let n = 0;
  for (const row of rows) {
    const edge = edgePnl(row);
    if (!Number.isFinite(edge)) continue;
    sum += edge;
    n += 1;
  }
  return n ? 1 + sum / n : 1;
}

export type LastNWindowHit = { n: number; pf: number; avg: number; net: number; samples: number; ok: boolean };

export const DEFAULT_LAST_N_PROGRESS: LastNProgressConfig = {
  evalNs: [...EVAL_POS_NS],
  validNs: [...VALID_EXEC_NS],
  disableNs: [...LIVE_DISABLE_NS],
  mode: "parallel",
  parallelStack: true,
  parallelVolRatio: 1.25,
};

export const LAST_N_PASS_MODES: LastNPassMode[] = ["independent", "combined", "parallel", "majority"];
export const PRIMARY_PROCESSINGS: LastNPassMode[] = ["independent", "combined", "majority"];
export const MAJORITY_MIN_POSITIVE = 2;

export const LAST_N_PASS_META: { id: LastNPassMode; label: string; blurb: string }[] = [
  { id: "independent", label: "Independent", blurb: "Any valid window PF≥1. More flow." },
  { id: "combined", label: "Combined", blurb: "Majority of eval then valid windows." },
  { id: "parallel", label: "Parallel", blurb: "Independent or Combined. Extra stack when both pass." },
  { id: "majority", label: "Majority 2+", blurb: "Two or more valid windows PF≥1. Confirms Independent, rejects a single lucky N." },
];

function snapTo(grid: readonly number[], n: number): number {
  let best = grid[0] ?? n;
  let dist = Infinity;
  for (const g of grid) {
    const d = Math.abs(g - n);
    if (d < dist) {
      dist = d;
      best = g;
    }
  }
  return best;
}

function sanitizeNs(raw: unknown, grid: readonly number[], fallback: number[]): number[] {
  if (!Array.isArray(raw)) return [...fallback];
  const src = raw.map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n > 0);
  const mapped = [...new Set(src.map((n) => (grid.includes(n) ? n : snapTo(grid, n))))].filter((n) => grid.includes(n)).sort((a, b) => a - b);
  if (mapped.length) return mapped;
  return [fallback[0] ?? grid[0] ?? 8];
}

export function sanitizeLastNProgress(raw: Partial<LastNProgressConfig> | null | undefined): LastNProgressConfig {
  const d = DEFAULT_LAST_N_PROGRESS;
  if (!raw || typeof raw !== "object") {
    return { ...d, evalNs: [...d.evalNs], validNs: [...d.validNs], disableNs: [...d.disableNs] };
  }
  const mode: LastNPassMode =
    raw.mode === "independent" || raw.mode === "combined" || raw.mode === "parallel" || raw.mode === "majority"
      ? raw.mode
      : d.mode;
  return {
    evalNs: sanitizeNs(raw.evalNs, EVAL_POS_NS, d.evalNs),
    validNs: sanitizeNs(raw.validNs, VALID_EXEC_NS, d.validNs),
    disableNs: sanitizeNs(raw.disableNs, LIVE_DISABLE_NS, d.disableNs),
    mode,
    parallelStack: raw.parallelStack !== false,
    parallelVolRatio: Math.min(2, Math.max(1, Number(raw.parallelVolRatio) || d.parallelVolRatio)),
  };
}

export function lastNMaxOf(cfg: LastNProgressConfig): number {
  return Math.max(8, ...cfg.evalNs, ...cfg.validNs, ...cfg.disableNs);
}

/** Prefix sums over newest-first rows. O(min(len, maxN)) then O(1) per window. */
export type LastNPrefix = { n: number; gp: number[]; gl: number[]; net: number[] };

export function lastNPrefix(rows: { pnl?: number; ratio?: number }[], maxN: number): LastNPrefix {
  const cap = Math.min(rows.length, Math.max(0, Math.round(maxN) || 0));
  const gp = new Array(cap + 1).fill(0);
  const gl = new Array(cap + 1).fill(0);
  const net = new Array(cap + 1).fill(0);
  for (let i = 0; i < cap; i++) {
    const p = edgePnl(rows[i]);
    gp[i + 1] = gp[i]! + (p > 0 ? p : 0);
    gl[i + 1] = gl[i]! + (p < 0 ? -p : 0);
    net[i + 1] = net[i]! + p;
  }
  return { n: cap, gp, gl, net };
}

export function lastNHitFromPrefix(pre: LastNPrefix, n: number): LastNWindowHit {
  const need = Math.max(1, Math.round(n));
  const k = Math.min(need, pre.n);
  const gp = pre.gp[k] ?? 0;
  const glv = pre.gl[k] ?? 0;
  const net = pre.net[k] ?? 0;
  const pf = glv < 1e-12 ? (gp > 1e-12 ? 4 : 0) : gp / glv;
  const avg = k ? net / k : 0;
  const full = pre.n >= need;
  return {
    n: need,
    pf: Number.isFinite(pf) ? pf : 0,
    avg,
    net,
    samples: k,
    ok: full && pf + 1e-9 >= GATED_MIN_PF && avg >= 0,
  };
}

export function lastNWindows(rows: { pnl: number }[], ns: readonly number[]): LastNWindowHit[] {
  if (!rows.length || !ns.length) return [];
  const maxN = Math.max(1, ...ns.map((n) => Math.round(n)));
  const pre = lastNPrefix(rows, maxN);
  const out: LastNWindowHit[] = [];
  for (const n of ns) out.push(lastNHitFromPrefix(pre, n));
  return out;
}

export function lastNCombinedOk(hits: LastNWindowHit[], pred: (h: LastNWindowHit) => boolean): boolean {
  if (!hits.length) return true;
  const pass = hits.filter(pred).length;
  return pass * 2 > hits.length;
}

export function lastNIndependentOk(hits: LastNWindowHit[], pred: (h: LastNWindowHit) => boolean): boolean {
  if (!hits.length) return true;
  return hits.some(pred);
}

/** Two or more full windows must pass. Empty intern coverage stays open; a single sampled window cannot confirm. */
export function lastNMajorityOk(hits: LastNWindowHit[], pred: (h: LastNWindowHit) => boolean): boolean {
  if (!hits.length) return true;
  const full = hits.filter((h) => h.samples >= h.n);
  if (full.length < MAJORITY_MIN_POSITIVE) return false;
  return full.filter(pred).length >= MAJORITY_MIN_POSITIVE;
}

export function evalLastNGood(h: LastNWindowHit, basePf: number): boolean {
  return h.pf + 1e-9 >= basePf && h.avg >= 0;
}

/** Live / processing floor. Gated PF below 1 is a failed processing. */
export const GATED_MIN_PF = 1;

export function gatedFloorPf(minPf: number): number {
  const n = Number(minPf);
  return Math.max(GATED_MIN_PF, Number.isFinite(n) && n > 0 ? n : 0);
}

export function validLastNGood(h: LastNWindowHit, minPf: number): boolean {
  return h.pf + 1e-9 >= gatedFloorPf(minPf) && h.avg >= 0;
}

export function disableLastNBad(h: LastNWindowHit): boolean {
  return h.avg < -1e-12;
}

export type LastNDecision = {
  pass: boolean;
  independent: boolean;
  combined: boolean;
  majority: boolean;
  stack: number;
  evalHits: LastNWindowHit[];
  validHits: LastNWindowHit[];
  disableHits: LastNWindowHit[];
};

function hitsOf(pre: LastNPrefix, ns: readonly number[]): LastNWindowHit[] {
  return ns.map((n) => lastNHitFromPrefix(pre, n));
}

export function decideLastNFromPrefix(
  pre: LastNPrefix,
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): LastNDecision {
  const evalHits = hitsOf(pre, cfg.evalNs);
  const validHits = hitsOf(pre, cfg.validNs);
  const disableHits = hitsOf(pre, cfg.disableNs);
  const evalFull = evalHits.filter((h) => h.samples >= h.n);
  const validFull = validHits.filter((h) => h.samples >= h.n);
  const evalGood = (h: LastNWindowHit) => evalLastNGood(h, basePf);
  const validGood = (h: LastNWindowHit) => validLastNGood(h, minPf);

  const indValid = lastNIndependentOk(validFull, validGood);
  const independent = indValid;

  const combEval = lastNCombinedOk(evalFull, evalGood);
  const combValid = lastNCombinedOk(validFull, validGood);
  const combined = combEval && combValid;
  const majority = lastNMajorityOk(validFull, validGood);

  let pass = combined;
  if (cfg.mode === "independent") pass = independent;
  else if (cfg.mode === "parallel") pass = independent || combined;
  else if (cfg.mode === "majority") pass = majority;
  // Disable windows are scored for live-disable / display. They must not override a valid-execute pass.

  const both = independent && combined;
  const stack = cfg.mode === "parallel" && cfg.parallelStack !== false && both ? cfg.parallelVolRatio : 1;
  return { pass, independent, combined, majority, stack, evalHits, validHits, disableHits };
}

export function decideLastN(
  rows: { pnl: number }[],
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): LastNDecision {
  const pre = lastNPrefix(rows, lastNMaxOf(cfg));
  return decideLastNFromPrefix(pre, cfg, minPf, basePf);
}

/** Coordinated active last-N: pick the windows / mode that actually work. Settings grid stays full. */
export type LastNCoordPick = {
  mode: LastNPassMode;
  independent: boolean;
  combined: boolean;
  majority: boolean;
  stack: number;
  evalNs: number[];
  validNs: number[];
  disableNs: number[];
  bestEval: number;
  bestValid: number;
  bestDisable: number;
  evalHits: LastNWindowHit[];
  validHits: LastNWindowHit[];
  disableHits: LastNWindowHit[];
};

function addUnique(out: number[], n: number) {
  if (!out.includes(n)) out.push(n);
}

/** Eval / valid: keep the windows that actually pass (plus a close runner-up). Cap 3. */
function pickActiveNs(
  hits: LastNWindowHit[],
  pred: (h: LastNWindowHit) => boolean,
  primary: number,
  fallback: number[],
): number[] {
  const full = hits.filter((h) => h.samples >= h.n);
  const ok = full.filter(pred);
  const pool = (ok.length ? ok : full).slice();
  if (!pool.length) {
    const fb = fallback.find((n) => n === primary) ?? fallback[0] ?? primary;
    return [fb];
  }
  pool.sort((a, b) => b.pf - a.pf || b.n - a.n);
  const out: number[] = [];
  addUnique(out, pool[0]!.n);
  if (pool[1] && pool[1].pf + 0.2 >= pool[0]!.pf) addUnique(out, pool[1].n);
  if (ok.some((h) => h.n === primary)) addUnique(out, primary);
  else if (!ok.length && full.some((h) => h.n === primary)) addUnique(out, primary);
  return out.sort((a, b) => a - b).slice(0, 3);
}

/**
 * Disable: keep diagnostic windows, not only the green ones.
 * Primary + shortest full (reactive) + longest full (stable). Cap 3.
 */
function pickDisableNs(hits: LastNWindowHit[], primary: number, fallback: number[]): number[] {
  const full = hits.filter((h) => h.samples >= h.n);
  const pool = (full.length ? full : hits.filter((h) => h.samples > 0)).slice();
  const allow = (n: number) => fallback.includes(n) || n === primary;
  const out: number[] = [];
  if (allow(primary)) addUnique(out, primary);
  if (!pool.length) return out.length ? out.sort((a, b) => a - b) : [fallback[0] ?? primary];
  const byN = [...pool].sort((a, b) => a.n - b.n);
  if (allow(byN[0]!.n)) addUnique(out, byN[0]!.n);
  if (allow(byN[byN.length - 1]!.n)) addUnique(out, byN[byN.length - 1]!.n);
  const worst = [...pool].sort((a, b) => a.avg - b.avg || a.pf - b.pf)[0];
  if (worst && worst.avg < 0 && allow(worst.n)) addUnique(out, worst.n);
  const sorted = out.sort((a, b) => a - b);
  return sorted.length ? sorted.slice(0, 3) : [primary];
}

function modeFromDecision(d: LastNDecision, fallback: LastNPassMode): LastNPassMode {
  if (d.independent && d.combined) return "parallel";
  if (d.independent) return "independent";
  if (d.combined) return "combined";
  if (d.majority) return "majority";
  return fallback;
}

export function coordinateLastNFromPrefix(
  pre: LastNPrefix,
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): LastNCoordPick {
  const d = decideLastNFromPrefix(pre, cfg, minPf, basePf);
  const evalNs = pickActiveNs(d.evalHits, (h) => evalLastNGood(h, basePf), EVAL_POS_N, cfg.evalNs);
  const validNs = pickActiveNs(d.validHits, (h) => validLastNGood(h, minPf), VALID_EXEC_POS_N, cfg.validNs);
  const disableNs = pickDisableNs(d.disableHits, LIVE_DISABLE_N, cfg.disableNs);
  const mode = modeFromDecision(d, cfg.mode);
  const both = d.independent && d.combined;
  const stack = mode === "parallel" && cfg.parallelStack !== false && both ? cfg.parallelVolRatio : 1;
  return {
    mode,
    independent: d.independent,
    combined: d.combined,
    majority: d.majority,
    stack,
    evalNs,
    validNs,
    disableNs,
    bestEval: evalNs[evalNs.length - 1] ?? EVAL_POS_N,
    bestValid: validNs[0] ?? VALID_EXEC_POS_N,
    bestDisable: disableNs.find((n) => n === LIVE_DISABLE_N) ?? disableNs[0] ?? LIVE_DISABLE_N,
    evalHits: d.evalHits,
    validHits: d.validHits,
    disableHits: d.disableHits,
  };
}

export function coordinateLastN(
  rows: { pnl: number }[],
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): LastNCoordPick {
  const pre = lastNPrefix(rows, lastNMaxOf(cfg));
  return coordinateLastNFromPrefix(pre, cfg, minPf, basePf);
}

/** Settings grid stays full; live / type evals use this slim cfg. */
export function slimLastNProgress(cfg: LastNProgressConfig, pick: LastNCoordPick): LastNProgressConfig {
  return {
    evalNs: pick.evalNs.length ? pick.evalNs : [EVAL_POS_N],
    validNs: pick.validNs.length ? pick.validNs : [VALID_EXEC_POS_N],
    disableNs: pick.disableNs.length ? pick.disableNs : [LIVE_DISABLE_N],
    mode: pick.mode,
    parallelStack: cfg.parallelStack,
    parallelVolRatio: cfg.parallelVolRatio,
  };
}

export type LastNGroupScore = { n: number; pf: number; net: number; ok: boolean; stack: number };

export function pickLastNScoreHit(
  d: LastNDecision,
  minPf: number,
): LastNWindowHit | undefined {
  const validFull = d.validHits.filter((h) => h.samples >= h.n);
  const evalFull = d.evalHits.filter((h) => h.samples >= h.n);
  const passValid = validFull.filter((h) => validLastNGood(h, minPf)).sort((a, b) => b.n - a.n);
  if (passValid[0]) return passValid[0];
  const passEval = evalFull.filter((h) => evalLastNGood(h, minPf)).sort((a, b) => b.n - a.n);
  if (passEval[0]) return passEval[0];
  const full = [...validFull, ...evalFull].sort((a, b) => b.n - a.n);
  if (full[0]) return full[0];
  return d.validHits.find((h) => h.samples > 0) ?? d.evalHits.find((h) => h.samples > 0);
}

/** Score one type / combo with its own last-N grid — not the book-level slim pick. */
export function scoreLastNGroup(
  rows: { pnl: number }[],
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): LastNGroupScore {
  if (rows.length < 4) {
    let net = 0;
    for (const r of rows) net += edgePnl(r);
    return { n: rows.length, pf: 0, net, ok: true, stack: 1 };
  }
  const d = decideLastN(rows, cfg, minPf, basePf);
  const hit = pickLastNScoreHit(d, minPf);
  const full = Boolean(hit && hit.samples >= hit.n);
  return {
    n: hit?.samples ?? rows.length,
    pf: hit?.pf ?? 0,
    net: hit?.net ?? 0,
    ok: d.pass || (full && (hit!.pf + 1e-9 >= gatedFloorPf(minPf)) && (hit!.net + 1e-12 >= 0) && hit!.samples >= 4),
    stack: d.pass ? d.stack : 1,
  };
}

function agreeWindowPf(hits: LastNWindowHit[]): number {
  if (!hits.length) return 0;
  let best = 0;
  const excess: number[] = [];
  for (const h of hits) {
    if (h.pf > best) best = h.pf;
    excess.push(Math.max(0, h.pf - 1));
  }
  excess.sort((a, b) => b - a);
  const second = excess[1] ?? 0;
  const lift = Math.min(second, (excess[0] ?? 0) * 0.25, 0.35);
  const pf = best + lift;
  return pf > 4 ? 4 : pf;
}

function tapeFold(rows: { pnl?: number; ratio?: number }[]): { n: number; pf: number; net: number } {
  let gp = 0;
  let gl = 0;
  let net = 0;
  for (const r of rows) {
    const p = edgePnl(r);
    net += p;
    if (p > 0) gp += p;
    else if (p < 0) gl += -p;
  }
  const pf = gl < 1e-12 ? (gp > 1e-12 ? 4 : 0) : gp / gl;
  return { n: rows.length, pf: Number.isFinite(pf) ? pf : 0, net };
}

/** Independent / Combined / Parallel processings. Never share one mixed PF. */
export type LastNModeScore = {
  pass: boolean;
  pf: number;
  n: number;
  net: number;
  gatedPf: number;
  gatedN: number;
};

export function scoreLastNModeTape(
  rows: { pnl: number }[],
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
  mode: LastNPassMode,
): LastNModeScore {
  const st = tapeFold(rows);
  const d = decideLastN(rows, { ...cfg, mode }, minPf, basePf);
  const validOk = d.validHits.filter((h) => h.samples >= h.n && validLastNGood(h, minPf));
  const validFull = d.validHits.filter((h) => h.samples >= h.n);
  const best = [...validOk].sort((a, b) => b.pf - a.pf || b.n - a.n)[0];
  const longestOk = [...validOk].sort((a, b) => b.n - a.n || b.pf - a.pf)[0];
  const longest = [...validFull].sort((a, b) => b.n - a.n || b.pf - a.pf)[0];
  const evalOkHits = d.evalHits.filter((h) => h.samples >= h.n && evalLastNGood(h, basePf));
  const bestEval = [...evalOkHits].sort((a, b) => b.pf - a.pf || b.n - a.n)[0];
  // Two or more positive base windows (eval 50 and 30): combined is the stronger window
  // plus the next window's edge, capped at the no-loss PF. Never the diluted longer tape.
  const agreeLift = mode === "combined" && d.pass && evalOkHits.length >= 2 ? agreeWindowPf(evalOkHits) : 0;
  const gated = mode === "combined"
    ? (d.pass && evalOkHits.length >= 2 ? bestEval : (d.pass ? longestOk : longest)) ?? longestOk ?? longest
    : mode === "majority"
      ? (validOk.length >= MAJORITY_MIN_POSITIVE ? longestOk : (best ?? longest)) ?? longest
      : (d.pass ? best : (best ?? longest)) ?? longestOk ?? longest;
  const gatedPf = agreeLift > 0 ? agreeLift : (gated?.pf ?? 0);
  const gatedN = gated?.n ?? 0;
  const net = gated?.net ?? st.net;
  const floor = gatedFloorPf(minPf);
  const tinyNoLoss = gatedPf >= 4 - 1e-9 && net <= 1e-6;
  const majorityOk = mode !== "majority" || validOk.length >= MAJORITY_MIN_POSITIVE;
  const gatedOk =
    gatedN >= VALID_EXEC_NS[0]! &&
    gatedPf + 1e-9 >= floor &&
    net > 1e-9 &&
    !tinyNoLoss;
  return {
    pass: Boolean(d.pass && gatedOk && majorityOk),
    pf: agreeLift > 0 ? agreeLift : (gated?.pf ?? st.pf),
    n: gated?.n ?? st.n,
    net,
    gatedPf,
    gatedN,
  };
}

export function foldOverallProcessing(modes: Record<LastNPassMode, LastNModeScore>): LastNOverallScore {
  const keys = PRIMARY_PROCESSINGS.filter((k) => modes[k]?.pass);
  const positive = keys.length;
  const headline = modes.independent.pass
    ? modes.independent
    : modes.majority.pass
      ? modes.majority
      : modes.combined.pass
        ? modes.combined
        : modes.independent;
  const pass =
    positive >= MAJORITY_MIN_POSITIVE &&
    headline.gatedPf + 1e-9 >= GATED_MIN_PF &&
    headline.gatedN >= VALID_EXEC_NS[0]! &&
    headline.net > 1e-9;
  return {
    pass,
    pf: headline.pf,
    n: headline.n,
    net: headline.net,
    gatedPf: headline.gatedPf,
    gatedN: headline.gatedN,
    positive,
    keys,
  };
}

export type LastNTypeCatalogs = {
  indications?: Record<string, { n: number; pf: number; net: number; ok: boolean }>;
  ranges?: Record<string, { n: number; pf: number; net: number; ok: boolean }>;
  tactics?: Record<string, { n: number; pf: number; net: number; ok: boolean }>;
  playbooks?: Record<string, { n: number; pf: number; net: number; ok: boolean }>;
  indicationKeys?: readonly string[];
  rangeKeys?: readonly string[];
  tacticKeys?: readonly string[];
  playbookKeys?: readonly string[];
};

/** Fill every catalog key. Unsampled stays intern-covered (ok). Sampled gated PF<1 never passes. */
export function coverCatalogRows(
  scored: Record<string, { n: number; pf: number; net: number; ok: boolean }>,
  catalog: readonly string[],
): Record<string, { n: number; pf: number; net: number; ok: boolean }> {
  const out: Record<string, { n: number; pf: number; net: number; ok: boolean }> = { ...scored };
  for (const k of catalog) {
    const r = out[k];
    if (!r) out[k] = { n: 0, pf: 0, net: 0, ok: true };
    else if (r.n >= 4 && r.pf + 1e-9 < GATED_MIN_PF) out[k] = { n: r.n, pf: r.pf, net: r.net, ok: false };
  }
  return out;
}

function catalogCovered(
  rows: Record<string, { n: number; pf: number; net: number; ok: boolean }> | undefined,
  keys: readonly string[] | undefined,
): boolean {
  if (!keys?.length) return true;
  if (!rows) return false;
  for (const k of keys) {
    const r = rows[k];
    if (!r) return false;
    if (r.n === 0 && !r.ok) return false;
    if (r.n >= 4 && r.pf + 1e-9 < GATED_MIN_PF && r.ok) return false;
  }
  return true;
}

export function completeLastNCorrectness(
  evalNs: Record<string, { n: number; pf: number; net: number; ok: boolean }>,
  validNs: Record<string, { n: number; pf: number; net: number; ok: boolean }>,
  disableNs: Record<string, { n: number; pf: number; net: number; ok: boolean }>,
  modes: Record<LastNPassMode, LastNModeScore>,
  overall: LastNOverallScore,
  catalogs?: LastNTypeCatalogs,
): LastNCompleteScore {
  const evalOk = EVAL_POS_NS.every((n) => evalNs[String(n)] != null);
  const validOk = VALID_EXEC_NS.every((n) => validNs[String(n)] != null);
  const disableOk = LIVE_DISABLE_NS.every((n) => disableNs[String(n)] != null);
  const internCovered = [evalNs, validNs, disableNs].every((grid) =>
    Object.values(grid).every((r) => (r.n > 0 ? true : r.ok)),
  );
  const coverage = evalOk && validOk && disableOk && internCovered;
  const gatedFailClosed = LAST_N_PASS_MODES.every((k) => {
    const m = modes[k];
    if (!m) return true;
    if (m.pass && m.gatedPf + 1e-9 < GATED_MIN_PF) return false;
    return true;
  });
  const primaryPositive = PRIMARY_PROCESSINGS.filter((k) => modes[k]?.pass).length;
  const overallAlign = overall.positive === primaryPositive && (overall.pass ? primaryPositive >= MAJORITY_MIN_POSITIVE : true);
  const typesOk = catalogs
    ? catalogCovered(catalogs.indications, catalogs.indicationKeys)
      && catalogCovered(catalogs.ranges, catalogs.rangeKeys)
      && catalogCovered(catalogs.tactics, catalogs.tacticKeys)
      && catalogCovered(catalogs.playbooks, catalogs.playbookKeys)
    : true;
  return {
    pass: coverage && gatedFailClosed && overallAlign && typesOk,
    coverage,
    positive: primaryPositive,
    evalOk,
    validOk,
    disableOk,
    typesOk,
  };
}

export function foldLastNProcessings(
  independentRows: { pnl: number }[],
  combinedRows: { pnl: number }[],
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): { modes: Record<LastNPassMode, LastNModeScore>; overall: LastNOverallScore } {
  const mixed = combinedRows.length ? combinedRows : independentRows;
  // Independent / Majority score isolated combo tapes only. Empty intern stays fail-closed (gated n<8), never inherits the mixed book.
  const independent = scoreLastNModeTape(independentRows, cfg, minPf, basePf, "independent");
  const combined = scoreLastNModeTape(mixed, cfg, minPf, basePf, "combined");
  const majority = scoreLastNModeTape(independentRows, cfg, minPf, basePf, "majority");
  const parallel: LastNModeScore = independent.pass
    ? { ...independent, pass: true }
    : { ...combined, pass: combined.pass };
  const modes = { independent, combined, parallel, majority };
  const overall = foldOverallProcessing(modes);
  return { modes, overall };
}

export function hitsToProgressRows(
  hits: LastNWindowHit[],
  minPf: number,
  grid: readonly number[],
  kind: "pf" | "avg" = "pf",
): Record<string, { n: number; pf: number; net: number; ok: boolean }> {
  const out: Record<string, { n: number; pf: number; net: number; ok: boolean }> = {};
  const floor = gatedFloorPf(minPf);
  for (const h of hits) {
    const sampled = h.samples > 0;
    out[String(h.n)] = {
      n: h.samples,
      pf: h.pf,
      net: h.net,
      ok: !sampled
        ? true
        : kind === "avg"
          ? h.avg >= 0
          : h.pf + 1e-9 >= floor && h.avg >= 0,
    };
  }
  for (const n of grid) {
    if (!out[String(n)]) out[String(n)] = { n: 0, pf: 0, net: 0, ok: true };
  }
  return out;
}

/** Relation key for coordinated type × combination evals. */
export function relComboKey(
  rel: {
    indication?: string;
    tactic?: string;
    rangeType?: string;
    playbook?: string;
    kind?: string;
  },
  fallback?: { tactic?: string; range?: string },
): string {
  return [
    rel.indication || "trend",
    rel.tactic || fallback?.tactic || "trailing",
    rel.rangeType || fallback?.range || "atr",
    rel.playbook || rel.kind || "short",
  ].join(":");
}
