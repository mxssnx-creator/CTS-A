#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { DEFAULT_TACTIC_CONFIG, profitFactor } from "../src/lib/desk/engine.ts";
import { STOP_DISTANCE_PCTS, TRAIL_DISTANCE_PCTS } from "../src/lib/desk/price-distance-grid.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const positiveIntArg = (name, fallback) => {
  const prefix = `${name}=`;
  const raw = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw == null) return fallback;
  const value = Number(raw);
  assert.ok(Number.isSafeInteger(value) && value > 0, `${name} must be a positive integer`);
  return value;
};
// The standard paper study uses a history long enough to exercise Base-15.
// CI sets a shorter window explicitly for the catalog/economics smoke checks.
const selectionHours = positiveIntArg("--selection-hours", 120);
const validationHours = positiveIntArg("--validation-hours", 24);
const symbols = 12;
const short = process.argv.includes("--short");
const minimal = process.argv.includes("--minimal");
assert.ok(!(short && minimal), "choose one range per replay");
const rangeMode = short ? "short" : minimal ? "minimal" : "micro";
const rangeLabel = rangeMode[0].toUpperCase() + rangeMode.slice(1);
const artifactStem = rangeMode === "micro" ? "cts-a-price-grid-replay" : `cts-a-${rangeMode}-price-grid-replay`;
const cfg = {
  ...DEFAULT_TACTIC_CONFIG,
  microRange: rangeMode === "micro",
  minimalRange: minimal,
  shortRange: short,
  tpAtr: short ? .6 : minimal ? 2 : .3,
  slOfTp: 1,
  maxHoldTicks: positiveIntArg("--max-hold-ticks", 12),
  maxHoldBars: 3,
  priceDistanceGrid: {
    enabled: true,
    stopPcts: [...STOP_DISTANCE_PCTS],
    trailPcts: [...TRAIL_DISTANCE_PCTS],
  },
};

