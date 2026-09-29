import { createServerFn } from "@tanstack/react-start";
import type { ExchangeBook, VstEngine } from "./types";
import { profitFactor, refreshLiveIndications } from "./engine.ts";

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
  range1h?: number;
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
  clientOrderId?: string;
  error?: string;
}

export const MAX_LIVE_NOTIONAL = 150;
/** Size at least this multiple of exchange min qty / min notional. */
export const MIN_SIZE_RATIO = 1;
/** Live book: one slot per symbol and side. 50 symbols × long and short. */
export const LIVE_MAX_POSITIONS = 100;

const TERMINAL_ORDER = new Set(["cancelled", "canceled", "filled", "rejected", "expired", "deactivated"]);

/** Long and short on the same symbol are two positions. Duplicate rows of one side collapse. */
export function countPositionSlots(rows: ReadonlyArray<{ symbol?: string; side?: string }> | null | undefined) {
  const keys = new Set<string>();
  const symbols = new Set<string>();
  let long = 0;
  let short = 0;
  for (const p of rows ?? []) {
    const symbol = String(p?.symbol || "");
    const side = p?.side === "short" ? "short" : p?.side === "long" ? "long" : "";
    if (!symbol || !side) continue;
    symbols.add(symbol);
    const key = `${symbol}:${side}`;
    if (keys.has(key)) continue;
    keys.add(key);
    if (side === "long") long += 1;
    else short += 1;
  }
  return { slots: keys.size, long, short, symbols: symbols.size };
}

/** Every working order counts, including each partial. Nothing is collapsed by symbol. */
export function countWorkingOrders(rows: ReadonlyArray<{ status?: string }> | null | undefined) {
  let n = 0;
  let partial = 0;
  for (const o of rows ?? []) {
    const st = String(o?.status || "open").toLowerCase();
    if (TERMINAL_ORDER.has(st)) continue;
    n += 1;
    if (st === "partial" || st === "partially_filled" || st === "partiallyfilled") partial += 1;
  }
  return { n, partial };
}

/** Live size / Block stack vs account equity. Positions cap at 100. Orders are not capped here. */
export function liveEntryBudget(equity: number, minNotional = 2) {
  const eq = Math.max(0, Number(equity) || 0);
  void minNotional;
  if (!(eq > 0)) return { trade: false, block: false, maxNew: 0, maxPos: 0, reason: "empty" as const };
  if (eq < 1) return { trade: true, block: true, maxNew: 16, maxPos: LIVE_MAX_POSITIONS, reason: "micro" as const };
  return { trade: true, block: true, maxNew: 64, maxPos: LIVE_MAX_POSITIONS, reason: "full" as const };
}

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
  TAOUSDT: "TAO-USDT",
  CRVUSDT: "CRV-USDT",
  LDOUSDT: "LDO-USDT",
  GRTUSDT: "GRT-USDT",
  SANDUSDT: "SAND-USDT",
  MANAUSDT: "MANA-USDT",
  AXSUSDT: "AXS-USDT",
  IMXUSDT: "IMX-USDT",
  STXUSDT: "STX-USDT",
  RUNEUSDT: "RUNE-USDT",
  ENAUSDT: "ENA-USDT",
  ALGOUSDT: "ALGO-USDT",
  XLMUSDT: "XLM-USDT",
  TRXUSDT: "TRX-USDT",
  HBARUSDT: "HBAR-USDT",
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

export function venueSymbolOf(id: string): string {
  const s = String(id || "");
  return BINGX_SYMBOL[s] ?? (s.includes("-") ? s : `${s.replace(/USDT$/i, "")}-USDT`);
}

export function registerVenueSymbol(id: string, venue: string) {
  const desk = String(id || "").trim().toUpperCase();
  const vs = String(venue || "").trim();
  if (!desk || !vs) return;
  if (!BINGX_SYMBOL[desk]) BINGX_SYMBOL[desk] = vs;
  if (!LIVE_IDS.includes(desk)) LIVE_IDS.push(desk);
  LIVE_SET.add(desk);
}

