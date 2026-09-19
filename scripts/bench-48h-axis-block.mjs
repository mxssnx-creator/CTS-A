#!/usr/bin/env node
/**
 * Find PF≈1 configs, then 48h×50 independent Axis / Block (shared, additive, both).
 * Tight trails (<1.4) are excluded.
 */
import { writeFileSync } from "node:fs";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_BLOCK_CONFIG } from "../src/lib/desk/engine.ts";
import { simulateHours, overallLiveStats } from "../src/lib/desk/vst.ts";

const TRAILS = [1.7];
const TACTICS = ["trailing", "hybrid", "axis"];
const RANGES = ["atr", "fibonacci"];
const PROTECT = [
  { tpAtr: 0.35, slOfTp: 1.5 },
  { tpAtr: 0.45, slOfTp: 1.25 },
  { tpAtr: 0.55, slOfTp: 1.0 },
  { tpAtr: 0.65, slOfTp: 1.25 },
  { tpAtr: 0.75, slOfTp: 1.0 },
  { tpAtr: 0.8, slOfTp: 1.25 },
];

const BLOCK_OFF = { ...DEFAULT_BLOCK_CONFIG, enabled: false, activeLive: false };
const blockOf = (mode) => ({
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  activeLive: false,
  addOnWin: false,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  volumeMode: mode,
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  relAdditive: mode !== "shared",
  sides: "both",
  stack: true,
  windows: true,
  overall: true,
  keepAdjusted: true,
});

function cfgOf(trail, prot) {
  return {
    ...DEFAULT_TACTIC_CONFIG,
    trailingPct: trail,
    tpAtr: prot.tpAtr,
    slOfTp: prot.slOfTp,
    slAtr: +(prot.tpAtr * prot.slOfTp).toFixed(3),
    tpRatio: +(1 / prot.slOfTp).toFixed(3),
    shortRange: prot.tpAtr < 0.5,
    maxHoldBars: 8,
    maxHoldTicks: 48,
    dcaCount: 1,
  };
}

function run(hours, syms, cfg, tactic, range, block) {
  const t0 = Date.now();
  const { report, engine } = simulateHours(hours, cfg, tactic, { symbolCount: syms, rangeType: range, block });
  const ov = overallLiveStats(engine);
  const blockN = engine.closed.filter((c) => c.playbook === "block" || (c.blockLevel || 0) >= 1).length;
  return {
    pf: +report.pf.toFixed(3),
    wr: +report.wr.toFixed(3),
    n: report.trades,
    net: +report.net.toFixed(3),
    sl: report.slExits,
    tp: report.tpExits,
    mdd: +(report.mdd || 0).toFixed(4),
    blockN,
    blockPf: +((ov.block?.pf) || 0).toFixed(3),
    relF: +(engine.relVolumeFactor || 0).toFixed(3),
    ms: Date.now() - t0,
  };
}

function keyOf(trail, tactic, range, prot) {
  return `t${trail} ${tactic}/${range} tp${prot.tpAtr}/sl${prot.slOfTp}`;
}

const scout = [];
console.error("=== scout 12h × 20 · wide trails only ===");
for (const trail of TRAILS) {
  for (const tactic of TACTICS) {
    for (const range of RANGES) {
      for (const prot of PROTECT) {
        const r = run(12, 20, cfgOf(trail, prot), tactic, range, BLOCK_OFF);
        const rec = { trail, tactic, range, ...prot, mode: "base", ...r };
        scout.push(rec);
        const tag = r.pf >= 0.85 && r.pf <= 1.25 ? "~1" : r.pf > 1.25 ? "ok" : "lo";
        console.error(`${tag} ${keyOf(trail, tactic, range, prot)}  PF ${r.pf.toFixed(2)} n=${r.n} net ${r.net}`);
      }
    }
  }
}

const near = scout
  .filter((r) => r.n >= 8 && r.pf >= 0.7 && r.pf <= 1.35)
  .sort((a, b) => Math.abs(a.pf - 1) - Math.abs(b.pf - 1))
  .slice(0, 12);

console.error(`\n${near.length} configs near PF 1 → 48h × 50 axis/block modes\n`);

const MODES = [
  { id: "base", tactic: null, block: BLOCK_OFF },
  { id: "axis", tactic: "axis", block: BLOCK_OFF },
  { id: "block-shared", tactic: null, block: blockOf("shared") },
  { id: "block-additive", tactic: null, block: blockOf("additive") },
  { id: "block-both", tactic: null, block: blockOf("parallel") },
  { id: "axis+block-both", tactic: "axis", block: blockOf("parallel") },
];

