import { normalizeRelateFactors, relateLossLevel, weightedRelateAllocation,
  type RelateScope, type RelateSource, type RelateVolumeFactors } from "../../../shared/cts-relate/policy.ts";

export interface RelateConfig {
  enabled: boolean;
  steps: number;
  ratio: number;
  lastN: number;
  minTrades: number;
  minPF: number;
  maxMultiplier: number;
  activeStep?: number;
  scope?: RelateScope;
  volumeFactors?: RelateVolumeFactors;
}

export const DEFAULT_RELATE: RelateConfig = {
  enabled: false, steps: 12, ratio: .2, lastN: 250, minTrades: 60, minPF: 1.1, maxMultiplier: 2,
};

export function relateConfig(raw?: Partial<RelateConfig>): RelateConfig {
  const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const lastN = Math.floor(clamp(raw?.lastN, 250, 60, 250));
  const steps = Math.floor(clamp(raw?.steps, 12, 2, 15));
  return {
    enabled: raw?.enabled === true,
    steps,
    activeStep: Math.floor(clamp(raw?.activeStep, 0, 0, Math.min(6, steps))),
    ratio: Math.round(clamp(raw?.ratio, .2, .2, 6) * 5) / 5,
    lastN,
    minTrades: Math.floor(clamp(raw?.minTrades, 60, 60, lastN)),
    minPF: clamp(raw?.minPF, 1.1, 1.01, 10),
    maxMultiplier: clamp(raw?.maxMultiplier, 2, 1, 8),
    scope: raw?.scope === "overall" ? "overall" : "set",
    volumeFactors: normalizeRelateFactors(raw?.volumeFactors),
  };
}

/** The exact Set must qualify before any independent relation can allocate exposure. */
export function relateAllocation(returns: readonly (number | undefined)[], sl: number, tp: number, cfg: RelateConfig,
  levelOf: (source: RelateSource) => number | null = () => null): number {
  if (!cfg.enabled || !(Number.isFinite(sl + tp) && sl > 0 && tp > 0 && sl <= tp * .5 + 1e-12)) return 1;
  return weightedRelateAllocation(relateLossLevel(returns, cfg), cfg, cfg.scope, cfg.volumeFactors, levelOf);
}
