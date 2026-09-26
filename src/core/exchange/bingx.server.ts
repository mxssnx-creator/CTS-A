// Self-contained BingX perpetual-swap client for the Live stage (signing, contracts, book, orders).
// Keys come only from the host environment:
//   bingx-x01     BINGX_X01_API_KEY / BINGX_X01_SECRET          (mainnet)
//   bingx-vst-01  BINGX_V01_API_KEY / BINGX_V01_SECRET          (testnet)
//   bingx-vst-02  BINGX_X02_API_KEY / BINGX_X02_SECRET          (testnet)
import { createHmac } from "node:crypto";

export type Network = "mainnet" | "testnet";
export type ConnId = "bingx-x01" | "bingx-vst-01" | "bingx-vst-02";

export const HOSTS: Record<Network, readonly string[]> = {
  mainnet: ["https://open-api.bingx.com", "https://open-api.bingx.pro"],
  testnet: ["https://open-api-vst.bingx.com", "https://open-api-vst.bingx.pro"],
};

const TIMEOUT_MS = 10_000;
const env = (k: string) => (process.env[k] ?? "").trim();

export function keysFor(conn: ConnId): { apiKey: string; secret: string } {
  const slot = conn === "bingx-x01" ? "X01" : conn === "bingx-vst-02" ? "X02" : "V01";
  return { apiKey: env(`BINGX_${slot}_API_KEY`), secret: env(`BINGX_${slot}_SECRET`) };
}

export function signedUrl(base: string, path: string, secret: string, params: Record<string, string | number>): string {
  const keys = Object.keys(params).sort();
  const canonical = keys.map((k) => `${k}=${params[k]}`).join("&");
  const signature = createHmac("sha256", secret).update(canonical).digest("hex");
  const q = keys
    .map((k) => {
      const v = String(params[k]);
      return `${k}=${/[{}"\s,]/.test(v) ? encodeURIComponent(v) : v}`;
    })
    .join("&");
  return `${base}${path}?${q}&signature=${signature}`;
}

async function timedFetch(url: string, init: RequestInit = {}): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Signed request; throws with BingX's message on a non-zero code. */
export async function signed(network: Network, conn: ConnId, method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const { apiKey, secret } = keysFor(conn);
  if (!apiKey || !secret) throw new Error(`no API keys for ${conn}`);
  const url = signedUrl(HOSTS[network][0], path, secret, { ...params, recvWindow: 5000, timestamp: Date.now() });
  const body = (await timedFetch(url, { method, headers: { "X-BX-APIKEY": apiKey } })) as { code?: number; msg?: string; data?: unknown };
  if (body?.code !== 0) throw new Error(body?.msg || `BingX ${body?.code}`);
  return body.data;
}

export interface ContractSpec {
  symbol: string;
  minQty: number;
  step: number;
  qtyPrec: number;
  pxPrec: number;
  minUsdt: number;
}

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

let contracts: { at: number; network: Network; map: Map<string, ContractSpec> } | null = null;
export async function fetchContracts(network: Network): Promise<Map<string, ContractSpec>> {
  if (contracts && contracts.network === network && Date.now() - contracts.at < 600_000) return contracts.map;
  const map = new Map<string, ContractSpec>();
  for (const host of HOSTS[network]) {
    try {
      const body = (await timedFetch(`${host}/openApi/swap/v2/quote/contracts`)) as { data?: Array<Record<string, unknown>> };
      for (const r of body?.data ?? []) {
        const symbol = String(r.symbol ?? "");
        if (!symbol) continue;
        const qtyPrec = n(r.quantityPrecision);
        const step = n(r.size) || 10 ** -Math.max(0, qtyPrec);
        map.set(symbol, {
          symbol,
          qtyPrec,
          step: step > 0 ? step : 1,
          minQty: Math.max(n(r.tradeMinQuantity), n(r.tradeMinVolume), n(r.minQty), step, 0),
          pxPrec: n(r.pricePrecision),
          minUsdt: Math.max(n(r.tradeMinUSDT), n(r.minNotional), 0) || 2,
        });
      }
      if (map.size) break;
    } catch {
      /* next host */
    }
  }
  contracts = { at: Date.now(), network, map };
  return map;
}

/** Floor to the lot step (never larger than qty). */
export function snapQtyDown(qty: number, spec?: ContractSpec | null): number {
  if (!(qty > 0)) return 0;
  if (!spec) return qty;
  const q = Math.floor(qty / spec.step + 1e-12) * spec.step;
  return Number(Math.max(0, q).toFixed(Math.max(0, spec.qtyPrec)));
}

export function snapPx(px: number, spec?: ContractSpec | null): number {
  if (!(px > 0)) return 0;
  return Number(px.toFixed(Math.max(0, Math.min(8, spec?.pxPrec ?? 4))));
}

export function exchangeMinNotional(spec: ContractSpec | null | undefined, px: number): number {
  return Math.max(spec?.minUsdt ?? 2, (spec?.minQty ?? 0) * Math.max(px, 0));
}

export interface BookPosition {
  symbol: string;
  venueSymbol: string;
  side: "long" | "short";
  qty: number;
}
export interface BookOrder {
  id: string;
  symbol: string;
  venueSymbol: string;
  clientOrderId?: string;
}

/** Positions and open orders of the account (all of them — ownership is decided by the planner). */
export async function fetchBook(network: Network, conn: ConnId): Promise<{ positions: BookPosition[]; orders: BookOrder[] }> {
  const [posRaw, ordRaw] = await Promise.all([
    signed(network, conn, "GET", "/openApi/swap/v2/user/positions"),
    signed(network, conn, "GET", "/openApi/swap/v2/trade/openOrders"),
  ]);
  const posRows = (Array.isArray(posRaw) ? posRaw : ((posRaw as { positions?: unknown[] })?.positions ?? [])) as Array<Record<string, unknown>>;
  const positions: BookPosition[] = [];
  for (const r of posRows) {
    const venueSymbol = String(r.symbol ?? "");
    const qty = Math.abs(n(r.positionAmt ?? r.availableAmt ?? r.positionQty ?? r.volume));
    if (!venueSymbol || !(qty > 0)) continue;
    const ps = String(r.positionSide ?? "").toUpperCase();
    positions.push({ symbol: venueSymbol.replace("-", ""), venueSymbol, side: ps === "SHORT" ? "short" : "long", qty });
  }
  const ordRows = (Array.isArray(ordRaw) ? ordRaw : ((ordRaw as { orders?: unknown[] })?.orders ?? [])) as Array<Record<string, unknown>>;
  const orders: BookOrder[] = ordRows
    .filter((r) => r.symbol)
    .map((r) => ({
      id: String(r.orderId ?? r.orderID ?? ""),
      symbol: String(r.symbol).replace("-", ""),
      venueSymbol: String(r.symbol),
      clientOrderId: String(r.clientOrderID ?? r.clientOrderId ?? r.clientOid ?? "").trim() || undefined,
    }));
  return { positions, orders };
}

export async function cancelOrder(network: Network, conn: ConnId, venueSymbol: string, orderId: string): Promise<boolean> {
  try {
    await signed(network, conn, "DELETE", "/openApi/swap/v2/trade/order", { symbol: venueSymbol, orderId });
    return true;
  } catch {
    return false;
  }
}
