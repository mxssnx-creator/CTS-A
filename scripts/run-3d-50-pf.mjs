#!/usr/bin/env node
/**
 * 72h × 50 symbols · overall auto-eval · new PF floors · Axis full size.
 * Tracks avg open positions and total partial-order counts.
 */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_THRESHOLDS,
  AXIS_PARTIAL_RATIO,
  RANGE_TYPES,
} from "../src/lib/desk/engine.ts";
import {
  initVstEngine,
  tickVst,
  TICKS_PER_HOUR,
  completeComputations,
  overallLiveStats,
} from "../src/lib/desk/vst.ts";

const HOURS = 72;
const SYMS = 50;
const TICKS = HOURS * TICKS_PER_HOUR;

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  trailingPct: 1.5,
  axisSpacing: 0.7,
  axisLevels: 5,
  axisPartialRatio: AXIS_PARTIAL_RATIO,
  shortRange: true,
  tpAtr: 0.35,
  slOfTp: 1.5,
  slAtr: 0.525,
  tpRatio: 0.667,
  maxHoldBars: 8,
  maxHoldTicks: 16,
};

const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  autoEval: true,
  overall: true,
  relAdditive: true,
  volumeMode: "parallel",
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  sides: "both",
  keepAdjusted: true,
  stack: true,
  windows: true,
  evalHours: 2,
  liveDisableMinPf: DEFAULT_THRESHOLDS.blockPf,
  minRelPf: DEFAULT_THRESHOLDS.blockPf,
};

function run(label, tactic, range, cfg = CFG, block = BLOCK) {
  const t0 = Date.now();
  const e = initVstEngine(cfg, { warmup: 0, symbolCount: SYMS, block, arm: true });
  e.minPf = DEFAULT_THRESHOLDS.minPf;
  e.basePf = DEFAULT_THRESHOLDS.basePf;
  e.axisPf = DEFAULT_THRESHOLDS.axisPf;
  e.blockPf = DEFAULT_THRESHOLDS.blockPf;
  e.shortPf = DEFAULT_THRESHOLDS.shortPf;
  e.shortBasePf = DEFAULT_THRESHOLDS.shortBasePf;
  e.shortRange = Boolean(cfg.shortRange);
  let posSum = 0;
  let ordSum = 0;
  let partOrdSum = 0;
  let partPosSum = 0;
  let extraSum = 0;
  let peakPos = 0;
  let peakOrd = 0;
  let peakPart = 0;
  const seenPartial = new Set();
  const seenExtra = new Set();
  for (let i = 0; i < TICKS; i++) {
    tickVst(e, cfg, tactic, { rangeType: range, symbolCount: SYMS, block });
    const posN = e.positions.length;
    const working = e.orders.filter((o) => o.status === "open" || o.status === "partial");
    const partO = e.orders.filter((o) => o.status === "partial" || (o.filled > 0 && o.remaining > 1e-12));
    const extra = e.orders.filter((o) => (o.level || 0) > 1 && (o.status === "open" || o.status === "partial"));
    posSum += posN;
    ordSum += working.length;
    partOrdSum += partO.length;
    partPosSum += e.positions.filter((p) => p.status === "partial").length;
    extraSum += extra.length;
    peakPos = Math.max(peakPos, posN);
    peakOrd = Math.max(peakOrd, working.length);
    peakPart = Math.max(peakPart, partO.length);
    for (const o of partO) seenPartial.add(o.id);
    for (const o of extra) seenExtra.add(o.id);
  }
  const ov = overallLiveStats(e);
  const row = {
    label,
    tactic,
    range,
    ms: Date.now() - t0,
    pf: +Number(e.stats.pf || 0).toFixed(3),
    wr: +((e.stats.wr || 0) * 100).toFixed(1),
    n: e.stats.trades,
    net: +Number(e.stats.net || 0).toFixed(3),
    mdd: +Number(e.stats.mdd || 0).toFixed(4),
    ddt: e.stats.ddt || 0,
    sl: e.ledger.slExits,
    tp: e.ledger.tpExits,
    avgOpenPos: +(posSum / TICKS).toFixed(2),
    avgOrders: +(ordSum / TICKS).toFixed(2),
    avgPartialOrders: +(partOrdSum / TICKS).toFixed(2),
    avgPartialPos: +(partPosSum / TICKS).toFixed(2),
    avgExtraRungs: +(extraSum / TICKS).toFixed(2),
    peakPos,
    peakOrd,
    peakPartialOrders: peakPart,
    totalPartialOrders: seenPartial.size,
    totalExtraRungs: seenExtra.size,
    relEval: e.lastRelEvalTick || 0,
    relVol: +Number(e.relVolumeFactor || 0).toFixed(3),
    disabled: Object.keys(e.liveDisabled || {}).length,
    performing: (e.performingSymbols || []).length,
    lastN12: ov.lastN?.["12"] ? { n: ov.lastN["12"].n, pf: +Number(ov.lastN["12"].pf).toFixed(3), net: +Number(ov.lastN["12"].net).toFixed(3) } : null,
    lastN40: ov.lastN?.["40"] ? { n: ov.lastN["40"].n, pf: +Number(ov.lastN["40"].pf).toFixed(3) } : null,
    h4: ov.hours?.["4"] ? { n: ov.hours["4"].n, pf: +Number(ov.hours["4"].pf).toFixed(3) } : null,
    h12: ov.hours?.["12"] ? { n: ov.hours["12"].n, pf: +Number(ov.hours["12"].pf).toFixed(3) } : null,
    byInd: (ov.byIndication || []).filter((b) => b.n).map((b) => ({ k: b.key, n: b.n, pf: +Number(b.pf).toFixed(3), net: +Number(b.net).toFixed(3) })),
    byPlay: (ov.byPlaybook || []).filter((b) => b.n).map((b) => ({ k: b.key, n: b.n, pf: +Number(b.pf).toFixed(3), net: +Number(b.net).toFixed(3) })),
    byTac: (ov.byTactic || []).filter((b) => b.n).map((b) => ({ k: b.key, n: b.n, pf: +Number(b.pf).toFixed(3) })),
    gates: {
      overall: DEFAULT_THRESHOLDS.minPf,
      base: DEFAULT_THRESHOLDS.basePf,
      axis: DEFAULT_THRESHOLDS.axisPf,
      block: DEFAULT_THRESHOLDS.blockPf,
      short: DEFAULT_THRESHOLDS.shortPf,
      shortBase: DEFAULT_THRESHOLDS.shortBasePf,
      axisPartial: AXIS_PARTIAL_RATIO,
    },
  };
  const flag = row.pf >= DEFAULT_THRESHOLDS.minPf && row.net > 0 ? "ok" : row.pf >= 1 && row.net > 0 ? "weak" : "FAIL";
  console.log(
    `${flag.padEnd(4)} ${label.padEnd(22)} PF=${String(row.pf).padStart(6)} WR=${String(row.wr).padStart(5)}% n=${String(row.n).padStart(4)} net=${String(row.net).padStart(8)}  avgPos=${String(row.avgOpenPos).padStart(5)} avgOrd=${String(row.avgOrders).padStart(5)} partN=${String(row.totalPartialOrders).padStart(4)} extraN=${String(row.totalExtraRungs).padStart(4)} peakPos=${row.peakPos} ddt=${row.ddt}`,
  );
  return row;
}

