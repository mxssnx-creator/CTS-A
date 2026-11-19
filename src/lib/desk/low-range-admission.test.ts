import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "./engine.ts";
import { armUniverse, completeConfigSampleKey, finishBaseEval, initVstEngine, liveShouldExecute, auditEngine, noteBlockPosClose, skipLiveSymbol, tickVst } from "./vst.ts";\nimport { lowRangeGridProtects } from "../../../shared/cts-indications/origin/indications/low-range.ts";

test("audit accepts the own cost-plus-stop floor but rejects an unjustified wider stop",()=>{
  for (const side of ["long","short"] as const) {
    const e=initVstEngine(DEFAULT_TACTIC_CONFIG,{arm:false,warmup:0,symbolCount:3});
    const sign=side==="long"?1:-1;
    e.positions=[{id:"floor",symbol:"BTCUSDT",side,avgEntry:100,qty:1,unrealized:0,
      sl:100-sign*.276,tp:100+sign*.2,slOfTp:.25,modelRtCost:.00176,minSlDistancePct:.1} as never];
    assert.equal(auditEngine(e).ratioViolations,0);
    e.positions[0].sl=100-sign*.4;
    assert.equal(auditEngine(e).ratioViolations,1);
  }
});

test("audit uses the native absolute stop instead of a legacy TP ratio", () => {
  for (const side of ["long", "short"] as const) {
    const sign = side === "long" ? 1 : -1;
    const e = initVstEngine(DEFAULT_TACTIC_CONFIG, { arm: false, warmup: 0, symbolCount: 3 });
    e.positions = [{ id: "native", symbol: "BTCUSDT", side, avgEntry: 100, qty: 1, unrealized: 0,
      sl: 100 - sign * .8, tp: 100 + sign * .3, slOfTp: .25, priceStopPct: .8,
      modelRtCost: .00176, minSlDistancePct: .1 } as never];
    assert.equal(auditEngine(e).ratioViolations, 0, "the configured 0.8% absolute stop is valid");
    Object.assign(e.positions[0], { avgEntry: 100 + sign * .4, qty: 2, blockQty: 1, blockAvg: 100 + sign * .8 });
    assert.equal(auditEngine(e).ratioViolations, 0, "Block keeps the parent's original protection entry");
    e.positions[0].sl = 100 - sign * .85;
    assert.equal(auditEngine(e).ratioViolations, 1, "a wider stop is still flagged");
  }
});

for (const side of ["long", "short"] as const) for (const trailingDistance of ["fixed", "dynamic"] as const) {
  test(`${side} ${trailingDistance} native stop stays at its own distance through later partial fills`, () => {
    const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: true, tpAtr: .3, slOfTp: .25 };
    const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 3, orderType: "limit" });
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, axis: false, block: false, dca: false };
    const q = e.quotes.BTCUSDT;
    const price = q.px;
    const sign = side === "long" ? 1 : -1;
    Object.assign(q, { open: price, lo: price * .9995, hi: price * 1.0005, vol: .004 });
    e.orders.push({ id: "native-partial", connId: e.activeConnId, symbol: "BTCUSDT", side, type: "limit",
      qty: 1, filled: 0, remaining: 1, price, status: "open", rangeType: "atr", level: 1,
      sl: price * (1 - sign * .002), tp: price * (1 + sign * .003), slDist: price * .002,
      tpDist: price * .003, batchId: "native-partial", note: "absolute stop partial fill", tactic: "trailing",
      validExec: true, microRange: true, tpAtr: .3, slOfTp: .25, priceStopPct: .2,
      priceTrailPct: .6, trailingDistance, modelRtCost: .00176, minSlDistancePct: .1 });
    for (let fills = 1; fills <= 3; fills++) {
      const expectedStopPct = fills === 3 ? .12 : .2;
      if (fills === 3) {
        const p = e.positions[0];
        p.slDist = p.avgEntry * expectedStopPct / 100;
        p.sl = p.avgEntry - sign * p.slDist;
      }
      tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true, freezeIds: new Set(["BTCUSDT"]) });
      assert.equal(e.positions.length, 1);
      const p = e.positions[0];
      assert.equal(p.legs.length, fills, "the second fill remains in the owning position");
      assert.equal(p.trailingDistance, trailingDistance);
      assert.ok(Math.abs(100 * Math.abs(p.sl - p.avgEntry) / p.avgEntry - expectedStopPct) < 1e-9,
        `fill ${fills} respects ${expectedStopPct}%, got ${100 * p.slDist / p.avgEntry}%`);
    }
  });
}

