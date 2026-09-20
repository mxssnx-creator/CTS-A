#!/usr/bin/env node
/** Local-only 72h × 120 · $1 equity · min volume · Block off / Sets / Overall. */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_THRESHOLDS,
  BLOCK_VOLUME_RATIO_MIN,
  POSITION_COST_PCT,
  MIN_VOLUME_FACTOR,
  positionNotional,
} from "../src/lib/desk/engine.ts";
import { overallLiveStats, simulateHours } from "../src/lib/desk/vst.ts";

const HOURS = 72;
const SYMBOLS = 120;
const EQUITY = 1;
const COST_STEP = 3;
const VR = BLOCK_VOLUME_RATIO_MIN;

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  tpAtr: 0.4,
  slOfTp: 1.5,
  slAtr: 0.6,
  tpRatio: 1 / 1.5,
  trailingPct: 1.5,
  maxHoldTicks: 20000,
  maxHoldBars: 8,
};

const BASE_BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "shared",
  overallMode: "shared",
  windows: true,
  stack: true,
  volumeRatio: VR,
  overallVolumeRatio: VR,
  sharedVolumeRatio: VR,
  relVolumeRatio: VR,
  maxVolumeMultiplier: 1 + VR,
  relAdditive: true,
  autoEval: true,
  sides: "both",
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
};

const MODES = {
  off: { ...BASE_BLOCK, enabled: false, overall: false, sets: false, stack: false, windows: false },
  sets: { ...BASE_BLOCK, enabled: true, overall: false, sets: true },
  overall: { ...BASE_BLOCK, enabled: true, overall: true, sets: false },
};

function pack(label, tactic, range, r, engine, ms) {
  const live = overallLiveStats(engine);
  return {
    label,
    tactic,
    range,
    ms,
    pf: r.pf,
    wr: r.wr,
    net: r.net,
    trades: r.trades,
    wins: r.wins,
    mdd: r.mdd,
    ddt: r.ddt,
    equity: r.equity,
    startEquity: r.startEquity,
    costStep: r.costStep,
    unitNotional: r.unitNotional,
    slExits: r.slExits,
    tpExits: r.tpExits,
    avgPositions: r.avgPositions,
    avgOrders: r.avgOrders,
    avgSlots: r.avgSlots,
    avgBlockOrd: r.avgBlockOrd,
    avgNotional: r.avgNotional,
    maxPositionsSeen: r.maxPositionsSeen,
    maxOrdersSeen: r.maxOrdersSeen,
    hourly: r.hourly,
    curve: r.curve,
    bySymbol: (r.bySymbol || []).slice(0, 16),
    worst: [...(r.bySymbol || [])].sort((a, b) => a.net - b.net).slice(0, 8),
    best: [...(r.bySymbol || [])].sort((a, b) => b.net - a.net).slice(0, 8),
    indications: live.indications || [],
    strategies: live.strategies || [],
    hoursLive: live.hours || {},
  };
}

function runCell(label, tactic, range, block) {
  const t0 = Date.now();
  const { report, engine } = simulateHours(HOURS, CFG, tactic, {
    symbolCount: SYMBOLS,
    rangeType: range,
    block,
    equity: EQUITY,
    costStep: COST_STEP,
  });
  const row = pack(label, tactic, range, report, engine, Date.now() - t0);
  console.log(
    `${label.padEnd(8)} ${tactic}/${range} PF ${row.pf.toFixed(2)} n=${row.trades} ddt=${Number(row.ddt || 0).toFixed(0)} net=${Number(row.net).toFixed(4)} eq=${Number(row.equity).toFixed(4)} avgPos=${Number(row.avgPositions).toFixed(2)} vol=${Number(row.avgNotional).toFixed(4)} ${row.ms}ms`,
  );
  return row;
}

const tAll = Date.now();
const cells = [];
for (const tactic of ["trailing", "hybrid"]) {
  for (const [label, block] of Object.entries(MODES)) {
    cells.push(runCell(label, tactic, "atr", block));
  }
}

