#!/usr/bin/env node
/** 20h pre-eval + 12h × 40 complete computing · hour-by-hour stats */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  EVAL_POS_N,
  VALID_EXEC_POS_N,
  LIVE_DISABLE_N,
  SHORT_EVAL_HOURS,
} from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  tpAtr: 0.42,
  slOfTp: 1.75,
  slAtr: 0.735,
  tpRatio: 1 / 1.75,
  trailingPct: 1.5,
  maxHoldTicks: 24,
  maxHoldBars: 3,
};

const block = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  liveLastN: LIVE_DISABLE_N,
  validExecN: VALID_EXEC_POS_N,
  liveExecN: VALID_EXEC_POS_N,
  liveDisable: true,
  autoEval: true,
  windows: true,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  minActiveLevel: 1,
  volumeMode: "parallel",
  overallMode: "shared",
  sharedVolumeRatio: 1.5,
  volumeRatio: 0.2,
  overallVolumeRatio: 1.5,
};

const t0 = Date.now();
const { report: r, engine } = simulateHours(12, CFG, "hybrid", {
  symbolCount: 40,
  rangeType: "atr",
  block,
  equity: 10,
  costStep: 3,
  complete: true,
  prehours: SHORT_EVAL_HOURS,
  orderType: "limit",
});
const ms = Date.now() - t0;
const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
const pct = (n, d = 2) => `${(Number(n || 0) * 100).toFixed(d)}%`;
const cls = (n, good = 0) => (Number(n) > good ? "ok" : Number(n) < good ? "bad" : "");
const line = (s) => {
  console.log(s);
  return s + "\n";
};

const hours = r.hourly || [];
const green = hours.filter((h) => h.net > 1e-9).length;
const startEq = r.startEquity || 10;

let txt = "";
txt += line(`COMPLETE 12h×40 +${r.prehours}h pre · ${ms}ms · last-N eval${EVAL_POS_N}/valid${VALID_EXEC_POS_N}/disable${LIVE_DISABLE_N}`);
txt += line(`LIVE  PF ${fmt(r.pf, 3)}  paper ${fmt(r.paperPf, 3)}  WR ${pct(r.wr, 1)}  n=${r.trades}  realized=${fmt(r.realizedNet, 4)}  eq ${fmt(r.equity, 4)}`);
txt += line(`PRE   PF ${fmt(r.pre?.pf, 3)}  WR ${pct(r.pre?.wr, 1)}  n=${r.pre?.trades ?? 0}  eq ${fmt(r.pre?.equity, 4)}`);
txt += line(`MDD ${pct(r.mdd)}  DDT ${r.ddt}  avgPos ${fmt(r.avgPositions)}  avgOrd ${fmt(r.avgOrders, 1)}  avgBlock ${fmt(r.avgBlockOrd, 1)}  maxMargin ${fmt(r.maxMargin, 4)}  eqUse ${pct((r.maxMargin || 0) / Math.max(r.equity, startEq))}`);
txt += line(`orders placed ${r.ordersPlaced}  filled ${r.ordersFilled}  SL ${r.slExits}  TP ${r.tpExits}  open pos ${r.openPositions}  open ord ${r.openOrders}`);
txt += line(`greenHours ${green}/${hours.length}  selected n=${r.selected?.n ?? 0} PF ${fmt(r.selected?.pf)}  keys ${(r.selected?.keys || []).slice(0, 6).join(",") || "—"}`);
txt += line(`floors short ${fmt(r.floors?.short)} base ${fmt(r.floors?.base)} block ${fmt(r.floors?.block)} overall ${fmt(r.floors?.overall)}`);
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
    txt += line(`  ${String(row.id).padEnd(12)} ${String(row.n).padStart(5)}  ${fmt(row.pf).padStart(5)}  ${pct(row.wr, 0).padStart(4)}  ${fmt(net, 4).padStart(8)}`);
  }
}
txt += line("");
txt += line("hour  eq      net     mtm    hPF   cumPF  hWR  MDD    eqUse  avgPos avgOrd  blk  nTr  SL  TP  selPF  brk  trd  blkP");
for (const h of hours) {
  const br = h.inds?.break?.pf;
  const tr = h.inds?.trend?.pf;
  const bl = h.plays?.block?.pf;
  txt += line(
    `${String(h.h).padStart(2)}  ${fmt(h.eq, 3).padStart(7)} ${fmt(h.net, 4).padStart(8)} ${fmt(h.mtm, 4).padStart(7)}  ${fmt(h.hourPf).padStart(5)}  ${fmt(h.pf).padStart(5)}  ${pct(h.hourWr ?? h.wr, 0).padStart(3)}  ${pct(h.mdd).padStart(6)} ${pct(h.eqUsePct ?? h.marginPct).padStart(6)} ${fmt(h.avgPos ?? h.pos, 1).padStart(6)} ${fmt(h.avgOrd ?? h.orders, 1).padStart(6)} ${String(h.blockOrd).padStart(4)} ${String(h.trades).padStart(4)} ${String(h.hourSl ?? "").padStart(3)} ${String(h.hourTp ?? "").padStart(3)}  ${fmt(h.selPf ?? 0).padStart(5)}  ${br != null ? fmt(br) : "  - "}  ${tr != null ? fmt(tr) : "  - "}  ${bl != null ? fmt(bl) : "  - "}`,
  );
}
const lose = hours.filter((h) => h.net < -1e-9);
txt += line("");
txt += line(`realized+ hours ${hours.length - lose.length}/${hours.length}${lose.length ? "  scratch " + lose.map((h) => h.h).join(",") : ""}`);
txt += line(`Block windows ${[1, 2, 3, 4, 5, 6].map((n) => `N${n}=${fmt(engine.blockWindows?.[n]?.lastPf || 0)}`).join("  ")}`);

