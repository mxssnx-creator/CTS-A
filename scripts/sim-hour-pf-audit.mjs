#!/usr/bin/env node
/** Audit gated vs paper hour PF. Full computing + lock-only. */
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  SHORT_WINNER,
  SHORT_EVAL_HOURS,
} from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  tpAtr: SHORT_WINNER.tpAtr,
  slOfTp: SHORT_WINNER.slOfTp,
  slAtr: SHORT_WINNER.tpAtr * SHORT_WINNER.slOfTp,
  tpRatio: 1 / SHORT_WINNER.slOfTp,
  trailingPct: 1.5,
  maxHoldTicks: 24,
  maxHoldBars: 3,
};

const block = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  liveDisable: true,
  autoEval: true,
  windows: true,
  counts: [1, 2, 3, 4, 5, 6],
  volumeMode: "shared",
  overallMode: "shared",
  sharedVolumeRatio: 1.5,
  volumeRatio: 0.2,
  overallVolumeRatio: 1.5,
};

function dump(label, r) {
  const hours = r.hourly || [];
  const gatedGreen = hours.filter((h) => Number(h.gatedN) > 0 && Number(h.gatedNet) > 1e-9).length;
  const gatedFlat = hours.filter((h) => !Number(h.gatedN)).length;
  const gatedRed = hours.filter((h) => Number(h.gatedN) > 0 && Number(h.gatedNet) <= 1e-9).length;
  const paperGreen = hours.filter((h) => Number(h.net) > 1e-9).length;
  console.log(`\n=== ${label} ===`);
  console.log(`paper PF ${Number(r.paperPf ?? r.pf).toFixed(3)}  report PF ${Number(r.pf).toFixed(3)}  selected ${r.selected?.n ?? 0} PF ${Number(r.selected?.pf ?? 0).toFixed(3)}  gated n=${r.liveGated?.n ?? "?"} PF ${Number(r.liveGated?.pf ?? 0).toFixed(3)}`);
  console.log(`hours ${hours.length}  paperGreen ${paperGreen}  gatedGreen ${gatedGreen}  gatedRed ${gatedRed}  gatedFlat ${gatedFlat}  selGreen ${r.selected?.greenHours ?? "?"}`);
  console.log(`floors short ${r.floors?.short} base ${r.floors?.base} block ${r.floors?.block}`);
  for (const h of hours) {
    const g = Number(h.gatedN) > 0 ? (Number(h.gatedNet) > 0 ? "G+" : "G-") : "G0";
    const p = Number(h.net) > 0 ? "P+" : Number(h.net) < 0 ? "P-" : "P0";
    console.log(
      `  H${String(h.h).padStart(2, "0")} ${p}/${g} paperNet ${Number(h.net).toFixed(3)} hourPf ${Number(h.hourPf).toFixed(2)} gated n=${h.gatedN ?? 0} net ${Number(h.gatedNet ?? 0).toFixed(3)} pf ${Number(h.gatedPf ?? 0).toFixed(2)} trades ${h.trades}`,
    );
  }
  return { gatedGreen, gatedRed, gatedFlat, hours: hours.length, pf: r.pf };
}

const t0 = Date.now();
const lock = simulateHours(8, CFG, "hybrid", {
  symbolCount: 12,
  rangeType: "atr",
  block,
  equity: 1e4,
  costStep: 10,
  complete: false,
  comboOnly: true,
  prehours: 4,
  shortPf: 0.95,
});
dump("LOCK comboOnly 8h×12 +4h pre  shortPf 0.95", lock.report);

const lockHi = simulateHours(8, CFG, "hybrid", {
  symbolCount: 12,
  rangeType: "atr",
  block,
  equity: 1e4,
  costStep: 10,
  complete: false,
  comboOnly: true,
  prehours: 4,
  shortPf: 1.15,
});
dump("LOCK comboOnly 8h×12 +4h pre  shortPf 1.15", lockHi.report);

const full = simulateHours(8, CFG, "hybrid", {
  symbolCount: 16,
  rangeType: "atr",
  block,
  equity: 1e4,
  costStep: 10,
  complete: true,
  comboOnly: false,
  prehours: 6,
  shortPf: 0.95,
});
dump("COMPLETE 8h×16 +6h pre  shortPf 0.95", full.report);

const fullHi = simulateHours(8, CFG, "hybrid", {
  symbolCount: 16,
  rangeType: "atr",
  block,
  equity: 1e4,
  costStep: 10,
  complete: true,
  comboOnly: false,
  prehours: 6,
  shortPf: 1.15,
});
dump("COMPLETE 8h×16 +6h pre  shortPf 1.15", fullHi.report);

console.log(`\ndone ${(Date.now() - t0) / 1000}s`);
