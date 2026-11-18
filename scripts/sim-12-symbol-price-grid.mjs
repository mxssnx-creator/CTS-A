#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { DEFAULT_TACTIC_CONFIG } from "../src/lib/desk/engine.ts";
import { STOP_DISTANCE_PCTS, TRAIL_DISTANCE_PCTS } from "../src/lib/desk/price-distance-grid.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const selectionHours = 6;
const validationHours = 6;
const symbols = 12;
const cfg = {
  ...DEFAULT_TACTIC_CONFIG,
  microRange: true,
  minimalRange: false,
  shortRange: false,
  tpAtr: .3,
  slOfTp: 1,
  maxHoldTicks: 12,
  maxHoldBars: 3,
  priceDistanceGrid: {
    enabled: true,
    stopPcts: [...STOP_DISTANCE_PCTS],
    trailPcts: [...TRAIL_DISTANCE_PCTS],
  },
};

const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
const { report, engine } = simulateHours(validationHours, cfg, "trailing", {
  symbolCount: symbols,
  rangeType: "atr",
  equity: 10,
  costStep: 3,
  complete: false,
  prehours: selectionHours,
  orderType: "limit",
  strategyToggles: { normal: true, trailing: true, axis: false, block: false, dca: false },
});
const elapsedMs = performance.now() - started;
const heapAfter = process.memoryUsage().heapUsed;
const retained = engine.closed.filter(row => !row.examFlat);
const candidates = retained.filter(row => row.validExec === true);
const exact = retained.filter(row => row.priceStopPct != null);
const distinct = new Set(retained.map(row =>
  `${row.symbol}:${row.side}:${row.tick - Math.max(0, Number(row.holdTicks) || 0)}`));
const costs = [...new Set(retained.map(row => row.modelRtCost).filter(Number.isFinite).map(row => Number(row).toFixed(8)))];
const pfOf = rows => {
  let gp = 0, gl = 0;
  for (const row of rows) {
    const value = Number(row.ratio);
    if (!Number.isFinite(value)) continue;
    if (value > 0) gp += value;
    else gl -= value;
  }
  return gl > 0 ? gp / gl : gp > 0 ? 9 : 0;
};
const failures = [...(report.issues ?? [])];
if (report.pf < 1) failures.push("validation_after_cost_pf_below_one");
if (!(report.trades > 0)) failures.push("no_post_selection_executions");
const missingLineage = exact.filter(row => row.priceTrailPct == null).length;
if (missingLineage) failures.push(`missing_exact_lineage:${missingLineage}`);
const evidence = {
  revision: process.env.GITHUB_SHA ?? "local",
  mode: "offline-paper-replay",
  selectionPeriod: { startHour: 0, endHourExclusive: selectionHours, purpose: "selection-only prehistory" },
  validationPeriod: { startHour: selectionHours, endHourExclusive: selectionHours + validationHours, purpose: "held-out validation" },
  symbols,
  requestedCatalog: { stops: STOP_DISTANCE_PCTS.length, gaps: TRAIL_DISTANCE_PCTS.length, trailingModes: 2, trailingCells: STOP_DISTANCE_PCTS.length * TRAIL_DISTANCE_PCTS.length * 2 },
  modeledCosts: { costStep: 3, roundTripRates: costs },
  results: {
    selectionSettlements: report.pre?.trades ?? null,
    modeledValidationSettlements: report.settledSlices ?? report.trades,
    retainedCombinedSettlements: retained.length,
    exactCombinedSettlements: exact.length,
    candidateRows: candidates.length,
    fixedCandidateRows: candidates.filter(row => row.trailingDistance === "fixed").length,
    dynamicCandidateRows: candidates.filter(row => row.trailingDistance !== "fixed").length,
    executedValidationSettlements: report.trades,
    distinctCombinedSymbolSideEntryTime: distinct.size,
    validationAfterCostPf: report.pf,
    retainedCombinedAfterCostPf: pfOf(retained),
    candidateAfterCostPf: pfOf(candidates),
    net: report.net,
    drawdown: report.mdd,
    ordersPlaced: report.ordersPlaced,
    ordersFilled: report.ordersFilled,
    capRejects: report.capRejects,
    rateSkips: report.rateSkips,
    slExits: report.slExits,
    tpExits: report.tpExits,
  },
  performance: {
    elapsedMs: Number(elapsedMs.toFixed(3)),
    heapBeforeBytes: heapBefore,
    heapAfterBytes: heapAfter,
    heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
  },
  failures,
};
assert.equal(report.symbols, symbols);
assert.equal(STOP_DISTANCE_PCTS.length, 21);
assert.equal(TRAIL_DISTANCE_PCTS.length, 25);
assert.equal(missingLineage, 0, "every exact trailing settlement must retain its gap");
assert.equal(report.nanCount, 0);
assert.equal(report.negativePx, 0);

mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/cts-a-price-grid-replay.json", JSON.stringify({ ...evidence, hourly: report.hourly ?? [] }, null, 2));
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>CTS-A exact price grid replay</title>
<style>body{font:14px/1.45 system-ui;margin:28px;background:#0b1220;color:#dbeafe}table{border-collapse:collapse}th,td{padding:7px 12px;border-bottom:1px solid #334155;text-align:right}th:first-child,td:first-child{text-align:left}.bad{color:#fca5a5}.ok{color:#86efac}pre{white-space:pre-wrap}</style></head><body>
<h1>CTS-A · native 21-stop × 25-gap held-out replay</h1>
<p>Offline paper only. Hours 0–${selectionHours} select; hours ${selectionHours}–${selectionHours + validationHours} validate without re-selection. Cost step 3 is captured on every settlement.</p>
<table><tbody>
<tr><th>After-cost PF</th><td class="${report.pf >= 1 ? "ok" : "bad"}">${report.pf.toFixed(4)}</td></tr>
<tr><th>Drawdown</th><td>${(report.mdd * 100).toFixed(3)}%</td></tr>
<tr><th>Modeled validation settlements</th><td>${evidence.results.modeledValidationSettlements}</td></tr>
<tr><th>Executed validation settlements</th><td>${report.trades}</td></tr>
<tr><th>Distinct combined symbol/side/entry time</th><td>${evidence.results.distinctCombinedSymbolSideEntryTime}</td></tr>
<tr><th>Orders placed / filled</th><td>${report.ordersPlaced} / ${report.ordersFilled}</td></tr>
<tr><th>Elapsed / heap delta</th><td>${elapsedMs.toFixed(1)} ms / ${evidence.performance.heapDeltaBytes} bytes</td></tr>
</tbody></table>
<h2>Failure cases</h2><pre>${esc(failures.length ? failures.join("\n") : "none")}</pre>
<h2>Recorded evidence</h2><pre>${esc(JSON.stringify(evidence, null, 2))}</pre>
</body></html>`;
writeFileSync("artifacts/cts-a-price-grid-replay.html", html);
console.log("CTS_A_PRICE_GRID_REPLAY " + JSON.stringify(evidence));
