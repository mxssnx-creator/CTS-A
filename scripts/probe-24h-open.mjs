#!/usr/bin/env node
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const cfg = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  tpAtr: 0.42,
  slOfTp: 1.7,
  slAtr: 0.714,
  tpRatio: 1 / 1.7,
  trailingPct: 1.5,
  maxHoldTicks: 24,
  maxHoldBars: 3,
};
const block = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "parallel",
  overallMode: "parallel",
  overall: true,
  counts: [1, 2, 3, 4, 5, 6],
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  sharedVolumeRatio: 3,
  overallVolumeRatio: 3,
  windows: true,
  stack: true,
};
const hours = Number(process.argv[2] || 6);
const symbols = Number(process.argv[3] || 24);
const t0 = Date.now();
const { report: r } = simulateHours(hours, cfg, "trailing", {
  symbolCount: symbols,
  rangeType: "atr",
  equity: 10,
  costStep: 3,
  complete: true,
  prehours: 0,
  block,
});
const ms = Date.now() - t0;
const rows = r.hourly || [];
const green = rows.filter((h) => Number(h.gatedN || h.trades || 0) > 0 && Number(h.gatedNet ?? h.net ?? 0) >= -1e-9).length;
console.log(`PF ${Number(r.pf).toFixed(3)} n=${r.trades} eq ${Number(r.equity).toFixed(4)} green ${green}/${rows.length} ${(ms / 1000).toFixed(1)}s`);
console.log("h   eq      hourPF   n    net     margin");
for (const h of rows) {
  const n = Number(h.trades || h.gatedN || 0);
  const net = Number(h.net ?? h.gatedNet ?? 0);
  const pf = Number(h.hourPf || h.pf || 0);
  const mark = net >= 0 && n > 0 ? "+" : n === 0 ? "0" : "-";
  console.log(
    `${mark}${String(h.h).padStart(2)} ${Number(h.eq).toFixed(2).padStart(7)} ${pf.toFixed(2).padStart(7)} ${String(n).padStart(5)} ${net >= 0 ? "+" : ""}${net.toFixed(3).padStart(7)} ${Number(h.avgMargin ?? h.margin ?? 0).toFixed(3).padStart(7)}`,
  );
}
if (r.byIndication) {
  for (const i of r.byIndication) {
    console.log(`  ${String(i.id).padEnd(11)} n=${String(i.n).padStart(5)} PF ${Number(i.pf).toFixed(2)}`);
  }
}
