import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "./engine.ts";
import { adjustActiveBlocks, blockPfOk, initVstEngine, tickVst } from "./vst.ts";
import type { LivePosition, LiveOrder } from "./types.ts";

const cfg = { ...DEFAULT_TACTIC_CONFIG, maxHoldTicks: 1000 };

test("Block qualification reads do not consume a pause without a settled parent", () => {
  const lane = { symbol: "BTCUSDT", side: "long" as const, baseQty: 1, baseEntry: 100,
    confirmedAdd: 0, satisfied: {}, pfRing: { 1: Array(8).fill(.01) }, parentPf: [],
    active: true, pauseRemaining: { 1: 2 }, heldFactor: {} };
  for (let i = 0; i < 50; i++) assert.equal(blockPfOk(lane, 1, DEFAULT_BLOCK_CONFIG, 1.01), false);
  assert.equal(lane.pauseRemaining[1], 2);
});

test("Block partials preserve the parent lane and count one notional-weighted result after restart", () => {
  let { e, parent, block } = fixture();
  const p = parent("split-parent", 3);
  Object.assign(p, { blockQty: 1, blockAvg: 100, blockTick: 1, blockLevel: 1,
    sl: 98, slDist: 2, tp: 104, tpDist: 4 });
  p.legs = [{ orderId: "base:split-parent", qty: 2, px: 100 }, { orderId: "add", qty: 1, px: 100 }];
  e.tick = 100; e.positions = [p];
  block = { ...block, stack: false, keepAdjusted: true }; e.blockCfg = block;
  adjustActiveBlocks(e, cfg, "trailing", block, "atr");
  for (const lane of Object.values(e.blockLanes)) { lane.satisfied[1] = true; lane.pauseRemaining[1] = 2; }
  Object.assign(e.quotes.BTCUSDT, { px: 99.5, lo: 99.5, hi: 99.5, open: 99.5 });
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true, skipMatch: true });
  assert.equal(e.positions.length, 1);
  assert.equal(e.positions[0].qty, 2);
  const partial = e.closed.find((c) => c.playbook === "block")!;
  assert.ok(partial && partial.pnl < 0);
  for (const lane of Object.values(e.blockLanes)) {
    assert.equal(lane.active, true, "a partial cannot retire a still-open parent");
    assert.equal(lane.parentPf.length, 0, "one partial is not a complete parent sample");
    assert.equal(lane.pauseRemaining[1], 2);
  }
  e = JSON.parse(JSON.stringify(e));
  Object.assign(e.quotes.BTCUSDT, { px: 97, lo: 97, hi: 97, open: 97 });
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true, skipMatch: true });
  const final = e.closed.find((c) => c.id === "split-parent")!;
  assert.ok(final);
  const expected = (partial.pnl + final.pnl) / (partial.qty * partial.entry + final.qty * final.entry);
  for (const lane of Object.values(e.blockLanes)) {
    assert.equal(lane.active, false);
    assert.equal(lane.parentPf.length, 1);
    assert.ok(Math.abs(lane.parentPf[0]! - expected) < 1e-12);
    assert.equal(lane.pfRing[1].length, 1);
    assert.equal(lane.pauseRemaining[1], 1, "one complete parent consumes one pause step");
  }
});
function fixture() {
  const e = initVstEngine(cfg, { warmup: 0, symbolCount: 3, arm: false, equity: 10000 });
  e.queue = []; e.orders = []; e.positions = []; e.fills = [];
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, block: true, trailing: true };
  e.preEvalDone = false;
  e.liveTape = false;
  const q = e.quotes.BTCUSDT;
  Object.assign(q, { px: 100, lo: 100, hi: 100, vol: .02, atr: 1 });
  const parent = (id: string, qty: number, indication: "trend" | "break" = "trend"): LivePosition => ({
    id, connId: e.activeConnId, symbol: "BTCUSDT", side: "long", qty, plannedQty: qty,
    avgEntry: 100, mark: 100, sl: 90, tp: 130, slDist: 10, tpDist: 30,
    realized: 0, unrealized: qty * .1, legs: [{ orderId: `base:${id}`, qty, px: 100 }],
    controllingRange: "atr", rangeSpacing: 1, status: "open", openedTick: 0,
    tactic: "trailing", indication, kind: "short", playbook: "short", validExec: true,
  });
  const block = { ...DEFAULT_BLOCK_CONFIG, enabled: true, sets: true, overall: true,
    windows: false, stack: true, addOnWin: false, endStageOnly: false, counts: [1],
    volumeMode: "parallel" as const, overallMode: "parallel" as const,
    volumeRatio: .4, sharedVolumeRatio: .5, overallVolumeRatio: .5,
    overallSymbol: false, overallDirection: false, overallIndication: false,
    overallType: false, overallIndicationType: false, relAdditive: false,
    maxVolumeMultiplier: 2.5, maxMultiple: 6, minMultiple: 1, minActiveLevel: 1 };
  e.blockCfg = block;
  return { e, parent, block };
}

