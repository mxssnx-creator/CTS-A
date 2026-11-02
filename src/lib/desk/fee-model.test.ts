import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_FEES, effectiveFees, modeledCost, modeledLegRates, sanitizeFees } from "./fees.ts";
import { closePnl, positionNetRatio, positionRtCost, getBacktest, positionsFrom, UNIT_NOTIONAL } from "./engine.ts";
import { parseAccountFees } from "./feed.server.ts";
import { defaultDeskSettings, sanitizeDeskSettings } from "./settings-sync.ts";
import { closePosition, initVstEngine, LIVE_RUN_CFG, simulateHours, syncLivePartials } from "./vst.ts";
import type { LivePosition } from "./types.ts";
import { defaultBotConfig, runBotBacktest } from "./bots.ts";

test("fee-relative slippage follows each leg's actual modeled liquidity and notional", () => {
  for (const [entryLiquidity, exitLiquidity, cost] of [
    ["taker", "taker", .00176], ["maker", "taker", .00143],
    ["taker", "maker", .00143], ["maker", "maker", .0011],
  ] as const) {
    const model = { ...DEFAULT_FEES, entryLiquidity, exitLiquidity }, rates = modeledLegRates(model);
    assert.equal(modeledCost(model), cost);
    for (const side of [1, -1]) {
      const entry = 100, exit = side === 1 ? 110 : 90, qty = 2;
      const fee = qty * (entry * rates.entry + exit * rates.exit);
      assert.ok(Math.abs(positionRtCost(entry, exit, qty, model) - fee) < 1e-12);
      assert.ok(Math.abs(closePnl(side, entry, exit, qty, model) - (20 - fee)) < 1e-12);
      assert.ok(Math.abs(positionNetRatio(side, entry, exit, model) - (20 - fee) / 200) < 1e-12);
    }
  }
  assert.ok(Number.isNaN(positionRtCost(100, 100, 1, { ...DEFAULT_FEES, makerBps: NaN })));
});

test("explicit account zero is retained and an unavailable rate uses saved fallback assumptions", () => {
  assert.deepEqual(parseAccountFees({ commission: { makerCommissionRate: "0", takerCommissionRate: ".0006" } }),
    { makerBps: 0, takerBps: 6 });
  assert.equal(parseAccountFees({ commission: { makerCommissionRate: "", takerCommissionRate: .0006 } }), null);
  assert.equal(effectiveFees(DEFAULT_FEES, { makerBps: 0, takerBps: 6 }).makerBps, 0);
  assert.deepEqual(effectiveFees(DEFAULT_FEES), DEFAULT_FEES);
  const custom = sanitizeFees({ makerBps: 2, takerBps: 7, slippageFeePct: 30, entryLiquidity: "maker", exitLiquidity: "taker" });
  assert.deepEqual(sanitizeDeskSettings({ ...defaultDeskSettings(), feeModel: custom }).feeModel, custom);
});

test("a held position keeps its captured fee assumptions when the model changes", () => {
  const e = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 4, arm: false });
  const original = { ...DEFAULT_FEES, entryLiquidity: "maker" as const }, changed = { ...DEFAULT_FEES, takerBps: 10 };
  const p: LivePosition = { id: "p", connId: e.activeConnId, symbol: "BTCUSDT", side: "long", qty: 1, plannedQty: 1,
    avgEntry: 100, mark: 100, sl: 99, tp: 101, slDist: 1, tpDist: 1, realized: 0, unrealized: 0,
    legs: [], controllingRange: "atr", rangeSpacing: 1, status: "open", openedTick: 0,
    tactic: "trailing", kind: "normal", playbook: "normal", validExec: true, feeModel: original };
  e.feeModel = changed;
  assert.ok(closePosition(e, p, 101, "tp"));
  assert.ok(Math.abs(e.closed[0].pnl - closePnl(1, 100, 101, 1, original)) < 1e-12);
});

test("fee-specific source tapes and position listings agree without contaminating the default tape", () => {
  const custom = { ...DEFAULT_FEES, takerBps: 14, entryLiquidity: "maker" as const };
  const normal = getBacktest("confluence", "BTCUSDT");
  const changed = getBacktest("confluence", "BTCUSDT", custom);
  assert.ok(changed.trades.length > 3);
  assert.deepEqual(changed.trades.map(t => [t.id, t.entry, t.exit]), normal.trades.map(t => [t.id, t.entry, t.exit]));
  assert.notEqual(changed.stats.net, normal.stats.net);
  const positions = positionsFrom("confluence", "BTCUSDT", "axis", "atr", 10, "closed", custom);
  for (let i = 0; i < positions.length; i++) {
    const t = changed.trades[i]!, p = positions[i]!;
    assert.ok(Math.abs(p.pnl - t.pnl * (p.entry * p.qty / UNIT_NOTIONAL)) < 1e-10);
  }
  assert.equal(getBacktest("confluence", "BTCUSDT"), normal);
  assert.equal(getBacktest("confluence", "BTCUSDT", custom), changed);
});

test("historical simulations carry their explicitly chosen fee model", () => {
  const custom = { ...DEFAULT_FEES, takerBps: 12, entryLiquidity: "maker" as const };
  const { engine } = simulateHours(.02, LIVE_RUN_CFG, "hybrid", { symbolCount: 1, feeModel: custom });
  assert.deepEqual(engine.feeModel, custom);
});

test("a position quantity snapshot does not create realized PnL from the mark", () => {
  const e = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 1, arm: false });
  const p: LivePosition = { id: "p", connId: e.activeConnId, symbol: "BTCUSDT", side: "long", qty: 2, plannedQty: 2,
    avgEntry: 100, mark: 100, sl: 99, tp: 101, slDist: 1, tpDist: 1, realized: 0, unrealized: 0,
    legs: [], controllingRange: "atr", rangeSpacing: 1, status: "open", openedTick: 0,
    tactic: "trailing", kind: "normal", playbook: "normal", validExec: true };
  e.positions = [p];
  const before = JSON.stringify(e.ledger);
  assert.equal(syncLivePartials(e, { positions: [{ symbol: p.symbol, side: p.side, qty: 1, mark: 110 }] }), 1);
  assert.equal(p.qty, 1);
  assert.equal(p.realized, 0);
  assert.equal(JSON.stringify(e.ledger), before);
  assert.equal(e.fills[0]?.pnlKnown, false);
  assert.equal(e.fills[0]?.priceKnown, false);
});

test("bot replay retains losing fills and applies the selected leg fee model", () => {
  const fees = { ...DEFAULT_FEES, entryLiquidity: "maker" as const, takerBps: 12 };
  const report = runBotBacktest(defaultBotConfig("sandwich"), 12, 20260922, fees);
  assert.ok(report.liveFills.length > 0);
  assert.ok(report.liveFills.some(f => f.pnl < 0), "losing fills must not disappear after their outcome is known");
  for (const f of report.liveFills) {
    assert.ok(Math.abs(f.cost - positionRtCost(f.entry, f.exit, f.qty, fees)) < 1e-10);
    assert.ok(Math.abs(f.pnl - closePnl(f.side, f.entry, f.exit, f.qty, fees)) < 1e-10);
  }
  assert.ok(Math.abs(report.liveStats.net - report.liveFills.reduce((n, f) => n + f.pnl, 0)) < 1e-8);
});
