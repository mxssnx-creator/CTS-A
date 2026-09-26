#!/usr/bin/env node
// CTS-A Core v2 — optimisation sweep on repeated 2-day walk-forward runs (20h pre-calc).
// Axes: last-N count, last-N min PF (N eval), SL max ratio of TP, trailing share + minimum trail distance,
// minimum SL distance, strategy preset. Every protect variant is its own independent tape.
// Tapes are built per SL-ratio group to bound memory.
//
//   node --experimental-strip-types scripts/core-sweep.mjs --cache <candles5m.json> [--tf 15] [--warm 8] [--out docs/core-sweep]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_SETTINGS, STRATEGY_PRESETS } from "../src/core/config.ts";
import { barsFromCandles, resample } from "../src/core/market/bars.ts";
import { statsOf } from "../src/core/metrics/stats.ts";
import { makeUniverse } from "../src/core/pipeline/pipeline.ts";
import { buildTapes, defaultWalkForward, DEFAULT_GRID, protectGrid, walkForward } from "../src/core/sim/walkforward.ts";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const H = 3_600_000;
const tf = Number(arg("tf", 15));
const warm = Number(arg("warm", 8));
const candles = JSON.parse(readFileSync(arg("cache"), "utf8"));
const u = makeUniverse(Object.entries(candles).map(([s, c]) => barsFromCandles(s, tf, resample(c, 5, tf))));
const settings = { ...DEFAULT_SETTINGS, tfMin: tf };
const base = defaultWalkForward(settings);

const SL_GROUPS = JSON.parse(arg("sl", "[[1],[1.5],[2],[2.5]]"));
const TRAIL = JSON.parse(arg("trail", "[[0],[0.25],[0.4]]"));
const LASTN = JSON.parse(arg("lastn", "[0,5,8,12,20,30]"));
const LASTN_PF = JSON.parse(arg("lastnpf", "[1.0,1.1]"));
const PRESETS = (arg("presets", "block,block-active,dca-active")).split(",");

const windows = [];
for (let st = u.startT + warm * 24 * H; st + 48 * H <= u.nowT; st += 48 * H) windows.push(Math.floor(st / H) * H);
const rows = [];
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "–");
console.error(`${u.bars.length} symbols ${tf}m · ${windows.length} × 48h runs`);

for (const slg of SL_GROUPS) {
  for (const trg of TRAIL) {
    const grid = { ...DEFAULT_GRID, slOfTp: slg, trailOfTp: trg };
    const protects = protectGrid(tf, grid);
    const t0 = performance.now();
    const withDca = PRESETS.some((p) => p.includes("dca"));
    const tapes = buildTapes(u, protects, settings.cost, withDca ? { protects: protects.filter((p) => p.trail === 0), dca: base.dca } : undefined);
    const buildMs = performance.now() - t0;
    for (const preset of PRESETS) {
      for (const lastN of LASTN) {
        for (const lastNMinPf of lastN === 0 ? [1] : LASTN_PF) {
          const o = { ...base, protects, lastN, lastNMinPf, toggles: STRATEGY_PRESETS[preset].toggles };
          const all = [];
          let pos = 0;
          for (const startT of windows) {
            const r = walkForward(u, tapes, { ...o, startT });
            all.push(...r.trades);
            if (r.stats.net > 0) pos++;
          }
          all.sort((a, b) => a.exitT - b.exitT);
          const s = statsOf(all);
          const row = { sl: slg, trail: trg, preset, lastN, lastNMinPf, n: s.n, perDay: s.n / (windows.length * 2), pf: s.pf, net: s.net, gh: s.gh, worstHour: s.worstHour, ddt: s.ddt, positiveRuns: pos, runs: windows.length };
          rows.push(row);
          console.log(
            `SL×${slg.join("/")} trail ${trg.join("/")} ${preset.padEnd(14)} N ${String(lastN).padStart(2)} pf≥${lastNMinPf} | n ${String(s.n).padStart(5)} (${row.perDay.toFixed(0)}/d) PF ${f2(s.pf)} net ${f2(s.net).padStart(8)}% gh ${Math.round(s.gh * 100)}% worst ${f2(s.worstHour)} · ${pos}/${windows.length} runs +`,
          );
        }
      }
    }
    console.error(`  group SL ${slg} trail ${trg}: ${tapes.length} tapes in ${Math.round(buildMs)} ms`);
  }
}
rows.sort((a, b) => b.pf - a.pf);
const out = arg("out");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.json`, JSON.stringify({ at: new Date().toISOString(), tf, symbols: u.bars.length, windows: windows.length, rows }, null, 2));
}
console.log("\nTop 15 by PF (min 200 orders):");
for (const r of rows.filter((r) => r.n >= 200).slice(0, 15))
  console.log(`  SL×${r.sl} trail ${r.trail} ${r.preset} N${r.lastN} pf≥${r.lastNMinPf} → PF ${f2(r.pf)} net ${f2(r.net)}% n ${r.n} (${r.perDay.toFixed(0)}/d) ${r.positiveRuns}/${r.runs} runs +`);
