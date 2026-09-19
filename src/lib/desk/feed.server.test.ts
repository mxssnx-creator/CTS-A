import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLiveTape, BINGX_SYMBOL, LIVE_IDS, MAX_LIVE_NOTIONAL, MIN_SIZE_RATIO, deskClientPrefix, isDeskClientOrderId, isOwnedExchangeOrder, makeClientOrderId, ownKeysFromOrders } from "./feed.ts";
import {
  buildCanonical,
  exchangeMinNotional,
  fetchBingxTape,
  fetchExchangeBook,
  isMinSizeError,
  liftQtyToMin,
  maxLeverageOf,
  parseBingxJson,
  parseAvailableUsdt,
  parseOpenOrderRow,
  parsePositionLeverage,
  pickMaxLeverage,
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
    assert.equal(MAX_LIVE_NOTIONAL, 150);
    assert.equal(MIN_SIZE_RATIO, 1.08);
  });

  it("lifts qty to exchange min × ratio", () => {
    const spec = { symbol: "PEPE-USDT", minQty: 100, step: 1, qtyPrec: 0, pxPrec: 6, minUsdt: 5, maxLeverage: 50 };
    assert.ok(snapQty(1, spec) >= 100);
    const lifted = liftQtyToMin(1, spec, 0.01);
    assert.ok(lifted.qty >= 100 * MIN_SIZE_RATIO - 1e-6);
    assert.ok(lifted.notional >= exchangeMinNotional(spec, 0.01) * MIN_SIZE_RATIO - 1e-6);
    assert.equal(lifted.lifted, true);
    const usdt = liftQtyToMin(1, { ...spec, minQty: 1, minUsdt: 8 }, 1);
    assert.ok(usdt.notional >= 8 * MIN_SIZE_RATIO - 1e-6);
    const tiny = liftQtyToMin(0, { symbol: "SOL-USDT", minQty: 0.01, step: 0.01, qtyPrec: 2, pxPrec: 3, minUsdt: 5, maxLeverage: 75 }, 20);
    assert.ok(tiny.notional + 1e-9 >= 5 * MIN_SIZE_RATIO);
    assert.ok(tiny.qty + 1e-12 >= 0.01);
    assert.ok(isMinSizeError("order quantity is below min quantity"));
    assert.ok(isMinSizeError("notional too small"));
    assert.equal(maxLeverageOf({ symbol: "BTC-USDT", minQty: 0.001, step: 0.001, qtyPrec: 3, pxPrec: 1, minUsdt: 5, maxLeverage: 150 }), 150);
    assert.equal(maxLeverageOf({ symbol: "PEPE-USDT", minQty: 1, step: 1, qtyPrec: 0, pxPrec: 6, minUsdt: 5, maxLeverage: 50 }), 50);
    assert.equal(maxLeverageOf(null), 125);
    assert.equal(pickMaxLeverage({ symbol: "BTC-USDT", minQty: 0, step: 1, qtyPrec: 0, pxPrec: 1, minUsdt: 2, maxLeverage: 125 }, { maxLong: 500, maxShort: 500 }), 500);
    assert.equal(pickMaxLeverage(null, { maxLongLeverage: 75, maxShortLeverage: 50 }), 75);
    assert.equal(pickMaxLeverage(null, null), 125);
    assert.equal(parsePositionLeverage({ leverage: "125" }), 125);
    assert.equal(parsePositionLeverage({ positionLeverage: 75 }), 75);
    assert.equal(isMinSizeError("insufficient margin"), false);
    const down = snapQtyDown(1.0, { symbol: "SOL-USDT", minQty: 0.01, step: 0.01, qtyPrec: 2, pxPrec: 3, minUsdt: 5 });
    assert.ok(down <= 1);
    assert.equal(parseAvailableUsdt("The order size must be less than the available amount of 108.88 USDT"), 108.88);
  });

  it("keeps BingX orderIds as distinct strings", () => {
    const sl = "2100774590279671861";
    const tp = "2100774590279671924";
    const raw = `{"code":0,"data":{"orders":[{"orderId":${sl},"type":"STOP_MARKET"},{"orderId":${tp},"type":"TAKE_PROFIT_MARKET"}]}}`;
    const parsed = parseBingxJson(raw) as { data: { orders: { orderId: string }[] } };
    assert.equal(parsed.data.orders[0].orderId, sl);
    assert.equal(parsed.data.orders[1].orderId, tp);
    assert.notEqual(String(parsed.data.orders[0].orderId), String(parsed.data.orders[1].orderId));
  });

  it("parses independent filled and remaining on control orders", () => {
    const row = parseOpenOrderRow(
      {
        symbol: "ETH-USDT",
        orderId: "2100774590279671861",
        positionSide: "LONG",
        side: "SELL",
        type: "STOP_MARKET",
        origQty: "0.02",
        executedQty: "0.008",
        stopPrice: "2500",
        status: "NEW",
      },
      "bingx-x01",
    );
    assert.ok(row);
    assert.equal(row.symbol, "ETHUSDT");
    assert.equal(row.qty, 0.02);
    assert.equal(row.filled, 0.008);
    assert.ok(Math.abs((row.remaining ?? 0) - 0.012) < 1e-9);
    assert.equal(row.status, "partial");
    assert.equal(row.type, "STOP_MARKET");
    const full = parseOpenOrderRow(
      {
        symbol: "BTC-USDT",
        orderId: "1",
        positionSide: "SHORT",
        type: "TAKE_PROFIT_MARKET",
        origQty: 2,
        executedQty: 0,
        status: "NEW",
      },
      "bingx-x01",
    );
    assert.equal(full?.status, "NEW");
    assert.equal(full?.filled, 0);
    assert.equal(full?.remaining, 2);
    assert.equal(full?.owned, false);
  });

  it("tags desk clientOrderId per connection and ignores foreign exchange orders", () => {
    const a = makeClientOrderId("bingx-x01", "S");
    const b = makeClientOrderId("bingx-vst-02", "E");
    assert.ok(a.startsWith(deskClientPrefix("bingx-x01")));
    assert.ok(b.startsWith(deskClientPrefix("bingx-vst-02")));
    assert.ok(a.length <= 40 && b.length <= 40);
    assert.equal(isDeskClientOrderId(a, "bingx-x01"), true);
    assert.equal(isDeskClientOrderId(a, "bingx-vst-02"), false);
    assert.equal(isDeskClientOrderId(b, "bingx-x01"), false);
    assert.equal(isDeskClientOrderId("manual-bot-1", "bingx-x01"), false);
    const ours = parseOpenOrderRow(
      {
        symbol: "ETH-USDT",
        orderId: "9",
        positionSide: "LONG",
        type: "STOP_MARKET",
        origQty: "0.02",
        executedQty: "0",
        clientOrderID: a,
        status: "NEW",
      },
      "bingx-x01",
    );
    const foreign = parseOpenOrderRow(
      {
        symbol: "ETH-USDT",
        orderId: "8",
        positionSide: "LONG",
        type: "STOP_MARKET",
        origQty: "0.02",
        executedQty: "0",
        clientOrderID: "other-system-1",
        status: "NEW",
      },
      "bingx-x01",
    );
    const otherConn = parseOpenOrderRow(
      {
        symbol: "BTC-USDT",
        orderId: "7",
        positionSide: "SHORT",
        type: "TAKE_PROFIT_MARKET",
        origQty: "1",
        executedQty: "0",
        clientOrderId: b,
        status: "NEW",
      },
      "bingx-x01",
    );
    assert.equal(ours?.owned, true);
    assert.equal(ours?.clientOrderId, a);
    assert.equal(foreign?.owned, false);
    assert.equal(otherConn?.owned, false);
    assert.equal(isOwnedExchangeOrder(ours, "bingx-x01"), true);
    assert.equal(isOwnedExchangeOrder(foreign, "bingx-x01"), false);
    const keys = ownKeysFromOrders([ours, foreign, otherConn].filter(Boolean), "bingx-x01");
    assert.equal(keys.has("ETHUSDT:long"), true);
    assert.equal(keys.has("BTCUSDT:short"), false);
    assert.equal(keys.size, 1);
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
