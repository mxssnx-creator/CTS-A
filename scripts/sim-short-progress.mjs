#!/usr/bin/env node
/** Local-only 72h × 120 short-range sim. Does not touch remote. */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  allShortTpSlCombos,
} from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  tpAtr: 0.4,
  slOfTp: 1.5,
  slAtr: 0.6,
  tpRatio: 1 / 1.5,
  trailingPct: 1.5,
  maxHoldTicks: 20000,
  maxHoldBars: 8,
};
const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "shared",
  overallMode: "shared",
  overall: true,
  windows: true,
  stack: true,
};
const hours = 72;
const symbols = 120;
const t0 = Date.now();
const cells = [];
const combos = allShortTpSlCombos().filter((c) => c.tpAtr >= 0.3 && c.slOfTp >= 1);
for (const tactic of ["trailing", "hybrid"]) {
  for (const range of ["atr", "fibonacci"]) {
    for (const on of [true, false]) {
      const cfg = { ...CFG };
      const block = on ? BLOCK : { ...BLOCK, enabled: false, overall: false };
      const { report: r } = simulateHours(hours, cfg, tactic, { symbolCount: symbols, rangeType: range, block });
      cells.push({
        tactic,
        range,
        block: on,
        pf: r.pf,
        wr: r.wr,
        net: r.net,
        trades: r.trades,
        mdd: r.mdd,
        ddt: r.ddt,
        avgPos: r.avgPositions ?? r.avgPos,
      });
      console.log(
        `${tactic}/${range} block=${on} PF ${r.pf.toFixed(2)} n=${r.trades} ddt=${r.ddt} net=${(r.net || 0).toFixed(2)}`,
      );
    }
  }
}
const combosRun = [];
for (const s of combos) {
  const cfg = { ...CFG, ...s };
  const { report: r } = simulateHours(Math.min(24, hours), cfg, "trailing", { symbolCount: 40, rangeType: "atr", block: BLOCK });
  combosRun.push({ ...s, pf: r.pf, n: r.trades, ddt: r.ddt, net: r.net });
  console.log(`short ${s.tpAtr}/${s.slOfTp} PF ${r.pf.toFixed(2)} n=${r.trades} ddt=${r.ddt}`);
}
const best = [...cells].sort((a, b) => b.pf - a.pf || a.ddt - b.ddt)[0];
const bestShort = [...combosRun].sort((a, b) => b.pf - a.pf || a.ddt - b.ddt)[0];
const out = { hours, symbols, elapsedMs: Date.now() - t0, best, bestShort, cells, combosRun };
writeFileSync("public/short-progress-sim.json", JSON.stringify(out, null, 2));
console.log("winner", best, "short", bestShort, "ms", out.elapsedMs);
