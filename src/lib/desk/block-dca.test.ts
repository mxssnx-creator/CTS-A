import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { adjustActiveBlocks, initVstEngine, LIVE_RUN_CFG, simulateHours, tickVst, VST_DEFAULT_CONN } from "./vst.ts";

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  dcaCount: 3,
  dcaDrawdown: 1,
  shortRange: true,
  tpAtr: 0.42,
  slOfTp: 1.7,
  slAtr: 0.714,
  tpRatio: 1 / 1.7,
  maxHoldTicks: 24,
};

function book(symbolCount = 4) {
  const e = initVstEngine(CFG, { warmup: 2, symbolCount, arm: false, equity: 10, costStep: 3 });
  e.completeSim = true;
  e.preEvalDone = true;
  e.shortRange = true;
  e.running = true;
  e.queue = [];
  e.orders = [];
  e.positions = [];
  return e;
}

function seedLong(e: ReturnType<typeof book>, drop = 0.97) {
  const symbol = Object.keys(e.quotes)[0]!;
  const q = e.quotes[symbol]!;
  const entry = q.px;
  q.px = entry * drop;
  q.lo = Math.min(q.lo, q.px * 0.998);
  q.hi = Math.max(q.hi, entry);
  q.vol = Math.max(q.vol, 0.02);
  const pos = {
    id: "p-seed",
    connId: e.activeConnId || VST_DEFAULT_CONN,
    symbol,
    side: "long" as const,
    qty: 2,
    plannedQty: 2,
    avgEntry: entry,
    mark: q.px,
    sl: entry * 0.94,
    tp: entry * 1.04,
    slDist: entry * 0.06,
    tpDist: entry * 0.04,
    realized: 0,
    unrealized: (q.px - entry) * 2,
    legs: [{ orderId: "seed", qty: 2, px: entry }],
    controllingRange: "atr" as const,
    rangeSpacing: q.atr || entry * 0.01,
    status: "open" as const,
    openedTick: 0,
    tactic: "trailing" as const,
    indication: "ema" as const,
    playbook: "short",
    kind: "short" as const,
    calc: "px" as const,
    tpAtr: 0.42,
    slOfTp: 1.7,
    validExec: true,
  };
  e.positions = [pos];
  e.activeConnId = pos.connId;
  return { pos, q, entry };
}

