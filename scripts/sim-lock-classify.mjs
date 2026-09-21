#!/usr/bin/env node
/** Find stable short winners vs losers. comboOnly, Block off, vary trail/hold. */
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  SHORT_20H_POSITIVE,
  SHORT_WINNER,
  shortComboKey,
} from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const COMBOS = [
  ...SHORT_20H_POSITIVE,
  { tpAtr: 0.52, slOfTp: 1 },
  { tpAtr: 0.45, slOfTp: 0.75 },
  { tpAtr: 0.6, slOfTp: 0.75 },
  { tpAtr: 0.6, slOfTp: 1 },
  { tpAtr: 0.38, slOfTp: 0.75 },
];

const TRAILS = [1.5, 2.0, 2.4];
const HOLD = [12, 24];

const blockOff = { ...DEFAULT_BLOCK_CONFIG, enabled: false, liveDisable: false };

function run(tpAtr, slOfTp, trail, hold) {
  const cfg = {
    ...DEFAULT_TACTIC_CONFIG,
    shortRange: true,
    tpAtr,
    slOfTp,
    slAtr: tpAtr * slOfTp,
    tpRatio: 1 / slOfTp,
    trailingPct: trail,
    maxHoldTicks: hold,
    maxHoldBars: Math.max(2, Math.round(hold / 8)),
  };
  const { report: r } = simulateHours(6, cfg, "trailing", {
    symbolCount: 12,
    rangeType: "atr",
    block: blockOff,
    equity: 1e4,
    costStep: 10,
    complete: false,
    comboOnly: true,
    prehours: 4,
    shortPf: 0.95,
  });
  return {
    tpAtr,
    slOfTp,
    trail,
    hold,
    pf: r.pf,
    paper: r.paperPf ?? r.pf,
    wr: r.wr,
    n: r.trades,
    net: r.net,
    mdd: r.mdd,
    gatedPf: r.liveGated?.pf ?? 0,
    gatedN: r.liveGated?.n ?? 0,
    green: r.selected?.greenHours ?? 0,
    hours: r.selected?.hours ?? 0,
    ok: r.pf + 1e-9 >= 1.15 && r.net > 0 && r.trades >= 8,
    weak: r.pf + 1e-9 >= 1 && r.net > 0 && r.trades >= 8,
  };
}

const t0 = Date.now();
const rows = [];
for (const trail of TRAILS) {
  for (const hold of HOLD) {
    for (const c of COMBOS) {
      const row = run(c.tpAtr, c.slOfTp, trail, hold);
      rows.push(row);
      const tag = row.ok ? "WIN " : row.weak ? "weak" : "LOSE";
      const lock = SHORT_20H_POSITIVE.some((x) => x.tpAtr === c.tpAtr && x.slOfTp === c.slOfTp) ? "L" : " ";
      console.log(
        `${tag} ${lock} TP ${c.tpAtr.toFixed(2)} SL ${c.slOfTp.toFixed(2)} trail ${trail} hold ${hold} PF ${row.pf.toFixed(2)} n=${row.n} net ${row.net.toFixed(2)} wr ${(row.wr * 100).toFixed(0)}% gated n=${row.gatedN} PF ${row.gatedPf.toFixed(2)}`,
      );
    }
  }
}

rows.sort((a, b) => b.pf - a.pf);
const wins = rows.filter((r) => r.ok);
const weak = rows.filter((r) => r.weak && !r.ok);
console.log(`\n${rows.length} runs  ${(Date.now() - t0) / 1000}s  WIN ${wins.length} weak ${weak.length}`);
console.log("TOP 12");
for (const r of rows.slice(0, 12)) {
  console.log(
    `  TP ${r.tpAtr.toFixed(2)}/${r.slOfTp.toFixed(2)} trail ${r.trail} hold ${r.hold} PF ${r.pf.toFixed(2)} n=${r.n} net ${r.net.toFixed(2)}`,
  );
}
const byCombo = new Map();
for (const r of rows) {
  const k = shortComboKey(r.tpAtr, r.slOfTp);
  const cur = byCombo.get(k) || { k, pf: 0, n: 0, wins: 0 };
  cur.pf += r.pf;
  cur.n += 1;
  if (r.ok) cur.wins += 1;
  byCombo.set(k, cur);
}
console.log("\nBy combo avg PF (all trail/hold)");
[...byCombo.values()]
  .map((x) => ({ ...x, avg: x.pf / x.n }))
  .sort((a, b) => b.avg - a.avg)
  .forEach((x) => console.log(`  ${x.k}  avgPF ${x.avg.toFixed(2)}  wins ${x.wins}/${x.n}`));

const winKey = shortComboKey(SHORT_WINNER.tpAtr, SHORT_WINNER.slOfTp);
console.log(`\nWINNER ${winKey} rows:`);
for (const r of rows.filter((x) => shortComboKey(x.tpAtr, x.slOfTp) === winKey)) {
  console.log(`  trail ${r.trail} hold ${r.hold} PF ${r.pf.toFixed(2)} n=${r.n}`);
}
