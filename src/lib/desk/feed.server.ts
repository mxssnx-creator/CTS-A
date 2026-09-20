import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  BINGX_SYMBOL,
  deskIdFromVenue,
  LIVE_IDS,
  MIN_SIZE_RATIO,
  clientOrderKindOf,
  isDeskClientOrderId,
  makeClientOrderId,
  type AccountPing,
  type FeedSnapshot,
  type LiveOrderResult,
  type LiveTicker,
} from "./feed.ts";
import type { ExchangeBook, ExchangeOrder, ExchangePosition, Side } from "./types.ts";
import { profitFactor } from "./engine.ts";

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

/** Exchange-safe minimum stop distance. VST demo may go to 0.2%. */
export const MIN_LIVE_SL_PCT = 0.008;
export const MIN_LIVE_SL_PCT_VST = 0.002;
export const MAX_LIVE_SL_PCT = 0.025;
export const MAX_LIVE_SL_PCT_VST = 0.02;

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
        const parsedLev = Math.max(
          num(r.maxLongLeverage),
          num(r.maxShortLeverage),
          num(r.maxLeverage),
          num(r.leverage),
          num(r.tradeMaxLeverage),
          num(r.maxLvg),
        );
        const maxLev = parsedLev > 0 ? parsedLev : 0;
        map.set(symbol, {
          symbol,
          minQty,
          step: step > 0 ? step : 1,
          qtyPrec,
          pxPrec: num(r.pricePrecision),
          minUsdt: minUsdt > 0 ? minUsdt : 2,
          maxLeverage: maxLev > 0 ? Math.max(1, Math.round(maxLev)) : undefined,
        });
      }
      if (map.size) break;
    } catch {
      /* next host */
    }
  }
  loadLeverageCaps();
  for (const v of levQueryCache.values()) {
    if (!v.row.symbol || !(v.row.max > 0)) continue;
    const spec = map.get(v.row.symbol);
    if (spec) spec.maxLeverage = Math.max(spec.maxLeverage || 0, v.row.max);
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
  leverage: 0,
  minSizeRatio: MIN_SIZE_RATIO,
};

export function configureLiveExecution(p: Partial<LiveExecConfig>) {
  liveExec = {
    hedgeMode: p.hedgeMode ?? liveExec.hedgeMode,
    marginMode: p.marginMode === "isolated" ? "isolated" : p.marginMode === "cross" ? "cross" : liveExec.marginMode,
    useMaxLeverage: true,
    leverage: 0,
    minSizeRatio: Math.min(2, Math.max(1, Number(p.minSizeRatio ?? liveExec.minSizeRatio) || liveExec.minSizeRatio)),
  };
}

/** BingX max if known, else 125 only as a last-resort floor — never a target. */
export function maxLeverageOf(spec?: ContractSpec | null): number {
  const n = Math.round(Number(spec?.maxLeverage) || 0);
  return n > 0 ? n : 125;
}

export type SymbolLeverage = {
  symbol: string;
  long: number;
  short: number;
  maxLong: number;
  maxShort: number;
  max: number;
};

const levQueryCache = new Map<string, { at: number; row: SymbolLeverage }>();
const LEV_QUERY_TTL = 6 * 60 * 60_000;
const LEV_CAPS_FILE = process.env.CTS_A_LEV_CAPS || "/var/lib/cts-a/leverage-caps.json";
let levCapsLoaded = false;
let lastLevSave = 0;

function levCapKey(network: string, connId: string | undefined, venue: string) {
  return `${network}:${connId ?? ""}:${venue}`;
}

function stampSpecMax(venue: string, max: number) {
  if (!(max > 0) || !contractCache?.map.has(venue)) return;
  const spec = contractCache.map.get(venue);
  if (spec) spec.maxLeverage = Math.max(spec.maxLeverage || 0, max);
}

