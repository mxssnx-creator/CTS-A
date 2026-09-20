#!/usr/bin/env node
/** 24h × 80 complete · $10 · Block parallel shared/additive 1.5/0.2 vs 3/0.4 */
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

function blockOf(shared, additive) {
  return {
    ...DEFAULT_BLOCK_CONFIG,
    enabled: true,
    volumeMode: "parallel",
    overallMode: "parallel",
    overall: true,
    sets: true,
    windows: true,
    stack: true,
    volumeRatio: additive,
    relVolumeRatio: additive,
    sharedVolumeRatio: shared,
    overallVolumeRatio: 1,
    maxVolumeMultiplier: Math.max(4, shared),
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
    vf: +Number(h.vol || 0).toFixed(3),
  };
}

function run(label, shared, additive) {
  const t0 = Date.now();
  const { report: r } = simulateHours(HOURS, CFG, "trailing", {
    symbolCount: SYMBOLS,
    rangeType: "atr",
    block: blockOf(shared, additive),
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
    overall: 1,
    mode: "parallel",
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
    maxPos: r.maxPositionsSeen,
    maxOrd: r.maxOrdersSeen,
    sl: r.slExits,
    tp: r.tpExits,
    indications: r.byIndication,
    playbooks: r.byPlaybook,
    kinds: r.byKind,
    hours,
    ms,
  };
  console.log(`\n=== ${label}  shared ${shared}  additive ${additive}  ${ms}ms ===`);
  console.log(
    `PF ${r.pf.toFixed(3)}  WR ${(r.wr * 100).toFixed(1)}%  n=${r.trades}  net=${Number(r.net).toFixed(4)}  eq ${Number(r.equity).toFixed(4)}  placed=${r.ordersPlaced}  filled=${r.ordersFilled}  maxOrd=${r.maxOrdersSeen}  avgPos=${Number(r.avgPositions).toFixed(1)}  avgBlock=${Number(r.avgBlockOrd).toFixed(1)}  mdd=${(r.mdd * 100).toFixed(2)}%  ddt=${Number(r.ddt || 0).toFixed(0)}`,
  );
  console.log("h  eq      pf    wr%    nH   netH     cum      pos  ord  blk  sl   tp   mdd%");
  for (const h of hours) {
    console.log(
      `${String(h.h).padStart(2)} ${h.eq.toFixed(4).padStart(8)} ${h.pf.toFixed(2).padStart(5)} ${(h.wr * 100).toFixed(1).padStart(5)} ${String(h.n).padStart(5)} ${h.net.toFixed(3).padStart(8)} ${h.netCum.toFixed(3).padStart(8)} ${String(h.pos).padStart(4)} ${String(h.ord).padStart(4)} ${String(h.block).padStart(4)} ${String(h.sl).padStart(4)} ${String(h.tp).padStart(4)} ${(h.mdd * 100).toFixed(1).padStart(5)}`,
    );
  }
  if (row.indications) {
    console.log("indications");
    for (const i of row.indications) console.log(`  ${i.id.padEnd(11)} n=${String(i.n).padStart(5)} PF ${i.pf.toFixed(2)} wr ${(i.wr * 100).toFixed(0)}%`);
  }
  return row;
}

const tAll = Date.now();
const a = run("shared 1.5 / add 0.2", 1.5, 0.2);
const b = run("shared 3.0 / add 0.4", 3, 0.4);
const out = { hours: HOURS, symbols: SYMBOLS, startEquity: EQUITY, complete: true, elapsedMs: Date.now() - tAll, cells: [a, b] };
writeFileSync("public/sim-24h-80-block.json", JSON.stringify(out));

function spark(xs, key) {
  const vs = xs.map((x) => Number(x[key]) || 0);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  return vs.map((v) => 8 + ((v - lo) / span) * 52);
}

function svg(hours, key, color) {
  const ys = spark(hours, key);
  const d = ys.map((y, i) => `${i === 0 ? "M" : "L"}${4 + i * (220 / Math.max(1, ys.length - 1)).toFixed(1)},${(68 - y).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 228 72" width="228" height="72"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>24h × 80 Block vol</title>
<style>
body{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b1220;color:#d6e4ff;margin:24px}
h1{font:600 20px/1.2 ui-sans-serif,system-ui;color:#fff}
table{border-collapse:collapse;margin:12px 0 28px;width:100%}
th,td{border-bottom:1px solid #1e2a44;padding:4px 8px;text-align:right}
th:first-child,td:first-child{text-align:left}
.ok{color:#3dd68c}.bad{color:#ff7b7b}
.card{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0}
</style></head><body>
<h1>24h × 80 · $10 · complete · Block parallel</h1>
<p>short 0.42/1.7 trailing ATR · cost step 3 · shared/additive independent</p>
${out.cells.map((c) => `
<h2>${c.label}</h2>
<p>PF <b class="${c.pf>=1?"ok":"bad"}">${c.pf.toFixed(3)}</b> · n=${c.trades} · net ${c.net.toFixed(4)} · eq ${c.equity.toFixed(4)} · placed ${c.placed} · filled ${c.filled} · maxOrd ${c.maxOrd} · avgPos ${Number(c.avgPos).toFixed(1)} · avgBlock ${Number(c.avgBlock).toFixed(1)} · MDD ${(c.mdd*100).toFixed(2)}%</p>
<div class="card">${svg(c.hours,"eq","#3dd68c")}${svg(c.hours,"pf","#6ea8fe")}${svg(c.hours,"n","#c8a2ff")}</div>
<table><thead><tr><th>h</th><th>eq</th><th>PF</th><th>WR</th><th>n</th><th>net</th><th>cum</th><th>pos</th><th>ord</th><th>blk</th><th>SL</th><th>TP</th><th>MDD</th></tr></thead>
<tbody>${c.hours.map((h)=>`<tr><td>${h.h}</td><td>${h.eq.toFixed(4)}</td><td>${h.pf.toFixed(2)}</td><td>${(h.wr*100).toFixed(1)}%</td><td>${h.n}</td><td>${h.net.toFixed(4)}</td><td>${h.netCum.toFixed(4)}</td><td>${h.pos}</td><td>${h.ord}</td><td>${h.block}</td><td>${h.sl}</td><td>${h.tp}</td><td>${(h.mdd*100).toFixed(1)}%</td></tr>`).join("")}</tbody></table>
<table><thead><tr><th>indication</th><th>n</th><th>PF</th><th>WR</th></tr></thead>
<tbody>${(c.indications||[]).map((i)=>`<tr><td>${i.id}</td><td>${i.n}</td><td>${i.pf.toFixed(2)}</td><td>${(i.wr*100).toFixed(0)}%</td></tr>`).join("")}</tbody></table>
`).join("")}
</body></html>`;
writeFileSync("public/sim-24h-80-block.html", html);
console.log("\nwrote public/sim-24h-80-block.json + html", Date.now() - tAll, "ms");