const full = [];
for (const c of near) {
  const cfg = cfgOf(c.trail, { tpAtr: c.tpAtr, slOfTp: c.slOfTp });
  const row = { key: keyOf(c.trail, c.tactic, c.range, c), scoutPf: c.pf, trail: c.trail, tactic: c.tactic, range: c.range, tpAtr: c.tpAtr, slOfTp: c.slOfTp, modes: {} };
  for (const m of MODES) {
    const tac = m.tactic || c.tactic;
    const r = run(48, 50, cfg, tac, c.range, m.block);
    row.modes[m.id] = r;
    console.error(`  ${row.key}  ${m.id.padEnd(16)} PF ${r.pf.toFixed(2)} n=${String(r.n).padStart(4)} net ${r.net} blk ${r.blockN} ${r.ms}ms`);
  }
  const base = row.modes.base;
  row.lift = {};
  for (const m of MODES) {
    if (m.id === "base") continue;
    const x = row.modes[m.id];
    row.lift[m.id] = {
      dPf: +(x.pf - base.pf).toFixed(3),
      dNet: +(x.net - base.net).toFixed(3),
      better: x.pf > base.pf + 0.08 && x.net > base.net,
    };
  }
  full.push(row);
}

full.sort((a, b) => {
  const la = Math.max(...Object.values(a.lift).map((x) => x.dPf));
  const lb = Math.max(...Object.values(b.lift).map((x) => x.dPf));
  return lb - la;
});

const payload = { hours: 48, symbols: 50, trails: TRAILS, near: near.length, at: Date.now(), scout, full };
writeFileSync("public/axis-block-48h.json", JSON.stringify(payload, null, 2));

function cell(v, ok) {
  const cls = ok ? "ok" : v < 0 ? "bad" : "";
  return `<td class="${cls}">${v}</td>`;
}

const tables = full
  .map((row) => {
    const modes = MODES.map((m) => {
      const r = row.modes[m.id];
      const lift = m.id === "base" ? { dPf: 0, dNet: 0, better: false } : row.lift[m.id];
      return `<tr><td>${m.id}</td>${cell(r.pf.toFixed(2), r.pf >= 1)}${cell(r.n, true)}${cell(r.net.toFixed(2), r.net > 0)}${cell(r.wr.toFixed(2), r.wr >= 0.5)}<td>${r.sl}/${r.tp}</td><td>${r.blockN}</td>${cell((lift.dPf >= 0 ? "+" : "") + lift.dPf, lift.better)}${cell((lift.dNet >= 0 ? "+" : "") + lift.dNet, lift.better)}</tr>`;
    }).join("");
    return `<section><h2>${row.key}</h2><p>scout 12h PF ${row.scoutPf} · trail ${row.trail} (wide) · TP ${row.tpAtr} ATR · SL ${row.slOfTp}×</p><table><thead><tr><th>mode</th><th>PF</th><th>n</th><th>net</th><th>WR</th><th>SL/TP</th><th>block n</th><th>ΔPF</th><th>Δnet</th></tr></thead><tbody>${modes}</tbody></table></section>`;
  })
  .join("\n");

const winners = full
  .flatMap((row) =>
    Object.entries(row.lift)
      .filter(([, x]) => x.better)
      .map(([mode, x]) => ({ key: row.key, mode, ...x, pf: row.modes[mode].pf })),
  )
  .sort((a, b) => b.dPf - a.dPf);

const winHtml = winners.length
  ? winners.map((w) => `<li><b>${w.key}</b> + ${w.mode} · ΔPF ${w.dPf >= 0 ? "+" : ""}${w.dPf} → PF ${w.pf}</li>`).join("")
  : "<li>No mode beat baseline by ΔPF > 0.08 with higher net.</li>";

const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Axis / Block 48h × 50</title>
<style>
body{font-family:IBM Plex Sans,system-ui,sans-serif;background:#f4f8ff;color:#0b1f3a;margin:24px}
h1{color:#0f62fe} table{border-collapse:collapse;width:100%;margin:12px 0;background:#fff}
th,td{border:1px solid #d0e2ff;padding:6px 8px;text-align:right} th:first-child,td:first-child{text-align:left}
.ok{color:#0e6027;font-weight:600} .bad{color:#da1e28}
section{margin:28px 0} .muted{color:#406} 
</style></head><body>
<h1>Axis & Block vs PF≈1 configs</h1>
<p class="muted">48h × 50 symbols · trails ${TRAILS.join(", ")} (tight <1.4 excluded) · independent shared / additive / both</p>
<h2>Much better with Axis or Block</h2>
<ul>${winHtml}</ul>
${tables}
</body></html>`;
writeFileSync("public/axis-block-48h.html", html);
console.error("\n=== lifts ===");
for (const w of winners.slice(0, 16)) console.error(`${w.key}  ${w.mode}  ΔPF ${w.dPf}  PF ${w.pf}`);
console.error(`wrote public/axis-block-48h.html  (${full.length} configs × ${MODES.length} modes)`);
