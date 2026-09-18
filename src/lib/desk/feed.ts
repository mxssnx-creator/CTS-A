import { createServerFn } from "@tanstack/react-start";
import type { ExchangeBook, VstEngine } from "./types";

export interface LiveTicker {
  id: string;
  venueSymbol: string;
  last: number;
  bid: number;
  ask: number;
  chg: number;
  high: number;
  low: number;
  vol?: number;
}

export interface FeedSnapshot {
  ok: boolean;
  venue: "bingx";
  network: "mainnet" | "testnet";
  fetchedAt: number;
  latencyMs: number;
  tickers: LiveTicker[];
  missing: string[];
  error?: string;
}

export interface AccountPing {
  ok: boolean;
  latencyMs: number;
  error?: string;
  equity?: number;
}

export interface LiveOrderResult {
  ok: boolean;
  orderId?: string;
  error?: string;
}

export const MAX_LIVE_NOTIONAL = 150;
/** Size at least this multiple of exchange min qty / min notional. */
export const MIN_SIZE_RATIO = 1.08;

/** Desk id → BingX swap contract. Omissions stay on the last quoted walk. */
export const BINGX_SYMBOL: Record<string, string> = {
  BTCUSDT: "BTC-USDT",
  ETHUSDT: "ETH-USDT",
  SOLUSDT: "SOL-USDT",
  BNBUSDT: "BNB-USDT",
  XRPUSDT: "XRP-USDT",
  DOGEUSDT: "DOGE-USDT",
  AVAXUSDT: "AVAX-USDT",
  LINKUSDT: "LINK-USDT",
  ADAUSDT: "ADA-USDT",
  DOTUSDT: "DOT-USDT",
  MATICUSDT: "POL-USDT",
  ATOMUSDT: "ATOM-USDT",
  NEARUSDT: "NEAR-USDT",
  APTUSDT: "APT-USDT",
  SUIUSDT: "SUI-USDT",
  SEIUSDT: "SEI-USDT",
  TIAUSDT: "TIA-USDT",
  INJUSDT: "INJ-USDT",
  FETUSDT: "FET-USDT",
  RENDERUSDT: "RENDER-USDT",
  OPUSDT: "OP-USDT",
  ARBUSDT: "ARB-USDT",
  PEPEUSDT: "1000PEPE-USDT",
  SHIBUSDT: "1000SHIB-USDT",
  LTCUSDT: "LTC-USDT",
  BCHUSDT: "BCH-USDT",
  ETCUSDT: "ETC-USDT",
  FILUSDT: "FIL-USDT",
  UNIUSDT: "UNI-USDT",
  AAVEUSDT: "AAVE-USDT",
  CRVUSDT: "CRV-USDT",
  LDOUSDT: "LDO-USDT",
  GRTUSDT: "GRT-USDT",
  SANDUSDT: "SAND-USDT",
  MANAUSDT: "MANA-USDT",
  AXSUSDT: "AXS-USDT",
  IMXUSDT: "IMX-USDT",
  STXUSDT: "STX-USDT",
  RUNEUSDT: "RUNE-USDT",
  ALGOUSDT: "ALGO-USDT",
  XLMUSDT: "XLM-USDT",
  TRXUSDT: "TRX-USDT",
  WLDUSDT: "WLD-USDT",
  JUPUSDT: "JUP-USDT",
  PYTHUSDT: "PYTH-USDT",
  ONDOUSDT: "ONDO-USDT",
  WIFUSDT: "WIF-USDT",
  BATONUSDT: "BATON-USDT",
  MUSEBOOKUSDT: "MUSEBOOK-USDT",
  TOLLYUSDT: "TOLLY-USDT",
};

export const LIVE_IDS = Object.keys(BINGX_SYMBOL);
export const LIVE_SET = new Set(LIVE_IDS);

export function deskIdFromVenue(venueSymbol: string): string | undefined {
  for (const [id, vs] of Object.entries(BINGX_SYMBOL)) {
    if (vs === venueSymbol) return id;
  }
  return undefined;
}

