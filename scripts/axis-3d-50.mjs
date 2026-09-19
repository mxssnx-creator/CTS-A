#!/usr/bin/env node
/**
 * Axis 72h × 50 symbols — 0.08 extra rungs vs full-size (1.0) ratio.
 */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_AXIS_PF,
} from "../src/lib/desk/engine.ts";
import { simulateHours, overallLiveStats } from "../src/lib/desk/vst.ts";

const HOURS = 72;
const SYMS = 50;
const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "parallel",
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  relAdditive: true,
  sides: "both",
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  activeLive: false,
  keepAdjusted: true,
  stack: true,
  windows: true,
  overall: true,
};
const BLOCK_OFF = { ...BLOCK, enabled: false };

function pack(report, engine) {
  const ov = engine ? overallLiveStats(engine) : null;
  return {
    pf: +Number(report.pf || 0).toFixed(3),
    wr: +Number((report.wr || 0) * 100).toFixed(1),
    n: report.trades,
    net: +Number(report.net || 0).toFixed(3),
    mdd: +Number(report.mdd || 0).toFixed(4),
    sl: report.slExits,
    tp: report.tpExits,
    ddt: +(ov?.overall?.ddt ?? report.ddt ?? 0).toFixed(2),
    avgPos: +(ov?.avgPositions ?? 0).toFixed(2),
    avgOrd: +(ov?.avgOrders ?? 0).toFixed(2),
    axisN: ov?.byPlaybook?.find((b) => b.key === "axis")?.n ?? ov?.byTactic?.find((b) => b.key === "axis")?.n ?? report.trades,
    axisPf: +(ov?.byTactic?.find((b) => b.key === "axis")?.pf ?? report.pf ?? 0).toFixed(3),
    ok: report.pf >= DEFAULT_AXIS_PF && report.net > 0 && report.trades >= 8,
  };
}

function run(label, cfg, range, block) {
  const t0 = Date.now();
  const { report, engine } = simulateHours(HOURS, cfg, "axis", { symbolCount: SYMS, rangeType: range, block });
  const row = { label, range, block: block.enabled, ms: Date.now() - t0, ...pack(report, engine) };
  const flag = row.ok ? "ok" : row.pf >= 1 && row.net > 0 ? "weak" : "FAIL";
  console.log(
    `${flag.padEnd(4)} ${label.padEnd(28)} ${range.padEnd(10)} blk=${block.enabled ? "Y" : "N"}  PF=${String(row.pf).padStart(6)} WR=${String(row.wr).padStart(5)}% n=${String(row.n).padStart(4)} net=${String(row.net).padStart(8)} mdd=${row.mdd} ddt=${row.ddt} pos=${row.avgPos}`,
  );
  return row;
}

const tAll = Date.now();
const rows = [];
for (const range of ["atr", "fibonacci", "geometric"]) {
  for (const [name, partial] of [
    ["partial 0.08", 0.08],
    ["full size 1.0", 1],
  ]) {
    const base = {
      ...DEFAULT_TACTIC_CONFIG,
      trailingPct: 1.5,
      axisSpacing: 0.7,
      axisLevels: 5,
      axisPartialRatio: partial,
      shortRange: false,
    };
    rows.push(run(`axis ${name}`, base, range, BLOCK_OFF));
    rows.push(run(`axis ${name} +block`, base, range, BLOCK));
  }
}

const ranked = [...rows].sort((a, b) => b.pf - a.pf || b.net - a.net);
const full = rows.filter((r) => r.label.includes("full"));
const part = rows.filter((r) => r.label.includes("partial"));
const avg = (xs) => (xs.length ? xs.reduce((s, r) => s + r.pf, 0) / xs.length : 0);
const summary = {
  hours: HOURS,
  symbols: SYMS,
  ms: Date.now() - tAll,
  avgPartialPf: +avg(part).toFixed(3),
  avgFullPf: +avg(full).toFixed(3),
  winner: ranked[0],
  preferFull: avg(full) >= avg(part),
  rows: ranked,
};
console.log("\n=== ranking ===");
for (const r of ranked) console.log(`${r.pf.toFixed(3).padStart(6)}  ${r.label} ${r.range} blk=${r.block ? "Y" : "N"} n=${r.n} net=${r.net}`);
console.log(`\navg partial 0.08 PF ${summary.avgPartialPf}  ·  avg full 1.0 PF ${summary.avgFullPf}  ·  preferFull=${summary.preferFull}`);
console.log(`winner ${summary.winner.label} ${summary.winner.range} PF ${summary.winner.pf}  ·  ${summary.ms}ms`);
writeFileSync("/workspace/public/axis-3d-50.json", JSON.stringify(summary, null, 2));