/** BingX clientOrderID prefix that marks CTS-A tickets for a connection. */
export const DESK_CLIENT_PREFIX = "CTSA";
export type DeskClientKind = "E" | "S" | "T" | "C" | "L" | "X";

export function connClientTag(connId: string | undefined | null): string {
  if (connId === "bingx-vst-01") return "V1";
  if (connId === "bingx-vst-02") return "V2";
  if (connId === "bingx-x01") return "X1";
  return "XX";
}

export function deskClientPrefix(connId?: string | null): string {
  return `${DESK_CLIENT_PREFIX}${connClientTag(connId)}_`;
}

export function makeClientOrderId(connId: string | undefined | null, kind: DeskClientKind = "E"): string {
  const prefix = `${deskClientPrefix(connId)}${kind}`;
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  return `${prefix}${t}${r}`.slice(0, 40);
}

export function isDeskClientOrderId(id: string | undefined | null, connId?: string | null): boolean {
  const s = String(id || "").toUpperCase();
  if (!s.startsWith(DESK_CLIENT_PREFIX)) return false;
  if (connId) return s.startsWith(deskClientPrefix(connId).toUpperCase());
  return /^CTSA(V1|V2|X1|XX)_/.test(s);
}

export function clientOrderKindOf(type: string | undefined, closePosition?: boolean): DeskClientKind {
  if (closePosition) return "C";
  const u = String(type || "").toUpperCase();
  if (u.includes("STOP") && !u.includes("TAKE_PROFIT")) return "S";
  if (u.includes("TAKE_PROFIT") || u.includes("TRAILING")) return "T";
  if (u.includes("LIMIT")) return "L";
  return "E";
}

/** Exchange order ids only. Drops placeholders and synthetic symbol:type keys. */
export function exchangeOrderId(id: unknown): string {
  if (typeof id === "number") {
    if (!Number.isSafeInteger(id) || id <= 0) return "";
    return String(id);
  }
  const s = String(id ?? "").trim();
  if (!/^[0-9]{1,32}$/.test(s) || s === "0") return "";
  return s;
}

export function placedOrderId(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const order = d.order && typeof d.order === "object" ? (d.order as Record<string, unknown>) : null;
  const first = Array.isArray(d.orders) && d.orders[0] && typeof d.orders[0] === "object" ? (d.orders[0] as Record<string, unknown>) : null;
  return exchangeOrderId(d.orderId ?? d.orderID ?? order?.orderId ?? order?.orderID ?? first?.orderId ?? first?.orderID);
}

/** BingX requires quantity and stopPrice on a control, including when closePosition is set. closePosition must not also send reduceOnly. */
export function buildControlParams(input: {
  type?: string;
  quantity?: number;
  closePosition?: boolean;
  reduceOnly?: boolean;
  stopPrice?: number;
  price?: number;
}): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  const u = String(input.type || "").toUpperCase();
  const stop = u === "STOP_MARKET" || u === "TAKE_PROFIT_MARKET";
  if (input.closePosition) {
    params.closePosition = "true";
    if ((input.quantity ?? 0) > 0) params.quantity = input.quantity as number;
  } else {
    if ((input.quantity ?? 0) > 0) params.quantity = input.quantity as number;
    if (input.reduceOnly) params.reduceOnly = "true";
  }
  if (u === "LIMIT" && (input.price ?? 0) > 0) {
    params.price = input.price as number;
    params.timeInForce = "GTC";
  }
  if (stop && (input.stopPrice ?? 0) > 0) {
    params.stopPrice = input.stopPrice as number;
    params.workingType = "MARK_PRICE";
  }
  return params;
}

export function isOwnedExchangeOrder(
  o: { clientOrderId?: string; owned?: boolean } | null | undefined,
  connId?: string | null,
): boolean {
  if (!o) return false;
  return isDeskClientOrderId(o.clientOrderId, connId);
}

export function ownKeysFromOrders(
  orders: { symbol?: string; side?: string; clientOrderId?: string; owned?: boolean }[] | null | undefined,
  connId?: string | null,
): Set<string> {
  const keys = new Set<string>();
  for (const o of orders ?? []) {
    if (!isOwnedExchangeOrder(o, connId)) continue;
    if (o.symbol && o.side) keys.add(`${o.symbol}:${o.side}`);
  }
  return keys;
}

