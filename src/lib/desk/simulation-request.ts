import type { BlockConfig, OrderTypeId, PfCoordToggles, RangeType, StrategyToggles, TacticConfig, TacticKind, VstEngine } from "./types.ts";
import type { SimulationPolicy, simulateHours } from "./vst.ts";
import { SHORT_EVAL_HOURS } from "./engine.ts";
import { prehistoryHours } from "./prehistory.ts";

type SimulationSource = {
  tacticConfig: TacticConfig; tactic: TacticKind; rangeType: RangeType;
  symbolCount: number; orderType: OrderTypeId; blockConfig: BlockConfig;
  costStep: number; strategyToggles: StrategyToggles; pfCoords: PfCoordToggles;
  vst: VstEngine;
};

/** A longer run changes duration, not the selected range, risk or qualification settings. */
export function simulationRequest(hours: number, state: SimulationSource) {
  const e = state.vst;
  const policy: SimulationPolicy = {
    activeConnId: e.activeConnId, fees: e.fees, feeSnapshots: e.feeSnapshots, feeAsOfMs: e.feeAsOfMs ?? Date.now(),
    minSlDistancePct: e.minSlDistancePct, stepPf: e.stepPf,
    lastNProgress: e.lastNProgress, shortProgress: e.shortProgress, intervalStrategy: e.intervalStrategy,
    minPf: e.minPf, basePf: e.basePf, blockPf: e.blockPf, axisPf: e.axisPf,
    shortPf: e.shortPf, shortBasePf: e.shortBasePf, shortAxisPf: e.shortAxisPf, shortBlockPf: e.shortBlockPf,
  };
  const complete = hours >= 12;
  const options: NonNullable<Parameters<typeof simulateHours>[3]> = {
    symbolCount: state.symbolCount, orderType: state.orderType, rangeType: state.rangeType,
    block: state.blockConfig, costStep: state.costStep, equity: e.startEquity,
    strategyToggles: state.strategyToggles, pfCoords: state.pfCoords, skipIndications: e.skipIndications,
    complete, comboOnly: false, prehours: complete ? prehistoryHours(e.shortProgress?.evalHours ?? SHORT_EVAL_HOURS) : 0, policy,
    marks: [2, 4, 8, 16, 32, 72].filter(h => h <= hours),
  };
  return structuredClone({ cfg: state.tacticConfig, tactic: state.tactic, options });
}
