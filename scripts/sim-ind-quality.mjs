#!/usr/bin/env node
/** 12h × 40 complete · indication quality gates vs previous extras-drag */
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, indicationQuality, INDICATION_QUALITY_FLOOR } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  tpAtr: 0.42,
  slOfTp: 1.7,
  slAtr: 0.714,
  tpRatio: 1 / 1.7,
  trailingPct: 1.5,
  maxHoldTicks: 24,
  maxHoldBars: 3,
};

const block = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "parallel",
  overallMode: "parallel",
  overall: true,
  overallSymbol: true,
  overallDirection: true,
  sets: true,
  windows: true,
  stack: true,
  volumeRatio: 0.15,
  relVolumeRatio: 0.15,
  sharedVolumeRatio: 2.5,
  overallVolumeRatio: 2.5,
  maxVolumeMultiplier: 6,
  counts: [1, 3, 4, 5, 6],
  maxMultiple: 6,
  minActiveLevel: 2,
  pauseCountRatio: 1,
  keepAdjusted: true,
  sides: "both",
};

const t0 = Date.now();
const { report: r } = simulateHours(12, CFG, "trailing", {
  symbolCount: 40,
  rangeType: "atr",
  block,
  equity: 10,
  costStep: 3,
  complete: true,
  orderType: "limit",
});
const ms = Date.now() - t0;
console.log(`PF ${r.pf.toFixed(3)}  WR ${(r.wr * 100).toFixed(1)}%  n=${r.trades}  net=${Number(r.net).toFixed(3)}  eq ${Number(r.equity).toFixed(3)}  placed=${r.ordersPlaced}  mdd=${(r.mdd * 100).toFixed(2)}%  ddt=${r.ddt}  ${ms}ms`);
console.log("indication          n     PF    WR    net");
for (const i of r.byIndication || []) {
  const net = (i.profit || 0) - (i.loss || 0);
  const flag = i.pf >= 1.05 ? "ok" : i.pf < 0.95 ? "LOSE" : "flat";
  console.log(`  ${i.id.padEnd(12)} ${String(i.n).padStart(5)}  ${i.pf.toFixed(2).padStart(5)}  ${((i.wr || 0) * 100).toFixed(1).padStart(5)}%  ${net.toFixed(4).padStart(8)}  ${flag}`);
}
console.log("floor", INDICATION_QUALITY_FLOOR, "quality(trend dummy)", indicationQuality("trend", { trend: 0.7, break: 0.1, active: 0.2, direction: 0.2, move: 0, rsi: 0, bollinger: 0, sar: 0, macd: 0, ema: 0, activity: 1.1, hf: false, agree: true, hits: 3, timing: 0.6, lastPart: 0.3, drawdown: 0.1, prevRel: 0.2, relations: { pulse: 1, range: 1, vol: 1, dir: 1, volRange: 0, pulseDir: 1, rangeDir: 1, agree: 0.4, hf: false, timing: 0.6 } }).toFixed(2));
console.log("hourly PF", (r.hourly || []).map((h) => `${h.h}:${Number(h.pf).toFixed(2)}`).join(" "));
