import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { completeHoursFor, replayHoursFor, runReplaySimulation } from "./replay-run.ts";

describe("replay simulation", () => {
  it("maps replay ranges onto bounded sim hours", () => {
    assert.equal(replayHoursFor("1d"), 24);
    assert.equal(replayHoursFor("2d"), 48);
    assert.ok(replayHoursFor("12d") <= 168);
    assert.deepEqual(completeHoursFor(24), [8, 16, 24]);
    assert.ok(completeHoursFor(96).includes(48));
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
  });
});
