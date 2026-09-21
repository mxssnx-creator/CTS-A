import type { LastNPassMode, LastNProgressConfig } from "./types";

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

export type LastNWindowHit = { n: number; pf: number; avg: number; net: number; samples: number; ok: boolean };

export const DEFAULT_LAST_N_PROGRESS: LastNProgressConfig = {
  evalNs: [...EVAL_POS_NS],
  validNs: [...VALID_EXEC_NS],
  disableNs: [...LIVE_DISABLE_NS],
  mode: "parallel",
  parallelStack: true,
  parallelVolRatio: 1.25,
};

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
  const mode: LastNPassMode = raw.mode === "independent" || raw.mode === "combined" || raw.mode === "parallel" ? raw.mode : d.mode;
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

export function lastNPrefix(rows: { pnl: number }[], maxN: number): LastNPrefix {
  const cap = Math.min(rows.length, Math.max(0, Math.round(maxN) || 0));
  const gp = new Array(cap + 1).fill(0);
  const gl = new Array(cap + 1).fill(0);
  const net = new Array(cap + 1).fill(0);
  for (let i = 0; i < cap; i++) {
    const p = Number(rows[i]!.pnl) || 0;
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
    ok: full && pf >= 1 && avg >= 0,
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

export function evalLastNGood(h: LastNWindowHit, basePf: number): boolean {
  return h.pf + 1e-9 >= basePf && h.avg >= 0;
}

export function validLastNGood(h: LastNWindowHit, minPf: number): boolean {
  return h.pf + 1e-9 >= minPf && h.avg >= 0;
}

export function disableLastNBad(h: LastNWindowHit): boolean {
  return h.avg < -1e-12;
}

export type LastNDecision = {
  pass: boolean;
  independent: boolean;
  combined: boolean;
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
  const disableFull = disableHits.filter((h) => h.samples >= h.n);
  const evalGood = (h: LastNWindowHit) => evalLastNGood(h, basePf);
  const validGood = (h: LastNWindowHit) => validLastNGood(h, minPf);

  const indValid = lastNIndependentOk(validFull, validGood);
  const indDisableKill = disableFull.length > 0 && disableFull.every(disableLastNBad);
  const independent = indValid && !indDisableKill;

  const combEval = lastNCombinedOk(evalFull, evalGood);
  const combValid = lastNCombinedOk(validFull, validGood);
  const combDisableKill = disableFull.length > 0 && disableFull.filter(disableLastNBad).length * 2 > disableFull.length;
  const combined = combEval && combValid && !combDisableKill;

  let pass = combined;
  if (cfg.mode === "independent") pass = independent;
  else if (cfg.mode === "parallel") pass = independent || combined;

  const both = independent && combined;
  const stack = cfg.mode === "parallel" && cfg.parallelStack !== false && both ? cfg.parallelVolRatio : 1;
  return { pass, independent, combined, stack, evalHits, validHits, disableHits };
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

/** Score one type / combo with coordinated (slim) last-N — not the full settings grid. */
export function scoreLastNGroup(
  rows: { pnl: number }[],
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): LastNGroupScore {
  if (rows.length < 4) {
    let net = 0;
    for (const r of rows) net += Number(r.pnl) || 0;
    return { n: rows.length, pf: 0, net, ok: true, stack: 1 };
  }
  const d = decideLastN(rows, cfg, minPf, basePf);
  let hit = d.validHits.find((h) => h.samples > 0);
  if (!hit) hit = d.evalHits.find((h) => h.samples > 0);
  return {
    n: hit?.samples ?? rows.length,
    pf: hit?.pf ?? 0,
    net: hit?.net ?? 0,
    ok: d.pass,
    stack: d.pass ? d.stack : 1,
  };
}

export function hitsToProgressRows(
  hits: LastNWindowHit[],
  minPf: number,
  grid: readonly number[],
  kind: "pf" | "avg" = "pf",
): Record<string, { n: number; pf: number; net: number; ok: boolean }> {
  const out: Record<string, { n: number; pf: number; net: number; ok: boolean }> = {};
  for (const h of hits) {
    out[String(h.n)] = {
      n: h.samples,
      pf: h.pf,
      net: h.net,
      ok: kind === "avg" ? h.avg >= 0 : h.pf + 1e-9 >= minPf && h.avg >= 0,
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