const byMode = {};
for (const c of cells) {
  (byMode[c.label] ??= []).push(c);
}

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function spark(vals, w = 220, h = 44, lo, hi) {
  const xs = vals.map((v) => Number(v) || 0);
  if (!xs.length) return "";
  const min = lo ?? Math.min(...xs);
  const max = hi ?? Math.max(...xs);
  const span = max - min || 1;
  const pts = xs
    .map((v, i) => {
      const x = (i / Math.max(1, xs.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="spark"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="${pts}"/></svg>`;
}

function hourTable(hourly) {
  const rows = (hourly || [])
    .map(
      (h) => `<tr>
      <td>${h.h}</td>
      <td class="${(h.pf ?? 0) >= 1 ? "up" : "dn"}">${Number(h.pf ?? 0).toFixed(2)}</td>
      <td>${h.trades}</td>
      <td class="${h.net >= 0 ? "up" : "dn"}">${Number(h.net).toFixed(4)}</td>
      <td>${Number(h.eq).toFixed(4)}</td>
      <td>${Number(h.mdd ?? 0).toFixed(2)}</td>
      <td>${Number(h.ddt ?? 0).toFixed(0)}</td>
      <td>${h.pos ?? 0}</td>
      <td>${h.orders ?? 0}</td>
      <td>${h.blockOrd ?? 0}</td>
      <td>${Number(h.notional ?? 0).toFixed(4)}</td>
      <td>${h.sl ?? 0}/${h.tp ?? 0}</td>
    </tr>`,
    )
    .join("");
  return `<table><thead><tr>
    <th>H</th><th>PF</th><th>N</th><th>Hour net</th><th>Eq</th><th>MDD</th><th>DDT</th><th>Pos</th><th>Ord</th><th>Block</th><th>Notional</th><th>SL/TP</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function cellCard(c) {
  const pf = (hourly) => (hourly || []).map((h) => h.pf ?? 0);
  const eq = (hourly) => (hourly || []).map((h) => h.eq ?? 0);
  const pos = (hourly) => (hourly || []).map((h) => h.pos ?? 0);
  return `<section class="card">
    <header>
      <h2>${htmlEscape(c.label)} · ${htmlEscape(c.tactic)}/${htmlEscape(c.range)}</h2>
      <p class="${c.pf >= 1 ? "up" : "dn"}">PF ${c.pf.toFixed(2)} · ${c.trades} trades · DDT ${Number(c.ddt || 0).toFixed(0)} · net ${Number(c.net).toFixed(4)}</p>
    </header>
    <div class="kpis">
      <div><span>WR</span><b>${(c.wr * 100).toFixed(1)}%</b></div>
      <div><span>MDD</span><b>${(c.mdd * 100).toFixed(2)}%</b></div>
      <div><span>Avg pos</span><b>${Number(c.avgPositions).toFixed(2)}</b></div>
      <div><span>Avg ord</span><b>${Number(c.avgOrders).toFixed(2)}</b></div>
      <div><span>Avg notional</span><b>${Number(c.avgNotional).toFixed(4)}</b></div>
      <div><span>Unit</span><b>${Number(c.unitNotional).toFixed(5)}</b></div>
    </div>
    <div class="sparks">
      <div><small>PF / hour</small>${spark(pf(c.hourly), 260, 48, 0, Math.max(2, ...pf(c.hourly)))}</div>
      <div><small>Equity</small>${spark(eq(c.hourly), 260, 48)}</div>
      <div><small>Open pos</small>${spark(pos(c.hourly), 260, 48, 0)}</div>
    </div>
    ${hourTable(c.hourly)}
    <h3>Best / worst symbols</h3>
    <p class="syms">${(c.best || []).map((s) => `${s.id} ${Number(s.pf).toFixed(2)}`).join(" · ")}</p>
    <p class="syms dn">${(c.worst || []).map((s) => `${s.id} ${Number(s.pf).toFixed(2)}`).join(" · ")}</p>
  </section>`;
}

const unit = positionNotional(EQUITY, COST_STEP);
const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>CTS-A · 72h × 120 · $1 · min volume</title>
<style>
  :root { --ink:#161616; --muted:#525252; --line:#e0e0e0; --up:#198038; --dn:#da1e28; --bg:#f4f4f4; --card:#fff; --blue:#0f62fe; }
  * { box-sizing: border-box; }
  body { margin:0; font: 14px/1.45 "IBM Plex Sans", system-ui, sans-serif; color:var(--ink); background:var(--bg); }
  header.top { padding: 28px 32px 12px; }
  h1 { margin:0; font-size: 28px; }
  .sub { color:var(--muted); max-width: 720px; }
  .grid { display:grid; gap:16px; padding: 12px 32px 40px; }
  .card { background:var(--card); border:1px solid var(--line); padding:18px 20px 8px; overflow:auto; }
  .card h2 { margin:0; font-size:18px; }
  .card header p { margin:4px 0 12px; }
  .kpis { display:grid; grid-template-columns: repeat(6, minmax(90px,1fr)); gap:8px; margin-bottom:12px; }
  .kpis div { background:#f4f4f4; padding:8px 10px; }
  .kpis span { display:block; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  table { width:100%; border-collapse:collapse; font-variant-numeric: tabular-nums; font-size:12px; }
  th { text-align:left; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); padding:6px 8px 6px 0; }
  td { border-top:1px solid var(--line); padding:5px 8px 5px 0; }
  .up { color:var(--up); } .dn { color:var(--dn); }
  .sparks { display:flex; gap:16px; flex-wrap:wrap; margin: 8px 0 14px; color:var(--blue); }
  .sparks small { display:block; color:var(--muted); font-size:11px; }
  .syms { font-size:12px; color:var(--muted); }
  .sum td { font-weight:600; }
</style></head>
<body>
<header class="top">
  <p style="letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:var(--muted)">Local paper · does not touch live</p>
  <h1>72h × 120 symbols · $1 book · min volume</h1>
  <p class="sub">Position cost ${POSITION_COST_PCT * 100}% · cost step ${COST_STEP} · unit ${unit.toFixed(5)} · Block vol ${VR} shared · min VF ${MIN_VOLUME_FACTOR}. Arms: off / Sets / Overall. Short 0.4 / 1.5 trailing+hybrid ATR.</p>
</header>
<div class="grid">
  <section class="card">
    <h2>Summary</h2>
    <table>
      <thead><tr><th>Block</th><th>Tactic</th><th>PF</th><th>N</th><th>WR</th><th>Net</th><th>Eq</th><th>MDD</th><th>DDT</th><th>Avg pos</th><th>Avg ord</th><th>Avg notional</th></tr></thead>
      <tbody>
        ${cells
          .map(
            (c) => `<tr class="sum">
          <td>${c.label}</td><td>${c.tactic}</td>
          <td class="${c.pf >= 1 ? "up" : "dn"}">${c.pf.toFixed(2)}</td>
          <td>${c.trades}</td>
          <td>${(c.wr * 100).toFixed(1)}%</td>
          <td class="${c.net >= 0 ? "up" : "dn"}">${Number(c.net).toFixed(4)}</td>
          <td>${Number(c.equity).toFixed(4)}</td>
          <td>${(c.mdd * 100).toFixed(2)}%</td>
          <td>${Number(c.ddt || 0).toFixed(0)}</td>
          <td>${Number(c.avgPositions).toFixed(2)}</td>
          <td>${Number(c.avgOrders).toFixed(2)}</td>
          <td>${Number(c.avgNotional).toFixed(4)}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>
  ${cells.map(cellCard).join("\n")}
</div>
</body></html>`;

const out = {
  hours: HOURS,
  symbols: SYMBOLS,
  equity: EQUITY,
  costStep: COST_STEP,
  unitNotional: unit,
  positionCostPct: POSITION_COST_PCT,
  minVolumeFactor: MIN_VOLUME_FACTOR,
  blockVolume: VR,
  elapsedMs: Date.now() - tAll,
  cells,
  byMode,
};
writeFileSync("public/sim-72h-1usd.json", JSON.stringify(out));
writeFileSync("public/sim-72h-1usd.html", html);
console.log("wrote public/sim-72h-1usd.html", out.elapsedMs, "ms");
