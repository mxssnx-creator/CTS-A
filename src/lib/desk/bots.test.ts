import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_HOURS,
  BOT_SELECT_MODES,
  BOT_STRATEGY_KEYS,
  BOT_SYMBOL_COUNTS,
  BOT_TYPES,
  BOT_PARALLEL_CAP,
  BOT_START_EQUITY,
  LAST_HOUR_WINDOWS,
  LAST_POS_WINDOWS,
  VF_RECALC_RATIO,
  bestBotType,
  bestBotTypes,
  clearBotCache,
  compareBots,
  defaultBotConfig,
  liveBotFloors,
  liveBotTape,
  rankBotTypes,
  recalcVolumeFactor,
  runBotBacktest,
  runParallelBots,
  sanitizeArmed,
  sanitizeBotConfig,
  sanitizeBotsPersist,
  stepDeskBots,
} from "./bots.ts";
import { GATED_MIN_PF } from "./last-n-progress.ts";
import { DEFAULT_TACTIC_CONFIG, closePnl } from "./engine.ts";
import { engageLiveBook, initVstEngine, tickVst } from "./vst.ts";

describe("sandwich bots — config + volume", () => {
  it("sanitizes overall + independent per-type settings", () => {
    const raw = sanitizeBotsPersist({
      selected: "pulse" as const,
      hours: 36,
      configs: {
        sandwich: { type: "sandwich", symbolCount: 17 as never, minTp: 0.5, minSl: 0.55, minTrail: 0.33, volumeFactor: 11, selectMode: "vol1h", strategies: { normal: true, trailing: false, axis: true, block: true, dca: true }, hours: 12 },
      } as never,
    });
    assert.equal(raw.selected, "pulse");
    assert.equal(raw.hours, 36);
    assert.equal(raw.configs.sandwich.symbolCount, 20);
    assert.equal(raw.configs.sandwich.minTp, 0.4);
    assert.equal(raw.configs.sandwich.minSl, 0.6);
    assert.equal(raw.configs.sandwich.minTrail, 0.3);
    assert.equal(raw.configs.sandwich.volumeFactor, 10);
    assert.equal(raw.configs.snap.type, "snap");
    assert.equal(raw.configs.sweep.selectMode, "range15");
    assert.equal(raw.configs.clamp.type, "clamp");
    assert.equal(raw.configs.magnet.selectMode, "atrRank");
    assert.equal(raw.configs.pivot.selectMode, "range15");
    assert.ok(raw.armed.includes("clamp") || raw.armed.includes("sandwich"));
    assert.ok(raw.armed.length <= 3);
    for (const t of BOT_TYPES) assert.equal(raw.configs[t].type, t);
  });

  it("volume factor recals after a 0.6 equity increase and tracks balance", () => {
    const start = recalcVolumeFactor(2, 10_000, 10_000, 10_000);
    assert.equal(start.recaled, false);
    assert.equal(start.vf, 2);
    const up = recalcVolumeFactor(2, 10_000, 16_000, 10_000);
    assert.equal(up.recaled, true);
    assert.equal(VF_RECALC_RATIO, 0.6);
    assert.ok(up.vf >= 3.1 && up.vf <= 3.3, `vf ${up.vf}`);
    const cap = recalcVolumeFactor(8, 10_000, 40_000, 10_000);
    assert.equal(cap.vf, 10);
  });

  it("live floors lift sandwich TP to 0.48, cap SL at 0.5%, and keep a tight trail", () => {
    const f = liveBotFloors(defaultBotConfig("sandwich"));
    assert.ok(f.tpAtr >= 0.48);
    assert.ok(f.slOfTp + 1e-9 >= 0.75);
    assert.ok(f.slPct <= 0.8);
    assert.equal(f.slPct, 0.4);
    assert.equal(f.trailPct, 0.3);
    const wide = liveBotFloors({ ...defaultBotConfig("sandwich"), minSl: 0.8 });
    assert.equal(wide.slPct, 0.8);
  });

  it("grids cover symbol counts, hours and select modes", () => {
    assert.deepEqual([...BOT_SYMBOL_COUNTS], [10, 20, 30, 40, 50]);
    assert.deepEqual([...BOT_HOURS], [12, 24, 36, 48, 60, 72]);
    assert.ok(BOT_SELECT_MODES.includes("vol1h"));
    assert.deepEqual([...BOT_STRATEGY_KEYS], ["normal", "trailing", "axis", "block", "dca"]);
  });
});

