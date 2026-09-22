#!/usr/bin/env node
/** 20h pre-eval + 24h × 30 complete · $10 start · hour-by-hour */
import { writeFileSync, mkdirSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  EVAL_POS_N,
  VALID_EXEC_POS_N,
  LIVE_DISABLE_N,
  SHORT_EVAL_HOURS,
  SHORT_WINNER,
  LIVE_BLOCK_COUNTS,
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
  axisPartialRatio: 3,
};

const block = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  liveLastN: LIVE_DISABLE_N,
  validExecN: VALID_EXEC_POS_N,
  liveExecN: VALID_EXEC_POS_N,
  liveDisable: true,
  autoEval: true,
  windows: true,
  counts: [...LIVE_BLOCK_COUNTS],
  maxMultiple: 6,
  minActiveLevel: 1,
  volumeMode: "parallel",
  overallMode: "shared",
  sharedVolumeRatio: 1.5,
  volumeRatio: 0.2,
  overallVolumeRatio: 1.5,
  maxVolumeMultiplier: 2.5,
};

const t0 = Date.now();
const { report: r, engine } = simulateHours(24, CFG, "hybrid", {
  symbolCount: 30,
  rangeType: "atr",
  block,
  equity: 10,
  costStep: 3,
  complete: true,
  comboOnly: false,
  prehours: SHORT_EVAL_HOURS,
  orderType: "limit",
  shortPf: 0.95,
  shortBasePf: 0.7,
  blockPf: 1.15,
  minPf: 0.95,
  basePf: 0.7,
});
const ms = Date.now() - t0;
const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
const pct = (n, d = 2) => `${(Number(n || 0) * 100).toFixed(d)}%`;
const cls = (n, good = 0) => (Number(n) > good ? "ok" : Number(n) < good ? "bad" : "");
const line = (s) => {
  console.log(s);
  return s + "\n";
};

const hours = r.hourly || [];
const green = hours.filter((h) => Number(h.gatedNet ?? h.net) > 1e-9).length;
const paperGreen = hours.filter((h) => Number(h.net) > 1e-9).length;
const startEq = r.startEquity || 10;
const livePf = Number(r.liveGated?.pf || r.pf || 0);
const liveN = Number(r.liveGated?.n ?? r.trades ?? 0);

let txt = "";
txt += line(`COMPLETE 24h×30 +${r.prehours}h pre · ${(ms / 1000).toFixed(1)}s · last-N eval${EVAL_POS_N}/valid${VALID_EXEC_POS_N}/disable${LIVE_DISABLE_N}`);
txt += line(`seed ${SHORT_WINNER.tpAtr}/${SHORT_WINNER.slOfTp} trail 1.5 · Block ${LIVE_BLOCK_COUNTS.join(",")} shared 1.5 add 0.2 · $10 step 3`);
txt += line(`LIVE gated PF ${fmt(livePf, 3)} n=${liveN}  paper PF ${fmt(r.paperPf, 3)}  WR ${pct(r.wr, 1)}  n=${r.trades}  net ${fmt(r.realizedNet ?? r.net, 5)}  eq ${fmt(r.equity, 4)}`);
txt += line(`PRE   PF ${fmt(r.pre?.pf, 3)}  WR ${pct(r.pre?.wr, 1)}  n=${r.pre?.trades ?? 0}  eq ${fmt(r.pre?.equity, 4)}`);
txt += line(`MDD ${pct(r.mdd)}  DDT ${r.ddt}  avgPos ${fmt(r.avgPositions)}  avgOrd ${fmt(r.avgOrders, 1)}  avgBlock ${fmt(r.avgBlockOrd, 1)}  maxMargin ${fmt(r.maxMargin, 4)}  eqUse ${pct((r.maxMargin || 0) / Math.max(r.equity, startEq))}`);
txt += line(`orders placed ${r.ordersPlaced}  filled ${r.ordersFilled}  SL ${r.slExits}  TP ${r.tpExits}  open pos ${r.openPositions}  open ord ${r.openOrders}`);
txt += line(`valid share ${fmt((engine.validRelShare || 0) * 100, 1)}%  valid keys ${Object.keys(engine.validRelKeys || {}).length}  ${Object.keys(engine.validRelKeys || {}).slice(0, 8).join(",") || "—"}`);
txt += line(`floors short ${fmt(r.floors?.short)} base ${fmt(r.floors?.base)} block ${fmt(r.floors?.block)} overall ${fmt(r.floors?.overall)}`);
txt += line("");

