#!/usr/bin/env node
/** 24h × 80 complete open tape · $10 · 3.0/0.4 screenshot path */
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

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
  axisPartialRatio: 3,
};

const block = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  liveDisable: false,
  autoEval: true,
  windows: true,
  stack: true,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  minActiveLevel: 1,
  pauseCountRatio: 0,
  volumeMode: "parallel",
  overallMode: "parallel",
  sharedVolumeRatio: 3,
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  overallVolumeRatio: 3,
  maxVolumeMultiplier: 8,
};

const t0 = Date.now();
const { report: r, engine } = simulateHours(24, CFG, "trailing", {
  symbolCount: 80,
  rangeType: "atr",
  block,
  equity: 10,
  costStep: 3,
  complete: true,
  comboOnly: false,
  prehours: 0,
  orderType: "limit",
});
const ms = Date.now() - t0;
const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
const pct = (n, d = 2) => `${(Number(n || 0) * 100).toFixed(d)}%`;
const line = (s) => {
  console.log(s);
  return s + "\n";
};

const hours = r.hourly || [];
const gatedGreen = hours.filter((h) => Number(h.gatedN || h.trades || 0) > 0 && Number(h.gatedNet ?? h.net) >= -1e-9).length;
const paperGreen = hours.filter((h) => Number(h.paperNet ?? h.net) >= 0 && Number(h.paperN ?? h.trades) > 0).length;
const startEq = r.startEquity || 10;
const livePf = Number(r.liveGated?.pf || r.pf || 0);
const liveN = Number(r.liveGated?.n ?? r.trades ?? 0);
const modes = r.lastN?.modes || r.stages?.afterTypes?.modes || {};
const overall = r.lastN?.overall || r.stages?.afterTypes?.overall;
const complete = r.lastN?.complete || r.stages?.afterTypes?.complete;
const comboTapes = r.comboTapes || {};
const blockPf = Number((r.byPlaybook || []).find((p) => p.id === "block")?.pf || 0);

let txt = "";
txt += line(`COMPLETE 24h×80 open tape · ${(ms / 1000).toFixed(1)}s · 0.42/1.7 trail 1.5 · Block 3.0/0.4`);
txt += line(`Mode Independent last-N · no intern-all pre · performing live`);
txt += line(`LIVE gated PF ${fmt(livePf, 3)} n=${liveN}  paper PF ${fmt(r.paperPf, 3)}  selected n=${r.selected?.n ?? 0} PF ${fmt(r.selected?.pf, 3)}  WR ${pct(r.wr, 1)}  n=${r.trades}  net ${fmt(r.realizedNet ?? r.net, 5)}  eq ${fmt(r.equity, 4)}`);
txt += line(`greenHours gated ${gatedGreen}/${hours.length}  paper ${paperGreen}/${hours.length}`);
txt += line(`MDD ${pct(r.mdd)}  DDT ${r.ddt}  avgPos ${fmt(r.avgPositions)}  avgOrd ${fmt(r.avgOrders, 1)}  avgBlock ${fmt(r.avgBlockOrd, 1)}  maxMargin ${fmt(r.maxMargin, 4)}`);
txt += line(`orders placed ${r.ordersPlaced}  filled ${r.ordersFilled}  SL ${r.slExits}  TP ${r.tpExits}`);
txt += line("");

txt += line("PROCESSINGS");
for (const id of ["independent", "combined", "parallel", "majority"]) {
  const row = modes[id];
  if (!row) continue;
  txt += line(`  ${id.padEnd(14)} ${row.pass ? "pass" : "fail"}  PF ${fmt(row.gatedPf ?? row.pf, 3)}  n=${row.gatedN ?? row.n ?? 0}  net ${fmt(row.net, 5)}`);
}
if (overall) txt += line(`  ${"overall 2+".padEnd(14)} ${overall.pass ? "pass" : "fail"}  ${overall.positive ?? 0}/3  PF ${fmt(overall.gatedPf ?? overall.pf, 3)}`);
if (complete) txt += line(`  ${"complete".padEnd(14)} ${complete.pass ? "correct" : "check"}`);
txt += line("");

