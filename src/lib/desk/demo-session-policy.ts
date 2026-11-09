import { clampBlockVol, clampSharedVol, clampOverallVol, sanitizeBlockCounts, sanitizeLastNProgress, sanitizeStrategyToggles } from "./engine.ts";
import type { BlockConfig, StrategyToggles, TacticConfig } from "./types.ts";

/** An acknowledged close cannot release ownership before the venue confirms flat. */
export function demoCloseConfirmed(result: { ok?: boolean; pending?: boolean; uncertain?: boolean } | null | undefined): boolean {
  return result?.ok === true && result.pending !== true && result.uncertain !== true;
}

export function demoStrategySettings(current: StrategyToggles, patch?: Partial<StrategyToggles>): StrategyToggles {
  return sanitizeStrategyToggles({ ...current, ...patch });
}

export function demoTacticSettings(config: TacticConfig, toggles: StrategyToggles): TacticConfig {
  return { ...config,
    dcaCount: toggles.dca ? Math.max(1, Math.round(config.dcaCount)) : 1,
    trailingPct: toggles.trailing ? Math.max(0, config.trailingPct) : 0,
  };
}

export function demoBlockSettings(current: BlockConfig, patch: Partial<BlockConfig> | undefined, toggles: StrategyToggles): BlockConfig {
  const merged = { ...current, ...patch };
  return { ...merged,
    enabled: toggles.block && merged.enabled !== false,
    counts: sanitizeBlockCounts(merged.counts),
    volumeRatio: clampBlockVol(merged.volumeRatio),
    relVolumeRatio: clampBlockVol(merged.relVolumeRatio),
    sharedVolumeRatio: clampSharedVol(merged.sharedVolumeRatio),
    overallVolumeRatio: clampOverallVol(merged.overallVolumeRatio),
    lastNProgress: sanitizeLastNProgress(merged.lastNProgress),
  };
}

/** Keep measured losses and missing evidence visible. Never replace them with a historical winner. */
export function measuredDemoProgress(e: { stats?: { pf?: number }; progressEval?: {
  indications?: Record<string, unknown>; ranges?: Record<string, unknown>; tactics?: Record<string, unknown>;
  lastNOverall?: unknown; lastNComplete?: unknown;
} } | undefined) {
  const pe = e?.progressEval;
  return { preset: "current-session", pf: Number.isFinite(e?.stats?.pf) ? e!.stats!.pf : null,
    indications: { ...pe?.indications }, ranges: { ...pe?.ranges }, tactics: { ...pe?.tactics }, plays: {},
    overall: pe?.lastNOverall ?? { pass: false, state: "unknown", pf: null },
    complete: pe?.lastNComplete ?? { pass: false, state: "unknown" },
  };
}
