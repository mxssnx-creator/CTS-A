// Live stage executor (BingX perpetual swap). Uses the desk's signing helpers but its OWN CTSB tags, so the
// existing CTSA sessions never see these tickets as theirs and this adapter never touches theirs.
import type { CoreRuntime, LiveIntent } from "./runtime.server.ts";
import { liveNetwork, makeCoid, planLive, type BookView } from "./live.ts";

export interface LiveStatus {
  at: number;
  enabled: boolean;
  reason: string;
  placed: number;
  skipped: Array<{ sym: string; why: string }>;
  error: string | null;
}

async function signedPost(network: "mainnet" | "testnet", connId: string, path: string, params: Record<string, string | number>) {
  const { HOSTS, resolveKeys, signedUrl } = await import("../../lib/desk/feed.server.ts");
  const { apiKey, secret } = resolveKeys(connId, undefined, undefined);
  const url = signedUrl(HOSTS[network][0], path, secret, { ...params, recvWindow: 5000, timestamp: Date.now() });
  const res = await fetch(url, { method: "POST", headers: { "X-BX-APIKEY": apiKey } });
  const body = (await res.json()) as { code?: number; msg?: string; data?: unknown };
  if (body.code !== 0) throw new Error(body.msg || `BingX ${body.code ?? res.status}`);
  return body.data;
}

export async function stepLive(rt: CoreRuntime, intents: LiveIntent[]): Promise<LiveStatus> {
  const s = rt.settings.live;
  const status: LiveStatus = { at: Date.now(), enabled: false, reason: "", placed: 0, skipped: [], error: null };
  try {
    const feed = await import("../../lib/desk/feed.server.ts");
    const network = liveNetwork(s.connId);
    const keys = feed.resolveKeys(s.connId, undefined, undefined);
    const hasKeys = !!(keys.apiKey && keys.secret);
    const envArmed = process.env.CTS_CORE_LIVE === "1";
    let book: BookView | null = null;
    if (s.enabled && envArmed && hasKeys) {
      const b = await feed.fetchExchangeBook({ network, connId: s.connId });
      if (b.ok) book = { positions: b.positions, orders: b.orders };
    }
    const own = rt.db.all<{ sym: string }>("SELECT DISTINCT sym FROM live_orders WHERE kind = 'E' AND status = 'ok'");
    const ownSyms = new Set(own.map((r) => r.sym).filter((sym) => book?.positions.some((p) => p.venueSymbol === sym)));
    const sent = new Set(rt.db.all<{ k: string }>("SELECT msg AS k FROM live_orders WHERE kind = 'E'").map((r) => r.k));
    const sim = rt.sim;
    const minPf = rt.settings.gates.minPf;
    const ready = !sim
      ? { ok: false, why: "no simulated run yet" }
      : sim.stats.pf < minPf || !sim.stable
        ? { ok: false, why: `simulated run PF ${sim.stats.pf.toFixed(2)} (min ${minPf})${sim.stable ? "" : ", not stable"}` }
        : { ok: true, why: "" };
    const plan = planLive({
      ready,
      settings: s,
      envArmed,
      hasKeys,
      book,
      ownSyms,
      sent,
      intents: intents.map((i) => ({ cfg: i.cfg, sym: i.sym, side: i.side, tp: i.protect.tp, sl: i.protect.sl, barT: i.barT })),
    });
    status.enabled = plan.enabled;
    status.reason = plan.reason;
    status.skipped = plan.skipped;
    if (!plan.enabled) return status;
    const specs = await feed.fetchContractMap(network);
    for (const e of plan.entries) {
      const spec = specs.get(e.sym) ?? null;
      const tick = rt.tickers.find((t) => t.sym === e.sym);
      const px = tick?.last ?? 0;
      if (!(px > 0)) continue;
      const qty = feed.snapQty(Math.max(s.notionalUsd, feed.exchangeMinNotional(spec, px)) / px, spec);
      const side = e.side === 1 ? "BUY" : "SELL";
      const exitSide = e.side === 1 ? "SELL" : "BUY";
      const positionSide = e.side === 1 ? "LONG" : "SHORT";
      const key = `${e.cfg}|${e.sym}|${e.barT}`;
      const coid = makeCoid(s.connId, "E");
      try {
        await signedPost(network, s.connId, "/openApi/swap/v2/trade/order", { symbol: e.sym, side, positionSide, type: "MARKET", quantity: qty, clientOrderID: coid });
        rt.db.run("INSERT INTO live_orders (coid, cfg, sym, side, kind, qty, px, status, msg, at) VALUES (?, ?, ?, ?, 'E', ?, ?, 'ok', ?, ?)", coid, e.cfg, e.sym, e.side, qty, px, key, Date.now());
        status.placed++;
        const sl = feed.snapPx(e.side === 1 ? px * (1 - e.sl) : px * (1 + e.sl), spec);
        const tp = feed.snapPx(e.side === 1 ? px * (1 + e.tp) : px * (1 - e.tp), spec);
        for (const [kind, type, stopPrice] of [["S", "STOP_MARKET", sl], ["T", "TAKE_PROFIT_MARKET", tp]] as const) {
          const c = makeCoid(s.connId, kind);
          try {
            await signedPost(network, s.connId, "/openApi/swap/v2/trade/order", {
              symbol: e.sym, side: exitSide, positionSide, type, stopPrice, closePosition: "true", workingType: "MARK_PRICE", clientOrderID: c,
            });
            rt.db.run("INSERT INTO live_orders (coid, cfg, sym, side, kind, qty, px, status, msg, at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)", c, e.cfg, e.sym, e.side, kind, qty, stopPrice, key, Date.now());
          } catch (err) {
            rt.db.event("error", `live ${kind} ${e.sym}: ${err instanceof Error ? err.message : err}`);
          }
        }
      } catch (err) {
        rt.db.run("INSERT INTO live_orders (coid, cfg, sym, side, kind, qty, px, status, msg, at) VALUES (?, ?, ?, ?, 'E', ?, ?, 'error', ?, ?)", coid, e.cfg, e.sym, e.side, qty, px, key, Date.now());
        rt.db.event("error", `live entry ${e.sym}: ${err instanceof Error ? err.message : err}`);
      }
    }
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }
  rt.db.kvSet("liveStatus", status);
  return status;
}
