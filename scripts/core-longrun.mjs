#!/usr/bin/env node
// CTS-A Core v2 — long, complete, causal simulated trading (e.g. 90 days).
// Mirrors the runtime: per block of 2-day runs, Base (S1 over every combo) is scored ONLY on the lookback before
// the block, the top `mainTop` pairs are expanded into every protect × sub-strategy tape, then every hour is
// walked forward (durable selection, 20h pre-calc, last-N, Block/DCA toggles, caps, hour guard).
//
//   node --experimental-strip-types scripts/core-longrun.mjs --cache candles15m.json --srctf 15 [--presets a,b] [--block 8]
//        [--patch '{"portfolio":16}'] [--out docs/core-longrun]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_SETTINGS, STRATEGY_PRESETS } from "../src/core/config.ts";
import { barsFromCandles, resample } from "../src/core/market/bars.ts";
import { statsOf, profitFactor } from "../src/core/metrics/stats.ts";
import { allCombos, makeUniverse, runCombo } from "../src/core/pipeline/pipeline.ts";
import { DEFAULT_PROTECT } from "../src/core/config.ts";
import { buildTapes, defaultWalkForward, walkForward } from "../src/core/sim/walkforward.ts";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const H = 3_600_000;
const D = 24 * H;
const tf = Number(arg("tf", 15));
const srctf = Number(arg("srctf", 5));
const runH = Number(arg("run", 48));
const blockRuns = Number(arg("block", 8));
const mainTop = Number(arg("main", DEFAULT_SETTINGS.mainTop));
const patch = JSON.parse(arg("patch", "{}"));
const presets = arg("presets", Object.keys(STRATEGY_PRESETS).join(",")).split(",");

const raw = JSON.parse(readFileSync(arg("cache"), "utf8"));
const full = Object.entries(raw).map(([s, c]) => barsFromCandles(s, tf, resample(c, srctf, tf)));
const U = makeUniverse(full);
const settings = { ...DEFAULT_SETTINGS, tfMin: tf };
const base = { ...defaultWalkForward(settings), ...patch };
const lookH = Math.max(base.longH, base.preH);
const firstRun = Math.ceil((U.startT + D + lookH * H) / H) * H;
const runs = [];
for (let t = firstRun; t + runH * H <= U.nowT; t += runH * H) runs.push(t);
console.error(`${U.bars.length} symbols · ${((U.nowT - U.startT) / D).toFixed(1)} days · ${runs.length} runs of ${runH}h · blocks of ${blockRuns}`);

/** Slice every symbol's bars to [from, to). */
function window(from, to) {
  return makeUniverse(
    full.map((b) => {
      let a = 0;
      while (a < b.n && b.t[a] < from) a++;
      let z = a;
      while (z < b.n && b.t[z] < to) z++;
      return { ...b, n: z - a, t: b.t.slice(a, z), o: b.o.slice(a, z), h: b.h.slice(a, z), l: b.l.slice(a, z), c: b.c.slice(a, z), v: b.v.slice(a, z) };
    }),
  );
}

