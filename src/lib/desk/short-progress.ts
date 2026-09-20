import type { IndicationId, ShortProgressConfig } from "./types";

export const SHORT_PROGRESS_INDICATIONS: IndicationId[] = [
  "trend",
  "break",
  "active",
  "direction",
  "move",
  "rsi",
  "bollinger",
  "sar",
  "macd",
  "ema",
];

export const DEFAULT_SHORT_AXIS_PF = 0.9;
export const DEFAULT_SHORT_BLOCK_PF = 1.15;

export const DEFAULT_SHORT_PROGRESS: ShortProgressConfig = {
  enabled: true,
  indications: [...SHORT_PROGRESS_INDICATIONS],
  overallPf: 0.95,
  basePf: 0.7,
  axisPf: DEFAULT_SHORT_AXIS_PF,
  blockPf: DEFAULT_SHORT_BLOCK_PF,
  lastParts: [3, 6, 12],
  activityWindows: [1, 2, 4],
  drawdownLookback: 12,
  prevRelN: 8,
  bestOnly: true,
};

export function sanitizeShortProgress(raw: Partial<ShortProgressConfig> | null | undefined): ShortProgressConfig {
  const d = DEFAULT_SHORT_PROGRESS;
  if (!raw || typeof raw !== "object") return { ...d, indications: [...d.indications], lastParts: [...d.lastParts], activityWindows: [...d.activityWindows] };
  const indications = Array.isArray(raw.indications)
    ? (raw.indications.filter((x) => SHORT_PROGRESS_INDICATIONS.includes(x as IndicationId)) as IndicationId[])
    : [...d.indications];
  const lastParts = Array.isArray(raw.lastParts)
    ? raw.lastParts.map((n) => Math.min(40, Math.max(2, Math.round(Number(n) || 0)))).filter((n) => n > 0)
    : [...d.lastParts];
  const activityWindows = Array.isArray(raw.activityWindows)
    ? raw.activityWindows.map((n) => Math.min(24, Math.max(1, Math.round(Number(n) || 0)))).filter((n) => n > 0)
    : [...d.activityWindows];
  return {
    enabled: raw.enabled !== false,
    indications: indications.length ? indications : [...d.indications],
    overallPf: Math.min(2.5, Math.max(0.4, Number(raw.overallPf) || d.overallPf)),
    basePf: Math.min(1.5, Math.max(0.4, Number(raw.basePf) || d.basePf)),
    axisPf: Math.min(2, Math.max(0.5, Number(raw.axisPf) || d.axisPf)),
    blockPf: Math.min(2.5, Math.max(0.7, Number(raw.blockPf) || d.blockPf)),
    lastParts: lastParts.length ? lastParts : [...d.lastParts],
    activityWindows: activityWindows.length ? activityWindows : [...d.activityWindows],
    drawdownLookback: Math.min(40, Math.max(4, Math.round(Number(raw.drawdownLookback) || d.drawdownLookback))),
    prevRelN: Math.min(24, Math.max(3, Math.round(Number(raw.prevRelN) || d.prevRelN))),
    bestOnly: raw.bestOnly !== false,
  };
}

export function emptyIndicationScores(): Record<IndicationId, number> {
  return {
    trend: 0,
    break: 0,
    active: 0,
    direction: 0,
    move: 0,
    rsi: 0,
    bollinger: 0,
    sar: 0,
    macd: 0,
    ema: 0,
  };
}

/** Activity + last-part + drawdown + previous-relation boost for short-range ranking. */
export function shortRelationBoost(input: {
  activity: number;
  lastPart: number;
  drawdown: number;
  prevRel: number;
}): number {
  const act = Math.min(1.4, Math.max(0, input.activity));
  const last = Math.min(1, Math.abs(input.lastPart));
  const dd = Math.min(1, Math.max(0, input.drawdown));
  const prev = Math.min(1, Math.abs(input.prevRel));
  return 0.35 * act + 0.25 * last + 0.2 * (1 - dd) + 0.2 * prev;
}
