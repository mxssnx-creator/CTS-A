#!/usr/bin/env node
/**
 * CTS-A BingX VST-02 session: 50 symbols, max orders, best-first, 2h monitor.
 * Keys from env — never printed.
 */
import { writeFileSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { fetchBingxTape, pingAccount, keysForConn, placeSwapOrder, fetchExchangeBook, liveProtectPrices, fetchContractMap, snapQty, snapQtyDown, liftQtyToMin, parseAvailableUsdt, fetchLiveExecutions, cancelSwapOrder, configureLiveExecution, ensureLiveAccountMode } from "../src/lib/desk/feed.server.ts";
import { applyLiveTape } from "../src/lib/desk/feed.ts";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, positionNotional } from "../src/lib/desk/engine.ts";
import {
  auditEngine,
  healEngine,
  haltEngine,
  initVstEngine,
  requeueFree,
  armUniverse,
  resetSession,
  simulateHours,
  tickVst,
  bookCounts,
  VST_MAX_SYMBOLS,
  VST_TICK_MS,
  adjustActiveBlocks,
  overallLiveStats,
  overlayExchangeBook,
  sweepAllConfigs,
  sweepPlaybooks,
  completeComputationsAsync,
} from "../src/lib/desk/vst.ts";

const HOURS = Number(process.env.CTS_A_VST_HOURS ?? 12);
const STATUS = process.env.CTS_A_STATUS ?? "/var/lib/cts-a/vst-session.json";
const SETTINGS = process.env.CTS_A_SETTINGS ?? "/var/lib/cts-a/desk-settings.json";
const OVERALL = process.env.CTS_A_OVERALL ?? "/var/lib/cts-a/overall-stats.json";
const TICK_MS = Number(process.env.CTS_A_TICK_MS ?? VST_TICK_MS);
const CONN = process.env.CTS_A_CONN ?? "bingx-vst-02";
const NETWORK_PREF = process.env.CTS_A_NETWORK === "mainnet" || CONN === "bingx-x01" ? "mainnet" : "testnet";
const LIVE_MAX_POS = Number(process.env.CTS_A_LIVE_MAX_POS ?? 100);
const LIVE_MIN_PF = Number(process.env.CTS_A_LIVE_MIN_PF ?? 1.85);
let lastBook = { pos: 0, ord: 0, pnl: 0, ok: false, sl: 0, tp: 0, equity: 0, positions: [], orders: [] };
const bookAvg = { pos: 0, ord: 0, n: 0 };
let cachedOverall = null;
let cachedOverallTick = -1;
let lastOverallWrite = 0;

const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  endStageOnly: false,
  cadence: 6,
  flattenConflict: false,
  addOnWin: true,
  maxMultiple: 2,
  minMultiple: 1,
  overall: true,
  counts: [1, 2],
  volumeRatio: 1.25,
  maxVolumeMultiplier: 2.25,
  pfRatio: 1.45,
  pauseCountRatio: 2,
  evalPosCount: 12,
  activeLive: true,
  minActiveLevel: 0,
};

const GRID = [
  {
    tactic: "hybrid",
    range: "fibonacci",
    cfg: { ...DEFAULT_TACTIC_CONFIG, trailingPct: 0.8, tpRatio: 2.75, dcaCount: 1, slAtr: 1.15, maxHoldTicks: 20000, maxHoldBars: 8 },
  },
  {
    tactic: "hybrid",
    range: "atr",
    cfg: { ...DEFAULT_TACTIC_CONFIG, trailingPct: 0.8, tpRatio: 2.75, dcaCount: 1, slAtr: 1.15, maxHoldTicks: 20000, maxHoldBars: 8 },
  },
  {
    tactic: "hybrid",
    range: "volume",
    cfg: { ...DEFAULT_TACTIC_CONFIG, trailingPct: 0.8, tpRatio: 2.75, dcaCount: 1, slAtr: 1.15, maxHoldTicks: 20000, maxHoldBars: 8 },
  },
  {
    tactic: "trailing",
    range: "fibonacci",
    cfg: { ...DEFAULT_TACTIC_CONFIG, trailingPct: 0.8, tpRatio: 2.75, dcaCount: 1, slAtr: 1.15, maxHoldTicks: 20000, maxHoldBars: 8 },
  },
  {
    tactic: "axis",
    range: "atr",
    cfg: { ...DEFAULT_TACTIC_CONFIG, trailingPct: 0.8, tpRatio: 2.75, dcaCount: 1, axisLevels: 5, slAtr: 1.15, maxHoldTicks: 20000, maxHoldBars: 8 },
  },
];

function applyTape(e, tickers) {
  applyLiveTape(e, tickers);
  return tickers.filter((t) => t.last > 0 && e.quotes[t.id]).map((t) => t.id);
}

function pickFromSweep() {
  return GRID[0];
}

function gridIndex(pick) {
  const i = GRID.findIndex((g) => g.tactic === pick.tactic && g.range === pick.range);
  return i < 0 ? 0 : i;
}

