import { statSync } from "node:fs";
import type { ExchangeBook } from "./types.ts";
import { liveOverallCandidates, liveSessionCandidates, readLiveJson } from "./live-files.ts";

async function fetchJson(url: string, ms = 1800): Promise<Record<string, unknown> | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asRows<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function bookFromSession(session: Record<string, unknown> | null): ExchangeBook | null {
  if (!session) return null;
  const equity = Number(session.equity ?? 0);
  const pingOk = Boolean(session.pingOk || session.liveOk);
  if (!(equity > 0) && !pingOk) return null;
  const positions = asRows<ExchangeBook["positions"][number]>(session.bookPos);
  const orders = asRows<ExchangeBook["orders"][number]>(session.bookOrd);
  return {
    connId: String(session.conn || session.activeConnId || "bingx-vst-02"),
    ok: pingOk || equity > 0,
    equity: Number.isFinite(equity) ? equity : 0,
    positions,
    orders,
    at: Date.now(),
    latencyMs: 0,
  };
}

function freshness(s: Record<string, unknown> | null) {
  if (!s) return -1;
  const at = Number(s.at ?? 0);
  const elapsed = Number(s.elapsedMin ?? 0);
  const trades = Number(s.trades ?? 0);
  const pos = Number(s.livePos ?? 0);
  return Math.max(at, elapsed * 60_000, trades * 1_000 + pos);
}

function pickFresher(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
) {
  return freshness(a) >= freshness(b) ? a : b;
}

function fileAgeMs(path: string) {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return 1e12;
  }
}

/** Host VST session + overall stats. Prefer a fresh local file; otherwise pull remote. */
export async function readLiveDesk() {
  const statusPath = process.env.CTS_A_STATUS || "/var/lib/cts-a/vst-session-x02.json";
  const localSession = readLiveJson(liveSessionCandidates());
  const localOverall = readLiveJson(liveOverallCandidates());
  const localFresh = Boolean(localSession?.pingOk) && fileAgeMs(statusPath) < 20_000;
  let remoteSession: Record<string, unknown> | null = null;
  let remoteOverall: Record<string, unknown> | null = null;
  if (!localFresh) {
    const remoteBase = (process.env.CTS_A_REMOTE || "http://152.53.114.112:3202").replace(/\/$/, "");
    [remoteSession, remoteOverall] = await Promise.all([
      fetchJson(`${remoteBase}/live-session.json`, 2200),
      fetchJson(`${remoteBase}/overall-stats.json`, 2200),
    ]);
  }
  const session = pickFresher(remoteSession, localSession);
  const overall = pickFresher(remoteOverall, localOverall);
  const exchange = bookFromSession(session);
  return {
    session: session as object | null,
    overall: overall as object | null,
    exchange,
    at: Date.now(),
  };
}
