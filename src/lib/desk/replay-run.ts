import type { RangeType, SimReport, TacticKind, TacticConfig } from "./types.ts";
import { RANGE_TYPES, REPLAY_RANGES, type ReplayRangeId } from "./engine.ts";
import {
  completeComputations,
  LIVE_TACTICS,
  overallLiveStats,
  simulateHours,
  type CompleteComputeReport,
  type OverallBucket,
} from "./vst.ts";

export type ReplayFill = {
  id: string;
  symbol: string;
  side: string;
  pnl: number;
  reason: string;
  tick: number;
};

export type ReplaySimBundle = {
  hours: number;
  tactic: TacticKind;
  range: RangeType;
  report: SimReport;
  stats: ReturnType<typeof overallLiveStats>;
  fills: ReplayFill[];
  complete: CompleteComputeReport | null;
};

export function replayHoursFor(rangeId: ReplayRangeId): number {
  const h = REPLAY_RANGES.find((r) => r.id === rangeId)?.hours ?? 48;
  return Math.min(168, Math.max(8, h));
}

export function completeHoursFor(simHours: number, opts?: { cap?: number }): number[] {
  const cap = opts?.cap ?? 120;
  const base = [8, 16, 24];
  if (simHours >= 48) base.push(48);
  if (simHours >= 96 && cap >= 96) base.push(Math.min(120, simHours));
  return [...new Set(base.filter((h) => h <= cap))].sort((a, b) => a - b);
}

export function runReplaySimulation(
  hours: number,
  cfg: TacticConfig,
  tactic: TacticKind,
  range: RangeType,
  opts?: { symbolCount?: number; complete?: boolean },
): ReplaySimBundle {
  const h = Math.max(8, Math.round(hours));
  const symbolCount = Math.min(16, Math.max(8, opts?.symbolCount ?? 12));
  const marks = [8, 16, 24, 48, 72, 120].filter((n) => n <= h);
  const { engine, report } = simulateHours(h, cfg, tactic, {
    symbolCount,
    rangeType: range,
    marks,
  });
  const stats = overallLiveStats(engine);
  const fills: ReplayFill[] = engine.closed.slice(0, 200).map((c) => ({
    id: c.id,
    symbol: c.symbol,
    side: c.side,
    pnl: c.pnl,
    reason: c.reason,
    tick: c.tick,
  }));
  let complete: CompleteComputeReport | null = null;
  if (opts?.complete !== false) {
    complete = completeComputations(cfg, { symbolCount, hours: completeHoursFor(h) });
  }
  return { hours: h, tactic, range, report, stats, fills, complete };
}

export function bucketsOk(rows: OverallBucket[] | undefined) {
  return (rows ?? []).filter((b) => (b.n ?? 0) > 0 || (b.openN ?? 0) > 0);
}

export const REPLAY_TACTICS: TacticKind[] = [...LIVE_TACTICS];
export const REPLAY_RANGES_TYPES: RangeType[] = [...RANGE_TYPES];
