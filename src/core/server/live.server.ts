// Live stage executor (BingX perpetual swap, self-contained client in ../exchange). Own CTSB tags only, so other
// sessions on the same account (e.g. CTSA) never see these tickets as theirs and this adapter never touches theirs.
//
// Safety:
//  - one live step at a time (module mutex); abandoned when the runtime generation changes (stop / watchdog)
//  - every request has a timeout; an entry is recorded as `pending` BEFORE it is sent, so a hung / retried
//    cycle can never send the same intent twice
//  - size never exceeds the configured notional (entry skipped if the exchange minimum is larger)
//  - SL/TP are priced from a fresh ticker; if protection cannot be placed, the position is closed at market
//  - own stop/target orders left behind on a flat symbol are cancelled
import type { CoreRuntime, LiveIntent } from "./runtime.server.ts";
import * as bx from "../exchange/bingx.server.ts";
import { isOwnCoid, liveNetwork, makeCoid, ownSymbols, planLive, type BookView } from "./live.ts";

export interface LiveStatus {
  at: number;
  enabled: boolean;
  reason: string;
  placed: number;
  closed: number;
  cancelled: number;
  skipped: Array<{ sym: string; why: string }>;
  error: string | null;
}

let running: Promise<LiveStatus> | null = null;

/** Serialised entry point: overlapping calls wait for the running step instead of racing it. */
export function stepLive(rt: CoreRuntime, intents: LiveIntent[], gen: number): Promise<LiveStatus> {
  const next = (running ?? Promise.resolve(null as unknown as LiveStatus)).then(() => runStep(rt, intents, gen));
  running = next.finally(() => {
    if (running === next) running = null;
  });
  return next;
}