for (const range of ["micro", "minimal", "short"] as const) {
  test(`${range}: complete paper admission uses the same exact evidence as the execution gate`, () => {
    const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: range === "micro", minimalRange: range === "minimal",
      shortRange: range === "short", tpAtr: range === "micro" ? .3 : range === "minimal" ? 2 : .6, slOfTp: .5 };
    const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false };
    armUniverse(e, cfg, "trailing", "atr");
    const initial = [...e.orders, ...e.queue];
    assert.ok(initial.length > 1, "Base discovery runs before qualification");
    const seed = initial.find(o => o.tactic === "trailing" && o.calc === "base") ?? initial[0];
    e.tick = 100;
    e.closed = Array.from({ length: 60 }, (_, i) => ({ ...seed, id: `known-${i}`, pnl: 1, ratio: .01,
      entry: seed.price, exit: seed.price * (seed.side === "long" ? 1.012 : .988),
      reason: "tp" as const, tick: 99 - i, r: 1, validExec: false }));
    e.queue = []; e.orders = []; e.positions = [];
    finishBaseEval(e);
    const executionDecision = (order: typeof seed) => {
      e.liveTape = true;
      try { return liveShouldExecute(e, order); } finally { e.liveTape = false; }
    };
    assert.equal(executionDecision(seed), true, "known exact Base history qualifies");
    const unknown = { ...seed, slOfTp: seed.slOfTp === .25 ? .5 : .25 };
    assert.equal(executionDecision(unknown), false, "an unobserved sibling is not qualified");
    armUniverse(e, cfg, "trailing", "atr");
    const admitted = [...e.orders, ...e.queue].filter(o => o.validExec);
    assert.ok(admitted.length > 0, "qualified cells remain available after Base");
    for (const order of admitted) assert.equal(executionDecision(order), true,
      `paper admitted an unqualified ${range} cell ${JSON.stringify([order.symbol, order.indication, order.calc, order.tpAtr, order.slOfTp])}`);
    e.queue = []; e.orders = []; e.positions = [];
    e.liveTape = true;
    armUniverse(e, cfg, "trailing", "atr");
    const live = [...e.orders, ...e.queue].filter(o => o.validExec);
    assert.ok(live.length > 0, "the actual live admission path can also arm qualified cells");
    for (const order of live) assert.equal(liveShouldExecute(e, order), true,
      "live admission preserves the complete geometry/economic identity");
  });
}


test("short coordination materializes the enabled native stop/trail catalog", () => {
  const cfg = {
    ...DEFAULT_TACTIC_CONFIG,
    shortRange: true,
    tpAtr: .6,
    slOfTp: .5,
    priceDistanceGrid: { enabled: true, stopPcts: [.2, .3], trailPcts: [.2, .3] },
  };
  const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: false, trailing: true, axis: false, dca: false, block: false };
  armUniverse(e, cfg, "trailing", "atr");
  const rows = [...e.orders, ...e.queue].filter(order => order.shortRange === true && order.tactic === "trailing");
  assert.ok(rows.length > 0, "Short discovery must create trailing children");
  assert.ok(rows.every(order => order.priceStopPct != null && order.priceTrailPct != null),
    "Short discovery fell back to the legacy ATR/ratio grid");
  const geometries = new Set(rows.map(order =>
    JSON.stringify([order.priceStopPct, order.priceTrailPct, order.trailingDistance ?? "dynamic"])));
  assert.deepEqual(geometries, new Set([
    JSON.stringify([.2, .2, "dynamic"]),
    JSON.stringify([.2, .2, "fixed"]),
    JSON.stringify([.2, .3, "dynamic"]),
    JSON.stringify([.2, .3, "fixed"]),
    JSON.stringify([.3, .2, "dynamic"]),
    JSON.stringify([.3, .2, "fixed"]),
    JSON.stringify([.3, .3, "dynamic"]),
    JSON.stringify([.3, .3, "fixed"]),
  ]), "every Short parent must expose each enabled fixed/dynamic child geometry");
});

