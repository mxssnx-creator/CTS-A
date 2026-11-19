import type { LowRangeGrid } from "../../../shared/cts-indications/origin/domain/types.ts";
import { DEFAULT_LOW_RANGE_GRID } from "../../../shared/cts-indications/origin/indications/low-range.ts";
import { SL_TP_RATIOS } from "./protection-policy.ts";

const STEPS = [2, 3, 4, 5, 6] as const;
const TRAIL_RATIOS = [0, .25, .5, .75] as const;

function exactList(value: unknown, allowed: readonly number[], label: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length ||
      value.some(item => typeof item !== "number" || !allowed.includes(item))) {
    throw new RangeError(`Choose unique supported ${label}.`);
  }
  return [...value];
}

export function sanitizeLowRangeGrid(value: unknown): LowRangeGrid {
  if (value === undefined) return {
    ...DEFAULT_LOW_RANGE_GRID,
    steps: [...DEFAULT_LOW_RANGE_GRID.steps],
    slRatios: [...DEFAULT_LOW_RANGE_GRID.slRatios],
    trailRatios: [...DEFAULT_LOW_RANGE_GRID.trailRatios],
  };
  if (!value || typeof value !== "object") throw new TypeError("Low-Range grid must be an object.");
  const raw = value as Partial<LowRangeGrid>;
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") throw new TypeError("Low-Range grid enabled must be boolean.");
  const step = Number(raw.step ?? DEFAULT_LOW_RANGE_GRID.step);
  const maxHoldMin = Number(raw.maxHoldMin ?? DEFAULT_LOW_RANGE_GRID.maxHoldMin);
  if (!Number.isFinite(step) || step <= 0 || step > .008) throw new RangeError("Low-Range step must be within 0–0.8%.");
  if (!Number.isFinite(maxHoldMin) || maxHoldMin < 1 || maxHoldMin > 360) throw new RangeError("Low-Range hold must be 1–360 minutes.");
  return {
    enabled: raw.enabled === true,
    step,
    steps: exactList(raw.steps ?? DEFAULT_LOW_RANGE_GRID.steps, STEPS, "Low-Range target steps"),
    slRatios: exactList(raw.slRatios ?? DEFAULT_LOW_RANGE_GRID.slRatios, SL_TP_RATIOS, "Low-Range stop ratios"),
    trailRatios: exactList(raw.trailRatios ?? DEFAULT_LOW_RANGE_GRID.trailRatios, TRAIL_RATIOS, "Low-Range trailing ratios"),
    maxHoldMin,
  };
}

