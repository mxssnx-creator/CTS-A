#!/usr/bin/env node
/** 24h × 80 complete · $10 · reccoordinated Block configs · hourly line-by-line */
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
  maxHoldTicks: 8,
  maxHoldBars: 3,
};

function blockOf({
  on = true,
  shared = 2,
  additive = 0.1,
  counts = [1, 3, 4, 5, 6],
  pause = 1,
  keep = true,
  minActive = 2,
  volumeMode = "parallel",
  overallMode = "parallel",
  overall = true,
  sets = true,
  stack = true,
  windows = true,
  maxMul = 6,
  overallSymbol = true,
  overallDirection = true,
} = {}) {
  return {
    ...DEFAULT_BLOCK_CONFIG,
    enabled: on,
    volumeMode,
    overallMode,
    overall: on && overall,
    overallSymbol: on && overallSymbol,
    overallDirection: on && overallDirection,
    overallSharedStack: "additive",
    sets: on && sets,
    windows,
    stack,
    volumeRatio: additive,
    relVolumeRatio: additive,
    sharedVolumeRatio: shared,
    overallVolumeRatio: shared,
    maxVolumeMultiplier: Math.max(maxMul, shared * 2),
    counts,
    maxMultiple: Math.max(...counts),
    minMultiple: Math.min(...counts),
    minActiveLevel: minActive,
    pauseCountRatio: pause,
    keepAdjusted: keep,
    sides: "both",
  };
}

const CELLS = [
  { label: "shared 1.5 / add 0.2", on: true, shared: 1.5, additive: 0.2, counts: [1, 2, 3, 4, 5, 6], pause: 0, minActive: 1, maxMul: 8 },
  { label: "3.0 / 0.4 by hour", on: true, shared: 3, additive: 0.4, counts: [1, 2, 3, 4, 5, 6], pause: 0, minActive: 1, maxMul: 8 },
];

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

