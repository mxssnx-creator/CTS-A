// Live stage planner (pure). The adapter (live.server.ts) executes its plan.
// Rules:
//   - OFF unless settings.live.enabled AND env CTS_CORE_LIVE=1 AND keys exist
//   - own tickets carry the CTSB tag of this connection; nothing else is ever cancelled or closed
//   - a symbol with any foreign position or order is skipped entirely
//   - caps: max own positions, fixed notional per entry
import type { LiveSettings } from "../config.ts";

export const LIVE_TAG: Record<LiveSettings["connId"], string> = {
  "bingx-x01": "CTSBX1_",
  "bingx-vst-01": "CTSBV1_",
  "bingx-vst-02": "CTSBV2_",
};

export function liveNetwork(connId: LiveSettings["connId"]): "mainnet" | "testnet" {
  return connId === "bingx-x01" ? "mainnet" : "testnet";
}

export function makeCoid(connId: LiveSettings["connId"], kind: "E" | "S" | "T" | "C", now = Date.now()): string {
  return `${LIVE_TAG[connId]}${kind}${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`.slice(0, 40);
}

export function isOwnCoid(coid: string | undefined, connId: LiveSettings["connId"]): boolean {
  return !!coid && coid.toUpperCase().startsWith(LIVE_TAG[connId]);
}

export interface BookView {
  positions: Array<{ symbol: string; venueSymbol: string; side: "long" | "short"; qty: number }>;
  orders: Array<{ symbol: string; venueSymbol: string; clientOrderId?: string }>;
}

export interface LiveIntentLite {
  cfg: string;
  sym: string; // venue symbol, e.g. BTC-USDT
  side: 1 | -1;
  tp: number;
  sl: number;
  barT: number;
}

export interface LivePlan {
  enabled: boolean;
  reason: string;
  entries: LiveIntentLite[];
  skipped: Array<{ sym: string; why: string }>;
}

export function planLive(input: {
  settings: LiveSettings;
  envArmed: boolean;
  hasKeys: boolean;
  intents: readonly LiveIntentLite[];
  book: BookView | null;
  /** venue symbols we currently hold via our own tagged entries */
  ownSyms: ReadonlySet<string>;
  /** intent keys already sent (cfg|sym|barT) */
  sent: ReadonlySet<string>;
  /** readiness: the rolling simulated run must be PF >= min and stable, otherwise Live stays off */
  ready?: { ok: boolean; why: string };
}): LivePlan {
  const { settings, intents, book } = input;
  const off = (reason: string): LivePlan => ({ enabled: false, reason, entries: [], skipped: [] });
  if (!settings.enabled) return off("live disabled in settings");
  if (!input.envArmed) return off("CTS_CORE_LIVE=1 not set on the host");
  if (!input.hasKeys) return off(`no API keys for ${settings.connId}`);
  if (input.ready && !input.ready.ok) return off(`not ready: ${input.ready.why}`);
  if (!book) return off("exchange book unavailable");
  const foreign = new Set<string>();
  for (const o of book.orders) if (!isOwnCoid(o.clientOrderId, settings.connId)) foreign.add(o.venueSymbol);
  for (const p of book.positions) if (!input.ownSyms.has(p.venueSymbol)) foreign.add(p.venueSymbol);
  let open = [...input.ownSyms].filter((s) => book.positions.some((p) => p.venueSymbol === s)).length;
  const entries: LiveIntentLite[] = [];
  const skipped: LivePlan["skipped"] = [];
  const seen = new Set<string>();
  for (const it of intents) {
    const key = `${it.cfg}|${it.sym}|${it.barT}`;
    if (input.sent.has(key)) continue;
    if (foreign.has(it.sym)) {
      skipped.push({ sym: it.sym, why: "foreign position/order on symbol" });
      continue;
    }
    if (input.ownSyms.has(it.sym) || seen.has(it.sym)) {
      skipped.push({ sym: it.sym, why: "already holding symbol" });
      continue;
    }
    if (open >= settings.maxPositions) {
      skipped.push({ sym: it.sym, why: "max positions" });
      continue;
    }
    seen.add(it.sym);
    entries.push(it);
    open++;
  }
  return { enabled: true, reason: "armed", entries, skipped };
}
