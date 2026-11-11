import type { RangeType, StrategyToggles } from "./types.ts";

export const STRATEGY_PROCESSING_RANGES = ["normal", "minimal", "short", "linear", "geometric", "atr", "volume", "fibonacci"] as const;
export type StrategyProcessingRange = typeof STRATEGY_PROCESSING_RANGES[number];
export type StrategyRangeSwitches = Partial<Record<StrategyProcessingRange, { normal?: boolean; trailing?: boolean }>>;

export function sanitizeStrategyRangeSwitches(raw: unknown): StrategyRangeSwitches {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StrategyRangeSwitches = {};
  for (const range of STRATEGY_PROCESSING_RANGES) {
    const own = (raw as Record<string, unknown>)[range];
    if (!own || typeof own !== "object" || Array.isArray(own)) continue;
    for (const key of ["normal", "trailing"] as const) {
      const value = (own as Record<string, unknown>)[key];
      if (typeof value === "boolean") (out[range] ??= {})[key] = value;
    }
  }
  return out;
}

/** A range cannot override a disabled overall master; additional strategy switches are independent. */
export function strategyTogglesForRange(toggles: StrategyToggles, coordination: "normal" | "minimal" | "short", range?: RangeType): StrategyToggles {
  const own = toggles.ranges?.[coordination], relation = range ? toggles.ranges?.[range] : undefined;
  return { ...toggles, normal: toggles.normal && own?.normal !== false && relation?.normal !== false,
    trailing: toggles.trailing && own?.trailing !== false && relation?.trailing !== false };
}