export type DeskExecOrder = {
  id: string;
  symbol: string;
  side?: string;
  type?: string;
  status?: string;
  qty?: number;
  px?: number;
  pnl?: number;
  time: number;
  info: string;
};

export type DeskIncome = {
  symbol: string;
  type: string;
  income: number;
  info?: string;
  time: number;
};

export type DeskRealized = {
  n: number;
  wins: number;
  pf: number;
  wr: number;
  net: number;
  ddt: number;
  mdd: number;
};

const CLOSE_TYPE_RE = /STOP|TAKE_PROFIT|TRAILING|CLOSE|LIQUID/;
const FILL_STATUS_RE = /FILLED|PARTIAL/;
const MATCH_MS = 60_000;

function ddtFromSigned(rows: { t: number; v: number }[]): number {
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  let peak = 0;
  let eq = 0;
  let dd = 0;
  let maxDd = 0;
  for (const r of sorted) {
    eq += r.v;
    if (eq > peak) {
      peak = eq;
      dd = 0;
    } else if (peak - eq > 1e-9) {
      dd += 1;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

function mddFromSigned(rows: { t: number; v: number }[]): number {
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  for (const r of sorted) {
    eq += r.v;
    if (eq > peak) peak = eq;
    const d = peak > 0 ? Math.max(0, (peak - eq) / peak) : 0;
    if (d > mdd) mdd = Math.min(1, d);
  }
  return mdd;
}

function realizedOf(rows: { income: number }[]): DeskRealized {
  const wins = rows.filter((x) => x.income > 0);
  const profit = wins.reduce((s, x) => s + x.income, 0);
  const loss = Math.abs(rows.filter((x) => x.income < 0).reduce((s, x) => s + x.income, 0));
  const net = profit - loss;
  const pf = profitFactor(profit, loss);
  const series = rows.map((x, i) => ({ t: i, v: x.income }));
  return {
    n: rows.length,
    wins: wins.length,
    pf: Number.isFinite(pf) ? pf : 0,
    wr: rows.length ? wins.length / rows.length : 0,
    net,
    ddt: 0,
    mdd: 0,
  };
}

export function isDeskCloseOrder(o: DeskExecOrder, connId?: string | null): boolean {
  if (!isDeskClientOrderId(o.info, connId)) return false;
  const pnl = Number(o.pnl) || 0;
  if (pnl) return true;
  const t = String(o.type || "").toUpperCase();
  const st = String(o.status || "").toUpperCase();
  return CLOSE_TYPE_RE.test(t) && FILL_STATUS_RE.test(st);
}

/** Realized PnL that belongs to this desk connection — foreign and other CTS slots dropped. */
export function filterDeskRealized(
  orders: DeskExecOrder[] | null | undefined,
  income: DeskIncome[] | null | undefined,
  connId: string,
  since = 0,
): {
  tagged: DeskExecOrder[];
  closes: DeskExecOrder[];
  pnl: DeskIncome[];
  realized: DeskRealized;
} {
  const all = orders ?? [];
  const tagged = all.filter((o) => isDeskClientOrderId(o.info, connId));
  const taggedIds = new Set<string>();
  for (const o of tagged) {
    if (o.id) taggedIds.add(String(o.id));
    if (o.info) taggedIds.add(String(o.info));
  }
  const otherIds = new Set<string>();
  const foreignIds = new Set<string>();
  for (const o of all) {
    if (isDeskClientOrderId(o.info, connId)) continue;
    const ids = [o.id, o.info].map(String).filter(Boolean);
    if (isDeskClientOrderId(o.info)) for (const id of ids) otherIds.add(id);
    else for (const id of ids) foreignIds.add(id);
  }
  const closes = tagged.filter((o) => isDeskCloseOrder(o, connId));
  const taggedSym = new Set(tagged.map((o) => o.symbol).filter(Boolean));
  const seen = new Set<string>();
  const booked = new Set<string>();
  const pnl: DeskIncome[] = [];
  const push = (row: DeskIncome) => {
    if (since && Number(row.time) > 0 && Number(row.time) < since) return;
    if (!row.symbol || !Number.isFinite(Number(row.income))) return;
    const oid = exchangeOrderId(row.info);
    const cid = isDeskClientOrderId(row.info, connId) ? String(row.info) : "";
    if (oid && booked.has(`id:${oid}`)) return;
    if (cid && booked.has(`cid:${cid}`)) return;
    const key = `${row.symbol}:${Number(row.time) || 0}:${Number(row.income).toFixed(8)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (oid) booked.add(`id:${oid}`);
    if (cid) booked.add(`cid:${cid}`);
    pnl.push({
      symbol: row.symbol,
      type: "REALIZED_PNL",
      income: Number(row.income) || 0,
      info: oid || cid || String(row.info || ""),
      time: Number(row.time) || 0,
    });
  };

  for (const x of income ?? []) {
    if (String(x.type || "") !== "REALIZED_PNL") continue;
    const info = String(x.info || "");
    if (isDeskClientOrderId(info) && !isDeskClientOrderId(info, connId)) continue;
    if (info && (otherIds.has(info) || foreignIds.has(info))) continue;
    if (isDeskClientOrderId(info, connId) || (info && taggedIds.has(info))) {
      push(x);
      continue;
    }
    if (info) continue;
    if (!taggedSym.has(x.symbol)) continue;
    const near = closes.filter((o) => o.symbol === x.symbol && Math.abs((Number(o.time) || 0) - (Number(x.time) || 0)) < MATCH_MS);
    const foreignNear = all.some(
      (o) =>
        o.symbol === x.symbol &&
        !isDeskClientOrderId(o.info, connId) &&
        Math.abs((Number(o.time) || 0) - (Number(x.time) || 0)) < MATCH_MS,
    );
    if (near.length === 1 && !foreignNear) push({ ...x, info: near[0]?.id || "" });
  }

  for (const o of closes) {
    const v = Number(o.pnl) || 0;
    if (!v) continue;
    const oid = exchangeOrderId(o.id);
    if (oid && booked.has(`id:${oid}`)) continue;
    if (o.info && booked.has(`cid:${o.info}`)) continue;
    if (pnl.some((x) => x.symbol === o.symbol && Math.abs(x.income - v) < 1e-8 && Math.abs((Number(x.time) || 0) - (Number(o.time) || 0)) < MATCH_MS)) continue;
    push({
      symbol: o.symbol,
      type: "REALIZED_PNL",
      income: v,
      info: oid || o.info || o.id,
      time: o.time,
    });
  }

  const realized = realizedOf(pnl);
  const series = [...pnl].map((x) => ({ t: x.time, v: x.income }));
  realized.ddt = ddtFromSigned(series);
  realized.mdd = mddFromSigned(series);
  return { tagged, closes, pnl, realized };
}

export function systemProcessedNet(closedNet: number, openNet: number) {
  const closed = Number.isFinite(closedNet) ? closedNet : 0;
  const open = Number.isFinite(openNet) ? openNet : 0;
  return { closedNet: closed, openNet: open, systemNet: closed + open };
}

/** Common SL/TP: farthest stop and farthest target among independent partials. */
export function pickWidestProtect(
  side: "long" | "short",
  entry: number,
  cands: { sl?: number; tp?: number }[],
): { sl: number; tp: number; slDist: number; tpDist: number } {
  const px = Number(entry) || 0;
  const sls: number[] = [];
  const tps: number[] = [];
  for (const c of cands) {
    const sl = Number(c?.sl) || 0;
    const tp = Number(c?.tp) || 0;
    if (sl > 0 && (side === "long" ? sl < px : sl > px)) sls.push(sl);
    if (tp > 0 && (side === "long" ? tp > px : tp < px)) tps.push(tp);
  }
  const sl = sls.length ? (side === "long" ? Math.min(...sls) : Math.max(...sls)) : 0;
  const tp = tps.length ? (side === "long" ? Math.max(...tps) : Math.min(...tps)) : 0;
  return { sl, tp, slDist: sl && px ? Math.abs(px - sl) : 0, tpDist: tp && px ? Math.abs(tp - px) : 0 };
}

export function protectIsTighter(side: "long" | "short", entry: number, cur: number, want: number): boolean {
  if (!(cur > 0) || !(want > 0) || !(entry > 0)) return false;
  const curD = Math.abs(cur - entry);
  const wantD = Math.abs(want - entry);
  if (side === "long") return cur > want && curD + 1e-12 < wantD;
  return cur < want && curD + 1e-12 < wantD;
}

export function deskIdFromVenue(venueSymbol: string): string | undefined {
  const vs = String(venueSymbol || "").trim();
  if (!vs) return undefined;
  for (const [id, mapped] of Object.entries(BINGX_SYMBOL)) {
    if (mapped === vs) return id;
  }
  const compact = vs.replace(/-/g, "").toUpperCase();
  if (BINGX_SYMBOL[compact]) return compact;
  if (/USDT$/i.test(compact)) return compact;
  return undefined;
}

const PRE_ATR = new Map<string, number>();

/** Hourly ATR as a fraction of price. Live tape must not replace this with the 24h high-low. */
export function seedPreAtr(id: string, atrFrac: number): void {
  const v = Number(atrFrac);
  if (!id || !(v > 0.0004) || v > 0.06) return;
  PRE_ATR.set(id, v);
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
    q.px = t.last;
    // Tight live band — never slam ATR-sized hi/lo onto a live book.
    q.hi = Math.max(ask, t.last) * 1.00008;
    q.lo = Math.max(Math.min(bid, t.last) * 0.99992, t.last * 1e-6);
    if (q.hi < q.lo) q.hi = q.lo * 1.0001;
    q.chg = t.chg;
    const now = Date.now();
    if (!q.vol1hAt || now - q.vol1hAt >= 3_600_000) {
      q.hi1h = t.last;
      q.lo1h = t.last;
      q.vol1hAt = now;
    } else {
      q.hi1h = Math.max(q.hi1h || t.last, t.last);
      q.lo1h = Math.min(q.lo1h || t.last, t.last);
    }
    const rolled = t.last > 0 ? Math.max(0, (Number(q.hi1h) - Number(q.lo1h)) / t.last) : 0;
    q.vol1h = t.range1h && t.range1h > 0 ? t.range1h : Math.max(q.vol1h || 0, rolled);
    const micro = Math.max(Math.abs(ask - bid), t.last * 4e-4);
    const pre = PRE_ATR.get(t.id) || 0;
    if (pre > 0) {
      q.atr = t.last * pre;
      q.axis = q.axis > 0 ? q.axis * 0.97 + t.last * 0.03 : t.last;
    } else if (gap > 0.04 || !(q.atr > 0)) {
      q.atr = Math.max(t.last * 0.0018, micro * 0.25);
      q.axis = t.last;
    } else {
      q.atr = q.atr * 0.92 + micro * 0.08;
      q.axis = q.axis * 0.97 + t.last * 0.03;
    }
    const liveVol = Number.isFinite(t.vol) && (t.vol ?? 0) > 0 ? Math.min(0.08, Math.max(0.004, t.vol as number)) : micro / Math.max(t.last, 1e-9);
    q.vol = q.vol * 0.7 + Math.min(0.08, Math.max(0.004, liveVol)) * 0.3;
    n += 1;
  }
  if (n) {
    refreshLiveIndications(e.quotes);
    e.lastMsg = `Live BingX tape · ${n} symbols`;
  }
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
      clientOrderId?: string;
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
    const { readLiveJson, liveSessionCandidates } = await import("./live-files.ts");
    const d = readLiveJson(liveSessionCandidates());
    if (!d) return null;
    return d as {
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
  } catch {
    return null;
  }
});

export const loadOverallStats = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { readLiveJson, liveOverallCandidates } = await import("./live-files.ts");
    const d = readLiveJson(liveOverallCandidates());
    if (!d) return null;
    return d as {
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