function nativeMicroFixture(priceDistanceGrid = { enabled: true, stopPcts: [.2, .3], trailPcts: [.2, .3] }) {
  const cfg = {
    ...DEFAULT_TACTIC_CONFIG,
    microRange: true, minimalRange: false, shortRange: false, tpAtr: .3, slOfTp: 1,
    priceDistanceGrid,
  };
  const e = initVstEngine(cfg, { arm: false, symbolCount: 4 });
  e.lastTactic = "trailing";
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false };
  armUniverse(e, cfg, "trailing", "atr");
  const seed = e.queue.find(o => o.priceStopPct === .2)!;
  assert.ok(seed, "the native cell can open on an empty Base tape");
  e.queue = [];
  e.orders = [];
  e.tick = 100;
  return { cfg, e, seed };
}

test("a losing native Micro sibling cannot stop another cell from collecting Base samples", () => {
  const { cfg, e, seed } = nativeMicroFixture();
  e.closed = Array.from({ length: 15 }, (_, index) => ({
    ...seed, id: `losing-sibling-${index}`, tick: 99 - index, priceStopPct: .3,
    pnl: -1, ratio: -.01, entry: seed.price, exit: seed.price * .99, r: -1, reason: "sl" as const,
  }));
  assert.equal(skipLiveSymbol(e, seed.symbol), true, "the fixture trips the pooled symbol gate");
  armUniverse(e, cfg, "trailing", "atr");
  assert.ok(e.queue.some(o => o.symbol === seed.symbol && o.priceStopPct === .2),
    "native Base discovery should collect the cell's own outcomes");
  e.queue = [];
  e.orders = [];
  e.cooldown[`${e.activeConnId}:${seed.symbol}`] = e.tick + 3;
  armUniverse(e, cfg, "trailing", "atr");
  assert.ok(!e.queue.some(o => o.symbol === seed.symbol), "the configured symbol cooldown is still enforced");
  assert.equal(e.cooldown[`${e.activeConnId}:${seed.symbol}`], e.tick + 3);
  e.tick += 3;
  const block = { ...e.blockCfg!, keepAdjusted: false };
  for (let sample = 0; sample < 6; sample++) noteBlockPosClose(e, seed.symbol, seed.side, -1, block);
  armUniverse(e, cfg, "trailing", "atr");
  assert.ok(!e.queue.some(o => o.symbol === seed.symbol), "the symbol's active Block pause is still enforced");
});

test("a qualified native Micro cell can enter paper validation beside an unqualified sibling", () => {
  const { cfg, e, seed } = nativeMicroFixture();
  e.closed = Array.from({ length: 56 }, (_, index) => {
    const sibling = index < 40;
    const signed = seed.side === "long" ? 1 : -1;
    return { ...seed, id: `base-${index}`, tick: 99 - index, priceStopPct: sibling ? .3 : .2,
      pnl: sibling ? -1 : 1, ratio: sibling ? -.01 : .01, entry: seed.price,
      exit: seed.price * (1 + signed * (sibling ? -.01 : .01)), r: sibling ? -1 : 1,
      reason: sibling ? "sl" as const : "tp" as const };
  });
  finishBaseEval(e);
  assert.equal(liveShouldExecute(e, seed), true, "the exact cell has acceptable after-cost proof");
  assert.equal(skipLiveSymbol(e, seed.symbol), true, "the mixed symbol history is still losing");
  armUniverse(e, cfg, "trailing", "atr");
  const armed = e.queue.filter(o => o.symbol === seed.symbol && o.validExec);
  assert.ok(armed.some(o => o.priceStopPct === .2 && o.priceTrailPct === seed.priceTrailPct),
    "native validation must reach the qualified own cell");
  assert.ok(armed.every(o => liveShouldExecute(e, o)), "the sibling must still pass its exact gate");
  assert.ok(armed.every(o => o.priceStopPct !== .3), "no losing sibling is admitted");
});

