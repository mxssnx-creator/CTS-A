import assert from "node:assert/strict";
import { test } from "node:test";
import { clearBotCache, defaultBotConfig, runBotBacktest } from "./bots.ts";

test("bot replay retains admitted losses and reconciles executed PF from every close", () => {
  clearBotCache();
  const report = runBotBacktest(defaultBotConfig("sandwich"), 12, 20260922);
  const profit = report.liveFills.filter((fill) => fill.pnl > 0).reduce((sum, fill) => sum + fill.pnl, 0);
  const loss = -report.liveFills.filter((fill) => fill.pnl < 0).reduce((sum, fill) => sum + fill.pnl, 0);
  const net = report.liveFills.reduce((sum, fill) => sum + fill.pnl, 0);

  assert.ok(report.liveFills.some((fill) => fill.pnl < 0), "losses cannot be removed after close");
  assert.ok(report.hourly.some((hour) => !hour.empty && !hour.green), "red hours remain observable");
  assert.equal(report.liveStats.n, report.liveFills.length);
  assert.ok(Math.abs(report.liveStats.profit - profit) < 1e-10);
  assert.ok(Math.abs(report.liveStats.loss - loss) < 1e-10);
  assert.ok(Math.abs(report.liveStats.net - net) < 1e-10);
  assert.ok(Math.abs(report.liveStats.pf - profit / loss) < 1e-10);
  assert.equal(report.hourly.reduce((sum, hour) => sum + hour.n, 0), report.liveFills.length);
  assert.ok(Math.abs(report.hourly.reduce((sum, hour) => sum + hour.net, 0) - net) < 1e-10);
});

