import { relationalVolumeFactor, strategyVolumeWeight } from "../../../shared/cts-volume/ratios.ts";
import type { RelationalVolumeRatios } from "../../../shared/cts-volume/ratios.ts";

interface VolumeLane {
  symbol?: string;
  indication?: string;
  tactic?: string;
  playbook?: string;
  microRange?: boolean;
  minimalRange?: boolean;
  shortRange?: boolean;
  rangeType?: string;
  controllingRange?: string;
}

export function laneVolumeStrategy(lane: VolumeLane): string {
  if (lane.playbook === "block") return "block";
  if (lane.tactic === "axis" || lane.playbook === "axis") return "axis";
  if (lane.tactic === "dca" || lane.playbook === "dca") return "dca";
  return lane.tactic === "trailing" ? "trailing" : "normal";
}

/** New independent notional: the actual family, tier and geometry each match once. */
export function laneVolumeFactor(policy: RelationalVolumeRatios | undefined, lane: VolumeLane, strategy = laneVolumeStrategy(lane)): number {
  const indication = lane.indication ?? "";
  return relationalVolumeFactor(policy, {
    indicationType: indication.startsWith("inverse-") ? "inverse" : indication.startsWith("tactic-") ? "tactic" : indication,
    indication,
    strategy,
    range: [lane.microRange ? "micro" : lane.minimalRange ? "minimal" : lane.shortRange ? "short" : "normal", lane.rangeType ?? lane.controllingRange ?? "atr"],
    symbol: lane.symbol,
  });
}

/** Parent-sized adds already carry their parent's strategy weight. */
export function additionalLaneVolumeFactor(policy: RelationalVolumeRatios | undefined, lane: VolumeLane, strategy: string): number {
  return laneVolumeStrategy(lane) === strategy ? 1 : strategyVolumeWeight(policy, strategy);
}