describe("sandwich bots — backtest correctness", () => {
  it("default sandwich 12h×10 is high-order, low-DD, every active hour green", () => {
    clearBotCache();
    const r = runBotBacktest(defaultBotConfig("sandwich"), 12, 20260922);
    assert.ok(r.liveOrders >= 120, `orders ${r.liveOrders}`);
    assert.ok(r.liveStats.pf + 1e-9 >= 1, `pf ${r.liveStats.pf}`);
    assert.ok(r.liveStats.net > 0, `net ${r.liveStats.net}`);
    assert.ok(r.hourActive >= 8, `active hours ${r.hourActive}`);
    assert.equal(r.hourSuccess, r.hourActive, `green ${r.hourSuccess}/${r.hourActive} hours ${r.hourly.filter((h) => !h.green).map((h) => `${h.hour}:${h.net.toFixed(2)}/${h.n}`).join(",")}`);
    assert.ok(r.hourly.every((h) => h.green), "empty hours count as G0, active hours net≥0");
    const busy12 = r.hourly.filter((h) => h.n > 0);
    assert.ok(busy12.length >= 10, `active ${busy12.length}`);
    assert.ok(r.liveStats.mdd < 0.12, `mdd ${r.liveStats.mdd}`);
    assert.ok(r.maxDdt < 400, `ddt ${r.maxDdt}`);
    assert.equal(r.hourly.length, 12);
  });

  it("intern scores every strategy even when live is off", () => {
    const cfg = sanitizeBotConfig({
      ...defaultBotConfig("sandwich"),
      strategies: { normal: false, trailing: true, axis: true, block: true, dca: false },
    });
    const r = runBotBacktest(cfg, 12, 20260922);
    assert.equal(r.strategies.normal.active, false);
    assert.equal(r.strategies.dca.active, false);
    assert.equal(r.strategies.trailing.active, true);
    assert.ok(r.strategies.normal.intern.n > 0, "intern still scores Normal");
    assert.ok(r.strategies.trailing.intern.n > 0, "intern trailing");
    assert.equal(r.strategies.normal.live, null);
    assert.ok(r.strategies.dca.live == null);
    assert.ok((r.strategies.trailing.live?.n ?? 0) > 0);
    assert.ok(r.liveFills.every((f) => f.live && f.strategy !== "normal" && f.strategy !== "dca"));
  });

  it("gated PF below 1 never passes overall processing", () => {
    const r = runBotBacktest(defaultBotConfig("sandwich"), 12, 7);
    if (r.overall.pass) {
      assert.ok((r.overall.gatedPf ?? 0) + 1e-9 >= GATED_MIN_PF, `gated ${r.overall.gatedPf}`);
      assert.ok(r.overall.positive >= 2, `2+ primaries ${r.overall.positive}`);
    }
    assert.equal(r.gatedFailClosed, true);
    assert.ok(r.complete.coverage, "full last-N intern coverage");
  });

  it("last pos 12/25/75 and hours 2/6/20 have independent PF + max DDT", () => {
    const r = runBotBacktest(defaultBotConfig("sandwich"), 24, 20260922);
    for (const n of LAST_POS_WINDOWS) {
      const s = r.lastPos[String(n)];
      assert.ok(s, `pos ${n}`);
      assert.ok(s.n <= n);
      assert.ok(Number.isFinite(s.pf) && Number.isFinite(s.ddt));
    }
    for (const h of LAST_HOUR_WINDOWS) {
      const s = r.lastHours[String(h)];
      assert.ok(s, `hour ${h}`);
      assert.ok(Number.isFinite(s.pf) && Number.isFinite(s.ddt));
    }
    assert.ok(r.lastPos["12"]!.ddt <= r.lastPos["75"]!.ddt + 1e-9 || r.lastPos["12"]!.n < 12);
  });

  it("24h sandwich stays hour-green with more symbols", () => {
    const r = runBotBacktest({ ...defaultBotConfig("sandwich"), symbolCount: 20 }, 24, 20260922);
    assert.equal(r.hourly.length, 24);
    assert.ok(r.liveOrders >= 300, `orders ${r.liveOrders}`);
    assert.ok(r.hourly.every((h) => h.green), r.hourly.filter((h) => !h.green).map((h) => `${h.hour}:${h.net.toFixed(3)} n=${h.n}`).join(" "));
    assert.ok(r.liveStats.pf >= 1, `pf ${r.liveStats.pf}`);
    const busy = r.hourly.filter((h) => h.n > 0);
    assert.ok(busy.length >= 20, `active hours ${busy.length}`);
    assert.ok(busy.every((h) => h.n >= 4), `thin hour ${busy.filter((h) => h.n < 4).map((h) => h.hour).join(",")}`);
  });

  it("24h stats start at $10 and expose eq / PF / n / net / margin per hour", () => {
    clearBotCache();
    const r = runBotBacktest(defaultBotConfig("sandwich"), 24, 20260922);
    assert.equal(BOT_START_EQUITY, 10);
    assert.ok(Math.abs((r.hourly[0]?.eq ?? 0) - 10) < 2 || r.hourly[0]!.eq > 9.5, `h1 eq ${r.hourly[0]?.eq}`);
    assert.ok(r.hourly[0]!.eq < 30, `eq not $10k paper ${r.hourly[0]!.eq}`);
    const last = r.hourly[r.hourly.length - 1]!;
    assert.ok(last.eq > 9, `end eq ${last.eq}`);
    for (const h of r.hourly) {
      assert.ok(Number.isFinite(h.eq) && Number.isFinite(h.margin) && Number.isFinite(h.eqUse));
      assert.ok(h.margin >= 0);
    }
    const marks = [1, 6, 12, 18, 24].map((n) => r.hourly[n - 1]!);
    assert.equal(marks.length, 5);
    assert.ok(marks.every((h) => h.green), marks.filter((h) => !h.green).map((h) => h.hour).join(","));
    assert.ok(r.liveStats.net !== 0 || r.liveOrders > 0);
  });

  it("multiple validation: overall 2+ primaries when Independent and Majority agree", () => {
    const r = runBotBacktest(defaultBotConfig("sandwich"), 24, 20260922);
    if (r.liveStats.n >= 15 && r.liveStats.pf >= 1.15 && r.liveStats.net > 0) {
      assert.ok(r.overall.positive >= 2 || !r.overall.pass, `positive ${r.overall.positive} pass ${r.overall.pass}`);
    }
    assert.ok(r.complete.pass || r.complete.coverage, JSON.stringify(r.complete));
  });
});

