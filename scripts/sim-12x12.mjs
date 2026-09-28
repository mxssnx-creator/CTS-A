import { writeFileSync } from "node:fs";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, LIVE_BLOCK_COUNTS } from "../src/lib/desk/engine.ts";
import { bookPfStats, simulateHours } from "../src/lib/desk/vst.ts";

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true,
  tpAtr: 0.48,
  slOfTp: 0.75,
  slAtr: 0.36,
  tpRatio: 1 / 0.75,
  trailingPct: 1.5,
  maxHoldTicks: 8,
  maxHoldBars: 3,
  axisLevels: 5,
  axisSpacing: 0.7,
};

const block = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  volumeMode: "parallel",
  overallMode: "parallel",
  overall: true,
  overallSymbol: true,
  overallDirection: true,
  overallIndication: true,
  overallType: true,
  sets: true,
  windows: true,
  stack: true,
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  sharedVolumeRatio: 1.5,
  overallVolumeRatio: 1.5,
  maxVolumeMultiplier: 8,
  counts: [...LIVE_BLOCK_COUNTS],
  maxMultiple: 6,
  minMultiple: 1,
  sides: "both",
};

const lines = [];
const say = (s) => {
  console.log(s);
  lines.push(s);
};
const t0 = Date.now();
say("12h × 12 symbols · complete open tape · hybrid/geometric · overall on · start $10");
const { report: r, engine } = simulateHours(12, CFG, "hybrid", {
  symbolCount: 12,
  rangeType: "geometric",
  block,
  equity: 10,
  costStep: 3,
  complete: true,
  prehours: 0,
  orderType: "limit",
  strategyToggles: { normal: true, trailing: false, axis: true, block: true, dca: false },
  onHour: (row) => {
    const inds = Object.entries(row.inds || {})
      .filter(([, v]) => v.n > 0)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([id, v]) => `${id} ${v.n}/${v.pf.toFixed(2)}`)
      .join(" ");
    const plays = Object.entries(row.plays || {})
      .filter(([, v]) => v.n > 0)
      .map(([id, v]) => `${id} ${v.n}/${v.pf.toFixed(2)}`)
      .join(" ");
    say(
      `h${String(row.h).padStart(2)} eq ${row.eq.toFixed(3)} net ${row.net.toFixed(4)} cum ${row.netCum.toFixed(4)} hPF ${row.hourPf.toFixed(3)} n ${row.trades} pos ${row.pos} ord ${row.orders} SL ${row.hourSl} TP ${row.hourTp} | ${inds} || ${plays}`,
    );
  },
});
const ms = Date.now() - t0;
say("");
say(`done ${(ms / 1000).toFixed(1)}s  PF ${r.pf.toFixed(3)} WR ${((r.wr || 0) * 100).toFixed(1)}% n=${r.trades} net ${Number(r.net).toFixed(4)} eq ${Number(r.equity).toFixed(4)} MDD ${((r.mdd || 0) * 100).toFixed(2)}%`);
say(`placed ${r.ordersPlaced} filled ${r.ordersFilled} avgPos ${Number(r.avgPositions).toFixed(1)} avgOrd ${Number(r.avgOrders).toFixed(1)}`);
say("");
say("indication      n     PF     WR       net");
for (const i of r.byIndication || []) {
  const net = (i.profit || 0) - (i.loss || 0);
  say(`  ${String(i.id).padEnd(12)} ${String(i.n).padStart(5)}  ${Number(i.pf).toFixed(3).padStart(6)}  ${((i.wr || 0) * 100).toFixed(1).padStart(5)}%  ${net.toFixed(4).padStart(9)}`);
}
say("");
say("tactic          n     PF     WR       net");
for (const i of r.byTactic || []) {
  const net = (i.profit || 0) - (i.loss || 0);
  say(`  ${String(i.id).padEnd(12)} ${String(i.n).padStart(5)}  ${Number(i.pf).toFixed(3).padStart(6)}  ${((i.wr || 0) * 100).toFixed(1).padStart(5)}%  ${net.toFixed(4).padStart(9)}`);
}
say("");
say("playbook        n     PF       net");
for (const i of r.byPlaybook || []) {
  const net = (i.profit || 0) - (i.loss || 0);
  say(`  ${String(i.id).padEnd(12)} ${String(i.n).padStart(5)}  ${Number(i.pf).toFixed(3).padStart(6)}  ${net.toFixed(4).padStart(9)}`);
}
const book = bookPfStats(engine);
say("");
say(`book normal n=${book.normal.n} PF ${book.normal.pf.toFixed(3)} net ${book.normal.net.toFixed(4)}`);
say(`book axis   n=${book.axis.n} PF ${book.axis.pf.toFixed(3)} net ${book.axis.net.toFixed(4)}`);
say(`book block  n=${book.block.n} PF ${book.block.pf.toFixed(3)} net ${book.block.net.toFixed(4)} adds ${book.adds} fills ${book.fills}`);
const notes = (engine.closed || []).reduce((m, c) => {
  const n = String(c.note || c.playbook || "");
  const k = /Overall Block/.test(n) ? "overall" : /Block/.test(n) ? "block" : c.playbook || "other";
  const row = m[k] || { n: 0, gp: 0, gl: 0 };
  row.n += 1;
  if ((c.pnl || 0) > 0) row.gp += c.pnl;
  else row.gl += Math.abs(c.pnl || 0);
  m[k] = row;
  return m;
}, {});
say("");
say("closed groups");
for (const [k, v] of Object.entries(notes)) {
  const pf = v.gl > 0 ? v.gp / v.gl : v.gp > 0 ? 9 : 0;
  say(`  ${k.padEnd(10)} n=${v.n} PF ${pf.toFixed(3)} net ${(v.gp - v.gl).toFixed(4)}`);
}
writeFileSync("/tmp/sim-12x12.txt", lines.join("\n"));