export function loadLeverageCaps(): number {
  if (levCapsLoaded) return levQueryCache.size;
  levCapsLoaded = true;
  try {
    const raw = JSON.parse(readFileSync(LEV_CAPS_FILE, "utf8")) as { at?: number; caps?: Record<string, SymbolLeverage> };
    const caps = raw.caps && typeof raw.caps === "object" ? raw.caps : {};
    for (const [k, v] of Object.entries(caps)) {
      if (!v || !(Number(v.max) > 0)) continue;
      const row: SymbolLeverage = {
        symbol: String(v.symbol || k.split(":").pop() || ""),
        long: Math.max(0, Math.round(Number(v.long) || 0)),
        short: Math.max(0, Math.round(Number(v.short) || 0)),
        maxLong: Math.max(0, Math.round(Number(v.maxLong) || 0)),
        maxShort: Math.max(0, Math.round(Number(v.maxShort) || 0)),
        max: Math.max(0, Math.round(Number(v.max) || 0)),
      };
      levQueryCache.set(k, { at: Number(raw.at) || Date.now(), row });
      if (row.symbol) stampSpecMax(row.symbol, row.max);
    }
  } catch {
    /* first run / no persist */
  }
  return levQueryCache.size;
}

function saveLeverageCaps() {
  if (Date.now() - lastLevSave < 4000) return;
  lastLevSave = Date.now();
  try {
    const caps: Record<string, SymbolLeverage> = {};
    for (const [k, v] of levQueryCache) caps[k] = v.row;
    mkdirSync(dirname(LEV_CAPS_FILE), { recursive: true });
    writeFileSync(LEV_CAPS_FILE, JSON.stringify({ at: Date.now(), caps }));
  } catch {
    /* preview */
  }
}

export function cachedMaxLeverage(network: string, connId: string | undefined, venue: string, spec?: ContractSpec | null): number {
  loadLeverageCaps();
  const hit = levQueryCache.get(levCapKey(network, connId, venue));
  return pickMaxLeverage(spec, hit?.row ?? null);
}

export function pickMaxLeverage(
  spec?: ContractSpec | null,
  queried?: { max?: number; maxLong?: number; maxShort?: number; maxLongLeverage?: number; maxShortLeverage?: number } | null,
): number {
  const q = Math.max(
    Number(queried?.max) || 0,
    Number(queried?.maxLong) || 0,
    Number(queried?.maxShort) || 0,
    Number(queried?.maxLongLeverage) || 0,
    Number(queried?.maxShortLeverage) || 0,
  );
  if (q > 0) return Math.round(q);
  return maxLeverageOf(spec);
}

export function parsePositionLeverage(r: Record<string, unknown>): number {
  const n = Math.round(num(r.leverage ?? r.positionLeverage ?? r.initialLeverage));
  return n > 0 ? n : 0;
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
  force?: boolean;
  currentLong?: number;
  currentShort?: number;
}): Promise<string | null> {
  loadLeverageCaps();
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
  const q = await querySymbolLeverage(input.network, input.connId, venue);
  const known = Boolean((q && q.max > 0) || (Number(input.spec?.maxLeverage) > 0));
  const lev = pickMaxLeverage(input.spec, q);
  if (!known || !(lev > 0)) {
    notes.push(`lev wait ${venue}`);
    return notes.length ? notes.slice(0, 4).join(" · ") : null;
  }
  const sides = liveExec.hedgeMode ? (["LONG", "SHORT"] as const) : (["BOTH"] as const);
  for (const side of sides) {
    const cur =
      side === "SHORT"
        ? (input.currentShort ?? q?.short ?? 0)
        : side === "LONG"
          ? (input.currentLong ?? q?.long ?? 0)
          : Math.min(input.currentLong ?? q?.long ?? 0, input.currentShort ?? q?.short ?? 0);
    const lk = `${venue}:${side}:${lev}`;
    if (cur >= lev && lev > 0) {
      levArmed.add(lk);
      continue;
    }
    if (!input.force && levArmed.has(lk)) continue;
    const r = await signedTrade(input.network, input.connId, "/openApi/swap/v2/trade/leverage", {
      symbol: venue,
      side,
      leverage: lev,
    });
    if (r.ok) {
      levArmed.add(lk);
      if (q) {
        if (side === "SHORT" || side === "BOTH") q.short = lev;
        if (side === "LONG" || side === "BOTH") q.long = lev;
      }
    }
    if (r.error && /100410|frequency limit/i.test(r.error)) notes.push(`lev ${r.error}`);
    else notes.push(r.ok ? `lev ${side} ${cur || 0}→${lev}x` : `lev ${r.error}`);
    if (r.error && /100410|frequency limit/i.test(r.error)) break;
  }
  return notes.length ? notes.slice(0, 4).join(" · ") : null;
}

