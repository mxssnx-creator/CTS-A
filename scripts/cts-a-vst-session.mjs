#!/usr/bin/env node
/**
 * CTS-A BingX VST-02 session: 50 symbols, max orders, best-first, 2h monitor.
 * Keys from env — never printed.
 */
import { writeFileSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { fetchBingxTape, pingAccount, keysForConn, placeSwapOrder, fetchExchangeBook, liveProtectPrices, fetchContractMap, snapQty, snapQtyDown, liftQtyToMin, parseAvailableUsdt, fetchLiveExecutions, cancelSwapOrder, configureLiveExecution, ensureLiveAccountMode, armMaxLeverage, snapPx, fetchVol1h, loadLeverageCaps, cachedMaxLeverage } from "../src/lib/desk/feed.server.ts";
import { applyLiveTape, BINGX_SYMBOL, isDeskClientOrderId, isOwnedExchangeOrder, ownKeysFromOrders, pickWidestProtect, liveEntryBudget, filterDeskRealized, systemProcessedNet } from "../src/lib/desk/feed.ts";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, DEFAULT_MIN_PF, DEFAULT_BASE_PF, DEFAULT_AXIS_PF, DEFAULT_BLOCK_PF, DEFAULT_SHORT_PF, DEFAULT_SHORT_BASE_PF, DEFAULT_STRATEGY_TOGGLES, DEFAULT_ENABLED_KINDS, positionNotional, pickProtectCell, TP_SL_RATIOS, SL_ATR_RATIOS, TRAIL_PCTS, RANGE_TYPES, X01_DEFAULTS, LIVE_BLOCK_COUNTS, LIVE_ENABLED_KINDS, liveTacticsOf, allProtectCells, allShortTpSlCombos, liveShortProtectCombos, filterLiveShortCombos, SHORT_20H_POSITIVE, SHORT_WINNER, cfgUsesShortRange, slAtrOf, tpRatioOf, trailStopFromPeak, profitFactor, sanitizeShortProgress, DEFAULT_SHORT_PROGRESS, DEFAULT_SHORT_MIN_TP_ATR, DEFAULT_SHORT_MIN_SL_OF_TP, POSITION_COST_PCT, volumeCoord, clampBlockVol, clampSharedVol, clampOverallVol, AUTO_EVAL_HOURS, SHORT_EVAL_HOURS, DEFAULT_LAST_N_PROGRESS, sanitizeLastNProgress, EVAL_POS_N, VALID_EXEC_POS_N, LIVE_DISABLE_N } from "../src/lib/desk/engine.ts";
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
  clampSymbolCount,
  universeSymbols,
  rankUniverse,
  vol1hOf,
  adjustActiveBlocks,
  overallLiveStats,
  overlayExchangeBook,
  releaseVanished,
  skipLiveSymbol,
  liveRelationDisabled,
  liveShouldExecute,
  winningRelVolume,
  classifyIndication,
  tacticForIndication,
  openPlaybook,
  kindFromIndication,
  applyRealizedSymbolStats,
  ingestLivePnls,
  evalBlockRelations,
  overlayLiveExecutions,
  syncLivePartials,
  sweepAllConfigs,
  sweepPlaybooks,
  completeComputationsAsync,
  LIVE_TACTICS,
  validateSymbols100h,
  mergeSymbolHourEval,
  refreshSymbolHourEval,
} from "../src/lib/desk/vst.ts";

const HOURS = Number(process.env.CTS_A_VST_HOURS ?? 12);
const CONN = (process.env.CTS_A_CONN || (process.env.CTS_A_X01 === "1" ? "bingx-x01" : "bingx-vst-02")).trim();
const IS_X01 = CONN === "bingx-x01";
const STATUS = process.env.CTS_A_STATUS ?? (IS_X01 ? "/var/lib/cts-a/vst-session.json" : "/var/lib/cts-a/vst-session-x02.json");
const SETTINGS = process.env.CTS_A_SETTINGS ?? (IS_X01 ? "/var/lib/cts-a/desk-settings.json" : "/var/lib/cts-a/desk-settings-x02.json");
const OVERALL = process.env.CTS_A_OVERALL ?? (IS_X01 ? "/var/lib/cts-a/overall-stats.json" : "/var/lib/cts-a/overall-stats-x02.json");
const TICK_MS = Number(process.env.CTS_A_TICK_MS ?? VST_TICK_MS);
const CYCLE_MS = Number(process.env.CTS_A_CYCLE_MS ?? 40_000);
const SHORT_CYCLE_MS = Number(process.env.CTS_A_SHORT_CYCLE_MS ?? 12_000);
const NETWORK_PREF = process.env.CTS_A_NETWORK === "mainnet" || IS_X01 ? "mainnet" : "testnet";
const LIVE_MAX_POS = Number(process.env.CTS_A_LIVE_MAX_POS ?? 100);
const LIVE_MIN_PF = IS_X01
  ? Math.max(DEFAULT_MIN_PF, Number(process.env.CTS_A_LIVE_MIN_PF ?? DEFAULT_MIN_PF) || DEFAULT_MIN_PF)
  : Math.max(DEFAULT_SHORT_PF, Number(process.env.CTS_A_LIVE_MIN_PF ?? DEFAULT_SHORT_PF) || DEFAULT_SHORT_PF);
const LIVE_SYMBOLS = clampSymbolCount(Number(process.env.CTS_A_SYMBOLS ?? (IS_X01 ? X01_DEFAULTS.symbolCount : VST_MAX_SYMBOLS)));
const UNI = new Set(universeSymbols(LIVE_SYMBOLS).map((s) => s.id));
const PREFERRED_RANGES = new Set(["fibonacci", "geometric", "atr"]);
const mirrored = new Set();
/** Legs tagged by this connection's clientOrderId. */
const taggedKeys = new Set();
function isUniverseSymbol(sym) {
  const s = String(sym || "");
  if (!s) return false;
  if (UNI.has(s)) return true;
  return mirrored.has(`own:${s}:long`) || mirrored.has(`own:${s}:short`) || mirrored.has(`live:${s}:long`) || mirrored.has(`live:${s}:short`);
}
function isDeskSymbol(sym) {
  return isUniverseSymbol(sym);
}
function ownKey(symbol, side) {
  return `${symbol}:${side}`;
}
function isOwnedLeg(symbol, side) {
  const k = ownKey(symbol, side);
  if (taggedKeys.has(k)) return true;
  if (mirrored.has(`own:${k}`) || mirrored.has(`live:${k}`)) return true;
  // Seed is only a restart claim until tagged tickets are on the book.
  if (taggedKeys.size > 0) return false;
  return mirrored.has(`seed:${k}`);
}
function isDeskOrder(o) {
  return isOwnedExchangeOrder(o, CONN) || isDeskClientOrderId(o?.clientOrderId, CONN);
}
/** Cancel/replace only tickets tagged for this connection. Never touch foreign or other CTS slots. */
function mayCancelOrder(o) {
  return Boolean(o) && isDeskOrder(o);
}
function refreshTaggedKeys(orders) {
  taggedKeys.clear();
  for (const k of ownKeysFromOrders(orders ?? [], CONN)) taggedKeys.add(k);
  return taggedKeys;
}
function pickCompleteLock(complete) {
  const cells = (complete?.cells || []).filter((c) => c?.ok && Number(c.hours) >= 4 && Number(c.trades || 0) >= 6 && Number(c.pf) >= 1);
  if (!cells.length) {
    const w = complete?.winner;
    return w && Number(w.pf) >= 1 && Number(w.trades || 0) >= 6 ? w : null;
  }
  cells.sort((a, b) => Number(b.pf) - Number(a.pf) || Number(b.hours) - Number(a.hours) || Number(b.trades) - Number(a.trades));
  const best = cells[0];
  return cells.find((c) => PREFERRED_RANGES.has(c.range) && Number(c.pf) + 1e-9 >= Number(best.pf) * 0.9) || best;
}
let lastLevBump = 0;
let lastFlattenAt = 0;
let lastLevWalk = 0;
let levWalkI = 0;
const levUniverse = [];
const levDone = new Set();
const opsLog = [];

function noteOp(s) {
  if (!s) return;
  opsLog.push(String(s));
  if (opsLog.length > 24) opsLog.splice(0, opsLog.length - 24);
}

function statusAdjustments(adjustments) {
  const compute = (adjustments || []).filter((a) => /^compute |^complete /.test(String(a))).slice(-4);
  const rest = (adjustments || []).filter((a) => !/^compute |^complete /.test(String(a))).slice(-8);
  return [...new Set([...rest, ...opsLog.slice(-8), ...compute])].slice(-16);
}

async function raiseOwnedLeverage(network, positions) {
  const owned = (positions ?? []).filter((p) => isOwnedLeg(p.symbol, p.side));
  const ids = [...new Set(owned.map((p) => p.symbol).filter(Boolean))].filter((id) => !levDone.has(id));
  if (!ids.length) {
    levDone.clear();
    return null;
  }
  const take = ids.slice(0, 3);
  const current = {};
  for (const p of owned) current[`${p.symbol}:${p.side}`] = Number(p.leverage) || 0;
  const armed = await armMaxLeverage({ network, connId: CONN, symbols: take, current });
  if (armed.paused) noteApiFail({ error: "100410 frequency limit" });
  else for (const id of take) levDone.add(id);
  if (armed.raised) return `lev raise ${armed.raised}/${take.length} · peak ${armed.max}x`;
  return `lev hold ${take.length} · peak ${armed.max}x`;
}

let lastBook = { pos: 0, ord: 0, pnl: 0, ok: false, sl: 0, tp: 0, equity: 0, positions: [], orders: [], latencyMs: 0, foreignPos: 0, foreignOrd: 0 };
let lastTrail = { n: 0, ms: 0, at: 0 };
let lastExec = { n: 0, wins: 0, pf: 0, wr: 0, net: 0, ddt: 0, mdd: 0 };
let lastPnl = [];
let lastIncomeOrders = [];
const lastPostedSl = new Map();
const lastPostedTp = new Map();
const lastPeakPx = new Map();
const lastProtectQty = new Map();
const bookAvg = { pos: 0, ord: 0, n: 0 };
let cachedOverall = null;
let cachedOverallTick = -1;
let lastOverallWrite = 0;

const BLOCK = {
  ...DEFAULT_BLOCK_CONFIG,
  enabled: true,
  endStageOnly: false,
  cadence: 4,
  flattenConflict: false,
  addOnWin: false,
  maxMultiple: 6,
  minMultiple: 1,
  overall: true,
  overallSymbol: true,
  overallDirection: true,
  overallSharedStack: "additive",
  counts: [...LIVE_BLOCK_COUNTS],
  volumeRatio: IS_X01 ? 0.1 : 0.2,
  overallVolumeRatio: IS_X01 ? 1 : 1.5,
  sharedVolumeRatio: IS_X01 ? 1 : 1.5,
  maxVolumeMultiplier: IS_X01 ? 2.5 : 8,
  pfRatio: 1.45,
  pauseCountRatio: 0,
  evalPosCount: 6,
  activeLive: true,
  minActiveLevel: 1,
  keepAdjusted: true,
  stack: true,
  windows: true,
  volumeMode: "parallel",
  overallMode: "parallel",
  sides: "both",
  evalHours: 2,
  autoEval: true,
  relAdditive: true,
  relVolumeRatio: IS_X01 ? 0.1 : 0.2,
  minRelPf: 1.05,
  evalLastNs: [...LIVE_BLOCK_COUNTS],
  liveLastN: 12,
  liveDisable: true,
  liveDisableMinPf: DEFAULT_BLOCK_PF,
  liveDisableMinSamples: 4,
  lastNProgress: sanitizeLastNProgress(undefined),
};

const STRAT = { ...DEFAULT_STRATEGY_TOGGLES, normal: false, trailing: true, axis: false, block: true, dca: false };

const LIVE_CFG = { trailingPct: 1.5, tpRatio: 1 / 1.75, dcaCount: 1, slAtr: 0.7, tpAtr: 0.45, slOfTp: 1.75, shortRange: true, maxHoldTicks: 24, maxHoldBars: 3, axisLevels: 5 };
const LIVE_SHORT_TACTICS = ["trailing"];
const BASE_GRID = LIVE_SHORT_TACTICS.flatMap((tactic) =>
  ["atr", "fibonacci"].map((range) => ({
    tactic,
    range,
    cfg: { ...DEFAULT_TACTIC_CONFIG, ...LIVE_CFG, dcaCount: 1 },
  })),
);
let shortMinTp = DEFAULT_SHORT_MIN_TP_ATR;
let shortMinSl = DEFAULT_SHORT_MIN_SL_OF_TP;
let shortMaxTp = 0.6;
let shortEvalPositive = true;
let shortPositive = SHORT_20H_POSITIVE.map((c) => ({ tpAtr: c.tpAtr, slOfTp: c.slOfTp }));

