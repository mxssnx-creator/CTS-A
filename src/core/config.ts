// CTS-A Core v2 — authoritative defaults. Every number the engine uses lives here.
import type { Gates, Protect } from "./domain/types.ts";

/** Round-trip position cost: 0.1% per side, doubled = 0.2% of notional per closed trade. */
export const RT_COST = 0.002;
/** Profit factor reported when a sample has wins and no losses. */
export const PF_NO_LOSS = 4;

export const DEFAULT_PROTECT: Protect = { tp: 0.009, sl: 0.009, trail: 0, hold: 36 };

/** Stage-2 refinement grid (fractions). SL is expressed relative to TP. */
export const PROTECT_GRID = {
  tp: [0.005, 0.008, 0.012, 0.018, 0.026],
  slOfTp: [0.6, 1, 1.5],
  trail: [0, 0.004, 0.008],
  hold: [36],
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
  tfMin: 5,
  historyDays: 7,
  symbols: 16,
  cycleMs: 20_000,
  cost: RT_COST,
  gates: DEFAULT_GATES,
  refineTop: 24,
  evalTop: 60,
  armTop: 10,
  paperNotional: 100,
  live: { enabled: false, connId: "bingx-vst-02", notionalUsd: 6, maxPositions: 3, leverage: 5 },
};

export const GATE_PRESETS: Record<string, Gates> = {
  balanced: DEFAULT_GATES,
  strict: { minPf: 1.5, maxDdtH: 24, minTrades: 20, quorum: 0.75 },
  loose: { minPf: 1.05, maxDdtH: 60, minTrades: 8, quorum: 0.5 },
};
