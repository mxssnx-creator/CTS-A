#!/usr/bin/env node
import {
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_BLOCK_CONFIG,
  LIVE_BLOCK_COUNTS,
  RANGE_TYPES,
  allShortTpSlCombos,
} from "../src/lib/desk/engine.ts";
import { simulateHours, LIVE_TACTICS, overallLiveStats } from "../src/lib/desk/vst.ts";

const HOURS = 24;
const SYMS = 50;
const CFG = { ...DEFAULT_TACTIC_CONFIG, maxHoldTicks: 120, maxHoldBars: 6 };
const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  addOnWin: false,
  counts: [...LIVE_BLOCK_COUNTS],
  maxMultiple: 6,
  minMultiple: 1,
  volumeMode: "parallel",
  overall: true,
  sides: "both",
  endStageOnly: false,
};

function run(label, cfg, tactic, range, block) {
  const t0 = Date.now();
  const { report, engine } = simulateHours(HOURS, cfg, tactic, {
    symbolCount: SYMS,
    rangeType: range,
    block,
  });
  const ov = overallLiveStats(engine);
  const blockN = engine.closed.filter((c) => c.playbook === "block" || (c.blockLevel || 0) >= 1).length;
  const byInd = {};
  for (const c of engine.closed) {
    const k = c.indication || "trend";
    byInd[k] = (byInd[k] || 0) + 1;
  }
  return {
    label,
    tactic,
    range,
    block: Boolean(block?.enabled),
    ms: Date.now() - t0,
    trades: report.trades,
    pf: Number(report.pf.toFixed(3)),
    wr: Number(report.wr.toFixed(3)),
    net: Number(report.net.toFixed(3)),
    sl: report.slExits,
    tp: report.tpExits,
    time: report.timeExits || 0,
    mdd: Number((report.mdd || 0).toFixed(4)),
    blockN,
    blockOrders: ov.block?.orders || 0,
    occ: engine.positions.length,
    byInd,
    issues: (report.issues || []).slice(0, 3),
    nan: report.nanCount,
    ratio: report.ratioViolations,
  };
}

const rows = [];
for (const tactic of LIVE_TACTICS) {
  for (const range of ["atr", "fibonacci"]) {
    rows.push(run(`${tactic}/${range} block`, CFG, tactic, range, BLOCK));
    rows.push(run(`${tactic}/${range} noblock`, CFG, tactic, range, { ...BLOCK, enabled: false }));
  }
}

const shortCfg = { ...CFG, shortRange: true, tpAtr: 0.2, slOfTp: 0.5, slAtr: 0.1, tpRatio: 2, maxHoldTicks: 16, maxHoldBars: 2 };
rows.push(run("short 0.2/0.5 block", shortCfg, "trailing", "atr", BLOCK));
rows.push(run("short 0.2/0.5 noblock", shortCfg, "trailing", "atr", { ...BLOCK, enabled: false }));
rows.push(run("short 0.2/0.5 hybrid block", shortCfg, "hybrid", "atr", BLOCK));
rows.push(run("short 0.3/1 block", { ...shortCfg, tpAtr: 0.3, slOfTp: 1, slAtr: 0.3, tpRatio: 1 }, "trailing", "atr", BLOCK));

const shorts = allShortTpSlCombos().filter((c) => c.tpAtr === 0.2 || c.tpAtr === 0.35);
for (const s of shorts) {
  const cfg = { ...CFG, ...s, shortRange: true, maxHoldTicks: 16, trailingPct: 1.4 };
  rows.push(run(`short tp${s.tpAtr}/sl${s.slOfTp} block`, cfg, "hybrid", "atr", BLOCK));
}

console.log(JSON.stringify({ hours: HOURS, symbols: SYMS, n: rows.length, rows }, null, 2));
const ok = rows.filter((r) => r.trades >= 8 && r.nan === 0 && r.ratio === 0);
const pos = ok.filter((r) => r.pf >= 1 && r.net > 0);
console.error(`\n${rows.length} runs · ${ok.length} clean · ${pos.length} PF>=1`);
for (const r of rows.sort((a, b) => b.pf - a.pf).slice(0, 12)) {
  console.error(`${r.pf.toFixed(2).padStart(6)} n=${String(r.trades).padStart(4)} sl/tp ${r.sl}/${r.tp} blk ${r.blockN}  ${r.label}`);
}
