export interface RelateConfig {
  enabled: boolean;
  steps: number;
  ratio: number;
  lastN: number;
  minTrades: number;
  minPF: number;
  maxMultiplier: number;
}

export const DEFAULT_RELATE: RelateConfig = {
  enabled: false, steps: 12, ratio: .2, lastN: 250, minTrades: 60, minPF: 1.1, maxMultiplier: 2,
};

export function relateConfig(raw?: Partial<RelateConfig>): RelateConfig {
  const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const lastN = Math.floor(clamp(raw?.lastN, 250, 60, 250));
  return {
    enabled: raw?.enabled === true,
    steps: Math.floor(clamp(raw?.steps, 12, 2, 15)),
    ratio: Math.round(clamp(raw?.ratio, .2, .2, 6) * 5) / 5,
    lastN,
    minTrades: Math.floor(clamp(raw?.minTrades, 60, 60, lastN)),
    minPF: clamp(raw?.minPF, 1.1, 1.01, 10),
    maxMultiplier: clamp(raw?.maxMultiplier, 2, 1, 8),
  };
}

/** CTS-G's positive-run sizing rule, using the qualifying Set's signed returns. */
export function relateAllocation(returns: readonly (number | undefined)[], sl: number, tp: number, cfg: RelateConfig): number {
  const count = Math.min(returns.length, cfg.lastN);
  if (!cfg.enabled || count < cfg.minTrades || !(Number.isFinite(sl + tp) && sl > 0 && tp > 0 && sl <= tp * .5)) return 1;
  let gains = 0, losses = 0, wins = 0;
  for (let i = 0; i < count; i++) {
    const result = returns[i];
    if (result === undefined || !Number.isFinite(result)) return 1;
    if (result > 0) {
      gains += result;
      if (i === wins && wins < cfg.steps) wins++;
    } else losses -= result;
  }
  if (!wins || !Number.isFinite(gains + losses) || (losses > 0 && gains / losses < cfg.minPF)) return 1;
  return Math.min(cfg.maxMultiplier, 1 + cfg.ratio * wins);
}
