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
  closedNet: number;
  openNet: number;
  systemNet: number;
  foreignPos: number;
  foreignOrd: number;
  liveOwned: number;
  controlGap: number;
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

function bookWeight(book: ExchangeBook | null | undefined): number {
  if (!book?.ok) return -1;
  return book.positions.length * 100000 + book.orders.length;
}

function sessionBook(session: Record<string, unknown> | null, conn: string): ExchangeBook | null {
  if (!session) return null;
  const positions = Array.isArray(session.bookPos) ? (session.bookPos as ExchangeBook["positions"]) : [];
  const orders = Array.isArray(session.bookOrd) ? (session.bookOrd as ExchangeBook["orders"]) : [];
  if (!positions.length && !orders.length) return null;
  return {
    connId: str(session.conn, conn),
    ok: true,
    equity: num(session.equity),
    positions,
    orders,
    at: num(session.at),
    latencyMs: 0,
  };
}

/** Realized PF once the host has closes; otherwise the pinned progression PF. */
export function deskLivePf(live: { pf: number; trades: number; session: Record<string, unknown> | null }): number {
  const prog = live.session?.progression;
  const bag = prog && typeof prog === "object" ? (prog as { pf?: number; overall?: { pf?: number } }) : null;
  const fromProg = num(bag?.overall?.pf ?? bag?.pf);
  if (live.trades >= 4 && live.pf > 0) return live.pf;
  if (fromProg > 0) return fromProg;
  return live.pf;
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
  const conn = str(session?.conn, "bingx-vst-02");
  const fromSess = sessionBook(session, conn);
  const fromStore = store?.exchange?.ok ? store.exchange : null;
  const fromPay = payload?.exchange?.ok ? payload.exchange : null;
  const exchange =
    [fromSess, fromStore, fromPay].sort((a, b) => bookWeight(b) - bookWeight(a))[0] ??
    payload?.exchange ??
    store?.exchange ??
    null;
  const equity =
    exchange && exchange.equity > 0 ? exchange.equity : num(session?.equity, 0);
  const bookOcc = new Set((exchange?.positions ?? []).map((p) => p.symbol).filter(Boolean)).size;
  const sessBook = Array.isArray(session?.bookPos) ? (session.bookPos as { symbol?: string; side?: string }[]) : [];
  const sessOcc = new Set(sessBook.map((p) => p.symbol).filter(Boolean)).size;
  const livePos = Math.max(num(session?.livePos), exchange?.positions.length ?? 0, sessBook.length);
  const liveOrd = Math.max(num(session?.liveOrd), exchange?.orders.length ?? 0);
  const pingOk = Boolean(session?.pingOk || exchange?.ok);
  const occupied = num(session?.occupied) || bookOcc || sessOcc;
  const posRows = (exchange?.positions?.length ? exchange.positions : sessBook) as { side?: string }[];
  const liveLong = posRows.filter((p) => p.side === "long").length;
  const liveShort = posRows.filter((p) => p.side === "short").length;
  const network = str(session?.network, conn === "bingx-x01" ? "mainnet" : "testnet");
  const venueLabel = venueLabelFor(conn, network);
  return {
    session,
    overall,
    exchange,
    equity,
    pf: num(session?.livePf ?? session?.pf),
    wr: num(session?.wr),
    net: num(session?.systemNet ?? session?.net),
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
    closedNet: num(session?.closedNet),
    openNet: num(session?.openNet ?? session?.livePnl),
    systemNet: num(session?.systemNet ?? session?.net),
    foreignPos: num(session?.foreignPos),
    foreignOrd: num(session?.foreignOrd),
    liveOwned: num(session?.liveOwned, livePos),
    controlGap: num(session?.controlGap),
    at: num(session?.at, payload?.at ?? 0),
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
    a.closedNet === b.closedNet &&
    a.openNet === b.openNet &&
    a.systemNet === b.systemNet &&
    a.foreignPos === b.foreignPos &&
    a.foreignOrd === b.foreignOrd &&
    a.controlGap === b.controlGap &&
    a.lastMsg === b.lastMsg &&
    a.at === b.at &&
    a.overall === b.overall &&
    a.session === b.session &&
    a.exchange === b.exchange
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
