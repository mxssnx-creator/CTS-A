#!/usr/bin/env node
/** 7d sim of TP 0.2–3.0 / SL 0.2–2.0 / multiple trails. Writes protect-grid.json. */
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_BLOCK_CONFIG, TP_SL_RATIOS, SL_ATR_RATIOS, TRAIL_PCTS } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const BLK = { ...DEFAULT_BLOCK_CONFIG, enabled: true, stack: true, windows: true, counts: [1, 2], maxMultiple: 2, evalPosCount: 16 };

function run(hours, symbols, slAtr, tpRatio, trailPct) {
  const cfg = { ...DEFAULT_TACTIC_CONFIG, slAtr, tpRatio, trailingPct: trailPct, dcaCount: 1, maxHoldTicks: 16 };
  const { report } = simulateHours(hours, cfg, "hybrid", { symbolCount: symbols, rangeType: "fibonacci", block: BLK });
  return { slAtr, tpRatio, trailPct, hours, symbols, pf: report.pf, wr: report.wr, n: report.trades, net: report.net, ok: report.pf >= 1 && report.net > 0 };
}

const cells48 = [];
console.log("=== 48h × 12 symbols · TP 0.2–3.0 step 0.2 × SL 0.2–2.0 step 0.1 · trail 0.8 ===");
for (const slAtr of SL_ATR_RATIOS) {
  for (const tpRatio of TP_SL_RATIOS) {
    const x = run(48, 12, slAtr, tpRatio, 0.8);
    cells48.push(x);
    if (x.ok) console.log(`  SL ${slAtr} TP ${tpRatio} PF ${x.pf.toFixed(2)} n=${x.n}`);
  }
}
const pos48 = cells48.filter((c) => c.ok).sort((a, b) => b.pf - a.pf);
console.log(`48h positive ${pos48.length}/${cells48.length} best`, pos48[0]);

console.log("=== trail sweep 48h × 12 · best SL/TP vs each trail ===");
const best = pos48[0] || { slAtr: 1.1, tpRatio: 2.6 };
const trails = [];
for (const trailPct of TRAIL_PCTS) {
  const x = run(48, 12, best.slAtr, best.tpRatio, trailPct);
  trails.push(x);
  console.log(`  trail ${trailPct} PF ${x.pf.toFixed(2)} WR ${x.wr.toFixed(2)} n=${x.n} net ${x.net.toFixed(2)}`);
}

console.log("=== 168h (7d) × 12 symbols · top 12 positive 48h cells ===");
const top = pos48.slice(0, 12);
const long = [];
for (const c of top.length ? top : [{ slAtr: 1.1, tpRatio: 2.6, trailPct: 0.8 }]) {
  const x = run(168, 12, c.slAtr, c.tpRatio, c.trailPct || 0.8);
  long.push(x);
  console.log(`  7d SL ${x.slAtr} TP ${x.tpRatio} PF ${x.pf.toFixed(2)} n=${x.n} net ${x.net.toFixed(2)} ${x.ok ? "ok" : "FAIL"}`);
}

const winners = long.filter((c) => c.ok).sort((a, b) => b.pf - a.pf);
const liveCells = (winners.length ? winners : pos48.filter((c) => c.ok).slice(0, 24)).map((c) => ({
  slAtr: c.slAtr,
  tpRatio: c.tpRatio,
  trailPct: c.trailPct || 0.8,
  pf: c.pf,
  n: c.n,
}));

const out = {
  at: new Date().toISOString(),
  conn: "bingx-vst-02",
  x01: false,
  tp: { min: 0.2, max: 3, step: 0.2 },
  sl: { min: 0.2, max: 2, step: 0.1 },
  trails: [...TRAIL_PCTS],
  cells48,
  trails,
  long,
  cells: liveCells,
  default: liveCells[0] || { slAtr: 1.1, tpRatio: 2.6, trailPct: 0.8 },
};
mkdirSync("/workspace/artifacts", { recursive: true });
mkdirSync("/workspace/public", { recursive: true });
writeFileSync("/workspace/artifacts/protect-grid.json", JSON.stringify(out));
writeFileSync("/workspace/public/protect-grid.json", JSON.stringify({ ...out, cells48: pos48.slice(0, 40) }));
console.log("winners", liveCells.length, "default", out.default);
