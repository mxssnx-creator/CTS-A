#!/usr/bin/env node
/**
 * CTS-A BingX VST-02 session: 50 symbols, max orders, best-first, 2h monitor.
 * Keys from env — never printed.
 */
import { writeFileSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { fetchBingxTape, pingAccount, keysForConn, placeSwapOrder, fetchExchangeBook, liveProtectPrices, fetchContractMap, snapQty, snapQtyDown, liftQtyToMin, parseAvailableUsdt, fetchLiveExecutions, cancelSwapOrder } from "../src/lib/desk/feed.server.ts";
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
import { MAX_LIVE_NOTIONAL } from "../src/lib/desk/feed.ts";

const HOURS = Number(process.env.CTS_A_VST_HOURS ?? 12);
const STATUS = process.env.CTS_A_STATUS ?? "/var/lib/cts-a/vst-session.json";
const SETTINGS = process.env.CTS_A_SETTINGS ?? "/var/lib/cts-a/desk-settings.json";
const OVERALL = process.env.CTS_A_OVERALL ?? "/var/lib/cts-a/overall-stats.json";
const TICK_MS = Number(process.env.CTS_A_TICK_MS ?? VST_TICK_MS);
const CONN = process.env.CTS_A_CONN ?? "bingx-vst-02";
let lastBook = { pos: 0, ord: 0, pnl: 0, ok: false, sl: 0, tp: 0, positions: [], orders: [] };
const bookAvg = { pos: 0, ord: 0, n: 0 };
let cachedOverall = null;
let cachedOverallTick = -1;
let lastOverallWrite = 0;

const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  endStageOnly: false,
  cadence: 8,
  flattenConflict: false,
  addOnWin: true,
  maxMultiple: 6,
  minMultiple: 1,
  overall: true,
  counts: [1, 2, 3, 4, 5, 6],
  volumeRatio: 0.25,
  maxVolumeMultiplier: 2,
  pfRatio: 1.25,
  pauseCountRatio: 1,
  evalPosCount: 50,
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
  const rawLive = last12?.n ? last12.pf : Number.isFinite(winnerPf) && winnerPf > 0 ? winnerPf : e.stats.pf;
  const rawPf = e.ledger.trades > 0 ? e.stats.pf : Number.isFinite(winnerPf) && winnerPf > 0 ? winnerPf : e.stats.pf;
  const clampPf = (v, n) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x <= 0) return 0;
    if ((n || 0) < 5 && x > 5) return 5;
    return Math.min(x, 20);
  };
  const livePf = clampPf(rawLive, last12?.n ?? e.ledger.trades);
  const pf = clampPf(rawPf, e.ledger.trades);
  const net = Number.isFinite(lastBook.pnl) ? lastBook.pnl : e.stats.net;
  const wr = e.ledger.trades > 0 ? e.stats.wr : Number(last12?.wr ?? e.stats.wr);
  const tapeThin = e.ledger.trades < 3;
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
    thresholds: { minPf: 1.35, maxMdd: 0.16, minWr: 0.48, minVf: 1.08, maxDdt: 40 },
    activeConnId: CONN,
    evalHours: [4, 8, 16],
    evalLastNs: [5, 10, 15],
    sessionPhase: extra.sessionPhase ?? "running",
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

function isRateLimited(s) {
  return /100410|109418|frequency limit|disabled period|too many request|rate limit|over 20/i.test(String(s || ""));
}

function quietMs(s) {
  return /109418|480000|over 20/i.test(String(s || "")) ? 480_000 : 120_000;
}

