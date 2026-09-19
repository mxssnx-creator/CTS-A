#!/usr/bin/env node
/**
 * 3-day (72h) sim on actual live configs · full computations · disable non-performing.
 */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_MIN_PF,
  RANGE_TYPES,
  allShortTpSlCombos,
} from "../src/lib/desk/engine.ts";
import {
  simulateHours,
  completeComputations,
  overallLiveStats,
  LIVE_TACTICS,
} from "../src/lib/desk/vst.ts";

const HOURS = 72;
const SYMS = 50;
const MIN_PF = 1.8;
const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  trailingPct: 1.5,
  dcaCount: 1,
  dcaDrawdown: 0.8,
  axisSpacing: 0.7,
  axisLevels: 5,
  slAtr: 0.525,
  tpRatio: 0.667,
  tpAtr: 0.35,
  slOfTp: 1.5,
  shortRange: true,
  maxHoldBars: 8,
  maxHoldTicks: 16,
};
const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  addOnWin: false,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  volumeMode: "parallel",
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  relAdditive: true,
  sides: "both",
  activeLive: false,
  keepAdjusted: true,
  stack: true,
  windows: true,
  overall: true,
  liveDisableMinPf: MIN_PF,
};

function pack(report, engine, extra = {}) {
  const ov = engine ? overallLiveStats(engine) : null;
  const buckets = (rows) =>
    (rows || [])
      .filter((b) => (b.n || 0) >= 4)
      .map((b) => ({
        key: b.key,
        n: b.n,
        pf: +Number(b.pf || 0).toFixed(3),
        wr: +Number(b.wr || 0).toFixed(3),
        net: +Number(b.net || 0).toFixed(3),
        ok: Number(b.pf) >= MIN_PF && Number(b.net) > 0,
      }));
  return {
    pf: +Number(report.pf || 0).toFixed(3),
    wr: +Number(report.wr || 0).toFixed(3),
    n: report.trades,
    net: +Number(report.net || 0).toFixed(3),
    mdd: +Number(report.mdd || 0).toFixed(4),
    sl: report.slExits,
    tp: report.tpExits,
    ok: report.pf >= MIN_PF && report.net > 0 && report.trades >= 8,
    weak: report.trades >= 8 && report.pf < MIN_PF,
    byIndication: buckets(ov?.byIndication),
    byKind: buckets(ov?.byKind),
    byTactic: buckets(ov?.byTactic),
    byRange: buckets(ov?.byRange),
    byPlaybook: buckets(ov?.byPlaybook),
    byReason: buckets(ov?.byReason),
    lastN: ov?.lastN || {},
    hours: ov?.hours || {},
    ...extra,
  };
}

function run(label, cfg, tactic, range, block) {
  const t0 = Date.now();
  const { report, engine } = simulateHours(HOURS, cfg, tactic, { symbolCount: SYMS, rangeType: range, block });
  return pack(report, engine, { label, tactic, range, block: Boolean(block?.enabled), ms: Date.now() - t0 });
}

const tAll = Date.now();
console.error("=== complete computations 4/8/16/72h × 50 ===");
const complete = completeComputations(CFG, { symbolCount: SYMS, hours: [4, 8, 16, 72] });
console.error(`complete ${complete.cells.length} cells · ${complete.ms || Date.now() - tAll}ms · winner ${complete.winner?.tactic}/${complete.winner?.range} ${complete.winner?.hours}h PF ${Number(complete.winner?.pf || 0).toFixed(2)}`);

const liveRuns = [];
console.error("=== live cfg 72h × 50 · block on/off ===");
for (const tactic of ["trailing", "hybrid", "axis"]) {
  for (const range of ["atr", "fibonacci"]) {
    liveRuns.push(run(`live ${tactic}/${range} block`, CFG, tactic, range, BLOCK));
    liveRuns.push(run(`live ${tactic}/${range} noblock`, CFG, tactic, range, { ...BLOCK, enabled: false }));
  }
}

