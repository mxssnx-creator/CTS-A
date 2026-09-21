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
  const src = Array.isArray(raw) ? raw.map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n > 0) : [];
  const mapped = [...new Set(src.map((n) => (grid.includes(n) ? n : snapTo(grid, n))))].filter((n) => grid.includes(n)).sort((a, b) => a - b);
  return mapped.length ? mapped : [...fallback];
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

export function lastNWindows(rows: { pnl: number }[], ns: readonly number[]): LastNWindowHit[] {
  const out: LastNWindowHit[] = [];
  for (const n of ns) {
    const need = Math.max(1, Math.round(n));
    if (!rows.length) continue;
    const slice = rows.slice(0, Math.min(need, rows.length));
    let gp = 0;
    let gl = 0;
    let net = 0;
    for (const r of slice) {
      const p = Number(r.pnl) || 0;
      net += p;
      if (p > 0) gp += p;
      else if (p < 0) gl -= p;
    }
    const pf = gl < 1e-12 ? (gp > 1e-12 ? 4 : 0) : gp / gl;
    const avg = slice.length ? net / slice.length : 0;
    const full = slice.length >= need;
    out.push({
      n: need,
      pf: Number.isFinite(pf) ? pf : 0,
      avg,
      net,
      samples: slice.length,
      ok: full && pf >= 1 && avg >= 0,
    });
  }
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

export type LastNDecision = {
  pass: boolean;
  independent: boolean;
  combined: boolean;
  stack: number;
  evalHits: LastNWindowHit[];
  validHits: LastNWindowHit[];
  disableHits: LastNWindowHit[];
};

export function decideLastN(
  rows: { pnl: number }[],
  cfg: LastNProgressConfig,
  minPf: number,
  basePf: number,
): LastNDecision {
  const evalHits = lastNWindows(rows, cfg.evalNs);
  const validHits = lastNWindows(rows, cfg.validNs);
  const disableHits = lastNWindows(rows, cfg.disableNs);
  const evalFull = evalHits.filter((h) => h.samples >= h.n);
  const validFull = validHits.filter((h) => h.samples >= h.n);
  const disableFull = disableHits.filter((h) => h.samples >= h.n);
  const evalGood = (h: LastNWindowHit) => h.pf + 1e-9 >= basePf && h.avg >= 0;
  const validGood = (h: LastNWindowHit) => h.pf + 1e-9 >= minPf && h.avg >= 0;
  const disableBad = (h: LastNWindowHit) => h.avg < -1e-12;

  const indValid = lastNIndependentOk(validFull, validGood);
  const indDisableKill = disableFull.length > 0 && disableFull.every(disableBad);
  const independent = indValid && !indDisableKill;

  const combEval = lastNCombinedOk(evalFull, evalGood);
  const combValid = lastNCombinedOk(validFull, validGood);
  const combDisableKill = disableFull.length > 0 && disableFull.filter(disableBad).length * 2 > disableFull.length;
  const combined = combEval && combValid && !combDisableKill;

  let pass = combined;
  if (cfg.mode === "independent") pass = independent;
  else if (cfg.mode === "parallel") pass = independent || combined;

  const both = independent && combined;
  const stack = cfg.mode === "parallel" && cfg.parallelStack !== false && both ? cfg.parallelVolRatio : 1;
  return { pass, independent, combined, stack, evalHits, validHits, disableHits };
}