async function pingVst() {
  const keys = keysForConn(CONN);
  if (!keys.apiKey || !keys.secret) return { network: "testnet", pingOk: false, equity: 0, error: "no keys" };
  const vst = await pingAccount({ ...keys, network: "testnet", connId: CONN });
  if (vst.ok) return { network: "testnet", pingOk: true, equity: vst.equity ?? 0 };
  const err = String(vst.error || "");
  if (isRateLimited(err)) {
    apiQuietUntil = Math.max(apiQuietUntil || 0, Date.now() + quietMs(err));
  }
  return { network: "testnet", pingOk: false, equity: 0, error: err };
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
const LIVE_MAX_POS = 30;
const LIVE_NOTIONAL = Math.min(10, MAX_LIVE_NOTIONAL);

function sizeNotional(equity) {
  const pct = Number(equity) > 0 ? Number(equity) * 0.001 : LIVE_NOTIONAL;
  return Math.max(LIVE_NOTIONAL, Math.min(250, pct));
}

function apiQuiet() {
  return Date.now() < apiQuietUntil;
}

function noteApiFail(err) {
  const s = String(err?.error || err?.message || err || "");
  if (s) lastApiError = s.slice(0, 180);
  if (isRateLimited(s)) {
    apiQuietUntil = Math.max(apiQuietUntil, Date.now() + quietMs(s));
    return true;
  }
  return false;
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
  lastBook.sl = hasSl.size;
  lastBook.tp = hasTp.size;
  const occupied = new Set((book.positions ?? []).map((p) => `${p.symbol}:${p.side}`));
  const posQty = new Map((book.positions ?? []).map((p) => [`${p.symbol}:${p.side}`, p.qty]));
  const owned = (book.positions ?? []).filter((p) => {
    const key = `${p.symbol}:${p.side}`;
    return mirrored.has(`own:${key}`) || mirrored.has(`live:${key}`);
  });
  const missing = owned.filter((p) => {
    const key = `${p.symbol}:${p.side}`;
    return !hasSl.has(key) || !hasTp.has(key);
  });
  const extras = [...grouped.entries()].some(([, g]) => (g.sl?.length ?? 0) > 1 || (g.tp?.length ?? 0) > 1);
  const stray = [...grouped.keys()].some((key) => !occupied.has(key) && (mirrored.has(`own:${key}`) || mirrored.has(`live:${key}`) || mirrored.has(`sl:${key}`) || mirrored.has(`tp:${key}`)));
  if (!missing.length && !extras && !stray) return null;
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
      if (r.ok) return `trim ${kind} ${extra.symbol}`;
      cancelFailed.add(extraId);
      noteApiFail(r);
    }
  }
  const notes = [];
  let posts = 0;
  for (const p of book.positions ?? []) {
    if (posts >= 6) break;
    const key = `${p.symbol}:${p.side}`;
    if (!mirrored.has(`own:${key}`) && !mirrored.has(`live:${key}`)) continue;
    const px = p.mark || p.entry || 0;
    if (!(px > 0) || !(p.qty > 0)) continue;
    const spec = map.get(p.venueSymbol);
    const prot = liveProtectPrices(px, p.side, slAtr, tpRatio, spec);
    const protectQty = (availUsdt = 0) => {
      let q = p.qty;
      if (availUsdt > 0 && px > 0) q = Math.min(q, (availUsdt * 0.99) / px);
      q = snapQtyDown(q * 0.995, spec);
      if (!(q > 0)) q = snapQtyDown(p.qty, spec);
      return q;
    };
    const placeProtect = async (type, qty) =>
      withLiveBusy(() =>
        placeSwapOrder({
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
          closePosition: true,
        }),
      );
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
      if (posts >= 6) break;
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
    orders: (book.orders ?? []).slice(0, 80).map((o) => ({
      connId: CONN,
      id: o.id,
      symbol: o.symbol,
      venueSymbol: o.venueSymbol,
      side: o.side,
      qty: o.qty,
      price: o.price,
      stopPrice: o.stopPrice,
      status: o.status,
      type: o.type,
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
  const note = n ? `claim ${n}` : null;
  const guard = await ensureProtect(network, book, cfg);
  if (guard) return note ? `${note} · ${guard}` : guard;
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

  if (openN >= LIVE_MAX_POS || accountN >= LIVE_MAX_POS) return null;
  const n12 = cachedOverall?.lastN?.["12"];
  if (n12 && n12.n >= 8 && Number(n12.pf) < 1.05) return "halt new · last12 PF";

  let placed = 0;
  let failed = 0;
  const notes = [];
  for (const f of e.fills.slice(0, 24)) {
    if (mirrored.has(f.id) || skippedFills.has(f.id)) continue;
    if (f.kind !== "entry" && f.kind !== "partial") continue;
    if ((skipUntil.get(f.symbol) || 0) > Date.now()) continue;
    if (occupied.has(`${f.symbol}:${f.side}`)) {
      mirrored.add(f.id);
      continue;
    }
    if (openN + placed >= LIVE_MAX_POS || accountN + placed >= LIVE_MAX_POS) break;
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
          attachProtect: true,
        }),
      );
    } catch (err) {
      noteApiFail(err);
      skippedFills.add(f.id);
      return `live throw ${err instanceof Error ? err.message : "err"}`;
    }
    if (!r.ok) {
      skippedFills.add(f.id);
      skipUntil.set(f.symbol, Date.now() + (isRateLimited(r.error) ? 480_000 : 90_000));
      const quiet = noteApiFail(r);
      failed += 1;
      notes.push(`skip ${f.symbol} ${String(r.error ?? "err").slice(0, 80)}`);
      if (quiet || failed >= 2) break;
      continue;
    }
    mirrored.add(f.id);
    mirrored.add(`own:${f.symbol}:${f.side}`);
    mirrored.add(`live:${f.symbol}:${f.side}`);
    occupied.add(`${f.symbol}:${f.side}`);
    placed += 1;
    notes.push(`live ${f.symbol} ${f.side}`);
    if (placed >= 2) break;
  }
  if (note) notes.unshift(note);
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
  const adjustments = [`seed ${pick.tactic}/${pick.range} · ${CONN} · ${VST_MAX_SYMBOLS} sym`];
  if (ping.pingOk) adjustments.push(`BingX ${ping.network} ping ok · eq ${ping.equity.toFixed(2)}`);
  else adjustments.push(`BingX ping failed · ${ping.error ?? "auth"} · paper tape`);

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
      equity: ping.equity,
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
        freezeIds: lastBook.pos >= 12 ? freeze : undefined,
        skipWalk: lastBook.pos >= 12,
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
      } else if (!ping.pingOk && Date.now() - lastPingAt > 45000) {
        lastPingAt = Date.now();
        try {
          ping = await withTimeout(pingVst(), 6000, "reping");
          if (ping.pingOk) adjustments.push(`BingX re-ping ok · eq ${Number(ping.equity || 0).toFixed(2)}`);
          else noteApiFail(ping);
        } catch (err) {
          noteApiFail(err);
          adjustments.push(`reping ${err instanceof Error ? err.message : "fail"}`);
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
      if (!apiQuiet() && liveBusy === 0 && ping.pingOk && (engine.tick % 4 === 0 || lastBook.pos < 8)) {
        try {
          const liveNote = await withTimeout(mirrorToExchange(engine, ping.network, pick.cfg), 9000, "live");
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
            if (ex.realized?.n > 0) {
              engine.ledger.trades = Math.max(engine.ledger.trades || 0, ex.realized.n);
              engine.ledger.wins = Math.max(engine.ledger.wins || 0, ex.realized.wins);
              engine.ledger.profit = Math.max(engine.ledger.profit || 0, Math.max(0, ex.realized.net));
              engine.stats.trades = engine.ledger.trades;
              engine.stats.pf = ex.realized.pf || engine.stats.pf;
              engine.stats.wr = ex.realized.wr || engine.stats.wr;
              engine.stats.net = ex.realized.net;
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
              JSON.stringify({ ...prev, executions: { ok: true, realized: ex.realized, bySymbol: ex.bySymbol, orders: ex.orders.slice(0, 80), at: ex.at } }, null, 2),
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
      const snap = snapshot(engine, { ...statusBase(), computeDone });
      writeStatus(snap);
      if (engine.tick % 40 === 0) {
        try {
          let prev = {};
          try { prev = JSON.parse(readFileSync(OVERALL, "utf8")); } catch { prev = {}; }
          writeFileSync(OVERALL, JSON.stringify({ ...prev, live: snap.overall, at: Date.now() }, null, 2));
        } catch { /* ignore */ }
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
        hours: [1, 2, 4, 6, 8, 16, 24],
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

  while (Date.now() < ends) {
    const remote = readSettingsPick();
    if (remote) {
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
      if (engine.tick % 10 === 0) writeStatus(snapshot(engine, { ...statusBase(), sessionPhase: hostPhase, computeDone }));
      await sleep(TICK_MS);
      continue;
    }

    try {
      doTick();

      if (engine.tick % 4 === 0) void ioCycle();
      if (engine.tick % 4 === 0) writeStatus(snapshot(engine, { ...statusBase(), computeDone }));
      if (engine.tick % 10 === 0) {
        const note = intenseCheck(engine, pick);
        if (note) adjustments.push(note);
      }
      if (engine.tick % 20 === 0) healEngine(engine, pick.cfg, pick.tactic, pick.range);
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
      if (st.trades >= 20 && st.pf >= 1.15 && st.net > 0 && (st.wr >= 0.36 || st.pf >= 1.5) && st.mdd <= 0.2) {
        locked = true;
        adjustments.push(`lock ${pick.tactic}/${pick.range} PF ${st.pf.toFixed(2)}`);
        writeSettingsPick(pick, { rev: Date.now() % 1e9, locked: true });
        lastSettingsAt = Date.now();
      }
    }

    if (engine.tick % 10 === 0) writeStatus(snapshot(engine, { ...statusBase(), computeDone }));
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