test("Block fills target the explicit parent even when a sibling has identical protection", () => {
  for (const [explicit, note] of [[true, "Block additive #1"], [false, "Block additive #1"], [true, ""]] as const) {
    const { e, parent } = fixture();
    e.positions = [parent("sibling", 1), parent("owned:parent:2", 2)];
    if (!note) Object.assign(e.quotes.BTCUSDT, { px: 101, lo: 101, hi: 101 });
    const order: LiveOrder = { id: "block-fill", connId: e.activeConnId, symbol: "BTCUSDT", side: "long",
      type: "market", qty: .1, filled: 0, remaining: .1, price: 100, status: "open", rangeType: "atr",
      level: 1, sl: 90, tp: 130, slDist: 10, tpDist: 30,
      batchId: "owned:parent:2:book:1", note, tactic: "trailing",
      indication: "trend", kind: "block", playbook: "block", validExec: true,
      ...(explicit ? { parentPositionId: "owned:parent:2" } : {}),
    };
    e.orders = [order];
    tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true });
    assert.equal(e.positions[0].qty, 1, "an identical sibling must not receive the addition");
    assert.ok(e.positions[1].qty > 2, "the exact parent receives the measured fill");
    assert.ok(e.positions[1].legs.some((l) => l.orderId === order.id));
    assert.ok((e.positions[1].blockQty ?? 0) > 0, "parent identity remains authoritative when display text is absent");
    assert.equal(e.positions[1].sl, 90, "a Block fill retains the parent's bracket");
  }
});

test("an absent Block parent cannot fall back to another configuration", () => {
  const { e, parent } = fixture(); e.positions = [parent("sibling", 1)];
  e.orders = [{ id: "orphan", connId: e.activeConnId, symbol: "BTCUSDT", side: "long", type: "market",
    qty: .1, filled: 0, remaining: .1, price: 100, status: "open", rangeType: "atr", level: 1,
    sl: 90, tp: 130, slDist: 10, tpDist: 30, batchId: "missing:book:1", parentPositionId: "missing",
    note: "Block additive #1", tactic: "trailing", indication: "trend", kind: "block", playbook: "block" }];
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true });
  assert.equal(e.positions[0].qty, 1);
  assert.equal(e.orders[0].filled, 0);
  assert.equal(e.orders[0].status, "cancelled");
  assert.equal(e.fills.length, 0, "no fabricated orphan fill is recorded");
});

test("two own configs keep independent Block levels, parent quantities and bounded parallel streams", () => {
  const { e, parent, block } = fixture();
  e.positions = [parent("one", 1, "trend"), parent("two", 3, "break")];
  adjustActiveBlocks(e, cfg, "trailing", block, "atr");
  const perParent = e.positions.map((p) => e.queue.filter((o) => o.parentPositionId === p.id));
  for (const [i, orders] of perParent.entries()) {
    assert.equal(orders.length, 4, "each parent gets relation/Overall × Shared/Additive");
    assert.equal(new Set(orders.map((o) => o.note.split(" #")[0])).size, 4);
    const qty = orders.reduce((n, o) => n + o.qty, 0);
    assert.ok(qty > 0 && qty <= e.positions[i].legs[0].qty * 1.5 + 1e-12);
  }
  const totals = perParent.map((orders) => orders.reduce((n, o) => n + o.qty, 0));
  assert.ok(Math.abs(totals[1] / totals[0] - 3) < 1e-12);
  assert.equal(Object.values(e.blockLanes).filter((l) => l.active).length, 4);
  const before = e.queue.length;
  adjustActiveBlocks(e, cfg, "trailing", block, "atr");
  assert.equal(e.queue.length, before, "repeated processing cannot duplicate pending levels");
});

test("Overall mode is available independently of the per-set Block mode", () => {
  const { e, parent, block } = fixture(); e.positions = [parent("own", 1)];
  const independent = { ...block, volumeMode: "shared" as const, overallMode: "additive" as const };
  e.blockCfg = independent;
  adjustActiveBlocks(e, cfg, "trailing", independent, "atr");
  assert.ok(e.queue.some((o) => o.note.startsWith("Block shared")));
  assert.ok(e.queue.some((o) => o.note.startsWith("Overall Block additive")));
  assert.ok(!e.queue.some((o) => o.note.startsWith("Block additive") || o.note.startsWith("Overall Block shared")));
});