const distinctEntry = row => `${row.symbol}:${row.side}:${row.tick - Math.max(0, Number(row.holdTicks) || 0)}`;
const paperEquity = 10;
const phases = Object.fromEntries(["selection", "validation"].map(phase => [phase, {
  settlements: 0, admitted: 0, fixed: 0, dynamic: 0, entries: new Set(), grossProfit: 0,
  grossLoss: 0, returnProfit: 0, returnLoss: 0, admittedProfit: 0, admittedLoss: 0,
  modeledCost: 0, mismatches: 0, rates: new Set(),
}]));
const trailingModes = Object.fromEntries(["fixed", "dynamic"].map(mode => [mode, {
  settlements: 0, entries: new Set(), gain: 0, loss: 0, cost: 0,
  equity: paperEquity, peak: paperEquity, drawdown: 0,
}]));
const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
const { report, engine } = simulateHours(validationHours, cfg, "trailing", {
  symbolCount: symbols,
  rangeType: "atr",
  equity: paperEquity,
  costStep: 3,
  complete: false,
  prehours: selectionHours,
  orderType: "limit",
  strategyToggles: { normal: true, trailing: true, axis: false, block: false, dca: false },
  onSettlement(row, phase) {
    const stats = phases[phase];
    stats.settlements++;
    if (row.validExec === true) {
      stats.admitted++;
      if (row.ratio > 0) stats.admittedProfit += row.ratio;
      else stats.admittedLoss -= row.ratio;
    }
    if (row.ratio > 0) stats.returnProfit += row.ratio;
    else stats.returnLoss -= row.ratio;
    stats.entries.add(distinctEntry(row));
    const gross = (row.side === "long" ? 1 : -1) * (row.exit - row.entry);
    const perUnitCost = (row.entry + row.exit) / 2 * row.modelRtCost;
    const expectedReturn = (gross - perUnitCost) / row.entry;
    const expectedPnl = (gross - perUnitCost) * row.qty;
    if (![expectedReturn, expectedPnl, row.ratio, row.pnl].every(Number.isFinite) ||
      Math.abs(row.ratio - expectedReturn) > 1e-10 ||
      Math.abs(row.pnl - expectedPnl) > 1e-10 * Math.max(1, Math.abs(expectedPnl))) stats.mismatches++;
    const grossReturn = gross / row.entry;
    if (grossReturn > 0) stats.grossProfit += grossReturn;
    else stats.grossLoss -= grossReturn;
    stats.modeledCost += perUnitCost * row.qty;
    if (Number.isFinite(row.modelRtCost)) stats.rates.add(row.modelRtCost.toFixed(8));
    if (row.priceTrailPct != null) {
      const mode = row.trailingDistance === "fixed" ? "fixed" : "dynamic";
      stats[mode]++;
      if (phase === "validation" && row.validExec === true) {
        const totals = trailingModes[mode];
        totals.settlements++;
        totals.entries.add(distinctEntry(row));
        totals.gain += Math.max(0, row.ratio);
        totals.loss += Math.max(0, -row.ratio);
        totals.cost += perUnitCost * row.qty;
        totals.equity += row.pnl;
        totals.peak = Math.max(totals.peak, totals.equity);
        totals.drawdown = Math.max(totals.drawdown, (totals.peak - totals.equity) / totals.peak);
      }
    }
  },
});
const elapsedMs = performance.now() - started;
const heapAfter = process.memoryUsage().heapUsed;
const retained = engine.closed.filter(row => !row.examFlat);
const candidates = retained.filter(row => row.validExec === true);
const exact = retained.filter(row => row.priceStopPct != null);
const distinct = new Set(retained.map(distinctEntry));
const summarizePhase = ({ entries, rates, grossProfit, grossLoss, returnProfit, returnLoss, admittedProfit, admittedLoss, ...stats }) => ({
  ...stats, distinctSymbolSideEntryTime: entries.size, roundTripRates: [...rates].sort(),
  beforeCostPf: grossLoss > 0 ? grossProfit / grossLoss : null,
  afterCostPf: profitFactor(returnProfit, returnLoss),
  admittedAfterCostPf: profitFactor(admittedProfit, admittedLoss),
});
const parentCursorValues = Object.values(engine.priceDistanceParentSamples ?? {}).map(Number).filter(Number.isFinite);
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
if (phases.validation.admitted === 0) failures.push("no_post_selection_executions");
const missingLineage = exact.filter(row => row.priceTrailPct == null).length;
if (missingLineage) failures.push(`missing_exact_lineage:${missingLineage}`);
const evidence = {
  revision: process.env.GITHUB_SHA ?? "local",
  mode: "offline-paper-replay",
  rangeMode,
  selectionPeriod: { startHour: 0, endHourExclusive: selectionHours, purpose: "selection-only prehistory" },
  validationPeriod: { startHour: selectionHours, endHourExclusive: selectionHours + validationHours, purpose: "held-out validation" },
  symbols,
  requestedCatalog: { stops: STOP_DISTANCE_PCTS.length, gaps: TRAIL_DISTANCE_PCTS.length, trailingModes: 2, trailingCells: STOP_DISTANCE_PCTS.length * TRAIL_DISTANCE_PCTS.length * 2 },
  modeledCosts: { costStep: 3, basis: "taker/taker with fee-relative slippage",
    roundTripRates: [...new Set([...phases.selection.rates, ...phases.validation.rates])].sort(),
    settlementReconciliation: Object.fromEntries(Object.entries(phases).map(([phase, stats]) => [phase, summarizePhase(stats)])) },
  admittedValidationByTrailingMode: Object.fromEntries(Object.entries(trailingModes).map(([mode, totals]) => [mode, {
    settlements: totals.settlements,
    distinctSymbolSideEntryTime: totals.entries.size,
    afterCostPf: totals.settlements ? profitFactor(totals.gain, totals.loss) : null,
    cost: totals.cost,
    closedCashDrawdown: totals.drawdown,
  }])),
  maximumHold: { ticks: cfg.maxHoldTicks, bars: cfg.maxHoldBars },
  results: {
    selectionSettlements: phases.selection.settlements,
    selectionLedgerSettlementsIncludingBoundaryFlattens: report.pre?.trades ?? null,
    distinctSelectionSymbolSideEntryTime: phases.selection.entries.size,
    modeledValidationSettlements: report.settledSlices ?? report.trades,
    retainedCombinedSettlements: retained.length,
    exactCombinedSettlements: exact.length,
    candidateRows: candidates.length,
    fixedCandidateRows: candidates.filter(row => row.trailingDistance === "fixed").length,
    dynamicCandidateRows: candidates.filter(row => row.trailingDistance !== "fixed").length,
    executedValidationSettlements: phases.validation.admitted,
    distinctValidationSymbolSideEntryTime: phases.validation.entries.size,
    distinctCombinedSymbolSideEntryTime: distinct.size,
    validationAfterCostPf: report.pf,
    admittedValidationAfterCostPf: profitFactor(phases.validation.admittedProfit, phases.validation.admittedLoss),
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
    nativeParentCursors: parentCursorValues.length,
    nativeParentMaxOccurrences: parentCursorValues.reduce((max, value) => Math.max(max, value), 0),
  },
  lastNSampleCoverage: {
    selectionBoundary: report.prehistorySampleCoverage ?? null,
    heldOutEnd: report.sampleCoverage ?? null,
  },
  performance: {
    elapsedMs: Number(elapsedMs.toFixed(3)),
    heapBeforeBytes: heapBefore,
    heapAfterBytes: heapAfter,
    heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
  },
  failures,
};
assert.equal(report.symbols, symbols);
assert.equal(STOP_DISTANCE_PCTS.length, 21);
assert.equal(TRAIL_DISTANCE_PCTS.length, 25);
assert.equal(missingLineage, 0, "every exact trailing settlement must retain its gap");
assert.equal(report.nanCount, 0);
assert.equal(report.negativePx, 0);
assert.equal(phases.validation.settlements, report.settledSlices, "the entire held-out tape is accounted for");
assert.equal(phases.selection.mismatches + phases.validation.mismatches, 0, "every settlement uses the recorded round-trip cost once");
assert.ok(Math.abs(profitFactor(phases.validation.returnProfit, phases.validation.returnLoss) - report.pf) < 1e-10,
  "held-out PF reconciles to the complete after-cost settlement tape");

