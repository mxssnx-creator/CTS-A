import type { IntervalStrategyConfig } from "./types";

/** Allowed interval lengths (minutes). 1 tick = 1 minute. */
export const INTERVAL_MINUTES_OPTIONS = [10, 15, 20, 30, 40, 60] as const;
export type IntervalMinutes = (typeof INTERVAL_MINUTES_OPTIONS)[number];

export const DEFAULT_INTERVAL_MINUTES = 20;
export const DEFAULT_INTERVAL_MIN_SCALE = 0.4;
export const DEFAULT_INTERVAL_MAX_SCALE = 1.2;
export const DEFAULT_INTERVAL_LEAN_PF = 1.45;
export const DEFAULT_INTERVAL_CUT_PF = 0.9;
export const DEFAULT_INTERVAL_HOLD_PF = 1.05;
export const DEFAULT_INTERVAL_LEAN_SOFT_PF = 1.2;
export const DEFAULT_INTERVAL_HIST_WINDOWS = 4;
export const DEFAULT_INTERVAL_STABLE_GREEN = 3;
export const DEFAULT_INTERVAL_RED_CUT = 2;
export const DEFAULT_INTERVAL_RELATION_HAIRCUT = 0.4;
export const DEFAULT_INTERVAL_RELATION_BOOST = 1.08;
export const DEFAULT_INTERVAL_RELATION_KEEP_PF = 0.85;

export const DEFAULT_INTERVAL_STRATEGY: IntervalStrategyConfig = {
  enabled: true,
  minutes: DEFAULT_INTERVAL_MINUTES,
  scaleVol: true,
  scoreRelations: true,
  evalOnCadence: true,
  minScale: DEFAULT_INTERVAL_MIN_SCALE,
  maxScale: DEFAULT_INTERVAL_MAX_SCALE,
  leanPf: DEFAULT_INTERVAL_LEAN_PF,
  cutPf: DEFAULT_INTERVAL_CUT_PF,
  histWindows: DEFAULT_INTERVAL_HIST_WINDOWS,
  stableGreen: DEFAULT_INTERVAL_STABLE_GREEN,
  redCut: DEFAULT_INTERVAL_RED_CUT,
  relationHaircut: DEFAULT_INTERVAL_RELATION_HAIRCUT,
  relationBoost: DEFAULT_INTERVAL_RELATION_BOOST,
  relationKeepPf: DEFAULT_INTERVAL_RELATION_KEEP_PF,
};

function snapMinutes(n: unknown): number {
  const x = Math.round(Number(n) || DEFAULT_INTERVAL_MINUTES);
  let best: number = DEFAULT_INTERVAL_MINUTES;
  let dist = Infinity;
  for (const m of INTERVAL_MINUTES_OPTIONS) {
    const d = Math.abs(m - x);
    if (d < dist) {
      dist = d;
      best = m;
    }
  }
  return best;
}

export function sanitizeIntervalStrategy(raw: Partial<IntervalStrategyConfig> | null | undefined): IntervalStrategyConfig {
  const d = DEFAULT_INTERVAL_STRATEGY;
  if (!raw || typeof raw !== "object") return { ...d };
  const minScale = Math.min(1, Math.max(0.2, Number(raw.minScale) || d.minScale));
  const maxScale = Math.min(1.5, Math.max(minScale, Number(raw.maxScale) || d.maxScale));
  return {
    enabled: raw.enabled !== false,
    minutes: snapMinutes(raw.minutes),
    scaleVol: raw.scaleVol !== false,
    scoreRelations: raw.scoreRelations !== false,
    evalOnCadence: raw.evalOnCadence !== false,
    minScale,
    maxScale,
    leanPf: Math.min(2.5, Math.max(1.1, Number(raw.leanPf) || d.leanPf)),
    cutPf: Math.min(1.2, Math.max(0.5, Number(raw.cutPf) || d.cutPf)),
    histWindows: Math.min(8, Math.max(2, Math.round(Number(raw.histWindows) || d.histWindows))),
    stableGreen: Math.min(6, Math.max(2, Math.round(Number(raw.stableGreen) || d.stableGreen))),
    redCut: Math.min(6, Math.max(1, Math.round(Number(raw.redCut) || d.redCut))),
    relationHaircut: Math.min(1, Math.max(0.2, Number(raw.relationHaircut) || d.relationHaircut)),
    relationBoost: Math.min(1.3, Math.max(1, Number(raw.relationBoost) || d.relationBoost)),
    relationKeepPf: Math.min(1.2, Math.max(0.5, Number(raw.relationKeepPf) || d.relationKeepPf)),
  };
}