const out = Object.fromEntries(presets.map((p) => [p, { runs: [], trades: [] }]));
const t0 = performance.now();
for (let bi = 0; bi < runs.length; bi += blockRuns) {
  const blk = runs.slice(bi, bi + blockRuns);
  const bStart = blk[0];
  const bEnd = blk[blk.length - 1] + runH * H;
  // Base on the lookback only (causal): every combo, default protect
  const look = window(bStart - lookH * H, bStart);
  const s1 = [];
  for (const c of allCombos()) {
    const r = runCombo(look, c.bot, c.ind, DEFAULT_PROTECT, settings.cost, 1);
    if (r) s1.push({ pair: `${c.bot}|${c.ind}`, score: r.score });
  }
  const main = new Set(s1.sort((a, b) => b.score - a.score).slice(0, mainTop).map((x) => x.pair));
  // Main: every protect × sub-strategy for the promoted pairs, over warm-up + lookback + block (+ exits)
  const u = window(bStart - lookH * H - D, bEnd + D);
  const tb = performance.now();
  const tapes = buildTapes(u, base.protects, settings.cost, { protects: base.dcaProtects, dca: base.dca }, main);
  const buildMs = performance.now() - tb;
  for (const name of presets) {
    for (const startT of blk) {
      const r = walkForward(u, tapes, { ...base, toggles: STRATEGY_PRESETS[name].toggles, startT, simH: runH });
      const tr = r.trades.filter((x) => x.entryT < startT + runH * H);
      out[name].runs.push({ startT, n: r.stats.n, pf: r.stats.pf, net: r.stats.net, gh: r.stats.gh, stable: r.stable, worstHour: r.stats.worstHour });
      out[name].trades.push(...tr);
    }
  }
  const mem = process.memoryUsage();
  console.error(
    `block ${bi / blockRuns + 1}: ${new Date(bStart).toISOString().slice(0, 10)} → ${new Date(bEnd).toISOString().slice(0, 10)} · Main ${main.size} pairs · ${tapes.length} tapes (${Math.round(buildMs / 1000)}s) · mem ${Math.round((mem.rss) / 1e6)} MB · ${Math.round((performance.now() - t0) / 1000)}s`,
  );
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const pct = (x) => `${Math.round(x * 100)}%`;
const rows = [];
for (const name of presets) {
  const o = out[name];
  const trades = o.trades.sort((a, b) => a.exitT - b.exitT);
  const s = statsOf(trades);
  const days = (o.runs.length * runH) / 24;
  // daily PF series for stability
  const byDay = new Map();
  for (const t of trades) {
    const k = Math.floor(t.exitT / D);
    const e = byDay.get(k) ?? { gp: 0, gl: 0, n: 0 };
    if (t.r > 0) e.gp += t.r;
    else e.gl -= t.r;
    e.n++;
    byDay.set(k, e);
  }
  const dayPf = [...byDay.values()].map((e) => profitFactor(e.gp, e.gl));
  const greenDays = [...byDay.values()].filter((e) => e.gp > e.gl).length;
  const row = {
    preset: name,
    label: STRATEGY_PRESETS[name].label,
    runs: o.runs.length,
    positiveRuns: o.runs.filter((r) => r.net > 0).length,
    stableRuns: o.runs.filter((r) => r.stable).length,
    n: s.n,
    perDay: s.n / days,
    pf: s.pf,
    net: s.net,
    wr: s.wr,
    gh: s.gh,
    greenDays,
    days: byDay.size,
    medianDayPf: dayPf.sort((a, b) => a - b)[Math.floor(dayPf.length / 2)] ?? 0,
    worstHour: s.worstHour,
    mdd: s.mdd,
    ddt: s.ddt,
    runsDetail: o.runs,
  };
  rows.push(row);
  console.log(
    `${row.label.padEnd(30)} runs +${row.positiveRuns}/${row.runs} stable ${row.stableRuns} | n ${s.n} (${row.perDay.toFixed(0)}/day) PF ${f2(s.pf)} net ${f2(s.net)}% WR ${pct(s.wr)} | green hours ${pct(s.gh)} green days ${greenDays}/${byDay.size} | worst h ${f2(s.worstHour)}% MDD ${f2(s.mdd)}% DDT ${f2(s.ddt)}h`,
  );
}
const outPath = arg("out");
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(`${outPath}.json`, JSON.stringify({ at: new Date().toISOString(), symbols: U.bars.length, days: (U.nowT - U.startT) / D, runH, mainTop, patch, rows }, null, 2));
  const md = [
    `# CTS-A Core v2 — long simulated trading`,
    ``,
    `${U.bars.length} symbols · ${((U.nowT - U.startT) / D).toFixed(0)} days of ${tf}m BingX bars · ${runs.length} separate ${runH}h runs (${new Date(runs[0]).toISOString().slice(0, 10)} → ${new Date(runs[runs.length - 1] + runH * H).toISOString().slice(0, 10)}) · causal Base per block · Main = top ${mainTop} pairs × every protect × sub-strategy · durable selection, ${base.preH}h pre-calc, ${base.longH / 24}d window · cost 0.2% round trip · patch \`${JSON.stringify(patch)}\``,
    ``,
    `| preset | runs + | stable | orders | /day | PF | net % | WR | green hours | green days | median day PF | worst hour % | MDD % | DDT h |`,
    `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`,
    ...rows.map((r) => `| ${r.label} | ${r.positiveRuns}/${r.runs} | ${r.stableRuns} | ${r.n} | ${r.perDay.toFixed(0)} | ${f2(r.pf)} | ${f2(r.net)} | ${pct(r.wr)} | ${pct(r.gh)} | ${r.greenDays}/${r.days} | ${f2(r.medianDayPf)} | ${f2(r.worstHour)} | ${f2(r.mdd)} | ${f2(r.ddt)} |`),
    ``,
    `## Runs (PF per 2-day run)`,
    ``,
    `| run start | ${rows.map((r) => r.preset).join(" | ")} |`,
    `|---|${rows.map(() => "---:").join("|")}|`,
    ...runs.map((t, i) => `| ${new Date(t).toISOString().slice(0, 13)}h | ${rows.map((r) => `${f2(r.runsDetail[i]?.pf)} (${r.runsDetail[i]?.n})`).join(" | ")} |`),
  ].join("\n");
  writeFileSync(`${outPath}.md`, md);
  console.error(`→ ${outPath}.md`);
}
