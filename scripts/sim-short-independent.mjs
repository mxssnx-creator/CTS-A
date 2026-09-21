#!/usr/bin/env node
/** Independent short-range SL 0.5–2.5 step 0.25 · each combo is its own tape with prehours. */
import { writeFileSync } from "node:fs";
import {
  SHORT_SL_OF_TP,
  SHORT_TP_ATR,
  allShortTpSlCombos,
  shortComboKey,
} from "../src/lib/desk/engine.ts";
import { completeIndependentTradeSim, LIVE_TACTICS } from "../src/lib/desk/vst.ts";
import { RANGE_TYPES } from "../src/lib/desk/engine.ts";

const combos = allShortTpSlCombos();
const t0 = Date.now();
console.log(`grid ${SHORT_TP_ATR.length}×${SHORT_SL_OF_TP.length} = ${combos.length} independent tapes`);

const covering = completeIndependentTradeSim({
  hours: 6,
  prehours: 6,
  symbolCount: 24,
  tactic: "trailing",
  block: false,
  combos,
  tactics: true,
  tacticHours: [4],
});

const ok = covering.short.cells.filter((c) => c.ok).sort((a, b) => b.pf - a.pf || b.net - a.net);
const ranked = [...covering.short.cells].sort((a, b) => b.pf - a.pf || b.net - a.net);
console.log(
  `short 6h+6h pre ×24 · cells ${covering.short.cells.length} · orders ${covering.short.all.orders} · trades ${covering.short.all.trades} · leaked ${covering.leaked} · ok ${ok.length}`,
);
for (const c of ranked.slice(0, 12)) {
  console.log(
    `  ${c.combo} PF ${c.pf.toFixed(2)} n=${c.trades} net=${c.net.toFixed(3)} orders=${c.orders} leaked=${c.leaked} ${c.ok ? "ok" : ""}`,
  );
}

const top = ok.slice(0, 9).map((c) => combos.find((x) => shortComboKey(x.tpAtr, x.slOfTp) === c.combo)).filter(Boolean);
const blocked = top.length
  ? completeIndependentTradeSim({
      hours: 4,
      prehours: 4,
      symbolCount: 20,
      tactic: "trailing",
      block: true,
      combos: top,
    })
  : null;
if (blocked) {
  console.log(`block confirm 4h+4h ×20 · ${blocked.short.cells.length} · leaked ${blocked.leaked}`);
  for (const c of blocked.short.cells) {
    console.log(`  block ${c.combo} PF ${c.pf.toFixed(2)} n=${c.trades} orders=${c.orders}`);
  }
}

const out = {
  at: new Date().toISOString(),
  hours: covering.hours,
  prehours: covering.prehours,
  symbolCount: covering.symbolCount,
  grid: { tp: [...SHORT_TP_ATR], sl: [...SHORT_SL_OF_TP], n: combos.length },
  elapsedMs: Date.now() - t0,
  leaked: covering.leaked,
  orders: covering.short.all.orders,
  trades: covering.short.all.trades,
  ok: ok.length,
  winner: ranked[0] ?? null,
  complete: covering.complete
    ? {
        cells: covering.complete.cells.length,
        tactics: LIVE_TACTICS.length,
        ranges: RANGE_TYPES.length,
        winner: covering.complete.winner,
      }
    : null,
  blocked: blocked
    ? {
        leaked: blocked.leaked,
        cells: blocked.short.cells,
        orders: blocked.short.all.orders,
        trades: blocked.short.all.trades,
      }
    : null,
  ranked: ranked.slice(0, 24),
  cells: covering.short.cells,
};
writeFileSync("public/short-independent-sim.json", JSON.stringify(out, null, 2));
console.log("wrote public/short-independent-sim.json", "ms", out.elapsedMs);