function snapshot(e, extra) {
  const audit = e.tick % 40 === 0 ? auditEngine(e) : { nanCount: 0, issues: [] };
  const book = bookCounts(e);
  if (!cachedOverall || e.tick - cachedOverallTick >= 8) {
    cachedOverall = overallLiveStats(e);
    cachedOverallTick = e.tick;
  }
  const overall = overlayExchangeBook(structuredClone(cachedOverall), lastBook, e);
  const last12 = overall.lastN?.["12"] ?? null;
  const winnerPf = Number(e.completeWinner?.pf);
  const winnerWr = Number(e.completeWinner?.wr);
  const tapeReady = e.ledger.trades >= 12 && Number(e.stats.pf) > 0;
  const rawLive = last12?.n && last12.pf > 0 ? last12.pf : Number.isFinite(winnerPf) && winnerPf > 0 ? winnerPf : e.stats.pf;
  const rawPf = tapeReady ? e.stats.pf : Number.isFinite(winnerPf) && winnerPf > 0 ? winnerPf : e.stats.pf;
  const clampPf = (v, n) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x <= 0) return 0;
    if ((n || 0) < 5 && x > 5) return 5;
    return Math.min(x, 20);
  };
  const livePf = clampPf(rawLive, last12?.n ?? e.ledger.trades);
  const pf = clampPf(rawPf, tapeReady ? e.ledger.trades : last12?.n ?? 0);
  const net = Number.isFinite(lastBook.pnl) ? lastBook.pnl : e.stats.net;
  const wr = tapeReady ? e.stats.wr : Number(last12?.wr || winnerWr || e.stats.wr);
  const tapeThin = !tapeReady;
  const positive = Number.isFinite(livePf) && livePf >= 1 && (tapeThin || ((last12?.net ?? net) >= -0.05 && ((last12?.wr ?? wr) >= 0.36 || livePf >= 1.5)));
  return {
    ...extra,
    pf,
    wr,
    net,
    mdd: e.stats.mdd,
    trades: e.ledger.trades,
    wins: e.ledger.wins,
    slots: lastBook.pos || book.positions.slots,
    legs: lastBook.pos || (lastBook.positions ?? []).length,
    long: (lastBook.positions ?? []).filter((p) => p.side === "long").length,
    short: (lastBook.positions ?? []).filter((p) => p.side === "short").length,
    working: book.orders.working,
    queued: book.orders.queued,
    placed: book.orders.placed,
    filled: book.orders.filled,
    liveOrders: book.orders.live,
    symbols: e.symbolCount,
    occupied: new Set((lastBook.positions ?? []).map((p) => p.symbol).filter(Boolean)).size || book.positions.symbols,
    heal: e.healCount ?? 0,
    lastMsg: e.lastMsg,
    positive,
    nan: audit.nanCount,
    issues: audit.issues.slice(0, 6),
    conn: e.activeConnId,
    livePos: lastBook.pos || (lastBook.positions ?? []).length,
    liveOrd: lastBook.ord,
    livePnl: lastBook.pnl,
    liveOk: lastBook.ok,
    liveSl: lastBook.sl,
    liveTp: lastBook.tp,
    liveOwned: (lastBook.positions ?? []).filter((p) => mirrored.has(`own:${p.symbol}:${p.side}`) || mirrored.has(`live:${p.symbol}:${p.side}`)).length,
    owned: [...mirrored].filter((k) => typeof k === "string" && (k.startsWith("own:") || k.startsWith("live:") || k.startsWith("seed:"))),
    closedNet: e.ledger.profit - e.ledger.loss,
    avgLivePos: bookAvg.n ? bookAvg.pos / bookAvg.n : lastBook.pos,
    avgLiveOrd: bookAvg.n ? bookAvg.ord / bookAvg.n : lastBook.ord,
    overall,
    livePf,
    last12,
    phase: e.phase,
    sessionPhase: extra.sessionPhase ?? e.phase,
    bookPos: lastBook.positions ?? [],
    bookOrd: lastBook.orders ?? [],
    lastApi: lastApiError,
    at: Date.now(),
    tick: e.tick,
  };
}

function writeSettingsPick(pick, extra = {}) {
  const body = {
    v: 1,
    at: Date.now(),
    rev: extra.rev ?? Date.now() % 1e9,
    tactic: pick.tactic,
    rangeType: pick.range,
    tacticConfig: { ...pick.cfg },
    blockConfig: BLOCK,
    symbolCount: VST_MAX_SYMBOLS,
    orderType: "limit",
    lastN: 10,
    lastNs: { picks: 10, lanes: 10, last: 10, ongoing: 10, next: 10, combos: 10 },
    lastNLinked: true,
    costStep: 10,
    liveTape: true,
    comboOnlyPositive: true,
    comboTactic: "all",
    comboRange: "all",
    enabledKinds: ["normal", "trend", "mean", "breakout", "volume", "hybrid", "active", "block"],
    strategyId: "normal",
    thresholds: { minPf: 1.85, maxMdd: 0.12, minWr: 0.55, minVf: 1.12, maxDdt: 18 },
    activeConnId: CONN,
    evalHours: [4, 8, 16],
    evalLastNs: [5, 10, 15],
    sessionPhase: extra.sessionPhase ?? "running",
    hedgeMode: true,
    marginMode: "cross",
    useMaxLeverage: true,
    leverage: 125,
    minSizeRatio: 1.08,
    ...extra,
  };
  try {
    mkdirSync("/var/lib/cts-a", { recursive: true });
    writeFileSync(SETTINGS, JSON.stringify(body, null, 2));
  } catch {
    writeFileSync("/tmp/cts-a-desk-settings.json", JSON.stringify(body, null, 2));
  }
}

function readSettingsPick() {
  try {
    return JSON.parse(readFileSync(SETTINGS, "utf8"));
  } catch {
    try {
      return JSON.parse(readFileSync("/tmp/cts-a-desk-settings.json", "utf8"));
    } catch {
      return null;
    }
  }
}

function writeStatus(s) {
  try {
    mkdirSync("/var/lib/cts-a", { recursive: true });
    const body = JSON.stringify(s);
    const tmp = `${STATUS}.${process.pid}.tmp`;
    writeFileSync(tmp, body);
    try {
      renameSync(tmp, STATUS);
    } catch {
      writeFileSync(STATUS, body);
    }
    const now = Date.now();
    if (now - lastOverallWrite > 45000) {
      lastOverallWrite = now;
      let prev = {};
      try {
        prev = JSON.parse(readFileSync(OVERALL, "utf8"));
      } catch {
        prev = {};
      }
      const next = {
        ...prev,
        live: s.overall ?? null,
        at: now,
        tactic: s.tactic,
        range: s.range,
        pf: s.pf,
        wr: s.wr,
        net: s.net,
        trades: s.trades,
      };
      writeFileSync(OVERALL, JSON.stringify(next));
    }
  } catch {
    writeFileSync("/tmp/cts-a-vst-session.json", JSON.stringify(s));
  }
}

let lastStatusAt = 0;
function wantStatus(force) {
  if (!force && Date.now() - lastStatusAt < 2000) return false;
  lastStatusAt = Date.now();
  return true;
}

function isRateLimited(s) {
  return /100410|109418|frequency limit|disabled period|too many request|rate limit|over 20/i.test(String(s || ""));
}

function quietMs(s) {
  return /109418|480000|over 20/i.test(String(s || "")) ? 480_000 : 120_000;
}

