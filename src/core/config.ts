// CTS-A Core v2 — authoritative defaults. Every number the engine uses lives here.
import type { BlockConfig, DcaConfig, Gates, Protect, ProtectGridSpec, StrategyToggles } from "./domain/types.ts";

/** Round-trip position cost: 0.1% per side, doubled = 0.2% of notional per closed trade. */
export const RT_COST = 0.002;
/** Profit factor reported when a sample has wins and no losses. */
export const PF_NO_LOSS = 4;

/** Base-stage protect (15m bars): 2.6% target, 1.5× stop, 8h max hold. Wide targets clear the 0.2% cost. */
export const DEFAULT_PROTECT: Protect = { tp: 0.026, sl: 0.039, trail: 0, hold: 32 };

/** Main-stage refinement grid (fractions). SL is expressed relative to TP; trail relative to TP (0 = off). */
export const PROTECT_GRID = {
  tp: [0.018, 0.026, 0.035, 0.05],
  slOfTp: [1, 1.5],
  trail: [0, 0.4],
  hold: [12, 32],
} as const;

/** Last-N candidates for the walk-forward gate. */
export const LAST_N_GRID = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100] as const;

/** PF 1 is neutral; the default floor 1.1 keeps one position cost of margin above it. */
export const PF_NEUTRAL = 1;
export const DEFAULT_GATES: Gates = {
  minPf: 1.1,
  maxDdtH: 36,
  minTrades: 12,
  quorum: 0.6,
};

/** Execution toggles. Intern (Base) calculations always cover every sub-strategy. */
// Default = Block Active + DCA Active: best of all presets in the 30-day walk-forward comparison (docs/core-v2.md).
export const DEFAULT_TOGGLES: StrategyToggles = {
  normal: true,
  trailing: true,
  block: true,
  blockActive: true,
  dca: true,
  dcaActive: true,
};

export const DEFAULT_BLOCK: BlockConfig = { ratio: 0.2, maxLevel: 6, minActiveLevel: 1, maxMult: 2.5 };
export const DEFAULT_DCA: DcaConfig = { levels: 2, step: 0.008 };

/** Continuous independent eval windows. */
export const EVAL_TIME_WINDOWS_H = [1, 4, 12, 24, 72] as const;
export const EVAL_TRADE_WINDOWS = [20, 50] as const;

export interface CoreSettings {
  /** candle timeframe in minutes */
  tfMin: number;
  /** backfill depth in days */
  historyDays: number;
  /** symbols in the universe (ranked by 24h quote volume) */
  symbols: number;
  cycleMs: number;
  cost: number;
  gates: Gates;
  /** stage-1 winners refined in stage 2 */
  refineTop: number;
  /** configs taken to last-N + continuous evals */
  evalTop: number;
  /** max bots in the armed portfolio */
  armTop: number;
  /** notional per paper trade, USD */
  paperNotional: number;
  toggles: StrategyToggles;
  block: BlockConfig;
  dca: DcaConfig;
  /** independent protect variants computed in Base */
  grid: ProtectGridSpec;
  live: LiveSettings;
}

export interface LiveSettings {
  enabled: boolean;
  connId: "bingx-x01" | "bingx-vst-01" | "bingx-vst-02";
  notionalUsd: number;
  maxPositions: number;
  leverage: number;
}

export const DEFAULT_SETTINGS: CoreSettings = {
  tfMin: 15,
  // 14-day durable window + 48h run + 1 day indicator warm-up
  historyDays: 18,
  symbols: 40,
  cycleMs: 20_000,
  cost: RT_COST,
  gates: DEFAULT_GATES,
  refineTop: 24,
  evalTop: 60,
  armTop: 10,
  paperNotional: 100,
  toggles: DEFAULT_TOGGLES,
  block: DEFAULT_BLOCK,
  dca: DEFAULT_DCA,
  grid: { tp: [0.018, 0.026, 0.035, 0.05], slOfTp: [1, 1.5, 2, 2.5], trailOfTp: [0, 0.25, 0.4], minTrail: 0.006, minSl: 0.01, holdH: [3, 8] },
  live: { enabled: false, connId: "bingx-vst-02", notionalUsd: 6, maxPositions: 3, leverage: 5 },
};

export const GATE_PRESETS: Record<string, Gates> = {
  balanced: DEFAULT_GATES,
  strict: { minPf: 1.5, maxDdtH: 24, minTrades: 20, quorum: 0.75 },
  loose: { minPf: 1.05, maxDdtH: 60, minTrades: 8, quorum: 0.5 },
};

/** Named execution presets (toggles only; Base always computes everything). */
export const STRATEGY_PRESETS: Record<string, { label: string; toggles: StrategyToggles }> = {
  "all-on": { label: "All on (no Active)", toggles: { normal: true, trailing: true, block: true, blockActive: false, dca: true, dcaActive: false } },
  normal: { label: "Normal only", toggles: { normal: true, trailing: false, block: false, blockActive: false, dca: false, dcaActive: false } },
  trailing: { label: "Trailing only", toggles: { normal: false, trailing: true, block: false, blockActive: false, dca: false, dcaActive: false } },
  block: { label: "Normal + Trailing + Block", toggles: { normal: true, trailing: true, block: true, blockActive: false, dca: false, dcaActive: false } },
  "block-active": { label: "Block Active", toggles: { normal: true, trailing: true, block: true, blockActive: true, dca: false, dcaActive: false } },
  "normal-off+block": { label: "Normal off, Block + DCA", toggles: { normal: false, trailing: true, block: true, blockActive: false, dca: true, dcaActive: false } },
  dca: { label: "DCA only", toggles: { normal: false, trailing: false, block: false, blockActive: false, dca: true, dcaActive: false } },
  "dca-active": { label: "DCA Active only", toggles: { normal: false, trailing: false, block: false, blockActive: false, dca: true, dcaActive: true } },
  "block-active+dca-active": { label: "Block Active + DCA Active", toggles: { normal: true, trailing: true, block: true, blockActive: true, dca: true, dcaActive: true } },
};
