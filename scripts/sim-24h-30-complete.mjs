#!/usr/bin/env node
/** Complete computing: 24h pre + 24h live × 30 symbols · hour-by-hour. */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  EVAL_POS_N,
  VALID_EXEC_POS_N,
  LIVE_DISABLE_N,
  SHORT_WINNER,
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
  liveLastN: LIVE_DISABLE_N,
  validExecN: VALID_EXEC_POS_N,
  liveExecN: VALID_EXEC_POS_N,
  liveDisable: true,
  autoEval: true,
  windows: true,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  minActiveLevel: 1,
  volumeMode: "shared",
  overallMode: "shared",
  sharedVolumeRatio: 1.5,
  volumeRatio: 0.2,
  overallVolumeRatio: 1.5,
};

const t0 = Date.now();
const { report: r, engine } = simulateHours(24, CFG, "trailing", {
  symbolCount: 30,
  rangeType: "atr",
  block,
  equity: 1e4,
  costStep: 10,
  complete: true,
  comboOnly: false,
  prehours: 24,
  orderType: "limit",
  shortPf: 0.95,
});
const ms = Date.now() - t0;
const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
const pct = (n, d = 2) => `${(Number(n || 0) * 100).toFixed(d)}%`;
const line = (s) => {
  console.log(s);
  return s + "\n";
};

const hours = r.hourly || [];
const gatedGreen = hours.filter((h) => Number(h.gatedN) > 0 && Number(h.gatedNet) > 1e-9).length;
const gatedRed = hours.filter((h) => Number(h.gatedN) > 0 && Number(h.gatedNet) <= 1e-9).length;
const gatedFlat = hours.filter((h) => !Number(h.gatedN)).length;
const paperGreen = hours.filter((h) => Number(h.net) > 1e-9).length;
const noLiveLoss = hours.filter((h) => Number(h.gatedNet || 0) >= 0).length;

let txt = "";
txt += line(`COMPLETE 24h×30 +${r.prehours}h pre · ${(ms / 1000).toFixed(1)}s · last-N eval${EVAL_POS_N}/valid${VALID_EXEC_POS_N}/disable${LIVE_DISABLE_N}`);
txt += line(`seed ${SHORT_WINNER.tpAtr}/${SHORT_WINNER.slOfTp} (not exclusive lock) hold ${CFG.maxHoldTicks}  trailing/atr  Block shared 1.5/0.2`);
txt += line(`LIVE  PF ${fmt(r.pf, 3)}  paper ${fmt(r.paperPf, 3)}  gated n=${r.liveGated?.n ?? 0} PF ${fmt(r.liveGated?.pf, 3)}  WR ${pct(r.wr, 1)}  n=${r.trades}  net ${fmt(r.net, 4)}  eq ${fmt(r.equity, 2)}`);
txt += line(`PRE   PF ${fmt(r.pre?.pf, 3)}  WR ${pct(r.pre?.wr, 1)}  n=${r.pre?.trades ?? 0}  eq ${fmt(r.pre?.equity, 2)}`);
txt += line(`MDD ${pct(r.mdd)}  DDT ${r.ddt}  avgPos ${fmt(r.avgPositions)}  avgOrd ${fmt(r.avgOrders, 1)}  avgBlock ${fmt(r.avgBlockOrd, 1)}  maxMargin ${fmt(r.maxMargin, 2)}  eqUse ${pct((r.maxMargin || 0) / Math.max(r.equity, 1e4))}`);
txt += line(`orders placed ${r.ordersPlaced}  filled ${r.ordersFilled}  SL ${r.slExits}  TP ${r.tpExits}  open pos ${r.openPositions}  open ord ${r.openOrders}`);
txt += line(`selected n=${r.selected?.n ?? 0} PF ${fmt(r.selected?.pf)}  greenHours ${r.selected?.greenHours ?? 0}/${hours.length}  paperGreen ${paperGreen}  gated +${gatedGreen} -${gatedRed} 0=${gatedFlat}  noLiveLoss ${noLiveLoss}/${hours.length}`);
txt += line(`floors short ${fmt(r.floors?.short)} base ${fmt(r.floors?.base)} block ${fmt(r.floors?.block)} overall ${fmt(r.floors?.overall)}`);
txt += line(`issues ${r.issues?.length ?? 0}${(r.issues || []).length ? " " + r.issues.join("; ") : " none"}  nan ${r.nanCount}  ratioViol ${r.ratioViolations}  capReject ${r.capRejects}  rateSkip ${r.rateSkips}`);
txt += line("");

