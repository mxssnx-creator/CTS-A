import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_INTERVAL_STRATEGY, DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "./engine.ts";
import { adjustActiveBlocks, armUniverse, blockPfOk, blockRelationKeys, completeConfigSampleKey, evalBlockRelations, finishBaseEval, initVstEngine, liveShouldExecute, tickVst, winningRelVolume } from "./vst.ts";
import { sanitizeDeskSettings } from "./settings-sync.ts";
import type { BlockLaneState, LivePosition, LiveOrder } from "./types.ts";

const cfg = { ...DEFAULT_TACTIC_CONFIG, maxHoldTicks: 1000 };

test("Block qualification reads do not consume a pause without a settled parent", () => {
  const lane = { symbol: "BTCUSDT", side: "long" as const, baseQty: 1, baseEntry: 100,
    confirmedAdd: 0, satisfied: {}, pfRing: { 1: Array(8).fill(.01) }, parentPf: [],
    active: true, pauseRemaining: { 1: 2 }, heldFactor: {} };
  for (let i = 0; i < 50; i++) assert.equal(blockPfOk(lane, 1, DEFAULT_BLOCK_CONFIG, 1.01), false);
  assert.equal(lane.pauseRemaining[1], 2);
});

test("Set Block evaluation and pause windows retain explicit preferences", () => {
  const defaults = sanitizeDeskSettings(null).blockConfig;
  assert.deepEqual([defaults.setBlockLastN, defaults.setBlockPauseLastN], [8, 12]);
  const loaded = sanitizeDeskSettings({ blockConfig: { ...defaults, setBlockLastN: 2, setBlockPauseLastN: 90 } }).blockConfig;
  assert.deepEqual([loaded.setBlockLastN, loaded.setBlockPauseLastN], [3, 75]);
  const lane: BlockLaneState = { symbol: "BTCUSDT", side: "long", baseQty: 1, baseEntry: 100, confirmedAdd: 0,
    satisfied: {}, pfRing: { 1: [.1, .1, .1, .1, .1, -.1, -.1, -.1], 2: [.1, .1, .1] },
    parentPf: [], active: true, pauseRemaining: {}, heldFactor: {} };
  assert.equal(blockPfOk(lane, 1, defaults, 1.01), true);
  assert.equal(blockPfOk(lane, 1, loaded, 1.01), false);
  assert.equal(blockPfOk(lane, 2, loaded, 1.01), true);
});

test("a Block peel preserves the parent and settles only the filled count after restart", () => {
  let { e, parent, block } = fixture();
  const p = parent("split-parent", 2);
  Object.assign(p, { sl: 98, slDist: 2, tp: 104, tpDist: 4 });
  e.tick = 100; e.positions = [p];
  block = { ...block, stack: false, keepAdjusted: true }; e.blockCfg = block;
  adjustActiveBlocks(e, cfg, "trailing", block, "atr");
  e.queue = [];
  e.orders = [blockOrder(p, "Block additive", 3)];
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true });
  assert.ok((p.blockQty ?? 0) > 0);
  for (const lane of Object.values(e.blockLanes)) lane.pauseRemaining[1] = 2;
  e.tick += 1;
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
    assert.equal(lane.pauseRemaining[1], 1, "one complete parent consumes one pause step");
  }
  const byMode = Object.entries(e.blockLanes);
  const additive = byMode.find(([key]) => key.endsWith(":additive"))![1];
  const shared = byMode.find(([key]) => key.endsWith(":shared"))![1];
  assert.deepEqual(Object.keys(additive.pfRing), ["3"]);
  assert.ok(Math.abs(additive.pfRing[3][0]! - partial.ratio!) < 1e-12);
  assert.deepEqual(shared.pfRing, {});
});

test("Overall, Relate volume, pending and legacy pooled data cannot teach Set Block", () => {
  const { e, parent, block } = fixture();
  const p = parent("count-evidence", 2);
  e.tick = 100;
  e.positions = [p];
  adjustActiveBlocks(e, cfg, "trailing", block, "atr");
  for (const lane of Object.values(e.blockLanes)) {
    lane.countFills = undefined;
    lane.pfRing = { 1: [.1] };
    lane.pending = 2;
  }
  e.queue = [];
  e.orders = [blockOrder(p, "Overall Block shared", 4), blockOrder(p, "Block extra additive", 5)];
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true });
  assert.ok((p.blockQty ?? 0) > 0, "excluded orders actually filled");
  Object.assign(e.quotes.BTCUSDT, { px: 85, lo: 85, hi: 85, open: 85 });
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true, skipMatch: true });
  assert.equal(e.positions.length, 0);
  for (const lane of Object.values(e.blockLanes)) assert.deepEqual(lane.pfRing, {});
});