txt += line("COMBO TAPES (intern independent)");
for (const [k, row] of Object.entries(comboTapes)) {
  txt += line(`  ${k.padEnd(12)} n=${String(row.n).padStart(4)}  PF ${fmt(row.pf, 3)}  net ${fmt(row.net, 5)}  ${row.ok ? "live" : "intern"}`);
}
txt += line(`  block overlay PF ${fmt(blockPf, 3)}`);
txt += line("");

const buckets = [
  ["playbook", r.byPlaybook],
  ["kind", r.byKind],
  ["tactic", r.byTactic],
  ["indication", r.byIndication],
];
for (const [name, rows] of buckets) {
  txt += line(`${name.padEnd(12)} n      PF     WR      net`);
  for (const row of rows || []) {
    const net = (row.profit || 0) - (row.loss || 0);
    txt += line(`  ${String(row.id).padEnd(12)} ${String(row.n).padStart(5)}  ${fmt(row.pf).padStart(5)}  ${pct(row.wr, 0).padStart(4)}  ${fmt(net, 5).padStart(9)}`);
  }
  txt += line("");
}

txt += line("hour  eq      gNet    gPF   pNet    pPF  selPF  MDD    eqUse  avgPos avgOrd  placed filled  blk   n  gN  SL  TP");
for (const h of hours) {
  txt += line(
    `${String(h.h).padStart(2)}  ${fmt(h.eq, 3).padStart(7)} ${fmt(h.gatedNet ?? 0, 5).padStart(8)} ${fmt(h.gatedPf ?? h.hourPf, 3).padStart(5)} ${fmt(h.paperNet ?? h.net, 5).padStart(8)} ${fmt(h.paperPf ?? h.hourPf).padStart(5)} ${fmt(h.selPf ?? 0, 2).padStart(5)}  ${pct(h.mdd).padStart(6)} ${pct(h.eqUsePct ?? h.marginPct).padStart(6)} ${fmt(h.avgPos ?? h.pos, 1).padStart(6)} ${fmt(h.avgOrd ?? h.orders, 1).padStart(6)} ${String(h.placed ?? 0).padStart(6)} ${String(h.filled ?? 0).padStart(6)} ${String(h.blockOrd).padStart(4)} ${String(h.trades).padStart(4)} ${String(h.gatedN ?? 0).padStart(4)} ${String(h.hourSl ?? 0).padStart(3)} ${String(h.hourTp ?? 0).padStart(3)}`,
  );
}

const lose = hours.filter((h) => Number(h.gatedN || h.trades || 0) > 0 && Number(h.gatedNet ?? h.net) < -1e-9);
const thin = hours.filter((h) => Number(h.trades || h.gatedN || 0) < 100);
txt += line("");
txt += line(`gated+ hours ${gatedGreen}/${hours.length}${lose.length ? "  scratch " + lose.map((h) => h.h).join(",") : ""}${thin.length ? "  thin " + thin.map((h) => h.h).join(",") : ""}`);
txt += line(`ok equity>=10 ${Number(r.equity) >= 10}  mixedLeaks ${r.mixedLeaks ?? 0}  gatedGreen ${gatedGreen}/${hours.length}  live n=${liveN}`);

const htmlHours = hours
  .map((h) => {
    const n = Number(h.trades || h.gatedN || 0);
    const net = Number(h.net ?? h.gatedNet ?? 0);
    const pf = Number(h.hourPf || h.gatedPf || h.pf || 0);
    return `<tr><td>${h.h}</td><td>${Number(h.eq).toFixed(4)}</td><td class="${pf >= 1 ? "ok" : "bad"}">${pf.toFixed(2)}</td><td>${n}</td><td class="${net >= 0 ? "ok" : "bad"}">${net >= 0 ? "+" : ""}${net.toFixed(4)}</td><td>${Number(h.avgMargin ?? h.margin ?? 0).toFixed(4)}</td><td>${(Number(h.mdd) * 100).toFixed(2)}%</td><td>${h.pos}</td><td>${h.orders}</td><td>${h.blockOrd}</td></tr>`;
  })
  .join("");