const spark = (vals, key) => {
  const xs = vals.map((v) => Number(v[key]) || 0);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const span = max - min || 1;
  const w = 220;
  const ht = 64;
  const step = xs.length > 1 ? (w - 8) / (xs.length - 1) : w;
  const d = xs.map((v, i) => `${i === 0 ? "M" : "L"}${4 + i * step},${4 + (1 - (v - min) / span) * (ht - 8)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
};

const td = (v, kind) => {
  const n = Number(v);
  const c = kind === "pf" ? cls(n, 1) : kind === "net" ? cls(n, 0) : "";
  return `<td class="${c}">${v}</td>`;
};

const hourRows = hours
  .map((h) => {
    const plays = Object.entries(h.plays || {})
      .map(([k, v]) => `${k} ${fmt(v.pf)} n=${v.n}`)
      .join(" · ");
    const inds = Object.entries(h.inds || {})
      .sort((a, b) => (b[1].n || 0) - (a[1].n || 0))
      .slice(0, 6)
      .map(([k, v]) => `${k} ${fmt(v.pf)}`)
      .join(" · ");
    const tacs = Object.entries(h.tacs || {})
      .map(([k, v]) => `${k} ${fmt(v.pf)}`)
      .join(" · ");
    return `<tr>
      ${td(h.h)}
      ${td(fmt(h.eq, 4))}
      ${td(fmt(h.net, 4), "net")}
      ${td(fmt(h.mtm, 4), "net")}
      ${td(fmt(h.unreal, 4))}
      ${td(fmt(h.hourPf), "pf")}
      ${td(fmt(h.pf), "pf")}
      ${td(fmt(h.selPf ?? 0), "pf")}
      ${td(pct(h.hourWr ?? 0, 0))}
      ${td(pct(h.wr, 0))}
      ${td(pct(h.mdd))}
      ${td(h.ddt)}
      ${td(pct(h.eqUsePct ?? h.marginPct))}
      ${td(fmt(h.avgPos ?? h.pos, 1))}
      ${td(h.pos)}
      ${td(fmt(h.avgOrd ?? h.orders, 1))}
      ${td(h.orders)}
      ${td(h.queued ?? 0)}
      ${td(h.blockOrd)}
      ${td(h.trades)}
      ${td(h.hourSl ?? 0)}
      ${td(h.hourTp ?? 0)}
      ${td(fmt(h.margin, 4))}
      ${td(fmt(h.notional, 2))}
      ${td(fmt(h.vol, 2))}
    </tr>
    <tr class="sub"><td></td><td colspan="24">plays ${plays || "—"} · tacs ${tacs || "—"} · inds ${inds || "—"}</td></tr>`;
  })
  .join("");

const bucketTable = (title, rows) => {
  const body = (rows || [])
    .map((row) => {
      const net = (row.profit || 0) - (row.loss || 0);
      return `<tr><td>${row.id}</td>${td(row.n)}${td(fmt(row.pf), "pf")}${td(pct(row.wr, 0))}${td(fmt(net, 4), "net")}</tr>`;
    })
    .join("");
  return `<h2>${title}</h2><table><thead><tr><th>id</th><th>n</th><th>PF</th><th>WR</th><th>net</th></tr></thead><tbody>${body}</tbody></table>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Complete 12h × 40 hourly</title>
<style>
body{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b1220;color:#d6e4ff;margin:24px}
h1{font:600 22px/1.2 ui-sans-serif,system-ui;color:#fff}
h2{font:600 16px/1.3 ui-sans-serif,system-ui;color:#fff;margin-top:36px}
table{border-collapse:collapse;margin:12px 0 28px;width:100%}
th,td{border-bottom:1px solid #1e2a44;padding:4px 8px;text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}
.ok{color:#3dd68c}.bad{color:#ff7b7b}
.card{display:flex;gap:24px;flex-wrap:wrap;margin:16px 0;align-items:flex-end}
.spark{color:#6ea8fe;display:flex;flex-direction:column;gap:4px}
.spark.ok{color:#3dd68c}
small{color:#8aa0c8}
a{color:#78a9ff}
.sub td{color:#8aa0c8;font-size:11px;text-align:left;border-bottom:1px solid #152038}
.kpi{display:flex;gap:18px;flex-wrap:wrap;margin:12px 0 8px}
.kpi b{display:block;font:600 18px/1.2 ui-sans-serif,system-ui;color:#fff}
</style></head><body>
<h1>Complete computing · 12h × 40 + ${r.prehours}h pre</h1>
<p>short 0.42 / 1.75 trailing ATR · Block shared 1.5 additive 0.2 N1–6 · cost step 3 · $10 · last-N ${EVAL_POS_N}/${VALID_EXEC_POS_N}/${LIVE_DISABLE_N} · ${ms} ms</p>
<p><a href="/sim-complete-hourly.json">JSON</a> · <a href="/sim-complete-hourly.txt">TXT</a></p>
<div class="kpi">
  <div><small>LIVE PF</small><b class="${cls(r.pf, 1)}">${fmt(r.pf, 3)}</b></div>
  <div><small>paper PF</small><b class="${cls(r.paperPf, 1)}">${fmt(r.paperPf, 3)}</b></div>
  <div><small>equity</small><b>${fmt(r.equity, 4)}</b></div>
  <div><small>MDD</small><b>${pct(r.mdd)}</b></div>
  <div><small>DDT</small><b>${r.ddt}</b></div>
  <div><small>trades</small><b>${r.trades}</b></div>
  <div><small>WR</small><b>${pct(r.wr, 1)}</b></div>
  <div><small>green hours</small><b class="${green === hours.length ? "ok" : ""}">${green}/${hours.length}</b></div>
  <div><small>avg pos</small><b>${fmt(r.avgPositions)}</b></div>
  <div><small>avg ord</small><b>${fmt(r.avgOrders, 1)}</b></div>
  <div><small>max eq use</small><b>${pct((r.maxMargin || 0) / Math.max(startEq, r.equity))}</b></div>
</div>
<div class="card">
  <div class="spark ${r.equity >= startEq ? "ok" : ""}">${spark(hours, "eq")}<small>equity</small></div>
  <div class="spark">${spark(hours, "hourPf")}<small>hour PF</small></div>
  <div class="spark">${spark(hours, "mdd")}<small>MDD</small></div>
  <div class="spark">${spark(hours.map((h) => ({ eqUse: (h.eqUsePct ?? h.marginPct) * 100 })), "eqUse")}<small>eq use %</small></div>
  <div class="spark">${spark(hours, "avgPos")}<small>avg positions</small></div>
  <div class="spark">${spark(hours, "avgOrd")}<small>avg orders</small></div>
</div>
<h2>Hour by hour</h2>
<table>
<thead><tr>
<th>h</th><th>balance</th><th>net</th><th>mtm</th><th>unreal</th><th>hPF</th><th>cumPF</th><th>selPF</th><th>hWR</th><th>WR</th><th>MDD</th><th>DDT</th><th>eqUse</th><th>avgPos</th><th>pos</th><th>avgOrd</th><th>ord</th><th>q</th><th>blk</th><th>n</th><th>SL</th><th>TP</th><th>margin</th><th>notional</th><th>vol×</th>
</tr></thead>
<tbody>${hourRows}</tbody>
</table>
${bucketTable("Playbooks / strategy types", r.byPlaybook)}
${bucketTable("Tactics", r.byTactic)}
${bucketTable("Kinds", r.byKind)}
${bucketTable("Indications", r.byIndication)}
<h2>Block N windows</h2>
<p>${[1, 2, 3, 4, 5, 6].map((n) => `N${n} PF ${fmt(engine.blockWindows?.[n]?.lastPf || 0)}`).join(" · ")}</p>
<p>PRE ${r.prehours}h PF ${fmt(r.pre?.pf, 3)} n=${r.pre?.trades ?? 0} · selected ${r.selected?.n ?? 0} PF ${fmt(r.selected?.pf)} · live gated n=${r.liveGated?.n ?? 0}/${r.liveGated?.of ?? 0}</p>
</body></html>`;

writeFileSync("public/sim-complete-hourly.txt", txt);
writeFileSync("public/sim-complete-hourly.html", html);
writeFileSync(
  "public/sim-complete-hourly.json",
  JSON.stringify(
    {
      hours: r.hours,
      prehours: r.prehours,
      symbols: r.symbols,
      ms,
      pf: r.pf,
      paperPf: r.paperPf,
      wr: r.wr,
      trades: r.trades,
      equity: r.equity,
      mdd: r.mdd,
      ddt: r.ddt,
      avgPositions: r.avgPositions,
      avgOrders: r.avgOrders,
      avgBlockOrd: r.avgBlockOrd,
      maxMargin: r.maxMargin,
      realizedNet: r.realizedNet,
      ordersPlaced: r.ordersPlaced,
      ordersFilled: r.ordersFilled,
      slExits: r.slExits,
      tpExits: r.tpExits,
      greenHours: green,
      selected: r.selected,
      floors: r.floors,
      lastN: r.lastN,
      byPlaybook: r.byPlaybook,
      byTactic: r.byTactic,
      byKind: r.byKind,
      byIndication: r.byIndication,
      hourly: hours,
      pre: r.pre,
    },
    null,
    2,
  ),
);
console.log("wrote public/sim-complete-hourly.html json txt");
