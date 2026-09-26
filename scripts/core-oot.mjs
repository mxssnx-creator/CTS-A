#!/usr/bin/env node
// Out-of-time validation: configs fixed by the research (train half only) are run unchanged over a longer
// history, month by month. Months before the research window were never seen by any selection.
//
//   node --experimental-strip-types scripts/core-oot.mjs --cache candles1h.json --srctf 60 --tf 60 \
//        --research docs/research-1h.json --trainFrom 2026-06-28 --out docs/oot-1h
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { comboSignal } from "../src/core/bots/bots.ts";
import { RT_COST } from "../src/core/config.ts";
import { barsFromCandles, resample } from "../src/core/market/bars.ts";
import { statsOf } from "../src/core/metrics/stats.ts";
import { makeUniverse } from "../src/core/pipeline/pipeline.ts";
import { simulate } from "../src/core/sim/backtest.ts";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const tf = Number(arg("tf", 60));
const srctf = Number(arg("srctf", 60));
const raw = JSON.parse(readFileSync(arg("cache"), "utf8"));
const U = makeUniverse(Object.entries(raw).map(([s, c]) => barsFromCandles(s, tf, resample(c, srctf, tf))));
const R = JSON.parse(readFileSync(arg("research"), "utf8"));
const trainFrom = Date.parse(arg("trainFrom", "2026-06-28"));
const split = R.split;

// per family: the variant with the best TRAIN net (the research's own choice), plus the family's median variant
const fams = new Map();
for (const s of R.survivors) (fams.get(s.id) ?? fams.set(s.id, []).get(s.id)).push(s);
const picks = [];
for (const [id, v] of [...fams.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, Number(arg("families", 4)))) {
  const best = [...v].sort((a, b) => b.train.n * b.train.pf - a.train.n * a.train.pf)[0];
  picks.push({ id, g: best.g, variants: v.length });
}

const month = (t) => new Date(t).toISOString().slice(0, 7);
const rows = [];
for (const p of picks) {
  const [bot, ind] = p.id.split("|");
  const prot = { tp: p.g.tp, sl: p.g.sl, trail: p.g.trail, hold: p.g.hold };
  const tr = [];
  for (let s = 0; s < U.bars.length; s++) {
    const sig = comboSignal(bot, ind, U.caches[s]);
    if (!sig) continue;
    for (const t of simulate(p.id, U.bars[s], sig, prot, { cost: RT_COST }).trades) tr.push(t);
  }
  tr.sort((a, b) => a.exitT - b.exitT);
  const period = (t) => (t.exitT <= trainFrom ? "unseen (before research)" : t.exitT <= split ? "train" : "test");
  const byPeriod = {};
  for (const k of ["unseen (before research)", "train", "test"]) byPeriod[k] = statsOf(tr.filter((t) => period(t) === k));
  const byMonth = {};
  for (const t of tr) (byMonth[month(t.exitT)] ??= []).push(t);
  const months = Object.entries(byMonth).map(([m, xs]) => ({ m, ...statsOf(xs) }));
  rows.push({ ...p, prot, byPeriod, months, all: statsOf(tr) });
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const pc = (x) => `${(x * 100).toFixed(2)}%`;
const md = [`# Out-of-time validation — ${tf}m`, "", `${U.bars.length} symbols · ${new Date(U.startT).toISOString().slice(0, 10)} → ${new Date(U.nowT).toISOString().slice(0, 10)} · configs fixed by the research on the train half only · cost 0.2% round trip`, ""];
for (const r of rows) {
  md.push(`## ${r.id} — TP ${pc(r.prot.tp)} · SL ${pc(r.prot.sl)} · trail ${pc(r.prot.trail)} · hold ${r.prot.hold} bars (${r.variants} surviving variants)`);
  md.push("");
  md.push("| period | trades | /day | PF | net % | WR | green months |");
  md.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const [k, s] of Object.entries(r.byPeriod)) {
    const days = s.n ? Math.max(1, (s.lastT - s.firstT) / 86_400_000) : 1;
    md.push(`| ${k} | ${s.n} | ${f2(s.n / days)} | ${f2(s.pf)} | ${f2(s.net)} | ${Math.round(s.wr * 100)}% | |`);
  }
  const green = r.months.filter((m) => m.net > 0).length;
  md.push(`| **all** | ${r.all.n} | | ${f2(r.all.pf)} | ${f2(r.all.net)} | ${Math.round(r.all.wr * 100)}% | ${green}/${r.months.length} |`);
  md.push("");
  md.push(`Months: ${r.months.map((m) => `${m.m} PF ${f2(m.pf)} (${m.n})`).join(" · ")}`);
  md.push("");
}
const out = arg("out");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.md`, md.join("\n"));
  writeFileSync(`${out}.json`, JSON.stringify(rows.map(({ months, ...r }) => ({ ...r, months: months.map((m) => ({ m: m.m, n: m.n, pf: m.pf, net: m.net })) })), null, 2));
}
console.log(md.join("\n"));
