import { normalizeRelateFactors, RELATE_SOURCES, relateLossLevel, relateMultiplier, weightedRelateAllocation,
  type RelateScope, type RelateSource, type RelateVolumeFactors } from "../../../shared/cts-relate/policy.ts";
import { consecutiveLosses, DEFAULT_RELATE_RECOVERY_DRAWDOWN, DEFAULT_RELATE_RECOVERY_TRADES,
  recoveryQualified, type RelateTrial } from "../../../shared/cts-relate/recovery.ts";

export type RelateTrialStamp = {step: number; size: number};
export type RelateRelationTrials = Partial<Record<RelateSource, RelateTrialStamp>>;
export type RelateEvidence = {returns: readonly (number | undefined)[]; trials: readonly RelateTrial[]};

export interface RelateConfig {
  enabled: boolean;
  steps: number;
  ratio: number;
  lastN: number;
  minTrades: number;
  minPF: number;
  maxMultiplier: number;
  activeStep?: number;
  recoveryMinTrades?: number;
  recoveryMaxDrawdownRatio?: number;
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
    recoveryMinTrades: Math.floor(clamp(raw?.recoveryMinTrades, DEFAULT_RELATE_RECOVERY_TRADES, 6, lastN)),
    recoveryMaxDrawdownRatio: clamp(raw?.recoveryMaxDrawdownRatio, DEFAULT_RELATE_RECOVERY_DRAWDOWN, .01, 1),
    scope: raw?.scope === "overall" ? "overall" : "set",
    volumeFactors: normalizeRelateFactors(raw?.volumeFactors),
  };
}

export function planRelate(returns: readonly (number | undefined)[], trials: readonly RelateTrial[],
  before: number, sl: number, tp: number, cfg: RelateConfig,
  evidenceOf: (source: RelateSource) => RelateEvidence | undefined):
    {multiplier: number; trial?: RelateTrialStamp; relationTrials?: RelateRelationTrials} {
  const held = {multiplier: 1};
  if (!cfg.enabled || !(Number.isFinite(sl + tp) && sl > 0 && tp > 0 && sl <= tp * .5 + 1e-12)) return held;
  const step = consecutiveLosses(returns, cfg.steps);
  const qualifies = (rows: RelateEvidence, level: number) =>
    level >= Math.max(1, cfg.activeStep ?? 0) && relateLossLevel(rows.returns, cfg) === level &&
    recoveryQualified(rows.trials, level, before, -Infinity, cfg.recoveryMinTrades ?? DEFAULT_RELATE_RECOVERY_TRADES,
      cfg.minPF, cfg.recoveryMaxDrawdownRatio ?? DEFAULT_RELATE_RECOVERY_DRAWDOWN);
  const relationTrials: RelateRelationTrials = {};
  const levels = new Map<RelateSource, number>();
  if (cfg.scope === "overall") {
    const weight = RELATE_SOURCES.reduce((sum, source) => sum + (cfg.volumeFactors?.[source] ?? 1), 0);
    for (const source of RELATE_SOURCES) {
      const factor = cfg.volumeFactors?.[source] ?? 1;
      if (source === "config" || factor === 0) continue;
      const evidence = evidenceOf(source);
      if (!evidence) continue;
      const level = consecutiveLosses(evidence.returns, cfg.steps);
      if (!level) continue;
      relationTrials[source] = {step: level, size: 1 + (relateMultiplier(level, cfg) - 1) * factor / weight};
      if (qualifies(evidence, level)) levels.set(source, level);
    }
  }
  const size = weightedRelateAllocation(step, cfg, cfg.scope, cfg.volumeFactors, source => levels.get(source) ?? null);
  const evidence = {
    ...(step > 0 && {trial: {step, size: Math.max(size, relateMultiplier(step, cfg))}}),
    ...(Object.keys(relationTrials).length > 0 && {relationTrials}),
  };
  return {multiplier: size > 1 && qualifies({returns, trials}, step) ? size : 1, ...evidence};
}

/** The exact Set must qualify before any independent relation can allocate exposure. */
export function relateAllocation(returns: readonly (number | undefined)[], sl: number, tp: number, cfg: RelateConfig,
  levelOf: (source: RelateSource) => number | null = () => null): number {
  if (!cfg.enabled || !(Number.isFinite(sl + tp) && sl > 0 && tp > 0 && sl <= tp * .5 + 1e-12)) return 1;
  return weightedRelateAllocation(relateLossLevel(returns, cfg), cfg, cfg.scope, cfg.volumeFactors, levelOf);
}