describe("Block and DCA", () => {
  it("DCA adds onto the same short position and keeps its combo", () => {
    const e = book();
    e.strategyToggles = { ...e.strategyToggles!, dca: true };
    const { entry } = seedLong(e, 0.97);
    tickVst(e, CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    const add = [...e.queue, ...e.orders].find((o) => /^DCA/.test(o.note));
    assert.ok(add, "DCA add was not queued");
    assert.equal(add!.indication, "ema");
    assert.equal(add!.calc, "px");
    assert.equal(add!.tpAtr, 0.42);
    assert.equal(add!.slOfTp, 1.7);
    assert.equal(add!.playbook, "dca");
    assert.equal(add!.tactic, "dca");
    assert.equal(add!.validExec, true);
    assert.ok(Math.abs(add!.price - e.quotes[add!.symbol]!.px) < 1e-8);
    const q = e.quotes[add!.symbol]!;
    q.lo = Math.min(q.lo, add!.price);
    q.px = add!.price;
    for (let i = 0; i < 4 && e.positions.length === 1 && e.positions[0]!.legs.length < 2; i++) {
      tickVst(e, CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    }
    const same = e.positions.filter((p) => p.symbol === add!.symbol && p.side === "long");
    assert.equal(same.length, 1, "DCA opened a second position");
    assert.ok(same[0]!.legs.length >= 2, `legs ${same[0]!.legs.length}`);
    assert.equal(same[0]!.playbook, "short");
    assert.equal(same[0]!.calc, "px");
    assert.equal(same[0]!.tpAtr, 0.42);
    assert.ok(same[0]!.avgEntry < entry && same[0]!.avgEntry > 0);
    assert.ok(Number.isFinite(same[0]!.sl) && Number.isFinite(same[0]!.tp));
    assert.ok(same[0]!.sl < same[0]!.avgEntry && same[0]!.tp > same[0]!.avgEntry);
  });

  it("DCA stays quiet without drawdown, past the leg cap, and when the switch is off", () => {
    const e = book();
    e.strategyToggles = { ...e.strategyToggles!, dca: true };
    seedLong(e, 1);
    tickVst(e, CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    assert.equal([...e.queue, ...e.orders].some((o) => /^DCA/.test(o.note)), false);

    e.queue = [];
    e.orders = [];
    const deep = seedLong(e, 0.9);
    deep.pos.legs = [
      { orderId: "a", qty: 1, px: deep.entry },
      { orderId: "b", qty: 1, px: deep.entry },
      { orderId: "c", qty: 1, px: deep.entry },
    ];
    tickVst(e, CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    assert.equal([...e.queue, ...e.orders].some((o) => /^DCA/.test(o.note)), false);

    e.queue = [];
    e.orders = [];
    e.strategyToggles = { ...e.strategyToggles!, dca: false };
    seedLong(e, 0.9);
    tickVst(e, CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    assert.equal([...e.queue, ...e.orders].some((o) => /^DCA/.test(o.note)), false);

    const lane = seedLong(e, 0.9);
    lane.pos.tactic = "dca";
    tickVst(e, CFG, "dca", { skipWalk: true, rangeType: "atr" });
    assert.ok([...e.queue, ...e.orders].some((o) => /^DCA/.test(o.note)), "tactic dca still adds when the switch is off");
  });

  it("Block adds join the parent calc and stay inside the multiple cap", () => {
    const e = book();
    const { pos } = seedLong(e, 1.02);
    pos.unrealized = pos.avgEntry * pos.qty * 0.02;
    const block = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      stack: true,
      windows: false,
      addOnWin: false,
      flattenConflict: false,
      endStageOnly: false,
      counts: [1, 2],
      maxMultiple: 2,
      minMultiple: 1,
      minActiveLevel: 1,
      volumeRatio: 0.4,
      relVolumeRatio: 0.4,
      sharedVolumeRatio: 1,
      overallVolumeRatio: 1,
      maxVolumeMultiplier: 3,
    };
    e.blockCfg = block;
    const adj = adjustActiveBlocks(e, CFG, "trailing", block, "atr", { endStage: true });
    assert.ok(adj.added > 0, `block added ${adj.added}`);
    const adds = e.queue.filter((o) => o.playbook === "block");
    assert.ok(adds.length > 0);
    for (const o of adds) {
      assert.equal(o.calc, "px");
      assert.equal(o.indication, "ema");
      assert.equal(o.tpAtr, 0.42);
      assert.equal(o.slOfTp, 1.7);
      assert.equal(o.symbol, pos.symbol);
      assert.equal(o.side, "long");
      assert.ok(o.qty > 0 && o.qty < pos.qty * 3);
      assert.ok(Number.isFinite(o.sl) && Number.isFinite(o.tp));
    }
    const q = e.quotes[pos.symbol]!;
    for (const o of adds) {
      o.status = "open";
      e.orders.push(o);
      q.lo = Math.min(q.lo, o.price);
      q.hi = Math.max(q.hi, o.price);
      q.px = o.price;
    }
    e.queue = e.queue.filter((o) => o.playbook !== "block");
    tickVst(e, CFG, "trailing", { skipWalk: true, rangeType: "atr", block });
    const same = e.positions.filter((p) => p.symbol === pos.symbol && p.side === "long");
    assert.equal(same.length, 1, "block add opened a second position");
    assert.ok((same[0]!.blockQty || 0) > 0, "block fill did not land on the parent");
    assert.equal(same[0]!.playbook, "short");
    assert.equal(same[0]!.calc, "px");

    e.strategyToggles = { ...e.strategyToggles!, block: false };
    const off = adjustActiveBlocks(e, CFG, "trailing", block, "atr", { endStage: true });
    assert.equal(off.added, 0);
    assert.equal(off.cancelled, 0);
  });

  it("full compute keeps Block and DCA finite, joined, and busy", () => {
    const block = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      stack: true,
      windows: true,
      sets: true,
      volumeMode: "parallel" as const,
      overallMode: "parallel" as const,
      counts: [1, 3, 4, 5, 6],
      volumeRatio: 0.4,
      relVolumeRatio: 0.4,
      sharedVolumeRatio: 3,
      overallVolumeRatio: 3,
      maxVolumeMultiplier: 8,
      minActiveLevel: 1,
      maxMultiple: 6,
      pauseCountRatio: 0,
    };
    const { report, engine } = simulateHours(2, { ...LIVE_RUN_CFG, dcaCount: 3, dcaDrawdown: 0.35 }, "trailing", {
      symbolCount: 8,
      rangeType: "atr",
      equity: 10,
      costStep: 3,
      complete: true,
      prehours: 0,
      block,
      orderType: "limit",
      strategyToggles: { dca: true, block: true },
    });
    assert.equal(report.nanCount, 0);
    assert.equal(report.ratioViolations, 0);
    assert.ok(Number.isFinite(report.pf) && report.pf > 0, `pf ${report.pf}`);
    assert.ok(Number.isFinite(report.equity) && report.equity > 0);
    assert.ok(report.ordersPlaced > 200, `placed ${report.ordersPlaced}`);
    assert.ok(report.trades > 20, `trades ${report.trades}`);
    const blockTouch =
      engine.closed.some((c) => (c.blockQty || 0) > 0 || c.playbook === "block") ||
      engine.queue.some((o) => o.playbook === "block") ||
      engine.orders.some((o) => o.playbook === "block") ||
      engine.positions.some((p) => (p.blockQty || 0) > 0);
    assert.ok(blockTouch, "block never sized a position");
    const dcaTouch =
      engine.queue.some((o) => /^DCA/.test(o.note)) ||
      engine.orders.some((o) => /^DCA/.test(o.note)) ||
      engine.positions.some((p) => p.legs.length >= 2 && p.tactic === "dca") ||
      engine.closed.some((c) => c.tactic === "dca");
    assert.ok(dcaTouch, "dca never added a leg");
    for (const p of engine.positions) {
      assert.ok(Number.isFinite(p.qty) && Number.isFinite(p.avgEntry) && Number.isFinite(p.sl) && Number.isFinite(p.tp));
      if (p.playbook === "short" || p.tpAtr != null) {
        assert.ok(p.slDist > 0 && p.tpDist > 0);
      }
    }
  });
});
