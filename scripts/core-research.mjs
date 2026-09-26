#!/usr/bin/env node
// CTS-A Core v2 — indication research, one indication at a time, on REAL data with a strict holdout.
//   Stage 1: every indication × {follow, revert, magnet, pivot, sandwich} with a base protect, scored on the
//            first half (train) only.
//   Stage 2: the train leaders get the full protect grid (TP × SL ratio × min SL × trail share × min trail × hold).
//   Holdout: everything is reported on the second half (test), never used for selection.
// Output: per-indication table, per-parameter sensitivity (min SL, min trail, SL ratio, trail share, TP),
// and the grid defaults with the best holdout evidence.
//
//   node --experimental-strip-types scripts/core-research.mjs --cache candles.json --srctf 15 --tf 15 --out docs/research-15m
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { comboSignal } from "../src/core/bots/bots.ts";
import { RT_COST } from "../src/core/config.ts";
import { INDICATIONS } from "../src/core/indications/registry.ts";
import { barsFromCandles, resample } from "../src/core/market/bars.ts";
import { profitFactor, statsOf } from "../src/core/metrics/stats.ts";
import { makeUniverse } from "../src/core/pipeline/pipeline.ts";
import { simulate } from "../src/core/sim/backtest.ts";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const tf = Number(arg("tf", 15));
const srctf = Number(arg("srctf", 5));
const top = Number(arg("top", 25));
const bots = arg("bots", "follow,revert,magnet,pivot,sandwich").split(",");
const raw = JSON.parse(readFileSync(arg("cache"), "utf8"));
const U = makeUniverse(Object.entries(raw).map(([s, c]) => barsFromCandles(s, tf, resample(c, srctf, tf))));
const split = U.startT + (U.nowT - U.startT) / 2;
const days = (U.nowT - U.startT) / 86_400_000;
const barsPerH = 60 / tf;
// scale defaults to the timeframe: typical move over the hold grows ~ sqrt(time)
const scale = Math.sqrt(tf / 15);
const r4 = (x) => +x.toFixed(4);
const TP = JSON.parse(arg("tp", JSON.stringify([0.006, 0.01, 0.018, 0.026, 0.035, 0.05, 0.07].map((x) => r4(x * scale)))));
const SLR = [0.75, 1, 1.5, 2, 2.5];
const MINSL = JSON.parse(arg("minsl", JSON.stringify([0.003, 0.006, 0.01].map((x) => r4(x * scale)))));
const TRS = [0, 0.3, 0.5];
const MINTR = JSON.parse(arg("mintrail", JSON.stringify([0.002, 0.004, 0.008].map((x) => r4(x * scale)))));
const HOLD_H = JSON.parse(arg("hold", "[3, 8]"));
const BASE = { tp: r4(0.026 * scale), sl: r4(0.039 * scale), trail: 0, hold: Math.round(8 * barsPerH) };

console.error(`${U.bars.length} symbols · ${days.toFixed(0)} days · ${tf}m · ${INDICATIONS.length} indications × ${bots.length} bots · split ${new Date(split).toISOString().slice(0, 10)}`);

function run(bot, ind, p) {
  const tr = [];
  for (let s = 0; s < U.bars.length; s++) {
    const sig = comboSignal(bot, ind, U.caches[s]);
    if (!sig) return null;
    for (const t of simulate("x", U.bars[s], sig, p, { cost: RT_COST }).trades) tr.push(t);
  }
  tr.sort((a, b) => a.exitT - b.exitT);
  const train = tr.filter((t) => t.exitT <= split);
  const test = tr.filter((t) => t.entryT >= split);
  const gross = (xs) => (xs.length ? xs.reduce((a, t) => a + t.r + RT_COST, 0) / xs.length : 0);
  return { train: statsOf(train), test: statsOf(test), grossTrain: gross(train), grossTest: gross(test) };
}

// Stage 1
const t0 = performance.now();
const s1 = [];
for (const ind of INDICATIONS) {
  for (const bot of bots) {
    const r = run(bot, ind.id, BASE);
    if (r) s1.push({ ind: ind.id, kind: ind.kind, bot, ...r });
  }
}
console.error(`stage 1: ${s1.length} combos in ${Math.round((performance.now() - t0) / 1000)} s`);

// per-indication best (train net) → its test result
const perInd = INDICATIONS.map((ind) => {
  const rows = s1.filter((r) => r.ind === ind.id).sort((a, b) => b.train.net - a.train.net);
  const b = rows[0];
  return { ind: ind.id, kind: ind.kind, label: ind.label, bot: b?.bot, trainPf: b?.train.pf, trainN: b?.train.n, testPf: b?.test.pf, testN: b?.test.n, testNet: b?.test.net, grossTest: b?.grossTest };
});

// Stage 2: leaders (train, enough trades) × full grid
const leaders = s1.filter((r) => r.train.n >= 30).sort((a, b) => b.train.net - a.train.net).slice(0, top);
const grid = [];
for (const tp of TP)
  for (const k of SLR)
    for (const minSl of MINSL)
      for (const trs of TRS)
        for (const minTr of trs ? MINTR : [0])
          for (const h of HOLD_H) grid.push({ tp, sl: r4(Math.max(minSl, tp * k)), trail: trs ? r4(Math.max(minTr, tp * trs)) : 0, hold: Math.round(h * barsPerH), k, minSl, trs, minTr, h });
