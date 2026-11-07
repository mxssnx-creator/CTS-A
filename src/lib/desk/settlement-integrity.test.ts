import assert from "node:assert/strict";
import { test } from "node:test";
import { closePnl, positionNetRatio, DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { initVstEngine, tickVst } from "./vst.ts";
import type { LivePosition } from "./types.ts";

function fixture(side: "long" | "short", hourKeep: boolean) {
  const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: false, maxHoldTicks: 10000, dcaCount: 0 };
  const e = initVstEngine(cfg, { warmup: 0, symbolCount: 1, arm: false });
  e.running = true;
  e.completeSim = true;
  e.openCompleteTape = true;
  e.preEvalDone = true;
  e.tick = 100;
  e.positions = []; e.orders = []; e.queue = []; e.closed = [];
  e.strategyToggles = { normal: false, trailing: false, axis: false, block: false, dca: false };
  e.pfCoords = { hourKeep, bankWin: false, pairAdd: false, laneCool: false, winAgain: false };
  const symbol = Object.keys(e.quotes)[0];
  const p: LivePosition = {
    id: "owned-parent", connId: e.activeConnId, symbol, side,
    qty: 2, plannedQty: 2, avgEntry: 100, mark: 100,
    sl: side === "long" ? 99.5 : 100.5, tp: side === "long" ? 102 : 98,
    slDist: .5, tpDist: 2, realized: 0, unrealized: 0,
    legs: [{ orderId: "owned-fill", qty: 2, px: 100 }],
    controllingRange: "atr", rangeSpacing: .5, status: "open", openedTick: 1,
    tactic: "trailing", playbook: "normal", indication: "trend", validExec: true,
  };
  const q = e.quotes[symbol];
  q.px = side === "long" ? 99 : 101; q.lo = q.px; q.hi = q.px; q.open = q.px;
  e.positions = [p];
  return { e, p, q, cfg };
}

for (const side of ["long", "short"] as const) {
  for (const hourKeep of [false, true]) test(`${side} losing owned close remains measured with hourKeep=${hourKeep}`, () => {
    const { e, cfg } = fixture(side, hourKeep);
    tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true, skipMatch: true });
    const c = e.closed.find(x => x.id === "owned-parent");
    assert.ok(c, "owned position must settle");
    assert.equal(c.protect, undefined);
    assert.equal(c.validExec, true);
    assert.ok(c.pnl < 0 && c.ratio! < 0, "a red hour cannot turn a loss into breakeven");
    assert.equal(c.pnl, closePnl(side === "long" ? 1 : -1, c.entry, c.exit, c.qty));
    assert.equal(c.ratio, positionNetRatio(side === "long" ? 1 : -1, c.entry, c.exit));
    assert.equal(e.hourLive?.n, 1);
    assert.equal(e.hourLive?.l, -c.pnl);
    assert.equal(e.hourLive?.rl, -c.ratio!);
    assert.equal(e.ledger.lossStreak, 1);
    assert.equal(e.positions.length, 0);
  });
}

test("losing Block partial retains its fill economics and the parent stays independent", () => {
  const { e, p, q, cfg } = fixture("long", true);
  p.qty = p.plannedQty = 3; p.blockQty = 1; p.blockAvg = 100; p.blockTick = 1;
  p.sl = 98; p.slDist = 2; p.tp = 104; p.tpDist = 4;
  q.px = q.lo = q.hi = q.open = 99.5;
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true, skipMatch: true });
  const c = e.closed.find(x => x.playbook === "block");
  assert.ok(c, "overlay must settle at its own stop");
  assert.equal(c.qty, 1);
  assert.ok(c.exit < c.entry && c.pnl < 0 && c.ratio! < 0);
  assert.equal(c.protect, undefined);
  assert.equal(c.pnl, closePnl(1, c.entry, c.exit, c.qty));
  assert.equal(c.ratio, positionNetRatio(1, c.entry, c.exit));
  assert.equal(e.hourLive?.n, 1);
  assert.equal(e.hourLive?.l, -c.pnl);
  assert.equal(e.positions.length, 1);
  assert.equal(e.positions[0].qty, 2);
  assert.equal(e.positions[0].avgEntry, 100);
  assert.equal(e.positions[0].blockQty, 0);
});
