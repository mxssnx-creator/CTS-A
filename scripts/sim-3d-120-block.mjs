#!/usr/bin/env node
/**
 * 72h × 120 symbols · actual live settings · Block ON vs OFF.
 */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_THRESHOLDS,
  AXIS_PARTIAL_RATIO,
} from "../src/lib/desk/engine.ts";
import { initVstEngine, tickVst, TICKS_PER_HOUR, overallLiveStats } from "../src/lib/desk/vst.ts";

const HOURS = 72;
const SYMS = 120;
const TICKS = HOURS * TICKS_PER_HOUR;

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  trailingPct: 1.5,
  axisSpacing: 0.7,
  axisLevels: 5,
  axisPartialRatio: AXIS_PARTIAL_RATIO,
  shortRange: true,
  tpAtr: 0.35,
  slOfTp: 1.5,
  slAtr: 0.525,
  tpRatio: 0.667,
  maxHoldBars: 8,
  maxHoldTicks: 16,
};

const BLOCK_ON = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  autoEval: true,
  overall: true,
  relAdditive: true,
  volumeMode: "parallel",
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  overallVolumeRatio: 1,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  sides: "both",
  keepAdjusted: true,
  stack: true,
  windows: true,
  activeLive: true,
  evalHours: 2,
  liveDisableMinPf: DEFAULT_THRESHOLDS.blockPf,
  minRelPf: DEFAULT_THRESHOLDS.blockPf,
};

const BLOCK_OFF = { ...BLOCK_ON, enabled: false, overall: false, activeLive: false };

function buckets(rows) {
  return (rows || [])
    .filter((b) => (b.n || 0) > 0)
    .map((b) => ({
      k: b.key,
      n: b.n,
      pf: +Number(b.pf || 0).toFixed(3),
      wr: +Number(b.wr || 0).toFixed(3),
      net: +Number(b.net || 0).toFixed(3),
    }))
    .sort((a, b) => b.pf - a.pf);
}

function run(label, tactic, range, blockOn) {
  const block = blockOn ? BLOCK_ON : BLOCK_OFF;
  const t0 = Date.now();
  const e = initVstEngine(CFG, { warmup: 0, symbolCount: SYMS, block, arm: true });
  e.minPf = DEFAULT_THRESHOLDS.minPf;
  e.basePf = DEFAULT_THRESHOLDS.basePf;
  e.axisPf = DEFAULT_THRESHOLDS.axisPf;
  e.blockPf = DEFAULT_THRESHOLDS.blockPf;
  e.shortPf = DEFAULT_THRESHOLDS.shortPf;
  e.shortBasePf = DEFAULT_THRESHOLDS.shortBasePf;
  e.shortRange = true;
  e.strategyToggles = { normal: false, trailing: true, axis: true, block: blockOn, dca: false };
  let posSum = 0;
  let ordSum = 0;
  let partSum = 0;
  let peakPos = 0;
  let peakOrd = 0;
  const seenPartial = new Set();
  const seenBlock = new Set();
  for (let i = 0; i < TICKS; i++) {
    tickVst(e, CFG, tactic, { rangeType: range, symbolCount: SYMS, block });
    const posN = e.positions.length;
    const working = e.orders.filter((o) => o.status === "open" || o.status === "partial");
    const partO = e.orders.filter((o) => o.status === "partial" || (o.filled > 0 && o.remaining > 1e-12));
    posSum += posN;
    ordSum += working.length;
    partSum += partO.length;
    peakPos = Math.max(peakPos, posN);
    peakOrd = Math.max(peakOrd, working.length);
    for (const o of partO) seenPartial.add(o.id);
    for (const o of [...e.orders, ...e.queue]) {
      if (/Block/i.test(o.note || "") || o.playbook === "block") seenBlock.add(o.id);
    }
  }
  const ov = overallLiveStats(e);
  const bySym = [...(ov.bySymbol || [])].filter((b) => b.n >= 2).sort((a, b) => Number(b.pf) - Number(a.pf));
  const row = {
    label,
    tactic,
    range,
    block: blockOn,
    ms: Date.now() - t0,
    pf: +Number(e.stats.pf || 0).toFixed(3),
    wr: +((e.stats.wr || 0) * 100).toFixed(1),
    n: e.stats.trades,
    net: +Number(e.stats.net || 0).toFixed(3),
    mdd: +Number(e.stats.mdd || 0).toFixed(4),
    ddt: e.stats.ddt || 0,
    sl: e.ledger.slExits,
    tp: e.ledger.tpExits,
    avgOpenPos: +(posSum / TICKS).toFixed(2),
    avgOrders: +(ordSum / TICKS).toFixed(2),
    avgPartialOrders: +(partSum / TICKS).toFixed(2),
    peakPos,
    peakOrd,
    totalPartialOrders: seenPartial.size,
    blockOrders: seenBlock.size,
    blockVol: +Number(ov.block?.volume || 0).toFixed(3),
    blockN: ov.block?.n || 0,
    blockPf: +Number(ov.block?.pf || 0).toFixed(3),
    relVol: +Number(e.relVolumeFactor || 0).toFixed(3),
    lastN12: ov.lastN?.["12"] ? { n: ov.lastN["12"].n, pf: +Number(ov.lastN["12"].pf).toFixed(3), net: +Number(ov.lastN["12"].net).toFixed(3) } : null,
    lastN40: ov.lastN?.["40"] ? { n: ov.lastN["40"].n, pf: +Number(ov.lastN["40"].pf).toFixed(3) } : null,
    h4: ov.hours?.["4"] ? { n: ov.hours["4"].n, pf: +Number(ov.hours["4"].pf).toFixed(3) } : null,
    h12: ov.hours?.["12"] ? { n: ov.hours["12"].n, pf: +Number(ov.hours["12"].pf).toFixed(3) } : null,
    h45: ov.hours?.["45"] ? { n: ov.hours["45"].n, pf: +Number(ov.hours["45"].pf).toFixed(3) } : null,
    byInd: buckets(ov.byIndication),
    byPlay: buckets(ov.byPlaybook),
    byKind: buckets(ov.byKind),
    byTac: buckets(ov.byTactic),
    bestSym: bySym.slice(0, 8).map((b) => ({ k: b.key, n: b.n, pf: +Number(b.pf).toFixed(3), net: +Number(b.net).toFixed(3) })),
    worstSym: bySym.slice(-8).reverse().map((b) => ({ k: b.key, n: b.n, pf: +Number(b.pf).toFixed(3), net: +Number(b.net).toFixed(3) })),
  };
  const flag = row.pf >= 1 && row.net > 0 ? (row.pf >= DEFAULT_THRESHOLDS.minPf ? "ok" : "weak") : "FAIL";
  console.log(
    `${flag.padEnd(4)} ${label.padEnd(28)} PF=${String(row.pf).padStart(6)} WR=${String(row.wr).padStart(5)}% n=${String(row.n).padStart(5)} net=${String(row.net).padStart(8)} avgPos=${String(row.avgOpenPos).padStart(5)} avgOrd=${String(row.avgOrders).padStart(6)} blkN=${String(row.blockOrders).padStart(4)} ddt=${row.ddt}  ${row.ms}ms`,
  );
  return row;
}

