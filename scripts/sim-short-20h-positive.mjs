#!/usr/bin/env node
/** 20h × 12 · all short TP/SL combos · Block 1.5/0.2 · keep PF≥1 only */
import { writeFileSync } from "node:fs";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, allShortTpSlCombos, liveShortProtectCombos } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const HOURS = 20;
const SYMBOLS = 12;
const CFG0 = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  trailingPct: 1.5,
  maxHoldTicks: 24,
  maxHoldBars: 3,
};
const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "parallel",
  overallMode: "parallel",
  overall: true,
  overallSymbol: true,
  overallDirection: true,
  overallSharedStack: "additive",
  volumeRatio: 0.2,
  relVolumeRatio: 0.2,
  sharedVolumeRatio: 1.5,
  overallVolumeRatio: 1.5,
  maxVolumeMultiplier: 8,
  counts: [1, 2, 3, 4, 5, 6],
  windows: true,
  stack: true,
  sides: "both",
};

const all = allShortTpSlCombos();
const live = liveShortProtectCombos(0.42, 1.7, 0.6);
console.log(`grid all ${all.length} · live ${live.length} (TP 0.42–0.6 / SL ≥1.7)`);

const cells = [];
const t0 = Date.now();
for (const prot of live) {
  const t = Date.now();
  const { report: r } = simulateHours(HOURS, { ...CFG0, ...prot }, "trailing", {
    symbolCount: SYMBOLS,
    rangeType: "atr",
    block: BLOCK,
    equity: 10,
    costStep: 3,
    complete: false,
  });
  const row = {
    tpAtr: prot.tpAtr,
    slOfTp: prot.slOfTp,
    slAtr: prot.slAtr,
    pf: +r.pf.toFixed(3),
    wr: +r.wr.toFixed(3),
    n: r.trades,
    net: +r.net.toFixed(4),
    eq: +r.equity.toFixed(4),
    mdd: +r.mdd.toFixed(4),
    ddt: r.ddt,
    avgMargin: +Number(r.avgMargin || 0).toFixed(4),
    maxMargin: +Number(r.maxMargin || 0).toFixed(4),
    ok: r.pf + 1e-9 >= 1 && r.net > 0 && r.trades >= 8,
    ms: Date.now() - t,
  };
  cells.push(row);
  console.log(
    `${row.ok ? "ok" : "  "} TP ${prot.tpAtr.toFixed(2)} SL ${prot.slOfTp.toFixed(2)} PF ${row.pf.toFixed(2)} n=${row.n} net=${row.net.toFixed(3)} eq ${row.eq.toFixed(3)} mdd ${(row.mdd * 100).toFixed(1)}% mar ${row.avgMargin.toFixed(3)} ${row.ms}ms`,
  );
}
cells.sort((a, b) => b.pf - a.pf || b.net - a.net);
const pos = cells.filter((c) => c.ok);
const out = {
  hours: HOURS,
  symbols: SYMBOLS,
  startEquity: 10,
  elapsedMs: Date.now() - t0,
  nAll: cells.length,
  nPositive: pos.length,
  winner: pos[0] || cells[0],
  positive: pos,
  cells,
};
writeFileSync("public/sim-short-20h-positive.json", JSON.stringify(out));
console.log(`\npositive ${pos.length}/${cells.length} · winner TP ${out.winner.tpAtr} / ${out.winner.slOfTp} PF ${out.winner.pf} · ${out.elapsedMs}ms`);