console.log(`PF overall ${DEFAULT_THRESHOLDS.minPf}  base ${DEFAULT_THRESHOLDS.basePf}  axis ${DEFAULT_THRESHOLDS.axisPf}  block ${DEFAULT_THRESHOLDS.blockPf}  short ${DEFAULT_THRESHOLDS.shortPf}/${DEFAULT_THRESHOLDS.shortBasePf}  axisRung ${AXIS_PARTIAL_RATIO}`);
console.log(`72h × ${SYMS} · autoEval 2h · Block 0.4 · short-range\n`);

const tAll = Date.now();
const rows = [];
for (const tactic of ["hybrid", "axis", "trailing"]) {
  rows.push(run(`${tactic} atr`, tactic, "atr"));
  rows.push(run(`${tactic} fib`, tactic, "fibonacci"));
}

console.log("\n=== completeComputations 72h × 50 ===");
const tC = Date.now();
const complete = completeComputations(CFG, { symbolCount: SYMS, hours: [72] });
const cells = (complete.cells || []).map((c) => ({
  tactic: c.tactic,
  range: c.range,
  hours: c.hours,
  pf: +Number(c.pf || 0).toFixed(3),
  n: c.trades,
  net: +Number(c.net || 0).toFixed(3),
  wr: +Number(c.wr || 0).toFixed(3),
  ok: Boolean(c.ok),
}));
cells.sort((a, b) => b.pf - a.pf);
for (const c of cells) {
  console.log(`${c.ok ? "ok" : "  "} ${c.tactic.padEnd(9)} ${c.range.padEnd(10)} PF=${String(c.pf).padStart(6)} n=${String(c.n).padStart(4)} net=${String(c.net).padStart(8)}`);
}
console.log(`complete ${Date.now() - tC}ms  cells ${cells.length}  winner ${cells[0]?.tactic}/${cells[0]?.range} PF ${cells[0]?.pf}`);

const out = {
  hours: HOURS,
  symbols: SYMS,
  ms: Date.now() - tAll,
  thresholds: DEFAULT_THRESHOLDS,
  axisPartialRatio: AXIS_PARTIAL_RATIO,
  rows,
  complete: cells,
  winner: rows.slice().sort((a, b) => b.pf - a.pf)[0],
};
writeFileSync("/workspace/public/run-3d-50-pf.json", JSON.stringify(out, null, 2));
console.log(`\ndone ${out.ms}ms`);
