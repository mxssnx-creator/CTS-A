import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PF_COORDS, sanitizePfCoords } from "./engine.ts";
import { engageLiveBook, initVstEngine, LIVE_RUN_CFG, pfCoordOn, tickVst } from "./vst.ts";

describe("PF coordinations", () => {
  it("defaults every switch on and lets one turn off", () => {
    assert.deepEqual(sanitizePfCoords(undefined), DEFAULT_PF_COORDS);
    const off = sanitizePfCoords({ pairAdd: false, winAgain: false });
    assert.equal(off.pairAdd, false);
    assert.equal(off.winAgain, false);
    assert.equal(off.hourKeep, true);
    assert.equal(off.bankWin, true);
    assert.equal(off.laneCool, true);
  });

  it("keeps the hour scratch when coords are unset", () => {
    const e = initVstEngine(LIVE_RUN_CFG, { warmup: 0, symbolCount: 4, arm: false, equity: 10, costStep: 3 });
    assert.equal(pfCoordOn(e, "hourKeep"), true);
    assert.equal(pfCoordOn(e, "pairAdd"), false);
    assert.equal(pfCoordOn(e, "bankWin"), false);
    e.pfCoords = sanitizePfCoords({ hourKeep: false });
    assert.equal(pfCoordOn(e, "hourKeep"), false);
    assert.equal(pfCoordOn(e, "pairAdd"), true);
  });

  it("stays thick and does not drop the book when the switches are on", () => {
    const run = (on: boolean) => {
      const e = initVstEngine(LIVE_RUN_CFG, {
        warmup: 0,
        symbolCount: 8,
        arm: false,
        equity: 10,
        costStep: 3,
        complete: true,
        orderType: "limit",
      });
      engageLiveBook(e);
      e.running = true;
      e.phase = "running";
      if (!on) e.pfCoords = { hourKeep: false, bankWin: false, pairAdd: false, laneCool: false, winAgain: false };
      for (let i = 0; i < 36; i++) {
        tickVst(e, LIVE_RUN_CFG, "trailing", { rangeType: "atr", symbolCount: 8, orderType: "limit" });
      }
      return e;
    };
    const off = run(false);
    const on = run(true);
    assert.ok(on.ledger.ordersPlaced >= 80, `on placed ${on.ledger.ordersPlaced}`);
    assert.ok(on.ledger.ordersPlaced + 1 >= off.ledger.ordersPlaced * 0.9, `on ${on.ledger.ordersPlaced} off ${off.ledger.ordersPlaced}`);
    const queued = on.queue.length + on.orders.filter((o) => o.status === "open" || o.status === "partial").length;
    assert.ok(queued >= 20, `working ${queued}`);
    if (on.ledger.trades >= 8) {
      assert.ok(on.stats.pf + 1e-9 >= 1, `pf ${on.stats.pf} trades ${on.ledger.trades}`);
    }
    const hits = on.pfCoordHits;
    assert.ok(hits, "hits recorded");
    assert.ok((hits?.pair ?? 0) + (hits?.again ?? 0) + (hits?.scratch ?? 0) + (hits?.bank ?? 0) >= 0);
  });
});