function run(spec) {
  const t0 = Date.now();
  const { report: r } = simulateHours(HOURS, CFG, "trailing", {
    symbolCount: SYMBOLS,
    rangeType: "atr",
    block: blockOf(spec),
    equity: EQUITY,
    costStep: 3,
    complete: true,
    prehours: 0,
    orderType: "limit",
  });
  const ms = Date.now() - t0;
  const hours = (r.hourly || []).map(hourLine);
  const row = {
    label: spec.label,
    shared: spec.shared,
    additive: spec.additive,
    on: spec.on !== false,
    counts: spec.counts,
    pause: spec.pause,
    minActive: spec.minActive,
    sets: spec.sets !== false,
    volumeMode: spec.volumeMode || "parallel",
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
  console.log(`\n=== ${spec.label}  ${ms}ms ===`);
  console.log(
    `PF ${r.pf.toFixed(3)}  WR ${(r.wr * 100).toFixed(1)}%  n=${r.trades}  net=${Number(r.net).toFixed(4)}  eq ${Number(r.equity).toFixed(4)}  placed=${r.ordersPlaced}  avgBlock=${Number(r.avgBlockOrd).toFixed(1)}  mdd=${(r.mdd * 100).toFixed(2)}%  ddt=${r.ddt}`,
  );
  console.log("h  eq      pf    wr%    nH   netH     cum      pos  ord  blk   notional  margin   m%");
  for (const h of hours) {
    console.log(
      `${String(h.h).padStart(2)} ${h.eq.toFixed(4).padStart(8)} ${h.pf.toFixed(2).padStart(5)} ${(h.wr * 100).toFixed(1).padStart(5)} ${String(h.n).padStart(5)} ${h.net.toFixed(3).padStart(8)} ${h.netCum.toFixed(3).padStart(8)} ${String(h.pos).padStart(4)} ${String(h.ord).padStart(4)} ${String(h.block).padStart(4)} ${h.notional.toFixed(2).padStart(9)} ${h.margin.toFixed(4).padStart(8)} ${(h.marginPct * 100).toFixed(1).padStart(5)}`,
    );
  }
  if (row.indications) {
    console.log("indications");
    for (const i of row.indications) console.log(`  ${i.id.padEnd(11)} n=${String(i.n).padStart(5)} PF ${i.pf.toFixed(2)} WR ${(i.wr * 100).toFixed(1)}%`);
  }
  return row;
}

function spark(vals, w = 220, h = 64) {
  if (!vals.length) return "";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = (w - 8) / Math.max(1, vals.length - 1);
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${4 + i * step},${h - 4 - ((v - min) / span) * (h - 8)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

function htmlOf(out) {
  const ranked = [...out.cells].sort((a, b) => b.pf - a.pf || b.net - a.net);
  const winner = ranked.find((c) => c.on) || ranked[0];
  const rows = ranked
    .map((c) => {
      const cls = c.pf >= 1.15 ? "ok" : c.pf < 1 ? "bad" : "";
      return `<tr><td>${c.label}</td><td class="${cls}">${c.pf.toFixed(3)}</td><td>${(c.wr * 100).toFixed(1)}%</td><td>${c.trades}</td><td>${c.net.toFixed(3)}</td><td>${c.equity.toFixed(3)}</td><td>${(c.mdd * 100).toFixed(2)}%</td><td>${c.ddt}</td><td>${Number(c.avgBlock).toFixed(0)}</td><td>${c.placed}</td><td>${c.ms}ms</td></tr>`;
    })
    .join("");
  const sections = out.cells
    .map((c) => {
      const eq = spark(c.hours.map((h) => h.eq));
      const pf = spark(c.hours.map((h) => h.pf));
      const blk = spark(c.hours.map((h) => h.block));
      const hourRows = c.hours
        .map(
          (h) =>
            `<tr><td>${h.h}</td><td>${h.eq.toFixed(4)}</td><td class="${h.pf >= 1 ? "ok" : "bad"}">${h.pf.toFixed(2)}</td><td>${(h.wr * 100).toFixed(1)}%</td><td>${h.n}</td><td class="${h.net >= 0 ? "ok" : "bad"}">${h.net.toFixed(4)}</td><td>${h.netCum.toFixed(4)}</td><td>${h.pos}</td><td>${h.ord}</td><td>${h.block}</td><td>${h.sl}</td><td>${h.tp}</td><td>${(h.mdd * 100).toFixed(2)}%</td><td>${h.ddt}</td><td>${h.notional.toFixed(2)}</td><td>${h.margin.toFixed(4)}</td></tr>`,
        )
        .join("");
      const inds = (c.indications || [])
        .map((i) => `<tr><td>${i.id}</td><td>${i.n}</td><td class="${i.pf >= 1 ? "ok" : "bad"}">${i.pf.toFixed(2)}</td><td>${(i.wr * 100).toFixed(0)}%</td><td>${Number(i.profit - i.loss).toFixed(4)}</td></tr>`)
        .join("");
      return `<h2>${c.label}</h2>
<p>PF <b class="${c.pf >= 1.15 ? "ok" : "bad"}">${c.pf.toFixed(3)}</b> · n=${c.trades} · net ${c.net.toFixed(4)} · eq ${c.equity.toFixed(4)} · placed ${c.placed} · avgBlock ${Number(c.avgBlock).toFixed(1)} · MDD ${(c.mdd * 100).toFixed(2)}% · pause ${c.pause} · counts ${c.counts.join(",")}</p>
<div class="card"><div class="spark ok">${eq}<small>equity</small></div><div class="spark">${pf}<small>PF</small></div><div class="spark">${blk}<small>block ords</small></div></div>
<table><thead><tr><th>h</th><th>eq</th><th>PF</th><th>WR</th><th>n</th><th>net</th><th>cum</th><th>pos</th><th>ord</th><th>blk</th><th>SL</th><th>TP</th><th>MDD</th><th>DDT</th><th>notional</th><th>margin</th></tr></thead><tbody>${hourRows}</tbody></table>
<table><thead><tr><th>indication</th><th>n</th><th>PF</th><th>WR</th><th>net</th></tr></thead><tbody>${inds}</tbody></table>`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>24h × 80 Block reccoordinate</title>
<style>
body{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b1220;color:#d6e4ff;margin:24px}
h1{font:600 20px/1.2 ui-sans-serif,system-ui;color:#fff}
h2{font:600 16px/1.3 ui-sans-serif,system-ui;color:#fff;margin-top:36px}
table{border-collapse:collapse;margin:12px 0 28px;width:100%}
th,td{border-bottom:1px solid #1e2a44;padding:4px 8px;text-align:right}
th:first-child,td:first-child{text-align:left}
.ok{color:#3dd68c}.bad{color:#ff7b7b}
.card{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0;align-items:flex-end}
.spark{color:#6ea8fe;display:flex;flex-direction:column;gap:4px}
.spark.ok{color:#3dd68c}
small{color:#8aa0c8}
a{color:#78a9ff}
</style></head><body>
<h1>24h × 80 · $10 · Block reccoordinate</h1>
<p>short 0.42/1.7 trailing ATR · cost step 3 · complete indications · winner <b class="ok">${winner.label}</b> PF ${winner.pf.toFixed(3)} net ${winner.net.toFixed(3)}</p>
<p><a href="/sim-24h-80-block.json">JSON</a> · ${out.elapsedMs} ms · ${out.cells.length} configs</p>
<h2>Ranked</h2>
<table><thead><tr><th>config</th><th>PF</th><th>WR</th><th>n</th><th>net</th><th>eq</th><th>MDD</th><th>DDT</th><th>avgBlk</th><th>placed</th><th>ms</th></tr></thead><tbody>${rows}</tbody></table>
${sections}
</body></html>`;
}

const tAll = Date.now();
const cells = [];
for (const spec of CELLS) cells.push(run(spec));
const ranked = [...cells].sort((a, b) => b.pf - a.pf || b.net - a.net);
const out = {
  hours: HOURS,
  symbols: SYMBOLS,
  startEquity: EQUITY,
  complete: true,
  elapsedMs: Date.now() - tAll,
  winner: ranked[0]?.label,
  cells,
};
writeFileSync("public/sim-24h-80-block.json", JSON.stringify(out));
writeFileSync("public/sim-24h-80-block.html", htmlOf(out));
console.log("\nRANKED");
for (const c of ranked) console.log(`${c.pf.toFixed(3).padStart(6)}  net ${c.net.toFixed(3).padStart(7)}  mdd ${(c.mdd * 100).toFixed(2).padStart(5)}%  ${c.label}`);
console.log("\nwrote public/sim-24h-80-block.json + .html", Date.now() - tAll, "ms  winner", out.winner);