async function pingVst() {
  const keys = keysForConn(CONN);
  if (!keys.apiKey || !keys.secret) return { network: NETWORK_PREF, pingOk: false, equity: 0, error: "no keys" };
  const first = await pingAccount({ ...keys, network: NETWORK_PREF, connId: CONN });
  if (first.ok) return { network: NETWORK_PREF, pingOk: true, equity: first.equity ?? 0 };
  const err = String(first.error || "");
  if (isRateLimited(err)) {
    apiQuietUntil = Math.max(apiQuietUntil || 0, Date.now() + quietMs(err));
  }
  if (NETWORK_PREF === "mainnet") return { network: "mainnet", pingOk: false, equity: 0, error: err };
  const live = await pingAccount({ ...keys, network: "mainnet", connId: CONN });
  if (live.ok) return { network: "mainnet", pingOk: true, equity: live.equity ?? 0 };
  return { network: NETWORK_PREF, pingOk: false, equity: 0, error: err };
}

const mirrored = new Set();
let liveBusy = 0;
let liveLast = 0;
let claimed = false;
let emptyHold = 0;
let apiQuietUntil = 0;
let lastApiError = "";
const cancelFailed = new Set();
const skipUntil = new Map();
const skippedFills = new Set();
const trimHits = new Map();
function sizeNotional(equity) {
  const eq = Math.max(0, Number(equity) || 0);
  return Math.max(eq * 0.002, 1);
}

function liveMaxPos() {
  return LIVE_MAX_POS;
}

function apiQuiet() {
  return Date.now() < apiQuietUntil;
}

function isBenignApi(s) {
  return /position not exist|order not exist|order filled|nothing to cancel|no need to cancel|min notional exceeds|TP Price|SL Price|offline currently|must be (greater|lower)|timeout/i.test(String(s || ""));
}

function noteApiFail(err) {
  const s = String(err?.error || err?.message || err || "");
  if (isBenignApi(s)) return false;
  if (s) lastApiError = s.slice(0, 180);
  if (isRateLimited(s)) {
    apiQuietUntil = Math.max(apiQuietUntil, Date.now() + quietMs(s));
    return true;
  }
  return false;
}

function noteApiOk() {
  lastApiError = "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label} timeout`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(t));
}

async function withLiveBusy(fn) {
  liveBusy += 1;
  try {
    return await fn();
  } finally {
    liveBusy = Math.max(0, liveBusy - 1);
  }
}

async function closeHit(network, hit) {
  return withLiveBusy(() =>
    placeSwapOrder({
      network,
      connId: CONN,
      symbol: hit.symbol,
      side: hit.side === "long" ? "SELL" : "BUY",
      positionSide: hit.side === "long" ? "LONG" : "SHORT",
      quantity: hit.qty,
      type: "MARKET",
      price: hit.mark || hit.entry || 1,
      notional: Math.max(6, Math.abs(hit.qty * (hit.mark || hit.entry || 1))),
      confirmLive: true,
      closePosition: true,
      attachProtect: false,
    }),
  );
}

