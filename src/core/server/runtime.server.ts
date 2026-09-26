// Core v2 continuous runtime. One per server process (globalThis singleton).
//
// Loop (every cycleMs):
//   1. market   backfill once, then pull newly CLOSED bars for every symbol (BingX public; synthetic fallback)
//   2. compute  when a new bar closed: S1–S5 pipeline, walk-forward tapes, 48h simulated run with 20h pre-calc
//   3. paper    the current hour's selection trades on paper; closes land in paper_trades
//   4. live     optional gated adapter mirrors fresh paper entries (off by default)
// Heavy work is time-sliced (yields every ~12 ms) so the web server stays responsive.
import { DEFAULT_SETTINGS, STRATEGY_PRESETS, type CoreSettings } from "../config.ts";
import type { Candle, OpenPosition, Protect, Trade } from "../domain/types.ts";
import { barsFromCandles, syntheticCandles, tailBars } from "../market/bars.ts";
import { fetchHistory, fetchKlines, fetchTickers, pickUniverse, type Ticker } from "../market/bingx.ts";
import { makeUniverse, runPipeline, type PipelineOutput, type PipelineProgress } from "../pipeline/pipeline.ts";
import {
  buildTapesGen,
  defaultWalkForward,
  selectAt,
  selectDurable,
  walkForward,
  type ConfigTape,
  type WalkForwardOptions,
  type WalkForwardResult,
} from "../sim/walkforward.ts";
import { coreDb, type CoreDb } from "./db.server.ts";

const H = 3_600_000;
const SLICE_MS = 12;

export type RuntimeState = "idle" | "booting" | "backfill" | "running" | "computing" | "error" | "stopped";

export interface RuntimeStatus {
  state: RuntimeState;
  stage: string;
  progress: number;
  label: string;
  cycles: number;
  computes: number;
  startedAt: number;
  heartbeat: number;
  lastCycleMs: number;
  lastComputeMs: number;
  lastBarT: number;
  source: "bingx" | "synthetic" | "none";
  symbols: string[];
  error: string | null;
  nextCycleAt: number;
}

export interface PaperBook {
  selected: string[];
  eligible: number;
  positions: OpenPosition[];
  trades: Trade[];
  equity: number;
  startedAt: number;
}

const yieldNow = () => new Promise<void>((r) => setImmediate(r));

export class CoreRuntime {
  readonly db: CoreDb;
  settings: CoreSettings;
  wf: WalkForwardOptions;
  status: RuntimeStatus;
  candles = new Map<string, Candle[]>();
  tickers: Ticker[] = [];
  pipeline: PipelineOutput | null = null;
  tapes: ConfigTape[] = [];
  sim: WalkForwardResult | null = null;
  paper: PaperBook;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private dirty = true;
  private snapshotPath = process.env.CTS_CORE_SNAPSHOT || "";
  private lastSnapshot = 0;
  onLive?: (rt: CoreRuntime, intents: LiveIntent[]) => Promise<void>;

  constructor(db: CoreDb = coreDb(), settings?: Partial<CoreSettings>) {
    this.db = db;
    const saved = db.kvGet<Partial<CoreSettings>>("settings");
    this.settings = mergeSettings(DEFAULT_SETTINGS, saved, settings);
    this.wf = { ...defaultWalkForward(this.settings), ...pickWf(db.kvGet<Partial<WalkForwardOptions>>("wf") ?? {}) };
    const now = Date.now();
    this.status = {
      state: "idle",
      stage: "",
      progress: 0,
      label: "",
      cycles: 0,
      computes: 0,
      startedAt: now,
      heartbeat: now,
      lastCycleMs: 0,
      lastComputeMs: 0,
      lastBarT: 0,
      source: "none",
      symbols: [],
      error: null,
      nextCycleAt: now,
    };
    this.paper = { selected: [], eligible: 0, positions: [], trades: [], equity: 0, startedAt: now };
  }

  start() {
    if (this.status.state !== "idle" && this.status.state !== "stopped" && this.status.state !== "error") return;
    if (this.snapshotPath && this.db.restore(this.snapshotPath)) this.db.event("info", `restored snapshot ${this.snapshotPath}`);
    this.status.state = "booting";
    this.db.event("info", "runtime start");
    this.schedule(0);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status.state = "stopped";
    this.db.event("info", "runtime stopped");
  }

