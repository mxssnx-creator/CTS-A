/**
 * Live-book regression for breakpoint stable-0929.
 * A position is one symbol+direction. Extra internal rows are orders.
 * The cap of 100 blocks a new signal only. Orders are not capped by it.
 * Run: npm run test:stable
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { allShortTpSlCombos, SHORT_SL_OF_TP, SHORT_TP_ATR, snapShortSlOfTp, snapShortTpAtr } from "./engine.ts";
import {
  LIVE_MAX_POSITIONS,
  buildControlParams,
  countPositionSlots,
  countWorkingOrders,
  exchangeOrderId,
  isDeskClientOrderId,
  liveEntryBudget,
  makeClientOrderId,
  placedOrderId,
} from "./feed.ts";
import { defaultBotsPersist, sanitizeArmed } from "./bots.ts";
import { findPreset, STABLE_PRESET_ID } from "./presets.ts";
import type { LiveOrder, LivePosition, Side } from "./types.ts";
import {
  auditEngine,
  bookCounts,
  enqueueManual,
  healEngine,
  initVstEngine,
  LIVE_RUN_CFG,
  sanitizeBook,
  tickVst,
} from "./vst.ts";
import { lockDeskSettings } from "../../../scripts/lock-desk-settings.mjs";

const CONN = "bingx-x01";

function liveEngine() {
  const e = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 8, arm: false, equity: 100, costStep: 18 });
  e.activeConnId = CONN;
  e.liveTape = true;
  e.running = true;
  e.phase = "running";
  e.botMode = false;
  e.queue = [];
  e.orders = [];
  e.positions = [];
  e.strategyToggles = { normal: true, trailing: true, axis: true, block: false, dca: false };
  return e;
}

function slot(id: string, symbol: string, side: Side, extra: Partial<LivePosition> = {}): LivePosition {
  const entry = 100;
  const slDist = 1;
  const tpDist = slDist / 0.75;
  return {
    id,
    connId: CONN,
    symbol,
    side,
    qty: 1,
    plannedQty: 1,
    avgEntry: entry,
    mark: entry,
    sl: side === "long" ? entry - slDist : entry + slDist,
    tp: side === "long" ? entry + tpDist : entry - tpDist,
    slDist,
    tpDist,
    realized: 0,
    unrealized: 0,
    legs: [{ orderId: id, qty: 1, px: entry }],
    controllingRange: "atr",
    rangeSpacing: 1,
    status: "open",
    openedTick: 0,
    tactic: "trailing",
    indication: "ema",
    playbook: "short",
    kind: "short",
    tpAtr: 0.48,
    slOfTp: 0.75,
    validExec: true,
    ...extra,
  };
}

function market(id: string, symbol: string, side: Side, px: number, extra: Partial<LiveOrder> = {}): LiveOrder {
  const slDist = 1;
  const tpDist = slDist / 0.75;
  return {
    id,
    connId: CONN,
    symbol,
    side,
    type: "market",
    qty: 0.2,
    filled: 0,
    remaining: 0.2,
    price: px,
    status: "open",
    rangeType: "atr",
    level: 1,
    sl: side === "long" ? px - slDist : px + slDist,
    tp: side === "long" ? px + tpDist : px - tpDist,
    slDist,
    tpDist,
    batchId: "",
    note: "regression",
    indication: "ema",
    playbook: "short",
    tactic: "trailing",
    validExec: true,
    ...extra,
  };
}

function fillSignals(e: ReturnType<typeof liveEngine>, n = LIVE_MAX_POSITIONS) {
  const symbols = Object.keys(e.quotes);
  const rows: LivePosition[] = [];
  let i = 0;
  while (rows.length < n) {
    const symbol = symbols[i % symbols.length]!;
    const side: Side = rows.length % 2 === 0 ? "long" : "short";
    const key = `${symbol}:${side}`;
    if (!rows.some((p) => `${p.symbol}:${p.side}` === key)) rows.push(slot(`p${rows.length}`, symbol, side));
    i += 1;
    if (i > symbols.length * 4) break;
  }
  let k = 0;
  while (rows.length < n) {
    rows.push(slot(`d${k}`, `DUMMY${k}`, k % 2 === 0 ? "long" : "short"));
    k += 1;
  }
  e.positions = rows.slice(0, n);
  return e;
}

describe("stable-0929 live book", () => {
  it("matches the breakpoint pins", () => {
    const mark = JSON.parse(readFileSync(new URL("../../../docs/breakpoints/stable-0929.json", import.meta.url), "utf8"));
    assert.equal(mark.id, "stable-0929");
    assert.equal(mark.signals.cap, 100);
    assert.equal(mark.signals.key, "symbol+direction");
    assert.equal(mark.orders.cap, null);
    assert.deepEqual(mark.bots.armed, []);
    assert.equal(mark.bots.autoStart, false);
    assert.equal(mark.minPf, 1.15);
    assert.equal(mark.maxDdtHours, 14);
    assert.equal(mark.costStep, 18);
    assert.equal(STABLE_PRESET_ID, "stable-12h-0928");
    const preset = findPreset(STABLE_PRESET_ID, []);
    assert.equal(preset?.patch.tacticConfig?.tpAtr, mark.shortCell.tpAtr);
    assert.equal(preset?.patch.tacticConfig?.slOfTp, mark.shortCell.slOfTp);
    assert.equal(preset?.patch.strategyToggles?.dca, false);
    assert.equal(LIVE_MAX_POSITIONS, mark.signals.cap);
    const session = readFileSync(new URL("../../../scripts/cts-a-vst-session.mjs", import.meta.url), "utf8");
    assert.match(session, /const LIVE_MIN_PF = IS_X01\s*\?\s*1\.15/);
    assert.match(session, /const LIVE_MAX_DDT = IS_X01 \? 14/);
    assert.match(session, /costStep: IS_X01 \? 18/);
    assert.match(session, /if \(nextSlots > held && nextSlots > budget\.maxPos\) continue/);
    assert.match(session, /fillJobs\.length >= 8\) break/);
    assert.match(session, /return q \+ 1e-9 >= Number\(qty\) \* 0\.92/);
    assert.match(session, /let triggerQuietUntil = 0/);
    assert.match(session, /const postCap = missingN > 0 \? Math\.min\(2, missingN \* 2\) : 0/);
    assert.match(session, /if \(protectGapNow === 0 && !apiQuiet\(\) && !triggerQuiet\(\) && STRAT\.trailing\)/);
    const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    assert.doesNotMatch(store, /get\(\)\.runLiveBots\(\)/);
    assert.match(store, /botsRunning: false/);
    assert.match(store, /botByConn: emptyBotByConn\(\)/);
    assert.match(store, /const activeConnId = connLocked && isDeskConn\(get\(\)\.activeConnId\) \? get\(\)\.activeConnId : snap\.activeConnId/);
    assert.match(store, /connLocked = true/);
  });

  it("counts one position per symbol and direction and every partial as an order", () => {
    const rows = [
      { symbol: "BTCUSDT", side: "long" as const },
      { symbol: "BTCUSDT", side: "long" as const },
      { symbol: "BTCUSDT", side: "short" as const },
      { symbol: "ETHUSDT", side: "short" as const },
    ];
    const slots = countPositionSlots(rows);
    assert.equal(slots.slots, 3);
    assert.equal(slots.long, 1);
    assert.equal(slots.short, 2);
    const orders = countWorkingOrders([
      { status: "open" },
      { status: "partial" },
      { status: "PARTIALLY_FILLED" },
      { status: "filled" },
      { status: "cancelled" },
    ]);
    assert.equal(orders.n, 3);
    assert.equal(orders.partial, 2);
    const e = liveEngine();
    e.positions = [
      slot("a", "BTCUSDT", "long"),
      slot("b", "BTCUSDT", "long", { tpAtr: 0.5, slOfTp: 1 }),
      slot("c", "BTCUSDT", "long", { tpAtr: 0.55, slOfTp: 1.25 }),
      slot("d", "BTCUSDT", "short"),
    ];
    e.orders = [market("o1", "BTCUSDT", "long", 100, { status: "partial", filled: 0.1, remaining: 0.1 })];
    const book = bookCounts(e);
    assert.equal(book.positions.slots, 2);
    assert.equal(book.positions.long, 1);
    assert.equal(book.positions.short, 1);
    assert.equal(book.positions.legs, 4);
    assert.equal(book.orders.internal, 4);
    assert.equal(book.orders.partial, 1);
    assert.equal(book.orders.live, book.orders.queued + book.orders.working + 4);
    assert.equal(liveEntryBudget(90).maxPos, 100);
    assert.equal(liveEntryBudget(0.2).maxPos, 100);
  });

  it("blocks only a new signal at 100 and keeps internal rows and extra orders", () => {
    const e = fillSignals(liveEngine());
    const held = e.positions[0]!;
    for (let i = 0; i < 40; i += 1) {
      e.positions.push(slot(`x${i}`, held.symbol, held.side, { tpAtr: 0.5, slOfTp: 1 + (i % 5) * 0.25 }));
    }
    const rows = e.positions.length;
    assert.ok(rows > LIVE_MAX_POSITIONS);
    assert.equal(bookCounts(e).positions.slots, LIVE_MAX_POSITIONS);
    sanitizeBook(e);
    assert.equal(e.positions.length, rows);
    healEngine(e, LIVE_RUN_CFG, "hybrid");
    assert.equal(e.positions.length, rows);
    const again = enqueueManual(e, { connId: CONN, symbol: held.symbol, side: held.side, type: "limit", cost: 18 });
    assert.match(again, /Queued/);
    assert.equal(bookCounts(e).positions.slots, LIVE_MAX_POSITIONS);
    const fresh = Object.keys(e.quotes).find((id) => !e.positions.some((p) => p.symbol === id));
    assert.ok(fresh);
    const blocked = enqueueManual(e, { connId: CONN, symbol: fresh!, side: "long", type: "limit", cost: 18 });
    assert.match(blocked, /Signal cap 100/);
    assert.equal(bookCounts(e).positions.slots, LIVE_MAX_POSITIONS);
    assert.equal(auditEngine(e).issues.includes("Signal cap exceeded"), false);
    tickVst(e, LIVE_RUN_CFG, "trailing", { bookOnly: true, skipMatch: true });
    assert.equal(e.stats.positions, LIVE_MAX_POSITIONS);
    assert.ok(e.stats.openOrders >= rows);
  });

  it("fills another lane on an open signal and does not open a 101st", () => {
    const e = fillSignals(liveEngine());
    const held = e.positions.find((p) => e.quotes[p.symbol])!;
    const px = e.quotes[held.symbol]!.px;
    const before = e.positions.length;
    const slots = bookCounts(e).positions.slots;
    e.orders = [
      market("lane", held.symbol, held.side, px, { tpAtr: 0.6, slOfTp: 2.5, qty: 0.05, remaining: 0.05 }),
    ];
    tickVst(e, LIVE_RUN_CFG, "trailing", { bookOnly: true });
    assert.doesNotMatch(e.lastMsg, /Signal cap/);
    assert.equal(bookCounts(e).positions.slots, slots);
    assert.ok(e.positions.length >= before);
    const newbie = Object.keys(e.quotes).find((id) => !e.positions.some((p) => p.symbol === id) && !e.orders.some((o) => o.symbol === id));
    assert.ok(newbie);
    const refused = enqueueManual(e, { connId: CONN, symbol: newbie!, side: "short", type: "market", cost: 18 });
    assert.match(refused, /Signal cap 100/);
    assert.equal(bookCounts(e).positions.slots, slots);
  });

  it("does not trim x01 working orders down to the signal cap", () => {
    const e = liveEngine();
    const symbol = Object.keys(e.quotes)[0]!;
    const px = e.quotes[symbol]!.px;
    e.positions = [slot("only", symbol, "long")];
    e.orders = Array.from({ length: 180 }, (_, i) =>
      market(`w${i}`, symbol, "long", px, { type: "limit", status: "open", qty: 0.01, remaining: 0.01 }),
    );
    sanitizeBook(e);
    tickVst(e, LIVE_RUN_CFG, "trailing", { bookOnly: true, skipMatch: true });
    assert.equal(e.orders.length, 180);
    assert.equal(bookCounts(e).positions.slots, 1);
    assert.equal(e.stats.positions, 1);
    assert.ok(e.stats.openOrders >= 180);
  });

  it("keeps the short grid and the geometric cell on it", () => {
    const combos = allShortTpSlCombos();
    assert.equal(combos.length, SHORT_TP_ATR.length * SHORT_SL_OF_TP.length);
    assert.equal(snapShortTpAtr(0.48), 0.48);
    assert.equal(snapShortSlOfTp(0.75), 0.75);
    assert.ok(combos.some((c) => c.tpAtr === 0.48 && c.slOfTp === 0.75));
    assert.ok(SHORT_SL_OF_TP.every((r, i) => i === 0 || r - SHORT_SL_OF_TP[i - 1]! === 0.25));
  });

  it("tracks exchange order ids and control params", () => {
    const a = makeClientOrderId(CONN, "E");
    const b = makeClientOrderId(CONN, "S");
    assert.notEqual(a, b);
    assert.ok(isDeskClientOrderId(a, CONN));
    assert.ok(a.startsWith("CTSAX1_E"));
    assert.equal(exchangeOrderId("12.5"), "");
    assert.equal(exchangeOrderId("BTCUSDT:STOP"), "");
    assert.equal(exchangeOrderId(0), "");
    assert.equal(exchangeOrderId("991122"), "991122");
    assert.equal(placedOrderId({ order: { orderId: "4455" } }), "4455");
    assert.equal(placedOrderId({ orders: [{ orderID: 77 }] }), "77");
    const stop = buildControlParams({ type: "STOP_MARKET", quantity: 3, closePosition: true, reduceOnly: true, stopPrice: 10 });
    assert.equal(stop.closePosition, "true");
    assert.equal(stop.quantity, 3);
    assert.equal(stop.reduceOnly, undefined);
    assert.equal(stop.stopPrice, 10);
  });

  it("does not let a settings post or a host snap move the chosen connection", () => {
    const dir = mkdtempSync(join(tmpdir(), "cts-lock-"));
    const dest = join(dir, "desk-settings.json");
    writeFileSync(dest, JSON.stringify({
      locked: true,
      activeConnId: CONN,
      minPf: 1.15,
      costStep: 18,
      symbolCount: 50,
      liveSymbolCap: 50,
      thresholds: { minPf: 1.15, maxDdt: 14 },
      strategyToggles: { normal: true, trailing: true, axis: true, block: false, dca: false },
    }));
    const locked = lockDeskSettings({
      activeConnId: "bingx-vst-02",
      minPf: 1,
      costStep: 3,
      symbolCount: 12,
      thresholds: { minPf: 1, maxDdt: 22 },
      strategyToggles: { dca: true, block: true },
    }, dest);
    assert.equal(locked.activeConnId, CONN);
    assert.equal(locked.minPf, 1.15);
    assert.equal(locked.costStep, 18);
    assert.equal(locked.symbolCount, 50);
    assert.equal(locked.thresholds.maxDdt, 14);
    assert.equal(locked.strategyToggles.dca, false);
    assert.equal(locked.strategyToggles.block, false);
    assert.equal(defaultBotsPersist().armed.length, 0);
    assert.deepEqual(sanitizeArmed([]), []);
    assert.deepEqual(sanitizeArmed(["nope"]), []);
    assert.deepEqual(sanitizeArmed(["sandwich", "clamp", "pivot", "magnet"]), ["sandwich", "clamp", "pivot"]);
  });
});
