#!/usr/bin/env node
/**
 * Lowest TP/SL (0.25R) · more symbols · longer horizon.
 * Heatmaps: sim tactic×range, hours×lane, sim vs exchange symbols.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_BLOCK_CONFIG, RANGE_TYPES, TP_SL_RATIOS } from "../src/lib/desk/engine.ts";
import { simulateHours, overallLiveStats } from "../src/lib/desk/vst.ts";

const LOW = { ...DEFAULT_TACTIC_CONFIG, slAtr: 0.35, tpRatio: 0.25, trailingPct: 0.8, dcaCount: 1, maxHoldTicks: 16 };
const BLK = { ...DEFAULT_BLOCK_CONFIG, enabled: true, stack: true, windows: true, counts: [1, 2], maxMultiple: 2, evalPosCount: 16 };
const TACTICS = ["hybrid", "trailing", "axis"];
const RANGES = ["fibonacci", "atr", "volume"];
const HOURS = [8, 24, 48, 72];

function run(hours, tactic, range, symbols, cfg = LOW) {
  const t0 = Date.now();
  const { engine, report } = simulateHours(hours, cfg, tactic, {
    symbolCount: symbols,
    rangeType: range,
    block: BLK,
  });
  const ov = overallLiveStats(engine);
  const by = (ov.bySymbol || []).map((s) => ({
    key: s.key,
    n: s.n,
    pf: s.pf,
    wr: s.wr,
    net: s.net,
  }));
  return {
    tactic,
    range,
    hours,
    symbols,
    pf: report.pf,
    wr: report.wr,
    n: report.trades,
    net: report.net,
    ddt: ov.ddt,
    ms: Date.now() - t0,
    bySymbol: by,
  };
}

function heat(pf) {
  if (!(pf > 0)) return "#2a2a2a";
  if (pf < 1) {
    const t = Math.min(1, (1 - pf) / 0.8);
    const r = Math.round(180 + t * 50);
    return `rgb(${r},${40 + Math.round((1 - t) * 30)},${40})`;
  }
  const t = Math.min(1, (pf - 1) / 3);
  const g = Math.round(70 + t * 120);
  const b = Math.round(200 + t * 40);
  return `rgb(${20},${g},${b})`;
}

function table(rows, cols, get, title) {
  let h = `<h2>${title}</h2><table><thead><tr><th></th>`;
  for (const c of cols) h += `<th>${c}</th>`;
  h += `</tr></thead><tbody>`;
  for (const r of rows) {
    h += `<tr><th>${r}</th>`;
    for (const c of cols) {
      const cell = get(r, c);
      const pf = cell?.pf ?? 0;
      const n = cell?.n ?? 0;
      h += `<td style="background:${heat(pf)}" title="${r}/${c} PF ${pf.toFixed(2)} n=${n}"><b>${pf.toFixed(2)}</b><small>n=${n}</small></td>`;
    }
    h += `</tr>`;
  }
  return h + `</tbody></table>`;
}

const cells = [];
console.log("=== 48h × 24 symbols · lowest TP/SL 0.25R slAtr 0.35 ===");
for (const t of TACTICS) {
  for (const r of RANGES) {
    const x = run(48, t, r, 24);
    cells.push(x);
    console.log(`${t}/${r} PF ${x.pf.toFixed(2)} WR ${x.wr.toFixed(2)} n=${x.n} net ${x.net.toFixed(2)} ${x.ms}ms`);
  }
}

console.log("=== longer: 72h × 50 symbols hybrid/fib + hybrid/atr + trailing/fib ===");
const long = [];
for (const [t, r] of [["hybrid", "fibonacci"], ["hybrid", "atr"], ["trailing", "fibonacci"]]) {
  const x = run(72, t, r, 50);
  long.push(x);
  cells.push(x);
  console.log(`72h50 ${t}/${r} PF ${x.pf.toFixed(2)} WR ${x.wr.toFixed(2)} n=${x.n} net ${x.net.toFixed(2)} ${x.ms}ms`);
}

console.log("=== hours × hybrid/fib 24 symbols ===");
const hourRows = [];
for (const h of HOURS) {
  const x = run(h, "hybrid", "fibonacci", 24);
  hourRows.push(x);
  console.log(`${h}h PF ${x.pf.toFixed(2)} n=${x.n}`);
}

console.log("=== TP/SL ratio sweep 24h × 16 symbols hybrid/fib ===");
const ratios = [];
for (const ratio of [0.25, 0.5, 0.75, 1, 1.5, 2, 2.75, 3]) {
  const cfg = { ...LOW, tpRatio: ratio };
  const x = run(24, "hybrid", "fibonacci", 16, cfg);
  ratios.push({ ...x, ratio });
  console.log(`R ${ratio} PF ${x.pf.toFixed(2)} WR ${x.wr.toFixed(2)} n=${x.n} net ${x.net.toFixed(2)}`);
}

let live = { overall: { bySymbol: [] }, pf: 0, livePf: 0, trades: 0, livePos: 0 };
try {
  live = JSON.parse(readFileSync("/workspace/artifacts/cts-live-heat.json", "utf8"));
} catch {
  live = { overall: { bySymbol: [] }, pf: 0, livePf: 0, trades: 0, livePos: 0 };
}
const exSym = (live.overall?.bySymbol || []).map((s) => ({
  key: s.key,
  n: s.n,
  pf: s.pf || 0,
  wr: s.wr || 0,
  net: s.net || 0,
}));
const simSymMap = new Map((long[0]?.bySymbol || []).map((s) => [s.key, s]));
const names = [...new Set([...exSym.map((s) => s.key), ...[...simSymMap.keys()]])].sort();

const winner = [...cells].sort((a, b) => b.pf - a.pf)[0];
const low48 = cells.filter((c) => c.hours === 48 && c.symbols === 24);

mkdirSync("/workspace/public", { recursive: true });
mkdirSync("/workspace/artifacts", { recursive: true });

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>CTS-A heatmap · lowest TP/SL 0.25R · sim vs exchange</title>
<style>
  :root { --bg:#071018; --fg:#e8f1ff; --muted:#8aa0b8; --line:#1c2a3a; }
  body { margin:0; font:14px/1.45 ui-sans-serif,system-ui; background:var(--bg); color:var(--fg); }
  main { max-width:1200px; margin:0 auto; padding:28px 20px 80px; }
  h1 { font-size:22px; font-weight:650; letter-spacing:-.02em; }
  h2 { margin:28px 0 10px; font-size:15px; color:#9ec0ff; }
  .meta { color:var(--muted); font-size:13px; }
  table { border-collapse:collapse; width:100%; font-variant-numeric:tabular-nums; }
  th,td { border:1px solid var(--line); padding:6px 8px; text-align:center; font-size:12px; }
  th { background:#0d1a28; font-weight:600; }
  td small { display:block; color:#cfe0f4; opacity:.8; font-size:10px; }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:18px 0; }
  .kpi { background:#0d1a28; border:1px solid var(--line); padding:12px 14px; }
  .kpi b { display:block; font-size:20px; }
  .kpi span { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .legend { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; margin:8px 0 16px; }
  .bar { height:8px; width:140px; background:linear-gradient(90deg,#c04028,#1a3048,#14b8c8); }
</style></head><body><main>
<h1>Lowest TP/SL 0.25R · sim vs exchange</h1>
<p class="meta">SL floor 0.35×ATR · TP = 0.25×SL · 24–50 symbols · 8–72h · Block stack 1–2 + windows 1–16. Live book uses 3.00R (not this low test).</p>
<div class="kpis">
  <div class="kpi"><span>Live exchange PF</span><b>${Number(live.pf || 0).toFixed(2)}</b></div>
  <div class="kpi"><span>Live last-N PF</span><b>${Number(live.livePf || 0).toFixed(2)}</b></div>
  <div class="kpi"><span>Live pos / trades</span><b>${live.livePos || 0} / ${live.trades || 0}</b></div>
  <div class="kpi"><span>Best low-TPSL sim</span><b>${winner ? winner.pf.toFixed(2) : "—"}</b><span>${winner ? `${winner.tactic}/${winner.range} ${winner.hours}h` : ""}</span></div>
</div>
<div class="legend"><span>PF</span><span class="bar"></span><span>0 · 1 · 4+</span></div>
${table(
  TACTICS,
  RANGES,
  (t, r) => low48.find((c) => c.tactic === t && c.range === r),
  "48h × 24 symbols · lowest 0.25R · tactic × range",
)}
${table(
  ["hybrid/fibonacci"],
  HOURS.map(String),
  (row, h) => hourRows.find((c) => String(c.hours) === h),
  "hybrid/fibonacci 24 symbols · hours (0.25R)",
)}
${table(
  ["hybrid/fibonacci"],
  ratios.map((x) => String(x.ratio)),
  (row, r) => {
    const x = ratios.find((c) => String(c.ratio) === r);
    return x ? { pf: x.pf, n: x.n } : { pf: 0, n: 0 };
  },
  "24h × 16 symbols · TP/SL ratio sweep (hybrid/fibonacci)",
)}
<h2>72h × 50 symbols · lowest 0.25R</h2>
<table><thead><tr><th>lane</th><th>PF</th><th>WR</th><th>n</th><th>net</th></tr></thead><tbody>
${long
  .map(
    (x) =>
      `<tr><th>${x.tactic}/${x.range}</th><td style="background:${heat(x.pf)}">${x.pf.toFixed(2)}</td><td>${(x.wr * 100).toFixed(0)}%</td><td>${x.n}</td><td>${x.net.toFixed(2)}</td></tr>`,
  )
  .join("")}
</tbody></table>
<h2>Per symbol · sim 72h/50 hybrid/fib 0.25R vs live exchange</h2>
<table><thead><tr><th>symbol</th><th>sim PF</th><th>sim n</th><th>exchange PF</th><th>ex n</th><th>ex net</th></tr></thead><tbody>
${names
  .map((k) => {
    const sm = simSymMap.get(k) || { pf: 0, n: 0, net: 0 };
    const ex = exSym.find((s) => s.key === k) || { pf: 0, n: 0, net: 0 };
    return `<tr><th>${k}</th>
      <td style="background:${heat(sm.pf || 0)}">${(sm.pf || 0).toFixed(2)}<small>n=${sm.n || 0}</small></td>
      <td>${sm.n || 0}</td>
      <td style="background:${heat(ex.pf || 0)}">${(ex.pf || 0).toFixed(2)}<small>n=${ex.n || 0}</small></td>
      <td>${ex.n || 0}</td>
      <td>${Number(ex.net || 0).toFixed(3)}</td></tr>`;
  })
  .join("")}
</tbody></table>
<p class="meta">Generated ${new Date().toISOString()} · lowest R=0.25 is a stress test, not the live default (3.00R).</p>
</main></body></html>`;

writeFileSync("/workspace/public/heatmap-sim-exchange.html", html);
writeFileSync(
  "/workspace/artifacts/heatmap-low-tpsl.json",
  JSON.stringify({ cells, long, hourRows, ratios, live: { pf: live.pf, livePf: live.livePf, trades: live.trades } }, null, 2),
);
console.log("wrote public/heatmap-sim-exchange.html");
console.log("winner", winner);