const buckets = [
  ["playbook", r.byPlaybook],
  ["kind", r.byKind],
  ["tactic", r.byTactic],
  ["indication", r.byIndication],
];
for (const [name, rows] of buckets) {
  txt += line(`${name.padEnd(12)} n      PF     WR      net`);
  for (const row of (rows || []).slice(0, 12)) {
    const net = (row.profit || 0) - (row.loss || 0);
    txt += line(`  ${String(row.id).padEnd(12)} ${String(row.n).padStart(5)}  ${fmt(row.pf).padStart(5)}  ${pct(row.wr, 0).padStart(4)}  ${fmt(net, 2).padStart(8)}`);
  }
}
txt += line("");
txt += line(" h   eq       paperNet  hPF   cumPF  gatedN  gNet    gPF   selPF  WR   MDD    eqUse  pos  ord  blk   n   SL  TP  brk  act  dir  trd");
for (const h of hours) {
  const tag = Number(h.gatedN) > 0 ? (Number(h.gatedNet) > 0 ? "G+" : "G-") : "G0";
  txt += line(
    `${String(h.h).padStart(2)} ${tag} ${fmt(h.eq, 1).padStart(8)} ${fmt(h.net, 2).padStart(9)} ${fmt(h.hourPf).padStart(5)} ${fmt(h.pf).padStart(6)} ${String(h.gatedN ?? 0).padStart(6)} ${fmt(h.gatedNet ?? 0, 3).padStart(7)} ${fmt(h.gatedPf ?? 0).padStart(5)} ${fmt(h.selPf ?? 0).padStart(6)} ${pct(h.hourWr ?? 0, 0).padStart(4)} ${pct(h.mdd).padStart(6)} ${pct(h.eqUsePct ?? 0).padStart(6)} ${fmt(h.avgPos ?? h.pos, 1).padStart(4)} ${fmt(h.avgOrd ?? h.orders, 0).padStart(4)} ${String(h.blockOrd ?? 0).padStart(4)} ${String(h.trades).padStart(4)} ${String(h.hourSl ?? 0).padStart(3)} ${String(h.hourTp ?? 0).padStart(3)}  ${h.inds?.break?.pf != null ? fmt(h.inds.break.pf) : "  - "} ${h.inds?.active?.pf != null ? fmt(h.inds.active.pf) : "  - "} ${h.inds?.direction?.pf != null ? fmt(h.inds.direction.pf) : "  - "} ${h.inds?.trend?.pf != null ? fmt(h.inds.trend.pf) : "  - "}`,
  );
}
txt += line("");
txt += line(`Block windows ${[1, 2, 3, 4, 5, 6].map((n) => `N${n}=${fmt(engine.blockWindows?.[n]?.lastPf || 0)}`).join("  ")}`);
const shortRows = Object.entries(engine.progressEval?.shortCombos || {})
  .map(([k, v]) => ({ k, ...v }))
  .filter((x) => x.n >= 4)
  .sort((a, b) => b.pf - a.pf);
const tapeOf = (bag) =>
  Object.entries(bag || {}).map(([k, rows]) => {
    let gp = 0, gl = 0, net = 0;
    for (const r of rows) {
      const p = Number(r.pnl) || 0;
      net += p;
      if (p > 0) gp += p;
      else if (p < 0) gl += -p;
    }
    const pf = gl < 1e-12 ? (gp > 1e-12 ? 4 : 0) : gp / gl;
    const baseOk = rows.length >= 4 && pf >= 0.7 && net >= 0;
    const liveOk = rows.length >= 20 && pf >= 0.95 && net > 0;
    return { k, n: rows.length, pf, net, baseOk, liveOk };
  }).sort((a, b) => b.pf - a.pf);
const tapeRows = tapeOf(engine.shortComboTape);
const preRows = tapeOf(engine.shortComboPreTape);
const liveTapeRows = tapeOf(engine.shortComboLiveTape);
txt += line(`shortCombos scored ${shortRows.length}  top ${shortRows.slice(0, 8).map((x) => `${x.k} PF${fmt(x.pf)} n=${x.n}${x.ok ? "" : " x"}`).join(" · ") || "—"}`);
txt += line(`intern tape ${tapeRows.length}  baseOk ${tapeRows.filter((x) => x.baseOk).length}  startOk ${tapeRows.filter((x) => x.liveOk).length}`);
txt += line(`  start ${tapeRows.filter((x) => x.liveOk).slice(0, 8).map((x) => `${x.k} PF${fmt(x.pf)} n=${x.n}`).join(" · ") || "—"}`);
txt += line(`  base ${tapeRows.filter((x) => x.baseOk && !x.liveOk).slice(0, 6).map((x) => `${x.k} PF${fmt(x.pf)} n=${x.n}`).join(" · ") || "—"}`);
txt += line(`pre tape ${preRows.length}  startOk ${preRows.filter((x) => x.liveOk).length}  ${preRows.filter((x) => x.liveOk).slice(0, 6).map((x) => `${x.k} PF${fmt(x.pf)} n=${x.n}`).join(" · ") || "—"}`);
txt += line(`live tape ${liveTapeRows.length}  ${liveTapeRows.slice(0, 6).map((x) => `${x.k} PF${fmt(x.pf)} n=${x.n}`).join(" · ") || "—"}`);

writeFileSync("public/sim-24h-30-complete.txt", txt);
writeFileSync(
  "artifacts/sim-24h-30-complete.json",
  JSON.stringify(
    {
      ms,
      pf: r.pf,
      paperPf: r.paperPf,
      gated: r.liveGated,
      selected: r.selected,
      pre: r.pre,
      trades: r.trades,
      equity: r.equity,
      mdd: r.mdd,
      hourly: hours.map((h) => ({
        h: h.h,
        eq: h.eq,
        net: h.net,
        hourPf: h.hourPf,
        gatedN: h.gatedN,
        gatedNet: h.gatedNet,
        gatedPf: h.gatedPf,
        selPf: h.selPf,
        trades: h.trades,
        pos: h.avgPos ?? h.pos,
        ord: h.avgOrd ?? h.orders,
        mdd: h.mdd,
      })),
      issues: r.issues,
    },
    null,
    2,
  ),
);
console.log("wrote public/sim-24h-30-complete.txt artifacts/sim-24h-30-complete.json");