  /** Watchdog: restart the loop if the heartbeat is stale. */
  ensureAlive() {
    const stale = Date.now() - this.status.heartbeat > Math.max(120_000, this.settings.cycleMs * 6);
    if (this.status.state === "idle") this.start();
    else if (stale && this.status.state !== "stopped") {
      this.db.event("warn", "watchdog: loop stale, restarting");
      this.busy = false;
      if (this.timer) clearTimeout(this.timer);
      this.schedule(0);
    }
  }

  updateSettings(patch: Partial<CoreSettings>, wfPatch?: Partial<WalkForwardOptions>) {
    const prevUniverse = `${this.settings.symbols}|${this.settings.tfMin}|${this.settings.historyDays}`;
    this.settings = mergeSettings(this.settings, patch);
    this.wf = { ...defaultWalkForward(this.settings), ...pickWf(this.wf), ...(wfPatch ?? {}), gates: this.settings.gates, cost: this.settings.cost, toggles: this.settings.toggles, block: this.settings.block, dca: this.settings.dca };
    this.db.kvSet("settings", this.settings);
    this.db.kvSet("wf", pickWf(this.wf));
    if (prevUniverse !== `${this.settings.symbols}|${this.settings.tfMin}|${this.settings.historyDays}`) {
      this.candles.clear();
      this.db.run("DELETE FROM candles");
    }
    this.dirty = true;
    this.db.event("info", "settings updated");
    this.kick();
  }

