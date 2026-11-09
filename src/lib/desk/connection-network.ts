export type ExchangeNetwork = "mainnet" | "testnet";

const PINNED: Record<string, ExchangeNetwork> = {
  "bingx-x01": "mainnet",
  "bingx-vst-01": "testnet",
  "bingx-vst-02": "testnet",
  "bingx-x02": "testnet",
};

/** Credentials can work in both environments; the connection chooses the venue. */
export function connectionNetwork(connId?: string, requested?: string): ExchangeNetwork {
  const pinned = connId ? PINNED[connId] : undefined;
  if (connId && !pinned) throw new Error("Unknown connection network");
  if (requested && requested !== "mainnet" && requested !== "testnet") throw new Error("Invalid connection network");
  if (pinned && requested && requested !== pinned) throw new Error("Connection network contradicts its pinned environment");
  const selected = pinned ?? requested;
  if (selected !== "mainnet" && selected !== "testnet") throw new Error("Connection network is required");
  return selected;
}
