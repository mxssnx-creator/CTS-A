import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TACTIC_CONFIG, REPLAY_RANGES, getReplayTape, WARMUP } from "./engine.ts";
import { completeComputations, LIVE_TACTICS, simulateHours } from "./vst.ts";
import { RANGE_TYPES } from "./engine.ts";
import { completeHoursFor, replayHoursFor, runReplaySimulation } from "./replay-run.ts";

describe("replay simulation", () => {
  it("maps replay ranges onto bounded sim hours", () => {
    assert.equal(replayHoursFor("1d"), 24);
    assert.equal(replayHoursFor("2d"), 48);
    assert.ok(replayHoursFor("12d") <= 168);
    assert.deepEqual(completeHoursFor(24), [8, 16, 24]);
    assert.ok(completeHoursFor(96).includes(48));
    assert.deepEqual(completeHoursFor(96, { cap: 48 }), [8, 16, 24, 48]);
  });

  it("runs a full range sim with stats, fills and complete cells", () => {
    const bundle = runReplaySimulation(8, DEFAULT_TACTIC_CONFIG, "hybrid", "atr", {
      symbolCount: 4,
      complete: true,
    });
    assert.equal(bundle.hours, 8);
    assert.equal(bundle.tactic, "hybrid");
    assert.equal(bundle.range, "atr");
    assert.ok(bundle.report.trades >= 1, "trades");
    assert.ok(Number.isFinite(bundle.report.pf));
    assert.ok(bundle.stats.hours);
    assert.ok(bundle.complete);
    assert.ok((bundle.complete?.cells.length ?? 0) >= 15);
    assert.ok(bundle.complete?.winner);
    assert.ok(bundle.fills.length >= 1);
    assert.ok((bundle.stats.byIndication ?? []).length >= 1);
    assert.ok((bundle.stats.byPlaybook ?? []).length >= 1);
    assert.ok(bundle.report.hourly.length >= 1);
    assert.ok(bundle.report.curve.length >= 1);
  });

  it("builds a tape for every replay range with occupancy and strategies", () => {
    for (const r of REPLAY_RANGES) {
      const tape = getReplayTape("ETHUSDT", r.hours);
      assert.ok(tape.bars > WARMUP, `${r.id} bars`);
      assert.equal(tape.candles.length, tape.bars, `${r.id} candles`);
      assert.ok(tape.occupancy.avgPos >= 0, `${r.id} occ`);
      assert.ok(tape.kinds.length >= 1, `${r.id} kinds`);
      assert.ok(tape.strategies.length >= 1, `${r.id} strategies`);
      assert.ok(tape.backtests.normal, `${r.id} normal`);
      assert.ok(tape.load.length >= 1, `${r.id} load`);
    }
  });

  it("simulates every live tactic × range independently at 8h", () => {
    for (const tactic of LIVE_TACTICS) {
      for (const range of RANGE_TYPES) {
        const { report } = simulateHours(8, DEFAULT_TACTIC_CONFIG, tactic, { symbolCount: 4, rangeType: range });
        assert.ok(report.trades >= 1, `${tactic}/${range} trades`);
        assert.ok(Number.isFinite(report.pf), `${tactic}/${range} pf`);
        assert.ok(report.hourly.length >= 1, `${tactic}/${range} hourly`);
      }
    }
  });

  it("complete computations cover 8/16/24 for all live lanes", () => {
    const complete = completeComputations(DEFAULT_TACTIC_CONFIG, { symbolCount: 4, hours: [8, 16, 24] });
    assert.equal(complete.cells.length, LIVE_TACTICS.length * RANGE_TYPES.length * 3);
    assert.ok(complete.winner);
    assert.ok(complete.byHours["8"] && complete.byHours["16"] && complete.byHours["24"]);
    assert.ok(complete.winner!.trades >= 1);
  });
});