export async function armMaxLeverage(
  input: {
    network: "mainnet" | "testnet";
    connId?: string;
    symbols: string[];
    current?: Record<string, number>;
  },
): Promise<{ n: number; max: number; raised: number; notes: string[]; paused?: boolean }> {
  loadLeverageCaps();
  const map = await fetchContractMap(input.network);
  const notes: string[] = [];
  let n = 0;
  let max = 0;
  let raised = 0;
  let paused = false;
  const conc = 2;
  for (let i = 0; i < input.symbols.length; i += conc) {
    if (paused) break;
    const chunk = input.symbols.slice(i, i + conc);
    const out = await Promise.all(
      chunk.map(async (id) => {
        const venue = BINGX_SYMBOL[id] ?? (id.includes("-") ? id : `${id.replace(/USDT$/i, "")}-USDT`);
        const spec = map.get(venue) ?? { symbol: venue, minQty: 0, step: 1, qtyPrec: 0, pxPrec: 4, minUsdt: 2 };
        const curLong = Number(input.current?.[`${id}:long`] ?? input.current?.[`${deskIdFromVenue(venue)}:long`] ?? 0);
        const curShort = Number(input.current?.[`${id}:short`] ?? input.current?.[`${deskIdFromVenue(venue)}:short`] ?? 0);
        const capHint = cachedMaxLeverage(input.network, input.connId, venue, spec);
        const force = (curLong > 0 && curLong < capHint) || (curShort > 0 && curShort < capHint);
        const msg = await ensureLiveAccountMode({
          network: input.network,
          connId: input.connId,
          venueSymbol: venue,
          spec,
          force,
          currentLong: curLong || undefined,
          currentShort: curShort || undefined,
        });
        const cap = cachedMaxLeverage(input.network, input.connId, venue, spec);
        return { msg, cap, raised: Boolean(msg && /→/.test(msg)), paused: Boolean(msg && /100410|frequency limit/i.test(msg)) };
      }),
    );
    for (const row of out) {
      n += 1;
      max = Math.max(max, row.cap);
      if (row.raised) raised += 1;
      if (row.msg) notes.push(row.msg);
      if (row.paused) paused = true;
    }
    if (i + conc < input.symbols.length) await new Promise((r) => setTimeout(r, 280));
  }
  saveLeverageCaps();
  return { n, max, raised, notes: notes.slice(0, 8), paused };
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
  return /100410|109418|110424|frequency limit|disabled period|too many request|rate limit|over 20|over 30/i.test(String(msg || ""));
}

