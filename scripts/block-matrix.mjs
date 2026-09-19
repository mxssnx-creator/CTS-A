#!/usr/bin/env node
/**
 * Block counts 1-8 additive × pause 0/1/2 × keep on/off × vol 0.4/0.8
 */
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, BLOCK_POS_COUNTS, additiveBlockQty, blockStepQty, blockMinimumProfitFactor } from "../src/lib/desk/engine.ts";
import { simulateHours, overallLiveStats } from "../src/lib/desk/vst.ts";

const CFG = { ...DEFAULT_TACTIC_CONFIG };
const COUNTS = [...BLOCK_POS_COUNTS];

function row(label, r, engine, extra = {}) {
  const ov = engine ? overallLiveStats(engine) : null;
  const blk = ov?.block;
  return {
    label,
    pf: Number((r.pf || 0).toFixed(3)),
    wr: Number(((r.wr || 0) * 100).toFixed(1)),
    n: r.trades,
    net: Number((r.net || 0).toFixed(3)),
    sl: r.slExits,
    tp: r.tpExits,
    vol: Number((blk?.volume || 0).toFixed(3)),
    blockN: blk?.n || 0,
    blockPf: Number((blk?.pf || 0).toFixed(3)),
    relF: Number((engine?.relVolumeFactor || 0).toFixed(3)),
    ...extra,
  };
}

console.log("=== additive qty (base 1.2) ===");
for (const vr of [0.4, 0.8]) {
  for (const n of COUNTS) {
    const step = blockStepQty(1.2, n, vr, 8, 8, 0, "additive");
    const q = additiveBlockQty(1.2, [n], vr, 0, 0);
    const all = additiveBlockQty(1.2, COUNTS, vr, 3, vr);
    const pfFloor = blockMinimumProfitFactor(1.6, 1.45, n * vr);
    console.log(
      `vr ${vr} N=${n}  step=${step.toFixed(3)} (expect ${(1.2 * vr).toFixed(3)})  cap=${q.steps[0].cap.toFixed(3)}  PF-floor=${pfFloor.toFixed(3)}  all8+3rel=${all.total.toFixed(3)}`,
    );
  }
}

const results = [];
console.log("\n=== independent N × pause × keep × vr  (8h × 8 symbols) ===");
for (const vr of [0.4, 0.8]) {
  for (const pause of [0, 1, 2]) {
    for (const keep of [false, true]) {
      for (const n of COUNTS) {
        const block = {
          ...DEFAULT_BLOCK_CONFIG,
          counts: [n],
          maxMultiple: n,
          volumeRatio: vr,
          relVolumeRatio: vr,
          pauseCountRatio: pause,
          keepAdjusted: keep,
          volumeMode: "additive",
          evalPosCount: Math.max(6, n),
          evalLastNs: COUNTS.filter((x) => x <= n),
          stack: true,
          windows: true,
          relAdditive: true,
        };
        const { report, engine } = simulateHours(8, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block });
        const rec = row(`N${n} p${pause} keep=${keep ? "Y" : "N"} vr${vr}`, report, engine, { nCount: n, pause, keep, vr });
        results.push(rec);
        const flag = rec.pf < 1.4 || rec.net < 0 ? "FAIL" : rec.pf < 2 ? "weak" : "ok";
        console.log(
          `${flag.padEnd(4)} N=${n} pause=${pause} keep=${keep ? "Y" : "N"} vr=${vr}  PF=${rec.pf.toFixed(2).padStart(5)} WR=${String(rec.wr).padStart(5)}% n=${String(rec.n).padStart(3)} net=${rec.net.toFixed(2).padStart(6)} vol=${rec.vol.toFixed(1).padStart(6)} blkPF=${rec.blockPf.toFixed(2)} relF=${rec.relF}`,
        );
      }
      const block = {
        ...DEFAULT_BLOCK_CONFIG,
        counts: COUNTS,
        maxMultiple: 8,
        volumeRatio: vr,
        relVolumeRatio: vr,
        pauseCountRatio: pause,
        keepAdjusted: keep,
        volumeMode: "additive",
        evalPosCount: 8,
        evalLastNs: COUNTS,
        stack: true,
        windows: true,
        relAdditive: true,
      };
      const { report, engine } = simulateHours(8, CFG, "hybrid", { symbolCount: 8, rangeType: "fibonacci", block });
      const rec = row(`ALL p${pause} keep=${keep ? "Y" : "N"} vr${vr}`, report, engine, { nCount: "1-8", pause, keep, vr });
      results.push(rec);
      const flag = rec.pf < 1.4 || rec.net < 0 ? "FAIL" : rec.pf < 2 ? "weak" : "ok";
      console.log(
        `${flag.padEnd(4)} ALL pause=${pause} keep=${keep ? "Y" : "N"} vr=${vr}  PF=${rec.pf.toFixed(2).padStart(5)} WR=${String(rec.wr).padStart(5)}% n=${String(rec.n).padStart(3)} net=${rec.net.toFixed(2).padStart(6)} vol=${rec.vol.toFixed(1).padStart(6)} blkPF=${rec.blockPf.toFixed(2)} relF=${rec.relF}`,
      );
    }
  }
}

console.log("\n=== BEST / WORST ===");
const ranked = results.slice().sort((a, b) => b.pf - a.pf || b.net - a.net);
console.log("best", ranked.slice(0, 8).map((r) => `${r.label} PF ${r.pf} net ${r.net} vol ${r.vol}`).join(" | "));
console.log("worst", ranked.slice(-8).map((r) => `${r.label} PF ${r.pf} net ${r.net} vol ${r.vol}`).join(" | "));
const byKeep = [true, false].map((k) => {
  const rows = results.filter((r) => r.keep === k);
  const avg = rows.reduce((s, r) => s + r.pf, 0) / rows.length;
  const vol = rows.reduce((s, r) => s + r.vol, 0) / rows.length;
  return { keep: k, avgPf: avg.toFixed(2), avgVol: vol.toFixed(1), n: rows.length };
});
console.log("keep avg", byKeep);
const byPause = [0, 1, 2].map((p) => {
  const rows = results.filter((r) => r.pause === p);
  const avg = rows.reduce((s, r) => s + r.pf, 0) / rows.length;
  return { pause: p, avgPf: avg.toFixed(2), n: rows.length };
});
console.log("pause avg", byPause);
const byVr = [0.4, 0.8].map((v) => {
  const rows = results.filter((r) => r.vr === v);
  const avg = rows.reduce((s, r) => s + r.pf, 0) / rows.length;
  const vol = rows.reduce((s, r) => s + r.vol, 0) / rows.length;
  return { vr: v, avgPf: avg.toFixed(2), avgVol: vol.toFixed(1) };
});
console.log("vr avg", byVr);
const byN = COUNTS.map((n) => {
  const rows = results.filter((r) => r.nCount === n);
  const avg = rows.reduce((s, r) => s + r.pf, 0) / Math.max(1, rows.length);
  const vol = rows.reduce((s, r) => s + r.vol, 0) / Math.max(1, rows.length);
  return { N: n, avgPf: avg.toFixed(2), avgVol: vol.toFixed(1) };
});
console.log("N avg", byN);
console.log("rows", results.length);
