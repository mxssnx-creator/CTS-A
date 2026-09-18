import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLiveTape, BINGX_SYMBOL, LIVE_IDS, MAX_LIVE_NOTIONAL, MIN_SIZE_RATIO } from "./feed.ts";
import {
  buildCanonical,
  exchangeMinNotional,
  fetchBingxTape,
  fetchExchangeBook,
  isMinSizeError,
  liftQtyToMin,
  parseAvailableUsdt,
  signQuery,
  snapQty,
  snapQtyDown,
} from "./feed.server.ts";
import type { VstEngine, VstQuote } from "./types.ts";

describe("live feed", () => {
  it("maps 47 desk symbols onto BingX swap contracts", () => {
    assert.ok(LIVE_IDS.length >= 40);
    assert.equal(BINGX_SYMBOL.BTCUSDT, "BTC-USDT");
    assert.equal(BINGX_SYMBOL.PEPEUSDT, "1000PEPE-USDT");
    assert.equal(BINGX_SYMBOL.MATICUSDT, "POL-USDT");
    assert.equal(MAX_LIVE_NOTIONAL, 50);
    assert.equal(MIN_SIZE_RATIO, 1.08);
  });

  it("lifts qty to exchange min × ratio", () => {
    const spec = { symbol: "PEPE-USDT", minQty: 100, step: 1, qtyPrec: 0, pxPrec: 6, minUsdt: 5 };
    assert.ok(snapQty(1, spec) >= 100);
    const lifted = liftQtyToMin(1, spec, 0.01);
    assert.ok(lifted.qty >= 100 * MIN_SIZE_RATIO - 1e-6);
    assert.ok(lifted.notional >= exchangeMinNotional(spec, 0.01) * MIN_SIZE_RATIO - 1e-6);
    assert.equal(lifted.lifted, true);
    const usdt = liftQtyToMin(1, { ...spec, minQty: 1, minUsdt: 8 }, 1);
    assert.ok(usdt.notional >= 8 * MIN_SIZE_RATIO - 1e-6);
    assert.ok(isMinSizeError("order quantity is below min quantity"));
    assert.ok(isMinSizeError("notional too small"));
    assert.equal(isMinSizeError("insufficient margin"), false);
    const down = snapQtyDown(1.0, { symbol: "SOL-USDT", minQty: 0.01, step: 0.01, qtyPrec: 2, pxPrec: 3, minUsdt: 5 });
    assert.ok(down <= 1);
    assert.equal(parseAvailableUsdt("The order size must be less than the available amount of 108.88 USDT"), 108.88);
  });

  it("signs with ASCII-sorted keys and no value encoding", () => {
    const canonical = buildCanonical({
      timestamp: 1696751141337,
      recvWindow: 5000,
      symbol: "ETH-USDT",
      type: "MARKET",
      side: "SELL",
      positionSide: "SHORT",
      quantity: 0.01,
    });
    assert.equal(
      canonical,
      "positionSide=SHORT&quantity=0.01&recvWindow=5000&side=SELL&symbol=ETH-USDT&timestamp=1696751141337&type=MARKET",
    );
    const hex = signQuery("test-secret", canonical);
    assert.match(hex, /^[a-f0-9]{64}$/);
  });

  it("applies tape last/bid/ask and 24h change onto quotes", () => {
    const q: VstQuote = {
      id: "BTCUSDT",
      base: "BTC",
      px: 1,
      hi: 1,
      lo: 1,
      atr: 10,
      vol: 0.01,
      axis: 1,
      chg: 0,
    };
    const e = { quotes: { BTCUSDT: q }, lastMsg: "" } as unknown as VstEngine;
    const n = applyLiveTape(e, [
      {
        id: "BTCUSDT",
        venueSymbol: "BTC-USDT",
        last: 76425.6,
        bid: 76425.5,
        ask: 76425.7,
        chg: 0.0072,
        high: 77000,
        low: 75000,
      },
    ]);
    assert.equal(n, 1);
    assert.equal(q.px, 76425.6);
    assert.equal(q.chg, 0.0072);
    assert.ok(q.hi >= 76425.6);
    assert.ok(q.lo <= 76425.6 && q.lo > 0);
  });

  it("pulls mainnet tickers for the mapped universe", async () => {
    const snap = await fetchBingxTape("mainnet");
    assert.equal(snap.ok, true, snap.error);
    assert.ok(snap.tickers.length >= 40, `got ${snap.tickers.length}`);
    const btc = snap.tickers.find((t) => t.id === "BTCUSDT");
    assert.ok(btc && btc.last > 1000, "BTC last");
    assert.ok(btc && btc.bid > 0 && btc.ask > 0);
  });

  it("pulls VST testnet tickers", async () => {
    const snap = await fetchBingxTape("testnet");
    assert.equal(snap.ok, true, snap.error);
    assert.ok(snap.tickers.length >= 40, `vst ${snap.tickers.length}`);
  });

  it("exchange book uses BingX x02 when keys exist, else fails closed", async () => {
    const book = await fetchExchangeBook({ network: "testnet", connId: "bingx-vst-02" });
    if (book.ok) {
      assert.ok(Number.isFinite(book.equity));
      assert.ok(Array.isArray(book.positions));
      assert.ok(Array.isArray(book.orders));
    } else {
      assert.ok(book.error);
    }
  });
});
