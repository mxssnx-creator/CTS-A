import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RELATIONAL_VOLUME } from "../../../shared/cts-volume/ratios.ts";
import { laneVolumeFactor, additionalLaneVolumeFactor } from "./volume-policy.ts";

test("independent strategy families match tier and geometry once, including standalone DCA notionals", () => {
  const policy = { ...DEFAULT_RELATIONAL_VOLUME, indicationTypes: { inverse: 2 }, strategies: { normal: 5, axis: 0.5, dca: 3, block: 2 }, ranges: { micro: 1.5, atr: 0.5 } };
  const lane = { symbol: "SOL-USDT", indication: "inverse-known-ema-9-21", microRange: true, controllingRange: "atr", tactic: "axis", playbook: "axis" };
  assert.equal(laneVolumeFactor(policy, lane), 0.75);
  assert.equal(laneVolumeFactor(policy, lane, "dca"), 4.5);
  const weightedParent = 10 * laneVolumeFactor(policy, lane);
  assert.equal(weightedParent * additionalLaneVolumeFactor(policy, lane, "block"), 15);
  assert.equal(additionalLaneVolumeFactor(policy, { ...lane, playbook: "block" }, "block"), 1, "a Block parent already carries its own weight");
  assert.equal(laneVolumeFactor(undefined, lane), 1);
  assert.equal(laneVolumeFactor(policy, { ...lane, microRange: false, shortRange: true }), 0.5);
});