describe("other high-freq bots", () => {
  it("all types produce a tape and sandwich is competitive", () => {
    const all = compareBots(12, 20260922, 10);
    for (const t of BOT_TYPES) {
      assert.ok(all[t].hourly.length === 12);
      assert.ok(all[t].liveOrders + all[t].internFills.length > 0, t);
    }
    const best = bestBotType(12, 20260922);
    assert.ok(BOT_TYPES.includes(best));
    const sand = all.sandwich.liveStats;
    assert.ok(sand.n > 0);
    assert.ok(sand.pf >= 1, `sandwich pf ${sand.pf}`);
    assert.ok(all.sandwich.hourly.every((h) => h.green));
  });

  it("select modes 1H vol / 15m / ATR / burst / session all run", () => {
    for (const mode of BOT_SELECT_MODES) {
      const r = runBotBacktest({ ...defaultBotConfig("sandwich"), selectMode: mode }, 12, 11);
      assert.equal(r.cfg.selectMode, mode);
      assert.ok(r.hourly.every((h) => h.green || h.empty));
    }
  });
});

describe("best 3 parallel bots — independent process + results", () => {
  it("sanitizeArmed caps at 3, drops dupes, never empty", () => {
    assert.deepEqual(sanitizeArmed(["sandwich", "clamp", "magnet", "pivot"]), ["sandwich", "clamp", "magnet"]);
    assert.deepEqual(sanitizeArmed(["sandwich", "sandwich", "clamp"]), ["sandwich", "clamp"]);
    assert.deepEqual(sanitizeArmed(["nope"]), ["sandwich"]);
    assert.equal(sanitizeArmed([]).length, 1);
    assert.equal(BOT_PARALLEL_CAP, 3);
  });

  it("persist keeps independent configs and armed set", () => {
    const raw = sanitizeBotsPersist({
      selected: "clamp",
      armed: ["clamp", "magnet", "pivot", "sandwich"] as never,
      hours: 24,
      configs: {
        clamp: { type: "clamp", symbolCount: 20, minTp: 0.6 },
      } as never,
    });
    assert.equal(raw.selected, "clamp");
    assert.deepEqual(raw.armed, ["clamp", "magnet", "pivot"]);
    assert.equal(raw.configs.clamp.symbolCount, 20);
    assert.equal(raw.configs.magnet.type, "magnet");
    assert.notEqual(raw.configs.clamp.minTp, raw.configs.sandwich.minTp);
  });

  it("rankBotTypes / bestBotTypes returns 3 unique best with PF ≥ 1", () => {
    clearBotCache();
    const ranked = rankBotTypes(12, 20260922, 10);
    assert.equal(ranked.length, BOT_TYPES.length);
    const best = bestBotTypes(3, 12, 20260922);
    assert.equal(best.length, 3);
    assert.equal(new Set(best).size, 3);
    assert.ok(best.includes("clamp") || best.includes("pivot") || best.includes("sandwich"));
    assert.equal(best[0], ranked[0]!.type);
    for (const t of best) {
      const r = ranked.find((x) => x.type === t)!.report;
      assert.ok(r.liveStats.n > 0, t);
      assert.ok(r.liveStats.pf + 1e-9 >= 1, `${t} pf ${r.liveStats.pf}`);
      assert.ok(r.hourly.every((h) => h.green), t);
    }
  });

  it("clamp pivot sandwich each keep an independent tape and PF>=1 on 12h", () => {
    clearBotCache();
    for (const t of ["clamp", "pivot", "sandwich"] as const) {
      const r = runBotBacktest(defaultBotConfig(t), 12, 20260922);
      assert.equal(r.type, t);
      assert.ok(r.liveOrders >= 80, `${t} orders ${r.liveOrders}`);
      assert.ok(r.liveStats.pf + 1e-9 >= 1, `${t} pf ${r.liveStats.pf}`);
      assert.ok(r.hourly.every((h) => h.green), `${t} red hours ${r.hourly.filter((h) => !h.green).map((h) => h.hour).join(",")}`);
      assert.equal(r.gatedFailClosed, true);
    }
  });

  it("runParallelBots never mixes tapes and uses each type's own config", () => {
    clearBotCache();
    const types = bestBotTypes(3, 12, 20260922);
    const reports = runParallelBots(types, 12, 20260922, {
      [types[0]!]: { symbolCount: 10 },
      [types[1]!]: { symbolCount: 20 },
    });
    const keys = Object.keys(reports);
    assert.equal(keys.length, 3);
    const ids = new Set<string>();
    let shared = 0;
    for (const t of types) {
      const r = reports[t];
      assert.ok(r, t);
      assert.equal(r.type, t);
      for (const f of r.liveFills) {
        if (ids.has(f.id + f.symbol + f.barOut + t)) shared += 1;
        ids.add(f.id + f.symbol + f.barOut + t);
      }
    }
    assert.equal(shared, 0);
    const a = reports[types[0]!]!;
    const b = reports[types[1]!]!;
    assert.notEqual(a.type, b.type);
    const aPnls = a.liveFills.map((f) => f.pnl).join("|");
    const bPnls = b.liveFills.map((f) => f.pnl).join("|");
    assert.notEqual(aPnls, bPnls);
  });

  it("every type is hour-green on 12h and 24h with PF ≥ 1", () => {
    clearBotCache();
    for (const hours of [12, 24] as const) {
      for (const t of BOT_TYPES) {
        const r = runBotBacktest(defaultBotConfig(t), hours, 20260922);
        assert.ok(r.liveOrders > 0, `${t} ${hours}h empty`);
        assert.ok(r.liveStats.pf + 1e-9 >= 1, `${t} ${hours}h pf ${r.liveStats.pf}`);
        assert.ok(r.hourly.every((h) => h.green), `${t} ${hours}h red ${r.hourly.filter((h) => !h.green).map((h) => h.hour).join(",")}`);
        assert.equal(r.gatedFailClosed, true);
        assert.ok(r.cfg.minSl <= 0.5, `${t} sl ${r.cfg.minSl}`);
        for (const row of r.indication.hours) {
          assert.ok(row.green, `${t} ${hours}h indication ${r.indication.id} H${row.hour} ${row.net}`);
        }
        for (const key of ["normal", "trailing", "axis", "block", "dca"] as const) {
          const st = r.strategies[key];
          assert.equal(st.active, true);
          assert.ok(st.live && st.live.n > 0, `${t} ${key} empty`);
          assert.ok(st.live!.pf + 1e-9 >= 1 && st.live!.net > 0, `${t} ${key} pf ${st.live?.pf} net ${st.live?.net}`);
          for (const row of st.hours) assert.ok(row.green, `${t} ${key} H${row.hour} ${row.net}`);
        }
      }
    }
  });

  it("72h featured types stay almost every hour green", () => {
    clearBotCache();
    for (const t of ["clamp", "pivot", "sandwich", "snap", "sweep", "magnet"] as const) {
      const r = runBotBacktest(defaultBotConfig(t), 72, 20260922);
      const red = r.hourly.filter((h) => !h.green).length;
      assert.ok(r.liveStats.pf + 1e-9 >= 1, `${t} pf ${r.liveStats.pf}`);
      assert.ok(red / r.hourly.length <= 0.05, `${t} red ${red}/${r.hourly.length}`);
      assert.ok(r.hourSuccess + 1 >= r.hourActive || r.hourSuccess / Math.max(1, r.hourActive) >= 0.95, `${t} ${r.hourSuccess}/${r.hourActive}`);
    }
  });

  it("live floors apply and the stop stays inside 0.5%", () => {
    const f = liveBotFloors(defaultBotConfig("sandwich"));
    assert.ok(f.tpAtr >= 0.48);
    assert.ok(f.slOfTp + 1e-9 >= 0.75);
    assert.ok(f.slPct >= 0.4);
    assert.equal(f.trailPct, 0.3);
    const r = runBotBacktest(defaultBotConfig("sandwich"), 12, 20260922);
    assert.ok(r.liveFills.length >= 120);
    assert.ok(r.hourly.every((h) => h.green));
    assert.ok(r.cfg.minSl <= 0.5);
  });

  it("across seeds, almost every hour stays green with PF ≥ 1", () => {
    clearBotCache();
    const seeds = [1, 7, 11, 42, 99, 2024, 20260921, 20260922, 123456, 999999];
    for (const t of ["sandwich", "clamp", "pivot"] as const) {
      let redRuns = 0;
      let runs = 0;
      let redHours = 0;
      let hours = 0;
      for (const seed of seeds) {
        const r = runBotBacktest(defaultBotConfig(t), 24, seed);
        runs += 1;
        hours += r.hourly.length;
        const red = r.hourly.filter((h) => !h.green).length;
        redHours += red;
        if (red > 0 || r.liveStats.pf < 1 || r.liveStats.net <= 0) redRuns += 1;
        assert.ok(r.liveStats.pf + 1e-9 >= 1, `${t} seed ${seed} pf ${r.liveStats.pf}`);
        assert.ok(r.liveStats.net > 0, `${t} seed ${seed} net ${r.liveStats.net}`);
        assert.ok(red / r.hourly.length <= 0.12, `${t} seed ${seed} red ${red}/${r.hourly.length}`);
      }
      assert.ok(redHours / hours <= 0.05, `${t} red hours ${redHours}/${hours}`);
      assert.ok(redRuns <= 3, `${t} red runs ${redRuns}/${runs}`);
    }
  });

  it("parallel overall 2+ is per-type, gated PF<1 never passes", () => {
    const types = bestBotTypes(3, 12, 20260922);
    const reports = runParallelBots(types, 12, 20260922);
    for (const t of types) {
      const r = reports[t]!;
      if (r.overall.pass) {
        assert.ok((r.overall.gatedPf ?? 0) + 1e-9 >= GATED_MIN_PF, `${t} gated ${r.overall.gatedPf}`);
        assert.ok(r.overall.positive >= 2, `${t} primaries ${r.overall.positive}`);
      }
      assert.equal(r.gatedFailClosed, true);
    }
  });
});

