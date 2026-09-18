#!/usr/bin/env node
/**
 * Independent trade tests for every tactic / range / trail / TP-SL /
 * strategy kind / playbook / indication. Writes a Carbon-style HTML report.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  COST_STEPS,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_THRESHOLDS,
  DESK,
  INDICATION_CONFIGS,
  INDICATION_KINDS,
  LANE_EVAL_NS,
  RANGE_META,
  RANGE_TYPES,
  STRATEGIES,
  STRATEGY_KINDS,
  TACTIC_META,
  TACTICS,
  TP_SL_RATIOS,
  TRAIL_PCTS,
  buildLanes,
  combosFiltered,
  processAllIndications,
  strategiesForKinds,
} from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const HOURS = 8;
const SYMBOLS_N = 8;
const BASE = {
  ...DEFAULT_TACTIC_CONFIG,
  slAtr: 1.05,
  maxHoldTicks: 20000,
  maxHoldBars: 8,
  trailingPct: 0.8,
  tpRatio: 2.75,
};

function scoreOf(r) {
  const pf = Number(r.pf) || 0;
  const wr = Number(r.wr) || 0;
  const net = Number(r.net) || 0;
  const mdd = Number(r.mdd) || 0;
  const trades = Number(r.trades) || 0;
  const ok = pf >= 1 && net > 0 && wr >= 0.4 && trades >= 4;
  const score =
    pf * 12 +
    wr * 18 +
    Math.tanh(net / 8) * 10 +
    (ok ? 16 : -8) +
    Math.min(trades, 80) * 0.04 -
    mdd * 22;
  return { ok, score };
}

function sim(tactic, range, cfg = BASE) {
  const { report } = simulateHours(HOURS, cfg, tactic, {
    symbolCount: SYMBOLS_N,
    orderType: "limit",
    rangeType: range,
    marks: [4, 8],
  });
  const { ok, score } = scoreOf(report);
  return {
    tactic,
    range,
    trail: cfg.trailingPct,
    tpRatio: cfg.tpRatio,
    pf: report.pf,
    wr: report.wr,
    net: report.net,
    mdd: report.mdd,
    trades: report.trades,
    wins: report.wins,
    sl: report.slExits,
    tp: report.tpExits,
    avgR: report.avgR,
    equity: report.equity,
    ok,
    score,
    passed: report.passed,
    marks: report.marks ?? [],
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function fmt(n, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function tone(ok, pf) {
  if (ok || pf >= 1.15) return "up";
  if (pf >= 1) return "warn";
  return "down";
}

function barSvg(rows, valueKey, labelKey, title) {
  const w = 720;
  const rowH = 28;
  const h = 40 + rows.length * rowH;
  const max = Math.max(1e-6, ...rows.map((r) => Math.abs(Number(r[valueKey]) || 0)));
  const bars = rows
    .map((r, i) => {
      const v = Number(r[valueKey]) || 0;
      const y = 28 + i * rowH;
      const bw = Math.max(2, (Math.abs(v) / max) * 520);
      const fill = v >= 1 && valueKey === "pf" ? "#198038" : v > 0 ? "#0f62fe" : "#da1e28";
      const pfFill = valueKey === "pf" ? (v >= 1.15 ? "#198038" : v >= 1 ? "#0f62fe" : "#da1e28") : fill;
      return `<text x="0" y="${y + 14}" class="lbl">${esc(r[labelKey])}</text>
        <rect x="140" y="${y}" width="${bw}" height="18" fill="${pfFill}"/>
        <text x="${148 + bw}" y="${y + 14}" class="val">${fmt(v, valueKey === "wr" ? 2 : 2)}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(title)}">${bars}</svg>`;
}

function heatSvg(cells, tactics, ranges) {
  const cw = 92;
  const ch = 48;
  const ox = 90;
  const oy = 28;
  const w = ox + ranges.length * cw + 12;
  const h = oy + tactics.length * ch + 20;
  const pfs = cells.map((c) => c.pf).filter(Number.isFinite);
  const lo = Math.min(...pfs, 0.6);
  const hi = Math.max(...pfs, 1.4);
  const color = (pf) => {
    const t = (pf - lo) / Math.max(1e-6, hi - lo);
    if (pf >= 1.15) return `rgba(25,128,56,${0.25 + t * 0.7})`;
    if (pf >= 1) return `rgba(15,98,254,${0.2 + t * 0.6})`;
    return `rgba(218,30,40,${0.2 + (1 - t) * 0.55})`;
  };
  const head = ranges
    .map((r, i) => `<text x="${ox + i * cw + cw / 2}" y="16" text-anchor="middle" class="lbl">${esc(RANGE_META[r].label)}</text>`)
    .join("");
  const body = tactics
    .map((t, ti) => {
      const row = `<text x="4" y="${oy + ti * ch + 28}" class="lbl">${esc(TACTIC_META[t].label)}</text>`;
      const boxes = ranges
        .map((r, ri) => {
          const c = cells.find((x) => x.tactic === t && x.range === r);
          const pf = c?.pf ?? 0;
          return `<g>
            <rect x="${ox + ri * cw + 4}" y="${oy + ti * ch + 4}" width="${cw - 8}" height="${ch - 8}" fill="${color(pf)}" stroke="#e0e0e0"/>
            <text x="${ox + ri * cw + cw / 2}" y="${oy + ti * ch + 24}" text-anchor="middle" class="val">${fmt(pf)}</text>
            <text x="${ox + ri * cw + cw / 2}" y="${oy + ti * ch + 38}" text-anchor="middle" class="sub">${c?.ok ? "pass" : "fail"} · ${c?.trades ?? 0}</text>
          </g>`;
        })
        .join("");
      return row + boxes;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Tactic × range profit factor">${head}${body}</svg>`;
}

function table(headers, rows) {
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr class="${r._tone || ""}">${r.cells.map((c, i) => `<td${i === 0 ? ' class="name"' : ""}>${c}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

console.log("AXIS independent config sweep · 8h ×", SYMBOLS_N, "symbols");
const t0 = Date.now();

const matrix = [];
for (const tactic of TACTICS) {
  for (const range of RANGE_TYPES) {
    const row = sim(tactic, range);
    matrix.push(row);
    console.log(`  matrix ${tactic}/${range} PF ${fmt(row.pf)} n=${row.trades} ${row.ok ? "ok" : ""}`);
  }
}
matrix.sort((a, b) => b.score - a.score);
const winner = matrix[0];

const tacticRows = TACTICS.map((t) => {
  const xs = matrix.filter((m) => m.tactic === t);
  const best = [...xs].sort((a, b) => b.score - a.score)[0];
  return { ...best, label: TACTIC_META[t].label, id: t };
}).sort((a, b) => b.score - a.score);

const rangeRows = RANGE_TYPES.map((r) => {
  const xs = matrix.filter((m) => m.range === r);
  const best = [...xs].sort((a, b) => b.score - a.score)[0];
  return { ...best, label: RANGE_META[r].label, id: r };
}).sort((a, b) => b.score - a.score);

const trailRows = [];
for (const p of TRAIL_PCTS) {
  const row = sim(winner.tactic, winner.range, { ...BASE, trailingPct: p, tpRatio: winner.tpRatio });
  trailRows.push({ ...row, label: `${p.toFixed(1)}%`, id: p });
  console.log(`  trail ${p} PF ${fmt(row.pf)}`);
}
trailRows.sort((a, b) => b.score - a.score);

const ratioRows = [];
for (const r of TP_SL_RATIOS) {
  const row = sim(winner.tactic, winner.range, {
    ...BASE,
    trailingPct: trailRows[0].trail,
    tpRatio: r,
  });
  ratioRows.push({ ...row, label: `${r.toFixed(2)}R`, id: r });
  console.log(`  ratio ${r} PF ${fmt(row.pf)}`);
}
ratioRows.sort((a, b) => b.score - a.score);

const kindRows = STRATEGY_KINDS.map((k) => {
  const playbooks = strategiesForKinds([k.id]);
  const rows = combosFiltered({
    symbol: "BTCUSDT",
    lastN: 10,
    cfg: BASE,
    th: DEFAULT_THRESHOLDS,
    tactic: "all",
    rangeType: "all",
    onlyPositive: false,
    enabledKinds: [k.id],
    keepBest: true,
  });
  const pass = rows.filter((r) => r.positive && r.lastNPositive);
  const best = pass[0] ?? rows[0];
  return {
    id: k.id,
    label: k.label,
    n: rows.length,
    pass: pass.length,
    pf: best?.pf ?? 0,
    wr: best?.wr ?? 0,
    mdd: best?.mdd ?? 0,
    vf: best?.volumeFactor ?? 0,
    tactic: best?.tactic ?? "",
    range: best?.rangeType ?? "",
    ok: pass.length > 0 && (best?.pf ?? 0) >= DEFAULT_THRESHOLDS.minPf * 0.9,
  };
}).sort((a, b) => b.pf - a.pf);

const stratRows = STRATEGIES.map((st) => {
  const rows = combosFiltered({
    strategyId: st.id,
    symbol: "BTCUSDT",
    lastN: 10,
    cfg: BASE,
    th: DEFAULT_THRESHOLDS,
    tactic: "all",
    rangeType: "all",
    onlyPositive: false,
    enabledKinds: [st.kind],
    keepBest: true,
  });
  const pass = rows.filter((r) => r.positive && r.lastNPositive);
  const best = pass[0] ?? rows[0];
  return {
    id: st.id,
    label: st.name,
    kind: st.kind,
    n: rows.length,
    pass: pass.length,
    pf: best?.pf ?? 0,
    lastNPf: best?.lastNPf ?? 0,
    wr: best?.wr ?? 0,
    mdd: best?.mdd ?? 0,
    vf: best?.volumeFactor ?? 0,
    tactic: best?.tactic ?? "",
    range: best?.rangeType ?? "",
    trail: best?.trailPct ?? 0,
    tpRatio: best?.tpRatio ?? 0,
    ok: Boolean(best && best.positive && best.lastNPositive),
  };
}).sort((a, b) => b.pf - a.pf);

const comboTop = combosFiltered({
  symbol: "BTCUSDT",
  lastN: 10,
  cfg: BASE,
  th: DEFAULT_THRESHOLDS,
  tactic: "all",
  rangeType: "all",
  onlyPositive: false,
  keepBest: true,
})
  .filter((r) => r.positive)
  .slice(0, 24);

const lanes = buildLanes(10, BASE, DEFAULT_THRESHOLDS, "BTCUSDT");
const laneSummary = {
  total: lanes.length,
  validated: lanes.filter((l) => l.status === "validated").length,
  candidate: lanes.filter((l) => l.status === "candidate").length,
  rejected: lanes.filter((l) => l.status === "rejected").length,
  effective: lanes.filter((l) => l.effective).length,
};
const laneByKind = STRATEGY_KINDS.map((k) => {
  const xs = lanes.filter((l) => l.kind === k.id);
  return {
    id: k.id,
    label: k.label,
    n: xs.length,
    validated: xs.filter((l) => l.status === "validated").length,
    effective: xs.filter((l) => l.effective).length,
    pf: xs.length ? xs.reduce((s, l) => s + l.pf, 0) / xs.length : 0,
  };
});

const indRows = INDICATION_CONFIGS.map((cfg) => {
  let hits = 0;
  let dirs = 0;
  let agree = 0;
  let str = 0;
  let n = 0;
  for (const sym of Object.keys(DESK.candles)) {
    const cs = DESK.candles[sym];
    const pk = DESK.indicators[sym];
    if (!cs || !pk) continue;
    for (let i = 80; i < cs.length; i += 3) {
      const all = processAllIndications(pk, cs, i);
      const h = all.find((x) => x.configId === cfg.id);
      if (!h) continue;
      n += 1;
      hits += 1;
      str += Math.abs(h.strength);
      if (h.dir !== 0) {
        dirs += 1;
        const next = cs[i + 1];
        if (next) {
          const chg = next.c - cs[i].c;
          if ((h.dir > 0 && chg > 0) || (h.dir < 0 && chg < 0)) agree += 1;
        }
      }
    }
  }
  return {
    id: cfg.id,
    label: cfg.label,
    kind: cfg.kind,
    n,
    dirRate: hits ? dirs / hits : 0,
    accuracy: dirs ? agree / dirs : 0,
    strength: hits ? str / hits : 0,
    ok: dirs > 0 && agree / Math.max(1, dirs) >= 0.5,
  };
}).sort((a, b) => b.accuracy - a.accuracy);

const bestTrail = trailRows[0];
const bestRatio = ratioRows[0];
const tightRatio = ratioRows.filter((r) => r.tpRatio >= 2).sort((a, b) => b.score - a.score)[0] ?? bestRatio;
const confirmCfg = {
  ...BASE,
  trailingPct: bestTrail.trail,
  tpRatio: tightRatio.tpRatio,
};
const confirm = simulateHours(16, confirmCfg, winner.tactic, {
  symbolCount: SYMBOLS_N,
  orderType: "limit",
  rangeType: winner.range,
  marks: [4, 8, 16],
}).report;

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log("sweep done", elapsed, "s · winner", winner.tactic, winner.range, "PF", fmt(winner.pf));

const kpis = [
  ["Best tactic×range", `${TACTIC_META[winner.tactic].label} · ${RANGE_META[winner.range].label}`, `PF ${fmt(winner.pf)} · ${winner.trades} tr`],
  ["Best trail", `${bestTrail.trail.toFixed(1)}%`, `PF ${fmt(bestTrail.pf)}`],
  ["Best TP/SL (any)", `${bestRatio.tpRatio.toFixed(2)}R`, `PF ${fmt(bestRatio.pf)}`],
  ["Best tight SL (≥2R)", `${tightRatio.tpRatio.toFixed(2)}R`, `PF ${fmt(tightRatio.pf)}`],
  ["Best kind", kindRows[0].label, `PF ${fmt(kindRows[0].pf)}`],
  ["Best playbook", stratRows[0].label, `PF ${fmt(stratRows[0].pf)}`],
  ["16h confirm", `${fmt(confirm.pf)} PF`, `${confirm.trades} tr · WR ${fmt(confirm.wr)}`],
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AXIS config results · independent trade tests</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
:root { --blue:#0f62fe; --bg:#f4f4f4; --panel:#fff; --fg:#161616; --muted:#525252; --line:#e0e0e0; --up:#198038; --down:#da1e28; --warn:#b28600; }
* { box-sizing:border-box; }
html,body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.45 "IBM Plex Sans",system-ui,sans-serif; }
h1 { font-size:28px; font-weight:600; letter-spacing:-0.02em; margin:0; }
h2 { font-size:16px; font-weight:600; margin:0 0 12px; }
.wrap { max-width:1180px; margin:0 auto; padding:28px 20px 64px; }
.kicker { font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
.sub { color:var(--muted); margin-top:8px; max-width:720px; }
.grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); margin:22px 0 28px; }
.kpi { background:var(--panel); border:1px solid var(--line); padding:14px 16px; }
.kpi .k { font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); }
.kpi .v { font-size:18px; font-weight:600; margin-top:6px; }
.kpi .h { font-size:12px; color:var(--muted); margin-top:4px; font-family:"IBM Plex Mono",monospace; }
.panel { background:var(--panel); border:1px solid var(--line); padding:18px; margin:0 0 16px; }
.two { display:grid; gap:16px; grid-template-columns:1fr; }
@media(min-width:900px){ .two { grid-template-columns:1fr 1fr; } }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; font-weight:500; color:var(--muted); font-size:11px; letter-spacing:0.08em; text-transform:uppercase; border-bottom:1px solid var(--line); padding:8px 8px 8px 0; }
td { border-bottom:1px solid var(--line); padding:8px 8px 8px 0; font-variant-numeric:tabular-nums; }
td.name { font-weight:500; }
tr.up td:nth-child(2), tr.up td:nth-child(3) { color:var(--up); }
tr.down td:nth-child(2) { color:var(--down); }
svg .lbl { font:11px "IBM Plex Sans",sans-serif; fill:#525252; }
svg .val { font:11px "IBM Plex Mono",monospace; fill:#161616; }
svg .sub { font:9px "IBM Plex Sans",sans-serif; fill:#525252; }
.pill { display:inline-block; padding:2px 8px; font-size:11px; border:1px solid var(--line); }
.pill.up { background:#defbe6; color:var(--up); border-color:#a7f0ba; }
.pill.down { background:#fff1f1; color:var(--down); border-color:#ffd7d9; }
footer { color:var(--muted); font-size:12px; margin-top:24px; }
</style>
</head>
<body>
<div class="wrap">
  <p class="kicker">AXIS desk · independent config sweep</p>
  <h1>Best performing configs</h1>
  <p class="sub">Every tactic, range, trail, TP/SL ratio, strategy kind, playbook and indication was computed independently. Trade tests are 8h VST on 8 symbols, 1-minute ticks. Combination stats process all cost × trail × ratio axes and keep the best per lane. ${elapsed}s compute.</p>
  <div class="grid">
    ${kpis
      .map(
        ([k, v, h]) =>
          `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="h">${esc(h)}</div></div>`,
      )
      .join("")}
  </div>

  <div class="panel">
    <h2>Tactic × range · 8h trade PF</h2>
    <p class="sub" style="margin-bottom:12px">Independent sim per cell. Live lock was hybrid / fibonacci; this sweep ranks all 20 cells on the same tape rules.</p>
    ${heatSvg(matrix, TACTICS, RANGE_TYPES)}
  </div>

  <div class="two">
    <div class="panel">
      <h2>Tactics (best range of each)</h2>
      ${barSvg(tacticRows, "pf", "label", "Tactic PF")}
    </div>
    <div class="panel">
      <h2>Ranges (best tactic of each)</h2>
      ${barSvg(rangeRows, "pf", "label", "Range PF")}
    </div>
  </div>

  <div class="two">
    <div class="panel">
      <h2>Trail % on winner ${esc(winner.tactic)}/${esc(winner.range)}</h2>
      ${barSvg(trailRows, "pf", "label", "Trail PF")}
    </div>
    <div class="panel">
      <h2>TP/SL ratio on winner</h2>
      ${barSvg(ratioRows, "pf", "label", "TP/SL PF")}
    </div>
  </div>

  <div class="panel">
    <h2>All tactic × range trade tests</h2>
    ${table(
      ["Config", "PF", "WR", "Net", "MDD", "Trades", "SL/TP", "Avg R", "Result"],
      matrix.map((m) => ({
        _tone: tone(m.ok, m.pf),
        cells: [
          `${TACTIC_META[m.tactic].label} · ${RANGE_META[m.range].label}`,
          fmt(m.pf),
          fmt(m.wr),
          fmt(m.net),
          fmt(m.mdd, 3),
          String(m.trades),
          `${m.sl}/${m.tp}`,
          fmt(m.avgR),
          m.ok ? '<span class="pill up">positive</span>' : '<span class="pill down">weak</span>',
        ],
      })),
    )}
  </div>

  <div class="two">
    <div class="panel">
      <h2>Strategy types (kinds)</h2>
      ${table(
        ["Kind", "Best PF", "WR", "Pass/N", "Best tactic", "Range"],
        kindRows.map((k) => ({
          _tone: tone(k.ok, k.pf),
          cells: [k.label, fmt(k.pf), fmt(k.wr), `${k.pass}/${k.n}`, k.tactic, k.range],
        })),
      )}
    </div>
    <div class="panel">
      <h2>Lanes on BTC · last N ${LANE_EVAL_NS.join("/")}</h2>
      <p class="sub">Validated ${laneSummary.validated} · candidate ${laneSummary.candidate} · rejected ${laneSummary.rejected} · effective ${laneSummary.effective} / ${laneSummary.total}</p>
      ${table(
        ["Kind", "Lanes", "Validated", "Effective", "Avg PF"],
        laneByKind.map((k) => ({
          _tone: k.effective ? "up" : "",
          cells: [k.label, String(k.n), String(k.validated), String(k.effective), fmt(k.pf)],
        })),
      )}
    </div>
  </div>

  <div class="panel">
    <h2>Playbooks · independent combination compute</h2>
    ${table(
      ["Strategy", "Kind", "PF", "Last N PF", "WR", "VF", "Trail", "TP/SL", "Tactic", "Range", "Pass"],
      stratRows.map((s) => ({
        _tone: tone(s.ok, s.pf),
        cells: [
          s.label,
          s.kind,
          fmt(s.pf),
          fmt(s.lastNPf),
          fmt(s.wr),
          fmt(s.vf),
          fmt(s.trail, 1) + "%",
          fmt(s.tpRatio, 2) + "R",
          s.tactic,
          s.range,
          `${s.pass}/${s.n}`,
        ],
      })),
    )}
  </div>

  <div class="panel">
    <h2>Indications · independent directional accuracy</h2>
    ${table(
      ["Indication", "Kind", "Dir rate", "Next-bar accuracy", "Strength", "Samples"],
      indRows.map((r) => ({
        _tone: r.accuracy >= 0.52 ? "up" : r.accuracy < 0.48 ? "down" : "",
        cells: [r.label, r.kind, fmt(r.dirRate), fmt(r.accuracy), fmt(r.strength), String(r.n)],
      })),
    )}
  </div>

  <div class="panel">
    <h2>Top combination configs (keep-best of all cost / trail / TP-SL)</h2>
    ${table(
      ["#", "Strategy", "Tactic", "Range", "Cost", "Trail", "TP/SL", "PF", "Last N", "WR", "MDD", "VF"],
      comboTop.map((c, i) => ({
        _tone: tone(true, c.pf),
        cells: [
          String(i + 1),
          c.strategyName,
          c.tactic,
          c.rangeType,
          String(c.costStep),
          fmt(c.trailPct, 1) + "%",
          fmt(c.tpRatio, 2) + "R",
          fmt(c.pf),
          fmt(c.lastNPf),
          fmt(c.wr),
          fmt(c.mdd, 3),
          fmt(c.volumeFactor),
        ],
      })),
    )}
  </div>

  <div class="panel">
    <h2>16h confirm on swept winner</h2>
    <p class="sub">${esc(TACTIC_META[winner.tactic].label)} · ${esc(RANGE_META[winner.range].label)} · trail ${bestTrail.trail.toFixed(1)}% · TP/SL ${bestRatio.tpRatio.toFixed(2)}R · slAtr 1.05</p>
    ${table(
      ["Horizon", "PF", "WR", "Net", "MDD", "Trades"],
      (confirm.marks?.length ? confirm.marks : [{ hours: 16, pf: confirm.pf, wr: confirm.wr, net: confirm.net, mdd: confirm.mdd, trades: confirm.trades, ok: confirm.pf >= 1 }]).map((m) => ({
        _tone: tone(m.ok, m.pf),
        cells: [`${m.hours}h`, fmt(m.pf), fmt(m.wr), fmt(m.net), fmt(m.mdd, 3), String(m.trades)],
      })),
    )}
  </div>

  <footer>
    Processed ${TACTICS.length} tactics × ${RANGE_TYPES.length} ranges = ${matrix.length} independent 8h trade tests;
    ${TRAIL_PCTS.length} trails; ${TP_SL_RATIOS.length} TP/SL ratios; ${STRATEGY_KINDS.length} kinds; ${STRATEGIES.length} playbooks;
    ${INDICATION_CONFIGS.length} indication configs (${INDICATION_KINDS.map((k) => k.label).join(", ")});
    ${COST_STEPS.length} cost steps. Keep-best still evaluates every trail × ratio axis. ${elapsed}s.
  </footer>
</div>
</body>
</html>`;

const outDir = "/workspace/public";
mkdirSync(outDir, { recursive: true });
mkdirSync("/workspace/artifacts", { recursive: true });
writeFileSync(`${outDir}/config-results.html`, html);
writeFileSync("/workspace/artifacts/config-results.html", html);
writeFileSync(
  "/workspace/artifacts/config-results.json",
  JSON.stringify(
    {
      elapsed: Number(elapsed),
      winner,
      bestTrail,
      bestRatio,
      confirm: { pf: confirm.pf, wr: confirm.wr, net: confirm.net, trades: confirm.trades, marks: confirm.marks },
      matrix,
      kinds: kindRows,
      strategies: stratRows,
      indications: indRows,
      lanes: laneSummary,
    },
    null,
    2,
  ),
);
console.log("wrote public/config-results.html");
