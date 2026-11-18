import type { Side, TacticConfig, TacticKind, TrailingDistance } from "./types.ts";

export const STOP_DISTANCE_PCTS = Array.from({ length: 21 }, (_, i) => (i + 2) / 10);
export const TRAIL_DISTANCE_PCTS = Array.from({ length: 25 }, (_, i) => (i + 2) / 10);

export type PriceDistanceGridConfig = { enabled: boolean; stopPcts: number[]; trailPcts: number[] };
export const DEFAULT_PRICE_DISTANCE_GRID: PriceDistanceGridConfig = {
  enabled: false, stopPcts: STOP_DISTANCE_PCTS, trailPcts: TRAIL_DISTANCE_PCTS,
};

function exactSteps(value: unknown, allowed: readonly number[], label: string): number[] {
  const rows = value === undefined ? allowed : value;
  if (!Array.isArray(rows) || rows.length === 0 || new Set(rows).size !== rows.length ||
      rows.some(row => typeof row !== "number" || !allowed.includes(row))) {
    throw new RangeError(`Choose unique 0.1 percentage-point steps for ${label}.`);
  }
  return [...rows];
}

export function sanitizePriceDistanceGrid(value: unknown): PriceDistanceGridConfig {
  if (value === undefined) return { enabled: false, stopPcts: [...STOP_DISTANCE_PCTS], trailPcts: [...TRAIL_DISTANCE_PCTS] };
  if (!value || typeof value !== "object") throw new TypeError("Price-distance grid must be an object.");
  const raw = value as Partial<PriceDistanceGridConfig>;
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") throw new TypeError("Price-distance grid enabled must be boolean.");
  return { enabled: raw.enabled === true, stopPcts: exactSteps(raw.stopPcts, STOP_DISTANCE_PCTS, "stop distances"),
    trailPcts: exactSteps(raw.trailPcts, TRAIL_DISTANCE_PCTS, "trailing distances") };
}

export type PriceDistanceVariant = {
  priceStopPct: number; priceTrailPct?: number; trailingDistance?: TrailingDistance;
  tpAtr?: number; slOfTp?: number; microRange?: boolean; minimalRange?: boolean; shortRange?: boolean;
};

export function priceDistanceVariants(cfg: TacticConfig, tactic: TacticKind): PriceDistanceVariant[] {
  const grid = sanitizePriceDistanceGrid(cfg.priceDistanceGrid);
  if (!grid.enabled) return [];
  const base = { tpAtr: cfg.tpAtr, slOfTp: cfg.slOfTp, microRange: cfg.microRange === true,
    minimalRange: cfg.minimalRange === true, shortRange: cfg.shortRange === true };
  if (tactic !== "trailing" && tactic !== "hybrid") return grid.stopPcts.map(priceStopPct => ({ ...base, priceStopPct }));
  return grid.stopPcts.flatMap(priceStopPct => grid.trailPcts.flatMap(priceTrailPct => [
    { ...base, priceStopPct, priceTrailPct },
    { ...base, priceStopPct, priceTrailPct, trailingDistance: "fixed" as const },
  ]));
}

export function absoluteProtection(side: Side, entry: number, stopPct: number, targetDistance: number) {
  if (!(entry > 0) || !(targetDistance > 0) || !STOP_DISTANCE_PCTS.includes(stopPct)) throw new RangeError("Invalid absolute protection geometry.");
  const slDist = entry * stopPct / 100, sign = side === "long" ? 1 : -1;
  return { sl: entry - sign * slDist, slDist, tp: entry + sign * targetDistance, tpDist: targetDistance };
}

export function priceTrailStop(side: Side, entry: number, peak: number, currentStop: number,
  trailPct: number, mode: "fixed" | "dynamic") {
  if (!(entry > 0) || !(peak > 0) || !(currentStop > 0) || !TRAIL_DISTANCE_PCTS.includes(trailPct)) {
    throw new RangeError("Invalid absolute trailing geometry.");
  }
  const sign = side === "long" ? 1 : -1;
  if (sign * (peak - entry) <= 0) return currentStop;
  const candidate = peak - sign * (mode === "fixed" ? entry : peak) * trailPct / 100;
  return side === "long" ? Math.max(currentStop, candidate) : Math.min(currentStop, candidate);
}
