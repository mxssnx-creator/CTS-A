import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { ExchangeBook } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";
import { bindDeskScroll, restoreDeskScroll, saveDeskScroll } from "./scroll-pane";

export type LiveDeskPayload = {
  session: object | null;
  overall: object | null;
  exchange: ExchangeBook | null;
  at: number;
};

export type LiveNumbers = {
  session: Record<string, unknown> | null;
  overall: Record<string, unknown> | null;
  exchange: ExchangeBook | null;
  equity: number;
  pf: number;
  wr: number;
  net: number;
  trades: number;
  mdd: number;
  livePos: number;
  liveOrd: number;
  liveSl: number;
  liveTp: number;
  pingOk: boolean;
  latencyMs: number;
  elapsedMin: number;
  tactic: string;
  range: string;
  lastMsg: string;
  positive: boolean;
  occupied: number;
  slots: number;
  liveLong: number;
  liveShort: number;
  liveLevMin: number;
  liveLevMax: number;
  liveLevAvg: number;
  at: number;
  hasLive: boolean;
  conn: string;
  network: string;
  venueLabel: string;
};

export function venueLabelFor(conn?: string, network?: string): string {
  const id = String(conn || "");
  const net = String(network || "");
  if (id === "bingx-x01" || net === "mainnet") return "BingX Live-01";
  if (id === "bingx-vst-02") return "BingX VST-02";
  if (id === "bingx-vst-01") return "BingX VST-01";
  return net === "testnet" ? "BingX VST" : "BingX";
}

const LiveCtx = createContext<LiveDeskPayload | null>(null);

export function LiveDeskProvider({
  value,
  children,
}: {
  value: LiveDeskPayload | null;
  children: React.ReactNode;
}) {
  const hold = useRef(value);
  if (value && !hold.current) hold.current = value;
  return <LiveCtx.Provider value={hold.current}>{children}</LiveCtx.Provider>;
}

export function useLiveDesk() {
  return useContext(LiveCtx);
}

function num(v: unknown, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function str(v: unknown, d = "") {
  return typeof v === "string" && v ? v : d;
}

export function liveNumbers(
  payload: LiveDeskPayload | null | undefined,
  store?: {
    session: Record<string, unknown> | null;
    overall: Record<string, unknown> | null;
    exchange: ExchangeBook | null;
  },
): LiveNumbers {
  const storeSess = store?.session ?? null;
  const paySess = payload?.session ?? null;
  const storePos = num((storeSess as Record<string, unknown> | null)?.livePos);
  const payPos = num((paySess as Record<string, unknown> | null)?.livePos);
  const session = ((storePos >= payPos ? storeSess : paySess) ?? storeSess ?? paySess) as Record<string, unknown> | null;
  const storeOv = store?.overall ?? null;
  const payOv = payload?.overall ?? null;
  const overall = (storeOv ?? payOv) as Record<string, unknown> | null;
  const fetched =
    store?.exchange?.ok && store.exchange.positions.length > 0
      ? store.exchange
      : payload?.exchange?.ok && payload.exchange.positions.length > 0
        ? payload.exchange
        : null;
  const exchange = fetched ?? payload?.exchange ?? store?.exchange ?? null;
  const equity =
    fetched && fetched.equity > 0 ? fetched.equity : num(session?.equity, exchange?.equity ?? 0);
  const bookOcc = new Set((exchange?.positions ?? []).map((p) => p.symbol).filter(Boolean)).size;
  const sessBook = Array.isArray(session?.bookPos) ? (session.bookPos as { symbol?: string }[]) : [];
  const sessOcc = new Set(sessBook.map((p) => p.symbol).filter(Boolean)).size;
  const livePos =
    (fetched && fetched.positions.length > 0 ? fetched.positions.length : 0) ||
    num(session?.livePos) ||
    bookOcc ||
    sessOcc;
  const liveOrd =
    fetched && fetched.orders.length > 0 ? fetched.orders.length : num(session?.liveOrd);
  const pingOk = Boolean(session?.pingOk || exchange?.ok);
  const occupied = bookOcc || sessOcc || num(session?.occupied);
  const posRows = (exchange?.positions?.length ? exchange.positions : sessBook) as { side?: string }[];
  const liveLong = posRows.filter((p) => p.side === "long").length;
  const liveShort = posRows.filter((p) => p.side === "short").length;
  const conn = str(session?.conn, "bingx-x01");
  const network = str(session?.network, conn === "bingx-x01" ? "mainnet" : "testnet");
  const venueLabel = venueLabelFor(conn, network);
  return {
    session,
    overall,
    exchange,
    equity,
    pf: num(session?.livePf ?? session?.pf),
    wr: num(session?.wr),
    net: num(session?.net),
    trades: num(session?.trades),
    mdd: num(session?.mdd),
    livePos,
    liveOrd,
    liveSl: num(session?.liveSl),
    liveTp: num(session?.liveTp),
    pingOk,
    latencyMs: exchange?.latencyMs ?? 0,
    elapsedMin: num(session?.elapsedMin),
    tactic: str(session?.tactic, "hybrid"),
    range: str(session?.range, "atr"),
    lastMsg: str(session?.lastMsg, pingOk ? `${venueLabel} live` : "Waiting for host session"),
    positive: Boolean(session?.positive),
    occupied,
    slots: num(session?.slots) || livePos,
    liveLong,
    liveShort,
    liveLevMin: num(session?.liveLevMin),
    liveLevMax: num(session?.liveLevMax),
    liveLevAvg: num(session?.liveLevAvg),
    at: payload?.at ?? Date.now(),
    hasLive: Boolean(session || (exchange && exchange.ok)),
    conn,
    network,
    venueLabel,
  };
}

export function useLiveSnapshot(): LiveNumbers {
  const ctx = useLiveDesk();
  const session = useDesk((s) => s.liveSession);
  const overall = useDesk((s) => s.liveOverall);
  const exchange = useDesk((s) => s.exchange);
  useDesk((s) => s.liveMark);
  const next = liveNumbers(ctx, { session, overall, exchange });
  const hold = useRef(next);
  if (!sameSnap(hold.current, next)) hold.current = next;
  return hold.current;
}

function sameSnap(a: LiveNumbers, b: LiveNumbers) {
  return (
    a.equity === b.equity &&
    a.pf === b.pf &&
    a.wr === b.wr &&
    a.net === b.net &&
    a.trades === b.trades &&
    a.livePos === b.livePos &&
    a.liveOrd === b.liveOrd &&
    a.liveSl === b.liveSl &&
    a.liveTp === b.liveTp &&
    a.pingOk === b.pingOk &&
    a.positive === b.positive &&
    a.tactic === b.tactic &&
    a.range === b.range &&
    a.hasLive === b.hasLive &&
    a.occupied === b.occupied &&
    a.conn === b.conn &&
    a.network === b.network &&
    a.liveLevMax === b.liveLevMax &&
    a.liveLevMin === b.liveLevMin &&
    a.lastMsg === b.lastMsg
  );
}

export { bindDeskScroll, pinDeskScroll } from "./scroll-pane";
export function usePreserveScroll() {}

export function useDeskPaneScroll(pane: HTMLElement | null) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const prevPath = useRef(path);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    bindDeskScroll(pane);
    const save = () => {
      saveDeskScroll(path);
    };
    if (prevPath.current !== path) {
      restoreDeskScroll(path);
      prevPath.current = path;
    }
    const target: EventTarget = pane ?? window;
    target.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      target.removeEventListener("scroll", save);
    };
  }, [path, pane]);
}
