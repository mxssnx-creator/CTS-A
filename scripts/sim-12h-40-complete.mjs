#!/usr/bin/env node
/** 20h pre-eval + 12h × 40 complete · last-N 30 eval / 15 valid-execute / 12 disable */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  EVAL_POS_N,
  VALID_EXEC_POS_N,
  LIVE_DISABLE_N,
  SHORT_EVAL_HOURS,
} from "../src/lib/desk/engine.ts";
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
  liveLastN: LIVE_DISABLE_N,
  validExecN: VALID_EXEC_POS_N,
  liveExecN: VALID_EXEC_POS_N,
  liveDisable: true,
  autoEval: true,
  windows: true,
  counts: [1, 2, 3, 4, 5, 6],
  maxMultiple: 6,
  minActiveLevel: 1,
};

const t0 = Date.now();
const { report: r, engine } = simulateHours(12, CFG, "trailing", {
  symbolCount: 40,
  rangeType: "atr",
  block,
  equity: 10,
  costStep: 3,
  complete: true,
  prehours: SHORT_EVAL_HOURS,
  orderType: "limit",
});
const ms = Date.now() - t0;
const line = (s) => {
  console.log(s);
  return s + "\n";
};
const fmt = (n, d = 2) => Number(n || 0).toFixed(d);
let out = "";
out += line(`20h pre + 12h × 40 complete · eval N=${EVAL_POS_N} valid N=${VALID_EXEC_POS_N} disable N=${LIVE_DISABLE_N} · ${ms}ms`);
out += line(`LIVE 12h  PF ${r.pf.toFixed(3)}  WR ${(r.wr * 100).toFixed(1)}%  n=${r.trades}  realized=${fmt(r.realizedNet, 4)}  eq ${fmt(r.equity, 4)}`);
out += line(`PRE  ${r.prehours}h  PF ${fmt(r.pre?.pf, 3)}  WR ${(Number(r.pre?.wr || 0) * 100).toFixed(1)}%  n=${r.pre?.trades ?? 0}  realized=${fmt(r.pre?.realized, 4)}  eq ${fmt(r.pre?.equity, 4)}`);
out += line(`MDD ${(r.mdd * 100).toFixed(2)}%  DDT ${r.ddt}  avgPos ${fmt(r.avgPositions)}  avgOrd ${fmt(r.avgOrders, 1)}  avgBlock ${fmt(r.avgBlockOrd, 1)}  maxMargin ${fmt(r.maxMargin, 4)}`);
out += line(`lastN eval30 pf=${r.lastN.eval.pf.toFixed(2)} n=${r.lastN.eval.n} avg=${r.lastN.eval.avg.toFixed(4)}  valid15 pf=${(r.lastN.valid ?? r.lastN.exec).pf.toFixed(2)} n=${(r.lastN.valid ?? r.lastN.exec).n}  disable12 pf=${r.lastN.disable.pf.toFixed(2)} avg=${r.lastN.disable.avg.toFixed(4)}`);
out += line(`valid-gated (last-15 PF + last-12 avg≥0)  n=${r.liveGated?.n ?? 0}/${r.liveGated?.of ?? r.trades}  PF ${fmt(r.liveGated?.pf)}  avg ${fmt(r.liveGated?.avg, 4)}`);
out += line(`disabled ${(r.disabled || []).length}: ${(r.disabled || []).slice(0, 16).join(", ") || "none"}`);
out += line("");
out += line("indication      n     PF     WR      net   eval30   valid15  dis12");
const byIndN = r.lastN.byIndication || {};
for (const i of r.byIndication || []) {
  const net = (i.profit || 0) - (i.loss || 0);
  const ln = byIndN[i.id] || {};
  out += line(
    `  ${String(i.id || "").padEnd(12)} ${String(i.n).padStart(5)}  ${i.pf.toFixed(2).padStart(5)}  ${((i.wr || 0) * 100).toFixed(1).padStart(5)}%  ${net.toFixed(4).padStart(8)}  ${fmt(ln.eval?.pf)}  ${fmt((ln.valid ?? ln.exec)?.pf)}  ${fmt(ln.disable?.avg, 4)}`,
  );
}
out += line("playbook        n     PF");
for (const p of r.byPlaybook || []) out += line(`  ${String(p.id || "").padEnd(12)} ${String(p.n).padStart(5)}  ${p.pf.toFixed(2)}`);
out += line("kind            n     PF");
for (const k of r.byKind || []) out += line(`  ${String(k.id || "").padEnd(12)} ${String(k.n).padStart(5)}  ${k.pf.toFixed(2)}`);
out += line("tactic          n     PF");
for (const t of r.byTactic || []) out += line(`  ${String(t.id || "").padEnd(12)} ${String(t.n).padStart(5)}  ${t.pf.toFixed(2)}`);
out += line("");
out += line("hour  eq     realNet  mtm    hPF   cumPF  wr    mdd    pos  margin  block  nTr  brk   trd   blk");
for (const h of r.hourly || []) {
  const br = h.inds?.break?.pf;
  const tr = h.inds?.trend?.pf;
  const bl = h.plays?.block?.pf;
  out += line(
    `${String(h.h).padStart(2)}  ${Number(h.eq).toFixed(3).padStart(6)} ${Number(h.net).toFixed(3).padStart(7)} ${Number(h.mtm || 0).toFixed(3).padStart(7)}  ${Number(h.hourPf || 0).toFixed(2).padStart(5)}  ${Number(h.pf).toFixed(2).padStart(5)}  ${(h.wr * 100).toFixed(0).padStart(3)}%  ${(h.mdd * 100).toFixed(2).padStart(5)}% ${String(h.pos).padStart(4)} ${Number(h.margin).toFixed(4).padStart(7)} ${String(h.blockOrd).padStart(5)} ${String(h.trades).padStart(4)}  ${br != null ? Number(br).toFixed(2) : "  - "}  ${tr != null ? Number(tr).toFixed(2) : "  - "}  ${bl != null ? Number(bl).toFixed(2) : "  - "}`,
  );
}
const lose = (r.hourly || []).filter((h) => h.net < -1e-9);
out += line("");
out += line(`realized+ hours ${(r.hourly || []).length - lose.length}/${(r.hourly || []).length}${lose.length ? "  scratch " + lose.map((h) => h.h).join(",") : ""}`);
out += line(`Block windows ${[1, 2, 3, 4, 5, 6].map((n) => `N${n}=${Number(engine.blockWindows?.[n]?.lastPf || 0).toFixed(2)}`).join("  ")}`);
writeFileSync("public/sim-12h-40-complete.txt", out);
console.log("wrote public/sim-12h-40-complete.txt");
