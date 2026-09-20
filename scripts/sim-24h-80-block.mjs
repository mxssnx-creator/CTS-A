#!/usr/bin/env node
/** 24h × 80 complete · $10 · Block off vs shared/additive 1.5/0.2 and 3/0.4 · margin @ 125x */
import { writeFileSync } from "node:fs";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const HOURS = 24;
const SYMBOLS = 80;
const EQUITY = 10;
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

function blockOf(shared, additive, on = true) {
  return {
    ...DEFAULT_BLOCK_CONFIG,
    enabled: on,
    volumeMode: "parallel",
    overallMode: "parallel",
    overall: on,
    overallSymbol: on,
    overallDirection: on,
    overallSharedStack: "additive",
    sets: on,
    windows: true,
    stack: true,
    volumeRatio: additive,
    relVolumeRatio: additive,
    sharedVolumeRatio: shared,
    overallVolumeRatio: shared,
    maxVolumeMultiplier: Math.max(8, shared * 6),
    counts: [1, 2, 3, 4, 5, 6],
    maxMultiple: 6,
    sides: "both",
  };
}

function hourLine(h) {
  return {
    h: h.h,
    eq: +Number(h.eq).toFixed(4),
    pf: +Number(h.pf).toFixed(3),
    wr: +Number(h.wr).toFixed(3),
    n: h.trades,
    net: +Number(h.net).toFixed(4),
    netCum: +Number(h.netCum).toFixed(4),
    pos: h.pos,
    ord: h.orders,
    queued: h.queued,
    block: h.blockOrd,
    sl: h.sl,
    tp: h.tp,
    mdd: +Number(h.mdd).toFixed(4),
    ddt: h.ddt,
    notional: +Number(h.notional || 0).toFixed(3),
    margin: +Number(h.margin || 0).toFixed(4),
    marginPct: +Number(h.marginPct || 0).toFixed(4),
    vf: +Number(h.vol || 0).toFixed(3),
  };
}

function run(label, shared, additive, on = true) {
  const t0 = Date.now();
  const { report: r } = simulateHours(HOURS, CFG, "trailing", {
    symbolCount: SYMBOLS,
    rangeType: "atr",
    block: blockOf(shared, additive, on),
    equity: EQUITY,
    costStep: 3,
    complete: true,
    orderType: "limit",
  });
  const ms = Date.now() - t0;
  const hours = (r.hourly || []).map(hourLine);
  const row = {
    label,
    shared,
    additive,
    on,
    pf: r.pf,
    wr: r.wr,
    net: r.net,
    trades: r.trades,
    mdd: r.mdd,
    ddt: r.ddt,
    equity: r.equity,
    start: EQUITY,
    placed: r.ordersPlaced,
    filled: r.ordersFilled,
    avgPos: r.avgPositions,
    avgOrd: r.avgOrders,
    avgBlock: r.avgBlockOrd,
    avgNotional: r.avgNotional,
    avgMargin: r.avgMargin,
    maxMargin: r.maxMargin,
    maxPos: r.maxPositionsSeen,
    maxOrd: r.maxOrdersSeen,
    sl: r.slExits,
    tp: r.tpExits,
    indications: r.byIndication,
    playbooks: r.byPlaybook,
    hours,
    ms,
  };
  console.log(`\n=== ${label}  ${ms}ms ===`);
  console.log(
    `PF ${r.pf.toFixed(3)}  WR ${(r.wr * 100).toFixed(1)}%  n=${r.trades}  net=${Number(r.net).toFixed(4)}  eq ${Number(r.equity).toFixed(4)}  placed=${r.ordersPlaced}  avgMargin=${Number(r.avgMargin).toFixed(4)}  maxMargin=${Number(r.maxMargin).toFixed(4)}  avgNotional=${Number(r.avgNotional).toFixed(2)}  avgBlock=${Number(r.avgBlockOrd).toFixed(1)}  mdd=${(r.mdd * 100).toFixed(2)}%`,
  );
  console.log("h  eq      pf    wr%    nH   netH     cum      pos  ord  blk   notional  margin  m%");
  for (const h of hours) {
    console.log(
      `${String(h.h).padStart(2)} ${h.eq.toFixed(4).padStart(8)} ${h.pf.toFixed(2).padStart(5)} ${(h.wr * 100).toFixed(1).padStart(5)} ${String(h.n).padStart(5)} ${h.net.toFixed(3).padStart(8)} ${h.netCum.toFixed(3).padStart(8)} ${String(h.pos).padStart(4)} ${String(h.ord).padStart(4)} ${String(h.block).padStart(4)} ${h.notional.toFixed(2).padStart(9)} ${h.margin.toFixed(4).padStart(8)} ${(h.marginPct * 100).toFixed(1).padStart(5)}`,
    );
  }
  if (row.indications) {
    console.log("indications");
    for (const i of row.indications) console.log(`  ${i.id.padEnd(11)} n=${String(i.n).padStart(5)} PF ${i.pf.toFixed(2)}`);
  }
  return row;
}

const tAll = Date.now();
const z = run("Block off", 1.5, 0.2, false);
const a = run("shared 1.5 / add 0.2", 1.5, 0.2, true);
const b = run("shared 3.0 / add 0.4", 3, 0.4, true);
const out = { hours: HOURS, symbols: SYMBOLS, startEquity: EQUITY, complete: true, elapsedMs: Date.now() - tAll, cells: [z, a, b] };
writeFileSync("public/sim-24h-80-block.json", JSON.stringify(out));
console.log("\nwrote public/sim-24h-80-block.json", Date.now() - tAll, "ms");