const marksAt = [1, 6, 12, 18, 24]
  .map((n) => hours.find((h) => h.h === n))
  .filter(Boolean)
  .map((h) => {
    const n = Number(h.trades || h.gatedN || 0);
    const net = Number(h.net ?? h.gatedNet ?? 0);
    const pf = Number(h.hourPf || h.gatedPf || h.pf || 0);
    return `<tr><td>${h.h}</td><td>${Number(h.eq).toFixed(2)}</td><td class="${pf >= 1 ? "ok" : "bad"}">${pf.toFixed(2)}</td><td>${n}</td><td class="${net >= 0 ? "ok" : "bad"}">${net >= 0 ? "+" : ""}${net.toFixed(2)}</td><td>${Number(h.avgMargin ?? h.margin ?? 0).toFixed(2)}</td></tr>`;
  })
  .join("");
const inds = (r.byIndication || [])
  .map((i) => `<tr><td>${i.id}</td><td>${i.n}</td><td class="${i.pf >= 1 ? "ok" : "bad"}">${Number(i.pf).toFixed(2)}</td><td>${Math.round((i.wr || 0) * 100)}%</td></tr>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>24h × $10 complete</title>
<style>
body{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b1220;color:#d6e4ff;margin:24px}
h1{font:600 20px/1.2 ui-sans-serif,system-ui;color:#fff}
h2{font:600 16px/1.3 ui-sans-serif,system-ui;color:#fff;margin-top:36px}
h3{font:600 13px/1.3 ui-sans-serif,system-ui;color:#8aa0c8;margin-top:20px}
table{border-collapse:collapse;margin:12px 0 28px;width:100%}
th,td{border-bottom:1px solid #1e2a44;padding:4px 8px;text-align:right}
th:first-child,td:first-child{text-align:left}
.ok{color:#3dd68c}.bad{color:#ff7b7b}
</style></head><body>
<h1>24h × 80 · $10 · complete open tape</h1>
<p>short 0.42/1.7 trailing · Block 3.0/0.4 · no intern-all pre · ${ms} ms</p>
<h2>3.0 / 0.4 by hour</h2>
<p>PF <b class="${livePf >= 1 ? "ok" : "bad"}">${livePf.toFixed(3)}</b> · n=${liveN} · net ${Number(r.realizedNet ?? r.net).toFixed(4)} · eq ${Number(r.equity).toFixed(4)} · green ${gatedGreen}/24 · MDD ${(Number(r.mdd) * 100).toFixed(2)}%</p>
<h3>3.0 / 0.4 by hour · marks 1 / 6 / 12 / 18 / 24</h3>
<table><thead><tr><th>h</th><th>eq</th><th>PF</th><th>n</th><th>net</th><th>margin</th></tr></thead><tbody>${marksAt}</tbody></table>
<h3>Hour by hour</h3>
<table><thead><tr><th>h</th><th>eq</th><th>PF</th><th>n</th><th>net</th><th>margin</th><th>MDD</th><th>pos</th><th>ord</th><th>blk</th></tr></thead><tbody>${htmlHours}</tbody></table>
<table><thead><tr><th>indication</th><th>n</th><th>PF</th><th>WR</th></tr></thead><tbody>${inds}</tbody></table>
</body></html>`;

mkdirSync("public", { recursive: true });
writeFileSync("public/sim-24h-10usd.txt", txt);
writeFileSync("public/sim-24h-10usd.json", JSON.stringify({ ms, report: { pf: r.pf, n: r.trades, eq: r.equity, green: gatedGreen, hourly: hours, indications: r.byIndication } }));
writeFileSync("public/sim-24h-10usd.html", html);
writeFileSync("artifacts/sim-24h-10usd.txt", txt);
writeFileSync("artifacts/sim-24h-10usd.html", html);
console.log("wrote public/sim-24h-10usd.*", ms, "ms");
