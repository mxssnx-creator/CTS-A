import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_BLOCK_CONFIG, MINIMAL_BLOCK, profitFactor } from "./engine.ts";
import { simulateHours } from "./vst.ts";

const close = (a: number, b: number, label: string) =>
  assert.ok(Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(b)), `${label}: ${a} != ${b}`);

for (const block of [false, true]) test(`scored execution statistics reconcile with every own close; Block=${block}`, () => {
  const cfg = { ...DEFAULT_TACTIC_CONFIG, minimalRange: true, shortRange: false, tpAtr: 3,
    slOfTp: 1.5, maxHoldTicks: 36, maxHoldBars: 2 };
  const { engine, report } = simulateHours(24, cfg, "axis", { symbolCount: 12, prehours: 24,
    equity: 1000, rangeType: "atr", marks: [24], block: { ...DEFAULT_BLOCK_CONFIG, ...MINIMAL_BLOCK },
    strategyToggles: { normal: true, trailing: true, axis: true, block, dca: false } });
  const rows = engine.closed.filter(row => row.tick > 24 * 60 && !row.playbook?.startsWith("bot:"));
  assert.ok(rows.length > 0);
  assert.ok(engine.closed.length > rows.length, "fixture must contain excluded prehistory");
  assert.ok(engine.closed.length < 600, "oracle must retain the whole scored tape");
  const gp = rows.reduce((sum, row) => sum + Math.max(0, row.ratio!), 0);
  const gl = rows.reduce((sum, row) => sum + Math.max(0, -row.ratio!), 0);
  close(report.pf, profitFactor(gp, gl), "all-execution PF");
  close(report.returnProfit, gp, "return profit");
  close(report.returnLoss, gl, "return loss");
  close(report.realizedNet, rows.reduce((sum, row) => sum + row.pnl, 0), "settled cash");
  close(report.net, report.equity - report.startEquity, "marked net");
  close(report.hourly.reduce((sum, row) => sum + row.net, 0), report.realizedNet, "hourly settled cash");
  assert.equal(report.trades, rows.length);
  assert.equal(report.settledSlices, rows.length);
  assert.equal(report.bySymbol.reduce((sum, row) => sum + row.trades, 0), rows.length);
  assert.equal(report.byIndication.reduce((sum, row) => sum + row.n, 0), rows.length);
  assert.equal(report.byTactic.reduce((sum, row) => sum + row.n, 0), rows.length);
  assert.equal(report.byKind.reduce((sum, row) => sum + row.n, 0), rows.length);
  assert.equal(report.hourly.reduce((sum, row) => sum + row.trades, 0), rows.length);
  assert.equal(report.ordersPlaced, report.hourly.reduce((sum, row) => sum + row.placed, 0));
  assert.equal(report.ordersFilled, report.hourly.reduce((sum, row) => sum + row.filled, 0));
  assert.equal(report.marks[0].trades, report.trades);
  close(report.marks[0].pf, report.pf, "final horizon PF");
  close(report.marks[0].net, report.net, "final horizon net");
  close(report.bySymbol.reduce((sum, row) => sum + row.net, 0), report.realizedNet, "symbol cash");
  for (const symbol of report.bySymbol) {
    const own = rows.filter(row => row.symbol === symbol.id);
    const p = own.reduce((sum, row) => sum + Math.max(0, row.ratio!), 0);
    const l = own.reduce((sum, row) => sum + Math.max(0, -row.ratio!), 0);
    close(symbol.pf, profitFactor(p, l), `symbol ${symbol.id} PF`);
  }
  assert.ok(report.mdd + 1e-12 >= Math.max(...report.curve.map(row => row.dd)), "maximum drawdown must retain recovered troughs");
  assert.ok(report.maxWinStreak <= rows.length && report.maxLossStreak <= rows.length);
});

test("a cold replay reports execution PF even when no selected subset qualifies", () => {
  const { engine, report } = simulateHours(2, DEFAULT_TACTIC_CONFIG, "trailing", { symbolCount: 4, prehours: 0 });
  const rows = engine.closed.filter(row => !row.playbook?.startsWith("bot:"));
  assert.ok(rows.length > 0 && rows.length < 600);
  const gp = rows.reduce((s, row) => s + Math.max(0, row.ratio!), 0);
  const gl = rows.reduce((s, row) => s + Math.max(0, -row.ratio!), 0);
  close(report.pf, profitFactor(gp, gl), "cold execution PF");
  close(report.net, report.equity - report.startEquity, "cold marked net");
});
