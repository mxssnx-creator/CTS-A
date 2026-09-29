/**
 * Stable reference. Repair from git tags `stable` and `breakpoint-0929`.
 * The tape cell is still preset `stable-12h-0928` (geometric short 0.48/0.75).
 * The 2026-09-29 breakpoint locks the live book: 100 signals, unlimited orders.
 * Run: npm run test:stable
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPreset, STABLE_PRESET_ID } from "./presets.ts";
import { LIVE_MAX_POSITIONS, countPositionSlots, countWorkingOrders } from "./feed.ts";
import {
  initVstEngine,
  LIVE_RUN_CFG,
  liveShouldExecute,
  rankIndications,
  rankTactics,
  tickVst,
  armUniverse,
  VST_DEFAULT_CONN,
} from "./vst.ts";

const PACK = {
  trend: 0.1,
  ema: 0.9,
  break: 0.1,
  active: 0.1,
  direction: 0.1,
  move: 0,
  rsi: 0,
  bollinger: 0,
  sar: 0,
  macd: 0,
  agree: true,
  activity: 0.2,
  lastPart: 0,
  drawdown: 0,
  prevRel: 0,
};

function engine() {
  const e = initVstEngine(LIVE_RUN_CFG, { warmup: 2, symbolCount: 4, arm: false, equity: 10, costStep: 3 });
  e.completeSim = true;
  e.preEvalDone = true;
  e.shortRange = true;
  e.running = true;
  e.queue = [];
  e.orders = [];
  e.positions = [];
  e.strategyToggles = { normal: true, trailing: true, axis: true, block: true, dca: true };
  return e;
}

function seedLong(e: ReturnType<typeof engine>, drop: number, range: "atr" | "volume" | "linear") {
  const symbol = Object.keys(e.quotes)[0]!;
  const q = e.quotes[symbol]!;
  const entry = q.px;
  q.px = entry * drop;
  q.lo = Math.min(q.lo, q.px * 0.998);
  q.hi = Math.max(q.hi, entry);
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
    controllingRange: range,
    rangeSpacing: q.atr || entry * 0.01,
    status: "open" as const,
    openedTick: 0,
    tactic: "trailing" as const,
    indication: "ema" as const,
    playbook: "short",
    kind: "short" as const,
    calc: "px" as const,
    tpAtr: 0.48,
    slOfTp: 1,
    validExec: true,
  };
  e.positions = [pos];
  e.activeConnId = pos.connId;
  return pos;
}

describe("stable reference", () => {
  it("keeps the 09-29 signal breakpoint", () => {
    assert.equal(LIVE_MAX_POSITIONS, 100);
    const slots = countPositionSlots([
      { symbol: "BTCUSDT", side: "long" },
      { symbol: "BTCUSDT", side: "long" },
      { symbol: "BTCUSDT", side: "short" },
    ]);
    assert.equal(slots.slots, 2);
    assert.equal(slots.long, 1);
    assert.equal(slots.short, 1);
    const orders = countWorkingOrders([
      { status: "open" },
      { status: "partial" },
      { status: "filled" },
    ]);
    assert.equal(orders.n, 2);
    assert.equal(orders.partial, 1);
  });

  it("points the stable preset at the 12h geometric tape", () => {
    assert.equal(STABLE_PRESET_ID, "stable-12h-0928");
    const preset = findPreset(STABLE_PRESET_ID, []);
    assert.ok(preset);
    assert.equal(preset!.patch.tactic, "hybrid");
    assert.equal(preset!.patch.rangeType, "geometric");
    assert.equal(preset!.patch.tacticConfig?.tpAtr, 0.48);
    assert.equal(preset!.patch.tacticConfig?.slOfTp, 0.75);
    assert.equal(preset!.patch.tacticConfig?.slAtr, 0.36);
    assert.equal(preset!.patch.strategyToggles?.normal, true);
    assert.equal(preset!.patch.strategyToggles?.axis, true);
    assert.equal(preset!.patch.strategyToggles?.block, true);
    assert.equal(preset!.patch.strategyToggles?.trailing, true);
    assert.equal(preset!.patch.strategyToggles?.dca, false);
    assert.equal(preset!.patch.pfCoords?.hourKeep, true);
    assert.equal(preset!.patch.pfCoords?.bankWin, true);
    assert.equal(preset!.patch.pfCoords?.pairAdd, true);
    assert.equal(preset!.patch.pfCoords?.laneCool, true);
    assert.equal(preset!.patch.pfCoords?.winAgain, true);
    assert.equal(preset!.patch.symbolCount, 50);
    assert.ok((preset!.info?.pf ?? 0) >= 2);
    assert.equal(preset!.info?.winHoursPct, 1);
  });

  it("arms the higher profit factor first after the base exam", () => {
    const e = engine();
    e.progressEval = {
      indications: {
        trend: { n: 12, pf: 2.4, net: 1, ok: true },
        ema: { n: 12, pf: 1.05, net: 0.1, ok: true },
      },
      tactics: {
        trailing: { n: 12, pf: 2.2, net: 1, ok: true },
        axis: { n: 12, pf: 1.1, net: 0.1, ok: true },
      },
    } as typeof e.progressEval;
    assert.equal(rankIndications(e, PACK, "ema")[0], "trend");
    assert.equal(rankTactics(e, "axis")[0], "trailing");
  });

  it("does not execute a set that has not passed the base exam", () => {
    const e = engine();
    e.liveTape = true;
    e.completeSim = false;
    e.openCompleteTape = false;
    e.lastNCoord = { combos: {} } as typeof e.lastNCoord;
    assert.equal(
      liveShouldExecute(e, {
        symbol: "BTCUSDT",
        side: "long",
        tactic: "trailing",
        playbook: "short",
        kind: "short",
        indication: "trend",
        rangeType: "atr",
        tpAtr: 0.48,
        slOfTp: 1,
      }),
      false,
    );
    e.preEvalDone = false;
    e.completeSim = true;
    e.liveTape = false;
    assert.equal(
      liveShouldExecute(e, {
        symbol: "BTCUSDT",
        side: "long",
        tactic: "dca",
        playbook: "dca",
        kind: "short",
        indication: "trend",
        rangeType: "atr",
      }),
      true,
    );
  });

  it("adds DCA inside the stop on ATR and linear, and never on volume", () => {
    const atr = engine();
    seedLong(atr, 0.98, "atr");
    tickVst(atr, LIVE_RUN_CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    assert.ok([...atr.queue, ...atr.orders].some((o) => /^DCA/.test(o.note)));

    const linear = engine();
    seedLong(linear, 0.98, "linear");
    tickVst(linear, LIVE_RUN_CFG, "trailing", { skipWalk: true, rangeType: "linear" });
    assert.ok([...linear.queue, ...linear.orders].some((o) => /^DCA/.test(o.note)));

    const volume = engine();
    seedLong(volume, 0.98, "volume");
    tickVst(volume, LIVE_RUN_CFG, "trailing", { skipWalk: true, rangeType: "volume" });
    assert.equal([...volume.queue, ...volume.orders].some((o) => /^DCA/.test(o.note)), false);

    const deep = engine();
    seedLong(deep, 0.955, "atr");
    tickVst(deep, LIVE_RUN_CFG, "trailing", { skipWalk: true, rangeType: "atr" });
    assert.equal([...deep.queue, ...deep.orders].some((o) => /^DCA/.test(o.note)), false);
  });

  it("keeps the base axis ladder and adds prev, last, continuous, and pause sets on every range", () => {
    const e = initVstEngine({ ...LIVE_RUN_CFG, shortRange: false }, { warmup: 2, symbolCount: 4, arm: false, equity: 10, costStep: 3 });
    e.completeSim = false;
    e.preEvalDone = false;
    e.liveTape = false;
    e.shortRange = false;
    e.running = true;
    e.queue = [];
    e.orders = [];
    e.positions = [];
    e.lastTactic = "axis";
    e.strategyToggles = { normal: true, trailing: true, axis: true, block: true, dca: true };
    const symbol = Object.keys(e.quotes)[0]!;
    const q = e.quotes[symbol]!;
    const atr = Math.max(q.atr, q.px * 0.0025);
    q.atr = atr;
    q.axis = q.px;
    q.px = q.axis - atr;
    q.lo = q.px - atr * 0.3;
    q.hi = q.axis + atr * 0.4;
    const cfg = { ...LIVE_RUN_CFG, shortRange: false as const };
    armUniverse(e, cfg, "axis", "atr");
    const axisOrders = [...e.queue, ...e.orders].filter((o) => o.tactic === "axis" || o.playbook === "axis");
    const calcs = new Set(axisOrders.map((o) => o.calc));
    assert.ok(axisOrders.some((o) => o.calc === "base" || o.level >= 1), `base axis missing ${axisOrders.length}`);
    for (const phase of ["ax-prev", "ax-last", "ax-pause"] as const) {
      const rows = axisOrders.filter((o) => o.calc === phase);
      assert.ok(rows.length >= 3, `${phase} sets ${rows.length}`);
      assert.ok(new Set(rows.map((o) => o.rangeType)).size >= 3, `${phase} ranges`);
    }
    assert.ok(calcs.has("base") || axisOrders.some((o) => !String(o.calc || "").startsWith("ax-")));

    e.closed.unshift({
      id: "loss",
      connId: e.activeConnId || VST_DEFAULT_CONN,
      symbol,
      side: "long",
      qty: 1,
      entry: q.axis,
      exit: q.px,
      pnl: -1,
      reason: "sl",
      tick: e.tick,
      playbook: "axis",
      tactic: "axis",
      indication: "ema",
      calc: "ax-pause",
      rangeType: "atr",
    } as (typeof e.closed)[number]);
    e.queue = [];
    e.orders = [];
    armUniverse(e, cfg, "axis", "atr");
    const again = [...e.queue, ...e.orders].filter((o) => o.playbook === "axis" || o.tactic === "axis");
    assert.ok(again.some((o) => o.calc === "ax-prev" || o.calc === "ax-last" || o.calc === "ax-pause"));
  });

  it("keeps trailing on and DCA off on the stable book", () => {
    const e = engine();
    e.preEvalDone = false;
    e.liveTape = false;
    e.strategyToggles = { normal: true, trailing: true, axis: true, block: true, dca: false };
    const rel = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const, rangeType: "geometric" as const, kind: "short" as const };
    assert.equal(liveShouldExecute(e, { ...rel, tactic: "trailing", playbook: "short" }), true);
    assert.equal(liveShouldExecute(e, { ...rel, tactic: "dca", playbook: "dca" }), false);
    assert.equal(liveShouldExecute(e, { ...rel, tactic: "axis", playbook: "axis", kind: "axis" }), true);
  });

  it("keeps the retired DCA preset available but not marked", () => {
    const old = findPreset("stable-dca-0927", []);
    assert.ok(old);
    assert.notEqual(STABLE_PRESET_ID, old!.id);
    assert.equal(old!.patch.strategyToggles?.dca, true);
    assert.equal(findPreset(STABLE_PRESET_ID, [])!.patch.strategyToggles?.dca, false);
  });
});