async function ensureProtect(network, book, cfg) {
  if (apiQuiet()) return null;
  const slAtr = Number(cfg?.slAtr) || 1.05;
  const tpRatio = Number(cfg?.tpRatio) || 2.5;
  const hasSl = new Set();
  const hasTp = new Set();
  const grouped = new Map();
  const kindOf = (t) => {
    const u = String(t || "").toUpperCase();
    if (u.includes("STOP") && !u.includes("TAKE_PROFIT") && !u.includes("TRAILING")) return "sl";
    if (u.includes("TAKE_PROFIT") || u.includes("TRAILING")) return "tp";
    return "";
  };
  for (const o of book.orders ?? []) {
    const key = `${o.symbol}:${o.side}`;
    const k = kindOf(o.type);
    if (!k) continue;
    if (k === "sl") hasSl.add(key);
    else hasTp.add(key);
    const cur = grouped.get(key) ?? { sl: [], tp: [] };
    cur[k].push(o);
    grouped.set(key, cur);
  }
  lastBook.sl = (book.positions ?? []).filter((p) => (grouped.get(`${p.symbol}:${p.side}`)?.sl || []).some((o) => !o.closePosition)).length;
  lastBook.tp = (book.positions ?? []).filter((p) => (grouped.get(`${p.symbol}:${p.side}`)?.tp || []).some((o) => !o.closePosition)).length;
  const occupied = new Set((book.positions ?? []).map((p) => `${p.symbol}:${p.side}`));
  const posQty = new Map((book.positions ?? []).map((p) => [`${p.symbol}:${p.side}`, p.qty]));
  const owned = (book.positions ?? []).filter((p) => {
    const key = `${p.symbol}:${p.side}`;
    return mirrored.has(`own:${key}`) || mirrored.has(`live:${key}`);
  });
  const missing = owned.filter((p) => {
    const key = `${p.symbol}:${p.side}`;
    const g = grouped.get(key) ?? { sl: [], tp: [] };
    const slOk = (g.sl || []).some((o) => !o.closePosition);
    const tpOk = (g.tp || []).some((o) => !o.closePosition);
    return !slOk || !tpOk;
  });
  const groupedClose = [...grouped.values()].some((g) =>
    (g.sl || []).some((o) => o.closePosition) || (g.tp || []).some((o) => o.closePosition),
  );
  const extras = [...grouped.entries()].some(([, g]) => (g.sl?.length ?? 0) > 1 || (g.tp?.length ?? 0) > 1);
  const stray = [...grouped.keys()].some((key) => !occupied.has(key) && (mirrored.has(`own:${key}`) || mirrored.has(`live:${key}`) || mirrored.has(`sl:${key}`) || mirrored.has(`tp:${key}`)));
  if (!missing.length && !extras && !stray && !groupedClose) return null;
  const map = await fetchContractMap(network);
  for (const [key, g] of grouped) {
    if (!occupied.has(key) && (mirrored.has(`own:${key}`) || mirrored.has(`live:${key}`) || mirrored.has(`sl:${key}`) || mirrored.has(`tp:${key}`))) {
      const stray = g.sl[0] || g.tp[0];
      if (stray?.id && !cancelFailed.has(String(stray.id))) {
        const r = await withLiveBusy(() =>
          cancelSwapOrder({
            network,
            connId: CONN,
            symbol: stray.venueSymbol || stray.symbol,
            orderId: String(stray.id),
          }),
        );
        if (r.ok) {
          mirrored.delete(`sl:${key}`);
          mirrored.delete(`tp:${key}`);
          return `cancel stray ${stray.symbol}`;
        }
        cancelFailed.add(String(stray.id));
        noteApiFail(r);
      }
    }
    const want = posQty.get(key) ?? 0;
    for (const kind of ["sl", "tp"]) {
      const list = g[kind];
      if (!list || list.length <= 1) continue;
      const tk = `${key}:${kind}`;
      if ((trimHits.get(tk) || 0) >= 2) continue;
      list.sort((a, b) => Math.abs((a.qty || 0) - want) - Math.abs((b.qty || 0) - want));
      const extra = list[list.length - 1];
      const extraId = String(extra?.id || "");
      if (!extraId || cancelFailed.has(extraId)) continue;
      const r = await withLiveBusy(() =>
        cancelSwapOrder({
          network,
          connId: CONN,
          symbol: extra.venueSymbol || extra.symbol,
          orderId: extraId,
        }),
      );
      if (r.ok) {
        trimHits.set(tk, (trimHits.get(tk) || 0) + 1);
        return `trim ${kind} ${extra.symbol}`;
      }
      cancelFailed.add(extraId);
      noteApiFail(r);
    }
  }
  let ungrouped = 0;
  for (const [key, g] of grouped) {
    if (ungrouped >= 8) break;
    if (!occupied.has(key)) continue;
    for (const kind of ["sl", "tp"]) {
      for (const o of g[kind] || []) {
        if (!o.closePosition) continue;
        const oid = String(o.id || "");
        if (!oid || cancelFailed.has(oid)) continue;
        const r = await withLiveBusy(() =>
          cancelSwapOrder({
            network,
            connId: CONN,
            symbol: o.venueSymbol || o.symbol,
            orderId: oid,
          }),
        );
        if (r.ok) {
          ungrouped += 1;
          if (kind === "sl") hasSl.delete(key);
          else hasTp.delete(key);
          mirrored.delete(`${kind}:${key}`);
        } else {
          cancelFailed.add(oid);
          noteApiFail(r);
        }
        if (ungrouped >= 8) break;
      }
    }
  }
  const notes = [];
  if (ungrouped) notes.push(`ungroup ${ungrouped}`);
  let posts = 0;
  for (const p of book.positions ?? []) {
    if (posts >= 16) break;
    const key = `${p.symbol}:${p.side}`;
    if (!mirrored.has(`own:${key}`) && !mirrored.has(`live:${key}`)) continue;
    const px = p.mark || p.entry || 0;
    if (!(px > 0) || !(p.qty > 0)) continue;
    const spec = map.get(p.venueSymbol);
    const prot = liveProtectPrices(px, p.side, slAtr, tpRatio, spec);
    const protectQty = (availUsdt = 0) => {
      let q = p.qty;
      if (availUsdt > 0 && px > 0) q = Math.min(q, (availUsdt * 0.99) / px);
      q = snapQtyDown(q, spec);
      if (!(q > 0)) q = snapQtyDown(p.qty, spec);
      return q;
    };
    const placeProtect = async (type, qty) => {
      const body = {
        network,
        connId: CONN,
        symbol: p.symbol,
        side: p.side === "long" ? "SELL" : "BUY",
        positionSide: p.side === "long" ? "LONG" : "SHORT",
        quantity: qty,
        type,
        price: px,
        stopPrice: type === "STOP_MARKET" ? prot.sl : prot.tp,
        notional: Math.max(1, qty * px),
        confirmLive: true,
        slAtr,
        tpRatio,
        attachProtect: false,
        closePosition: false,
        reduceOnly: true,
      };
      let r = await withLiveBusy(() => placeSwapOrder(body));
      if (!r.ok && /closePosition|reduceOnly|quantity/i.test(String(r.error || ""))) {
        r = await withLiveBusy(() => placeSwapOrder({ ...body, closePosition: true, reduceOnly: true }));
      }
      return r;
    };
    const attach = async (kind, type, tag) => {
      let qty = protectQty();
      if (!(qty > 0) && !(p.qty > 0)) return `${kind} skip ${p.symbol} qty`;
      mirrored.add(tag);
      let r = await placeProtect(type, qty);
      posts += 1;
      if (!r.ok && parseAvailableUsdt(r.error) > 0) {
        qty = protectQty(parseAvailableUsdt(r.error));
        r = await placeProtect(type, qty > 0 ? qty : 0);
        posts += 1;
      }
      if (!r.ok && /available amount|quantity/i.test(String(r.error || ""))) {
        r = await placeProtect(type, 0);
        posts += 1;
      }
      if (!r.ok) {
        mirrored.delete(tag);
        noteApiFail(r);
        return `${kind} skip ${p.symbol} ${String(r.error ?? "err").slice(0, 80)}`;
      }
      return `${kind} ${p.symbol}`;
    };
    if (!hasSl.has(key)) {
      notes.push(await attach("sl", "STOP_MARKET", `sl:${key}`));
      if (posts >= 16) break;
    }
    if (!hasTp.has(key)) {
      notes.push(await attach("tp", "TAKE_PROFIT_MARKET", `tp:${key}`));
    }
  }
  if (notes.length) return notes.filter(Boolean).slice(0, 4).join(" · ");
  return null;
}

