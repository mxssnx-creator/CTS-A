/** CTS-G manual step policy. Distances are price PERCENT, not fractions or ATR multipliers. */
export interface StepPfRules { enabled: boolean; ratio: number; max: number }
export const DEFAULT_STEP_PF: StepPfRules = { enabled: true, ratio: 0.2, max: 2 };
export function stepPfFloor(legacy: number, tpPercent: number | undefined, rules?: Partial<StepPfRules>): number {
  if (!rules?.enabled || tpPercent === undefined || !Number.isFinite(tpPercent) || tpPercent <= 0) return legacy;
  const ratio = typeof rules.ratio === "number" && Number.isFinite(rules.ratio)
    ? Math.max(0.1, Math.min(1.5, Math.round(rules.ratio * 20) / 20)) : DEFAULT_STEP_PF.ratio;
  const cap = typeof rules.max === "number" && Number.isFinite(rules.max)
    ? Math.max(1, Math.min(2, rules.max)) : DEFAULT_STEP_PF.max;
  const step = Math.max(0.2, Math.min(3.5, Math.floor(tpPercent * 10 + 1e-9) / 10));
  return Math.max(legacy, Math.min(cap, Math.round((1 + step * ratio) * 1e6) / 1e6));
}
