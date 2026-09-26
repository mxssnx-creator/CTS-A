#!/usr/bin/env node
// CTS-A Core v2 — hour-by-hour simulated trade run report for every strategy preset.
// Each run: 20h pre-calc before every hour, then 48h of simulated trading (walk-forward, honest).
//
//   node --experimental-strip-types scripts/core-hourly.mjs --cache <candles5m.json> [--tf 15] [--hours 48]
//        [--end 2026-09-26T00] [--presets a,b] [--patch '{"bots":["magnet"]}'] [--out docs/core-hourly]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_SETTINGS, STRATEGY_PRESETS } from "../src/core/config.ts";
import { barsFromCandles, resample } from "../src/core/market/bars.ts";
import { fetchHistory, fetchTickers, pickUniverse } from "../src/core/market/bingx.ts";
import { profitFactor, statsOf } from "../src/core/metrics/stats.ts";
import { makeUniverse } from "../src/core/pipeline/pipeline.ts";
import { buildTapes, defaultWalkForward, walkForward } from "../src/core/sim/walkforward.ts";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const H = 3_600_000;
const tf = Number(arg("tf", 15));
const hours = Number(arg("hours", 48));

async function loadCandles() {
  const cache = arg("cache");
  if (cache && existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const syms = pickUniverse(await fetchTickers(), Number(arg("symbols", 40)));
  const out = {};
  for (const s of syms) out[s] = await fetchHistory(s, 5, Number(arg("days", 12)) * 288, { pauseMs: 100 });
  if (cache) writeFileSync(cache, JSON.stringify(out));
  return out;
}

const candles = await loadCandles();
let u = makeUniverse(Object.entries(candles).map(([s, c]) => barsFromCandles(s, tf, resample(c, 5, tf))));
const settings = { ...DEFAULT_SETTINGS, tfMin: tf };
const patch = JSON.parse(arg("patch", "{}"));
const base = { ...defaultWalkForward(settings), ...patch };
const tapes = buildTapes(u, base.protects, settings.cost, { protects: base.dcaProtects, dca: base.dca });
const endArg = arg("end");
const endT = endArg ? Date.parse(`${endArg}:00:00Z`) : Math.floor(u.nowT / H) * H;
const startT = endT - hours * H;

const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");
const pad = (s, n) => String(s).padStart(n);
const md = [];
const summary = [];
md.push(`# CTS-A Core v2 — hour-by-hour simulated runs`);
md.push("");
md.push(`${u.bars.length} symbols · ${tf}m bars · ${hours}h run ${new Date(startT).toISOString().slice(0, 13)}h → ${new Date(endT).toISOString().slice(0, 13)}h UTC · 20h pre-calc before each hour · cost 0.2% round trip · min PF ${base.gates.minPf} (neutral 1.0)`);
md.push(`Base tapes: ${tapes.length} (every indication × bot × protect × sub-strategy). Patch: \`${JSON.stringify(patch)}\``);
md.push("");

const PRESETS = STRATEGY_PRESETS;
const selected = arg("presets") ? arg("presets").split(",") : Object.keys(PRESETS);
for (const name of selected) {
  const p = PRESETS[name];
  const o = { ...base, ...p, toggles: { ...base.toggles, ...(p.toggles ?? {}) }, startT, simH: hours };
  const r = walkForward(u, tapes, o);
  const s = r.stats;
  summary.push({ name, n: s.n, pf: s.pf, net: s.net, gh: s.gh, hours: s.hours, greenHours: s.greenHours, worstHour: s.worstHour, mdd: s.mdd, ddt: s.ddt, wr: s.wr, byKind: r.byKind, skips: r.skips });
  md.push(`## ${name}`);
  md.push("");
  md.push(`Toggles: ${Object.entries(o.toggles).map(([k, v]) => `${k} ${v ? "on" : "off"}`).join(" · ")}`);
  md.push(`**Total** n ${s.n} · WR ${f(s.wr * 100, 0)}% · PF ${f(s.pf)} · net ${f(s.net)}% · green hours ${s.greenHours}/${s.hours} (${f(s.gh * 100, 0)}%) · worst hour ${f(s.worstHour)}% · MDD ${f(s.mdd)}% · DDT ${f(s.ddt, 1)}h`);
  md.push(`By kind: ${Object.entries(r.byKind).map(([k, v]) => `${k} n${v.n} PF ${f(v.pf)} net ${f(v.net)}%`).join(" · ") || "–"}`);
  md.push(`Skipped: ${Object.entries(r.skips).map(([k, v]) => `${k} ${v}`).join(" · ") || "–"}`);
  md.push("");
  md.push("```");
  md.push(" hour (UTC)      orders  win  loss   PF     net%    cum%   normal trail   dca  dcaA  blkLvl  dcaLegs  real  skip");
  let cum = 0;
  for (let t = startT; t < endT; t += H) {
    const xs = r.trades.filter((x) => x.exitT >= t && x.exitT < t + H);
    let gp = 0;
    let gl = 0;
    let wins = 0;
    const kinds = { normal: 0, trailing: 0, dca: 0, "dca-active": 0 };
    let lvl = 0;
    let lvlN = 0;
    let legs = 0;
    let legN = 0;
    for (const x of xs) {
      if (x.r > 0) {
        gp += x.r;
        wins++;
      } else gl -= x.r;
      kinds[x.kind ?? "normal"]++;
      if (x.kind === "dca" || x.kind === "dca-active") {
        legs += x.vol ?? 1;
        legN++;
      } else {
        lvl += x.level ?? 0;
        lvlN++;
      }
    }
    const net = (gp - gl) * 100;
    cum += net;
    const step = r.steps.find((st) => st.t === t);
    md.push(
      `${new Date(t).toISOString().slice(5, 13).replace("T", " ")}:00    ${pad(xs.length, 5)} ${pad(wins, 4)} ${pad(xs.length - wins, 5)} ${pad(xs.length ? f(profitFactor(gp, gl)) : "–", 6)} ${pad(f(net), 8)} ${pad(f(cum), 8)}   ${pad(kinds.normal, 5)} ${pad(kinds.trailing, 5)} ${pad(kinds.dca, 5)} ${pad(kinds["dca-active"], 5)}  ${pad(lvlN ? f(lvl / lvlN, 1) : "–", 6)}  ${pad(legN ? f(legs / legN, 1) : "–", 7)}  ${pad(step?.real.length ?? 0, 4)} ${pad(step?.skipped ?? 0, 5)}`,
    );
  }
  md.push("```");
  md.push("");
}

md.splice(4, 0, "## Summary", "", "| preset | orders | WR | PF | net % | green hours | worst hour % | MDD % | DDT h |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...summary.map((s) => `| ${s.name} | ${s.n} | ${f(s.wr * 100, 0)}% | ${f(s.pf)} | ${f(s.net)} | ${s.greenHours}/${s.hours} | ${f(s.worstHour)} | ${f(s.mdd)} | ${f(s.ddt, 1)} |`), "");
const text = md.join("\n");
const out = arg("out");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.md`, text);
  writeFileSync(`${out}.json`, JSON.stringify({ startT, endT, tf, symbols: u.bars.length, patch, summary }, null, 2));
  console.error(`→ ${out}.md`);
} else console.log(text);
