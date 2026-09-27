import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, shortControlPrices } from "./engine.ts";
import { adjustActiveBlocks, initVstEngine, LIVE_RUN_CFG, liveShouldExecute, simulateHours, tickVst, unadjustedNormalOrder, VST_DEFAULT_CONN } from "./vst.ts";

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

    const lane = seedLong(e, 0.975);
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

  it("Real stage Overall runs on every executed position only while that scope PF stays higher", () => {
    const e = book();
    e.liveTape = true;
    e.activeConnId = VST_DEFAULT_CONN;
    const ids = Object.keys(e.quotes).slice(0, 2);
    const mk = (symbol: string, side: "long" | "short", unrealized: number, indication: "ema" | "break") => {
      const q = e.quotes[symbol]!;
      q.vol = 0.02;
      const entry = q.px;
      return {
        id: `p-${symbol}`,
        connId: e.activeConnId,
        symbol,
        side,
        qty: 2,
        plannedQty: 2,
        avgEntry: entry,
        mark: entry,
        sl: entry * 0.99,
        tp: entry * 1.02,
        slDist: entry * 0.01,
        tpDist: entry * 0.02,
        realized: 0,
        unrealized,
        legs: [{ orderId: "seed", qty: 2, px: entry }],
        controllingRange: "atr" as const,
        rangeSpacing: q.atr || entry * 0.01,
        status: "open" as const,
        openedTick: 0,
        tactic: "trailing" as const,
        indication,
        playbook: "short" as const,
        kind: "short" as const,
        calc: "px" as const,
        validExec: true,
      };
    };
    e.positions = [mk(ids[0]!, "long", 2, "ema"), mk(ids[1]!, "short", -0.2, "break")];
    e.blockWindowsBySymbol = {
      [ids[1]!]: {
        1: { closed: 12, lastPf: 0.7, wins: 2, n: 1 },
        3: { closed: 12, lastPf: 0.7, wins: 2, n: 3 },
      },
    };
    const block = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      overallSymbol: true,
      overallDirection: true,
      overallIndication: true,
      overallType: true,
      stack: true,
      windows: true,
      addOnWin: false,
      flattenConflict: false,
      endStageOnly: false,
      counts: [1, 3],
      maxMultiple: 3,
      minMultiple: 1,
      minActiveLevel: 1,
      volumeRatio: 0.4,
      sharedVolumeRatio: 1,
      overallVolumeRatio: 1.5,
      maxVolumeMultiplier: 8,
      volumeMode: "parallel" as const,
      overallMode: "parallel" as const,
      minRelPf: 1.05,
    };
    e.blockCfg = block;
    const adj = adjustActiveBlocks(e, CFG, "trailing", block, "atr");
    const notes = e.queue.map((o) => o.note);
    const green = notes.filter((n) => n.includes(ids[0]!));
    const red = notes.filter((n) => n.includes(ids[1]!));
    assert.ok(adj.added > 0, "no block adds");
    assert.ok(green.some((n) => /^Overall Block (shared|additive) #/.test(n)), "green missing book Overall");
    for (const scope of ["Overall Block symbol", "Overall Block dir", "Overall Block indication", "Overall Block type"]) {
      assert.ok(green.some((n) => n.includes(scope)), `green missing ${scope}`);
    }
    assert.equal(red.some((n) => n.includes("Overall Block symbol")), false, "losing symbol still got a symbol Overall add");
    assert.ok(red.some((n) => /Overall Block /.test(n)), "book-level Overall should still cover a position while the book PF is higher");

    e.queue = [];
    e.orders = [];
    e.blockLanes = {};
    e.blockWindows = { 1: { closed: 12, lastPf: 0.8, wins: 2, n: 1 } };
    adjustActiveBlocks(e, CFG, "trailing", block, "atr");
    const bookLevel = (note: string) => /^Overall Block (shared|additive) #/.test(note);
    const blocked = e.queue.filter((o) => /^Overall Block (shared|additive) #1 /.test(o.note));
    assert.equal(blocked.length, 0, "book Overall N=1 added under a losing closed PF");
    assert.ok(e.queue.some((o) => bookLevel(o.note) && /#3 /.test(o.note)), "later N still uses the higher open-book PF");
    e.blockWindows = { 1: { closed: 12, lastPf: 1.4, wins: 9, n: 1 } };
    e.queue = [];
    e.orders = [];
    e.blockLanes = {};
    adjustActiveBlocks(e, CFG, "trailing", block, "atr");
    assert.ok(
      e.queue.some((o) => o.note.startsWith("Overall Block ") && !/symbol|dir|indication|type/.test(o.note)),
      "book Overall did not return after the closed PF recovered",
    );
  });

  it("Normal is the unadjusted set, short range is only the distance", () => {
    const e = book();
    e.liveTape = true;
    e.preEvalDone = true;
    e.shortRange = true;
    e.strategyToggles = { normal: false, trailing: true, axis: true, block: true, dca: false };
    const short = { playbook: "short", kind: "short" as const, tpAtr: 0.48, slOfTp: 1 };
    assert.equal(unadjustedNormalOrder({ ...short, tactic: "trailing" }), true);
    assert.equal(unadjustedNormalOrder({ ...short, tactic: "hybrid" }), true);
    assert.equal(unadjustedNormalOrder({ ...short, tactic: "axis", playbook: "axis" }), false);
    assert.equal(unadjustedNormalOrder({ tactic: "hybrid", playbook: "block", note: "Block #1", blockLevel: 1 }), false);
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", ...short, tactic: "trailing" }), false);
    assert.equal(liveShouldExecute(e, { symbol: "BTCUSDT", side: "long", tactic: "axis", playbook: "axis", kind: "mean", tpAtr: 0.48, slOfTp: 1 }), true);
    const q = e.quotes.BTCUSDT!;
    const stop = shortControlPrices("long", q.px, q.atr, 0.48, 1);
    assert.ok(stop.sl < q.px && stop.tp > q.px);
    assert.ok(Math.abs(stop.tpDist / stop.slDist - 1) < 0.05);
    const conn = e.activeConnId;
    e.queue.push(
      {
        id: "base",
        connId: conn,
        symbol: "BTCUSDT",
        side: "long",
        type: "limit",
        qty: 1,
        filled: 0,
        price: 1,
        remaining: 1,
        status: "queued",
        rangeType: "atr",
        playbook: "short",
        kind: "short",
        tactic: "trailing",
        tpAtr: 0.48,
        slOfTp: 1,
        note: "short 0.48/1",
      },
      {
        id: "axis1",
        connId: conn,
        symbol: "ETHUSDT",
        side: "long",
        type: "limit",
        qty: 1,
        filled: 0,
        price: 1,
        remaining: 1,
        status: "queued",
        rangeType: "atr",
        playbook: "axis",
        kind: "mean",
        tactic: "axis",
        tpAtr: 0.48,
        slOfTp: 1,
        note: "axis",
      },
    );
    tickVst(e, CFG, "axis", { skipWalk: true, skipMatch: true, rangeType: "atr" });
    const live = [...e.queue, ...e.orders];
    assert.equal(live.some((o) => o.id === "base" && o.status !== "cancelled"), false);
    assert.ok(live.some((o) => o.id === "axis1" && o.status !== "cancelled"), "axis with short range was dropped");
  });

  it("live Block still adds when the entry queue is full", () => {
    const e = book();
    e.liveTape = true;
    e.preEvalDone = true;
    const { pos } = seedLong(e, 1.01);
    pos.unrealized = 1;
    pos.validExec = true;
    const block = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      stack: true,
      windows: false,
      addOnWin: false,
      sets: true,
      counts: [1],
      maxMultiple: 6,
      minMultiple: 1,
      minActiveLevel: 1,
      volumeMode: "shared" as const,
      overallMode: "shared" as const,
    };
    e.blockCfg = block;
    for (let i = 0; i < 9000; i++) {
      e.queue.push({
        id: `pad${i}`,
        connId: e.activeConnId,
        symbol: "ETHUSDT",
        side: "long",
        type: "limit",
        qty: 1,
        filled: 0,
        price: 1,
        remaining: 1,
        status: "queued",
        rangeType: "atr",
        playbook: "axis",
        tactic: "axis",
        note: "pad",
      });
    }
    adjustActiveBlocks(e, CFG, "axis", block, "atr");
    assert.ok(e.queue.some((o) => /Overall Block/.test(o.note || "")), "block skipped a full entry queue");
    const scopes = new Set(
      e.queue.filter((o) => /Overall Block/.test(o.note || "")).map((o) => {
        const n = o.note || "";
        if (/indication type/.test(n)) return "indType";
        if (/symbol/.test(n)) return "symbol";
        if (/indication/.test(n)) return "indication";
        if (/type/.test(n)) return "type";
        if (/dir/.test(n)) return "dir";
        return "book";
      }),
    );
    for (const scope of ["book", "symbol", "dir", "indication", "type", "indType"]) {
      assert.ok(scopes.has(scope), `missing ${scope}`);
    }
  });

  it("each Overall scope, shared and additive, stays inside an 8x stack", () => {
    const e = book();
    e.liveTape = true;
    const { pos } = seedLong(e, 1.01);
    pos.unrealized = 1;
    const base = {
      ...DEFAULT_BLOCK_CONFIG,
      enabled: true,
      overall: true,
      stack: true,
      windows: false,
      addOnWin: false,
      flattenConflict: false,
      endStageOnly: false,
      sets: true,
      counts: [1],
      maxMultiple: 6,
      minMultiple: 1,
      minActiveLevel: 1,
      volumeRatio: 0.4,
      sharedVolumeRatio: 1.5,
      overallVolumeRatio: 1.5,
      maxVolumeMultiplier: 8,
      volumeMode: "parallel" as const,
      overallMode: "parallel" as const,
    };
    const only = (flags: Record<string, boolean>) => {
      e.queue = [];
      e.orders = [];
      e.blockLanes = {};
      const block = { ...base, ...flags };
      e.blockCfg = block;
      adjustActiveBlocks(e, CFG, "trailing", block, "atr");
      return e.queue.map((o) => o.note);
    };
    const symbolOnly = only({
      overallSymbol: true,
      overallDirection: false,
      overallIndication: false,
      overallType: false,
      overallIndicationType: false,
    });
    assert.ok(symbolOnly.some((n) => n.includes("Overall Block symbol")));
    assert.equal(symbolOnly.some((n) => n.includes("Overall Block dir")), false);
    assert.equal(symbolOnly.some((n) => n.includes("Overall Block indication")), false);
    const dirOnly = only({
      overallSymbol: false,
      overallDirection: true,
      overallIndication: false,
      overallType: false,
      overallIndicationType: false,
    });
    assert.ok(dirOnly.some((n) => n.includes("Overall Block dir")));
    assert.equal(dirOnly.some((n) => n.includes("Overall Block symbol")), false);
    const indOnly = only({
      overallSymbol: false,
      overallDirection: false,
      overallIndication: true,
      overallType: false,
      overallIndicationType: false,
    });
    assert.ok(indOnly.some((n) => n.includes("Overall Block indication") && !n.includes("indication type")));
    assert.equal(indOnly.some((n) => n.includes("Overall Block type")), false);
    const bothOnly = only({
      overallSymbol: false,
      overallDirection: false,
      overallIndication: false,
      overallType: false,
      overallIndicationType: true,
    });
    assert.ok(bothOnly.some((n) => n.includes("Overall Block indication type")));
    assert.equal(bothOnly.some((n) => /Overall Block indication #/.test(n)), false);
    const all = only({
      overallSymbol: true,
      overallDirection: true,
      overallIndication: true,
      overallType: true,
      overallIndicationType: true,
    });
    assert.ok(all.some((n) => / shared #/.test(n)), "shared adjustment missing");
    assert.ok(all.some((n) => / additive #/.test(n)), "additive adjustment missing");
    const stacked = pos.qty + e.queue.reduce((s, o) => s + o.qty, 0);
    assert.ok(stacked <= pos.legs[0]!.qty * 8 + 1e-6, `stack ${stacked} over 8x ${pos.legs[0]!.qty}`);
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