const shorts = [];
console.error("=== short combos live-allowed 72h × 50 ===");
const shortCombos = allShortTpSlCombos().filter((s) => s.tpAtr + 1e-9 >= 0.35 && s.slOfTp + 1e-9 >= 1.5);
for (const s of shortCombos) {
  const cfg = { ...CFG, ...s, shortRange: true, trailingPct: 1.5, maxHoldTicks: 16 };
  for (const tactic of ["trailing", "hybrid"]) {
    shorts.push(run(`short tp${s.tpAtr}/sl${s.slOfTp} ${tactic} block`, cfg, tactic, "atr", BLOCK));
    shorts.push(run(`short tp${s.tpAtr}/sl${s.slOfTp} ${tactic} noblock`, cfg, tactic, "atr", { ...BLOCK, enabled: false }));
  }
}

const disabled = {};
const kept = [];
const mark = (key, pf, n, net) => {
  if (n < 8) return;
  if (pf + 1e-9 < MIN_PF || net <= 0) disabled[key] = { pf, n, net };
  else kept.push(key);
};
for (const c of complete.cells || []) {
  mark(`tac:${c.tactic}`, c.pf, c.trades, c.net);
  mark(`rng:${c.range}`, c.pf, c.trades, c.net);
  mark(`combo:${c.tactic}:${c.range}:${c.hours}h`, c.pf, c.trades, c.net);
}
for (const r of [...liveRuns, ...shorts]) {
  mark(`run:${r.label}`, r.pf, r.n, r.net);
  for (const b of r.byIndication || []) mark(`ind:${b.key}`, b.pf, b.n, b.net);
  for (const b of r.byKind || []) mark(`kind:${b.key}`, b.pf, b.n, b.net);
  for (const b of r.byTactic || []) mark(`tac:${b.key}`, b.pf, b.n, b.net);
  for (const b of r.byRange || []) mark(`rng:${b.key}`, b.pf, b.n, b.net);
  for (const b of r.byPlaybook || []) mark(`book:${b.key}`, b.pf, b.n, b.net);
}

const deadTactics = new Set();
const deadRanges = new Set();
for (const [k, v] of Object.entries(disabled)) {
  if (k.startsWith("tac:") && !kept.includes(k)) deadTactics.add(k.slice(4));
  if (k.startsWith("rng:") && !kept.includes(k)) deadRanges.add(k.slice(4));
}

const payload = {
  hours: HOURS,
  symbols: SYMS,
  minPf: MIN_PF,
  cfg: CFG,
  at: Date.now(),
  ms: Date.now() - tAll,
  complete: {
    cells: complete.cells,
    winner: complete.winner,
    ok: (complete.cells || []).filter((c) => c.ok).length,
    n: (complete.cells || []).length,
  },
  liveRuns,
  shorts,
  disabled,
  kept: [...new Set(kept)],
  deadTactics: [...deadTactics],
  deadRanges: [...deadRanges],
};
writeFileSync("public/sim-3d-live.json", JSON.stringify(payload, null, 2));
writeFileSync("/tmp/live-disabled-3d.json", JSON.stringify({ at: Date.now(), minPf: MIN_PF, disabled, kept: payload.kept }, null, 2));

function rowsHtml(list, cols) {
  return list
    .map((r) => `<tr class="${r.ok ? "ok" : r.weak ? "bad" : ""}">${cols.map((c) => `<td>${c(r)}</td>`).join("")}</tr>`)
    .join("");
}

const liveSorted = [...liveRuns].sort((a, b) => b.pf - a.pf);
const shortSorted = [...shorts].sort((a, b) => b.pf - a.pf);
const cells72 = (complete.cells || []).filter((c) => c.hours === 72).sort((a, b) => b.pf - a.pf);
const fail = Object.entries(disabled)
  .sort((a, b) => a[1].pf - b[1].pf)
  .slice(0, 40);

