import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { cancelSwapOrder, pingAccount, placeSwapOrder } from "./feed.server.ts";

const savedFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = savedFetch; });

for (const [connId, network] of [["bingx-vst-02", "mainnet"], ["bingx-x01", "testnet"]] as const) {
  it(`${connId} refuses ${network} before any account read`, async () => {
    let sent = 0;
    globalThis.fetch = (async () => {
      sent++;
      return new Response(JSON.stringify({ code: 0, data: { balance: { balance: "100" } } }));
    }) as typeof fetch;
    await assert.rejects(pingAccount({ connId, network, apiKey: "fixture", secret: "fixture" }), /connection.*network/i);
    assert.equal(sent, 0);
  });

  it(`${connId} refuses ${network} before creating or cancelling an order`, async () => {
    let sent = 0;
    globalThis.fetch = (async () => { sent++; throw new Error("no fixture requests allowed"); }) as typeof fetch;
    await assert.rejects(placeSwapOrder({ connId, network, apiKey: "fixture", secret: "fixture", symbol: "BTC-USDT",
      side: "BUY", positionSide: "LONG", quantity: .01, notional: 10, type: "MARKET", confirmLive: true }), /connection.*network/i);
    await assert.rejects(cancelSwapOrder({ connId, network, apiKey: "fixture", secret: "fixture", symbol: "BTC-USDT", orderId: "123" }), /connection.*network/i);
    assert.equal(sent, 0);
  });
}

it("a failed demo account read stays on the demo hosts", async () => {
  const hosts: string[] = [];
  globalThis.fetch = (async (url) => {
    hosts.push(new URL(String(url)).hostname);
    throw new Error("fixture timeout");
  }) as typeof fetch;
  const result = await pingAccount({ connId: "bingx-vst-02", network: "testnet", apiKey: "fixture", secret: "fixture" });
  assert.equal(result.ok, false);
  assert.ok(hosts.length > 0);
  assert.ok(hosts.every(host => host.startsWith("open-api-vst.")));
});