  /** Re-run the compute stages on the next cycle, now. */
  kick() {
    this.dirty = true;
    if (!this.busy) this.schedule(0);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.status.nextCycleAt = Date.now() + ms;
    this.timer = setTimeout(() => void this.cycle(), ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  private setStage(stage: string, done: number, total: number, label = "") {
    this.status.stage = stage;
    this.status.progress = total ? done / total : 0;
    this.status.label = label;
    this.status.heartbeat = Date.now();
  }

  async cycle() {
    if (this.busy) return;
    this.busy = true;
    const t0 = performance.now();
    try {
      const newBars = await this.syncMarket();
      if (newBars || this.dirty) await this.compute();
      this.stepPaper();
      if (this.onLive && this.settings.live.enabled) await this.onLive(this, this.pendingEntries());
      this.status.state = "running";
      this.status.error = null;
      if (this.snapshotPath && Date.now() - this.lastSnapshot > 10 * 60_000) {
        this.lastSnapshot = Date.now();
        this.db.snapshot(this.snapshotPath);
      }
      this.db.trim();
    } catch (e) {
      this.status.state = "error";
      this.status.error = e instanceof Error ? e.message : String(e);
      this.db.event("error", `cycle: ${this.status.error}`);
    } finally {
      this.status.cycles++;
      this.status.lastCycleMs = performance.now() - t0;
      this.status.heartbeat = Date.now();
      this.busy = false;
      if (this.status.state !== "stopped") this.schedule(this.settings.cycleMs);
    }
  }

  // ── market ────────────────────────────────────────────────────────────
  private async syncMarket(): Promise<boolean> {
    const s = this.settings;
    const want = Math.round((s.historyDays * 24 * 60) / s.tfMin);
    if (this.candles.size === 0) {
      this.status.state = "backfill";
      this.loadCandlesFromDb();
    }
    if (this.candles.size === 0) {
      try {
        this.tickers = await fetchTickers();
        const syms = pickUniverse(this.tickers, s.symbols);
        let i = 0;
        for (const sym of syms) {
          this.setStage("backfill", i++, syms.length, sym);
          const cs = await fetchHistory(sym, s.tfMin, want, { pauseMs: 80 });
          if (cs.length >= 200) this.storeCandles(sym, cs);
          await yieldNow();
        }
        this.status.source = "bingx";
        this.db.event("info", `backfilled ${this.candles.size} symbols × ${want} bars (${s.tfMin}m)`);
      } catch (e) {
        this.db.event("warn", `BingX unavailable (${e instanceof Error ? e.message : e}); using synthetic feed`);
      }
      if (this.candles.size === 0) {
        const end = Date.now();
        for (let i = 0; i < s.symbols; i++) this.storeCandles(`SYN${i}-USDT`, syntheticCandles(`SYN${i}`, s.tfMin, want, end));
        this.status.source = "synthetic";
      }
      this.status.symbols = [...this.candles.keys()];
      this.upsertSymbols();
      return true;
    }
    // incremental
    const tfMs = s.tfMin * 60_000;
    const now = Date.now();
    let added = 0;
    if (this.status.source === "synthetic") return false;
    for (const [sym, cs] of this.candles) {
      const last = cs[cs.length - 1]?.t ?? 0;
      if (last + 2 * tfMs > now) continue; // no new closed bar yet
      try {
        const fresh = await fetchKlines(sym, s.tfMin, { startT: last + 1, limit: 300, nowT: now });
        const extra = fresh.filter((c) => c.t > last);
        if (extra.length) {
          this.storeCandles(sym, extra, true);
          added += extra.length;
        }
      } catch (e) {
        this.db.event("warn", `${sym} klines: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (added) {
      try {
        this.tickers = await fetchTickers();
        this.upsertSymbols();
      } catch {
        /* tickers are cosmetic */
      }
    }
    return added > 0;
  }

  private loadCandlesFromDb() {
    const rows = this.db.all<Candle & { sym: string }>("SELECT sym, t, o, h, l, c, v FROM candles ORDER BY sym, t");
    for (const r of rows) {
      const arr = this.candles.get(r.sym) ?? [];
      arr.push({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v });
      this.candles.set(r.sym, arr);
    }
    if (this.candles.size) {
      this.status.source = this.status.source === "none" ? "bingx" : this.status.source;
      this.status.symbols = [...this.candles.keys()];
    }
  }

  private storeCandles(sym: string, cs: Candle[], append = false) {
    const want = Math.round((this.settings.historyDays * 24 * 60) / this.settings.tfMin);
    const arr = append ? [...(this.candles.get(sym) ?? []), ...cs] : [...cs];
    const trimmed = arr.slice(Math.max(0, arr.length - want));
    this.candles.set(sym, trimmed);
    const ins = "INSERT OR REPLACE INTO candles (sym, t, o, h, l, c, v) VALUES (?, ?, ?, ?, ?, ?, ?)";
    this.db.tx(() => {
      for (const c of cs) this.db.run(ins, sym, c.t, c.o, c.h, c.l, c.c, c.v);
      if (trimmed.length) this.db.run("DELETE FROM candles WHERE sym = ? AND t < ?", sym, trimmed[0].t);
    });
    const last = trimmed[trimmed.length - 1]?.t ?? 0;
    if (last > this.status.lastBarT) this.status.lastBarT = last;
  }

  private upsertSymbols() {
    const tick = new Map(this.tickers.map((t) => [t.sym, t]));
    this.db.tx(() => {
      for (const [sym, cs] of this.candles) {
        const t = tick.get(sym);
        this.db.run(
          "INSERT OR REPLACE INTO symbols (sym, last, quote_vol, change_pct, bars, first_t, last_t, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          sym,
          t?.last ?? cs[cs.length - 1]?.c ?? 0,
          t?.quoteVol ?? 0,
          t?.changePct ?? 0,
          cs.length,
          cs[0]?.t ?? 0,
          cs[cs.length - 1]?.t ?? 0,
          Date.now(),
        );
      }
    });
  }

  // ── compute ───────────────────────────────────────────────────────────
  private async drive<T, R>(gen: Generator<T, R>, onStep: (v: T) => void): Promise<R> {
    let slice = performance.now();
    for (;;) {
      const r = gen.next();
      if (r.done) return r.value;
      onStep(r.value);
      if (performance.now() - slice > SLICE_MS) {
        await yieldNow();
        slice = performance.now();
      }
    }
  }

  async compute() {
    const t0 = performance.now();
    this.dirty = false;
    this.status.state = "computing";
    const s = this.settings;
    const allBars = [...this.candles.entries()].map(([sym, cs]) => barsFromCandles(sym, s.tfMin, cs));
    const u = makeUniverse(allBars);
    if (!u.bars.length) return;

    // S1–S5 on the full history
    const stageName: Record<string, string> = { S1: "Base", S2: "Main", S3: "Main", S4: "Real", S5: "Real" };
    this.pipeline = await this.drive(runPipeline(u, s), (p: PipelineProgress) => this.setStage(stageName[p.stage] ?? p.stage, p.done, p.total, p.label));
    this.persistPipeline(this.pipeline);

    // walk-forward tapes on the recent tail: warm-up + pre-calc + simulated run
    const tailN = Math.round(((24 + Math.max(this.wf.preH, this.wf.longH) + this.wf.simH) * 60) / s.tfMin);
    const wu = makeUniverse(allBars.map((b) => tailBars(b, tailN)));
    this.tapes = await this.drive(buildTapesGen(wu, this.wf.protects, s.cost, { protects: this.wf.dcaProtects, dca: this.wf.dca }), (p) =>
      this.setStage("Base", p.done, p.total, "strategy tapes (normal · trailing · DCA · DCA Active)"),
    );
    this.setStage("Real", 0, 1, `${this.wf.simH}h simulated run, ${this.wf.preH}h pre-calc`);
    await yieldNow();
    this.sim = walkForward(wu, this.tapes, this.wf);
    this.persistSim(this.sim);
    // every preset on the same tapes: with / without Block, DCA and Active, side by side
    const presets: Record<string, unknown> = {};
    const names = Object.keys(STRATEGY_PRESETS);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      this.setStage("Compare", i, names.length, name);
      await yieldNow();
      const r = walkForward(wu, this.tapes, { ...this.wf, toggles: STRATEGY_PRESETS[name].toggles });
      presets[name] = { label: STRATEGY_PRESETS[name].label, toggles: STRATEGY_PRESETS[name].toggles, stats: r.stats, hourly: r.hourly, byKind: r.byKind, skips: r.skips, blocks: r.blocks, stable: r.stable };
    }
    this.db.kvSet("presetSims", { at: Date.now(), startT: this.sim.startT, endT: this.sim.endT, presets });
    this.setStage("Real", 1, 1, "done");
    this.status.computes++;
    this.status.lastComputeMs = performance.now() - t0;
    this.db.run(
      "INSERT INTO runs (kind, started, ended, items, ms, note) VALUES (?, ?, ?, ?, ?, ?)",
      "compute",
      Date.now() - Math.round(this.status.lastComputeMs),
      Date.now(),
      this.pipeline.s1.length + this.pipeline.s2.length + this.tapes.length,
      this.status.lastComputeMs,
      `S1 ${Math.round(this.pipeline.timings.S1 ?? 0)}ms · S2 ${Math.round(this.pipeline.timings.S2 ?? 0)}ms · S3 ${Math.round(this.pipeline.timings.S3 ?? 0)}ms`,
    );
    console.info(`[core-v2] compute #${this.status.computes} done in ${Math.round(this.status.lastComputeMs)} ms · sim PF ${this.sim.stats.pf.toFixed(2)} n ${this.sim.stats.n}`);
    this.db.event(
      "info",
      `compute #${this.status.computes}: sim PF ${this.sim.stats.pf.toFixed(2)} net ${this.sim.stats.net.toFixed(1)}% n ${this.sim.stats.n} · armed ${this.pipeline.armed.length} · ${Math.round(this.status.lastComputeMs)}ms`,
    );
  }

  private persistPipeline(o: PipelineOutput) {
    const now = Date.now();
    const db = this.db;
    db.tx(() => {
      db.run("DELETE FROM results");
      db.run("DELETE FROM lastn");
      db.run("DELETE FROM tapes");
      const ins = `INSERT OR REPLACE INTO results (id, stage, bot, ind, tp, sl, trail, hold, n, pf, net, wr, mdd, ddt, gh, tph, is_n, is_pf, is_net, score,
        rank, armed, best_n, oos_n, oos_pf, oos_net, oos_ddt, lastn_ok, eval_pass, eval_ok, by_sym, at) VALUES (${Array(32).fill("?").join(",")})`;
      for (const r of o.s1) {
        db.run(ins, r.id, 1, r.bot, r.ind, r.protect.tp, r.protect.sl, r.protect.trail, r.protect.hold, r.full.n, r.full.pf, r.full.net, r.full.wr, r.full.mdd, r.full.ddt, r.full.gh, r.full.tph,
          r.is.n, r.is.pf, r.is.net, r.score, null, 0, null, null, null, null, null, null, null, null, JSON.stringify(r.bySym), now);
      }
      for (const r of o.s2) {
        const k = o.ranked.find((x) => x.id === r.id);
        db.run(ins, r.id, k ? 3 : 2, r.bot, r.ind, r.protect.tp, r.protect.sl, r.protect.trail, r.protect.hold, r.full.n, r.full.pf, r.full.net, r.full.wr, r.full.mdd, r.full.ddt, r.full.gh, r.full.tph,
          r.is.n, r.is.pf, r.is.net, r.score, k?.rank ?? null, k?.armed ? 1 : 0, k?.lastN?.bestN ?? null, k?.lastN?.oos.n ?? null, k?.lastN?.oos.pf ?? null,
          k?.lastN?.oos.net ?? null, k?.lastN?.oos.ddt ?? null, k?.lastN ? (k.lastN.success ? 1 : 0) : null, k?.evalRes?.passRatio ?? null,
          k?.evalRes ? (k.evalRes.success ? 1 : 0) : null, JSON.stringify(o.runs.get(r.id)?.bySym ?? {}), now);
      }
      const lnIns = "INSERT OR REPLACE INTO lastn (cfg, n, part, taken, pf, net, ddt, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      const evIns = "INSERT INTO evals (cfg, at, win, n, pf, net, ddt, wr, pass) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
      const tpIns = "INSERT OR REPLACE INTO tapes (cfg, sym, side, entry_t, exit_t, entry, exit, r, reason, bars) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      for (const k of o.ranked) {
        if (k.lastN) {
          for (const r of k.lastN.rows) db.run(lnIns, k.id, r.n, "is", r.taken, r.pf, r.net, r.ddt, r.score);
          for (const r of k.lastN.oosRows) db.run(lnIns, k.id, r.n, "oos", r.taken, r.pf, r.net, r.ddt, r.score);
          db.run(lnIns, k.id, 0, "is", k.lastN.baseline.is.n, k.lastN.baseline.is.pf, k.lastN.baseline.is.net, k.lastN.baseline.is.ddt, 0);
          db.run(lnIns, k.id, 0, "oos", k.lastN.baseline.oos.n, k.lastN.baseline.oos.pf, k.lastN.baseline.oos.net, k.lastN.baseline.oos.ddt, 0);
        }
        if (k.evalRes) for (const w of k.evalRes.windows) db.run(evIns, k.id, o.universe.nowT, w.key, w.n, w.pf, w.net, w.ddt, w.wr, w.pass ? 1 : 0);
        for (const t of o.tapes.get(k.id) ?? []) db.run(tpIns, t.cfg, t.sym, t.side, t.entryT, t.exitT, t.entry, t.exit, t.r, t.reason, t.bars);
      }
    });
    db.kvSet("pipeline", {
      at: o.at,
      universe: o.universe,
      timings: o.timings,
      armed: o.armed,
      s1: o.s1.length,
      s2: o.s2.length,
      ranked: o.ranked.length,
      portfolio: { members: o.portfolio.members, guardPct: o.portfolio.guardPct, is: o.portfolio.is, oos: o.portfolio.oos, full: o.portfolio.full, hourly: o.portfolio.hourly },
    });
  }

  private persistSim(r: WalkForwardResult) {
    this.db.run(
      "INSERT INTO sim_runs (at, start_t, end_t, n, pf, net, gh, tph, ddt, stable, opts, blocks, hourly) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      Date.now(), r.startT, r.endT, r.stats.n, r.stats.pf, r.stats.net, r.stats.gh, r.stats.tph, r.stats.ddt, r.stable ? 1 : 0,
      JSON.stringify(r.opts), JSON.stringify(r.blocks), JSON.stringify(r.hourly),
    );
  }

  // ── paper ─────────────────────────────────────────────────────────────
  /** Current-hour selection from the pre-historic window; open positions of the selected configs are the paper book. */
  private stepPaper() {
    if (!this.tapes.length || !this.sim) return;
    const nowT = Math.floor(Date.now() / H) * H;
    const t = Math.min(nowT, this.sim.endT);
    const held = new Set(this.sim.steps[this.sim.steps.length - 1]?.real ?? []);
    const { picks, eligible } = this.wf.mode === "durable" ? selectDurable(this.tapes, t, this.wf, held) : selectAt(this.tapes, t, this.wf);
    const sel = new Set(picks.map((p) => p.id));
    const positions: OpenPosition[] = [];
    const perSym = new Map<string, number>();
    for (const tp of this.tapes) {
      if (!sel.has(tp.id)) continue;
      for (const op of tp.open) {
        const c = perSym.get(op.sym) ?? 0;
        if (c >= this.wf.maxPerSymbol || positions.length >= this.wf.maxOpen) continue;
        perSym.set(op.sym, c + 1);
        positions.push(op);
      }
    }
    const since = this.paper.startedAt - this.wf.simH * H;
    const trades = this.sim.trades.filter((t) => t.exitT >= since);
    const notional = this.settings.paperNotional;
    const db = this.db;
    db.tx(() => {
      db.run("DELETE FROM paper_positions");
      for (const p of positions) {
        db.run("INSERT OR REPLACE INTO paper_positions (cfg, sym, side, entry_t, entry, stop, target, mtm, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          p.cfg, p.sym, p.side, p.entryT, p.entry, p.stop, p.target, p.mtm, Date.now());
      }
      for (const t of trades) {
        db.run("INSERT OR IGNORE INTO paper_trades (cfg, sym, side, entry_t, exit_t, entry, exit, r, pnl, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          t.cfg, t.sym, t.side, t.entryT, t.exitT, t.entry, t.exit, t.r, t.r * notional, t.reason);
      }
    });
    this.paper = {
      selected: [...sel],
      eligible,
      positions,
      trades,
      equity: trades.reduce((a, t) => a + t.r * notional, 0) + positions.reduce((a, p) => a + p.mtm * notional, 0),
      startedAt: this.paper.startedAt,
    };
  }

  /**
   * Entries due NOW: signals of the selected configs on the newest closed bar (they enter at the next open).
   * These are what the live adapter may mirror.
   */
  pendingEntries(): LiveIntent[] {
    const sel = new Set(this.paper.selected);
    const out: LiveIntent[] = [];
    for (const tp of this.tapes) {
      if (!sel.has(tp.id)) continue;
      for (const p of tp.pending) out.push({ cfg: tp.id, sym: p.sym, side: p.side, protect: tp.protect, barT: this.status.lastBarT });
    }
    return out;
  }
}

export interface LiveIntent {
  cfg: string;
  sym: string;
  side: 1 | -1;
  protect: Protect;
  barT: number;
}

/** The walk-forward knobs that are user settings (grids, toggles and gates come from CoreSettings). */
export const WF_KEYS = ["preH", "simH", "stepH", "portfolio", "lastN", "lastNMinPf", "maxPerSymbol", "maxPerSide", "maxOpen", "guardPct", "longH", "robustFrac", "rank", "bots", "preGate", "mode", "durableSplits", "durableFrac"] as const;
function pickWf(o: Partial<WalkForwardOptions>): Partial<WalkForwardOptions> {
  const out: Record<string, unknown> = {};
  for (const k of WF_KEYS) if (o[k] !== undefined) out[k] = o[k];
  return out as Partial<WalkForwardOptions>;
}

function mergeSettings(base: CoreSettings, ...patches: Array<Partial<CoreSettings> | undefined>): CoreSettings {
  let out = { ...base, gates: { ...base.gates }, live: { ...base.live }, toggles: { ...base.toggles }, block: { ...base.block }, dca: { ...base.dca }, grid: { ...base.grid } };
  for (const p of patches) {
    if (!p) continue;
    out = {
      ...out,
      ...p,
      gates: { ...out.gates, ...(p.gates ?? {}) },
      live: { ...out.live, ...(p.live ?? {}) },
      toggles: { ...out.toggles, ...(p.toggles ?? {}) },
      block: { ...out.block, ...(p.block ?? {}) },
      dca: { ...out.dca, ...(p.dca ?? {}) },
      grid: { ...out.grid, ...(p.grid ?? {}) },
    };
  }
  return out;
}

const G = globalThis as unknown as { __ctsCoreRuntime?: CoreRuntime };
export function coreRuntime(): CoreRuntime {
  if (!G.__ctsCoreRuntime) {
    const rt = new CoreRuntime();
    rt.onLive = async (r, intents) => {
      const { stepLive } = await import("./live.server.ts");
      await stepLive(r, intents);
    };
    G.__ctsCoreRuntime = rt;
  }
  G.__ctsCoreRuntime.ensureAlive();
  return G.__ctsCoreRuntime;
}