export function applyLiveTape(e: VstEngine, tickers: LiveTicker[]): number {
  let n = 0;
  for (const t of tickers) {
    const q = e.quotes[t.id];
    if (!q || !(t.last > 0)) continue;
    const prev = q.px;
    const gap = prev > 0 ? Math.abs(t.last - prev) / prev : 1;
    const bid = t.bid > 0 ? t.bid : t.last;
    const ask = t.ask > 0 ? t.ask : t.last;
    const hi = t.high > 0 ? t.high : Math.max(ask, t.last);
    const lo = t.low > 0 ? t.low : Math.min(bid, t.last);
    q.px = t.last;
    // Tight live band — never slam ATR-sized hi/lo onto a live book.
    q.hi = Math.max(ask, t.last) * 1.00008;
    q.lo = Math.max(Math.min(bid, t.last) * 0.99992, t.last * 1e-6);
    if (q.hi < q.lo) q.hi = q.lo * 1.0001;
    q.chg = t.chg;
    const span = Math.max(hi - lo, t.last * 4e-4);
    if (gap > 0.04 || !(q.atr > 0)) {
      q.atr = Math.max(t.last * 0.0018, span * 0.25);
      q.axis = t.last;
    } else {
      q.atr = q.atr * 0.92 + span * 0.08;
      q.axis = q.axis * 0.97 + t.last * 0.03;
    }
    const liveVol = Number.isFinite(t.vol) && (t.vol ?? 0) > 0 ? Math.min(0.08, Math.max(0.004, t.vol as number)) : span / Math.max(t.last, 1e-9);
    q.vol = q.vol * 0.7 + Math.min(0.08, Math.max(0.004, liveVol)) * 0.3;
    n += 1;
  }
  if (n) e.lastMsg = `Live BingX tape · ${n} symbols`;
  return n;
}

export const pullLiveTape = createServerFn({ method: "POST" })
  .validator((d?: { network?: "mainnet" | "testnet" }) => d ?? {})
  .handler(async ({ data }): Promise<FeedSnapshot> => {
    const { fetchBingxTape } = await import("./feed.server.ts");
    const want = data?.network === "testnet" ? "testnet" : "mainnet";
    const first = await fetchBingxTape(want);
    if (first.ok && first.tickers.length >= 20) return first;
    const other = want === "testnet" ? "mainnet" : "testnet";
    const second = await fetchBingxTape(other);
    if (second.ok) return second;
    return first.ok ? first : second;
  });

export const deskCredentialStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, boolean>> => {
    const { credentialStatus } = await import("./feed.server.ts");
    return credentialStatus();
  },
);

export const pingBingxAccount = createServerFn({ method: "POST" })
  .validator((d: { apiKey?: string; secret?: string; network: "mainnet" | "testnet"; connId?: string }) => {
    if (d.network !== "mainnet" && d.network !== "testnet") throw new Error("Invalid network");
    return d;
  })
  .handler(async ({ data }): Promise<AccountPing> => {
    const { pingAccount } = await import("./feed.server.ts");
    return pingAccount(data);
  });

export const pullExchangeBook = createServerFn({ method: "POST" })
  .validator((d: { apiKey?: string; secret?: string; network: "mainnet" | "testnet"; connId: string }) => {
    if (d.network !== "mainnet" && d.network !== "testnet") throw new Error("Invalid network");
    if (!d.connId) throw new Error("connId required");
    return d;
  })
  .handler(async ({ data }): Promise<ExchangeBook> => {
    const { fetchExchangeBook } = await import("./feed.server.ts");
    return fetchExchangeBook(data);
  });

export const placeBingxOrder = createServerFn({ method: "POST" })
  .validator(
    (d: {
      apiKey?: string;
      secret?: string;
      network: "mainnet" | "testnet";
      symbol: string;
      side: "BUY" | "SELL";
      positionSide: "LONG" | "SHORT";
      quantity: number;
      type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
      price?: number;
      stopPrice?: number;
      notional: number;
      confirmLive: boolean;
      connId?: string;
      reduceOnly?: boolean;
      closePosition?: boolean;
      slAtr?: number;
      tpRatio?: number;
      attachProtect?: boolean;
    }) => {
      if (!d?.confirmLive) throw new Error("Live confirm required");
      if (d.network !== "mainnet" && d.network !== "testnet") throw new Error("Invalid network");
      if (d.side !== "BUY" && d.side !== "SELL") throw new Error("Invalid side");
      if (!(d.notional > 0)) throw new Error("Invalid notional");
      return d;
    },
  )
  .handler(async ({ data }): Promise<LiveOrderResult> => {
    const { placeSwapOrder, configureLiveExecution } = await import("./feed.server.ts");
    try {
      const { readSettingsFile } = await import("./settings.server.ts");
      const snap = readSettingsFile();
      if (snap) configureLiveExecution(snap);
    } catch {
      /* host defaults */
    }
    return placeSwapOrder(data);
  });