async function mirrorToExchange(e, network, cfg) {
  if (apiQuiet()) return null;
  if (Date.now() - liveLast < 4000) return;
  liveLast = Date.now();
  const keys = keysForConn(CONN);
  if (!keys.apiKey || !keys.secret) return "live no keys";
  let book;
  try {
    book = await fetchExchangeBook({ network, connId: CONN });
  } catch (err) {
    noteApiFail(err);
    return `live book ${err instanceof Error ? err.message : "fail"}`;
  }
  if (!book?.ok) {
    noteApiFail(book);
    return `live book ${book?.error ?? "fail"}`;
  }
  noteApiOk();
  if ((book.positions?.length ?? 0) === 0 && lastBook.pos > 0) {
    try {
      await sleep(400);
      const again = await fetchExchangeBook({ network, connId: CONN });
      if (again?.ok && (again.positions?.length ?? 0) > 0) book = again;
      else {
        emptyHold += 1;
        if (again && !again.ok) noteApiFail(again);
        if (emptyHold >= 3) {
          lastBook = { pos: 0, ord: (again?.orders ?? book.orders ?? []).length, pnl: 0, ok: true, sl: 0, tp: 0, positions: [], orders: again?.orders ?? book.orders ?? [] };
          emptyHold = 0;
        } else {
          return emptyHold <= 1 || emptyHold % 20 === 0 ? "live book empty · held" : null;
        }
      }
    } catch (err) {
      noteApiFail(err);
      emptyHold += 1;
      return emptyHold <= 1 ? `live book retry ${err instanceof Error ? err.message : "fail"}` : null;
    }
  }
  emptyHold = 0;
  lastBook = {
    pos: book.positions.length,
    ord: book.orders.length,
    pnl: book.positions.reduce((s, p) => s + (p.pnl || 0), 0),
    ok: true,
    sl: lastBook.sl,
    tp: lastBook.tp,
    equity: Number(book.equity) || lastBook.equity || 0,
    positions: (book.positions ?? []).map((p) => ({
      connId: CONN,
      symbol: p.symbol,
      venueSymbol: p.venueSymbol,
      side: p.side,
      qty: p.qty,
      entry: p.entry,
      mark: p.mark,
      pnl: p.pnl,
    })),
    orders: (book.orders ?? []).slice(0, 250).map((o) => ({
      connId: CONN,
      id: String(o.id ?? ""),
      symbol: o.symbol,
      venueSymbol: o.venueSymbol,
      side: o.side,
      qty: o.qty,
      price: o.price,
      stopPrice: o.stopPrice,
      status: o.status,
      type: o.type,
      closePosition: Boolean(o.closePosition),
      reduceOnly: Boolean(o.reduceOnly),
    })),
  };
  bookAvg.n += 1;
  bookAvg.pos += lastBook.pos;
  bookAvg.ord += lastBook.ord;
  let n = 0;
  for (const p of book.positions ?? []) {
    const k = `${p.symbol}:${p.side}`;
    if (!mirrored.has(`own:${k}`)) {
      mirrored.add(`own:${k}`);
      mirrored.add(`live:${k}`);
      n += 1;
    }
  }
  if (n) claimed = true;
  const notes = [];
  if (n) notes.push(`claim ${n}`);
  const guard = await ensureProtect(network, book, cfg);
  if (guard) {
    notes.push(guard);
    return notes.join(" · ");
  }
  if (lastBook.sl < lastBook.pos || lastBook.tp < lastBook.pos) {
    notes.push(`wait protect ${lastBook.pos - Math.min(lastBook.sl, lastBook.tp)}`);
    return notes.join(" · ");
  }
  const occupied = new Set(book.positions.map((p) => `${p.symbol}:${p.side}`));
  const paperOpen = new Set((e.positions || []).map((p) => `${p.symbol}:${p.side}`));
  for (const k of paperOpen) mirrored.delete(`seed:${k}`);
  const ours = book.positions.filter((p) => {
    const k = `${p.symbol}:${p.side}`;
    return mirrored.has(`own:${k}`) || mirrored.has(`live:${k}`);
  });
  const openN = ours.length;
  const accountN = book.positions.length;

  for (const k of [...mirrored]) {
    if (typeof k === "string" && k.startsWith("own:")) {
      const rest = k.slice(4);
      if (![...occupied].includes(rest)) mirrored.delete(k);
    }
  }

  if (openN >= liveMaxPos() || accountN >= liveMaxPos()) return notes.length ? notes.join(" · ") : null;

  let placed = 0;
  let failed = 0;
  for (const f of e.fills.slice(0, 80)) {
    if (mirrored.has(f.id) || skippedFills.has(f.id)) continue;
    if (f.kind !== "entry" && f.kind !== "partial") continue;
    if ((skipUntil.get(f.symbol) || 0) > Date.now()) continue;
    if (occupied.has(`${f.symbol}:${f.side}`)) {
      mirrored.add(f.id);
      continue;
    }
    if (openN + placed >= liveMaxPos() || accountN + placed >= liveMaxPos()) break;
    if (apiQuiet()) break;
    let r;
    try {
      r = await withLiveBusy(() =>
        placeSwapOrder({
          network,
          connId: CONN,
          symbol: f.symbol,
          side: f.side === "long" ? "BUY" : "SELL",
          positionSide: f.side === "long" ? "LONG" : "SHORT",
          quantity: 0,
          type: "MARKET",
          price: f.px,
          notional: sizeNotional(book.equity),
          confirmLive: true,
          slAtr: Number(cfg?.slAtr) || 1.05,
          tpRatio: Number(cfg?.tpRatio) || 2.5,
          attachProtect: false,
          equity: Number(book.equity) || 0,
        }),
      );
    } catch (err) {
      noteApiFail(err);
      skippedFills.add(f.id);
      return `live throw ${err instanceof Error ? err.message : "err"}`;
    }
    if (!r.ok) {
      skippedFills.add(f.id);
      const err = String(r.error ?? "err");
      if (!/min notional exceeds|TP Price|SL Price|must be (greater|lower)/i.test(err)) skipUntil.set(f.symbol, Date.now() + (isRateLimited(r.error) ? 480_000 : 90_000));
      const quiet = noteApiFail(r);
      failed += 1;
      notes.push(`skip ${f.symbol} ${err.slice(0, 80)}`);
      if (quiet || failed >= 4) break;
      continue;
    }
    mirrored.add(f.id);
    mirrored.add(`own:${f.symbol}:${f.side}`);
    mirrored.add(`live:${f.symbol}:${f.side}`);
    occupied.add(`${f.symbol}:${f.side}`);
    placed += 1;
    notes.push(`live ${f.symbol} ${f.side}`);
    if (placed >= 8) break;
  }
  return notes.length ? notes.slice(0, 4).join(" · ") : null;
}

function intenseCheck(e, pick) {
  const audit = auditEngine(e);
  if (audit.nanCount > 0) {
    healEngine(e, pick.cfg, pick.tactic, pick.range);
    return "heal nan";
  }
  const book = bookCounts(e);
  if (e.running && book.orders.live + book.orders.queued === 0 && e.positions.length === 0) {
    requeueFree(e, pick.cfg, pick.tactic, pick.range, CONN);
    return "rearm empty book";
  }
  return null;
}

function applyExecFromSettings(remote) {
  if (!remote || typeof remote !== "object") {
    configureLiveExecution({ hedgeMode: true, marginMode: "cross", useMaxLeverage: true, leverage: 125, minSizeRatio: 1.08 });
    return;
  }
  configureLiveExecution({
    hedgeMode: true,
    marginMode: remote.marginMode === "isolated" ? "isolated" : "cross",
    useMaxLeverage: true,
    leverage: 125,
    minSizeRatio: Number(remote.minSizeRatio) || 1.08,
  });
}