test("the next native discovery batch cannot hide a qualified frozen child in validation", () => {
  const { cfg, e, seed } = nativeMicroFixture({ enabled: true, stopPcts: [.2, .3, .4, .5], trailPcts: [.2, .3, .4, .5, .6] });
  e.closed = Array.from({ length: 20 }, (_, index) => ({
    ...seed, id: `proof-before-rotation-${index}`, tick: 99 - index, pnl: 1, ratio: .01,
    entry: seed.price, exit: seed.price * (seed.side === "long" ? 1.012 : .988), r: 1, reason: "tp" as const,
  }));
  for (const key of Object.keys(e.priceDistanceParentSamples!)) e.priceDistanceParentSamples![key] = 15;
  finishBaseEval(e);
  assert.equal(liveShouldExecute(e, seed), true, "selection already qualified this exact cell");
  armUniverse(e, cfg, "trailing", "atr");
  const armed = e.queue.filter(o => o.symbol === seed.symbol && o.validExec);
  assert.ok(armed.some(o => o.priceStopPct === seed.priceStopPct && o.priceTrailPct === seed.priceTrailPct &&
    o.trailingDistance === seed.trailingDistance), "validation must revisit the frozen child independent of the Base cursor");
  assert.ok(armed.every(o => liveShouldExecute(e, o)), "every armed cell must still prove its exact identity");
  const restored: typeof e = JSON.parse(JSON.stringify(e));
  restored.queue = [];
  restored.orders = [];
  restored.closed = [];
  armUniverse(restored, cfg, "trailing", "atr");
  assert.deepEqual(restored.queue.map(o => o.protectionKey), e.queue.map(o => o.protectionKey),
    "the held-out candidates still come from the same frozen tape after restart");
});


test("Low-Range cost cells keep fixed and dynamic native siblings independent", () => {
  const cost = .00176;
  const protects = lowRangeGridProtects({
    enabled: true, step: .002, steps: [2], slRatios: [.2, .3], trailRatios: [0, .5], maxHoldMin: 60,
  }, cost, 5, .1);
  assert.ok(protects.length >= 2);
  assert.ok(protects.every(cell => cell.lowRangeOnly === true && cell.maxHoldMin === 60 && cell.hold === 12));
  assert.ok(protects.every(cell => cell.tp === .00576 && cell.sl >= .00276));
  assert.ok(protects.some(cell => cell.trail === 0));
  assert.ok(protects.some(cell => cell.trail === .00576));

  const identity = {
    connId: "bingx-x02", symbol: "BTCUSDT", side: "long" as const, indication: "low-range-1-edge-turn-standalone",
    tactic: "trailing", rangeType: "atr", playbook: "normal", kind: "normal", calc: "base",
    tpAtr: .576, slOfTp: .2, trailPct: .576, microRange: false, minimalRange: false, shortRange: true,
    modelRtCost: cost, minSlDistancePct: .1, priceStopPct: .2, priceTrailPct: .3,
  };
  const keys = [
    completeConfigSampleKey({ ...identity, trailingDistance: "fixed" }),
    completeConfigSampleKey({ ...identity, trailingDistance: "dynamic" }),
    completeConfigSampleKey({ ...identity, priceStopPct: .3, trailingDistance: "dynamic" }),
    completeConfigSampleKey({ ...identity, priceTrailPct: .4, trailingDistance: "dynamic" }),
  ];
  assert.ok(keys.every(Boolean));
  assert.equal(new Set(keys).size, 4);
});
