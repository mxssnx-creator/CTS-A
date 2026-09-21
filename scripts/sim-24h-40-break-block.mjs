#!/usr/bin/env node
/** 24h × 40 complete · $10 · Block 1–6 · breakout-tuned Break */
import { writeFileSync } from "node:fs";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, LIVE_BLOCK_COUNTS, profitFactor } from "../src/lib/desk/engine.ts";
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
  counts: [...LIVE_BLOCK_COUNTS],
  maxMultiple: 6,
  minMultiple: 1,
  minActiveLevel: 1,
  evalPosCount: 6,
  evalLastNs: [1, 2, 3, 4, 5, 6],
  pauseCountRatio: 1,
  keepAdjusted: true,
  sides: "both",
};

const t0 = Date.now();
const { report: r, engine } = simulateHours(24, CFG, "trailing", {
  symbolCount: 40,
  rangeType: "atr",
  block,
  equity: 10,
  costStep: 3,
  complete: true,
  orderType: "limit",
});
const ms = Date.now() - t0;

const line = (s) => {
  console.log(s);
  return s + "\n";
};
let out = "";
out += line(`24h × 40  complete  start $10  cost ${r.costStep}  unit ${Number(r.unitNotional).toFixed(4)}  ${ms}ms`);
out += line(`PF ${r.pf.toFixed(3)}  WR ${(r.wr * 100).toFixed(1)}%  n=${r.trades}  realized=${Number(r.realizedNet).toFixed(4)}  mtmNet=${Number(r.net).toFixed(4)}  eq ${Number(r.equity).toFixed(4)}`);
out += line(`MDD ${(r.mdd * 100).toFixed(2)}%  DDT ${r.ddt} ticks  avgPos ${r.avgPositions.toFixed(2)}  avgOrd ${r.avgOrders.toFixed(1)}  avgBlock ${r.avgBlockOrd.toFixed(1)}`);
out += line(`avgNotional ${Number(r.avgNotional).toFixed(3)}  avgMargin ${Number(r.avgMargin).toFixed(4)}  maxMargin ${Number(r.maxMargin).toFixed(4)}  placed ${r.ordersPlaced}  filled ${r.ordersFilled}`);
out += line("");
out += line("indication      n     PF     WR      net");
for (const i of r.byIndication || []) {
  const net = (i.profit || 0) - (i.loss || 0);
  const flag = i.pf >= 1.05 ? "ok" : i.pf < 0.95 ? "LOSE" : "flat";
  out += line(`  ${(i.id || "").padEnd(12)} ${String(i.n).padStart(5)}  ${i.pf.toFixed(2).padStart(5)}  ${((i.wr || 0) * 100).toFixed(1).padStart(5)}%  ${net.toFixed(4).padStart(8)}  ${flag}`);
}
out += line("");
out += line("playbook        n     PF");
for (const p of r.byPlaybook || []) out += line(`  ${(p.id || "").padEnd(12)} ${String(p.n).padStart(5)}  ${p.pf.toFixed(2)}`);
out += line("kind            n     PF");
for (const k of r.byKind || []) out += line(`  ${(k.id || "").padEnd(12)} ${String(k.n).padStart(5)}  ${k.pf.toFixed(2)}`);
out += line("");
out += line("Block windows N=1..6 (independent lastPf)");
for (const n of [1, 2, 3, 4, 5, 6]) {
  const w = engine.blockWindows?.[n];
  out += line(`  N=${n}  closed=${w?.closed ?? 0}  windows=${w?.windows ?? 0}  lastPf=${Number(w?.lastPf || 0).toFixed(3)}  lastNet=${Number(w?.lastNet || 0).toFixed(4)}  pause=${w?.pauseLeft ?? 0}  lossWin=${w?.lossWindows ?? 0}`);
}
out += line("");
out += line("hour  eq     realNet  mtm    hPF   cumPF  wr    mdd    ddt   pos  ord  q    margin  m%     block  nTr  brkPF  trdPF  blkPF");
for (const h of r.hourly || []) {
  const br = h.inds?.break?.pf;
  const tr = h.inds?.trend?.pf;
  const bl = h.plays?.block?.pf;
  out += line(
    `${String(h.h).padStart(2)}  ${Number(h.eq).toFixed(3).padStart(6)} ${Number(h.net).toFixed(3).padStart(7)} ${Number(h.mtm || 0).toFixed(3).padStart(7)}  ${Number(h.hourPf || 0).toFixed(2).padStart(5)}  ${Number(h.pf).toFixed(2).padStart(5)}  ${(h.wr * 100).toFixed(0).padStart(3)}%  ${(h.mdd * 100).toFixed(2).padStart(5)}% ${String(h.ddt).padStart(5)} ${String(h.pos).padStart(4)} ${String(h.orders).padStart(4)} ${String(h.queued).padStart(4)} ${Number(h.margin).toFixed(4).padStart(7)} ${(h.marginPct * 100).toFixed(1).padStart(5)}% ${String(h.blockOrd).padStart(5)} ${String(h.trades).padStart(4)}  ${br != null ? br.toFixed(2) : "  - "}  ${tr != null ? tr.toFixed(2) : "  - "}  ${bl != null ? bl.toFixed(2) : "  - "}`,
  );
}
const loseH = (r.hourly || []).filter((h) => h.net < -1e-9);
out += line("");
out += line(`realized-positive hours ${(r.hourly || []).length - loseH.length}/${(r.hourly || []).length}${loseH.length ? "  losers " + loseH.map((h) => h.h).join(",") : ""}`);
writeFileSync("public/sim-24h-40-break-block.txt", out);
console.log("wrote public/sim-24h-40-break-block.txt");