function shortGridCombos() {
  return filterLiveShortCombos(shortMinTp, shortMinSl, shortMaxTp, shortEvalPositive, shortPositive);
}

const SHORT_GRID = shortGridCombos().flatMap((s) =>
  LIVE_SHORT_TACTICS.map((tactic) => ({
    tactic,
    range: "atr",
    cfg: { ...DEFAULT_TACTIC_CONFIG, ...LIVE_CFG, ...s, dcaCount: 1, maxHoldTicks: 24 },
  })),
);
let GRID = [...SHORT_GRID];
function preferWinner(list = GRID) {
  return (
    list.find((g) => g.cfg.tpAtr === SHORT_WINNER.tpAtr && g.cfg.slOfTp === SHORT_WINNER.slOfTp && g.tactic === "trailing") ||
    list[0]
  );
}
const prefer = preferWinner(GRID);
if (prefer) GRID = [prefer, ...GRID.filter((g) => g !== prefer)];
let currentPick = GRID[0];

function rebuildShortGrid() {
  GRID = shortGridCombos().flatMap((s) =>
    LIVE_SHORT_TACTICS.map((tactic) => ({
      tactic,
      range: "atr",
      cfg: { ...DEFAULT_TACTIC_CONFIG, ...LIVE_CFG, ...s, dcaCount: 1, maxHoldTicks: 24 },
    })),
  );
  const hit = preferWinner(GRID);
  if (hit) GRID = [hit, ...GRID.filter((g) => g !== hit)];
  if (currentPick) {
    const same = GRID.find((g) => g.tactic === currentPick.tactic && g.cfg.tpAtr === currentPick.cfg.tpAtr && g.cfg.slOfTp === currentPick.cfg.slOfTp);
    currentPick = same || GRID[0];
  }
}
const DISABLED_FILE = process.env.CTS_A_DISABLED ?? (IS_X01 ? "/var/lib/cts-a/live-disabled.json" : "/var/lib/cts-a/live-disabled-x02.json");

const PROTECT_FILE = process.env.CTS_A_PROTECT ?? (IS_X01 ? "/var/lib/cts-a/protect-grid.json" : "/var/lib/cts-a/protect-grid-x02.json");
function loadProtectCells() {
  const allowedTrail = new Set(TRAIL_PCTS);
  const floor = allProtectCells().filter((c) =>
    Number(c.tpAtr) >= 0.8 && Number(c.slOfTp) >= 1 && Number(c.slOfTp) <= 1.25 && allowedTrail.has(Number(c.trailPct)),
  );
  try {
    const raw = JSON.parse(readFileSync(PROTECT_FILE, "utf8"));
    const cells = Array.isArray(raw?.cells) ? raw.cells : Array.isArray(raw) ? raw : [];
    const minPf = LIVE_MIN_PF;
    const ok = cells.filter((c) =>
      Number(c.tpAtr) >= 0.8 &&
      Number(c.slOfTp) >= 1 &&
      Number(c.slOfTp) <= 1.25 &&
      Number(c.trailPct) >= 1.5 &&
      allowedTrail.has(Number(c.trailPct)) &&
      (c.pf == null || Number(c.pf) >= minPf),
    );
    if (ok.length >= 6) {
      return ok.map((c) => ({
        slAtr: Number(c.slAtr),
        tpRatio: Number(c.tpRatio),
        trailPct: Number(c.trailPct) || 1.5,
        tpAtr: Number(c.tpAtr),
        slOfTp: Number(c.slOfTp),
      }));
    }
  } catch {}
  return floor;
}
let protectCells = loadProtectCells();
function protectFor(symbol) {
  const cells = cfgUsesShortRange(currentPick?.cfg) ? shortProtectCells() : protectCells;
  return pickProtectCell(String(symbol || "BTCUSDT"), cells);
}

function shortProtectCells() {
  return shortGridCombos().map((c) => ({
    slAtr: c.slAtr,
    tpRatio: c.tpRatio,
    trailPct: Number(currentPick?.cfg?.trailingPct) || 1.5,
    tpAtr: c.tpAtr,
    slOfTp: c.slOfTp,
  }));
}
function gridLive(e) {
  const dis = e?.liveDisabled || {};
  const minTp = shortMinTp;
  const minSl = shortMinSl;
  const filtered = GRID.filter((g) => {
    if (g.tactic === "dca" && !(e?.strategyToggles ?? STRAT).dca) return false;
    if (g.tactic === "axis" && dis[`tac:axis`]) return false;
    if (g.tactic !== "trailing" && dis[`tac:${g.tactic}`]) return false;
    if (!g.cfg?.shortRange && dis[`rng:${g.range}`]) return false;
    if (g.cfg?.shortRange && (Number(g.cfg.tpAtr) + 1e-9 < minTp || Number(g.cfg.tpAtr) - 1e-9 > shortMaxTp || Number(g.cfg.slOfTp) + 1e-9 < minSl)) return false;
    return true;
  });
  if (filtered.length) return filtered;
  const prefer = GRID.filter((g) => g.tactic === "trailing" && Number(g.cfg?.tpAtr) === SHORT_WINNER.tpAtr && Number(g.cfg?.slOfTp) === SHORT_WINNER.slOfTp);
  return prefer.length ? prefer : GRID.slice(0, 1);
}
function persistDisabled(e) {
  try {
    const body = {
      at: Date.now(),
      minPf: LIVE_MIN_PF,
      disabled: e.liveDisabled || {},
      kept: e.liveHealth?.kept || [],
      factor: e.relVolumeFactor || 0,
      winners: Object.keys(e.blockRelBest || {}),
    };
    writeFileSync(DISABLED_FILE, JSON.stringify(body, null, 2));
  } catch {
    /* keep */
  }
}

function loadDisabled(e) {
  try {
    const raw = JSON.parse(readFileSync(DISABLED_FILE, "utf8"));
    const dis = raw?.disabled && typeof raw.disabled === "object" ? raw.disabled : {};
    e.liveDisabled = { ...(e.liveDisabled || {}), ...dis };
    const kept = Array.isArray(raw?.kept) ? raw.kept : [];
    e.liveHealth = {
      n: Object.keys(e.liveDisabled).length,
      at: e.tick || 0,
      disabled: Object.keys(e.liveDisabled),
      kept,
    };
    return Object.keys(dis).length;
  } catch {
    return 0;
  }
}

function applyTape(e, tickers) {
  applyLiveTape(e, tickers);
  const ranked = rankUniverse(e);
  const top = ranked[0];
  const v = top ? vol1hOf(e.quotes[top.id]) : 0;
  if (top && v > 0) e.lastMsg = `Live BingX tape · vol1h ${top.id} ${(v * 100).toFixed(2)}% first`;
  const rows = (e.closed || []).slice(0, 80).map((c) => ({
    volume: Math.max(1e-9, Math.abs(Number(c.qty) * Number(c.entry)) || Number(e.quotes[c.symbol]?.vol1h) || 1),
    pnl: Number(c.pnl) || 0,
  }));
  if (rows.length >= 2) {
    const vc = volumeCoord(rows);
    e.relVolumeFactor = vc.vf;
    if (vc.confirm === "diverge" && e.tick % 40 === 0) {
      e.lastMsg = `vol coord diverge vf ${vc.vf.toFixed(2)} · low-vol WR ${(vc.lowVolWr * 100).toFixed(0)}%`;
    }
  }
  return tickers.filter((t) => t.last > 0 && e.quotes[t.id]).map((t) => t.id);
}

let lastVolAt = 0;
async function refreshVol1h(e, network) {
  if (Date.now() - lastVolAt < 180000) return 0;
  lastVolAt = Date.now();
  const map = await fetchVol1h(network);
  let n = 0;
  for (const [id, v] of map) {
    const q = e.quotes[id];
    if (q && v > 0) {
      q.vol1h = v;
      n += 1;
    }
  }
  return n;
}

function pickFromSweep() {
  return GRID[0];
}

function gridIndex(pick, list = GRID) {
  const i = list.findIndex(
    (g) =>
      g.tactic === pick.tactic &&
      g.range === pick.range &&
      Boolean(g.cfg?.shortRange) === Boolean(pick.cfg?.shortRange) &&
      Number(g.cfg?.tpAtr || 0) === Number(pick.cfg?.tpAtr || 0) &&
      Number(g.cfg?.slOfTp || 0) === Number(pick.cfg?.slOfTp || 0),
  );
  return i < 0 ? 0 : i;
}