export const loadVstSession = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const p = process.env.CTS_A_STATUS || "/var/lib/cts-a/vst-session.json";
    if (!existsSync(p)) return null;
    const d = JSON.parse(readFileSync(p, "utf8")) as {
      pf?: number;
      wr?: number;
      net?: number;
      trades?: number;
      slots?: number;
      liveOrders?: number;
      tactic?: string;
      range?: string;
      elapsedMin?: number;
      livePos?: number;
      liveOrd?: number;
      livePnl?: number;
      liveOk?: boolean;
      liveSl?: number;
      liveTp?: number;
      pingOk?: boolean;
      lastMsg?: string;
      positive?: boolean;
    };
    return d;
  } catch {
    return null;
  }
});

export const loadOverallStats = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const p = process.env.CTS_A_OVERALL || "/var/lib/cts-a/overall-stats.json";
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as {
      at?: number;
      tactic?: string;
      range?: string;
      pf?: number;
      wr?: number;
      net?: number;
      trades?: number;
      live?: {
        overall?: { n: number; wins: number; pf: number; wr: number; net: number; ddt?: number; mdd?: number };
        bySymbol?: { key: string; n: number; wins?: number; pf: number; wr: number; net: number; ddt?: number }[];
        byReason?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number }[];
        bySide?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number }[];
        byIndication?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number }[];
        byKind?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number }[];
        byTactic?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number }[];
        byPlaybook?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number }[];
        byRange?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number }[];
        symbols?: number;
        occupied?: number;
        slots?: number;
        pf?: number;
        wr?: number;
        net?: number;
        ddt?: number;
        mdd?: number;
      };
      sweep?: {
        hours?: number;
        symbolCount?: number;
        at?: number;
        cells?: {
          tactic: string;
          range: string;
          pf: number;
          wr: number;
          net: number;
          trades: number;
          ok: boolean;
        }[];
        winner?: { tactic: string; range: string; pf: number; trades: number; ok: boolean } | null;
      };
      complete?: {
        at?: number;
        hours?: number[];
        symbolCount?: number;
        elapsedMs?: number;
        cells?: {
          tactic: string;
          range: string;
          hours: number;
          pf: number;
          wr: number;
          net: number;
          trades: number;
          mdd?: number;
          ok: boolean;
        }[];
        byHours?: Record<string, { winner?: { tactic: string; range: string; pf: number; hours?: number } | null; ok: number; n: number; avgPf?: number }>;
        winner?: { tactic: string; range: string; hours: number; pf: number; trades?: number; ok?: boolean } | null;
      };
      playbooks?: {
        hours?: number;
        at?: number;
        books?: { key: string; n: number; pf: number; wr: number; net: number; ddt?: number; mdd?: number; tactic?: string }[];
      };
      executions?: {
        ok?: boolean;
        realized?: { n: number; wins: number; pf: number; wr: number; net: number; ddt: number; mdd: number };
        bySymbol?: { key: string; n: number; pf: number; wr: number; net: number }[];
        orders?: {
          id: string;
          symbol: string;
          side: string;
          type: string;
          status: string;
          qty: number;
          px: number;
          pnl: number;
          time: number;
        }[];
        at?: number;
      };
    };
  } catch {
    return null;
  }
});

export const loadLiveExecutions = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchLiveExecutions } = await import("./feed.server.ts");
  return fetchLiveExecutions({ network: "testnet", connId: "bingx-vst-02" });
});

export const loadLiveDesk = createServerFn({ method: "GET" }).handler(async () => {
  const { readLiveDesk } = await import("./live-desk.server.ts");
  const live = await readLiveDesk();
  return live as {
    session: object | null;
    overall: object | null;
    exchange: ExchangeBook | null;
    at: number;
  };
});
