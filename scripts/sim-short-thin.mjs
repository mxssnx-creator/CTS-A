#!/usr/bin/env node
/** Local short-range thin TP/SL sweep · PF + DDT. Does not place live orders. */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  allShortTpSlCombos,
} from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "shared",
  overallMode: "shared",
  overall: true,
  windows: true,
  stack: true,
  volumeRatio: 0.1,
  relVolumeRatio: 0.1,
  sharedVolumeRatio: 1.5,
};

const BASE = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  trailingPct: 1.5,
  maxHoldTicks: 20000,
  maxHoldBars: 8,
};

const combos = allShortTpSlCombos();
const t0 = Date.now();
const rows = [];

function score(r) {
  const pf = Number(r.pf) || 0;
  const ddt = Number(r.ddt) || 0;
  const mdd = Number(r.mdd) || 0;
  const n = Number(r.trades) || 0;
  if (n < 12) return -99;
  return pf - ddt / 8000 - mdd * 4;
}

for (const c of combos) {
  const cfg = { ...BASE, ...c };
  const { report: r } = simulateHours(12, cfg, "trailing", {
    symbolCount: 30,
    rangeType: "atr",
    block: BLOCK,
  });
  const row = {
    tpAtr: c.tpAtr,
    slOfTp: c.slOfTp,
    slAtr: c.slAtr,
    tpRatio: c.tpRatio,
    pf: r.pf,
    wr: r.wr,
    net: r.net,
    trades: r.trades,
    mdd: r.mdd,
    ddt: r.ddt,
    avgPos: r.avgPositions,
    avgOrd: r.avgOrders,
    score: score(r),
  };
  rows.push(row);
  console.log(
    `${c.tpAtr}/${c.slOfTp} PF ${r.pf.toFixed(2)} n=${r.trades} ddt=${Number(r.ddt || 0).toFixed(0)} mdd=${(r.mdd * 100).toFixed(2)}% pos=${Number(r.avgPositions || 0).toFixed(1)}`,
  );
}

const ranked = [...rows].sort((a, b) => b.score - a.score || b.pf - a.pf);
const live = ranked.filter((r) => r.pf >= 1.15 && r.trades >= 20 && r.mdd <= 0.08).slice(0, 8);
const fallback = ranked.filter((r) => r.pf >= 1 && r.trades >= 16).slice(0, 6);
const keep = live.length ? live : fallback.length ? fallback : ranked.slice(0, 4);

const confirm = [];
for (const k of keep.slice(0, 6)) {
  const cfg = { ...BASE, tpAtr: k.tpAtr, slOfTp: k.slOfTp, slAtr: k.slAtr, tpRatio: k.tpRatio, shortRange: true };
  const { report: r } = simulateHours(24, cfg, "trailing", { symbolCount: 50, rangeType: "atr", block: BLOCK });
  confirm.push({
    ...k,
    h24: {
      pf: r.pf,
      n: r.trades,
      ddt: r.ddt,
      mdd: r.mdd,
      net: r.net,
      avgPos: r.avgPositions,
      avgOrd: r.avgOrders,
    },
  });
  console.log(
    `confirm 24h×50 ${k.tpAtr}/${k.slOfTp} PF ${r.pf.toFixed(2)} n=${r.trades} ddt=${Number(r.ddt || 0).toFixed(0)} mdd=${(r.mdd * 100).toFixed(2)}%`,
  );
}

const winners = confirm
  .filter((c) => (c.h24?.pf ?? 0) >= 1.05)
  .sort((a, b) => (b.h24?.pf ?? 0) - (a.h24?.pf ?? 0) || (a.h24?.ddt ?? 9e9) - (b.h24?.ddt ?? 9e9));

const out = {
  hours: 12,
  symbols: 30,
  elapsedMs: Date.now() - t0,
  n: rows.length,
  keep,
  confirm,
  winners,
  ranked: ranked.slice(0, 20),
  rows,
};
writeFileSync("public/short-thin-sweep.json", JSON.stringify(out, null, 2));
console.log("winners", winners.map((w) => `${w.tpAtr}/${w.slOfTp} 24h PF ${(w.h24?.pf ?? 0).toFixed(2)}`));
console.log("ms", out.elapsedMs);