function snapshot(e, extra) {
  if (lastPnl.length) ingestLivePnls(e, lastPnl, BLOCK);
  const audit = e.tick % 40 === 0 ? auditEngine(e) : { nanCount: 0, issues: [] };
  const book = bookCounts(e);
  if (!cachedOverall || e.tick - cachedOverallTick >= 8) {
    cachedOverall = overallLiveStats(e);
    cachedOverallTick = e.tick;
  }
  const overall = overlayExchangeBook(structuredClone(cachedOverall), lastBook, e);
  if (lastExec.n >= 2) {
    overall.overall = {
      key: "closed",
      n: lastExec.n,
      wins: lastExec.wins,
      pf: lastExec.pf,
      wr: lastExec.wr,
      net: lastExec.net,
      ddt: lastExec.ddt,
      mdd: lastExec.mdd,
    };
    overall.pf = lastExec.pf;
    overall.wr = lastExec.wr;
    overall.net = lastExec.net;
    overall.trades = lastExec.n;
  }
  if (lastPnl.length) {
    lastPnl = lastPnl.map((r) => {
      if (r.indication && r.side) return r;
      const closed = e.closed.find((c) => c.symbol === r.symbol && Math.abs(Number(c.at || 0) - Number(r.t)) < 180000);
      const hint = e.liveLegHint?.[r.symbol];
      return {
        ...r,
        side: r.side || closed?.side || hint?.side,
        indication: r.indication || closed?.indication || hint?.indication,
        playbook: r.playbook || closed?.playbook || hint?.playbook,
        kind: r.kind || closed?.kind || hint?.kind,
        tactic: r.tactic || closed?.tactic || hint?.tactic,
      };
    });
    overlayLiveExecutions(overall, lastPnl, Date.now(), e);
  }
  const last12 = overall.lastN?.["12"] ?? null;
  const tapeReady = (lastExec.n >= 2) || (e.ledger.trades >= 4 && Number(e.stats.pf) > 0);
  const rawLive = lastExec.n >= 2 ? lastExec.pf : last12?.n >= 4 ? last12.pf : e.stats.pf;
  const rawPf = lastExec.n >= 2 ? lastExec.pf : e.stats.pf;
  const clampPf = (v, n) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x <= 0) return 0;
    return x;
  };
  const livePf = clampPf(rawLive, last12?.n ?? e.ledger.trades);
  const pf = clampPf(rawPf, e.ledger.trades);
  const closedNet = lastExec.n >= 2 ? lastExec.net : e.ledger.profit - e.ledger.loss;
  const openNet = Number.isFinite(lastBook.pnl) ? lastBook.pnl : 0;
  const { systemNet } = systemProcessedNet(closedNet, openNet);
  const net = systemNet;
  overall.systemNet = systemNet;
  overall.closedNet = closedNet;
  overall.openNet = openNet;
  const wr = lastExec.n >= 2 ? lastExec.wr : tapeReady ? e.stats.wr : Number(last12?.wr || e.stats.wr);
  const tapeThin = e.ledger.trades < 12;
  const positive = Number.isFinite(livePf) && livePf >= 1 && (tapeThin || ((last12?.net ?? net) >= -0.05 && ((last12?.wr ?? wr) >= 0.36 || livePf >= 1.5)));
  return {
    ...extra,
    pf,
    wr,
    net,
    mdd: e.stats.mdd,
    trades: lastExec.n >= 2 ? lastExec.n : e.ledger.trades,
    wins: lastExec.n >= 2 ? lastExec.wins : e.ledger.wins,
    slots: lastBook.pos || book.positions.slots,
    legs: lastBook.pos || (lastBook.positions ?? []).length,
    long: (lastBook.positions ?? []).filter((p) => p.side === "long").length,
    short: (lastBook.positions ?? []).filter((p) => p.side === "short").length,
    working: lastBook.ord || book.orders.working,
    queued: book.orders.queued,
    placed: book.orders.placed,
    filled: book.orders.filled,
    liveOrders: lastBook.ord || book.orders.live,
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
    liveOwned: (lastBook.positions ?? []).filter((p) => isOwnedLeg(p.symbol, p.side)).length,
    owned: [...mirrored].filter((k) => typeof k === "string" && (k.startsWith("own:") || k.startsWith("live:") || k.startsWith("seed:"))),
    foreignPos: lastBook.foreignPos || 0,
    foreignOrd: lastBook.foreignOrd || 0,
    liveLevMin: (() => {
      const xs = (lastBook.positions ?? []).map((p) => Number(p.leverage) || 0).filter((n) => n > 0);
      return xs.length ? Math.min(...xs) : 0;
    })(),
    liveLevMax: (() => {
      const xs = (lastBook.positions ?? []).map((p) => Number(p.leverage) || 0).filter((n) => n > 0);
      return xs.length ? Math.max(...xs) : 0;
    })(),
    liveLevAvg: (() => {
      const xs = (lastBook.positions ?? []).map((p) => Number(p.leverage) || 0).filter((n) => n > 0);
      return xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0;
    })(),
    liveLevBelowMax: (lastBook.positions ?? []).filter((p) => {
      const cur = Number(p.leverage) || 0;
      if (!(cur > 0) || !p.symbol) return false;
      const venue = BINGX_SYMBOL[p.symbol] ?? `${String(p.symbol).replace(/USDT$/i, "")}-USDT`;
      const cap = cachedMaxLeverage(NETWORK_PREF === "mainnet" ? "mainnet" : "testnet", CONN, venue);
      return cap > 0 && cur + 1e-9 < cap;
    }).length,
    closedNet,
    openNet,
    systemNet,
    avgLivePos: bookAvg.n ? bookAvg.pos / bookAvg.n : lastBook.pos,
    avgLiveOrd: bookAvg.n ? bookAvg.ord / bookAvg.n : lastBook.ord,
    overall,
    tape: lastPnl.slice(0, 800).map((r) => ({
      t: Number(r.t) || 0,
      v: Number(r.v) || 0,
      symbol: r.symbol || "",
      side: r.side || "",
      indication: r.indication || "",
      playbook: r.playbook || "",
      kind: r.kind || "",
      tactic: r.tactic || "",
    })),
    livePf,
    last12,
    phase: e.phase,
    sessionPhase: extra.sessionPhase ?? e.phase,
    bookPos: lastBook.positions ?? [],
    bookOrd: lastBook.orders ?? [],
    lastApi: lastApiError,
    bookMs: lastBook.latencyMs || 0,
    trailN: lastTrail.n,
    trailMs: lastTrail.ms,
    partials: e.stats?.partials ?? book.orders.partial,
    controlGap: Math.max(0, (lastBook.pos || 0) - Math.min(lastBook.sl || 0, lastBook.tp || 0)),
    minPf: LIVE_MIN_PF,
    pfGate: pfGateClosed(),
    liveDisabled: Object.keys(e.liveDisabled ?? {}).length,
    blockOverall: {
      on: e.blockCfg?.overall !== false,
      enabled: e.blockCfg?.enabled !== false,
      vr: e.blockCfg?.overallVolumeRatio ?? e.blockCfg?.volumeRatio,
      sharedVr: e.blockCfg?.sharedVolumeRatio,
      relVr: e.blockCfg?.volumeRatio,
      mode: e.blockCfg?.volumeMode,
      ovMode: e.blockCfg?.overallMode,
      counts: e.blockCfg?.counts,
      windows: Object.fromEntries(
        Object.entries(e.blockWindows || {}).map(([n, w]) => [
          n,
          { closed: w.closed, lastPf: w.lastPf, lastNet: w.lastNet, adjusted: w.adjusted, pauseLeft: w.pauseLeft },
        ]),
      ),
      lastBlockAt: e.lastBlockAt || 0,
    },
    evals: {
      at: e.lastRelEvalTick || 0,
      factor: Number(e.relVolumeFactor || 0),
      winners: Object.keys(e.blockRelBest || {}).slice(0, 8),
      disabled: e.liveHealth?.disabled?.length ?? Object.keys(e.liveDisabled ?? {}).length,
      kept: e.liveHealth?.kept?.length ?? 0,
      hour: e.hourCoord?.hour ?? 0,
      hourInd: e.hourCoord?.bestInd || "",
      hourTac: e.hourCoord?.bestTac || "",
      performing: (e.hourCoord?.performing || e.performingSymbols || []).length,
      skipped: (e.hourCoord?.skipped || []).length,
      indRange: e.indRangeBest || {},
      indTactic: e.indTacticBest || {},
      grid: GRID.length,
      short: SHORT_GRID.length,
      liveGrid: gridLive(e).length,
    },
    indMix: (() => {
      const mix = { trend: 0, break: 0, active: 0, direction: 0 };
      for (const p of lastBook.positions ?? []) {
        const id = classifyIndication(e, p.symbol);
        mix[id] = (mix[id] || 0) + 1;
      }
      return mix;
    })(),
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
    symbolCount: LIVE_SYMBOLS,
    orderType: "limit",
    lastN: VALID_EXEC_POS_N,
    lastNs: { picks: VALID_EXEC_POS_N, lanes: VALID_EXEC_POS_N, last: VALID_EXEC_POS_N, ongoing: VALID_EXEC_POS_N, next: VALID_EXEC_POS_N, combos: VALID_EXEC_POS_N },
    lastNLinked: true,
    lastNProgress: sanitizeLastNProgress(undefined),
    costStep: 10,
    liveTape: true,
    comboOnlyPositive: true,
    comboTactic: "all",
    comboRange: "all",
    enabledKinds: [...DEFAULT_ENABLED_KINDS],
    strategyId: "normal",
    minPf: LIVE_MIN_PF,
    thresholds: { minPf: LIVE_MIN_PF, basePf: DEFAULT_BASE_PF, axisPf: DEFAULT_AXIS_PF, blockPf: DEFAULT_BLOCK_PF, shortPf: DEFAULT_SHORT_PF, shortBasePf: DEFAULT_SHORT_BASE_PF, maxMdd: 0.12, minWr: 0.55, minVf: 1.12, maxDdt: 18 },
    activeConnId: CONN,
    evalHours: [...AUTO_EVAL_HOURS],
    evalLastNs: [EVAL_POS_N, VALID_EXEC_POS_N, LIVE_DISABLE_N],
    sessionPhase: extra.sessionPhase ?? "running",
    hedgeMode: true,
    marginMode: "cross",
    useMaxLeverage: true,
    leverage: 0,
    minSizeRatio: 1,
    shortRange: true,
    liveGrid: GRID.length,
    shortGrid: SHORT_GRID.length,
    activePresetId: extra.activePresetId ?? "stable-02",
    strategyToggles: { ...STRAT },
    shortProgress: sanitizeShortProgress({
      ...DEFAULT_SHORT_PROGRESS,
      minTpAtr: shortMinTp,
      minSlOfTp: shortMinSl,
      maxTpAtr: shortMaxTp,
      evalHours: SHORT_EVAL_HOURS,
      evalPositiveOnly: shortEvalPositive,
    }),
    ...extra,
  };
  try {
    mkdirSync("/var/lib/cts-a", { recursive: true });
    writeFileSync(SETTINGS, JSON.stringify(body, null, 2));
  } catch {
    writeFileSync(SETTINGS.includes("x02") ? "/tmp/cts-a-desk-settings-x02.json" : "/tmp/cts-a-desk-settings.json", JSON.stringify(body, null, 2));
  }
}

function readSettingsPick() {
  try {
    return JSON.parse(readFileSync(SETTINGS, "utf8"));
  } catch {
    try {
      return JSON.parse(readFileSync(SETTINGS.includes("x02") ? "/tmp/cts-a-desk-settings-x02.json" : "/tmp/cts-a-desk-settings.json", "utf8"));
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
    const tmpStatus = STATUS.includes("x02") ? "/tmp/cts-a-vst-session-x02.json" : "/tmp/cts-a-vst-session.json";
    writeFileSync(tmpStatus, JSON.stringify(s));
  }
}

let lastStatusAt = 0;
function wantStatus(force) {
  if (!force && Date.now() - lastStatusAt < 2000) return false;
  lastStatusAt = Date.now();
  return true;
}

function isRateLimited(s) {
  return /100410|109418|110424|frequency limit|disabled period|too many request|rate limit|over 20|over 30/i.test(String(s || ""));
}

function quietMs(s) {
  const msg = String(s || "");
  const m = msg.match(/unblocked after\s+(\d{10,})/i);
  if (m) {
    let ts = Number(m[1]);
    if (Number.isFinite(ts) && ts > 0) {
      if (ts < 1e12) ts *= 1000;
      const wait = ts - Date.now() + 2000;
      if (wait > 2000) return Math.min(480_000, wait);
    }
  }
  return /109418|480000|over 20/i.test(msg) ? 120_000 : 25_000;
}

function protectKind(t) {
  const u = String(t || "").toUpperCase();
  if (u.includes("STOP") && !u.includes("TAKE_PROFIT") && !u.includes("TRAILING")) return "sl";
  if (u.includes("TAKE_PROFIT") || u.includes("TRAILING")) return "tp";
  return "";
}

function countProtect(positions, orders) {
  const sl = new Set();
  const tp = new Set();
  for (const o of orders ?? []) {
    const k = `${o.symbol}:${o.side}`;
    const kind = protectKind(o.type);
    if (kind === "sl") sl.add(k);
    else if (kind === "tp") tp.add(k);
  }
  let nSl = 0;
  let nTp = 0;
  for (const p of positions ?? []) {
    const k = `${p.symbol}:${p.side}`;
    if (sl.has(k)) nSl += 1;
    if (tp.has(k)) nTp += 1;
  }
  return { sl: nSl, tp: nTp };
}

function deskExecRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => UNI.has(String(r.key || r.id || "")));
}

function foldExec(rows) {
  let n = 0;
  let wins = 0;
  let profit = 0;
  let loss = 0;
  for (const r of rows) {
    n += Math.max(0, Number(r.n ?? r.trades) || 0);
    wins += Math.max(0, Number(r.wins) || 0);
    const p = Number(r.profit);
    const l = Number(r.loss);
    if (Number.isFinite(p) && Number.isFinite(l)) {
      profit += Math.max(0, p);
      loss += Math.max(0, l);
    } else {
      const net = Number(r.net) || 0;
      if (net >= 0) profit += net;
      else loss += -net;
    }
  }
  const pf = profitFactor(profit, loss);
  return {
    n,
    wins,
    pf: Number.isFinite(pf) ? pf : 0,
    wr: n ? wins / n : 0,
    net: profit - loss,
    ddt: 0,
    mdd: 0,
  };
}

function venueOf(id) {
  const s = String(id || "");
  return BINGX_SYMBOL[s] ?? (s.includes("-") ? s : `${s.replace(/USDT$/i, "")}-USDT`);
}

const vanishedLegs = [];
function rememberLeg(symbol, side, extra = {}) {
  if (!symbol || (side !== "long" && side !== "short")) return;
  vanishedLegs.unshift({ symbol, side, t: Date.now(), ...extra });
  if (vanishedLegs.length > 500) vanishedLegs.length = 500;
}
function hintFor(symbol, t) {
  return vanishedLegs.find((v) => v.symbol === symbol && Math.abs((Number(t) || Date.now()) - v.t) < 180_000);
}
function sideFromOrders(symbol, t) {
  const hits = lastIncomeOrders.filter((o) => o.symbol === symbol && Math.abs(Number(o.time || 0) - Number(t || 0)) < 300_000);
  if (!hits.length) return undefined;
  const close = hits.find((o) => /TAKE_PROFIT|STOP|CLOSE|LIQUID/i.test(String(o.type || "")) || Number(o.pnl));
  const side = String((close || hits[0])?.side || "").toLowerCase();
  return side === "short" || side === "long" ? side : undefined;
}

function ingestExec(ex) {
  if (!ex?.ok) return;
  const desk = filterDeskRealized(ex.orders, ex.income, CONN);
  lastIncomeOrders = desk.tagged;
  const rows = desk.pnl
    .filter((x) => isDeskSymbol(x.symbol))
    .map((x) => {
      const symbol = String(x.symbol || "");
      const t = Number(x.time) || 0;
      const h = hintFor(symbol, t);
      return {
        t,
        v: Number(x.income) || 0,
        symbol,
        side: h?.side || sideFromOrders(symbol, t),
        indication: h?.indication,
        playbook: h?.playbook,
        kind: h?.kind,
        tactic: h?.tactic,
      };
    })
    .filter((r) => r.t > 0 && Number.isFinite(r.v));
  if (rows.length) lastPnl = rows;
  if (desk.realized.n > 0 && lastExec.n < 2) {
    lastExec = { ...lastExec, ...desk.realized };
  }
}

