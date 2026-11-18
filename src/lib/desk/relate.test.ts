import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_STRATEGY_TOGGLES, DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { DEFAULT_RELATE, relateAllocation, relateConfig } from "./relate.ts";
import { sanitizeDeskSettings } from "./settings-sync.ts";
import { armUniverse, completeConfigSampleKey, finishBaseEval, initVstEngine } from "./vst.ts";

const policy = { ...DEFAULT_RELATE, enabled: true };

test("Relate requires complete signed evidence and a bounded stop", () => {
  const wins = Array.from({ length: 60 }, () => .01);
  assert.equal(relateAllocation(wins, .4, 1, policy), 2);
  assert.equal(relateAllocation(wins, .51, 1, policy), 1);
  assert.equal(relateAllocation(wins.slice(1), .4, 1, policy), 1);
  assert.equal(relateAllocation([.01, undefined, ...wins.slice(2)], .4, 1, policy), 1);
  assert.equal(relateAllocation([.01, -.8, ...wins.slice(2)], .4, 1, policy), 1);
  assert.equal(relateAllocation([.01, -.002, ...wins.slice(2)], .4, 1, policy), 1.2);
  const saved = sanitizeDeskSettings({ tacticConfig: { ...DEFAULT_TACTIC_CONFIG, relate: policy } } as never);
  assert.deepEqual(sanitizeDeskSettings(JSON.parse(JSON.stringify(saved))).tacticConfig.relate, relateConfig(policy));
});

test("post-Base order sizes change only for the qualifying exact Set and exclude current-tick evidence", () => {
  const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, microRange: false, minimalRange: false,
    tpAtr: .6, slOfTp: .4, relate: policy };
  const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false };
  for (const q of Object.values(e.quotes)) q.atr = q.px * .05;
  armUniverse(e, cfg, "trailing", "atr");
  assert.ok([...e.orders, ...e.queue].every(order => !order.relateMultiplier));
  const seed = [...e.orders, ...e.queue].find(order => order.tactic === "trailing" && order.calc === "base" &&
    order.slDist <= .5 * order.tpDist && completeConfigSampleKey(order));
  assert.ok(seed);
  const key = completeConfigSampleKey(seed);
  e.tick = 100;
  e.closed = Array.from({ length: 60 }, (_, i) => ({
    ...seed, id: `own-${i}`, tick: 99-i, pnl: 1, ratio: .01, r: 1, entry: seed.price,
    exit: seed.price * (seed.side === "long" ? 1.012 : .988), reason: "tp", validExec: true,
  }));
  const reset = () => { e.queue = []; e.orders = []; e.positions = []; };
  reset();
  finishBaseEval(e);
  armUniverse(e, cfg, "trailing", "atr");
  const raised = e.queue.filter(order => order.relateMultiplier);
  assert.ok(raised.length > 0);
  assert.ok(raised.every(order => completeConfigSampleKey(order) === key && order.relateMultiplier === 2 && order.validExec));
  const raisedQty = raised[0].qty;
  reset();
  e.closed[0].tick = e.tick;
  armUniverse(e, cfg, "trailing", "atr");
  const ordinary = e.queue.find(order => completeConfigSampleKey(order) === key);
  assert.ok(ordinary && !ordinary.relateMultiplier);
  assert.equal(raisedQty, 2 * ordinary.qty);
});