const buckets = [
  ["playbook", r.byPlaybook],
  ["kind", r.byKind],
  ["tactic", r.byTactic],
  ["indication", r.byIndication],
];
for (const [name, rows] of buckets) {
  txt += line(`${name.padEnd(12)} n      PF     WR      net`);
  for (const row of rows || []) {
    const net = (row.profit || 0) - (row.loss || 0);
    txt += line(`  ${String(row.id).padEnd(12)} ${String(row.n).padStart(5)}  ${fmt(row.pf).padStart(5)}  ${pct(row.wr, 0).padStart(4)}  ${fmt(net, 5).padStart(9)}`);
  }
  txt += line("");
}

txt += line("hour  eq      gNet    gPF   pNet    pPF   MDD    eqUse  avgPos avgOrd  blk   n   gN  SL  TP");
for (const h of hours) {
  txt += line(
    `${String(h.h).padStart(2)}  ${fmt(h.eq, 3).padStart(7)} ${fmt(h.gatedNet ?? 0, 5).padStart(8)} ${fmt(h.gatedPf ?? h.hourPf, 3).padStart(5)} ${fmt(h.net, 5).padStart(8)} ${fmt(h.hourPf).padStart(5)}  ${pct(h.mdd).padStart(6)} ${pct(h.eqUsePct ?? h.marginPct).padStart(6)} ${fmt(h.avgPos ?? h.pos, 1).padStart(6)} ${fmt(h.avgOrd ?? h.orders, 1).padStart(6)} ${String(h.blockOrd).padStart(4)} ${String(h.trades).padStart(4)} ${String(h.gatedN ?? 0).padStart(4)} ${String(h.hourSl ?? 0).padStart(3)} ${String(h.hourTp ?? 0).padStart(3)}`,
  );
}

const lose = hours.filter((h) => Number(h.gatedNet ?? h.net) < -1e-9);
txt += line("");
txt += line(`gated+ hours ${hours.length - lose.length}/${hours.length}${lose.length ? "  scratch " + lose.map((h) => h.h).join(",") : ""}`);
txt += line(`Block windows ${[1, 3, 4, 5, 6].map((n) => `N${n}=${fmt(engine.blockWindows?.[n]?.lastPf || 0)}`).join("  ")}`);
txt += line(`ok livePf>=1.05 ${livePf >= 1.05}  ordersFilled>=200 ${Number(r.ordersFilled) >= 200}  gatedGreen ${green}/${hours.length}`);

mkdirSync("public", { recursive: true });
mkdirSync("artifacts", { recursive: true });
writeFileSync("public/sim-24h-10usd.txt", txt);
writeFileSync(
  "public/sim-24h-10usd.json",
  JSON.stringify(
    {
      ms,
      pf: r.pf,
      paperPf: r.paperPf,
      liveGated: r.liveGated,
      wr: r.wr,
      trades: r.trades,
      equity: r.equity,
      startEquity: startEq,
      mdd: r.mdd,
      ddt: r.ddt,
      avgPositions: r.avgPositions,
      avgOrders: r.avgOrders,
      avgBlockOrd: r.avgBlockOrd,
      maxMargin: r.maxMargin,
      realizedNet: r.realizedNet,
      ordersPlaced: r.ordersPlaced,
      ordersFilled: r.ordersFilled,
      slExits: r.slExits,
      tpExits: r.tpExits,
      greenHours: green,
      paperGreen,
      selected: r.selected,
      floors: r.floors,
      byPlaybook: r.byPlaybook,
      byTactic: r.byTactic,
      byKind: r.byKind,
      byIndication: r.byIndication,
      hourly: hours,
      pre: r.pre,
    },
    null,
    2,
  ),
);
console.log("wrote public/sim-24h-10usd.txt json");