async function pruneUnlisted(network) {
  try {
    const map = await fetchContractMap(network);
    if (!map.size) return 0;
    let n = 0;
    for (const s of universeSymbols(LIVE_SYMBOLS)) {
      if (!map.has(venueOf(s.id))) {
        deadSymbols.add(s.id);
        skipUntil.set(s.id, Date.now() + 86_400_000);
        n += 1;
      }
    }
    return n;
  } catch {
    return 0;
  }
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

let liveBusy = 0;
let liveLast = 0;
let claimed = false;
let emptyHold = 0;
let apiQuietUntil = 0;
let lastApiError = "";
const cancelFailed = new Set();
const skipUntil = new Map();
const skippedFills = new Set();
const deadSymbols = new Set();
function markDeadSymbol(symbol, err) {
  const id = String(symbol || "");
  if (!id) return false;
  const msg = String(err || "");
  if (!/offline currently|not in api|does not exist|not exist|invalid symbol|symbol not exist/i.test(msg)) return false;
  deadSymbols.add(id);
  skipUntil.set(id, Date.now() + 86_400_000);
  return true;
}
const trimHits = new Map();
function sizeNotional(equity) {
  const eq = Math.max(0, Number(equity) || 0);
  return eq * POSITION_COST_PCT * 0.3;
}
function liveVolMul(e) {
  const vf = Number(e?.relVolumeFactor);
  if (Number.isFinite(vf) && vf > 0) {
    if (vf < 0.95) return Math.max(0.35, Math.min(0.7, vf));
    return Math.max(0.45, Math.min(0.8, 0.85 / vf));
  }
  return 0.45;
}
function liveNotional(e, f, equity, rel) {
  const note = String(f?.note || rel?.note || rel?.playbook || "");
  const blockHit = /Block/i.test(note) || rel?.playbook === "block";
  if (!blockHit) return 0;
  const n = Math.max(1, Number(rel?.blockLevel) || 1);
  const overall = /Overall Block/i.test(note);
  const shared = /shared/i.test(note);
  let vr = 0.1;
  if (shared) vr = Math.min(3, Math.max(0.4, Number(BLOCK.sharedVolumeRatio) || 1));
  else if (overall) vr = Math.min(3, Math.max(0.4, Number(BLOCK.overallVolumeRatio) || 1));
  else vr = Math.min(1, Math.max(0.1, Number(BLOCK.volumeRatio) || 0.1)) * n;
  return sizeNotional(equity) * vr * liveVolMul(e);
}

function mergeLivePositions(e, book) {
  const conn = e.activeConnId || CONN;
  const byKey = new Map();
  for (const p of e.positions || []) {
    if (p?.connId === conn) byKey.set(`${p.symbol}:${p.side}`, p);
  }
  for (const p of book?.positions || []) {
    if (!isOwnedLeg(p.symbol, p.side)) continue;
    if (!(p.qty > 0)) continue;
    const key = `${p.symbol}:${p.side}`;
    const entry = Number(p.entry) || Number(p.mark) || 0;
    const mark = Number(p.mark) || entry;
    if (!(entry > 0)) continue;
    const cur = byKey.get(key);
    if (cur) {
      cur.qty = p.qty;
      cur.plannedQty = Math.max(cur.plannedQty || 0, p.qty);
      cur.avgEntry = entry;
      cur.mark = mark;
      cur.unrealized = Number(p.pnl) || cur.unrealized || 0;
      if (!cur.playbook || cur.playbook === "normal") {
        cur.playbook = e.strategyToggles?.normal === false && e.strategyToggles?.block ? "block" : "short";
        if (cur.kind === "trend" || cur.kind === "normal") cur.kind = "short";
      }
      if (!cur.kind) cur.kind = "short";
      e.liveLegHint = e.liveLegHint || {};
      e.liveLegHint[p.symbol] = { side: p.side, indication: cur.indication, tactic: cur.tactic, playbook: cur.playbook, kind: cur.kind, rangeType: cur.controllingRange };
      continue;
    }
    const slDist = Math.max(mark * 0.002, 1e-8);
    e.positions.push({
      id: `ex:${key}`,
      connId: conn,
      symbol: p.symbol,
      side: p.side,
      qty: p.qty,
      plannedQty: p.qty,
      avgEntry: entry,
      mark,
      sl: p.side === "long" ? entry - slDist : entry + slDist,
      tp: p.side === "long" ? entry + slDist * 2 : entry - slDist * 2,
      slDist,
      tpDist: slDist * 2,
      realized: 0,
      unrealized: Number(p.pnl) || 0,
      legs: [{ orderId: `ex:${key}`, qty: p.qty, px: entry }],
      controllingRange: e.lastRange || "atr",
      rangeSpacing: slDist,
      status: "open",
      openedTick: e.tick,
      tactic: e.lastTactic,
      indication: classifyIndication(e, p.symbol),
      kind: "short",
      playbook: "short",
      peakPx: mark,
    });
  }
}

function liveMaxPos() {
  const eq = Number(lastBook.equity) || 0;
  return liveEntryBudget(eq).maxPos;
}

function isMarginFail(s) {
  return /insufficient margin|maximum open amount|available amount|lower the leverage/i.test(String(s || ""));
}

function liveBudgetNow() {
  return liveEntryBudget(Number(lastBook.equity) || 0);
}

function pfGateClosed() {
  return lastExec.n >= 8 && lastExec.pf + 1e-9 < LIVE_MIN_PF;
}

/** First-seen wall time per owned live leg — short-range hold matches sim minutes. */
const openedAt = new Map();
const MAX_HOLD_MS = Math.max(4, Number(LIVE_CFG.maxHoldTicks) || 24) * 60_000;

function cellProtectOf(p, spec, network) {
  const entry = Number(p.entry || p.mark || 0);
  const cell = protectFor(p.symbol);
  const mode = network === "mainnet" ? "main" : "vst";
  return { cell, ...liveProtectPrices(entry, p.side, cell.slAtr, cell.tpRatio, spec, mode), entry };
}

function slIsLooser(side, curSl, wantSl) {
  if (!(curSl > 0) || !(wantSl > 0)) return false;
  return side === "long" ? curSl < wantSl * 0.998 : curSl > wantSl * 1.002;
}

function tpIsLooser(side, curTp, wantTp) {
  if (!(curTp > 0) || !(wantTp > 0)) return false;
  return side === "long" ? curTp > wantTp * 1.002 : curTp < wantTp * 0.998;
}

async function flattenBelowMinPf(network, book, e) {
  if (apiQuiet()) return null;
  const owned = (book.positions ?? []).filter((p) => isOwnedLeg(p.symbol, p.side) && Number(p.qty) > 0);
  const liveKeys = new Set(owned.map((p) => `${p.symbol}:${p.side}`));
  for (const k of [...openedAt.keys()]) if (!liveKeys.has(k)) openedAt.delete(k);
  const now = Date.now();
  const map = await fetchContractMap(network);
  const notes = [];
  let n = 0;
  const ranked = [...owned].sort((a, b) => Number(a.pnl || 0) - Number(b.pnl || 0));
  for (const p of ranked) {
    if (n >= 3 || apiQuiet()) break;
    const key = `${p.symbol}:${p.side}`;
    if (!openedAt.has(key)) openedAt.set(key, now);
    const age = now - openedAt.get(key);
    const spec = map.get(p.venueSymbol);
    const prot = cellProtectOf(p, spec, network);
    if (!(prot.entry > 0)) continue;
    const mark = Number(p.mark || prot.entry);
    const slDist = Math.abs(prot.sl - prot.entry);
    const mtmDist = p.side === "long" ? prot.entry - mark : mark - prot.entry;
    const pastSl = slDist > 0 && mtmDist > slDist * 1.05;
    const loser = Number(p.pnl) <= 0 || mtmDist > 0;
    const timed = age >= MAX_HOLD_MS && loser;
    if (!pastSl && !timed) continue;
    const r = await closeHit(network, p);
    if (r?.ok) {
      n += 1;
      openedAt.delete(key);
      mirrored.delete(`own:${key}`);
      mirrored.delete(`live:${key}`);
      taggedKeys.delete(key);
      notes.push(pastSl ? `flat SL ${p.symbol}` : `flat time ${p.symbol}`);
    } else {
      noteApiFail(r);
    }
  }
  return notes.length ? notes.join(" · ") : null;
}

function apiQuiet() {
  if (Date.now() >= apiQuietUntil) {
    if (lastApiError && isRateLimited(lastApiError)) lastApiError = "";
    return false;
  }
  return true;
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

async function mapLimit(items, n, fn) {
  if (!items.length) return [];
  const ret = new Array(items.length);
  let i = 0;
  const w = Math.max(1, Math.min(n, items.length));
  await Promise.all(
    Array.from({ length: w }, async () => {
      for (;;) {
        const idx = i;
        i += 1;
        if (idx >= items.length) return;
        ret[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return ret;
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
  if (!isOwnedLeg(hit.symbol, hit.side)) return { ok: false, error: "foreign" };
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
      closePosition: false,
      reduceOnly: false,
      attachProtect: false,
    }),
  );
}

async function ensureProtect(network, book, cfg, vanished = new Set(), e = null) {
  if (apiQuiet()) return null;
  const hasSl = new Set();
  const hasTp = new Set();
  const grouped = new Map();
  const kindOf = (t) => {
    const u = String(t || "").toUpperCase();
    if (u.includes("STOP") && !u.includes("TAKE_PROFIT") && !u.includes("TRAILING")) return "sl";
    if (u.includes("TAKE_PROFIT") || u.includes("TRAILING")) return "tp";
    return "";
  };
  const owned = (book.positions ?? []).filter((p) => isOwnedLeg(p.symbol, p.side));
  const liveOwnedSet = new Set(owned.map((p) => `${p.symbol}:${p.side}`));
  for (const o of book.orders ?? []) {
    if (!mayCancelOrder(o)) continue;
    const key = `${o.symbol}:${o.side}`;
    const k = kindOf(o.type);
    if (!k) continue;
    if (k === "sl") hasSl.add(key);
    else hasTp.add(key);
    const cur = grouped.get(key) ?? { sl: [], tp: [] };
    cur[k].push(o);
    grouped.set(key, cur);
  }
  lastBook.sl = countProtect(owned, (book.orders ?? []).filter((o) => mayCancelOrder(o))).sl;
  lastBook.tp = countProtect(owned, (book.orders ?? []).filter((o) => mayCancelOrder(o))).tp;
  const missing = owned.filter((p) => {
    const key = `${p.symbol}:${p.side}`;
    return !hasSl.has(key) || !hasTp.has(key);
  });
  const extras = [...grouped.entries()].some(([key, g]) => liveOwnedSet.has(key) && ((g.sl?.length ?? 0) > 1 || (g.tp?.length ?? 0) > 1));
  const stray = [...grouped.keys()].some((key) => !liveOwnedSet.has(key));
  const map = await fetchContractMap(network);
  const notes = [];
  const cancelOne = async (o) => {
    const oid = String(o?.id || "");
    if (!oid || cancelFailed.has(oid)) return { ok: false, id: oid };
    if (!mayCancelOrder(o)) return { ok: false, id: oid, error: "foreign" };
    const r = await withLiveBusy(() =>
      cancelSwapOrder({
        network,
        connId: CONN,
        symbol: o.venueSymbol || o.symbol,
        orderId: oid,
      }),
    );
    if (!r.ok) {
      cancelFailed.add(oid);
      noteApiFail(r);
    }
    return { ...r, id: oid };
  };

  const strayJobs = [];
  for (const [key, g] of grouped) {
    if (liveOwnedSet.has(key)) continue;
    for (const o of [...(g.sl || []), ...(g.tp || [])]) {
      if (mayCancelOrder(o)) strayJobs.push({ key, o });
    }
  }
  const strayOut = await mapLimit(strayJobs.slice(0, 2), 1, async (job) => {
    const r = await cancelOne(job.o);
    if (r.ok) {
      mirrored.delete(`sl:${job.key}`);
      mirrored.delete(`tp:${job.key}`);
      mirrored.delete(`own:${job.key}`);
      mirrored.delete(`live:${job.key}`);
    }
    return r.ok;
  });
  const strayN = strayOut.filter(Boolean).length;
  if (strayN) notes.push(`stray ${strayN}`);

  const leftoverJobs = (book.orders ?? []).filter((o) => mayCancelOrder(o) && !kindOf(o.type));
  if (leftoverJobs.length) {
    const leftoverOut = await mapLimit(leftoverJobs.slice(0, 6), 2, cancelOne);
    const n = leftoverOut.filter((r) => r?.ok).length;
    if (n) notes.push(`partial ${n}`);
  }

  const extraJobs = [];
  for (const [key, g] of grouped) {
    if (!liveOwnedSet.has(key)) continue;
    const pos = owned.find((p) => `${p.symbol}:${p.side}` === key);
    const entry = Number(pos?.entry || pos?.mark || 0);
    const side = pos?.side === "short" ? "short" : "long";
    for (const kind of ["sl", "tp"]) {
      const list = (g[kind] || []).filter((o) => mayCancelOrder(o));
      if (!list || list.length <= 1) continue;
      const tk = `${key}:${kind}`;
      if ((trimHits.get(tk) || 0) >= 3) continue;
      list.sort((a, b) => {
        const da = Math.abs(Number(a.stopPrice || a.price || 0) - entry);
        const db = Math.abs(Number(b.stopPrice || b.price || 0) - entry);
        return db - da;
      });
      for (const extra of list.slice(1)) extraJobs.push({ tk, kind, extra });
    }
  }
  const extraOut = await mapLimit(extraJobs.slice(0, 4), 2, async (job) => {
    const r = await cancelOne(job.extra);
    if (r.ok) {
      trimHits.set(job.tk, (trimHits.get(job.tk) || 0) + 1);
      return `trim ${job.kind} ${job.extra.symbol}`;
    }
    return null;
  });
  notes.push(...extraOut.filter(Boolean));

  const posByVol = [...owned].sort(
    (a, b) => vol1hOf(e?.quotes?.[b.symbol]) - vol1hOf(e?.quotes?.[a.symbol]),
  );
  const closeRetry = (err) => /closePosition|close position|available amount|quantity|position/i.test(String(err || ""));
  let posts = 0;

  const protectOne = async (p, driftSl, driftTp) => {
    const local = [];
    let n = 0;
    const key = `${p.symbol}:${p.side}`;
    if (!isOwnedLeg(p.symbol, p.side)) return { notes: local, posts: n };
    const px = p.mark || p.entry || 0;
    if (!(px > 0) || !(p.qty > 0)) return { notes: local, posts: n };
    const spec = map.get(p.venueSymbol);
    const cell = protectFor(p.symbol);
    const slAtr = cell.slAtr;
    const tpRatio = cell.tpRatio;
    const cellProt = liveProtectPrices(px, p.side, slAtr, tpRatio, spec, network === "mainnet" ? "main" : "vst");
    const shortLive = cfgUsesShortRange(cfg) || cfgUsesShortRange(currentPick?.cfg) || true;
    const g0 = grouped.get(key);
    const prot = shortLive
      ? cellProt
      : (() => {
          const enginePos = e?.positions?.find((x) => x.symbol === p.symbol && x.side === p.side);
          const wide = pickWidestProtect(p.side, p.entry || px, [
            { sl: cellProt.sl, tp: cellProt.tp },
            enginePos ? { sl: enginePos.sl, tp: enginePos.tp } : {},
            ...((g0?.sl || []).map((o) => ({ sl: Number(o.stopPrice || o.price || 0) }))),
            ...((g0?.tp || []).map((o) => ({ tp: Number(o.stopPrice || o.price || 0) }))),
          ]);
          return { ...cellProt, sl: wide.sl || cellProt.sl, tp: wide.tp || cellProt.tp };
        })();
    const protectQty = (availUsdt = 0) => {
      let q = p.qty;
      if (availUsdt > 0 && px > 0) q = Math.min(q, (availUsdt * 0.98) / px);
      q = snapQtyDown(q, spec);
      if (!(q > 0) && !(availUsdt > 0)) q = snapQtyDown(p.qty, spec);
      return q;
    };
    if (driftSl || driftTp) {
      const g = grouped.get(key);
      const drop = [];
      if (driftSl) drop.push(...(g?.sl || []));
      if (driftTp) drop.push(...(g?.tp || []));
      await mapLimit(drop, 4, cancelOne);
      if (driftSl) hasSl.delete(key);
      if (driftTp) hasTp.delete(key);
      n += drop.length;
    }
    const placeProtect = async (type, qty, closeAll = true) => {
      const body = {
        network,
        connId: CONN,
        symbol: p.symbol,
        side: p.side === "long" ? "SELL" : "BUY",
        positionSide: p.side === "long" ? "LONG" : "SHORT",
        quantity: closeAll ? 0 : qty,
        type,
        price: px,
        stopPrice: type === "STOP_MARKET" ? prot.sl : prot.tp,
        notional: Math.max(1, (closeAll ? p.qty : qty) * px),
        confirmLive: true,
        slAtr,
        tpRatio,
        attachProtect: false,
        closePosition: closeAll,
        reduceOnly: false,
        exactQty: !closeAll,
      };
      let r = await withLiveBusy(() => placeSwapOrder(body));
      n += 1;
      if (!r.ok && closeRetry(r.error) && closeAll) {
        r = await withLiveBusy(() => placeSwapOrder({ ...body, closePosition: true, quantity: 0 }));
        n += 1;
      }
      if (!r.ok && closeRetry(r.error) && closeAll) {
        const q2 = protectQty(parseAvailableUsdt(r.error));
        if (q2 > 0) {
          r = await withLiveBusy(() => placeSwapOrder({ ...body, closePosition: false, exactQty: true, quantity: q2, notional: Math.max(0.5, q2 * px) }));
          n += 1;
        }
      }
      return r;
    };
    const attach = async (kind, type, tag) => {
      let qty = protectQty();
      if (!(qty > 0) && !(p.qty > 0)) return `${kind} skip ${p.symbol} qty`;
      mirrored.add(tag);
      let r = await placeProtect(type, qty, true);
      if (!r.ok && parseAvailableUsdt(r.error) > 0) {
        qty = protectQty(parseAvailableUsdt(r.error));
        r = await placeProtect(type, qty, qty <= 0);
      }
      if (!r.ok && /available amount|quantity/i.test(String(r.error || ""))) {
        r = await placeProtect(type, 0, true);
      }
      if (!r.ok) {
        mirrored.delete(tag);
        noteApiFail(r);
        return `${kind} skip ${p.symbol} ${String(r.error ?? "err").slice(0, 80)}`;
      }
      lastProtectQty.set(key, qty);
      if (kind === "sl") hasSl.add(key);
      else hasTp.add(key);
      return `${kind} ${p.symbol}`;
    };
    if (!hasSl.has(key) && !apiQuiet()) {
      local.push(await attach("sl", "STOP_MARKET", `sl:${key}`));
      await sleep(120);
    }
    if (!hasTp.has(key) && !apiQuiet()) {
      local.push(await attach("tp", "TAKE_PROFIT_MARKET", `tp:${key}`));
    }
    return { notes: local, posts: n };
  };

  const need = [];
  for (const p of posByVol) {
    if (!isOwnedLeg(p.symbol, p.side)) continue;
    const key = `${p.symbol}:${p.side}`;
    if (!(p.qty > 0) || !((p.mark || p.entry) > 0)) continue;
    const g = grouped.get(key);
    const slQ = Number(g?.sl?.[0]?.remaining ?? g?.sl?.[0]?.qty ?? 0);
    const tpQ = Number(g?.tp?.[0]?.remaining ?? g?.tp?.[0]?.qty ?? 0);
    const wantQ = p.qty;
    const prevQ = Number(lastProtectQty.get(key) || 0);
    const entry = Number(p.entry || p.mark || 0);
    const curSl = Number(g?.sl?.[0]?.stopPrice || lastPostedSl.get(key) || 0);
    const curTp = Number(g?.tp?.[0]?.stopPrice || lastPostedTp.get(key) || 0);
    const cell = protectFor(p.symbol);
    const spec = map.get(p.venueSymbol);
    const cellProt = liveProtectPrices(entry || p.mark, p.side, cell.slAtr, cell.tpRatio, spec, network === "mainnet" ? "main" : "vst");
    const slLoose = hasSl.has(key) && slIsLooser(p.side, curSl, cellProt.sl);
    const tpLoose = hasTp.has(key) && tpIsLooser(p.side, curTp, cellProt.tp);
    const slDrift =
      hasSl.has(key) &&
      wantQ > 0 &&
      ((slQ > 0 && Math.abs(wantQ - slQ) / Math.max(wantQ, slQ) > 0.08) ||
        (prevQ > 0 && slQ <= 0 && Math.abs(wantQ - prevQ) / Math.max(wantQ, prevQ) > 0.08) ||
        slLoose);
    const tpDrift =
      hasTp.has(key) &&
      ((tpQ > 0 && Math.abs(wantQ - tpQ) / Math.max(wantQ, tpQ) > 0.08) || tpLoose);
    if (slDrift || tpDrift || !hasSl.has(key) || !hasTp.has(key)) need.push({ p, slDrift, tpDrift, missing: !hasSl.has(key) || !hasTp.has(key) });
  }
  need.sort((a, b) => Number(b.missing) - Number(a.missing) || Number(a.p.pnl || 0) - Number(b.p.pnl || 0));
  for (let i = 0; i < Math.min(need.length, 6) && posts < 12; i += 1) {
    if (apiQuiet()) break;
    const row = need[i];
    const r = await protectOne(row.p, row.missing ? false : row.slDrift, row.missing ? false : row.tpDrift);
    posts += r.posts;
    notes.push(...r.notes);
    await sleep(120);
  }

  const trailT0 = Date.now();
  let trailed = 0;
  const protectGapNow = Math.max(0, (lastBook.pos || 0) - Math.min(lastBook.sl || 0, lastBook.tp || 0));
  if (posts < 48 && !apiQuiet() && protectGapNow === 0 && STRAT.trailing) {
    const mode = network === "mainnet" ? "main" : "vst";
    const trailNeed = [];
    for (const p of posByVol) {
      if (trailNeed.length >= 16) break;
      if (!isOwnedLeg(p.symbol, p.side)) continue;
      const key = `${p.symbol}:${p.side}`;
      if (!hasSl.has(key)) continue;
      const mark = p.mark || p.entry || 0;
      const entry = p.entry || mark;
      if (!(mark > 0) || !(entry > 0) || !(p.qty > 0)) continue;
      const profit = p.side === "long" ? mark - entry : entry - mark;
      if (!(profit > 0)) continue;
      const spec = map.get(p.venueSymbol);
      const cell = protectFor(p.symbol);
      const atEntry = liveProtectPrices(entry, p.side, cell.slAtr, cell.tpRatio, spec, mode);
      const peak = p.side === "long"
        ? Math.max(mark, Number(lastPeakPx.get(key) || mark))
        : Math.min(mark, Number(lastPeakPx.get(key) || mark));
      lastPeakPx.set(key, peak);
      let next = trailStopFromPeak({
        side: p.side,
        entry,
        peak,
        tp: atEntry.tp,
        sl: atEntry.sl,
        trailPct: Number(cell.trailPct) || Number(cfg?.trailingPct) || 1.5,
        shortRange: true,
      });
      next = snapPx(next, spec);
      const slOrd = (grouped.get(key)?.sl || [])[0];
      const cur = Number(lastPostedSl.get(key) || slOrd?.stopPrice || 0);
      const tick = spec?.pxPrec != null ? Math.pow(10, -Math.max(0, spec.pxPrec)) : mark * 1e-4;
      const minMove = Math.max(tick * 3, mark * 0.0004);
      const improved = p.side === "long" ? next > cur + minMove : next < cur - minMove;
      if (!improved || !(next > 0)) continue;
      if (p.side === "long" && !(next < mark)) continue;
      if (p.side === "short" && !(next > mark)) continue;
      trailNeed.push({ p, key, spec, cell, mark, next, slOrd });
    }
    const trailOut = await mapLimit(trailNeed.slice(0, 4), 2, async (row) => {
      const { p, key, spec, cell, mark, next, slOrd } = row;
      const slId = String(slOrd?.id || "");
      if (slId) {
        if (!mayCancelOrder(slOrd)) return null;
        const c = await cancelOne(slOrd);
        if (!c.ok && !/not exist|filled|nothing to cancel|no need/i.test(String(c.error || ""))) {
          return null;
        }
        hasSl.delete(key);
      }
      const qty = snapQtyDown(p.qty, spec);
      const body = {
        network,
        connId: CONN,
        symbol: p.symbol,
        side: p.side === "long" ? "SELL" : "BUY",
        positionSide: p.side === "long" ? "LONG" : "SHORT",
        quantity: qty,
        type: "STOP_MARKET",
        price: mark,
        stopPrice: next,
        notional: Math.max(1, qty * mark),
        confirmLive: true,
        slAtr: cell.slAtr,
        tpRatio: cell.tpRatio,
        attachProtect: false,
        closePosition: false,
        reduceOnly: false,
      };
      let r = await withLiveBusy(() => placeSwapOrder(body));
      if (!r.ok && closeRetry(r.error)) {
        r = await withLiveBusy(() => placeSwapOrder({ ...body, reduceOnly: false, closePosition: false }));
      }
      if (r.ok) {
        lastPostedSl.set(key, next);
        lastProtectQty.set(key, qty);
        hasSl.add(key);
        return `trail ${p.symbol}`;
      }
      noteApiFail(r);
      return `trail skip ${p.symbol} ${String(r.error || "err").slice(0, 60)}`;
    });
    for (const t of trailOut) {
      if (t) {
        notes.push(t);
        if (String(t).startsWith("trail ")) trailed += 1;
      }
    }
  }
  if (e && posts < 48 && !apiQuiet() && protectGapNow === 0) {
    const axisNeed = [];
    for (const p of posByVol) {
      if (axisNeed.length >= 8) break;
      if (!isOwnedLeg(p.symbol, p.side)) continue;
      const q = e.quotes?.[p.symbol];
      if (!q || !(q.px > 0)) continue;
      const indication = classifyIndication(e, p.symbol);
      const tactic = tacticForIndication(indication, e?.strategyToggles ?? STRAT);
      if (tactic !== "axis" && tactic !== "hybrid") continue;
      const key = `${p.symbol}:${p.side}`;
      if (!hasTp.has(key)) continue;
      const mark = p.mark || p.entry || q.px;
      const entry = p.entry || mark;
      if (!(mark > 0) || !(entry > 0)) continue;
      const spec = map.get(p.venueSymbol);
      const spacing = Math.max(q.atr * 0.5, entry * 0.001);
      const axis = q.axis > 0 ? q.axis : q.px;
      const risk = Math.max(spacing, Math.abs(entry - mark) * 0.5, q.atr * 0.45);
      let want = p.side === "long"
        ? Math.max(axis + spacing * 0.2, entry + risk * 0.95)
        : Math.min(axis - spacing * 0.2, entry - risk * 0.95);
      want = snapPx(want, spec);
      const tpOrd = (grouped.get(key)?.tp || [])[0];
      const cur = Number(lastPostedTp.get(key) || tpOrd?.price || tpOrd?.stopPrice || 0);
      const tick = spec?.pxPrec != null ? Math.pow(10, -Math.max(0, spec.pxPrec)) : mark * 1e-4;
      const minMove = Math.max(tick * 3, mark * 0.0004);
      const wider = p.side === "long" ? want > cur + minMove : want < cur - minMove;
      if (!wider || !(want > 0)) continue;
      if (p.side === "long" && !(want > mark)) continue;
      if (p.side === "short" && !(want < mark)) continue;
      axisNeed.push({ p, key, spec, mark, want, tpOrd });
    }
    const axisOut = await mapLimit(axisNeed, 4, async (row) => {
      const { p, key, spec, mark, want, tpOrd } = row;
      const tpId = String(tpOrd?.id || "");
      if (tpId) {
        if (!mayCancelOrder(tpOrd)) return null;
        const c = await cancelOne(tpOrd);
        if (!c.ok && !/not exist|filled|nothing to cancel|no need/i.test(String(c.error || ""))) return null;
        hasTp.delete(key);
      }
      const qty = snapQtyDown(p.qty, spec);
      const r = await withLiveBusy(() =>
        placeSwapOrder({
          network,
          connId: CONN,
          symbol: p.symbol,
          side: p.side === "long" ? "SELL" : "BUY",
          positionSide: p.side === "long" ? "LONG" : "SHORT",
          quantity: qty,
          type: "TAKE_PROFIT_MARKET",
          stopPrice: want,
          confirmLive: true,
          attachProtect: false,
          closePosition: false,
          reduceOnly: false,
          notional: Math.max(1, qty * mark),
          price: mark,
        }),
      );
      if (r.ok) {
        lastPostedTp.set(key, want);
        hasTp.add(key);
        return `axis tp ${p.symbol}`;
      }
      noteApiFail(r);
      return null;
    });
    for (const t of axisOut) if (t) notes.push(t);
  }
  lastTrail = { n: trailed, ms: Date.now() - trailT0, at: Date.now() };
  const prot = countProtect(lastBook.positions ?? book.positions ?? [], lastBook.orders ?? book.orders ?? []);
  const taggedSl = [...mirrored].filter((t) => String(t).startsWith("sl:")).length;
  const taggedTp = [...mirrored].filter((t) => String(t).startsWith("tp:")).length;
  lastBook.sl = Math.max(prot.sl, taggedSl);
  lastBook.tp = Math.max(prot.tp, taggedTp);
  if (notes.length) return notes.filter(Boolean).slice(0, 4).join(" · ");
  return null;
}

async function mirrorToExchange(e, network, cfg) {
  if (apiQuiet()) return null;
  const gapNow = Math.max(0, (lastBook.pos || 0) - Math.min(lastBook.sl || 0, lastBook.tp || 0));
  if (Date.now() - liveLast < (gapNow > 0 ? 250 : 700)) return;
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
  const orderBookMissing = !(book.orders?.length) && Boolean(book.error);
  if (orderBookMissing && lastBook.orders?.length) {
    book = { ...book, orders: lastBook.orders };
  }
  noteApiOk();
  if ((book.positions?.length ?? 0) === 0 && lastBook.pos > 0) {
    try {
      await sleep(250);
      const again = await fetchExchangeBook({ network, connId: CONN });
      if (again?.ok && (again.positions?.length ?? 0) > 0) book = again;
      else if (again && !again.ok) noteApiFail(again);
    } catch (err) {
      noteApiFail(err);
    }
  }
  emptyHold = 0;
  refreshTaggedKeys(book.orders);
  const livePosKeys = new Set((book.positions ?? []).map((p) => `${p.symbol}:${p.side}`));
  let n = 0;
  for (const k of taggedKeys) {
    if (!livePosKeys.has(k)) continue;
    if (!mirrored.has(`own:${k}`)) {
      mirrored.add(`own:${k}`);
      mirrored.add(`live:${k}`);
      n += 1;
    }
  }
  const deskPos = (book.positions ?? []).filter((p) => isOwnedLeg(p.symbol, p.side));
  const deskOrd = (book.orders ?? []).filter((o) => isDeskOrder(o));
  const foreignPosN = (book.positions ?? []).filter((p) => !isOwnedLeg(p.symbol, p.side)).length;
  const foreignOrdN = (book.orders ?? []).filter((o) => !isDeskOrder(o)).length;
  const prot = countProtect(deskPos, deskOrd);
  lastBook = {
    pos: deskPos.length,
    ord: deskOrd.length,
    pnl: deskPos.reduce((s, p) => s + (p.pnl || 0), 0),
    ok: true,
    sl: prot.sl,
    tp: prot.tp,
    equity: Number(book.equity) || lastBook.equity || 0,
    latencyMs: Number(book.latencyMs) || 0,
    foreignPos: foreignPosN,
    foreignOrd: foreignOrdN,
    positions: deskPos.map((p) => {
      const indication = e ? classifyIndication(e, p.symbol) : "trend";
      const tactic = e ? tacticForIndication(indication, e.strategyToggles ?? STRAT) : "trailing";
      const playbook = openPlaybook(tactic, indication);
      return {
        connId: CONN,
        symbol: p.symbol,
        venueSymbol: p.venueSymbol,
        side: p.side,
        qty: p.qty,
        entry: p.entry,
        mark: p.mark,
        pnl: p.pnl,
        leverage: Number(p.leverage) || 0,
        indication,
        tactic,
        playbook,
        kind: kindFromIndication(indication, playbook, tactic),
        owned: true,
      };
    }),
    orders: deskOrd.slice(0, 250).map((o) => ({
      connId: CONN,
      id: String(o.id ?? ""),
      symbol: o.symbol,
      venueSymbol: o.venueSymbol,
      side: o.side,
      qty: o.qty,
      filled: Number(o.filled) || 0,
      remaining: o.remaining != null ? Number(o.remaining) : o.qty,
      price: o.price,
      stopPrice: o.stopPrice,
      status: o.status,
      type: o.type,
      closePosition: Boolean(o.closePosition),
      reduceOnly: Boolean(o.reduceOnly),
      clientOrderId: o.clientOrderId,
      owned: Boolean(o.owned || isDeskOrder(o)),
    })),
  };
  try {
    syncLivePartials(e, lastBook);
  } catch {
    /* keep */
  }
  bookAvg.n += 1;
  bookAvg.pos += lastBook.pos;
  bookAvg.ord += lastBook.ord;
  const exchangeOccupied = new Set((book.positions ?? []).filter((p) => isUniverseSymbol(p.symbol)).map((p) => `${p.symbol}:${p.side}`));
  const ownedOccupied = new Set(deskPos.map((p) => `${p.symbol}:${p.side}`));
  const vanished = new Set();
  for (const p of e.positions || []) {
    const k = `${p.symbol}:${p.side}`;
    if (!ownedOccupied.has(k)) vanished.add(k);
  }
  const dropped = releaseVanished(e, ownedOccupied, CONN);
  const forget = (key) => {
    mirrored.delete(`own:${key}`);
    mirrored.delete(`live:${key}`);
    mirrored.delete(`sl:${key}`);
    mirrored.delete(`tp:${key}`);
    mirrored.delete(`seed:${key}`);
    skipUntil.delete(String(key).split(":")[0]);
  };
  for (const k of vanished) {
    const [sym, side] = String(k).split(":");
    const pos = (e.positions || []).find((p) => p.symbol === sym && p.side === side);
    rememberLeg(sym, side, pos ? { indication: pos.indication, playbook: pos.playbook, kind: pos.kind, tactic: pos.tactic } : {});
    if (!livePosKeys.has(k)) forget(k);
  }
  for (const tag of [...mirrored]) {
    if (typeof tag !== "string") continue;
    if (tag.startsWith("own:") || tag.startsWith("live:") || tag.startsWith("sl:") || tag.startsWith("tp:") || tag.startsWith("seed:")) {
      const rest = tag.slice(tag.indexOf(":") + 1);
      if (rest && !livePosKeys.has(rest)) forget(rest);
    }
  }
  if (n) claimed = true;
  const notes = [];
  if (dropped) notes.push(`manual ${dropped}`);
  if (n) notes.push(`own ${n}`);
  if (foreignPosN || foreignOrdN) notes.push(`foreign ${foreignPosN}p/${foreignOrdN}o held`);
  const guard = await ensureProtect(network, book, cfg, vanished, e);
  if (guard) notes.push(guard);
  const flat = await flattenBelowMinPf(network, book, e);
  if (flat) notes.push(flat);
  const protectGap = lastBook.pos - Math.min(lastBook.sl, lastBook.tp);
  const paperOpen = new Set((e.positions || []).map((p) => `${p.symbol}:${p.side}`));
  for (const k of paperOpen) mirrored.delete(`seed:${k}`);
  const ours = deskPos;
  const openN = ours.length;
  const accountN = (book.positions ?? []).filter((p) => isUniverseSymbol(p.symbol)).length;
  const budget = liveBudgetNow();
  if (!budget.trade || budget.maxPos <= 0) {
    notes.push(`equity empty ${Number(book.equity || lastBook.equity || 0).toFixed(4)}`);
    return notes.filter(Boolean).slice(0, 4).join(" · ");
  }
  if (openN >= budget.maxPos) return notes.length ? notes.join(" · ") : null;
  if (protectGap > 0) {
    notes.push(`protect gap ${protectGap}`);
    return notes.filter(Boolean).slice(0, 4).join(" · ");
  }

  let placed = 0;
  let failed = 0;
  const fillJobs = [];
  const queueIntents = (e.queue ?? [])
    .filter((o) => o && (o.kind === "short" || o.playbook === "short" || /Block|short/i.test(String(o.note || ""))))
    .map((o) => ({
      id: `q:${o.id}`,
      orderId: o.id,
      symbol: o.symbol,
      side: o.side,
      px: Number(o.price) || Number(e.quotes?.[o.symbol]?.px) || 0,
      kind: "entry",
      playbook: o.playbook,
      note: o.note,
      _fromQueue: true,
    }));
  for (const f of [...e.fills, ...queueIntents]) {
    if (fillJobs.length >= 6) break;
    if (mirrored.has(f.id) || skippedFills.has(f.id)) continue;
    if (f.kind !== "entry" && f.kind !== "partial") continue;
    if (e.lastTactic === "dca" || /dca/i.test(String(f.playbook || f.note || ""))) {
      mirrored.add(f.id);
      continue;
    }
    if ((skipUntil.get(f.symbol) || 0) > Date.now()) continue;
    if (deadSymbols.has(f.symbol)) continue;
    if (skipLiveSymbol(e, f.symbol, Math.round(BLOCK.evalPosCount || 1))) {
      skippedFills.add(f.id);
      continue;
    }
    {
      const order = [...e.orders, ...e.queue].find((o) => o.id === f.orderId);
      const pos = e.positions.find((p) => p.symbol === f.symbol && p.side === f.side);
      const ind = classifyIndication(e, f.symbol);
      const kind = order?.kind ?? pos?.kind ?? kindFromIndication(ind, openPlaybook(e.lastTactic, ind), e.lastTactic);
      const playbook = order?.playbook ?? pos?.playbook;
      const rangeType = order?.rangeType ?? pos?.controllingRange ?? e.lastRange;
      const indication = order?.indication ?? pos?.indication ?? ind;
      const rel = {
        symbol: f.symbol,
        side: f.side,
        tactic: order?.tactic ?? e.lastTactic,
        playbook,
        kind,
        note: order?.note ?? f.note,
        blockLevel: order?.level ?? pos?.blockLevel,
        indication,
        rangeType,
      };
      if (!liveShouldExecute(e, rel) || liveRelationDisabled(e, { ...rel, indication, kind, tactic: rel.tactic, rangeType })) {
        skippedFills.add(f.id);
        continue;
      }
      f._rel = rel;
    }
    if (!isUniverseSymbol(f.symbol)) {
      mirrored.add(f.id);
      continue;
    }
    const isBlockAdd = /Block/i.test(String(f.note || f._rel?.note || f.playbook || ""));
    if (isBlockAdd && !budget.block) continue;
    if (!isBlockAdd && (exchangeOccupied.has(`${f.symbol}:${f.side}`) || fillJobs.some((x) => x.symbol === f.symbol && x.side === f.side))) {
      mirrored.add(f.id);
      continue;
    }
    if (isBlockAdd && fillJobs.some((x) => x.symbol === f.symbol && x.side === f.side)) continue;
    if (isBlockAdd && fillJobs.filter((x) => /Block/i.test(String(x.note || x._rel?.note || ""))).length >= budget.maxNew) continue;
    if (!isBlockAdd && openN + fillJobs.length >= budget.maxPos) break;
    if (apiQuiet()) break;
    fillJobs.push(f);
  }
  const fillOut = await mapLimit(fillJobs, 2, async (f) => {
    try {
      const r = await withLiveBusy(() =>
        placeSwapOrder({
          network,
          connId: CONN,
          symbol: f.symbol,
          side: f.side === "long" ? "BUY" : "SELL",
          positionSide: f.side === "long" ? "LONG" : "SHORT",
          quantity: 0,
          type: "MARKET",
          price: f.px,
          notional: liveNotional(e, f, book.equity, f._rel),
          confirmLive: true,
          slAtr: protectFor(f.symbol).slAtr,
          tpRatio: protectFor(f.symbol).tpRatio,
          attachProtect: false,
          equity: Number(book.equity) || 0,
        }),
      );
      return { f, r };
    } catch (err) {
      return { f, r: { ok: false, error: err instanceof Error ? err.message : "err" }, threw: true };
    }
  });
  for (const row of fillOut) {
    const { f, r, threw } = row;
    if (!r?.ok) {
      skippedFills.add(f.id);
      const err = String(r?.error ?? "err");
      const dead = markDeadSymbol(f.symbol, err);
      if (!dead && !/min notional exceeds|TP Price|SL Price|must be (greater|lower)/i.test(err)) {
        skipUntil.set(f.symbol, Date.now() + (isRateLimited(r?.error) ? 480_000 : 90_000));
      }
      const quiet = noteApiFail(r);
      failed += 1;
      if (dead) notes.push(`offline ${f.symbol}`);
      else notes.push(`skip ${f.symbol} ${err.slice(0, 80)}`);
      if (threw) return `live throw ${err}`;
      if (quiet || failed >= 4) break;
      continue;
    }
    mirrored.add(f.id);
    mirrored.add(`own:${f.symbol}:${f.side}`);
    mirrored.add(`live:${f.symbol}:${f.side}`);
    taggedKeys.add(`${f.symbol}:${f.side}`);
    exchangeOccupied.add(`${f.symbol}:${f.side}`);
    placed += 1;
    notes.push(`live ${f.symbol} ${f.side}`);
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
  if (e.running && lastBook.pos < liveMaxPos() && book.orders.queued < 12) {
    requeueFree(e, pick.cfg, pick.tactic, pick.range, CONN);
    return lastBook.pos > 0 ? "rearm short" : "rearm empty book";
  }
  if (lastBook.pos > 0) return null;
  if (e.running && book.orders.live + book.orders.queued === 0 && e.positions.length === 0) {
    requeueFree(e, pick.cfg, pick.tactic, pick.range, CONN);
    return "rearm empty book";
  }
  return null;
}

function applyExecFromSettings(remote) {
  if (!remote || typeof remote !== "object") {
    configureLiveExecution({ hedgeMode: true, marginMode: "cross", useMaxLeverage: true, leverage: 0, minSizeRatio: 1 });
    return;
  }
  configureLiveExecution({
    hedgeMode: true,
    marginMode: remote.marginMode === "isolated" ? "isolated" : "cross",
    useMaxLeverage: true,
    leverage: 0,
    minSizeRatio: Number(remote.minSizeRatio) || 1,
  });
}

function migrateBlockVol(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0 || Math.abs(x - 0.08) < 1e-6) return 0.4;
  return Math.min(1, Math.max(0.1, x));
}
function migrateOverallVol(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0 || Math.abs(x - 0.08) < 1e-6) return 1;
  return Math.min(1, Math.max(0.4, x));
}

function x02VolFromRemote(bc) {
  const add = Number(bc?.volumeRatio);
  const rel = Number(bc?.relVolumeRatio);
  const shr = Number(bc?.sharedVolumeRatio);
  const ov = Number(bc?.overallVolumeRatio);
  const stale = !(add >= 0.15) || !(shr >= 1.2) || !(ov >= 1.2);
  if (stale) {
    return {
      volumeRatio: BLOCK.volumeRatio,
      relVolumeRatio: BLOCK.relVolumeRatio,
      sharedVolumeRatio: BLOCK.sharedVolumeRatio,
      overallVolumeRatio: BLOCK.overallVolumeRatio,
    };
  }
  return {
    volumeRatio: clampBlockVol(add),
    relVolumeRatio: clampBlockVol(Number.isFinite(rel) && rel > 0 ? rel : add),
    sharedVolumeRatio: clampSharedVol(shr),
    overallVolumeRatio: clampOverallVol(ov),
  };
}

function applyPfGates(engine, remote) {
  const th = remote?.thresholds || {};
  const overall = IS_X01
    ? Math.max(DEFAULT_MIN_PF, Number(th.minPf) || LIVE_MIN_PF)
    : Math.max(DEFAULT_SHORT_PF, Number(th.shortPf) || LIVE_MIN_PF);
  const base = Math.max(1, Number(th.basePf) || DEFAULT_BASE_PF);
  const axis = Math.max(1, Number(th.axisPf) || DEFAULT_AXIS_PF);
  const blockPf = Math.max(1, Number(th.blockPf) || DEFAULT_BLOCK_PF);
  const shortPf = Math.max(0.8, Number(th.shortPf) || DEFAULT_SHORT_PF);
  const shortBase = Math.max(0.5, Number(th.shortBasePf) || DEFAULT_SHORT_BASE_PF);
  const bc = remote?.blockConfig || {};
  engine.minPf = overall;
  engine.basePf = base;
  engine.axisPf = axis;
  engine.blockPf = blockPf;
  engine.shortPf = shortPf;
  engine.shortBasePf = shortBase;
  engine.shortRange = remote?.tacticConfig?.shortRange !== false;
  const sp = sanitizeShortProgress(remote?.shortProgress);
  engine.shortProgress = sp;
  engine.shortPf = sp.overallPf;
  engine.shortBasePf = sp.basePf;
  engine.shortAxisPf = sp.axisPf;
  engine.shortBlockPf = sp.blockPf;
  shortMinTp = sp.minTpAtr;
  shortMinSl = sp.minSlOfTp;
  shortMaxTp = sp.maxTpAtr ?? 0.6;
  shortEvalPositive = sp.evalPositiveOnly !== false;
  rebuildShortGrid();
  const ln = sanitizeLastNProgress(remote?.lastNProgress ?? remote?.blockConfig?.lastNProgress ?? DEFAULT_LAST_N_PROGRESS);
  engine.lastNProgress = ln;
  const vol = IS_X01
    ? { volumeRatio: 0.1, relVolumeRatio: 0.1, sharedVolumeRatio: 1, overallVolumeRatio: 1 }
    : x02VolFromRemote(bc);
  engine.blockCfg = {
    ...(engine.blockCfg || BLOCK),
    ...BLOCK,
    overall: true,
    overallSymbol: true,
    overallDirection: true,
    overallSharedStack: "additive",
    enabled: true,
    ...vol,
    overallMode: "parallel",
    volumeMode: "parallel",
    minRelPf: blockPf,
    liveDisableMinPf: blockPf,
    lastNProgress: ln,
  };
}

async function main() {
  const started = Date.now();
  const ends = started + HOURS * 3600 * 1000;
  let pick = pickFromSweep();
  currentPick = pick;
  const engine = initVstEngine(pick.cfg, { warmup: 0, symbolCount: LIVE_SYMBOLS, orderType: "limit", arm: false, block: BLOCK, costStep: 3 });
  const seededOff = loadDisabled(engine);
  engine.running = true;
  engine.phase = "running";
  engine.activeConnId = CONN;
  engine.symbolCount = LIVE_SYMBOLS;
  engine.minPf = LIVE_MIN_PF;
  engine.basePf = DEFAULT_BASE_PF;
  engine.axisPf = DEFAULT_AXIS_PF;
  engine.blockPf = DEFAULT_BLOCK_PF;
  engine.shortPf = DEFAULT_SHORT_PF;
  engine.shortBasePf = DEFAULT_SHORT_BASE_PF;
  engine.shortRange = true;
  engine.liveTape = true;
  engine.strategyToggles = { ...STRAT };
  engine.blockCfg = { ...BLOCK, liveDisableMinPf: DEFAULT_BLOCK_PF, minRelPf: DEFAULT_BLOCK_PF, enabled: STRAT.block };
  let seededLosers = 0;
  try {
    const prev = JSON.parse(readFileSync(OVERALL, "utf8"));
    const rows = deskExecRows(prev?.executions?.bySymbol);
    if (Array.isArray(prev?.executions?.income) && prev.executions.income.length) {
      ingestExec({ ok: true, income: prev.executions.income });
    }
    if (rows.length) {
      applyRealizedSymbolStats(engine, rows);
      seededLosers = rows.filter((r) => Number(r.n || r.trades) >= 2 && Number(r.pf) + 1e-9 < LIVE_MIN_PF).length;
      const folded = foldExec(rows);
      if (folded.n > 0) lastExec = { ...lastExec, ...folded };
    }
    const rz = prev?.executions?.realized;
    if (lastExec.n < 2 && rz && Number(rz.n) > 0) {
      lastExec = {
        n: Number(rz.n) || 0,
        wins: Number(rz.wins) || 0,
        pf: Number(rz.pf) || 0,
        wr: Number(rz.wr) || 0,
        net: Number(rz.net) || 0,
        ddt: Number(rz.ddt) || 0,
        mdd: Number(rz.mdd) || 0,
      };
    }
    if (lastExec.n > 0) {
      engine.stats.trades = lastExec.n;
      engine.stats.pf = lastExec.pf;
      engine.stats.wr = lastExec.wr;
      engine.stats.net = lastExec.net;
      engine.ledger.trades = lastExec.n;
      engine.ledger.wins = lastExec.wins;
    }
  } catch {
    /* first run */
  }

  let ping = await pingVst();
  applyExecFromSettings(readSettingsPick());
  applyPfGates(engine, readSettingsPick());
  writeSettingsPick(pick, { rev: Date.now() % 1e9, locked: false });
  const adjustments = [`seed ${pick.tactic}/${pick.range} · ${CONN} · ${LIVE_SYMBOLS} sym · PF ${engine.minPf}/${engine.basePf}/${engine.axisPf}/${engine.blockPf} short ${engine.shortPf}/${engine.shortBasePf} · grid ${GRID.length} TP ${pick.cfg.tpAtr}/${pick.cfg.slOfTp} · block ${engine.blockCfg.sharedVolumeRatio}/${engine.blockCfg.volumeRatio}/${engine.blockCfg.overallVolumeRatio}`];
  if (seededLosers) adjustments.push(`seed skip ${seededLosers} loser symbols`);
  if (seededOff) adjustments.push(`seed disable ${seededOff} relations`);
  if (lastExec.n) adjustments.push(`seed exec n=${lastExec.n} PF ${lastExec.pf.toFixed(2)}`);
  if (ping.pingOk) adjustments.push(`BingX ${ping.network} ping ok · eq ${ping.equity.toFixed(2)}`);
  else adjustments.push(`BingX ping failed · ${ping.error ?? "auth"} · paper tape`);
  if (ping.pingOk) {
    loadLeverageCaps();
    try {
      const mode = await ensureLiveAccountMode({ network: ping.network, connId: CONN });
      if (mode) adjustments.push(mode);
    } catch (err) {
      adjustments.push(`mode ${err instanceof Error ? err.message : "fail"}`);
    }
    adjustments.push("max lev always · BingX cap per symbol");
    levUniverse.splice(0, levUniverse.length, ...universeSymbols(LIVE_SYMBOLS).map((s) => s.id));
    try {
      const dead = await pruneUnlisted(ping.network);
      if (dead) adjustments.push(`unlisted ${dead} contracts skipped`);
    } catch (err) {
      adjustments.push(`contracts ${err instanceof Error ? err.message : "fail"}`);
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
  let locked = false;
  let freeze;
  let hostPhase = "running";
  let lastResetAt = 0;
  let computeDone = false;
  let gridCursor = 0;
  let lastCycleAt = Date.now();

  try {
    const tape0 = await withTimeout(fetchBingxTape(ping.network), 8000, "tape0");
    if (tape0.ok) {
      const ids = applyTape(engine, tape0.tickers);
      freeze = new Set(ids);
      lastTape = Date.now();
      adjustments.push(`tape first · ${ids.length} px`);
      void refreshVol1h(engine, ping.network)
        .then((n) => {
          if (n) {
            const top = rankUniverse(engine)[0];
            adjustments.push(`vol1h ${n} · first ${top?.id || "?"}`);
          }
        })
        .catch(() => {});
    }
  } catch (err) {
    adjustments.push(`tape first ${err instanceof Error ? err.message : "fail"}`);
  }
  if (ping.pingOk) {
    try {
      const ex0 = await withTimeout(fetchLiveExecutions({ network: ping.network, connId: CONN, since: started - 3 * 86400000 }), 8000, "exec0");
      if (ex0.ok && ex0.realized?.n > 0) {
        ingestExec(ex0);
        const rows = deskExecRows(ex0.bySymbol);
        const folded = rows.length ? foldExec(rows) : null;
        lastExec = folded && folded.n > 0 ? { ...lastExec, ...folded, ddt: ex0.realized.ddt, mdd: ex0.realized.mdd } : { ...lastExec, ...ex0.realized };
        applyRealizedSymbolStats(engine, rows);
        engine.stats.trades = lastExec.n;
        engine.stats.pf = lastExec.pf;
        engine.stats.wr = lastExec.wr;
        engine.stats.net = lastExec.net;
        engine.ledger.trades = lastExec.n;
        engine.ledger.wins = lastExec.wins;
        adjustments.push(`exec n=${lastExec.n} PF ${Number(lastExec.pf).toFixed(2)} net ${Number(lastExec.net).toFixed(3)}`);
      }
    } catch (err) {
      adjustments.push(`exec first ${err instanceof Error ? err.message : "fail"}`);
    }
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
      adjustments: statusAdjustments(adjustments),
      sessionPhase: hostPhase,
      phase: engine.phase,
      computeDone,
    };
  };

  writeStatus(snapshot(engine, statusBase()));
  writeSettingsPick(pick, { rev: 1, locked: false });

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
      engine.liveOpenN = lastBook.pos || 0;
      engine.strategyToggles = { ...STRAT, dca: false };
      engine.blockCfg = {
        ...BLOCK,
        ...(engine.blockCfg || {}),
        enabled: STRAT.block,
        overall: true,
        minRelPf: engine.blockPf || DEFAULT_BLOCK_PF,
        liveDisableMinPf: engine.blockPf || DEFAULT_BLOCK_PF,
      };
      pick.cfg = { ...pick.cfg, shortRange: true, dcaCount: 1 };
      mergeLivePositions(engine, lastBook);
      tickVst(engine, pick.cfg, pick.tactic, {
        freezeIds: freeze,
        skipWalk: true,
        skipMatch: lastBook.pos >= liveMaxPos(),
        rangeType: pick.range,
        symbolCount: LIVE_SYMBOLS,
        orderType: "limit",
        block: engine.blockCfg,
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
            void refreshVol1h(engine, ping.network).catch(() => {});
          }
        } catch (err) {
          adjustments.push(`tape ${err instanceof Error ? err.message : "fail"}`);
          healEngine(engine, pick.cfg, pick.tactic, pick.range);
        }
      }
      let wroteExchange = false;
      if (!apiQuiet() && ping.pingOk) {
        try {
          const liveNote = await withTimeout(mirrorToExchange(engine, ping.network, pick.cfg), 40000, "live");
          if (liveNote) {
            adjustments.push(liveNote);
            noteOp(liveNote);
            if (/flatten|live /i.test(liveNote)) wroteExchange = true;
          }
        } catch (err) {
          liveBusy = 0;
          noteApiFail(err);
          adjustments.push(`live ${err instanceof Error ? err.message : "fail"}`);
        }
      }
      if (!wroteExchange && !apiQuiet() && ping.pingOk && (lastLevBump === 0 || Date.now() - lastLevBump > 90_000) && lastBook.pos > 0) {
        lastLevBump = Date.now();
        try {
          const note = await withTimeout(raiseOwnedLeverage(ping.network, lastBook.positions), 20000, "lev-open");
          if (note) {
            adjustments.push(note);
            noteOp(note);
            wroteExchange = true;
          }
        } catch (err) {
          adjustments.push(`lev ${err instanceof Error ? err.message : "fail"}`);
        }
      }
      if (!wroteExchange && !apiQuiet() && ping.pingOk && levUniverse.length && Date.now() - lastLevWalk > 4000) {
        lastLevWalk = Date.now();
        const id = levUniverse[levWalkI % levUniverse.length];
        levWalkI += 1;
        try {
          const armed = await withTimeout(armMaxLeverage({ network: ping.network, connId: CONN, symbols: [id] }), 8000, "lev-walk");
          if (armed.paused) noteApiFail({ error: "100410 frequency limit" });
          if (armed.raised) {
            adjustments.push(`lev ${id} ${armed.max}x`);
            noteOp(`lev ${id} ${armed.max}x`);
          }
        } catch {
          /* next symbol */
        }
      }
      if (!apiQuiet() && ping.pingOk && engine.tick % 40 === 0) {
        try {
          const ex = await withTimeout(fetchLiveExecutions({ network: ping.network, connId: CONN, since: started - 3 * 86400000 }), 8000, "exec");
          if (ex.ok) {
            ingestExec(ex);
            if (ex.realized?.n > 0) {
              const rows = deskExecRows(ex.bySymbol);
              const folded = rows.length ? foldExec(rows) : null;
              lastExec = folded && folded.n > 0 ? { ...lastExec, ...folded, ddt: ex.realized.ddt, mdd: ex.realized.mdd } : { ...lastExec, ...ex.realized };
              engine.ledger.trades = Math.max(engine.ledger.trades || 0, lastExec.n);
              engine.ledger.wins = Math.max(engine.ledger.wins || 0, lastExec.wins);
              engine.stats.trades = engine.ledger.trades;
              engine.stats.pf = Number(lastExec.pf) || 0;
              engine.stats.wr = lastExec.wr || engine.stats.wr;
              if (Number.isFinite(lastExec.net)) engine.stats.net = lastExec.net;
              engine.stats.mdd = lastExec.mdd || engine.stats.mdd;
              if (Number.isFinite(lastExec.net) && lastExec.net > 0) {
                engine.ledger.profit = Math.max(engine.ledger.profit || 0, lastExec.net);
              }
            }
            if (Array.isArray(ex.bySymbol) && ex.bySymbol.length) {
              applyRealizedSymbolStats(engine, deskExecRows(ex.bySymbol));
            }
            if (lastPnl.length) {
              const n = ingestLivePnls(engine, lastPnl, BLOCK);
              if (n) {
                const ev = evalBlockRelations(engine, BLOCK);
                persistDisabled(engine);
                adjustments.push(
                  `eval live +${n} · rel ${ev.winners} · vol×${Number(ev.factor || 0).toFixed(2)} · off ${Object.keys(engine.liveDisabled ?? {}).length}`,
                );
              }
            }
            let prev = {};
            try {
              prev = JSON.parse(readFileSync(OVERALL, "utf8"));
            } catch {
              prev = {};
            }
            writeFileSync(
              OVERALL,
              JSON.stringify({
                ...prev,
                executions: {
                  ok: true,
                  realized: ex.realized,
                  bySymbol: ex.bySymbol,
                  orders: ex.orders.slice(0, 40),
                  income: (ex.income || []).filter((x) => String(x.type || "") === "REALIZED_PNL").slice(-400),
                  at: ex.at,
                },
              }),
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
        symbolCount: IS_X01 ? 8 : 16,
        hours: [...AUTO_EVAL_HOURS],
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
      const w = pickCompleteLock(complete);
      engine.completeCells = complete.cells;
      engine.completeWinner = w;
      const shortOk = complete.cells.filter(
        (c) => c.shortRange && c.ok && Number(c.hours) >= Math.min(16, SHORT_EVAL_HOURS) && Number(c.tpAtr) > 0,
      );
      const boot = new Set(SHORT_20H_POSITIVE.map((c) => `${Number(c.tpAtr).toFixed(2)}:${Number(c.slOfTp).toFixed(1)}`));
      const confirmed = shortOk.filter((c) => boot.has(`${Number(c.tpAtr).toFixed(2)}:${Number(c.slOfTp).toFixed(1)}`)).length;
      adjustments.push(
        `short ${SHORT_EVAL_HOURS}h eval ${shortOk.length} ok · ${confirmed}/${SHORT_20H_POSITIVE.length} match live lock · grid ${GRID.length} TP ${preferWinner(GRID)?.cfg.tpAtr}/${preferWinner(GRID)?.cfg.slOfTp}`,
      );
      rebuildShortGrid();
      {
        const live = gridLive(engine);
        if (live.length) {
          pick = preferWinner(live) || live[0];
          currentPick = pick;
        }
      }
      cachedOverall = null;
      cachedOverallTick = -1;
      locked = false;
      writeSettingsPick(pick, { rev: Date.now() % 1e9, locked: false });
      adjustments.push(
        w
          ? `complete ${complete.cells.length} cells · winner ${w.tactic}/${w.range} ${w.hours}h PF ${w.pf.toFixed(2)} · ${complete.elapsedMs}ms`
          : "complete compute empty",
      );
      computeDone = true;
      try {
        const scored = validateSymbols100h(pick.cfg, pick.tactic, {
          symbolCount: Math.min(16, LIVE_SYMBOLS),
          rangeType: pick.range,
          minPf: Number(engine.shortPf) || DEFAULT_SHORT_PF,
        });
        const kept = mergeSymbolHourEval(engine, scored.engine);
        refreshSymbolHourEval(engine, { hours: 100, minPf: Number(engine.shortPf) || DEFAULT_SHORT_PF });
        adjustments.push(
          `symbol 100h · ${kept.length} performing · skip ${scored.skipped.length} · hour ${scored.hour} ${scored.engine.hourCoord?.bestInd || ""}/${scored.engine.hourCoord?.bestTac || ""}`,
        );
      } catch (err3) {
        adjustments.push(`symbol 100h skip ${err3 instanceof Error ? err3.message : "err"}`);
      }
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
      lastBook.pos === 0 &&
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

  const ioTimer = setInterval(() => {
    if (hostPhase !== "running") return;
    void ioCycle();
  }, 700);
  void ioCycle();

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
      applyPfGates(engine, remote);
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
                if (!isOwnedLeg(p.symbol, p.side) && !mirrored.has(`own:${k}`) && !mirrored.has(`live:${k}`)) continue;
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
        if (nextCfg && cfgChanged) {
          pick = {
            tactic: pick.tactic,
            range: pick.range,
            cfg: { ...pick.cfg, ...nextCfg, dcaCount: 1 },
          };
          adjustments.push(`settings cfg sl ${pick.cfg.slAtr} tp ${pick.cfg.tpRatio} trail ${pick.cfg.trailingPct}`);
          healEngine(engine, pick.cfg, pick.tactic, pick.range);
        }
        if (remote.strategyToggles) {
          Object.assign(STRAT, remote.strategyToggles, { dca: false, axis: false, trailing: true, normal: false });
          engine.strategyToggles = { ...STRAT };
        }
        if (remote.blockConfig) {
          const vol = IS_X01
            ? { volumeRatio: 0.1, relVolumeRatio: 0.1, sharedVolumeRatio: 1, overallVolumeRatio: 1 }
            : x02VolFromRemote(remote.blockConfig);
          Object.assign(BLOCK, remote.blockConfig, {
            enabled: STRAT.block,
            activeLive: true,
            volumeMode: "parallel",
            overallMode: "parallel",
            overall: true,
            overallSymbol: true,
            overallDirection: true,
            overallSharedStack: "additive",
            ...vol,
            minActiveLevel: Math.max(1, Math.round(remote.blockConfig.minActiveLevel || BLOCK.minActiveLevel || 1)),
          });
        }
        engine.blockCfg = { ...BLOCK };
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
    const cycleMs = cfgUsesShortRange(pick?.cfg) ? SHORT_CYCLE_MS : CYCLE_MS;
    if (now - lastCycleAt > cycleMs) {
      lastCycleAt = now;
      const live = gridLive(engine);
      gridCursor = (gridIndex(pick, live) + 1) % live.length;
      pick = live[gridCursor];
      currentPick = pick;
      try {
        requeueFree(engine, pick.cfg, pick.tactic, pick.range, CONN);
      } catch {
        /* keep */
      }
      const short = cfgUsesShortRange(pick.cfg) ? ` short ${pick.cfg.tpAtr}/${pick.cfg.slOfTp}` : "";
      adjustments.push(`cycle ${gridCursor + 1}/${live.length} ${pick.tactic}/${pick.range}${short}`);
      writeSettingsPick(pick, { rev: Date.now() % 1e9, locked: false });
    }

    if (wantStatus(false)) writeStatus(snapshot(engine, { ...statusBase(), computeDone }));
    await sleep(TICK_MS);
  }

  clearInterval(watchdog);
  clearInterval(ioTimer);
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
