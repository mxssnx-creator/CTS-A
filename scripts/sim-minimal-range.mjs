#!/usr/bin/env node
/** Minimal-range hour sweep. Axis + Block. Does not place live orders. */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  MINIMAL_BLOCK,
  MINIMAL_SL_OF_TP,
  MINIMAL_TP_COST,
} from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const TOG = { normal: false, trailing: true, axis: true, block: true, dca: false };
const HOURS = Number(process.env.MIN_HOURS || 4);
const SYMS = Number(process.env.MIN_SYMS || 8);
const coarse = process.env.MIN_FULL === "1" ? null : [1, 1.5, 2, 2.5, 3];

function blockOf(over = {}) {
  return {
    ...DEFAULT_BLOCK_CONFIG,
    ...MINIMAL_BLOCK,
    counts: [...(over.counts || MINIMAL_BLOCK.counts)],
    ...over,
  };
}

function cfgOf(tpCost, slOfTp, hold = 36) {
  return {
    ...DEFAULT_TACTIC_CONFIG,
    minimalRange: true,
    shortRange: false,
    tpAtr: tpCost,
    slOfTp,
    slAtr: Math.round(tpCost * slOfTp * 1000) / 1000,
    tpRatio: Math.round((1 / slOfTp) * 1000) / 1000,
    trailingPct: 1.5,
    maxHoldTicks: hold,
    maxHoldBars: 2,
  };
}

function run(hours, tp, sl, block, hold = 36, syms = SYMS) {
  const t0 = Date.now();
  const { report: r } = simulateHours(hours, cfgOf(tp, sl, hold), "axis", {
    symbolCount: syms,
    rangeType: "atr",
    block,
    equity: 1000,
    costStep: 18,
    prehours: 0,
    strategyToggles: TOG,
    pfCoords: false,
  });
  const pf = Number(r.paperPf) || Number(r.pf) || 0;
  const net = Number(r.realizedNet);
  const row = {
    tp,
    sl,
    hold,
    pf,
    wr: r.wr,
    net: Number.isFinite(net) ? net : r.net,
    trades: r.trades,
    mdd: r.mdd,
    ddt: r.ddt,
    slExits: r.slExits,
    tpExits: r.tpExits,
    nan: r.nanCount,
    passed: r.passed,
    issues: r.issues,
    ms: Date.now() - t0,
    byTactic: (r.byTactic || []).map((x) => ({ id: x.id, n: x.n, pf: x.pf })),
    byPlaybook: (r.byPlaybook || []).map((x) => ({ id: x.id, n: x.n, pf: x.pf })),
  };
  return row;
}

function score(r) {
  const pf = Number(r.pf) || 0;
  const n = Number(r.trades) || 0;
  const net = Number(r.net) || 0;
  const mdd = Number(r.mdd) || 0;
  const ddt = Number(r.ddt) || 0;
  if (n < 8 || !(net > 0) || !(pf >= 1.02) || r.nan) return -99;
  return pf - mdd * 40 - ddt / 500 - (r.hold > 16 ? 0.05 : 0);
}

const tps = coarse || [...MINIMAL_TP_COST];
const sls = coarse || [...MINIMAL_SL_OF_TP];
const block = blockOf();
const rows = [];
const t0 = Date.now();
console.log(`sweep ${HOURS}h × ${SYMS} sym axis+block cells ${tps.length * sls.length}`);
for (const tp of tps) {
  for (const sl of sls) {
    const row = run(HOURS, tp, sl, block);
    row.score = score(row);
    rows.push(row);
    console.log(
      `${tp}/${sl} PF ${row.pf.toFixed(3)} n=${row.trades} net=${Number(row.net).toFixed(3)} mdd=${(row.mdd * 100).toFixed(2)}% ddt=${Number(row.ddt).toFixed(0)} tp=${row.tpExits} sl=${row.slExits} ${row.ms}ms`,
    );
  }
}
const ranked = [...rows].sort((a, b) => b.score - a.score || b.pf - a.pf || a.ddt - b.ddt);
console.log("top", ranked.slice(0, 6).map((r) => `${r.tp}/${r.sl} PF ${r.pf.toFixed(3)} n=${r.trades} ddt=${r.ddt}`));

const keep = ranked.filter((r) => r.score > -90).slice(0, 4);
const confirms = [];
for (const k of (keep.length ? keep : ranked.slice(0, 2))) {
  const row = run(Math.max(HOURS, 6), k.tp, k.sl, block, 36, Math.max(SYMS, 12));
  row.score = score(row);
  confirms.push(row);
  console.log(`confirm ${k.tp}/${k.sl} PF ${row.pf.toFixed(3)} n=${row.trades} net=${Number(row.net).toFixed(3)} mdd=${(row.mdd * 100).toFixed(2)}% ddt=${row.ddt}`);
}

const best = [...confirms].sort((a, b) => b.score - a.score || a.mdd - b.mdd || a.ddt - b.ddt)[0] || ranked[0];
const blockRows = [];
if (best && best.trades > 0) {
  const variants = [
    { name: "base", block: blockOf() },
    { name: "vol-0.1", block: blockOf({ volumeRatio: 0.1, relVolumeRatio: 0.1 }) },
    { name: "vol-0.35", block: blockOf({ volumeRatio: 0.35, relVolumeRatio: 0.35 }) },
    { name: "overall-off", block: blockOf({ overall: false }) },
    { name: "shared", block: blockOf({ volumeMode: "shared", overallMode: "shared", sharedVolumeRatio: 1.2 }) },
    { name: "counts-1-3", block: blockOf({ counts: [1, 3] }) },
    { name: "counts-1-6", block: blockOf({ counts: [1, 2, 3, 4, 5, 6] }) },
    { name: "sides-long", block: blockOf({ sides: "long" }) },
    { name: "hold-4", block, hold: 4 },
    { name: "hold-16", block, hold: 16 },
    { name: "hold-32", block, hold: 32 },
  ];
  for (const v of variants) {
    const row = run(HOURS, best.tp, best.sl, v.block, v.hold || 8);
    row.name = v.name;
    row.score = score(row);
    blockRows.push(row);
    console.log(`block ${v.name} PF ${row.pf.toFixed(3)} n=${row.trades} net=${Number(row.net).toFixed(3)} mdd=${(row.mdd * 100).toFixed(2)}% ddt=${row.ddt}`);
  }
}

const out = {
  hours: HOURS,
  symbols: SYMS,
  elapsedMs: Date.now() - t0,
  ranked,
  confirms,
  best,
  blockRows: [...blockRows].sort((a, b) => b.score - a.score),
};
writeFileSync("public/minimal-range-sweep.json", JSON.stringify(out, null, 2));
console.log("wrote public/minimal-range-sweep.json", out.elapsedMs);