test("a parent close cancels its own additions and preserves a sibling's working Block order", () => {
  const { e, parent } = fixture(); e.tick = 100;
  const first = parent("closed:parent", 1), second = parent("held:parent", 2);
  first.sl = 96; // Its own tightened stop; the sibling retains the original stop.
  e.positions = [first, second];
  Object.assign(e.quotes.BTCUSDT, { px: 95, lo: 95, hi: 95 });
  e.orders = e.positions.map((p) => ({ id: `pending:${p.id}`, connId: p.connId, symbol: p.symbol,
    side: p.side, type: "limit", qty: .1, filled: 0, remaining: .1, price: 1, status: "open",
    rangeType: "atr", level: 1, sl: .9, tp: 1.3, slDist: .1, tpDist: .3,
    parentPositionId: p.id, batchId: `${p.id}:book:1`, note: "Block additive #1",
    tactic: "trailing", indication: "trend", kind: "block", playbook: "block" }));
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true });
  assert.equal(e.orders.find((o) => o.parentPositionId === first.id)?.status, "cancelled");
  assert.equal(e.orders.find((o) => o.parentPositionId === second.id)?.status, "open");
  assert.ok(e.positions.some((p) => p.id === second.id && p.qty === 2));
});

test("original partial entry slices all contribute to base volume and survive a restart", () => {
  const { e, parent, block } = fixture();
  const p = parent("split", 3);
  p.legs = [{ orderId: "original", qty: 1, px: 100 }, { orderId: "original", qty: 2, px: 100 }];
  e.positions = [p];
  adjustActiveBlocks(e, cfg, "trailing", block, "atr");
  for (const lane of Object.values(e.blockLanes).filter((l) => l.active)) assert.equal(lane.baseQty, 3);
  const restored = JSON.parse(JSON.stringify(e));
  const before = restored.queue.length;
  adjustActiveBlocks(restored, cfg, "trailing", block, "atr");
  assert.equal(restored.queue.length, before);
  assert.deepEqual(restored.queue.map((o: LiveOrder) => o.parentPositionId), e.queue.map((o) => o.parentPositionId));
});

test("maxMultiple limits each step, not the number of independent Overall scopes", () => {
  const { e, parent, block } = fixture(); e.positions = [parent("own", 1)];
  const scopes = { ...block, maxMultiple: 1, overallSymbol: true, overallDirection: true,
    overallIndication: true, overallType: true, overallIndicationType: true };
  adjustActiveBlocks(e, cfg, "trailing", scopes, "atr");
  const ids = e.queue.map((o) => o.id);
  assert.equal(ids.length, 14, "six Overall scopes plus per-set × two modes");
  adjustActiveBlocks(e, cfg, "trailing", scopes, "atr");
  assert.deepEqual(e.queue.map((o) => o.id), ids, "valid step-one orders survive repeated adjustment");
  assert.ok(e.queue.every((o) => o.level === 1));
});

test("disabling Normal only cancels the active connection's own orders", () => {
  const { e } = fixture(); e.strategyToggles!.normal = false;
  const order = (id: string, connId: string): LiveOrder => ({ id, connId, symbol: "BTCUSDT",
    side: "long", type: "limit", qty: 1, filled: 0, remaining: 1, price: 1, status: "open",
    rangeType: "atr", level: 1, sl: .9, tp: 1.1, slDist: .1, tpDist: .1,
    batchId: id, note: "Normal", tactic: "trailing", indication: "trend", playbook: "short" });
  e.orders = [order("own", e.activeConnId), order("other-desk", "bingx-vst-01"), order("external", "external")];
  e.queue = e.orders.map((o) => ({ ...o, id: `q:${o.id}`, status: "queued" }));
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true, skipMatch: true });
  assert.equal(e.orders.find((o) => o.id === "own")?.status, "cancelled");
  for (const id of ["other-desk", "external"]) {
    assert.equal(e.orders.find((o) => o.id === id)?.status, "open");
    assert.ok(e.queue.some((o) => o.id === `q:${id}` && o.status === "queued"));
  }
});

test("an explicit symbol-side conflict cancels every owned group on the losing side", () => {
  const { e, parent, block } = fixture();
  const one = parent("one", 1), two = parent("two", 1, "break"), short = parent("short", 1);
  one.unrealized = two.unrealized = -1; short.side = "short"; short.unrealized = 1;
  e.positions = [one, two, short];
  e.queue = e.positions.flatMap((p) => ["shared", "additive"].map((mode): LiveOrder => ({
    id: `${p.id}:${mode}`, connId: p.connId, symbol: p.symbol, side: p.side, type: "limit",
    qty: .1, filled: 0, remaining: .1, price: 100, status: "queued", rangeType: "atr", level: 1,
    sl: 90, tp: 130, slDist: 10, tpDist: 30, parentPositionId: p.id,
    batchId: `${p.id}:book:1`, note: `Block ${mode} #1`, kind: "block", playbook: "block",
  })));
  adjustActiveBlocks(e, cfg, "trailing", { ...block, stack: false, flattenConflict: true, sides: "long" }, "atr");
  assert.equal(e.queue.length, 2);
  assert.ok(e.queue.every((o) => o.parentPositionId === short.id));
});
