#!/usr/bin/env node
// CTS-A Core v2 headless runner: backtest real BingX history (or synthetic) through the full pipeline
// and write a report.
//
//   node --experimental-strip-types scripts/core-run.mjs --symbols 16 --days 7 --tf 5
//   node --experimental-strip-types scripts/core-run.mjs --synthetic --out docs/core-report
//   flags: --cache <file.json> reuse fetched candles · --json print JSON only
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_SETTINGS } from "../src/core/config.ts";
import { barsFromCandles, syntheticCandles } from "../src/core/market/bars.ts";
import { fetchHistory, fetchTickers, pickUniverse } from "../src/core/market/bingx.ts";
import { makeUniverse, runPipelineSync } from "../src/core/pipeline/pipeline.ts";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(`--${k}`);

const settings = {
  ...DEFAULT_SETTINGS,
  symbols: Number(arg("symbols", DEFAULT_SETTINGS.symbols)),
  historyDays: Number(arg("days", DEFAULT_SETTINGS.historyDays)),
  tfMin: Number(arg("tf", DEFAULT_SETTINGS.tfMin)),
  armTop: Number(arg("arm", DEFAULT_SETTINGS.armTop)),
};
const barsWanted = Math.round((settings.historyDays * 24 * 60) / settings.tfMin);
const log = (...a) => {
  if (!flag("json")) console.error(...a);
};

async function loadCandles() {
  const cache = arg("cache");
  if (cache && existsSync(cache)) {
    log(`cache ← ${cache}`);
    return JSON.parse(readFileSync(cache, "utf8"));
  }
  if (flag("synthetic")) {
    const end = Date.now();
    return Object.fromEntries(
      Array.from({ length: settings.symbols }, (_, i) => [`SYN${i}-USDT`, syntheticCandles(`SYN${i}`, settings.tfMin, barsWanted, end)]),
    );
  }
  const tickers = await fetchTickers();
  const syms = pickUniverse(tickers, settings.symbols);
  log(`universe: ${syms.join(" ")}`);
  const out = {};
  for (const s of syms) {
    try {
      out[s] = await fetchHistory(s, settings.tfMin, barsWanted, { pauseMs: 120 });
      log(`  ${s}: ${out[s].length} bars`);
    } catch (e) {
      log(`  ${s}: ${e.message}`);
    }
  }
  if (cache) {
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, JSON.stringify(out));
  }
  return out;
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const pct = (x) => `${(x * 100).toFixed(0)}%`;

const candles = await loadCandles();
const bars = Object.entries(candles).map(([s, cs]) => barsFromCandles(s, settings.tfMin, cs));
const u = makeUniverse(bars);
const t0 = performance.now();
let lastStage = "";
const out = runPipelineSync(u, settings, (p) => {
  if (p.stage !== lastStage) log(`${p.stage} … (${p.total})`);
  lastStage = p.stage;
});
const ms = performance.now() - t0;

const P = out.portfolio;
const summary = {
  at: new Date().toISOString(),
  source: flag("synthetic") ? "synthetic" : "bingx",
  settings: { symbols: u.bars.length, tfMin: settings.tfMin, days: settings.historyDays, cost: settings.cost, gates: settings.gates },
  universe: out.universe,
  ms: Math.round(ms),
  timings: out.timings,
  s1: { combos: out.s1.length, positive: out.s1.filter((r) => r.is.net > 0).length },
  s2: { runs: out.s2.length },
  portfolio: {
    members: P.members,
    guardPct: P.guardPct,
    is: P.is,
    oos: P.oos,
    full: P.full,
  },
  top: out.ranked.slice(0, 25).map((r) => ({
    rank: r.rank,
    id: r.id,
    armed: r.armed,
    full: { n: r.full.n, pf: r.full.pf, net: r.full.net, ddt: r.full.ddt, gh: r.full.gh, tph: r.full.tph },
    bestN: r.lastN?.bestN,
    oos: r.lastN && { n: r.lastN.oos.n, pf: r.lastN.oos.pf, net: r.lastN.oos.net, ddt: r.lastN.oos.ddt, gh: r.lastN.oos.gh },
    lastNOk: r.lastN?.success,
    evalPass: r.evalRes?.passRatio,
    evalOk: r.evalRes?.success,
  })),
};

if (flag("json")) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const s = (x) => `n ${x.n} · PF ${f2(x.pf)} · net ${f2(x.net)}% · DDT ${f2(x.ddt)}h · green hours ${pct(x.gh)} (${x.greenHours}/${x.hours}) · ${f2(x.tph)}/h · worst hour ${f2(x.worstHour)}%`;
  console.log(`\nCTS-A Core v2 · ${summary.source} · ${u.bars.length} symbols × ${settings.historyDays}d ${settings.tfMin}m · ${summary.ms} ms`);
  console.log(`S1 ${summary.s1.combos} combos (${summary.s1.positive} positive in-sample) · S2 ${summary.s2.runs} refined`);
  console.log(`\nPortfolio (${P.members.length} bots, hour guard ${P.guardPct ? P.guardPct + "%" : "off"})`);
  console.log(`  in-sample   ${s(P.is)}`);
  console.log(`  out-sample  ${s(P.oos)}`);
  for (const m of P.members) console.log(`   · ${m}`);
  console.log(`\nTop ranked`);
  for (const r of summary.top.slice(0, 15)) {
    console.log(
      `${String(r.rank).padStart(3)} ${r.armed ? "●" : " "} ${r.id.padEnd(44)} N*${String(r.bestN ?? "–").padStart(3)}  full PF ${f2(r.full.pf)} net ${f2(r.full.net)}% gh ${pct(r.full.gh)} · OOS n${r.oos?.n} PF ${f2(r.oos?.pf)} net ${f2(r.oos?.net)}% · eval ${pct(r.evalPass ?? 0)}`,
    );
  }
}
const outBase = arg("out");
if (outBase) {
  mkdirSync(dirname(outBase), { recursive: true });
  writeFileSync(`${outBase}.json`, JSON.stringify(summary, null, 2));
  log(`report → ${outBase}.json`);
}