async function runStep(rt: CoreRuntime, intents: LiveIntent[], gen: number): Promise<LiveStatus> {
  const s = rt.settings.live;
  const status: LiveStatus = { at: Date.now(), enabled: false, reason: "", placed: 0, closed: 0, cancelled: 0, skipped: [], error: null };
  const alive = () => rt.generation === gen;
  const record = (coid: string, cfg: string, sym: string, side: number, kind: string, qty: number, px: number, st: string, key: string) =>
    rt.db.run(
      "INSERT OR REPLACE INTO live_orders (coid, cfg, sym, side, kind, qty, px, status, msg, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      coid, cfg, sym, side, kind, qty, px, st, key, Date.now(),
    );
  try {
    const network = liveNetwork(s.connId);
    const keys = bx.keysFor(s.connId);
    const hasKeys = !!(keys.apiKey && keys.secret);
    const envArmed = process.env.CTS_CORE_LIVE === "1";
    let book: BookView | null = null;
    if (s.enabled && envArmed && hasKeys) {
      try {
        book = await bx.fetchBook(network, s.connId);
      } catch (err) {
        rt.db.event("warn", `live book: ${err instanceof Error ? err.message : err}`);
      }
    }
    const sim = rt.sim;
    const minPf = rt.settings.gates.minPf;
    const ready = !sim
      ? { ok: false, why: "no simulated run yet" }
      : sim.stats.pf < minPf || !sim.stable
        ? { ok: false, why: `simulated run PF ${sim.stats.pf.toFixed(2)} (min ${minPf})${sim.stable ? "" : ", not stable"}` }
        : { ok: true, why: "" };
    const dayAgo = Date.now() - 24 * 3_600_000;
    const recent = new Set(rt.db.all<{ sym: string }>("SELECT DISTINCT sym FROM live_orders WHERE kind = 'E' AND status IN ('ok', 'pending') AND at > ?", dayAgo).map((r) => r.sym));
    const own = book ? ownSymbols(book, s.connId, recent) : new Set<string>();
    // every intent ever recorded (pending, ok or error) is never sent again
    const sent = new Set(rt.db.all<{ k: string }>("SELECT msg AS k FROM live_orders WHERE kind = 'E'").map((r) => r.k));
    const plan = planLive({
      ready,
      settings: s,
      envArmed,
      hasKeys,
      book,
      ownSyms: own,
      sent,
      newestBarT: rt.status.lastBarT,
      intents: intents.map((i) => ({ cfg: i.cfg, sym: i.sym, side: i.side, tp: i.protect.tp, sl: i.protect.sl, barT: i.barT })),
    });
    status.enabled = plan.enabled;
    status.reason = plan.reason;
    status.skipped = plan.skipped;
    if (!plan.enabled || !book) return status;

    // clean-up: own stop/target orders on symbols that are flat now
    for (const o of book.orders) {
      if (!alive()) break;
      if (!isOwnCoid(o.clientOrderId, s.connId)) continue;
      if (!o.id || book.positions.some((p) => p.venueSymbol === o.venueSymbol)) continue;
      if (await bx.cancelOrder(network, s.connId, o.venueSymbol, o.id)) status.cancelled++;
    }

    if (!plan.entries.length || !alive()) return status;
    const specs = await bx.fetchContracts(network);
    const fresh = new Map((await rt.freshTickers()).map((t) => [t.sym, t.last]));
    for (const e of plan.entries) {
      if (!alive()) break;
      const spec = specs.get(e.sym) ?? null;
      const px = fresh.get(e.sym) ?? 0;
      if (!(px > 0)) {
        status.skipped.push({ sym: e.sym, why: "no fresh price" });
        continue;
      }
      const minNotional = bx.exchangeMinNotional(spec, px);
      if (minNotional > s.notionalUsd) {
        status.skipped.push({ sym: e.sym, why: `exchange minimum $${minNotional.toFixed(2)} > notional $${s.notionalUsd}` });
        continue;
      }
      const qty = bx.snapQtyDown(s.notionalUsd / px, spec);
      if (!(qty > 0) || qty * px > s.notionalUsd * 1.0001) {
        status.skipped.push({ sym: e.sym, why: "size rounds outside the notional cap" });
        continue;
      }
      const side = e.side === 1 ? "BUY" : "SELL";
      const exitSide = e.side === 1 ? "SELL" : "BUY";
      const positionSide = e.side === 1 ? "LONG" : "SHORT";
      const key = `${e.cfg}|${e.sym}|${e.barT}`;
      const coid = makeCoid(s.connId, "E");
      record(coid, e.cfg, e.sym, e.side, "E", qty, px, "pending", key);
      try {
        await bx.signed(network, s.connId, "POST", "/openApi/swap/v2/trade/order", { symbol: e.sym, side, positionSide, type: "MARKET", quantity: qty, clientOrderID: coid });
        record(coid, e.cfg, e.sym, e.side, "E", qty, px, "ok", key);
        status.placed++;
      } catch (err) {
        record(coid, e.cfg, e.sym, e.side, "E", qty, px, "error", key);
        rt.db.event("error", `live entry ${e.sym}: ${err instanceof Error ? err.message : err}`);
        continue;
      }
      const sl = bx.snapPx(e.side === 1 ? px * (1 - e.sl) : px * (1 + e.sl), spec);
      const tp = bx.snapPx(e.side === 1 ? px * (1 + e.tp) : px * (1 - e.tp), spec);
      let protectedOk = true;
      for (const [kind, type, stopPrice] of [["S", "STOP_MARKET", sl], ["T", "TAKE_PROFIT_MARKET", tp]] as const) {
        const c = makeCoid(s.connId, kind);
        try {
          await bx.signed(network, s.connId, "POST", "/openApi/swap/v2/trade/order", {
            symbol: e.sym, side: exitSide, positionSide, type, stopPrice, closePosition: "true", workingType: "MARK_PRICE", clientOrderID: c,
          });
          record(c, e.cfg, e.sym, e.side, kind, qty, stopPrice, "ok", key);
        } catch (err) {
          protectedOk = false;
          record(c, e.cfg, e.sym, e.side, kind, qty, stopPrice, "error", key);
          rt.db.event("error", `live ${kind} ${e.sym}: ${err instanceof Error ? err.message : err}`);
        }
      }
      if (!protectedOk) {
        // never leave an unprotected position: close it at market (own qty only)
        const c = makeCoid(s.connId, "C");
        try {
          await bx.signed(network, s.connId, "POST", "/openApi/swap/v2/trade/order", { symbol: e.sym, side: exitSide, positionSide, type: "MARKET", quantity: qty, clientOrderID: c });
          record(c, e.cfg, e.sym, e.side, "C", qty, px, "ok", key);
          status.closed++;
        } catch (err) {
          record(c, e.cfg, e.sym, e.side, "C", qty, px, "error", key);
          rt.db.event("error", `live protective close ${e.sym} FAILED: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }
  rt.db.kvSet("liveStatus", status);
  return status;
}