async function main() {
  const started = Date.now();
  const ends = started + HOURS * 3600 * 1000;
  let pick = pickFromSweep();
  const engine = initVstEngine(pick.cfg, { warmup: 0, symbolCount: VST_MAX_SYMBOLS, orderType: "limit", arm: false });
  engine.running = true;
  engine.phase = "running";
  engine.activeConnId = CONN;
  engine.symbolCount = VST_MAX_SYMBOLS;

  let ping = await pingVst();
  applyExecFromSettings(readSettingsPick());
  const adjustments = [`seed ${pick.tactic}/${pick.range} · ${CONN} · ${VST_MAX_SYMBOLS} sym`];
  if (ping.pingOk) adjustments.push(`BingX ${ping.network} ping ok · eq ${ping.equity.toFixed(2)}`);
  else adjustments.push(`BingX ping failed · ${ping.error ?? "auth"} · paper tape`);
  if (ping.pingOk) {
    try {
      const mode = await ensureLiveAccountMode({ network: ping.network, connId: CONN });
      if (mode) adjustments.push(mode);
    } catch (err) {
      adjustments.push(`mode ${err instanceof Error ? err.message : "fail"}`);
    }
  }

  try {
    const prev = JSON.parse(readFileSync(STATUS, "utf8"));
    for (const k of prev?.owned ?? []) {
      if (typeof k === "string") {
        mirrored.add(k);
        if (k.startsWith("own:")) mirrored.add(`seed:${k.slice(4)}`);
      }
    }
    if ((prev?.owned ?? []).length) adjustments.push(`restore owned ${prev.owned.length}`);
  } catch {
    /* fresh */
  }
  try {
    const prevOv = JSON.parse(readFileSync(OVERALL, "utf8"));
    if (prevOv?.complete?.cells?.length) {
      engine.completeCells = prevOv.complete.cells;
      engine.completeWinner = prevOv.complete.winner;
      adjustments.push(`restore compute ${prevOv.complete.cells.length} cells`);
    }
  } catch {
    /* none */
  }

  let lastTape = 0;
  let lastAdjust = started;
  let locked = true;
  let freeze;
  let hostPhase = "running";
  let lastResetAt = 0;
  let computeDone = false;

  try {
    const tape0 = await withTimeout(fetchBingxTape(ping.network), 8000, "tape0");
    if (tape0.ok) {
      const ids = applyTape(engine, tape0.tickers);
      freeze = new Set(ids);
      lastTape = Date.now();
      adjustments.push(`tape first · ${ids.length} px`);
    }
  } catch (err) {
    adjustments.push(`tape first ${err instanceof Error ? err.message : "fail"}`);
  }
  requeueFree(engine, pick.cfg, pick.tactic, pick.range, CONN);
  adjustments.push("arm after live tape");

  const statusBase = () => {
    const elapsedMin = (Date.now() - started) / 60000;
    return {
      startedAt: new Date(started).toISOString(),
      endsAt: new Date(ends).toISOString(),
      elapsedMin: Number(elapsedMin.toFixed(2)),
      network: ping.network,
      pingOk: ping.pingOk,
      equity: Number(lastBook.equity) || ping.equity,
      tactic: pick.tactic,
      range: pick.range,
      stable: locked,
      adjustments: adjustments.slice(-16),
      sessionPhase: hostPhase,
      phase: engine.phase,
      computeDone,
    };
  };

  writeStatus(snapshot(engine, statusBase()));
  writeSettingsPick(pick, { rev: 1, locked: true });

  let lastTickAt = Date.now();
  let tickBusy = false;
  let ioInFlight = false;

  function doTick() {
    if (tickBusy) {
      if (Date.now() - lastTickAt > TICK_MS * 8) {
        tickBusy = false;
        healEngine(engine, pick.cfg, pick.tactic, pick.range);
        adjustments.push("unstick tick");
      } else return;
    }
    if (hostPhase === "paused" || hostPhase === "stopped") {
      lastTickAt = Date.now();
      return;
    }
    tickBusy = true;
    try {
      tickVst(engine, pick.cfg, pick.tactic, {
        freezeIds: lastBook.pos >= LIVE_MAX_POS ? freeze : undefined,
        skipWalk: lastBook.pos >= LIVE_MAX_POS,
        rangeType: pick.range,
        symbolCount: VST_MAX_SYMBOLS,
        orderType: "limit",
        block: BLOCK,
      });
      engine.running = true;
      engine.phase = "running";
    } catch {
      healEngine(engine, pick.cfg, pick.tactic, pick.range);
      engine.running = true;
      engine.phase = "running";
      adjustments.push("tick recovered");
    } finally {
      tickBusy = false;
      lastTickAt = Date.now();
    }
  }

  let lastPingAt = Date.now();
  async function ioCycle() {
    if (ioInFlight) return;
    ioInFlight = true;
    try {
      if (apiQuiet()) {
        /* skip private API until BingX unban */
      } else if (Date.now() - lastPingAt > 90000) {
        lastPingAt = Date.now();
        try {
          const next = await withTimeout(pingVst(), 6000, "reping");
          if (next.pingOk) {
            ping = next;
            if (next.equity > 0) lastBook.equity = next.equity;
          }
        } catch {
          /* keep last */
        }
      }
      const live = Date.now() - lastTape > 2500;
      if (live) {
        try {
          const tape = await withTimeout(fetchBingxTape(ping.network), 8000, "tape");
          if (tape.ok) {
            const ids = applyTape(engine, tape.tickers);
            freeze = new Set(ids);
            lastTape = Date.now();
          }
        } catch (err) {
          adjustments.push(`tape ${err instanceof Error ? err.message : "fail"}`);
          healEngine(engine, pick.cfg, pick.tactic, pick.range);
        }
      }
      if (!apiQuiet() && liveBusy === 0 && ping.pingOk && engine.tick % 2 === 0) {
        try {
          const liveNote = await withTimeout(mirrorToExchange(engine, ping.network, pick.cfg), 15000, "live");
          if (liveNote) adjustments.push(liveNote);
        } catch (err) {
          liveBusy = 0;
          noteApiFail(err);
          adjustments.push(`live ${err instanceof Error ? err.message : "fail"}`);
        }
      }
      if (!apiQuiet() && ping.pingOk && engine.tick % 40 === 0) {
        try {
          const ex = await withTimeout(fetchLiveExecutions({ network: ping.network, connId: CONN, since: started }), 8000, "exec");
          if (ex.ok) {
            if (ex.realized?.n > 0 && Number(ex.realized.pf) > 0) {
              engine.ledger.trades = Math.max(engine.ledger.trades || 0, ex.realized.n);
              engine.ledger.wins = Math.max(engine.ledger.wins || 0, ex.realized.wins);
              engine.ledger.profit = Math.max(engine.ledger.profit || 0, Math.max(0, ex.realized.net));
              engine.stats.trades = engine.ledger.trades;
              engine.stats.pf = ex.realized.pf;
              engine.stats.wr = ex.realized.wr || engine.stats.wr;
              if (Number.isFinite(ex.realized.net) && ex.realized.net !== 0) engine.stats.net = ex.realized.net;
              engine.stats.mdd = ex.realized.mdd || engine.stats.mdd;
            }
            let prev = {};
            try {
              prev = JSON.parse(readFileSync(OVERALL, "utf8"));
            } catch {
              prev = {};
            }
            writeFileSync(
              OVERALL,
              JSON.stringify({ ...prev, executions: { ok: true, realized: ex.realized, bySymbol: ex.bySymbol, orders: ex.orders.slice(0, 40), at: ex.at } }),
            );
          }
        } catch (err) {
          adjustments.push(`exec ${err instanceof Error ? err.message : "fail"}`);
        }
      }
    } finally {
      ioInFlight = false;
    }
    try {
      if (wantStatus(false)) {
        const snap = snapshot(engine, { ...statusBase(), computeDone });
        writeStatus(snap);
      }
    } catch {
      /* keep io moving */
    }
  }

  void (async () => {
    await sleep(1200);
    adjustments.push("complete compute start");
    try {
      const complete = await completeComputationsAsync(pick.cfg, {
        symbolCount: 8,
        hours: [1, 2, 4, 6, 8, 12, 16, 24],
        yieldFn: () => sleep(20),
        onCell: (cell, i, total) => {
          if (i === 1 || i === total || i % 5 === 0) {
            adjustments.push(`compute ${i}/${total} ${cell.tactic}/${cell.range} ${cell.hours}h PF ${cell.pf.toFixed(2)}`);
          }
        },
      });
      let prev = {};
      try {
        prev = JSON.parse(readFileSync(OVERALL, "utf8"));
      } catch {
        prev = {};
      }
      const sweep = {
        hours: 8,
        symbolCount: complete.symbolCount,
        at: complete.at,
        cells: complete.cells.filter((c) => c.hours === 8).map(({ tactic, range, pf, wr, net, trades, ok }) => ({ tactic, range, pf, wr, net, trades, ok })),
        winner: complete.byHours["8"]?.winner
          ? {
              tactic: complete.byHours["8"].winner.tactic,
              range: complete.byHours["8"].winner.range,
              pf: complete.byHours["8"].winner.pf,
              trades: complete.byHours["8"].winner.trades,
              ok: complete.byHours["8"].winner.ok,
            }
          : complete.winner,
      };
      writeFileSync(
        OVERALL,
        JSON.stringify({ ...prev, sweep, playbooks: complete.playbooks, complete, at: Date.now() }, null, 2),
      );
      const w = complete.winner;
      engine.completeCells = complete.cells;
      engine.completeWinner = w;
      cachedOverall = null;
      cachedOverallTick = -1;
      if (w && w.ok && w.pf >= 1) {
        if (w.tactic !== pick.tactic || w.range !== pick.range) {
          pick = { tactic: w.tactic, range: w.range, cfg: pick.cfg };
          try {
            healEngine(engine, pick.cfg, pick.tactic, pick.range);
          } catch {
            /* keep */
          }
          adjustments.push(`live lock ${w.tactic}/${w.range} ${w.hours}h PF ${w.pf.toFixed(2)}`);
        }
        locked = true;
        writeSettingsPick(pick, { rev: Date.now() % 1e9, locked: true });
      }
      adjustments.push(
        w
          ? `complete ${complete.cells.length} cells · winner ${w.tactic}/${w.range} ${w.hours}h PF ${w.pf.toFixed(2)} · ${complete.elapsedMs}ms`
          : "complete compute empty",
      );
      computeDone = true;
    } catch (err) {
      adjustments.push(`compute skip ${err instanceof Error ? err.message : "err"}`);
      try {
        const sweep = sweepAllConfigs(4, 8, pick.cfg);
        const playbooks = sweepPlaybooks(4, 8, pick.cfg);
        let prev = {};
        try {
          prev = JSON.parse(readFileSync(OVERALL, "utf8"));
        } catch {
          prev = {};
        }
        writeFileSync(OVERALL, JSON.stringify({ ...prev, sweep, playbooks, at: Date.now() }, null, 2));
        const w = sweep.winner;
        adjustments.push(w ? `fallback sweep ${w.tactic}/${w.range} PF ${w.pf.toFixed(2)}` : "fallback sweep empty");
      } catch (err2) {
        adjustments.push(`sweep skip ${err2 instanceof Error ? err2.message : "err"}`);
      }
    }
  })();

  let lastRearmAt = 0;
  const watchdog = setInterval(() => {
    if (hostPhase !== "running") return;
    if (Date.now() - lastTickAt > TICK_MS * 6) {
      tickBusy = false;
      liveBusy = 0;
      ioInFlight = false;
      adjustments.push("watchdog tick");
      try {
        healEngine(engine, pick.cfg, pick.tactic, pick.range);
        doTick();
      } catch {
        /* keep alive */
      }
    }
    if (
      engine.running &&
      lastBook.pos < LIVE_MAX_POS &&
      engine.positions.length === 0 &&
      engine.queue.length === 0 &&
      engine.orders.length === 0 &&
      Date.now() - lastRearmAt > 20000
    ) {
      lastRearmAt = Date.now();
      try {
        requeueFree(engine, pick.cfg, pick.tactic, pick.range, CONN);
        adjustments.push("watchdog rearm");
      } catch {
        /* keep alive */
      }
    }
  }, Math.max(800, TICK_MS));

  let lastSettingsAt = Date.now();

  let lastSettingsRead = 0;
  let cachedRemote = null;
  while (Date.now() < ends) {
    if (Date.now() - lastSettingsRead > 3000) {
      lastSettingsRead = Date.now();
      cachedRemote = readSettingsPick();
    }
    const remote = cachedRemote;
    if (remote) {
      applyExecFromSettings(remote);
      const nextPhase = remote.sessionPhase || "running";
      if (nextPhase !== hostPhase) {
        hostPhase = nextPhase;
        if (hostPhase === "paused") {
          engine.running = false;
          engine.phase = "paused";
          adjustments.push("host pause");
        } else if (hostPhase === "stopped") {
          haltEngine(engine, CONN);
          engine.phase = "stopped";
          adjustments.push("host stop");
          if (ping.pingOk) {
            try {
              const book = await withTimeout(fetchExchangeBook({ network: ping.network, connId: CONN }), 8000, "stop book");
              for (const p of book?.positions ?? []) {
                const k = `${p.symbol}:${p.side}`;
                if (!mirrored.has(`own:${k}`) && !mirrored.has(`live:${k}`)) continue;
                await withTimeout(closeHit(ping.network, p), 8000, "stop flat");
                adjustments.push(`stop flat ${p.symbol}`);
              }
            } catch (err) {
              adjustments.push(`stop flat ${err instanceof Error ? err.message : "err"}`);
            }
          }
        } else if (hostPhase === "running") {
          engine.running = true;
          engine.phase = "running";
          requeueFree(engine, pick.cfg, pick.tactic, pick.range, CONN);
          adjustments.push("host resume");
        }
      }
      if (Number(remote.at) > lastSettingsAt) {
        lastSettingsAt = Number(remote.at) || Date.now();
        const nextTactic = remote.tactic;
        const nextRange = remote.rangeType;
        const nextCfg = remote.tacticConfig;
        const cfgChanged = Boolean(
          nextCfg &&
            (Number(nextCfg.slAtr) !== Number(pick.cfg.slAtr) ||
              Number(nextCfg.tpRatio) !== Number(pick.cfg.tpRatio) ||
              Number(nextCfg.trailingPct) !== Number(pick.cfg.trailingPct) ||
              Number(nextCfg.axisSpacing) !== Number(pick.cfg.axisSpacing) ||
              Number(nextCfg.axisLevels) !== Number(pick.cfg.axisLevels) ||
              Number(nextCfg.dcaCount) !== Number(pick.cfg.dcaCount) ||
              Number(nextCfg.dcaDrawdown) !== Number(pick.cfg.dcaDrawdown)),
        );
        if (nextCfg && (nextTactic !== pick.tactic || nextRange !== pick.range || cfgChanged)) {
          pick = {
            tactic: nextTactic || pick.tactic,
            range: nextRange || pick.range,
            cfg: { ...pick.cfg, ...nextCfg },
          };
          adjustments.push(`settings sync ${pick.tactic}/${pick.range} sl ${pick.cfg.slAtr} tp ${pick.cfg.tpRatio}`);
          healEngine(engine, pick.cfg, pick.tactic, pick.range);
        }
        if (remote.blockConfig) Object.assign(BLOCK, remote.blockConfig, { enabled: true });
        if (engine.lastMsg?.startsWith("Host reset") || (remote.sessionPhase === "running" && engine.positions.length === 0 && Date.now() - lastResetAt > 8000 && engine.phase === "idle")) {
          lastResetAt = Date.now();
        }
      }
    }

    if (hostPhase === "paused" || hostPhase === "stopped") {
      if (wantStatus(false)) writeStatus(snapshot(engine, { ...statusBase(), sessionPhase: hostPhase, computeDone }));
      await sleep(TICK_MS);
      continue;
    }

    try {
      doTick();

      if (engine.tick % 4 === 0) void ioCycle();
      if (engine.tick % 12 === 0) {
        const note = intenseCheck(engine, pick);
        if (note) adjustments.push(note);
      }
      if (engine.tick % 80 === 0) healEngine(engine, pick.cfg, pick.tactic, pick.range);
      if (adjustments.length > 40) adjustments.splice(0, adjustments.length - 24);
      if (liveBusy > 8) liveBusy = 0;
    } catch (err) {
      tickBusy = false;
      liveBusy = 0;
      ioInFlight = false;
      adjustments.push(`loop ${err instanceof Error ? err.message : "err"}`);
      try {
        healEngine(engine, pick.cfg, pick.tactic, pick.range);
      } catch {
        /* keep alive */
      }
    }

    const now = Date.now();
    if (now - lastAdjust > 12 * 60 * 1000) {
      lastAdjust = now;
      const st = snapshot(engine, statusBase());
      if (st.trades >= 20 && st.pf >= LIVE_MIN_PF && st.net > 0 && (st.wr >= 0.4 || st.pf >= 1.8) && st.mdd <= 0.18) {
        locked = true;
        adjustments.push(`lock ${pick.tactic}/${pick.range} PF ${st.pf.toFixed(2)}`);
        writeSettingsPick(pick, { rev: Date.now() % 1e9, locked: true });
        lastSettingsAt = Date.now();
      }
    }

    if (wantStatus(false)) writeStatus(snapshot(engine, { ...statusBase(), computeDone }));
    await sleep(TICK_MS);
  }

  clearInterval(watchdog);
  const final = snapshot(engine, statusBase());
  final.stable = locked || (final.positive && final.mdd <= 0.22);
  writeStatus(final);
  console.log(
    JSON.stringify({
      done: true,
      positive: final.positive,
      stable: final.stable,
      pf: final.pf,
      net: final.net,
      trades: final.trades,
      slots: final.slots,
      liveOrders: final.liveOrders,
      tactic: final.tactic,
      range: final.range,
      pingOk: final.pingOk,
      conn: CONN,
    }),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  try {
    writeFileSync(
      STATUS,
      JSON.stringify({ phase: "error", lastMsg: err instanceof Error ? err.message : "fatal", at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(1), 250);
});

process.on("uncaughtException", (err) => {
  console.error("uncaught", err instanceof Error ? err.message : err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandled", err instanceof Error ? err.message : String(err));
});
process.on("SIGTERM", () => {
  try {
    let prev = {};
    try {
      prev = JSON.parse(readFileSync(STATUS, "utf8"));
    } catch {
      prev = {};
    }
    writeFileSync(STATUS, JSON.stringify({ ...prev, phase: "stopped", lastMsg: "SIGTERM", at: Date.now() }));
  } catch {
    /* ignore */
  }
  process.exit(0);
});
