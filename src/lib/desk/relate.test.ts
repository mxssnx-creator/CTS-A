import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_STRATEGY_TOGGLES, DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { DEFAULT_RELATE, relateAllocation, relateConfig } from "./relate.ts";
import { sanitizeDeskSettings } from "./settings-sync.ts";
import { armUniverse, completeConfigSampleKey, completeStrategyConfigSampleKey, finishBaseEval, initVstEngine } from "./vst.ts";

const policy = { ...DEFAULT_RELATE, enabled: true };
const lossRun = [-.001, -.001, -.001, -.001, ...Array<number>(56).fill(.01)];

test("Relate requires complete signed evidence and a bounded stop", () => {
  const wins = Array.from({ length: 60 }, () => .01);
  assert.equal(relateAllocation(lossRun, .4, 1, policy), 2);
  assert.equal(relateAllocation(wins, .4, 1, policy), 1);
  assert.equal(relateAllocation(lossRun, .51, 1, policy), 1);
  assert.equal(relateAllocation(lossRun.slice(1), .4, 1, policy), 1);
  assert.equal(relateAllocation([-.001, undefined, ...wins.slice(2)], .4, 1, policy), 1);
  assert.equal(relateAllocation([-.001, -.8, ...wins.slice(2)], .4, 1, policy), 1);
  assert.equal(relateAllocation([-.002, .01, ...wins.slice(2)], .4, 1, policy), 1.2);
  assert.equal(relateAllocation([-.002, ...wins.slice(1)], .4, 1, { ...policy, activeStep: 2 }), 1);
  assert.equal(relateAllocation(lossRun, .4, 1, { ...policy, activeStep: 2 }), 2);
  const overall = { ...policy, scope: "overall" as const, volumeFactors: { overall: 3, symbol: 1 } };
  assert.equal(relateAllocation([], .4, 1, overall, () => 1), 1);
  assert.equal(relateAllocation(wins, .4, 1, overall, source => source === "overall" ? 1 : null), 1.06);
  const saved = sanitizeDeskSettings({ tacticConfig: { ...DEFAULT_TACTIC_CONFIG, relate: overall } } as never);
  assert.deepEqual(sanitizeDeskSettings(JSON.parse(JSON.stringify(saved))).tacticConfig.relate, relateConfig(overall));
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
    ...seed, id: `own-${i}`, tick: 99-i, pnl: lossRun[i], ratio: lossRun[i], r: lossRun[i], entry: seed.price,
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


test("Relate keeps every native stop-gap and trailing-mode sibling on its own history", () => {
  const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, microRange: false, minimalRange: false,
    tpAtr: .6, slOfTp: .4, relate: policy };
  const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false };
  for (const q of Object.values(e.quotes)) q.atr = q.px * .05;
  armUniverse(e, cfg, "trailing", "atr");
  const seed = [...e.orders, ...e.queue].find(order => order.tactic === "trailing" && order.calc === "base" &&
    order.slDist <= .5 * order.tpDist && completeConfigSampleKey(order));
  assert.ok(seed);

  const fixed = { ...seed, priceStopPct: .2, priceTrailPct: .3, trailingDistance: "fixed" as const };
  const dynamic = { ...seed, priceStopPct: .2, priceTrailPct: .3, trailingDistance: "dynamic" as const };
  const otherStop = { ...dynamic, priceStopPct: .3 };
  const otherGap = { ...dynamic, priceTrailPct: .4 };
  const siblings = [fixed, dynamic, otherStop, otherGap];
  const keys = siblings.map(row => completeConfigSampleKey(row));
  assert.ok(keys.every(Boolean));
  assert.equal(new Set(keys).size, siblings.length);

  const histories = new Map([[keys[0]!, lossRun]]);
  const multiplier = (row: (typeof siblings)[number]) =>
    relateAllocation(histories.get(completeConfigSampleKey(row)!) ?? [], row.slDist, row.tpDist, policy);
  assert.equal(multiplier(fixed), 2);
  assert.equal(multiplier(dynamic), 1);
  assert.equal(multiplier(otherStop), 1);
  assert.equal(multiplier(otherGap), 1);
});

test("Relate keeps identical native parents from different source strategies independent", () => {
  const parent = {
    connId: "bingx-x02", symbol: "BTCUSDT", side: "long" as const, indication: "ema",
    tactic: "trailing", rangeType: "atr", playbook: "short", kind: "short",
    tpAtr: .6, slOfTp: .5, trailPct: .2, trailingDistance: "fixed" as const,
    priceStopPct: .2, priceTrailPct: .2, maxHoldTicks: 12, calc: "base",
    microRange: false, minimalRange: false, shortRange: true,
    modelRtCost: .00176, minSlDistancePct: .1,
  };
  const winner = { ...parent, strategyId: "source-alpha" };
  const sibling = { ...parent, strategyId: "source-beta" };
  const winnerKey = completeStrategyConfigSampleKey(winner);
  const siblingKey = completeStrategyConfigSampleKey(sibling);
  assert.ok(winnerKey && siblingKey);
  assert.notEqual(siblingKey, winnerKey,
    "source strategies must not share Last-N, Relate, cooldown or coordination evidence");

  const histories = new Map([[winnerKey, lossRun]]);
  assert.equal(relateAllocation(histories.get(winnerKey) ?? [], .4, 1, policy), 2);
  assert.equal(relateAllocation(histories.get(siblingKey) ?? [], .4, 1, policy), 1,
    "an unobserved source-strategy sibling cannot borrow the winner's Relate multiplier");
});
