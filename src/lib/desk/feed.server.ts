import { createHmac } from "node:crypto";
import {
  BINGX_SYMBOL,
  deskIdFromVenue,
  LIVE_IDS,
  MAX_LIVE_NOTIONAL,
  MIN_SIZE_RATIO,
  type AccountPing,
  type FeedSnapshot,
  type LiveOrderResult,
  type LiveTicker,
} from "./feed.ts";
import type { ExchangeBook, ExchangeOrder, ExchangePosition, Side } from "./types.ts";

export const HOSTS = {
  mainnet: ["https://open-api.bingx.com", "https://open-api.bingx.pro"],
  testnet: ["https://open-api-vst.bingx.com", "https://open-api-vst.bingx.pro"],
} as const;

type RawTicker = {
  symbol?: string;
  lastPrice?: string | number;
  bidPrice?: string | number;
  askPrice?: string | number;
  priceChangePercent?: string | number;
  highPrice?: string | number;
  lowPrice?: string | number;
  volume?: string | number;
  quoteVolume?: string | number;
};

export function buildCanonical(params: Record<string, string | number>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

export function signQuery(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

function envKey(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function keysForConn(connId?: string): { apiKey: string; secret: string } {
  const slot = connId === "bingx-vst-02" ? "X02" : "X01";
  const apiKey =
    envKey(`BINGX_${slot}_API_KEY`) || envKey("BINGX_API_KEY") || envKey("CTS_A_BINGX_API_KEY");
  const secret =
    envKey(`BINGX_${slot}_SECRET`) || envKey("BINGX_SECRET") || envKey("CTS_A_BINGX_SECRET");
  return { apiKey, secret };
}

export function resolveKeys(
  connId: string | undefined,
  apiKey?: string,
  secret?: string,
): { apiKey: string; secret: string } {
  const env = keysForConn(connId);
  return {
    apiKey: (apiKey ?? "").trim() || env.apiKey,
    secret: (secret ?? "").trim() || env.secret,
  };
}

export function credentialStatus(): Record<string, boolean> {
  const a = keysForConn("bingx-vst-01");
  const b = keysForConn("bingx-vst-02");
  const live = keysForConn("bingx-x01");
  return {
    "bingx-vst-01": Boolean(a.apiKey && a.secret),
    "bingx-vst-02": Boolean(b.apiKey && b.secret),
    "bingx-x01": Boolean(live.apiKey && live.secret),
  };
}

export function signedUrl(base: string, path: string, secret: string, params: Record<string, string | number>): string {
  const canonical = buildCanonical(params);
  const signature = signQuery(secret, canonical);
  const q = Object.keys(params)
    .sort()
    .map((k) => {
      const v = String(params[k]);
      const ev = /[{}"\s,]/.test(v) ? encodeURIComponent(v) : v;
      return `${k}=${ev}`;
    })
    .join("&");
  return `${base}${path}?${q}&signature=${signature}`;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function qtyDecimals(px: number): number {
  if (px >= 1000) return 6;
  if (px >= 10) return 4;
  if (px >= 1) return 3;
  if (px >= 0.01) return 2;
  return 0;
}

export type ContractSpec = {
  symbol: string;
  minQty: number;
  step: number;
  qtyPrec: number;
  pxPrec: number;
  minUsdt: number;
  maxLeverage?: number;
};

/** Exchange-safe minimum stop distance. */
export const MIN_LIVE_SL_PCT = 0.008;
export const MAX_LIVE_SL_PCT = 0.025;

let contractCache: { at: number; network: string; map: Map<string, ContractSpec> } | null = null;

export async function fetchContractMap(network: "mainnet" | "testnet"): Promise<Map<string, ContractSpec>> {
  if (contractCache && contractCache.network === network && Date.now() - contractCache.at < 600_000) {
    return contractCache.map;
  }
  const map = new Map<string, ContractSpec>();
  for (const host of HOSTS[network]) {
    try {
      const out = await getJson(`${host}/openApi/swap/v2/quote/contracts`);
      const body = out.json as { code?: number; data?: Record<string, unknown>[] };
      const rows = Array.isArray(body?.data) ? body.data : [];
      for (const r of rows) {
        const symbol = String(r.symbol ?? "");
        if (!symbol) continue;
        const qtyPrec = num(r.quantityPrecision);
        const step = num(r.size) || Math.pow(10, -Math.max(0, qtyPrec));
        const minQty = Math.max(num(r.tradeMinQuantity), num(r.tradeMinVolume), num(r.minQty), step, 0);
        const minUsdt = Math.max(num(r.tradeMinUSDT), num(r.minNotional), 0);
        const maxLev = Math.max(num(r.maxLongLeverage), num(r.maxShortLeverage), num(r.maxLeverage), num(r.leverage), 20);
        map.set(symbol, {
          symbol,
          minQty,
          step: step > 0 ? step : 1,
          qtyPrec,
          pxPrec: num(r.pricePrecision),
          minUsdt: minUsdt > 0 ? minUsdt : 2,
          maxLeverage: Math.min(150, Math.max(1, maxLev || 125)),
        });
      }
      if (map.size) break;
    } catch {
      /* next host */
    }
  }
  contractCache = { at: Date.now(), network, map };
  return map;
}

export function snapQty(qty: number, spec?: ContractSpec | null): number {
  if (!(qty > 0)) return spec?.minQty ?? 0;
  if (!spec) return qty;
  const step = spec.step > 0 ? spec.step : 1;
  let q = Math.ceil(qty / step - 1e-12) * step;
  if (q < spec.minQty) q = Math.ceil((spec.minQty * MIN_SIZE_RATIO) / step - 1e-12) * step;
  return Number(q.toFixed(Math.max(0, spec.qtyPrec)));
}

/** Floor to lot — never larger than qty. Used for reduce / protect. */
export function snapQtyDown(qty: number, spec?: ContractSpec | null): number {
  if (!(qty > 0)) return 0;
  if (!spec) return qty;
  const step = spec.step > 0 ? spec.step : 1;
  let q = Math.floor(qty / step + 1e-12) * step;
  if (q < 0) q = 0;
  return Number(q.toFixed(Math.max(0, spec.qtyPrec)));
}

export function parseAvailableUsdt(msg: string | undefined): number {
  const m = String(msg || "").match(/available amount of\s*([0-9]+(?:\.[0-9]+)?)\s*USDT/i);
  return m ? Number(m[1]) : 0;
}

export function snapPx(px: number, spec?: ContractSpec | null): number {
  if (!(px > 0)) return 0;
  const prec = spec?.pxPrec ?? 4;
  return Number(px.toFixed(Math.max(0, Math.min(8, prec))));
}

export function exchangeMinNotional(spec: ContractSpec | null | undefined, px: number): number {
  const p = Math.max(px, 0);
  const minQtyN = (spec?.minQty ?? 0) * p;
  const minUsdt = spec?.minUsdt ?? 2;
  return Math.max(minUsdt, minQtyN);
}

export type LiveExecConfig = {
  hedgeMode: boolean;
  marginMode: "cross" | "isolated";
  useMaxLeverage: boolean;
  leverage: number;
  minSizeRatio: number;
};

let liveExec: LiveExecConfig = {
  hedgeMode: true,
  marginMode: "cross",
  useMaxLeverage: true,
  leverage: 125,
  minSizeRatio: MIN_SIZE_RATIO,
};

export function configureLiveExecution(p: Partial<LiveExecConfig>) {
  liveExec = {
    hedgeMode: p.hedgeMode ?? liveExec.hedgeMode,
    marginMode: p.marginMode === "isolated" ? "isolated" : p.marginMode === "cross" ? "cross" : liveExec.marginMode,
    useMaxLeverage: p.useMaxLeverage ?? liveExec.useMaxLeverage,
    leverage: Math.min(150, Math.max(1, Math.round(Number(p.leverage ?? liveExec.leverage) || liveExec.leverage))),
    minSizeRatio: Math.min(2, Math.max(1, Number(p.minSizeRatio ?? liveExec.minSizeRatio) || liveExec.minSizeRatio)),
  };
}

export function liveExecutionConfig(): LiveExecConfig {
  return { ...liveExec };
}

function execRatio() {
  return liveExec.minSizeRatio;
}

async function signedTrade(
  network: "mainnet" | "testnet",
  connId: string | undefined,
  path: string,
  extra: Record<string, string | number>,
): Promise<LiveOrderResult> {
  const { apiKey, secret } = resolveKeys(connId, undefined, undefined);
  if (!apiKey || !secret) return { ok: false, error: "API key and secret required" };
  let last = "trade failed";
  for (const host of HOSTS[network]) {
    try {
      const params: Record<string, string | number> = {
        recvWindow: 5000,
        timestamp: Date.now(),
        ...extra,
      };
      const url = signedUrl(host, path, secret, params);
      const out = await getJson(url, { method: "POST", headers: { "X-BX-APIKEY": apiKey } });
      const body = out.json as { code?: number; msg?: string };
      if (body?.code === 0) return { ok: true };
      last = body?.msg || `BingX ${body?.code ?? out.status}`;
      if (/already|no need|not modified|same leverage|position side/i.test(last)) return { ok: true };
    } catch (err) {
      last = err instanceof Error ? err.message : "trade failed";
    }
  }
  return { ok: false, error: last };
}

let hedgeArmed = "";
const marginArmed = new Set<string>();
const levArmed = new Set<string>();

export async function ensureLiveAccountMode(input: {
  network: "mainnet" | "testnet";
  connId?: string;
  venueSymbol?: string;
  spec?: ContractSpec | null;
}): Promise<string | null> {
  const notes: string[] = [];
  const key = `${input.network}:${input.connId ?? ""}:${liveExec.hedgeMode}`;
  if (hedgeArmed !== key) {
    const r = await signedTrade(input.network, input.connId, "/openApi/swap/v1/positionSide/dual", {
      dualSidePosition: liveExec.hedgeMode ? "true" : "false",
    });
    if (r.ok) hedgeArmed = key;
    notes.push(r.ok ? `hedge ${liveExec.hedgeMode ? "on" : "off"}` : `hedge ${r.error}`);
  }
  const venue = input.venueSymbol;
  if (!venue) return notes[0] ?? null;
  const marginWant = liveExec.marginMode === "isolated" ? "ISOLATED" : "CROSSED";
  const mk = `${venue}:${marginWant}`;
  if (!marginArmed.has(mk)) {
    const r = await signedTrade(input.network, input.connId, "/openApi/swap/v2/trade/marginType", {
      symbol: venue,
      marginType: marginWant,
    });
    if (r.ok) marginArmed.add(mk);
    notes.push(r.ok ? `${marginWant.toLowerCase()} ${venue}` : `margin ${r.error}`);
  }
  const maxLev = Math.max(1, input.spec?.maxLeverage ?? 125);
  const lev = liveExec.useMaxLeverage ? maxLev : Math.min(maxLev, liveExec.leverage);
  const sides = liveExec.hedgeMode ? (["LONG", "SHORT"] as const) : (["BOTH"] as const);
  for (const side of sides) {
    const lk = `${venue}:${side}:${lev}`;
    if (levArmed.has(lk)) continue;
    const r = await signedTrade(input.network, input.connId, "/openApi/swap/v2/trade/leverage", {
      symbol: venue,
      side,
      leverage: lev,
    });
    if (r.ok) levArmed.add(lk);
    notes.push(r.ok ? `lev ${side} ${lev}x` : `lev ${r.error}`);
  }
  return notes.length ? notes.slice(0, 3).join(" · ") : null;
}

export function liftQtyToMin(
  qty: number,
  spec: ContractSpec | null | undefined,
  px: number,
  ratio = MIN_SIZE_RATIO,
): { qty: number; notional: number; lifted: boolean } {
  const r = Math.max(1, ratio || MIN_SIZE_RATIO);
  const p = Math.max(px, 1e-12);
  const minN = exchangeMinNotional(spec, p) * r;
  let want = Math.max(qty || 0, minN / p);
  if (spec?.minQty && want < spec.minQty * r) want = spec.minQty * r;
  const q = snapQty(want, spec);
  const notional = q * p;
  return { qty: q, notional, lifted: q > (qty || 0) + 1e-12 };
}

export function isMinSizeError(msg: string | undefined): boolean {
  return /min(imum)?\s*(qty|quantity|notional|volume|size)|quantity.*(small|low|min)|notional.*(small|low|min)|lot size|tradeMin|below min/i.test(
    String(msg || ""),
  );
}

export function isRateLimitedMsg(msg: string | undefined): boolean {
  return /100410|109418|frequency limit|disabled period|too many request|rate limit|over 20/i.test(String(msg || ""));
}

export function liveProtectPrices(
  entry: number,
  side: Side,
  slAtr = 1.05,
  tpRatio = 2.5,
  spec?: ContractSpec | null,
): { sl: number; tp: number; slPct: number; tpPct: number } {
  const slPct = Math.min(MAX_LIVE_SL_PCT, Math.max(MIN_LIVE_SL_PCT, 0.005 * Math.max(0.4, slAtr)));
  const tpPct = slPct * Math.min(3, Math.max(0.25, tpRatio));
  const slRaw = side === "long" ? entry * (1 - slPct) : entry * (1 + slPct);
  let tpRaw = side === "long" ? entry * (1 + tpPct) : entry * (1 - tpPct);
  if (side === "long") tpRaw = Math.max(tpRaw, entry * 1.004);
  else tpRaw = Math.min(tpRaw, entry * 0.996);
  return { sl: snapPx(slRaw, spec), tp: snapPx(tpRaw, spec), slPct, tpPct };
}

export async function resolveLiveQty(
  network: "mainnet" | "testnet",
  venueSymbol: string,
  px: number,
  notional: number,
  ratio = MIN_SIZE_RATIO,
): Promise<{ qty: number; spec: ContractSpec | undefined; notional: number; lifted: boolean }> {
  const map = await fetchContractMap(network);
  const spec = map.get(venueSymbol);
  const p = Math.max(px, 1e-12);
  const lifted = liftQtyToMin(notional / p, spec, p, ratio);
  return { qty: lifted.qty, spec, notional: lifted.notional, lifted: lifted.lifted };
}

export function parseBingxJson(text: string): unknown {
  const safe = text.replace(/([:\[,]\s*)(-?\d{16,})(\s*[,}\]])/g, '$1"$2"$3');
  return JSON.parse(safe);
}

async function getJson(url: string, init?: RequestInit): Promise<{ json: unknown; ms: number; status: number }> {
  const t0 = Date.now();
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "application/json",
      "User-Agent": "AXIS-Desk/1.0",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = parseBingxJson(text);
  } catch {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { json, ms: Date.now() - t0, status: res.status };
}

export async function fetchBingxTape(network: "mainnet" | "testnet"): Promise<FeedSnapshot> {
  const hosts = HOSTS[network];
  let lastMs = 0;
  let lastError = "fetch failed";
  for (const host of hosts) {
    try {
      const out = await getJson(`${host}/openApi/swap/v2/quote/ticker`);
      lastMs = out.ms;
      if (!out.json || typeof out.json !== "object") {
        lastError = `HTTP ${out.status}`;
        continue;
      }
      const body = out.json as { code?: number; msg?: string; data?: RawTicker[] | RawTicker };
      if (body.code !== 0) {
        lastError = body.msg || `BingX code ${body.code}`;
        continue;
      }
      const rows = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
      const bySym = new Map<string, RawTicker>();
      for (const row of rows) {
        if (row.symbol) bySym.set(row.symbol, row);
      }
      const tickers: LiveTicker[] = [];
      const missing: string[] = [];
      for (const id of LIVE_IDS) {
        const vs = BINGX_SYMBOL[id];
        if (!vs) {
          missing.push(id);
          continue;
        }
        const row = bySym.get(vs);
        const last = num(row?.lastPrice);
        if (!row || last <= 0) {
          missing.push(id);
          continue;
        }
        const pct = num(String(row.priceChangePercent).replace("%", ""));
        const high = num(row.highPrice) || last;
        const low = num(row.lowPrice) || last;
        const spanPct = Math.abs(high - low) / last;
        const qv = num(row.quoteVolume);
        const volFromRange = Math.min(0.08, Math.max(0.004, spanPct));
        const volFromQuote = qv > 0 ? Math.min(0.08, Math.max(0.004, Math.log10(qv + 10) / 10)) : 0;
        tickers.push({
          id,
          venueSymbol: vs,
          last,
          bid: num(row.bidPrice) || last,
          ask: num(row.askPrice) || last,
          chg: pct / 100,
          high,
          low,
          vol: Math.max(volFromRange, volFromQuote),
        });
      }
      return {
        ok: tickers.length > 0,
        venue: "bingx",
        network,
        fetchedAt: Date.now(),
        latencyMs: out.ms,
        tickers,
        missing,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "fetch failed";
    }
  }
  return {
    ok: false,
    venue: "bingx",
    network,
    fetchedAt: Date.now(),
    latencyMs: lastMs,
    tickers: [],
    missing: [...LIVE_IDS],
    error: lastError,
  };
}

export async function pingAccount(input: {
  apiKey?: string;
  secret?: string;
  network: "mainnet" | "testnet";
  connId?: string;
}): Promise<AccountPing> {
  const { apiKey, secret } = resolveKeys(input.connId, input.apiKey, input.secret);
  if (!apiKey || !secret) return { ok: false, latencyMs: 0, error: "API key and secret required" };
  const params = { recvWindow: 5000, timestamp: Date.now() };
  const path = "/openApi/swap/v2/user/balance";
  for (const host of HOSTS[input.network]) {
    try {
      const url = signedUrl(host, path, secret, params);
      const out = await getJson(url, { headers: { "X-BX-APIKEY": apiKey } });
      const body = out.json as {
        code?: number;
        msg?: string;
        data?: { balance?: { balance?: string } } | Array<{ balance?: string }>;
      };
      if (out.status === 401 || body?.code === 100001 || body?.code === 100002) {
        return { ok: false, latencyMs: out.ms, error: body?.msg || "Auth rejected" };
      }
      if (body?.code !== 0) {
        return { ok: false, latencyMs: out.ms, error: body?.msg || `BingX ${body?.code ?? out.status}` };
      }
      let equity = 0;
      const data = body.data;
      const bal = Array.isArray(data)
        ? data[0]
        : data && typeof data === "object"
          ? ((data as { balance?: Record<string, unknown> }).balance ?? data)
          : null;
      if (bal && typeof bal === "object") {
        const row = bal as Record<string, unknown>;
        equity =
          num(row.equity) ||
          num(row.balance) ||
          num(row.availableMargin) ||
          num(row.available);
      }
      return { ok: true, latencyMs: out.ms, equity };
    } catch (err) {
      const error = err instanceof Error ? err.message : "ping failed";
      if (host === HOSTS[input.network][HOSTS[input.network].length - 1]) {
        return { ok: false, latencyMs: 0, error };
      }
    }
  }
  return { ok: false, latencyMs: 0, error: "ping failed" };
}

export async function placeSwapOrder(input: {
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
  equity?: number;
}): Promise<LiveOrderResult> {
  if (!input.confirmLive) return { ok: false, error: "Live confirm required" };
  const { apiKey, secret } = resolveKeys(input.connId, input.apiKey, input.secret);
  if (!apiKey || !secret) return { ok: false, error: "API key and secret required" };
  if (!(input.notional > 0) || !Number.isFinite(input.notional)) return { ok: false, error: "Invalid notional" };
  const venueSymbol =
    BINGX_SYMBOL[input.symbol] ??
    (input.symbol.includes("-") ? input.symbol : `${input.symbol.replace(/USDT$/i, "")}-USDT`);
  const map = await fetchContractMap(input.network);
  const spec = map.get(venueSymbol);
  const px = input.price && input.price > 0 ? input.price : 0;
  const posSide: Side = input.positionSide === "SHORT" ? "short" : "long";
  const liveSide: Side = input.side === "SELL" ? "short" : "long";
  const protectSide = input.closePosition ? posSide : liveSide;
  const ratio = execRatio();
  const minFloor = exchangeMinNotional(spec, Math.max(px, 1e-8)) * ratio;
  const cap = Math.max(MAX_LIVE_NOTIONAL, minFloor);

  let qty = input.quantity;
  let usedNotional = input.notional;
  if (input.type === "MARKET" && !input.closePosition) {
    const resolved = await resolveLiveQty(input.network, venueSymbol, Math.max(px, 1e-8), input.notional, ratio);
    qty = resolved.qty;
    usedNotional = resolved.notional;
  } else if (!input.closePosition) {
    const lifted = liftQtyToMin(
      input.quantity > 0 ? input.quantity : input.notional / Math.max(px, 1e-8),
      spec,
      Math.max(px, 1e-8),
      ratio,
    );
    qty = lifted.qty;
    usedNotional = lifted.notional;
  } else {
    qty = input.quantity > 0 ? snapQtyDown(input.quantity, spec) : 0;
    usedNotional = qty * Math.max(px, 1e-8);
  }
  if (!input.closePosition) {
    const floor = liftQtyToMin(qty, spec, Math.max(px, 1e-8), ratio);
    if (floor.qty > qty) {
      qty = floor.qty;
      usedNotional = floor.notional;
    }
  }
  if (!input.closePosition && input.type === "MARKET" && usedNotional > cap + 1e-6 && usedNotional - minFloor > 1e-6) {
    const p = Math.max(px, 1e-8);
    const down = snapQtyDown(cap / p, spec);
    const downN = down * p;
    if (down > 0 && downN + 1e-9 >= minFloor) {
      qty = down;
      usedNotional = downN;
    }
  }
  if (!(qty > 0) && !input.closePosition) {
    const floor = liftQtyToMin(0, spec, Math.max(px, 1e-8), ratio);
    qty = floor.qty;
    usedNotional = floor.notional;
  }
  if (!(qty > 0) && !input.closePosition) return { ok: false, error: "Quantity below exchange minimum" };
  if (!input.closePosition && input.equity && input.equity > 0 && usedNotional > input.equity * 0.12) {
    const minFloor = exchangeMinNotional(spec, Math.max(px, 1e-8)) * ratio;
    const allowMin = usedNotional <= minFloor * 1.2 && usedNotional <= input.equity * 0.25;
    if (!allowMin) return { ok: false, error: "min notional exceeds 12% equity" };
  }

  if (!input.closePosition && input.type === "MARKET") {
    await ensureLiveAccountMode({ network: input.network, connId: input.connId, venueSymbol, spec });
  }

  const post = async (sendQty: number): Promise<LiveOrderResult> => {
    const params: Record<string, string | number> = {
      symbol: venueSymbol,
      side: input.side,
      positionSide: input.positionSide,
      type: input.type,
      recvWindow: 5000,
      timestamp: Date.now(),
    };
    if (sendQty > 0) params.quantity = sendQty;
    if (input.type === "LIMIT") {
      if (!(px > 0)) return { ok: false, error: "Limit price required" };
      params.price = snapPx(px, spec);
      params.timeInForce = "GTC";
    } else if (input.type === "STOP_MARKET" || input.type === "TAKE_PROFIT_MARKET") {
      const trigger = input.stopPrice ?? px;
      if (!(trigger > 0)) return { ok: false, error: "Stop price required" };
      params.stopPrice = snapPx(trigger, spec);
      params.workingType = "MARK_PRICE";
    } else if (input.type === "MARKET" && !input.closePosition && input.attachProtect !== false) {
      const ref = px > 0 ? px : sendQty > 0 ? usedNotional / sendQty : 0;
      if (ref > 0) {
        const prot = liveProtectPrices(ref, protectSide, input.slAtr ?? 1.05, input.tpRatio ?? 2.5, spec);
        params.stopLoss = JSON.stringify({
          type: "STOP_MARKET",
          stopPrice: prot.sl,
          workingType: "MARK_PRICE",
        });
        params.takeProfit = JSON.stringify({
          type: "TAKE_PROFIT_MARKET",
          stopPrice: prot.tp,
          workingType: "MARK_PRICE",
        });
      }
    }
    if (input.closePosition) params.closePosition = "true";
    if (input.reduceOnly) params.reduceOnly = "true";
    try {
      const url = signedUrl(HOSTS[input.network][0], "/openApi/swap/v2/trade/order", secret, params);
      const out = await getJson(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": apiKey },
      });
      const body = out.json as { code?: number; msg?: string; data?: { orderId?: string | number } };
      if (body?.code !== 0) {
        return { ok: false, error: body?.msg || `BingX ${body?.code ?? out.status}` };
      }
      return { ok: true, orderId: String(body.data?.orderId ?? "ok") };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "order failed" };
    }
  };

  let result = await post(qty);
  if (isRateLimitedMsg(result.error)) return result;
  if (!result.ok && isMinSizeError(result.error) && !input.closePosition) {
    for (const mul of [1.25, 1.5, 2]) {
      const bump = liftQtyToMin(qty, spec, Math.max(px, 1e-8), execRatio() * mul);
      if (!(bump.qty > qty)) continue;
      result = await post(bump.qty);
      if (result.ok || isRateLimitedMsg(result.error) || !isMinSizeError(result.error)) break;
      qty = bump.qty;
    }
  }
  return result;
}

export async function cancelSwapOrder(input: {
  apiKey?: string;
  secret?: string;
  network: "mainnet" | "testnet";
  connId?: string;
  symbol: string;
  orderId: string;
}): Promise<LiveOrderResult> {
  const { apiKey, secret } = resolveKeys(input.connId, input.apiKey, input.secret);
  if (!apiKey || !secret) return { ok: false, error: "API key and secret required" };
  if (!input.orderId) return { ok: false, error: "orderId required" };
  const venue = input.symbol.includes("-")
    ? input.symbol
    : BINGX_SYMBOL[input.symbol] ?? `${input.symbol.replace(/USDT$/i, "")}-USDT`;
  const params: Record<string, string | number> = {
    symbol: venue,
    orderId: String(input.orderId),
    recvWindow: 5000,
    timestamp: Date.now(),
  };
  try {
    const url = signedUrl(HOSTS[input.network][0], "/openApi/swap/v2/trade/order", secret, params);
    const out = await getJson(url, {
      method: "DELETE",
      headers: { "X-BX-APIKEY": apiKey },
    });
    const body = out.json as { code?: number; msg?: string };
    if (body?.code !== 0) return { ok: false, error: body?.msg || `BingX ${body?.code ?? out.status}` };
    return { ok: true, orderId: input.orderId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "cancel failed" };
  }
}

function asSide(positionSide: string | undefined, side?: string): Side {
  const ps = (positionSide ?? "").toUpperCase();
  if (ps === "SHORT") return "short";
  if (ps === "LONG") return "long";
  return (side ?? "").toUpperCase() === "SELL" ? "short" : "long";
}

export async function fetchExchangeBook(input: {
  apiKey?: string;
  secret?: string;
  network: "mainnet" | "testnet";
  connId: string;
}): Promise<ExchangeBook> {
  const empty: ExchangeBook = {
    connId: input.connId,
    ok: false,
    equity: 0,
    positions: [],
    orders: [],
    at: Date.now(),
    latencyMs: 0,
  };
  const { apiKey, secret } = resolveKeys(input.connId, input.apiKey, input.secret);
  if (!apiKey || !secret) return { ...empty, error: "API key and secret required" };
  const ping = await pingAccount({ apiKey, secret, network: input.network, connId: input.connId });
  if (!ping.ok) return { ...empty, latencyMs: ping.latencyMs, error: ping.error ?? "ping failed" };

  const params = { recvWindow: 5000, timestamp: Date.now() };
  let positions: ExchangePosition[] = [];
  let orders: ExchangeOrder[] = [];
  let ms = ping.latencyMs;
  let posErr = "";
  let ordErr = "";
  for (const host of HOSTS[input.network]) {
    try {
      const posUrl = signedUrl(host, "/openApi/swap/v2/user/positions", secret, params);
      const posOut = await getJson(posUrl, { headers: { "X-BX-APIKEY": apiKey } });
      ms = posOut.ms;
      const posBody = posOut.json as { code?: number; msg?: string; data?: unknown };
      if (posBody?.code !== 0) {
        posErr = String(posBody?.msg || `BingX pos ${posBody?.code ?? posOut.status}`);
        continue;
      }
      posErr = "";
      const raw = Array.isArray(posBody.data)
        ? posBody.data
        : Array.isArray((posBody.data as { positions?: unknown[] } | null)?.positions)
          ? ((posBody.data as { positions: unknown[] }).positions)
          : [];
      positions = [];
      for (const row of raw) {
        const r = row as Record<string, unknown>;
        const venueSymbol = String(r.symbol ?? "");
        const qty = Math.abs(
          num(r.positionAmt ?? r.availableAmt ?? r.positionQty ?? r.holdVol ?? r.volume ?? r.availablePos ?? r.size ?? r.positionVolume),
        );
        if (!(qty > 0) || !venueSymbol) continue;
        const symbol = deskIdFromVenue(venueSymbol) ?? venueSymbol.replace("-", "");
        positions.push({
          connId: input.connId,
          symbol,
          venueSymbol,
          side: asSide(String(r.positionSide ?? r.onlyOnePositionSide ?? ""), String(r.side ?? "")),
          qty,
          entry: num(r.avgPrice ?? r.entryPrice),
          mark: num(r.markPrice ?? r.avgPrice),
          pnl: num(r.unrealizedProfit ?? r.unrealisedPnl ?? r.pnl),
        });
      }
      const ordParams = { recvWindow: 5000, timestamp: Date.now() };
      const ordUrl = signedUrl(host, "/openApi/swap/v2/trade/openOrders", secret, ordParams);
      const ordOut = await getJson(ordUrl, { headers: { "X-BX-APIKEY": apiKey } });
      ms = ordOut.ms;
      const ordBody = ordOut.json as { code?: number; msg?: string; data?: unknown };
      if (ordBody?.code !== 0) {
        ordErr = String(ordBody?.msg || `BingX ord ${ordBody?.code ?? ordOut.status}`);
      } else {
        ordErr = "";
        const data = ordBody.data as { orders?: unknown[] } | unknown[] | null;
        const rawOrd = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [];
        orders = [];
        for (const row of rawOrd) {
          const r = row as Record<string, unknown>;
          const venueSymbol = String(r.symbol ?? "");
          const qty = num(r.origQty ?? r.quantity ?? r.qty);
          if (!venueSymbol) continue;
          const symbol = deskIdFromVenue(venueSymbol) ?? venueSymbol.replace("-", "");
          orders.push({
            connId: input.connId,
            id: String(r.orderId ?? r.orderID ?? r.id ?? `${symbol}:${r.type}:${r.positionSide}:${r.stopPrice}`),
            symbol,
            venueSymbol,
            side: asSide(String(r.positionSide ?? ""), String(r.side ?? "")),
            qty,
            price: num(r.price ?? r.avgPrice),
            stopPrice: num(r.stopPrice ?? r.triggerPrice),
            status: String(r.status ?? "open"),
            type: String(r.type ?? "LIMIT"),
          });
        }
      }
      break;
    } catch (err) {
      posErr = err instanceof Error ? err.message : "book fetch fail";
    }
  }
  if (posErr && positions.length === 0) {
    return { ...empty, latencyMs: ms, error: posErr, ok: false };
  }
  return {
    connId: input.connId,
    ok: true,
    equity: ping.equity ?? 0,
    positions,
    orders,
    at: Date.now(),
    latencyMs: ms,
    error: ordErr || undefined,
  };
}

export type LiveExecution = {
  id: string;
  symbol: string;
  side: Side;
  type: string;
  status: string;
  qty: number;
  px: number;
  pnl: number;
  time: number;
  info: string;
};

export type LiveIncome = {
  symbol: string;
  type: string;
  income: number;
  info: string;
  time: number;
};

function ddtFromSeries(pnls: { t: number; v: number }[]): number {
  const rows = [...pnls].sort((a, b) => a.t - b.t);
  let eq = 0;
  let peak = 0;
  let dd = 0;
  let maxDd = 0;
  for (const r of rows) {
    eq += r.v;
    if (eq > peak) peak = eq;
    if (peak - eq > 1e-9) {
      dd += 1;
      if (dd > maxDd) maxDd = dd;
    } else dd = 0;
  }
  return maxDd;
}

export async function fetchLiveExecutions(input: {
  apiKey?: string;
  secret?: string;
  network: "mainnet" | "testnet";
  connId: string;
  since?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  orders: LiveExecution[];
  income: LiveIncome[];
  realized: { n: number; wins: number; pf: number; wr: number; net: number; ddt: number; mdd: number };
  bySymbol: { key: string; n: number; pf: number; wr: number; net: number }[];
  at: number;
}> {
  const empty = {
    ok: false as const,
    orders: [] as LiveExecution[],
    income: [] as LiveIncome[],
    realized: { n: 0, wins: 0, pf: 0, wr: 0, net: 0, ddt: 0, mdd: 0 },
    bySymbol: [] as { key: string; n: number; pf: number; wr: number; net: number }[],
    at: Date.now(),
  };
  const { apiKey, secret } = resolveKeys(input.connId, input.apiKey, input.secret);
  if (!apiKey || !secret) return { ...empty, error: "API key and secret required" };
  let orders: LiveExecution[] = [];
  let income: LiveIncome[] = [];
  for (const host of HOSTS[input.network]) {
    try {
      const ordUrl = signedUrl(host, "/openApi/swap/v2/trade/allOrders", secret, {
        recvWindow: 5000,
        timestamp: Date.now(),
        limit: 100,
      });
      const ordOut = await getJson(ordUrl, { headers: { "X-BX-APIKEY": apiKey } });
      const ordBody = ordOut.json as { code?: number; data?: { orders?: Record<string, unknown>[] } };
      const raw = Array.isArray(ordBody.data) ? ordBody.data : ordBody.data?.orders ?? [];
      if (ordBody.code === 0) {
        orders = raw.map((r) => {
          const venue = String(r.symbol ?? "");
          const ps = String(r.positionSide ?? r.side ?? "").toUpperCase();
          return {
            id: String(r.orderId ?? ""),
            symbol: deskIdFromVenue(venue) ?? venue.replace("-", ""),
            side: (ps === "SHORT" ? "short" : "long") as Side,
            type: String(r.type ?? ""),
            status: String(r.status ?? ""),
            qty: num(r.executedQty ?? r.origQty),
            px: num(r.avgPrice ?? r.price),
            pnl: num(r.profit),
            time: num(r.updateTime ?? r.time),
            info: String(r.clientOrderId ?? ""),
          };
        });
      }
      const incUrl = signedUrl(host, "/openApi/swap/v2/user/income", secret, {
        recvWindow: 5000,
        timestamp: Date.now() + 1,
        limit: 1000,
      });
      const incOut = await getJson(incUrl, { headers: { "X-BX-APIKEY": apiKey } });
      const incBody = incOut.json as { code?: number; data?: Record<string, unknown>[] };
      const incRaw = Array.isArray(incBody.data) ? incBody.data : [];
      if (incBody.code === 0) {
        income = incRaw.map((r) => ({
          symbol: deskIdFromVenue(String(r.symbol ?? "")) ?? String(r.symbol ?? "").replace("-", ""),
          type: String(r.incomeType ?? ""),
          income: num(r.income),
          info: String(r.info ?? ""),
          time: num(r.time),
        }));
      }
      if (orders.length || income.length) break;
    } catch {
      /* next host */
    }
  }
  const since = Number(input.since) || 0;
  const pnl = income.filter((x) => x.type === "REALIZED_PNL" && (!since || x.time >= since));
  const wins = pnl.filter((x) => x.income > 0);
  const profit = wins.reduce((s, x) => s + x.income, 0);
  const loss = Math.abs(pnl.filter((x) => x.income < 0).reduce((s, x) => s + x.income, 0));
  const net = profit - loss;
  const pf = loss === 0 ? (profit > 0 ? 3.2 : 0) : profit / loss;
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  for (const r of [...pnl].sort((a, b) => a.time - b.time)) {
    eq += r.income;
    if (eq > peak) peak = eq;
    const d = peak > 0 ? Math.max(0, (peak - eq) / peak) : 0;
    if (d > mdd) mdd = Math.min(1, d);
  }
  const byMap = new Map<string, { n: number; wins: number; profit: number; loss: number }>();
  for (const r of pnl) {
    const cur = byMap.get(r.symbol) ?? { n: 0, wins: 0, profit: 0, loss: 0 };
    cur.n += 1;
    if (r.income > 0) {
      cur.wins += 1;
      cur.profit += r.income;
    } else cur.loss += Math.abs(r.income);
    byMap.set(r.symbol, cur);
  }
  const bySymbol = [...byMap.entries()]
    .map(([key, v]) => ({
      key,
      n: v.n,
      pf: v.loss === 0 ? (v.profit > 0 ? 3.2 : 0) : v.profit / v.loss,
      wr: v.n ? v.wins / v.n : 0,
      net: v.profit - v.loss,
    }))
    .sort((a, b) => b.net - a.net);
  return {
    ok: true,
    orders,
    income,
    realized: {
      n: pnl.length,
      wins: wins.length,
      pf: Number.isFinite(pf) ? pf : 0,
      wr: pnl.length ? wins.length / pnl.length : 0,
      net,
      ddt: ddtFromSeries(pnl.map((x) => ({ t: x.time, v: x.income }))),
      mdd,
    },
    bySymbol,
    at: Date.now(),
  };
}
