import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_PF_COORDS, DEFAULT_STRATEGY_TOGGLES, DEFAULT_TACTIC_CONFIG, SHORT_EVAL_HOURS } from "./engine.ts";
import { simulationRequest } from "./simulation-request.ts";
import { initVstEngine, modeledPositionCost, simulateHours } from "./vst.ts";

test("long desk simulations preserve Micro/Minimal/Short settings, costs and disabled strategies", () => {
  for (const range of ["micro", "minimal", "short"] as const) {
    const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: range === "micro", minimalRange: range === "minimal", shortRange: range === "short" };
    const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4 });
    e.minPf = 1.65; e.basePf = 1.45; e.shortPf = 1.7; e.shortBasePf = 1.5;
    e.minSlDistancePct = .4;
    const state = { tacticConfig: cfg, tactic: "axis" as const, rangeType: "fibonacci" as const,
      symbolCount: 4, orderType: "market" as const, costStep: 7,
      blockConfig: { ...DEFAULT_BLOCK_CONFIG, enabled: false, volumeRatio: .2 },
      strategyToggles: { ...DEFAULT_STRATEGY_TOGGLES, block: false, dca: false }, pfCoords: { ...DEFAULT_PF_COORDS }, vst: e };
    for (const hours of [12, 24]) {
      const request = simulationRequest(hours, state);
      assert.deepEqual(request.cfg, cfg); assert.equal(request.tactic, "axis");
      assert.equal(request.options.symbolCount, 4); assert.equal(request.options.rangeType, "fibonacci");
      assert.equal(request.options.prehours, SHORT_EVAL_HOURS);
      e.shortProgress={...e.shortProgress!,evalHours:96};
      assert.equal(simulationRequest(hours,state).options.prehours,96);
      e.shortProgress={...e.shortProgress!,evalHours:SHORT_EVAL_HOURS};
      assert.deepEqual(request.options.block, state.blockConfig);
      assert.deepEqual(request.options.strategyToggles, state.strategyToggles);
      assert.equal(request.options.costStep, 7);
      assert.equal(request.options.policy?.basePf, 1.45); assert.equal(request.options.policy?.shortPf, 1.7);
      assert.equal(request.options.policy?.minSlDistancePct, .4);
      request.cfg.microRange = false; request.options.block!.volumeRatio = 9;
      assert.equal(state.blockConfig.volumeRatio, .2); assert.equal(cfg.microRange, range === "micro");
    }
  }
});

test("no-prehistory simulations report discovery; configured economics apply to their first orders", () => {
  const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: true, minimalRange: false, shortRange: false };
  const { engine, report } = simulateHours(1 / 60, cfg, "trailing", { symbolCount: 4,
    policy: { minSlDistancePct: .7, fees: { taker: .002, maker: .001, slippageFeeRatio: .2 } } });
  assert.equal(engine.preEvalDone, false);
  assert.equal(report.qualification, "discovery");
  assert.match(report.statisticsScope, /no completed Base qualification/);
  const rows = [...engine.queue, ...engine.orders, ...engine.positions, ...engine.closed];
  assert.ok(rows.length > 0, "discovery still exercises order processing");
  for (const row of rows) {
    assert.equal(row.minSlDistancePct, .7);
    assert.ok(Math.abs(row.modelRtCost! - .0048) < 1e-12);
    assert.equal(row.modelRtCost, modeledPositionCost(engine, row.symbol));
  }
});
