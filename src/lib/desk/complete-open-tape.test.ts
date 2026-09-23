import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, busyHourProtectCells, BUSY_HOUR_INDICATIONS } from "./engine.ts";
import { engageLiveBook, expandPayRanges, indicationCalcLegs, initVstEngine, LIVE_RUN_CFG, liveRunBlock, simulateHours, tickVst } from "./vst.ts";

const CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  shortRange: true as const,
  tpAtr: 0.42,
  slOfTp: 1.7,
  slAtr: 0.714,
  tpRatio: 1 / 1.7,
  trailingPct: 1.5,
  maxHoldTicks: 8,
};

const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  counts: [1, 2, 3, 4, 5, 6],
  volumeRatio: 0.4,
  relVolumeRatio: 0.4,
  sharedVolumeRatio: 3,
  overallVolumeRatio: 3,
  maxVolumeMultiplier: 8,
  minActiveLevel: 1,
  pauseCountRatio: 0,
  windows: true,
  stack: true,
  volumeMode: "parallel" as const,
  overallMode: "parallel" as const,
};

describe("complete 24h open tape", () => {
  it("busy-hour configs are the cells that paid", () => {
    const cells = busyHourProtectCells();
    assert.equal(cells.length, 1);
    assert.ok(Math.abs(cells[0]!.tpAtr - 0.42) < 1e-9);
    assert.ok(cells[0]!.slOfTp >= 1.5);
    assert.ok(BUSY_HOUR_INDICATIONS.includes("break"));
    assert.ok(BUSY_HOUR_INDICATIONS.includes("ema"));
    const ranges = expandPayRanges("break", "atr");
    assert.deepEqual(ranges, ["atr", "linear"]);
    assert.ok(expandPayRanges("ema", "fibonacci").includes("linear"));
    assert.ok(expandPayRanges("ema", "fibonacci").includes("geometric"));
    assert.deepEqual(expandPayRanges("move", "atr"), ["atr"]);
    const legs = indicationCalcLegs({ id: "break", primary: "atr", dd: 0.02, pxStretch: 0.4, pays: true, busy: true });
    assert.ok(legs.some((l) => l.kind === "base"));
    assert.equal(legs.filter((l) => l.kind === "dd").length, 0);
    assert.ok(legs.some((l) => l.kind === "px" && l.range === "linear"));
    const quiet = indicationCalcLegs({ id: "break", primary: "atr", dd: 0, pxStretch: 0.1, pays: false, busy: true });
    assert.equal(quiet.length, 1);
    assert.equal(quiet[0]?.kind, "base");
    const bands = { low: "geometric" as const, mid: "atr" as const, high: "volume" as const };
    const ddLegs = indicationCalcLegs({ id: "direction", primary: "linear", dd: 0.02, pxStretch: 0.1, pays: true, busy: true, ddActivity: 0.4, relAlign: 0.3, bands });
    assert.equal(ddLegs.filter((l) => l.range === "volume" || l.range === "geometric").length, 0);
    assert.ok(ddLegs.every((l) => l.range === "linear" || l.range === "atr"));
    const quietDir = indicationCalcLegs({ id: "direction", primary: "linear", dd: 0, pxStretch: 0.05, pays: true, busy: false, ddActivity: 0, relAlign: 0, bands });
    assert.equal(quietDir.length, 1);
    assert.equal(quietDir[0]?.kind, "base");
    const lowLegs = indicationCalcLegs({ id: "ema", primary: "linear", dd: 0, pxStretch: 0.1, pays: true, busy: false, ddActivity: 0, relAlign: 0.4, bands });
    assert.ok(lowLegs.some((l) => l.kind === "rng" && l.range === "geometric"));
    const highLegs = indicationCalcLegs({ id: "ema", primary: "linear", dd: 0, pxStretch: 0.1, pays: true, busy: false, ddActivity: 0, relAlign: -0.4, bands });
    assert.equal(highLegs.filter((l) => l.range === "volume").length, 0);
    assert.ok(ddLegs.length <= 4 && lowLegs.length <= 4 && highLegs.length <= 4);
  });

  it("does not intern-all-starve live and keeps orders on the first hours", () => {
    const { report: r } = simulateHours(3, CFG, "trailing", {
      symbolCount: 12,
      rangeType: "atr",
      equity: 10,
      costStep: 3,
      complete: true,
      prehours: 0,
      block: BLOCK,
    });
    assert.equal(r.prehours ?? 0, 0);
    assert.ok(r.trades >= 40, `trades ${r.trades}`);
    assert.ok((r.liveGated?.n ?? 0) >= 20 || r.trades >= 40, `gated ${r.liveGated?.n}`);
    assert.ok((r.hourly || []).length >= 3);
    const h1 = r.hourly[0];
    assert.ok(Number(h1?.trades || h1?.gatedN || 0) > 0, "hour 1 has fills");
    assert.ok((r.byIndication?.length ?? 0) >= 3, "indications process");
    const hours = r.hourly || [];
    assert.ok(hours.length >= 3);
    const busy = hours.filter((h) => Number(h.trades || h.gatedN || 0) > 0);
    assert.ok(busy.length >= 2, `active hours ${busy.length}`);
    const h1n = Number(hours[0]?.trades || hours[0]?.gatedN || 0);
    assert.ok(h1n >= 8, `hour 1 n=${h1n}`);
  });

  it("keeps every hour green with hundreds of orders on 6h×24", () => {
    const { report: r } = simulateHours(6, CFG, "trailing", {
      symbolCount: 24,
      rangeType: "atr",
      equity: 10,
      costStep: 3,
      complete: true,
      prehours: 0,
      block: BLOCK,
    });
    const hours = r.hourly || [];
    assert.equal(hours.length, 6);
    const red = hours.filter((h) => Number(h.net ?? h.gatedNet ?? 0) < -1e-9);
    assert.equal(red.length, 0, `red hours ${red.map((h) => `${h.h}:${Number(h.net).toFixed(4)}`).join(",")}`);
    const thin = hours.filter((h) => Number(h.trades || h.gatedN || 0) < 80);
    assert.equal(thin.length, 0, `thin hours ${thin.map((h) => `${h.h} n=${h.trades || h.gatedN}`).join(",")}`);
    assert.ok(Number(r.equity) + 1e-9 >= 10, `eq ${r.equity}`);
    assert.ok(r.trades >= 500, `trades ${r.trades}`);
  });

  it("live start ticks stay positive with a thick book", () => {
    const block = liveRunBlock(BLOCK);
    const e = initVstEngine(LIVE_RUN_CFG, {
      warmup: 0,
      symbolCount: 12,
      equity: 10,
      costStep: 3,
      complete: true,
      block,
      orderType: "limit",
      arm: false,
    });
    engageLiveBook(e);
    e.running = true;
    e.phase = "running";
    for (let i = 0; i < 60; i++) tickVst(e, LIVE_RUN_CFG, "trailing", { rangeType: "atr", symbolCount: 12, orderType: "limit", block });
    const pf = e.stats.pf;
    assert.ok(e.ledger.trades >= 200, `live trades ${e.ledger.trades}`);
    assert.ok(e.ledger.ordersPlaced >= 400, `placed ${e.ledger.ordersPlaced}`);
    assert.ok(pf + 1e-9 >= 1, `live pf ${pf}`);
    assert.ok(e.stats.equity + 1e-9 >= 10, `eq ${e.stats.equity}`);
  });
});