function blockOrder(p: LivePosition, tag: string, level: number): LiveOrder {
  return { id: `${p.id}:${level}`, connId: p.connId, symbol: p.symbol, side: p.side,
    type: "market", qty: .1, filled: 0, remaining: .1, price: 100, status: "open",
    rangeType: "atr", level, sl: p.sl, tp: p.tp, slDist: p.slDist, tpDist: p.tpDist,
    batchId: `${p.id}:book:${level}`, parentPositionId: p.id, note: `${tag} #${level}`,
    indication: p.indication, tactic: p.tactic, kind: "block", playbook: "block", validExec: true };
}
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

test("parallel Set Block qualifies each mode with its own capped expansion", () => {
  const { e, parent, block } = fixture();
  const modes = { ...block, overall: false, minRelPf: 1.1, sharedVolumeRatio: 1.5, volumeRatio: .4 };
  e.positions = [parent("volume-proof", 1)];
  adjustActiveBlocks(e, cfg, "trailing", { ...modes, stack: false }, "atr");
  for (const lane of Object.values(e.blockLanes)) {
    lane.pfRing[1] = [.0115, .0115, .0115, .0115, -.01, -.01, -.01, -.01];
  }
  adjustActiveBlocks(e, cfg, "trailing", modes, "atr");
  assert.ok(e.queue.some((o) => o.note.startsWith("Block additive")));
  assert.ok(!e.queue.some((o) => o.note.startsWith("Block shared")));
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


test("Block children retain each exact price-grid parent and its frozen economics", () => {
  const { e, parent, block } = fixture();
  const first = parent("grid-first", 1), second = parent("grid-second", 1);
  Object.assign(first, { tpAtr: .6, slOfTp: .4, trailPct: .2, priceStopPct: .2, priceTrailPct: .2,
    trailingDistance: "fixed", microRange: false, minimalRange: false, shortRange: true,
    modelRtCost: .00176, minSlDistancePct: .3 });
  Object.assign(second, { tpAtr: .6, slOfTp: .4, trailPct: .2, priceStopPct: .3, priceTrailPct: .3,
    trailingDistance: undefined, microRange: false, minimalRange: false, shortRange: true,
    modelRtCost: .00176, minSlDistancePct: .3 });
  e.positions = [first, second];
  adjustActiveBlocks(e, cfg, "trailing", block, "atr");

  const children = e.positions.map(p => e.queue.filter(order => order.parentPositionId === p.id));
  assert.ok(children.every(orders => orders.length === 4));
  for (const [index, orders] of children.entries()) {
    const p = e.positions[index];
    assert.ok(orders.every(order => completeConfigSampleKey(order)));
    for (const order of orders) assert.deepEqual({
      stop: order.priceStopPct, gap: order.priceTrailPct, mode: order.trailingDistance,
      short: order.shortRange, cost: order.modelRtCost, minStop: order.minSlDistancePct,
    }, {
      stop: p.priceStopPct, gap: p.priceTrailPct, mode: p.trailingDistance,
      short: p.shortRange, cost: p.modelRtCost, minStop: p.minSlDistancePct,
    });
  }
  assert.notEqual(completeConfigSampleKey(children[0][0]), completeConfigSampleKey(children[1][0]),
    "different exact price cells cannot share Block evaluation identity");

  const restored = JSON.parse(JSON.stringify(e));
  assert.deepEqual(
    restored.queue.map((order: LiveOrder) => completeConfigSampleKey(order)),
    e.queue.map(order => completeConfigSampleKey(order)),
    "restart preserves every Block child identity",
  );
});


test("Block relation config keys isolate every native stop-gap and trailing-mode cell", () => {
  const base = { symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const,
    kind: "short", tactic: "trailing" as const, rangeType: "atr" as const,
    playbook: "short", tpAtr: .6, slOfTp: .4, trailPct: .2,
    microRange: false, minimalRange: false, shortRange: true,
    modelRtCost: .00176, minSlDistancePct: .3, calc: "base" as const };
  const cfg = (priceStopPct: number, priceTrailPct: number, trailingDistance?: "fixed") =>
    blockRelationKeys({ ...base, priceStopPct, priceTrailPct, trailingDistance } as Parameters<typeof blockRelationKeys>[0])
      .find(key => key.startsWith("cfg:"));

  assert.notEqual(cfg(.2, .2, "fixed"), cfg(.3, .2, "fixed"), "21 stop cells need own relation evaluations");
  assert.notEqual(cfg(.2, .2, "fixed"), cfg(.2, .3, "fixed"), "25 gap cells need own relation evaluations");
  assert.notEqual(cfg(.2, .2, "fixed"), cfg(.2, .2), "fixed and dynamic trailing cannot pool evidence");
});


test("exact Block relation winners are independently re-evaluated on the current interval", () => {
  const { e, block } = fixture();
  e.tick = 100;
  e.intervalStrategy = { ...DEFAULT_INTERVAL_STRATEGY, scaleVol: false, relationHaircut: .4, relationKeepPf: .85 };
  const exact = (priceStopPct: number) => ({
    symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const, kind: "short",
    tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short",
    tpAtr: .6, slOfTp: .4, trailPct: .2, trailingDistance: "fixed" as const,
    priceStopPct, priceTrailPct: .2, calc: "base", microRange: false,
    minimalRange: false, shortRange: true, modelRtCost: .00176, minSlDistancePct: .3,
  });
  const losing = exact(.2), winning = exact(.3);
  const cfgKey = (rel: ReturnType<typeof exact>) =>
    blockRelationKeys(rel).find(key => key.startsWith("cfg:"))!;
  const window = { n: 3, ring: [], closed: 3, pauseLeft: 0, lastNet: .03,
    lastAvg: .01, lastPf: 2, windows: 1, lossWindows: 0, adjusted: 0,
    losers: [], batchNets: [.03] };
  e.blockRelWindows = {
    [cfgKey(losing)]: { 3: { ...window } },
    [cfgKey(winning)]: { 3: { ...window } },
  } as typeof e.blockRelWindows;
  e.closed = [
    ...[1, 2, 3].map((n) => ({ ...losing, id: `loss-${n}`, connId: e.activeConnId,
      pnl: -.01, ratio: -.01, qty: 1, entry: 100, exit: 99, reason: "sl" as const,
      tick: 90 + n, at: 90 + n, r: -.01, validExec: true })),
    ...[1, 2, 3].map((n) => ({ ...winning, id: `win-${n}`, connId: e.activeConnId,
      pnl: .01, ratio: .01, qty: 1, entry: 100, exit: 101, reason: "tp" as const,
      tick: 90 + n, at: 90 + n, r: .01, validExec: true })),
  ] as typeof e.closed;

  const relationBlock = { ...block, relAdditive: true, minRelPf: 1.1, evalLastNs: [3], relVolumeRatio: .4 };
  e.blockCfg = relationBlock;
  evalBlockRelations(e, relationBlock);
  assert.equal(winningRelVolume(e, losing), 0, "a recently losing exact cell cannot retain its stale winner");
  assert.ok(winningRelVolume(e, winning) > 0, "the independently profitable sibling remains eligible");
});


test("Block current-interval relation scoring excludes selection-only and rejected exact rows", () => {
  const { e, block } = fixture();
  e.tick = 100;
  e.preEvalDone = true;
  e.intervalStrategy = { ...DEFAULT_INTERVAL_STRATEGY, scaleVol: false, relationHaircut: .4, relationKeepPf: .85 };
  const exact = (priceStopPct: number) => ({
    symbol: "BTCUSDT", side: "long" as const, indication: "trend" as const, kind: "short",
    tactic: "trailing" as const, rangeType: "atr" as const, playbook: "short",
    tpAtr: .6, slOfTp: .4, trailPct: .2, trailingDistance: "fixed" as const,
    priceStopPct, priceTrailPct: .2, calc: "base", microRange: false,
    minimalRange: false, shortRange: true, modelRtCost: .00176, minSlDistancePct: .3,
  });
  const contaminated = exact(.2), clean = exact(.3);
  const cfgKey = (rel: ReturnType<typeof exact>) =>
    blockRelationKeys(rel).find(key => key.startsWith("cfg:"))!;
  const window = { n: 3, ring: [], closed: 3, pauseLeft: 0, lastNet: .03,
    lastAvg: .01, lastPf: 2, windows: 1, lossWindows: 0, adjusted: 0,
    losers: [], batchNets: [.03] };
  e.blockRelWindows = {
    [cfgKey(contaminated)]: { 3: { ...window } },
    [cfgKey(clean)]: { 3: { ...window } },
  } as typeof e.blockRelWindows;
  const close = (rel: ReturnType<typeof exact>, id: string, tick: number, ratio: number,
    validExec: boolean, examFlat = false) => ({ ...rel, id, connId: e.activeConnId,
      pnl: ratio, ratio, qty: 1, entry: 100, exit: ratio > 0 ? 101 : 99,
      reason: (ratio > 0 ? "tp" : "sl") as "tp" | "sl", tick, at: tick, r: ratio,
      validExec, examFlat: examFlat || undefined });
  e.closed = [
    ...[91, 92, 93].map(tick => close(contaminated, `held-loss-${tick}`, tick, -.01, true)),
    ...[94, 95, 96].map(tick => close(contaminated, `selection-win-${tick}`, tick, .1, true, true)),
    ...[97, 98, 99].map(tick => close(contaminated, `rejected-win-${tick}`, tick, .1, false)),
    ...[91, 92, 93].map(tick => close(clean, `held-win-${tick}`, tick, .01, true)),
  ] as typeof e.closed;
  const relationBlock = { ...block, relAdditive: true, minRelPf: 1.1, evalLastNs: [3], relVolumeRatio: .4 };
  e.blockCfg = relationBlock;

  evalBlockRelations(e, relationBlock);
  assert.equal(winningRelVolume(e, contaminated), 0,
    "selection-only and rejected wins cannot rescue a losing held-out exact cell");
  assert.ok(winningRelVolume(e, clean) > 0, "a profitable held-out sibling remains eligible");
});


test("a validated Axis parent marks its derived Block child executable", () => {
  const exactCfg = {
    ...DEFAULT_TACTIC_CONFIG,
    shortRange: true,
    tpAtr: .6,
    slOfTp: .5,
  };
  const e = initVstEngine(exactCfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.strategyToggles = {
    ...DEFAULT_STRATEGY_TOGGLES,
    normal: true,
    trailing: false,
    axis: true,
    block: true,
    dca: false,
  };

  armUniverse(e, exactCfg, "axis", "atr");
  const first = [...e.orders, ...e.queue].find(order =>
    order.tactic === "axis" &&
    order.playbook === "axis");
  assert.ok(first, "the Axis parent must be discovered before Base");

  e.tick = 100;
  e.closed = Array.from({ length: 60 }, (_, i) => ({
    ...first,
    id: `axis-exact-${i}`,
    pnl: 1,
    ratio: .01,
    entry: first.price,
    exit: first.price * (first.side === "long" ? 1.012 : .988),
    reason: "tp" as const,
    tick: 99 - i,
    r: 1,
    validExec: false,
  }));
  e.queue = [];
  e.orders = [];
  e.positions = [];
  finishBaseEval(e);
  e.closed = [];

  armUniverse(e, exactCfg, "axis", "atr");
  const after = [...e.orders, ...e.queue];
  const parent = after.find(order =>
    order.tactic === "axis" &&
    order.playbook === "axis" &&
    order.calc === first.calc &&
    order.symbol === first.symbol &&
    order.side === first.side &&
    order.indication === first.indication &&
    order.tpAtr === first.tpAtr &&
    order.slOfTp === first.slOfTp);
  assert.ok(parent?.validExec, "the Axis parent passed its own frozen Base evidence");

  const child = after.find(order =>
    order.tactic === "axis" &&
    order.playbook === "block" &&
    order.kind === "block" &&
    order.calc === parent.calc &&
    order.symbol === parent.symbol &&
    order.side === parent.side &&
    order.indication === parent.indication &&
    order.tpAtr === parent.tpAtr &&
    order.slOfTp === parent.slOfTp);
  assert.ok(child, "the eligible exact parent must create its Block child");
  assert.equal(child.validExec, true, "the child inherits the parent’s own exact verdict, not the coarse pre-geometry placeholder");
  assert.ok(completeConfigSampleKey(child), "the child keeps the complete configuration evidence identity");
  assert.equal(liveShouldExecute(e, child), false, "the parent tape cannot bypass the child’s independent gate");
  e.closed = Array.from({ length: 60 }, (_, i) => ({
    ...child,
    id: `axis-block-child-${i}`,
    pnl: 1,
    ratio: .01,
    entry: child.price,
    exit: child.price * (child.side === "long" ? 1.012 : .988),
    reason: "tp" as const,
    tick: 99 - i,
    r: 1,
    validExec: true,
  }));
  assert.equal(liveShouldExecute(e, child), true, "the child passes only after its own held-out tape qualifies");
  assert.equal(liveShouldExecute(e, { ...child, slOfTp: (child.slOfTp ?? .5) + .25 }), false,
    "an unevaluated sibling child cannot borrow the winner’s evidence");
});