describe("bots live on the desk tape", () => {
  it("arms independent bot orders and does not run the ladder", () => {
    const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, maxHoldTicks: 24 };
    const e = initVstEngine(cfg, { symbolCount: 10, warmup: 0, arm: false, equity: 10, costStep: 3 });
    engageLiveBook(e);
    e.botMode = true;
    e.running = true;
    e.phase = "running";
    e.symbolCount = 10;
    const armed = ["sandwich", "clamp", "pivot"] as const;
    const cfgs = {
      sandwich: defaultBotConfig("sandwich"),
      clamp: defaultBotConfig("clamp"),
      pivot: defaultBotConfig("pivot"),
    };
    let placed = 0;
    let engine = e;
    for (let i = 0; i < 200; i++) {
      placed += stepDeskBots(engine, armed, cfgs);
      tickVst(engine, cfg, "trailing", { symbolCount: 10, rangeType: "atr" });
      engine = { ...engine, botHist: engine.botHist, closed: engine.closed, positions: engine.positions, queue: engine.queue, orders: engine.orders, quotes: engine.quotes };
    }
    const tagged = [...engine.queue, ...engine.orders, ...engine.positions].filter((row) => String((row as { playbook?: string }).playbook || "").startsWith("bot:"));
    const books = new Set(tagged.map((row) => String((row as { playbook?: string }).playbook || "")));
    const closedN = engine.closed.filter((c) => String(c.playbook || "").startsWith("bot:") && !c.protect).length;
    const histN = Object.values(engine.botHist ?? {}).reduce((n, rows) => n + rows.length, 0);
    assert.ok(placed > 0, `placed ${placed}`);
    assert.ok(tagged.length > 0, "bot orders reached the book");
    assert.ok(books.size >= 2, `books ${[...books].join(",")}`);
    assert.ok(histN >= 200, `history dropped across snapshots ${histN}`);
    assert.ok(closedN > 0, `live closes ${closedN}`);
    const tape = liveBotTape(engine, "sandwich");
    assert.ok(tape.hours.length >= 2, `hours ${tape.hours.length}`);
    const ladder = [...engine.queue, ...engine.orders].filter((o) => !String(o.playbook || "").startsWith("bot:") && (o.status === "queued" || o.status === "open" || o.status === "partial"));
    assert.equal(ladder.length, 0);
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      stepDeskBots(engine, armed, cfgs);
      tickVst(engine, cfg, "trailing", { symbolCount: 10, rangeType: "atr" });
    }
    const ms = Date.now() - t0;
    assert.ok(ms < 2000, `bot clock ${ms}ms`);
    const stray = [...engine.queue, ...engine.orders].filter((o) => !String(o.playbook || "").startsWith("bot:") && (o.status === "queued" || o.status === "open" || o.status === "partial"));
    assert.equal(stray.length, 0);
  });

  it("each connection opens its own positions and keeps one bar per tick", () => {
    const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, maxHoldTicks: 24 };
    const e = initVstEngine(cfg, { symbolCount: 8, warmup: 0, arm: false, equity: 10, costStep: 3 });
    engageLiveBook(e);
    e.running = true;
    e.phase = "running";
    e.symbolCount = 8;
    const armed = ["sandwich", "clamp", "pivot"] as const;
    const cfgs = {
      sandwich: defaultBotConfig("sandwich"),
      clamp: defaultBotConfig("clamp"),
      pivot: defaultBotConfig("pivot"),
    };
    const conns = ["bingx-vst-01", "bingx-vst-02", "bingx-x01"] as const;
    const view = conns[1];
    for (let i = 0; i < 80; i++) {
      const sampledAt = e.tick;
      const before = e.botHist?.BTCUSDT?.length ?? 0;
      e.activeConnId = view;
      e.botMode = true;
      stepDeskBots(e, armed, cfgs);
      tickVst(e, cfg, "trailing", { symbolCount: 8, rangeType: "atr" });
      e.botHistTick = e.tick;
      for (const id of conns) {
        if (id === view) continue;
        e.activeConnId = id;
        e.botMode = true;
        stepDeskBots(e, armed, cfgs);
        tickVst(e, cfg, "trailing", { bookOnly: true, symbolCount: 8, rangeType: "atr" });
      }
      e.botHistTick = sampledAt;
      const after = e.botHist?.BTCUSDT?.length ?? before;
      assert.ok(after <= before + 1, `extra bars ${before} -> ${after} at tick ${e.tick}`);
    }
    for (const id of conns) {
      const open = e.positions.filter((p) => p.connId === id && p.qty > 0 && String(p.playbook || "").startsWith("bot:"));
      const closed = e.closed.filter((c) => c.connId === id && String(c.playbook || "").startsWith("bot:") && !c.protect);
      const tagged = [...e.queue, ...e.orders, ...e.positions, ...closed].filter((row) => row.connId === id && String((row as { playbook?: string }).playbook || "").startsWith("bot:"));
      assert.ok(open.length + closed.length > 0, `${id} never traded`);
      assert.ok(tagged.length > 0, `${id} book empty`);
      assert.ok(tagged.every((row) => row.connId === id), `${id} conn mixed`);
    }
    const moved = e.positions.some((p) => String(p.playbook || "").startsWith("bot:") && !conns.includes(p.connId as (typeof conns)[number]));
    assert.equal(moved, false);
  });

  it("open bot positions match their fills, stops, and connection", () => {
    const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: true, maxHoldTicks: 24 };
    const e = initVstEngine(cfg, { symbolCount: 8, warmup: 0, arm: false, equity: 10, costStep: 3 });
    engageLiveBook(e);
    e.running = true;
    e.phase = "running";
    e.symbolCount = 8;
    e.tpRatio = 2.6;
    const armed = ["sandwich", "clamp", "pivot"] as const;
    const cfgs = {
      sandwich: defaultBotConfig("sandwich"),
      clamp: defaultBotConfig("clamp"),
      pivot: defaultBotConfig("pivot"),
    };
    const conns = ["bingx-vst-01", "bingx-vst-02", "bingx-x01"] as const;
    for (let i = 0; i < 50; i++) {
      for (const id of conns) {
        e.activeConnId = id;
        e.botMode = true;
        stepDeskBots(e, armed, cfgs);
        tickVst(e, cfg, "trailing", { symbolCount: 8, rangeType: "atr" });
      }
    }
    const seen = new Set<string>();
    let checked = 0;
    for (const p of e.positions) {
      if (!String(p.playbook || "").startsWith("bot:") || !(p.qty > 0)) continue;
      checked += 1;
      const key = `${p.connId}|${p.symbol}|${p.side}|${p.playbook}`;
      assert.equal(seen.has(key), false, `duplicate ${key}`);
      seen.add(key);
      assert.ok(conns.includes(p.connId as (typeof conns)[number]), p.connId);
      const legQty = p.legs.reduce((s, l) => s + l.qty, 0);
      assert.ok(Math.abs(legQty - p.qty) < 1e-8, `qty ${p.qty} legs ${legQty}`);
      assert.ok(p.avgEntry > 0 && p.mark > 0);
      if (p.side === "long") {
        assert.ok(p.tp > p.avgEntry, `long tp ${p.tp} entry ${p.avgEntry}`);
        assert.ok(p.sl < p.tp, `long sl ${p.sl} tp ${p.tp}`);
        assert.ok(p.sl < p.mark, `long stop through mark sl ${p.sl} mark ${p.mark}`);
      } else {
        assert.ok(p.tp < p.avgEntry, `short tp ${p.tp} entry ${p.avgEntry}`);
        assert.ok(p.sl > p.tp, `short sl ${p.sl} tp ${p.tp}`);
        assert.ok(p.sl > p.mark, `short stop through mark sl ${p.sl} mark ${p.mark}`);
      }
      const signed = p.side === "long" ? 1 : -1;
      const mark = closePnl(signed, p.avgEntry, p.mark, p.qty);
      assert.ok(Math.abs(mark - p.unrealized) < 1e-6, `mark ${mark} unrealized ${p.unrealized}`);
      const foreign = e.positions.filter((q) => q.id === p.id && q.connId !== p.connId);
      assert.equal(foreign.length, 0);
    }
    assert.ok(checked > 0, "no open bot positions");
    for (const id of conns) {
      const mine = e.positions.filter((p) => p.connId === id && p.qty > 0 && String(p.playbook || "").startsWith("bot:"));
      const other = e.positions.filter((p) => p.connId !== id && p.qty > 0 && String(p.playbook || "").startsWith("bot:"));
      assert.ok(mine.length > 0, `${id} empty`);
      assert.ok(other.every((p) => p.connId !== id));
    }
  });
});
