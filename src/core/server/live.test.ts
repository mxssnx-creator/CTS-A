import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isOwnCoid, makeCoid, ownSymbols, planLive, type LiveIntentLite } from "./live.ts";
import { DEFAULT_SETTINGS } from "../config.ts";

const S = { ...DEFAULT_SETTINGS.live, enabled: true, maxPositions: 2 };
const intent = (sym: string, cfg = "c"): LiveIntentLite => ({ cfg, sym, side: 1, tp: 0.02, sl: 0.03, barT: 1 });
const base = { settings: S, envArmed: true, hasKeys: true, intents: [intent("BTC-USDT")], book: { positions: [], orders: [] }, ownSyms: new Set<string>(), sent: new Set<string>() };

describe("live planner", () => {
  it("is off by default and needs every lock", () => {
    assert.equal(planLive({ ...base, settings: DEFAULT_SETTINGS.live }).enabled, false);
    assert.equal(DEFAULT_SETTINGS.live.enabled, false);
    assert.match(planLive({ ...base, envArmed: false }).reason, /CTS_CORE_LIVE/);
    assert.match(planLive({ ...base, hasKeys: false }).reason, /keys/);
    assert.match(planLive({ ...base, book: null }).reason, /book/);
    assert.equal(planLive(base).entries.length, 1);
    assert.match(planLive({ ...base, ready: { ok: false, why: "simulated run PF 0.90" } }).reason, /not ready/);
    assert.equal(planLive({ ...base, ready: { ok: true, why: "" } }).entries.length, 1);
  });

  it("never touches a symbol with foreign orders or positions", () => {
    const p = planLive({
      ...base,
      intents: [intent("BTC-USDT"), intent("ETH-USDT"), intent("SOL-USDT")],
      book: {
        positions: [{ symbol: "ETHUSDT", venueSymbol: "ETH-USDT", side: "long", qty: 1 }],
        orders: [{ symbol: "BTCUSDT", venueSymbol: "BTC-USDT", clientOrderId: "CTSAV2_E123" }],
      },
    });
    assert.deepEqual(p.entries.map((e) => e.sym), ["SOL-USDT"]);
    assert.equal(p.skipped.length, 2);
  });

  it("own tagged orders are not foreign; caps and dedupe hold", () => {
    const own = makeCoid("bingx-vst-02", "S");
    assert.ok(isOwnCoid(own, "bingx-vst-02"));
    assert.ok(!isOwnCoid(own, "bingx-x01"));
    assert.ok(!isOwnCoid("CTSAV2_E1", "bingx-vst-02"));
    const p = planLive({
      ...base,
      intents: [intent("A-USDT"), intent("A-USDT", "d"), intent("B-USDT"), intent("C-USDT")],
      book: { positions: [], orders: [{ symbol: "A", venueSymbol: "A-USDT", clientOrderId: own }] },
    });
    assert.deepEqual(p.entries.map((e) => e.sym), ["A-USDT", "B-USDT"]);
    const again = planLive({ ...base, sent: new Set(["c|BTC-USDT|1"]) });
    assert.equal(again.entries.length, 0);
    assert.ok(makeCoid("bingx-x01", "E").length <= 40);
  });

  it("drops a signal from a symbol whose newest bar lags the universe", () => {
    const p = planLive({ ...base, intents: [{ ...intent("BTC-USDT"), barT: 100 }, { ...intent("ETH-USDT"), barT: 200 }], newestBarT: 200 });
    assert.deepEqual(p.entries.map((e) => e.sym), ["ETH-USDT"]);
    assert.match(p.skipped[0].why, /stale/);
  });
});

describe("ownership", () => {
  it("own = own-tagged orders, or a recent own entry position without foreign orders", () => {
    const own = ownSymbols(
      {
        positions: [
          { symbol: "A", venueSymbol: "A-USDT", side: "long", qty: 1 },
          { symbol: "B", venueSymbol: "B-USDT", side: "long", qty: 1 },
          { symbol: "C", venueSymbol: "C-USDT", side: "long", qty: 1 },
        ],
        orders: [
          { symbol: "B", venueSymbol: "B-USDT", clientOrderId: "CTSAX1_S1" },
          { symbol: "D", venueSymbol: "D-USDT", clientOrderId: "CTSBV2_S1" },
        ],
      },
      "bingx-vst-02",
      new Set(["A-USDT", "B-USDT"]),
    );
    assert.deepEqual([...own].sort(), ["A-USDT", "D-USDT"]);
  });
});
