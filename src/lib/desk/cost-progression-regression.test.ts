import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_EQUITY, buildBlocks, closePnl, getBacktest, positionNetRatio, positionNotional,
  positionRtCost, positionsFrom, posSliceStats, POSITION_RT_COST_PCT, UNIT_NOTIONAL } from "./engine.ts";
import { closePosition, peelBlockOverlay, engageLiveBook, initVstEngine, LIVE_RUN_CFG } from "./vst.ts";
import type { LivePosition } from "./types.ts";

function fixture(playbook: string, side: "long" | "short"): { engine: ReturnType<typeof initVstEngine>; position: LivePosition } {
  const engine = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 4, arm: false, equity: 10, costStep: 3 });
  engageLiveBook(engine); engine.tick = 10;
  const position: LivePosition = { id: `${playbook}-${side}`, connId: engine.activeConnId, symbol: "BTCUSDT", side,
    qty: 1, plannedQty: 1, avgEntry: 100, mark: 100, sl: side === "long" ? 99 : 101,
    tp: side === "long" ? 101 : 99, slDist: .01, tpDist: 1, realized: 0, unrealized: 0,
    legs: [{ orderId: "entry", qty: 1, px: 100 }], controllingRange: "atr", rangeSpacing: 1, status: "open",
    openedTick: 1, tactic: playbook === "axis" ? "axis" : "trailing", kind: "short", indication: "trend",
    playbook, validExec: true, tpAtr: 1, slOfTp: 1 };
  engine.positions.push(position);
  return { engine, position };
}

for (const playbook of ["normal", "short", "axis", "block"]) for (const side of ["long", "short"] as const)
test(`${playbook}/${side}: actual modeled loss, price and cost survive hour coordination and flow into stats`, () => {
  const { engine, position } = fixture(playbook, side), exit = side === "long" ? 90 : 110, sign = side === "long" ? 1 : -1;
  // This loss would have been silently capped and rewritten to a breakeven scratch by hourKeep.
  const expectedPnl = closePnl(sign, 100, exit, 1), expectedRatio = positionNetRatio(sign, 100, exit);
  closePosition(engine, position, exit, "sl");
  const row = engine.closed[0];
  assert.ok(row); assert.equal(row.entry, 100); assert.equal(row.exit, exit);
  assert.equal(row.pnl, expectedPnl); assert.equal(row.ratio, expectedRatio);
  assert.equal(row.validExec, true); assert.notEqual(row.protect, true);
  assert.ok(expectedPnl < -10, "both modeled fee legs are deducted from the actual loss");
  assert.equal(engine.ledger.trades, 1); assert.equal(engine.ledger.loss, -expectedPnl);
  assert.equal(engine.symbolStats.BTCUSDT.loss, -expectedPnl);
  assert.equal(engine.hourLive?.n, 1); assert.equal(engine.hourLive?.l, -expectedPnl);
  assert.equal(engine.fills[0].px, exit); assert.equal(engine.fills[0].pnl, expectedPnl);
});

test("Block partial close retains a losing overlay with its own modeled cost and actual exit", () => {
  const { engine, position } = fixture("short", "long");
  position.qty = 2; position.plannedQty = 2; position.blockQty = 1; position.blockAvg = 100; position.blockTick = 1;
  position.slDist = 1; position.tpDist = 1;
  const q = engine.quotes.BTCUSDT; Object.assign(q, { px: 99.7, lo: 99.7, hi: 100 });
  peelBlockOverlay(engine, position, q);
  const row = engine.closed[0];
  assert.ok(row); assert.equal(row.playbook, "block"); assert.equal(row.entry, 100); assert.equal(row.exit, 99.8);
  assert.ok(Math.abs(row.pnl - closePnl(1, 100, 99.8, 1)) < 1e-12);
  assert.ok(row.pnl < 0); assert.notEqual(row.protect, true); assert.equal(position.qty, 1);
  assert.equal(POSITION_RT_COST_PCT, .00176);
});

test("missing prices or fees never become a zero-cost close or remove its held position", () => {
  assert.ok(Number.isNaN(positionRtCost(100, 100, 1, NaN)));
  assert.ok(Number.isNaN(positionRtCost(100, 100, 1, -.001)));
  assert.ok(Number.isNaN(positionRtCost(100, 100, 1, null as unknown as number)));
  assert.equal(positionRtCost(100, 100, 1, 0), 0, "a deliberately zero modeled cost stays zero");
  assert.ok(Number.isNaN(closePnl(1, 0, 100, 1)));
  assert.ok(Number.isNaN(closePnl(0, 100, 101, 1)));
  assert.ok(Number.isNaN(closePnl(1, 100, 101, 1, null as unknown as number)));
  assert.ok(Number.isNaN(positionNetRatio(1, 100, 0)));
  assert.ok(Number.isNaN(positionNetRatio(0, 100, 101)));
  assert.ok(Number.isNaN(positionNetRatio(1, 100, 101, null as unknown as number)));
  const { engine, position } = fixture("axis", "long");
  assert.equal(closePosition(engine, position, NaN, "sl"), false);
  assert.equal(engine.positions.includes(position), true);
  assert.equal(engine.closed.length, 0); assert.equal(engine.ledger.trades, 0);
  assert.equal(position.sl, 99); assert.equal(position.tp, 101);
});

test("position and Block listings reconcile source closes, cost-aware ratios and configured notional", () => {
  const source = getBacktest("confluence", "BTCUSDT").trades;
  assert.ok(source.length > 3);
  assert.deepEqual(new Set(source.map(t => t.side)), new Set(["long", "short"]));
  for (const step of [3, 10, 30]) {
    const notional = positionNotional(BASE_EQUITY, step);
    const closed = positionsFrom("confluence", "BTCUSDT", "axis", "atr", step, "closed");
    assert.equal(closed.length, source.length - 3);
    for (let i = 0; i < closed.length; i++) {
      const p = closed[i], t = source[i], side = t.side === "long" ? 1 : -1;
      assert.equal(p.id, t.id);
      assert.ok(Math.abs(p.qty * p.entry - notional) < 1e-9);
      assert.ok(Math.abs(p.pnl - closePnl(side, p.entry, p.mark, p.qty)) < 1e-10);
      assert.ok(Math.abs(p.pnl - t.pnl * notional / UNIT_NOTIONAL) < 1e-10);
      assert.ok(Math.abs(p.pnlPct - positionNetRatio(side, p.entry, p.mark)) < 1e-10);
    }
    const expectedNet = closed.reduce((n, p) => n + p.pnl, 0);
    assert.ok(Math.abs(posSliceStats(closed).net - expectedNet) < 1e-10);
    assert.ok(Math.abs(buildBlocks(closed).reduce((n, b) => n + b.net, 0) - expectedNet) < 1e-10);
    for (const p of positionsFrom("confluence", "BTCUSDT", "axis", "atr", step, "all").filter(p => p.status !== "closed")) {
      assert.ok(Math.abs(p.qty * p.entry - notional) < 1e-9);
      if (p.status === "open") assert.ok(Math.abs(p.pnlPct - p.pnl / notional) < 1e-10);
    }
  }
});
