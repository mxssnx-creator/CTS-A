import { STOP_BANDS, DEFAULT_MAX_STOP_RATIO, maxStopRatio, stopSelections, type StopBand, type FixedStopSelections } from "../../../shared/cts-protection/fixed-stop-bands.ts";
export { STOP_BANDS };
import type { Side, TacticConfig, TacticKind, TrailingDistance } from "./types.ts";

export const STOP_DISTANCE_PCTS = Array.from({ length: 21 }, (_, i) => (i + 2) / 10);
export const TRAIL_DISTANCE_PCTS = Array.from({ length: 25 }, (_, i) => (i + 2) / 10);

export type PriceDistanceGridConfig = { enabled: boolean; maxStopLossRatio?: number; fixedSlBands?: FixedStopSelections; stopPcts: number[]; trailPcts: number[] };
export const DEFAULT_PRICE_DISTANCE_GRID: PriceDistanceGridConfig = {
  enabled: true, fixedSlBands: {}, maxStopLossRatio: DEFAULT_MAX_STOP_RATIO, stopPcts: STOP_DISTANCE_PCTS, trailPcts: TRAIL_DISTANCE_PCTS,
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
  if (value === undefined) return { enabled: true, fixedSlBands: stopSelections(), maxStopLossRatio: DEFAULT_MAX_STOP_RATIO, stopPcts: [...STOP_DISTANCE_PCTS], trailPcts: [...TRAIL_DISTANCE_PCTS] };
  if (!value || typeof value !== "object") throw new TypeError("Price-distance grid must be an object.");
  const raw = value as Partial<PriceDistanceGridConfig>;
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") throw new TypeError("Price-distance grid enabled must be boolean.");
  return { enabled: raw.fixedSlBands !== undefined || raw.enabled === true, ...(raw.fixedSlBands !== undefined ? {fixedSlBands:stopSelections(raw.fixedSlBands),maxStopLossRatio:maxStopRatio(raw.maxStopLossRatio)} : {}), stopPcts: exactSteps(raw.stopPcts, STOP_DISTANCE_PCTS, "stop distances"),
    trailPcts: exactSteps(raw.trailPcts, TRAIL_DISTANCE_PCTS, "trailing distances") };
}

export type PriceDistanceVariant = {
  priceStopBand?: StopBand; priceStopPct: number; priceTrailPct?: number; trailingDistance?: TrailingDistance;
  lowRangeOnly?: boolean; maxHoldTicks?: number;
  tpAtr?: number; slOfTp?: number; microRange?: boolean; minimalRange?: boolean; shortRange?: boolean;
};

const VARIANT_CACHE_LIMIT = 8;
const variantCache = new Map<string, PriceDistanceVariant[]>();

export function priceDistanceVariants(cfg: TacticConfig, tactic: TacticKind): PriceDistanceVariant[] {
  const grid = sanitizePriceDistanceGrid(cfg.priceDistanceGrid);
  if (!grid.enabled) return [];
  const base = { tpAtr: cfg.tpAtr, slOfTp: cfg.slOfTp, microRange: cfg.microRange === true,
    minimalRange: cfg.minimalRange === true, shortRange: cfg.shortRange === true };
  const trailing = tactic === "trailing" || tactic === "hybrid";
  const key = JSON.stringify([trailing, base.tpAtr, base.slOfTp, base.microRange, base.minimalRange, base.shortRange,
    grid.fixedSlBands, grid.stopPcts, trailing ? grid.trailPcts : []]);
  const cached = variantCache.get(key);
  if (cached) {
    variantCache.delete(key);
    variantCache.set(key, cached);
    return cached;
  }
  const stops = grid.fixedSlBands ? (["short", "long"] as const).flatMap(priceStopBand =>
    (grid.fixedSlBands![priceStopBand] ?? STOP_BANDS[priceStopBand].stops).map(priceStopPct => ({priceStopBand, priceStopPct}))) :
    grid.stopPcts.map(priceStopPct => ({priceStopPct}));
  const variants = trailing
    ? stops.flatMap(stop => grid.trailPcts.flatMap(priceTrailPct => [
        { ...base, ...stop, priceTrailPct },
        { ...base, ...stop, priceTrailPct, trailingDistance: "fixed" as const },
      ]))
    : stops.map(stop => ({ ...base, ...stop }));
  variantCache.set(key, variants);
  while (variantCache.size > VARIANT_CACHE_LIMIT) variantCache.delete(variantCache.keys().next().value!);
  return variants;
}

export function priceDistanceBatch<T>(variants: readonly T[], tick: number, parentKey: string, batchSize = 16): readonly T[] {
  const size = Math.max(1, Math.floor(batchSize));
  if (variants.length <= size) return variants;
  let seed = 2166136261;
  for (let i = 0; i < parentKey.length; i++) {
    seed ^= parentKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const start = ((seed >>> 0) + Math.max(0, Math.floor(tick)) * size) % variants.length;
  return Array.from({ length: size }, (_, index) => variants[(start + index) % variants.length]!);
}

/** Advance a serializable cursor only after one parent's current cohort has
 * received an own sample window. This keeps the 16-child work bound without
 * scattering one-off outcomes across the complete native catalog. */
export function priceDistanceParentBatch<T>(
  variants: readonly T[],
  progress: Record<string, number>,
  parentKey: string,
  batchSize = 16,
  samplesPerChild = 1,
): readonly T[] {
  const sample = Math.max(0, Math.floor(Number(progress[parentKey]) || 0));
  progress[parentKey] = sample + 1;
  const window = Math.max(1, Math.floor(samplesPerChild));
  return priceDistanceBatch(variants, Math.floor(sample / window), parentKey, batchSize);
}

export function absoluteProtection(side: Side, entry: number, stopPct: number, targetDistance: number) {
  if (!(entry > 0) || !(targetDistance > 0) || !(STOP_DISTANCE_PCTS.includes(stopPct) || STOP_BANDS.long.stops.includes(stopPct))) throw new RangeError("Invalid absolute protection geometry.");
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