console.log(`72h × ${SYMS}  short 0.35/1.5  trail 1.5  overall Block vol 1.0 / relation 0.4`);
console.log(`PF overall ${DEFAULT_THRESHOLDS.minPf}  base ${DEFAULT_THRESHOLDS.basePf}  axis ${DEFAULT_THRESHOLDS.axisPf}  block ${DEFAULT_THRESHOLDS.blockPf}  short ${DEFAULT_THRESHOLDS.shortPf}/${DEFAULT_THRESHOLDS.shortBasePf}\n`);

const tAll = Date.now();
const rows = [];
for (const tactic of ["trailing", "hybrid", "axis"]) {
  rows.push(run(`${tactic}/atr BLOCK ON`, tactic, "atr", true));
  rows.push(run(`${tactic}/atr BLOCK OFF`, tactic, "atr", false));
}

function pair(tactic) {
  const on = rows.find((r) => r.tactic === tactic && r.block);
  const off = rows.find((r) => r.tactic === tactic && !r.block);
  if (!on || !off) return null;
  return {
    tactic,
    pfOn: on.pf,
    pfOff: off.pf,
    dPf: +(on.pf - off.pf).toFixed(3),
    nOn: on.n,
    nOff: off.n,
    netOn: on.net,
    netOff: off.net,
    dNet: +(on.net - off.net).toFixed(3),
    posOn: on.avgOpenPos,
    posOff: off.avgOpenPos,
    blkOn: on.blockOrders,
  };
}
const pairs = ["trailing", "hybrid", "axis"].map(pair).filter(Boolean);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>72h × 120 · Block ON vs OFF</title>
<style>
:root { color-scheme: light; --ink:#161616; --muted:#525252; --line:#e0e0e0; --ok:#0e6027; --bad:#a2191f; --accent:#0f62fe; }
body { margin:0; font: 14px/1.45 "IBM Plex Sans", system-ui, sans-serif; color:var(--ink); background:#f4f4f4; }
main { max-width: 1180px; margin: 0 auto; padding: 28px 20px 64px; }
h1 { font-weight: 500; font-size: 22px; margin: 0 0 6px; }
.sub { color: var(--muted); margin-bottom: 22px; }
table { width: 100%; border-collapse: collapse; background: #fff; margin: 0 0 28px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 500; }
.ok { color: var(--ok); } .fail { color: var(--bad); }
.bar { height: 10px; background: #d0e2ff; position: relative; min-width: 80px; }
.bar > i { display:block; height:100%; background: var(--accent); }
.grid { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }
section h2 { font-size: 16px; font-weight: 500; margin: 0 0 10px; }
.card { background:#fff; padding: 14px 16px; border: 1px solid var(--line); }
code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; }
</style></head><body><main>
<h1>72h × 120 symbols · actual settings</h1>
<p class="sub">short 0.35 / 1.5 · trail 1.5 · Axis full · overall Block vol 1.0 · relation 0.4 · PF 1.35 / 1.0 / 1.15 / 1.2 · short 0.95 / 0.7 · ${(tAll && Date.now() - tAll) || 0} ms</p>
<h2>Block ON vs OFF</h2>
<table><thead><tr><th>Tactic</th><th>PF on</th><th>PF off</th><th>Δ PF</th><th>n on</th><th>n off</th><th>net on</th><th>net off</th><th>Δ net</th><th>avg pos on</th><th>avg pos off</th><th>block orders</th></tr></thead><tbody>
${pairs.map((p) => `<tr><td>${p.tactic}</td><td class="${p.pfOn>=1?"ok":"fail"}">${p.pfOn}</td><td class="${p.pfOff>=1?"ok":"fail"}">${p.pfOff}</td><td>${p.dPf>=0?"+":""}${p.dPf}</td><td>${p.nOn}</td><td>${p.nOff}</td><td>${p.netOn}</td><td>${p.netOff}</td><td>${p.dNet>=0?"+":""}${p.dNet}</td><td>${p.posOn}</td><td>${p.posOff}</td><td>${p.blkOn}</td></tr>`).join("")}
</tbody></table>
<h2>Runs</h2>
<table><thead><tr><th></th><th>PF</th><th>WR</th><th>n</th><th>net</th><th>MDD</th><th>DDT</th><th>avg pos</th><th>avg ord</th><th>peak pos</th><th>partials</th><th>block ords</th><th>last-12 PF</th><th>4h PF</th></tr></thead><tbody>
${rows.map((r) => {
  const mx = Math.max(...rows.map((x) => x.pf), 1);
  return `<tr><td>${r.label}</td><td class="${r.pf>=1?"ok":"fail"}">${r.pf}<div class="bar"><i style="width:${Math.max(2, Math.min(100, (r.pf/mx)*100))}%"></i></div></td><td>${r.wr}%</td><td>${r.n}</td><td>${r.net}</td><td>${r.mdd}</td><td>${r.ddt}</td><td>${r.avgOpenPos}</td><td>${r.avgOrders}</td><td>${r.peakPos}</td><td>${r.totalPartialOrders}</td><td>${r.blockOrders}</td><td>${r.lastN12?.pf ?? "—"}</td><td>${r.h4?.pf ?? "—"}</td></tr>`;
}).join("")}
</tbody></table>
<div class="grid">
${rows.map((r) => `<section class="card"><h2>${r.label}</h2>
<p>indications ${r.byInd.map((b)=>`<code>${b.k} ${b.pf}</code>`).join(" ") || "—"}</p>
<p>playbooks ${r.byPlay.map((b)=>`<code>${b.k} ${b.pf}</code>`).join(" ") || "—"}</p>
<p>best ${r.bestSym.slice(0,4).map((b)=>`<code>${b.k} ${b.pf}</code>`).join(" ") || "—"}</p>
<p>worst ${r.worstSym.slice(0,4).map((b)=>`<code>${b.k} ${b.pf}</code>`).join(" ") || "—"}</p>
</section>`).join("")}
</div>
</main></body></html>`;

const out = {
  hours: HOURS,
  symbols: SYMS,
  ms: Date.now() - tAll,
  thresholds: DEFAULT_THRESHOLDS,
  cfg: { tpAtr: CFG.tpAtr, slOfTp: CFG.slOfTp, trailingPct: CFG.trailingPct, overallVolumeRatio: 1, volumeRatio: 0.4 },
  rows,
  pairs,
};
writeFileSync("/workspace/public/sim-3d-120-block.json", JSON.stringify(out, null, 2));
writeFileSync("/workspace/public/sim-3d-120-block.html", html.replace(`${(tAll && Date.now() - tAll) || 0} ms`, `${out.ms} ms`));
console.log("\n=== Block delta ===");
for (const p of pairs) console.log(`${p.tactic.padEnd(10)} ΔPF ${String(p.dPf).padStart(6)}  Δnet ${String(p.dNet).padStart(8)}  n ${p.nOn}/${p.nOff}  blk ${p.blkOn}`);
console.log(`\ndone ${out.ms}ms  wrote public/sim-3d-120-block.html`);