const html = `<!doctype html><html><head><meta charset="utf-8"/><title>3d live sim</title>
<style>
body{font-family:IBM Plex Sans,system-ui,sans-serif;background:#f4f8ff;color:#0b1f3a;margin:24px}
h1{color:#0f62fe} table{border-collapse:collapse;width:100%;margin:12px 0;background:#fff;font-size:13px}
th,td{border:1px solid #d0e2ff;padding:5px 7px;text-align:right} th:first-child,td:first-child{text-align:left}
.ok{color:#0e6027;font-weight:600} .bad{color:#da1e28} .muted{color:#406}
</style></head><body>
<h1>3-day sim · live configs · 50 symbols</h1>
<p class="muted">72h · trail 1.5 · short TP 0.35 / SL 1.5× · Block parallel 0.08 · min PF ${MIN_PF} · ${payload.ms}ms</p>
<p>Complete cells ${payload.complete.n} · ok ${payload.complete.ok} · winner <b>${complete.winner?.tactic}/${complete.winner?.range} ${complete.winner?.hours}h PF ${Number(complete.winner?.pf || 0).toFixed(2)}</b></p>
<h2>Live cfg 72h (block vs off)</h2>
<table><thead><tr><th>run</th><th>PF</th><th>n</th><th>net</th><th>WR</th><th>SL/TP</th><th>MDD</th></tr></thead><tbody>
${rowsHtml(liveSorted, [(r) => r.label, (r) => r.pf.toFixed(2), (r) => r.n, (r) => r.net.toFixed(2), (r) => r.wr.toFixed(2), (r) => `${r.sl}/${r.tp}`, (r) => r.mdd.toFixed(3)])}
</tbody></table>
<h2>Complete 72h matrix</h2>
<table><thead><tr><th>tactic/range</th><th>PF</th><th>n</th><th>net</th><th>WR</th><th>ok</th></tr></thead><tbody>
${cells72.map((c) => `<tr class="${c.ok ? "ok" : "bad"}"><td>${c.tactic}/${c.range}</td><td>${Number(c.pf).toFixed(2)}</td><td>${c.trades}</td><td>${Number(c.net).toFixed(2)}</td><td>${Number(c.wr).toFixed(2)}</td><td>${c.ok}</td></tr>`).join("")}
</tbody></table>
<h2>Short live-allowed</h2>
<table><thead><tr><th>run</th><th>PF</th><th>n</th><th>net</th><th>WR</th></tr></thead><tbody>
${rowsHtml(shortSorted, [(r) => r.label, (r) => r.pf.toFixed(2), (r) => r.n, (r) => r.net.toFixed(2), (r) => r.wr.toFixed(2)])}
</tbody></table>
<h2>Disabled (PF < ${MIN_PF}, n≥8)</h2>
<ul>${fail.map(([k, v]) => `<li class="bad">${k} · PF ${v.pf} n=${v.n} net ${v.net}</li>`).join("") || "<li>none</li>"}</ul>
<p>kept ${payload.kept.length} · dead tactics ${payload.deadTactics.join(", ") || "none"} · dead ranges ${payload.deadRanges.join(", ") || "none"}</p>
</body></html>`;
writeFileSync("public/sim-3d-live.html", html);

console.error("\n=== LIVE 72h ===");
for (const r of liveSorted) console.error(`${r.ok ? "OK " : "NO "} ${String(r.pf).padStart(5)} n=${String(r.n).padStart(4)} ${r.label}`);
console.error("\n=== SHORT ===");
for (const r of shortSorted) console.error(`${r.ok ? "OK " : "NO "} ${String(r.pf).padStart(5)} n=${String(r.n).padStart(4)} ${r.label}`);
console.error("\n=== 72h MATRIX ===");
for (const c of cells72) console.error(`${c.ok ? "OK " : "NO "} ${Number(c.pf).toFixed(2).padStart(5)} n=${String(c.trades).padStart(4)} ${c.tactic}/${c.range}`);
console.error(`disabled ${Object.keys(disabled).length} · kept ${payload.kept.length}`);
console.error("wrote public/sim-3d-live.html");