mkdirSync("artifacts", { recursive: true });
writeFileSync(`artifacts/${artifactStem}.json`, JSON.stringify({ ...evidence, hourly: report.hourly ?? [] }, null, 2));
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>CTS-A exact price grid replay</title>
<style>body{font:14px/1.45 system-ui;margin:28px;background:#0b1220;color:#dbeafe}table{border-collapse:collapse}th,td{padding:7px 12px;border-bottom:1px solid #334155;text-align:right}th:first-child,td:first-child{text-align:left}.bad{color:#fca5a5}.ok{color:#86efac}pre{white-space:pre-wrap}</style></head><body>
<h1>CTS-A · ${rangeLabel} native 21-stop × 25-gap held-out replay</h1>
<p>Synthetic paper replay. Hours 0–${selectionHours} supply Base history. Hours ${selectionHours}–${selectionHours + validationHours} score forward results under the same policy. The modeled taker/taker cost and fee-relative slippage are reconciled per settlement.</p>
<table><tbody>
<tr><th>After-cost PF</th><td class="${report.pf >= 1 ? "ok" : "bad"}">${report.pf.toFixed(4)}</td></tr>
<tr><th>Drawdown</th><td>${(report.mdd * 100).toFixed(3)}%</td></tr>
<tr><th>Modeled validation settlements</th><td>${evidence.results.modeledValidationSettlements}</td></tr>
<tr><th>Executed validation settlements</th><td>${evidence.results.executedValidationSettlements}</td></tr>
<tr><th>Distinct validation symbol/side/entry time</th><td>${evidence.results.distinctValidationSymbolSideEntryTime}</td></tr>
<tr><th>Orders placed / filled</th><td>${report.ordersPlaced} / ${report.ordersFilled}</td></tr>
<tr><th>Elapsed / heap delta</th><td>${elapsedMs.toFixed(1)} ms / ${evidence.performance.heapDeltaBytes} bytes</td></tr>
</tbody></table>
<h2>Validation by trailing mode</h2>
<table><thead><tr><th>Mode</th><th>Settlements</th><th>Distinct entries</th><th>After-cost PF</th><th>Closed-cash drawdown</th></tr></thead>
<tbody>${Object.entries(evidence.admittedValidationByTrailingMode).map(([mode, totals]) => `
<tr><th>${mode}</th><td>${totals.settlements}</td><td>${totals.distinctSymbolSideEntryTime}</td>
<td>${totals.afterCostPf?.toFixed(4) ?? "—"}</td><td>${(totals.closedCashDrawdown * 100).toFixed(3)}%</td></tr>`).join("")}</tbody></table>
<h2>Failure cases</h2><pre>${esc(failures.length ? failures.join("\n") : "none")}</pre>
<h2>Recorded evidence</h2><pre>${esc(JSON.stringify(evidence, null, 2))}</pre>
</body></html>`;
writeFileSync(`artifacts/${artifactStem}.html`, html);
const logPrefix = rangeMode === "micro" ? "CTS_A_PRICE_GRID_REPLAY" : `CTS_A_${rangeMode.toUpperCase()}_PRICE_GRID_REPLAY`;
console.log(`${logPrefix} ${JSON.stringify(evidence)}`);