export function liveProtectPrices(
  entry: number,
  side: Side,
  slAtr = 1.05,
  tpRatio = 2.6,
  spec?: ContractSpec | null,
  mode: "vst" | "main" = "vst",
): { sl: number; tp: number; slPct: number; tpPct: number } {
  const px = Math.max(entry, 1e-12);
  const tick = spec?.pxPrec != null ? Math.pow(10, -Math.max(0, spec.pxPrec)) : px * 1e-4;
  const minSlPct = mode === "vst" ? MIN_LIVE_SL_PCT_VST : MIN_LIVE_SL_PCT;
  const maxSlPct = mode === "vst" ? MAX_LIVE_SL_PCT_VST : MAX_LIVE_SL_PCT;
  const slPct0 = Math.min(maxSlPct, Math.max(minSlPct, Math.max(0.2, slAtr) * 0.01));
  const r = Math.min(3, Math.max(0.4, Number(tpRatio) || 1));
  const minTpPct = mode === "vst" ? MIN_LIVE_SL_PCT_VST : 0.006;
  let slPct = slPct0;
  let tpPct = slPct * r;
  if (tpPct < minTpPct) {
    tpPct = minTpPct;
    slPct = Math.max(slPct, r > 0 ? tpPct / r : slPct);
  }
  slPct = Math.min(maxSlPct, Math.max(minSlPct, slPct));
  tpPct = Math.min(0.06, Math.max(minTpPct, tpPct));
  const minSl = Math.max(px * slPct, tick * 3);
  const minTp = Math.max(px * tpPct, tick * 4);
  let slRaw = side === "long" ? px * (1 - slPct) : px * (1 + slPct);
  let tpRaw = side === "long" ? px * (1 + tpPct) : px * (1 - tpPct);
  if (side === "long") {
    slRaw = Math.min(slRaw, px - minSl);
    tpRaw = Math.max(tpRaw, px + minTp);
  } else {
    slRaw = Math.max(slRaw, px + minSl);
    tpRaw = Math.min(tpRaw, px - minTp);
  }
  let sl = snapPx(slRaw, spec);
  let tp = snapPx(tpRaw, spec);
  if (side === "long") {
    if (!(sl < px)) sl = snapPx(px - minSl, spec);
    if (!(tp > px)) tp = snapPx(px + minTp, spec);
  } else {
    if (!(sl > px)) sl = snapPx(px + minSl, spec);
    if (!(tp < px)) tp = snapPx(px - minTp, spec);
  }
  return { sl, tp, slPct, tpPct };
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

const vol1hCache = new Map<string, { v: number; at: number }>();

function klineRange(row: unknown): number {
  if (!row) return 0;
  if (Array.isArray(row)) {
    const high = num(row[2]);
    const low = num(row[3]);
    const close = num(row[4]) || num(row[1]);
    if (close > 0 && high > 0 && low > 0) return Math.max(0, (high - low) / close);
    return 0;
  }
  const o = row as { high?: string | number; low?: string | number; close?: string | number; highPrice?: string | number; lowPrice?: string | number };
  const high = num(o.high ?? o.highPrice);
  const low = num(o.low ?? o.lowPrice);
  const close = num(o.close);
  if (close > 0 && high > 0 && low > 0) return Math.max(0, (high - low) / close);
  return 0;
}

export async function fetchVol1h(network: "mainnet" | "testnet"): Promise<Map<string, number>> {
  const now = Date.now();
  const fresh = [...vol1hCache.values()].filter((x) => now - x.at < 180_000);
  if (fresh.length >= 20) {
    const out = new Map<string, number>();
    for (const [id, x] of vol1hCache) if (now - x.at < 180_000 && x.v > 0) out.set(id, x.v);
    return out;
  }
  const hosts = HOSTS[network];
  const host = hosts[0]!;
  const ids = [...LIVE_IDS];
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      if (!id) break;
      const vs = BINGX_SYMBOL[id];
      if (!vs) continue;
      for (const path of [
        `${host}/openApi/swap/v3/quote/klines?symbol=${encodeURIComponent(vs)}&interval=1h&limit=1`,
        `${host}/openApi/swap/v2/quote/klines?symbol=${encodeURIComponent(vs)}&interval=1h&limit=1`,
      ]) {
        try {
          const out = await getJson(path);
          const body = out.json as { code?: number; data?: unknown };
          const rows = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
          const v = klineRange(rows[rows.length - 1] ?? rows[0]);
          if (v > 0) {
            vol1hCache.set(id, { v, at: Date.now() });
            break;
          }
        } catch {
          /* next path */
        }
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  const out = new Map<string, number>();
  for (const [id, x] of vol1hCache) if (x.v > 0) out.set(id, x.v);
  return out;
}

export function cachedVol1h(id: string): number {
  const x = vol1hCache.get(id);
  if (!x || Date.now() - x.at > 400_000) return 0;
  return x.v;
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
          range1h: cachedVol1h(id) || undefined,
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
  exactQty?: boolean;
  slAtr?: number;
  tpRatio?: number;
  attachProtect?: boolean;
  equity?: number;
  clientOrderId?: string;
}): Promise<LiveOrderResult> {
  if (!input.confirmLive) return { ok: false, error: "Live confirm required" };
  const { apiKey, secret } = resolveKeys(input.connId, input.apiKey, input.secret);
  if (!apiKey || !secret) return { ok: false, error: "API key and secret required" };
  if (!input.closePosition && !input.exactQty && !(Number.isFinite(input.notional) && input.notional >= 0)) return { ok: false, error: "Invalid notional" };
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

  let qty = input.quantity;
  let usedNotional = input.notional;
  if (input.closePosition || input.exactQty) {
    qty = input.quantity > 0 ? snapQtyDown(input.quantity, spec) : 0;
    usedNotional = qty * Math.max(px, 1e-8);
  } else if (input.type === "MARKET" && !input.closePosition) {
    const resolved = await resolveLiveQty(input.network, venueSymbol, Math.max(px, 1e-8), input.notional, ratio);
    qty = resolved.qty;
    usedNotional = resolved.notional;
  } else if (!input.closePosition && !input.exactQty) {
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
  if (!input.closePosition && !input.exactQty) {
    const floor = liftQtyToMin(qty, spec, Math.max(px, 1e-8), ratio);
    if (floor.qty > qty) {
      qty = floor.qty;
      usedNotional = floor.notional;
    }
    const eq = Number(input.equity) || 0;
    if (eq > 0 && (minFloor > eq * 0.45 || usedNotional > eq * 0.5)) {
      return { ok: false, error: "Insufficient margin" };
    }
  }
  if (!(qty > 0) && !input.closePosition && !input.exactQty) {
    const floor = liftQtyToMin(0, spec, Math.max(px, 1e-8), ratio);
    qty = floor.qty;
    usedNotional = floor.notional;
  }
  if (!(qty > 0) && !input.closePosition) return { ok: false, error: "Quantity below exchange minimum" };

  if (!input.closePosition) {
    await ensureLiveAccountMode({ network: input.network, connId: input.connId, venueSymbol, spec });
  }

  const post = async (sendQty: number, withProtect = true): Promise<LiveOrderResult> => {
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
    } else if (input.type === "MARKET" && !input.closePosition && input.attachProtect !== false && withProtect) {
      const ref = px > 0 ? px : sendQty > 0 ? usedNotional / sendQty : 0;
      if (ref > 0) {
        const prot = liveProtectPrices(ref, protectSide, input.slAtr ?? 1.05, input.tpRatio ?? 2.6, spec, input.network === "mainnet" ? "main" : "vst");
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
    const tagged =
      input.clientOrderId && isDeskClientOrderId(input.clientOrderId, input.connId)
        ? input.clientOrderId
        : makeClientOrderId(input.connId, clientOrderKindOf(input.type, input.closePosition));
    params.clientOrderID = tagged;
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

  let result = await post(qty, true);
  const protectBad = (err?: string) =>
    /TP Price|SL Price|stopPrice|takeProfit|Order Price|Last Price|must be (greater|lower|above|below)/i.test(String(err || ""));
  if (!result.ok && protectBad(result.error) && !input.closePosition) {
    result = await post(qty, false);
  }
  if (isRateLimitedMsg(result.error)) return result;
  if (!result.ok && isMinSizeError(result.error) && !input.closePosition) {
    const eq = Number(input.equity) || 0;
    for (const mul of [1.25, 1.5, 2]) {
      const bump = liftQtyToMin(qty, spec, Math.max(px, 1e-8), execRatio() * mul);
      if (!(bump.qty > qty)) continue;
      if (eq > 0 && bump.notional > Math.max(eq * 0.35, minFloor)) break;
      result = await post(bump.qty, true);
      if (!result.ok && protectBad(result.error)) result = await post(bump.qty, false);
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

export function parseOpenOrderRow(r: Record<string, unknown>, connId: string): ExchangeOrder | null {
  const venueSymbol = String(r.symbol ?? "");
  if (!venueSymbol) return null;
  const symbol = deskIdFromVenue(venueSymbol) ?? venueSymbol.replace("-", "");
  const orig = num(r.origQty ?? r.quantity ?? r.qty);
  const filled = num(r.executedQty ?? r.filledQty ?? r.cumQty ?? r.filled);
  const remaining = orig > 0 ? Math.max(0, orig - filled) : Math.max(0, orig);
  const rawStatus = String(r.status ?? "open");
  const status = filled > 1e-12 && remaining > 1e-12 ? "partial" : rawStatus;
  const clientOrderId = String(r.clientOrderID ?? r.clientOrderId ?? r.clientOid ?? "").trim();
  return {
    connId,
    id: String(r.orderId ?? r.orderID ?? r.id ?? `${symbol}:${r.type}:${r.positionSide}:${r.stopPrice}`),
    symbol,
    venueSymbol,
    side: asSide(String(r.positionSide ?? ""), String(r.side ?? "")),
    qty: orig > 0 ? orig : remaining + filled,
    filled,
    remaining,
    price: num(r.price ?? r.avgPrice),
    stopPrice: num(r.stopPrice ?? r.triggerPrice),
    status,
    type: String(r.type ?? "LIMIT"),
    closePosition: r.closePosition === true || r.closePosition === "true",
    reduceOnly: r.reduceOnly === true || r.reduceOnly === "true",
    clientOrderId: clientOrderId || undefined,
    owned: isDeskClientOrderId(clientOrderId, connId),
  };
}

async function signedJson(
  network: "mainnet" | "testnet",
  connId: string,
  path: string,
  extra?: Record<string, string | number>,
): Promise<{ ok: boolean; data?: unknown; ms: number; error?: string }> {
  const { apiKey, secret } = resolveKeys(connId, undefined, undefined);
  if (!apiKey || !secret) return { ok: false, ms: 0, error: "API key and secret required" };
  let last = "request failed";
  let ms = 0;
  for (const host of HOSTS[network]) {
    try {
      const params = { recvWindow: 5000, timestamp: Date.now(), ...(extra ?? {}) };
      const url = signedUrl(host, path, secret, params);
      const out = await getJson(url, { headers: { "X-BX-APIKEY": apiKey } });
      ms = out.ms;
      const body = out.json as { code?: number; msg?: string; data?: unknown };
      if (body?.code === 0) return { ok: true, data: body.data, ms };
      last = String(body?.msg || `BingX ${body?.code ?? out.status}`);
    } catch (err) {
      last = err instanceof Error ? err.message : "request failed";
    }
  }
  return { ok: false, ms, error: last };
}

export async function querySymbolLeverage(
  network: "mainnet" | "testnet",
  connId: string | undefined,
  venueSymbol: string,
  opts?: { fresh?: boolean },
): Promise<SymbolLeverage | null> {
  loadLeverageCaps();
  const venue = venueSymbol;
  if (!venue) return null;
  const ck = levCapKey(network, connId, venue);
  const hit = levQueryCache.get(ck);
  if (!opts?.fresh && hit && Date.now() - hit.at < LEV_QUERY_TTL) return hit.row;
  const res = await signedJson(network, connId ?? "", "/openApi/swap/v2/trade/leverage", { symbol: venue });
  if (!res.ok || !res.data || typeof res.data !== "object") return hit?.row ?? null;
  const d = res.data as Record<string, unknown>;
  const row: SymbolLeverage = {
    symbol: venue,
    long: Math.max(0, Math.round(num(d.longLeverage))),
    short: Math.max(0, Math.round(num(d.shortLeverage))),
    maxLong: Math.max(0, Math.round(num(d.maxLongLeverage))),
    maxShort: Math.max(0, Math.round(num(d.maxShortLeverage))),
    max: 0,
  };
  row.max = pickMaxLeverage(null, row);
  levQueryCache.set(ck, { at: Date.now(), row });
  stampSpecMax(venue, row.max);
  saveLeverageCaps();
  return row;
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

  const [ping, posRes, ordRes] = await Promise.all([
    pingAccount({ apiKey, secret, network: input.network, connId: input.connId }),
    signedJson(input.network, input.connId, "/openApi/swap/v2/user/positions"),
    signedJson(input.network, input.connId, "/openApi/swap/v2/trade/openOrders"),
  ]);
  const ms = Math.max(ping.latencyMs || 0, posRes.ms || 0, ordRes.ms || 0);

  let positions: ExchangePosition[] = [];
  if (posRes.ok) {
    const raw = Array.isArray(posRes.data)
      ? posRes.data
      : Array.isArray((posRes.data as { positions?: unknown[] } | null)?.positions)
        ? ((posRes.data as { positions: unknown[] }).positions)
        : [];
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
        leverage: parsePositionLeverage(r) || undefined,
      });
    }
  }

  let orders: ExchangeOrder[] = [];
  let ordErr = "";
  if (ordRes.ok) {
    const data = ordRes.data as { orders?: unknown[] } | unknown[] | null;
    const rawOrd = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [];
    for (const row of rawOrd) {
      const parsed = parseOpenOrderRow(row as Record<string, unknown>, input.connId);
      if (parsed) orders.push(parsed);
    }
  } else {
    ordErr = String(ordRes.error || "");
  }

  if (!posRes.ok && positions.length === 0) {
    return { ...empty, latencyMs: ms, error: posRes.error || ping.error || "book fetch fail", ok: false };
  }
  return {
    connId: input.connId,
    ok: true,
    equity: ping.equity ?? 0,
    positions,
    orders,
    at: Date.now(),
    latencyMs: ms,
    error: ordErr || (!ping.ok ? ping.error : undefined),
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
            info: String(r.clientOrderId ?? r.clientOrderID ?? r.clientOid ?? ""),
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
  const ourTagged = orders.filter((o) => isDeskClientOrderId(o.info, input.connId));
  const ourSym = new Set(ourTagged.map((o) => o.symbol).filter(Boolean));
  const otherSym = new Set(
    orders
      .filter((o) => isDeskClientOrderId(o.info) && !isDeskClientOrderId(o.info, input.connId))
      .map((o) => o.symbol)
      .filter((s) => s && !ourSym.has(s)),
  );
  const pnl = income.filter((x) => {
    if (x.type !== "REALIZED_PNL") return false;
    if (since && x.time < since) return false;
    if (otherSym.has(x.symbol)) return false;
    return true;
  });
  const wins = pnl.filter((x) => x.income > 0);
  const profit = wins.reduce((s, x) => s + x.income, 0);
  const loss = Math.abs(pnl.filter((x) => x.income < 0).reduce((s, x) => s + x.income, 0));
  const net = profit - loss;
  const pf = profitFactor(profit, loss);
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
      wins: v.wins,
      profit: v.profit,
      loss: v.loss,
      pf: profitFactor(v.profit, v.loss),
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
