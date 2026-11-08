import assert from "node:assert/strict";
import { it } from "node:test";
import { feePolicy, resolveFeePolicy, roundTripFeeRate, actualFillFee, parseCommission } from "./fee-policy.ts";
it("prices all four maker/taker pairs and fee-relative slippage", () => {
  const expected = [0.0011, 0.00143, 0.00143, 0.00176]; let i = 0;
  for (const a of ["maker", "taker"] as const) for (const b of ["maker", "taker"] as const)
    assert.ok(Math.abs(roundTripFeeRate({}, a, b) - expected[i++]) < 1e-15);
  assert.equal(roundTripFeeRate({ maker: 0, taker: 0, slippageFeeRatio: 0 }), 0);
});
it("rejects invalid settings rather than silently undercharging", () => {
  for (const val of [-1, NaN, Infinity]) assert.throws(() => feePolicy({ taker: val }));
});
it("scopes rates by venue, account, symbol and timestamp, preserving zero", () => {
  const context = { exchange: "bingx", account: "demo", symbol: "BTC-USDT", now: 10000 };
  const row = { ...context, at: 9000, maker: 0, taker: .0002 };
  assert.equal(resolveFeePolicy({}, row, context).maker, 0);
  for (const change of [{ at: 11000 }, { at: -8_000_000 }, { account: "other" }, { symbol: "ETH-USDT" }, { exchange: "bybit" }, { taker: NaN }])
    assert.equal(resolveFeePolicy({}, { ...row, ...change }, context).source, "configured-estimate");
});
it("preserves measured zero/rebates and charges each partial fill on its own notional", () => {
  assert.equal(actualFillFee(2, 100, {}, false, 0).fee, 0);
  assert.equal(actualFillFee(2, 100, {}, false, -.01).fee, -.01);
  const legs = actualFillFee(1, 100, {}, true).fee + actualFillFee(1, 102, {}, false).fee;
  assert.ok(Math.abs(legs - .1316) < 1e-15);
  // No extra slippage on actual prices, regardless of the configured allowance.
  assert.equal(actualFillFee(1, 102, { slippageFeeRatio: 8 }).fee, .0816);
});
it("parses venue snapshots with explicit success and refuses missing rates", () => {
  assert.deepEqual(parseCommission("bingx", { code:0, data:{commission:{makerCommissionRate:"0", takerCommissionRate:"0.0008"}} }), {maker:0,taker:.0008});
  assert.deepEqual(parseCommission("bybit", { retCode:0, result:{list:[{makerFeeRate:"0.0001",takerFeeRate:"0.0006"}]} }), {maker:.0001,taker:.0006});
  assert.equal(parseCommission("bingx", {code:0,data:{makerCommissionRate:null,takerCommissionRate:.001}}), null);
  assert.equal(parseCommission("bingx", {data:{makerCommissionRate:0,takerCommissionRate:0}}), null);
});