const uniq = new Map();
for (const g of grid) uniq.set(`${g.tp}|${g.sl}|${g.trail}|${g.hold}|${g.k}|${g.minSl}|${g.trs}|${g.minTr}`, g);
const G = [...uniq.values()];
console.error(`stage 2: ${leaders.length} leaders × ${G.length} protect variants`);
const s2 = [];
let done = 0;
for (const L of leaders) {
  for (const g of G) {
    const r = run(L.bot, L.ind, g);
    if (r) s2.push({ ind: L.ind, bot: L.bot, g, ...r });
  }
  done++;
  console.error(`  ${done}/${leaders.length} ${L.bot}|${L.ind} · ${Math.round((performance.now() - t0) / 1000)} s`);
}

// sensitivity: for each axis value, pool the TEST trades' PF across all leaders (selection-free view)
function pooled(filter) {
  let gp = 0, gl = 0, n = 0;
  for (const r of s2) if (filter(r.g)) {
    gp += r.test.gp;
    gl += r.test.gl;
    n += r.test.n;
  }
  return { pf: profitFactor(gp, gl), n };
}
const sens = {
  tp: TP.map((v) => ({ v, ...pooled((g) => g.tp === v) })),
  slRatio: SLR.map((v) => ({ v, ...pooled((g) => g.k === v) })),
  minSl: MINSL.map((v) => ({ v, ...pooled((g) => g.minSl === v) })),
  trailShare: TRS.map((v) => ({ v, ...pooled((g) => g.trs === v) })),
  minTrail: MINTR.map((v) => ({ v, ...pooled((g) => g.trs > 0 && g.minTr === v) })),
  holdH: HOLD_H.map((v) => ({ v, ...pooled((g) => g.h === v) })),
};
// best grid by TRAIN, reported on TEST (honest)
const bestTrain = [...s2].filter((r) => r.train.n >= 30).sort((a, b) => b.train.net - a.train.net).slice(0, 20);
const survivors = s2.filter((r) => r.train.n >= 30 && r.train.pf >= 1.1 && r.test.n >= 30 && r.test.pf >= 1.1);

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : "–");
const md = [];
md.push(`# Indication research — ${tf}m`);
md.push("");
md.push(`${U.bars.length} symbols · ${days.toFixed(0)} days of real BingX data · train ${new Date(U.startT).toISOString().slice(0, 10)} → ${new Date(split).toISOString().slice(0, 10)} · test → ${new Date(U.nowT).toISOString().slice(0, 10)} · cost 0.2% round trip · ${INDICATIONS.length} indications × ${bots.join("/")}`);
md.push("");
md.push(`**Holdout survivors** (train PF ≥ 1.1 and test PF ≥ 1.1, ≥ 30 trades each): ${survivors.length} of ${s2.length} stage-2 configs.`);
md.push("");
md.push("## Sensitivity (stage-2 leaders, test half, pooled)");
md.push("");
for (const [k, rows] of Object.entries(sens)) md.push(`- **${k}**: ${rows.map((r) => `${k.includes("Sl") || k.includes("Trail") || k === "tp" ? pc(r.v) : r.v} → PF ${f2(r.pf)} (n ${r.n})`).join(" · ")}`);
md.push("");
md.push("## Best 20 by train, reported on test");
md.push("");
md.push("| config | TP | SL | trail | hold h | train n | train PF | test n | test PF | test net % | test orders/day |");
md.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of bestTrain) md.push(`| ${r.bot}·${r.ind} | ${pc(r.g.tp)} | ${pc(r.g.sl)} | ${pc(r.g.trail)} | ${r.g.h} | ${r.train.n} | ${f2(r.train.pf)} | ${r.test.n} | ${f2(r.test.pf)} | ${f2(r.test.net)} | ${f2(r.test.n / (days / 2))} |`);
md.push("");
md.push("## Every indication (best bot on train, base protect) → test");
md.push("");
md.push("| kind | indication | bot | train PF | train n | test PF | test n | test net % | gross edge / trade (test) |");
md.push("|---|---|---|---:|---:|---:|---:|---:|---:|");
for (const r of perInd.sort((a, b) => (b.testPf ?? 0) - (a.testPf ?? 0))) md.push(`| ${r.kind} | ${r.ind} | ${r.bot ?? "–"} | ${f2(r.trainPf)} | ${r.trainN ?? 0} | ${f2(r.testPf)} | ${r.testN ?? 0} | ${f2(r.testNet)} | ${pc(r.grossTest)} |`);
const out = arg("out");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.md`, md.join("\n"));
  writeFileSync(`${out}.json`, JSON.stringify({ tf, days, split, sens, survivors: survivors.map((r) => ({ id: `${r.bot}|${r.ind}`, g: r.g, train: { n: r.train.n, pf: r.train.pf }, test: { n: r.test.n, pf: r.test.pf, net: r.test.net } })), perInd }, null, 2));
  console.error(`→ ${out}.md`);
}
console.log(md.slice(0, 16).join("\n"));
