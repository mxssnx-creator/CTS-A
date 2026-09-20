#!/usr/bin/env node
/** 72h × 120 short · Block off vs parallel (shared 1.0 + additive 0.1 + overall). */
import { writeFileSync } from "node:fs";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const HOURS = 72;
const SYMBOLS = 120;
const CFG = {
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

const BLOCK_ON = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "parallel",
  overallMode: "parallel",
  overall: true,
  sets: true,
  windows: true,
  stack: true,
  volumeRatio: 0.1,
  relVolumeRatio: 0.1,
  sharedVolumeRatio: 1,
  overallVolumeRatio: 1,
  maxVolumeMultiplier: 2.5,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  sides: "both",
};

const BLOCK_OFF = { ...BLOCK_ON, enabled: false, overall: false, sets: false, stack: false, windows: false };

function pack(label, r, ms) {
  return {
    label,
    pf: r.pf,
    wr: r.wr,
    net: r.net,
    trades: r.trades,
    mdd: r.mdd,
    ddt: r.ddt,
    avgPos: r.avgPositions,
    avgOrd: r.avgOrders,
    avgBlock: r.avgBlockOrd,
    maxPos: r.maxPositionsSeen,
    maxOrd: r.maxOrdersSeen,
    sl: r.slExits,
    tp: r.tpExits,
    equity: r.equity,
    ms,
    hourly: (r.hourly || []).map((h) => ({
      h: h.h,
      pf: h.pf,
      n: h.trades,
      net: h.net,
      pos: h.pos,
      ord: h.orders,
      block: h.blockOrd,
    })),
  };
}

function run(label, block) {
  const t0 = Date.now();
  const { report: r } = simulateHours(HOURS, CFG, "trailing", {
    symbolCount: SYMBOLS,
    rangeType: "atr",
    block,
    equity: 10_000,
    costStep: 10,
    orderType: "limit",
  });
  const row = pack(label, r, Date.now() - t0);
  console.log(
    `${label.padEnd(12)} PF ${row.pf.toFixed(2)} n=${row.trades} ddt=${Number(row.ddt || 0).toFixed(0)} net=${Number(row.net).toFixed(2)} avgPos=${Number(row.avgPos).toFixed(1)} avgOrd=${Number(row.avgOrd).toFixed(1)} maxOrd=${row.maxOrd} block=${Number(row.avgBlock).toFixed(1)} ${row.ms}ms`,
  );
  return row;
}

const tAll = Date.now();
const cells = [];
for (const tactic of ["trailing", "hybrid", "axis"]) {
  for (const [label, block] of [["off", BLOCK_OFF], ["parallel", BLOCK_ON]]) {
    const t0 = Date.now();
    const { report: r } = simulateHours(HOURS, CFG, tactic, {
      symbolCount: SYMBOLS,
      rangeType: "atr",
      block,
      equity: 10_000,
      costStep: 10,
      complete: true,
    });
    const row = {
      tactic,
      ...pack(label, r, Date.now() - t0),
      ordersPlaced: r.ordersPlaced,
      ordersFilled: r.ordersFilled,
      indications: r.byIndication,
      playbooks: r.byPlaybook,
      kinds: r.byKind,
    };
    cells.push(row);
    console.log(
      `${tactic.padEnd(9)} ${label.padEnd(10)} PF ${row.pf.toFixed(2)} n=${row.trades} placed=${row.ordersPlaced} maxOrd=${row.maxOrd} avgOrd=${Number(row.avgOrd).toFixed(0)} inds=${(row.indications || []).length} ${row.ms}ms`,
    );
    if (row.indications) {
      for (const i of row.indications) console.log(`  ind ${i.id} n=${i.n} PF ${i.pf.toFixed(2)}`);
    }
  }
}
const trailing = { off: cells.find((c) => c.tactic === "trailing" && c.label === "off"), on: cells.find((c) => c.tactic === "trailing" && c.label === "parallel") };
const out = {
  hours: HOURS,
  symbols: SYMBOLS,
  shared: 1,
  additive: 0.1,
  elapsedMs: Date.now() - tAll,
  cells,
  lift: {
    pf: (trailing.on?.pf ?? 0) - (trailing.off?.pf ?? 0),
    net: (trailing.on?.net ?? 0) - (trailing.off?.net ?? 0),
    avgOrd: (trailing.on?.avgOrd ?? 0) - (trailing.off?.avgOrd ?? 0),
  },
};
writeFileSync("public/sim-72h-120-short.json", JSON.stringify(out));
console.log("lift", out.lift, "ms", out.elapsedMs);
