import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { blockOverlayStats, dcaOverlayStats, initVstEngine } from "./vst.ts";

for (const [playbook, stats] of [["block", blockOverlayStats], ["dca", dcaOverlayStats]] as const) {
  const fixture = (values: Array<number | undefined>) => {
    const e = initVstEngine(DEFAULT_TACTIC_CONFIG, { warmup: 0, arm: false, symbolCount: 1 });
    e.preEvalDone = true;
    e.closed = values.map((ratio, i) => ({ id: `${i}`, connId: e.activeConnId, symbol: "BTCUSDT",
      side: "long", playbook, tactic: playbook === "dca" ? "dca" : "trailing", qty: 1,
      entry: 100, exit: 100, ratio, pnl: 10, tick: 10 - i, reason: "time", r: 0, validExec: true }));
    return e;
  };
  test(`${playbook} overlay retains tiny losses and known-flat closes`, () => {
    const e = fixture([2e-16, -4e-16, 0]);
    assert.equal(stats(e).n, 3);
    assert.equal(stats(e).pf, .5);
  });
  test(`${playbook} overlay cannot use unknown return or another desk's closes`, () => {
    const e = fixture([.02, -.01, undefined]);
    assert.equal(stats(e).pf, 0, "unknown unit evidence cannot become dollar PnL");
    const own = fixture([.02, -.01, .5, .5, .5]);
    own.closed[2].connId = "other-connection";
    own.closed[3].validExec = undefined;
    own.closed[4].validExec = false;
    assert.equal(stats(own).n, 2);
    assert.equal(stats(own).pf, 2);
    own.activeConnId = "other-connection";
    assert.equal(stats(own).n, 1, "switching connections invalidates the overlay cache in the same tick");
  });
}
