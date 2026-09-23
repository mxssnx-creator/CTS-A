import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LAST_N_PROGRESS,
  EVAL_POS_N,
  EVAL_POS_NS,
  GATED_MIN_PF,
  LIVE_DISABLE_N,
  LIVE_DISABLE_NS,
  VALID_EXEC_NS,
  VALID_EXEC_POS_N,
  coordinateLastN,
  decideLastN,
  gatedFloorPf,
  hitsToProgressRows,
  lastNHitFromPrefix,
  lastNMaxOf,
  lastNPrefix,
  lastNWindows,
  relComboKey,
  sanitizeLastNProgress,
  scoreLastNGroup,
  scoreLastNModeTape,
  foldLastNProcessings,
  completeLastNCorrectness,
  coverCatalogRows,
  lastNMajorityOk,
  MAJORITY_MIN_POSITIVE,
  LAST_N_PASS_MODES,
  slimLastNProgress,
} from "./last-n-progress.ts";

const cfgP = sanitizeLastNProgress({
  ...DEFAULT_LAST_N_PROGRESS,
  mode: "parallel",
  parallelStack: true,
  parallelVolRatio: 1.25,
});
const cfgI = sanitizeLastNProgress({ ...DEFAULT_LAST_N_PROGRESS, mode: "independent" });
const cfgC = sanitizeLastNProgress({ ...DEFAULT_LAST_N_PROGRESS, mode: "combined" });

function wins(n: number, pnl = 1.2) {
  return Array.from({ length: n }, () => ({ pnl }));
}
function mixed(good: number, bad: number, gp = 1.4, gl = -0.9) {
  return [...Array.from({ length: good }, () => ({ pnl: gp })), ...Array.from({ length: bad }, () => ({ pnl: gl }))];
}

describe("multi last-N prefix + modes", () => {
  it("prefix hits match naive slices and stay O(windows) after one prefix", () => {
    const rows = mixed(30, 10, 1.1, -0.7);
    const pre = lastNPrefix(rows, 80);
    for (const n of [8, 12, 15, 24, 50, 80]) {
      const hit = lastNHitFromPrefix(pre, n);
      const take = rows.slice(0, n);
      const gp = take.filter((r) => r.pnl > 0).reduce((s, r) => s + r.pnl, 0);
      const gl = Math.abs(take.filter((r) => r.pnl < 0).reduce((s, r) => s + r.pnl, 0));
      const net = take.reduce((s, r) => s + r.pnl, 0);
      const pf = gl < 1e-12 ? (gp > 1e-12 ? 4 : 0) : gp / gl;
      assert.equal(hit.samples, take.length);
      assert.ok(Math.abs(hit.net - net) < 1e-9, `net ${hit.net} vs ${net}`);
      assert.ok(Math.abs(hit.pf - pf) < 1e-9, `pf ${hit.pf} vs ${pf}`);
    }
    const all = lastNWindows(rows, EVAL_POS_NS);
    assert.equal(all.length, EVAL_POS_NS.length);
    assert.equal(all[0]!.n, 15);
    assert.equal(all[all.length - 1]!.n, 80);
  });

  it("independent / combined / parallel agree on a winning tape and stack only in parallel", () => {
    const rows = wins(40);
    const wi = decideLastN(rows, cfgI, 1.2, 1.1);
    const wc = decideLastN(rows, cfgC, 1.2, 1.1);
    const wp = decideLastN(rows, cfgP, 1.2, 1.1);
    assert.equal(wi.pass, true);
    assert.equal(wc.pass, true);
    assert.equal(wp.pass, true);
    assert.equal(wi.independent, true);
    assert.equal(wc.combined, true);
    assert.equal(wp.majority, true);
    assert.equal(wi.stack, 1);
    assert.equal(wc.stack, 1);
    assert.ok(wp.stack >= 1.2, `stack ${wp.stack}`);
  });

  it("short mixed tape: independent can pass while combined fails; parallel follows either", () => {
    const rows = mixed(8, 12);
    const mi = decideLastN(rows, cfgI, 1.2, 1.1);
    const mc = decideLastN(rows, cfgC, 1.2, 1.1);
    const mp = decideLastN(rows, cfgP, 1.2, 1.1);
    assert.equal(mi.independent, true);
    assert.equal(mc.combined, false);
    assert.equal(mp.pass, true);
    assert.equal(mp.stack, 1);
  });

  it("independent and combined processings score different PFs on a mixed tape", () => {
    const rows = mixed(8, 12);
    const i = scoreLastNModeTape(rows, cfgI, 1.2, 1.1, "independent");
    const c = scoreLastNModeTape(rows, cfgC, 1.2, 1.1, "combined");
    const fold = foldLastNProcessings(rows.slice(0, 8), rows, cfgP, 1.2, 1.1);
    assert.equal(i.pass, true);
    assert.equal(c.pass, false);
    assert.ok(i.pf > c.pf + 0.2, `independent PF ${i.pf} vs combined ${c.pf}`);
    assert.ok(fold.modes.independent.pf > fold.modes.combined.pf + 0.2, `fold ind ${fold.modes.independent.pf} vs comb ${fold.modes.combined.pf}`);
    assert.equal(fold.modes.parallel.pass, true);
    assert.ok(Math.abs(fold.modes.parallel.pf - fold.modes.independent.pf) < 1e-9);
    assert.ok(fold.modes.independent.n <= fold.modes.combined.n || fold.modes.independent.pf > fold.modes.combined.pf);
  });

  it("two positive base windows make combined stronger than the weaker single", () => {
    const rows: { pnl: number }[] = [];
    for (let i = 0; i < 20; i++) rows.push({ pnl: 1 });
    for (let i = 0; i < 10; i++) rows.push({ pnl: -0.8 });
    for (let i = 0; i < 40; i++) rows.push({ pnl: -0.15 });
    const pre = lastNPrefix(rows, 80);
    const w30 = lastNHitFromPrefix(pre, 30);
    const w50 = lastNHitFromPrefix(pre, 50);
    assert.ok(w30.pf + 1e-9 >= 1 && w30.avg >= 0, `30 pf ${w30.pf} avg ${w30.avg}`);
    assert.ok(w50.pf + 1e-9 >= 1 && w50.avg >= 0, `50 pf ${w50.pf} avg ${w50.avg}`);
    const c = scoreLastNModeTape(rows, cfgC, 1, 1, "combined");
    const weaker = Math.min(w30.pf, w50.pf);
    assert.equal(c.pass, true, `combined pass pf ${c.pf} n ${c.n}`);
    assert.ok(c.pf + 1e-9 >= weaker, `combined ${c.pf} should beat weaker single ${weaker}`);
    assert.ok(c.pf + 1e-9 >= Math.max(w30.pf, w50.pf) - 1e-9, `combined ${c.pf} should be the stronger of 30=${w30.pf} and 50=${w50.pf}`);
  });

  it("gated PF below 1 fail-closes Independent, Combined, and Parallel", () => {
    assert.equal(GATED_MIN_PF, 1);
    assert.equal(gatedFloorPf(0), 1);
    assert.equal(gatedFloorPf(0.95), 1);
    assert.equal(gatedFloorPf(1.35), 1.35);
    const zeros = Array.from({ length: 24 }, () => ({ pnl: 0 }));
    const internMin = 0;
    const z = foldLastNProcessings(zeros, zeros, cfgP, internMin, internMin);
    assert.equal(z.modes.independent.pass, false);
    assert.equal(z.modes.combined.pass, false);
    assert.equal(z.modes.parallel.pass, false);
    assert.equal(z.modes.majority.pass, false);
    assert.equal(z.overall.pass, false);
    assert.ok(z.overall.positive < MAJORITY_MIN_POSITIVE);
    assert.ok(z.modes.independent.gatedPf < GATED_MIN_PF, `ind gated ${z.modes.independent.gatedPf}`);
    assert.ok(z.modes.combined.gatedPf < GATED_MIN_PF, `comb gated ${z.modes.combined.gatedPf}`);
    const red = Array.from({ length: 24 }, () => ({ pnl: -0.8 }));
    const r = foldLastNProcessings(red, red, cfgP, internMin, internMin);
    assert.equal(r.modes.independent.pass, false);
    assert.equal(r.modes.combined.pass, false);
    assert.equal(r.modes.parallel.pass, false);
    assert.equal(r.modes.majority.pass, false);
    assert.equal(r.overall.pass, false);
    assert.ok(r.modes.combined.gatedPf < GATED_MIN_PF);
  });

  it("Independent can keep PF≥1 while Combined gated PF<1 fails; Parallel follows Independent", () => {
    const win = wins(12, 1.2);
    const mixedBook = mixed(8, 16, 1.2, -1.4);
    const fold = foldLastNProcessings(win, mixedBook, cfgP, 0, 0);
    assert.equal(fold.modes.independent.pass, true);
    assert.ok(fold.modes.independent.gatedPf + 1e-9 >= GATED_MIN_PF, `ind gated ${fold.modes.independent.gatedPf}`);
    assert.equal(fold.modes.combined.pass, false);
    assert.ok(fold.modes.combined.gatedPf < GATED_MIN_PF, `comb gated ${fold.modes.combined.gatedPf} must fail below 1`);
    assert.equal(fold.modes.parallel.pass, true);
    assert.ok(Math.abs(fold.modes.parallel.pf - fold.modes.independent.pf) < 1e-9);
  });

  it("undersampled tapes do not claim a gated processing pass", () => {
    const thin = wins(5, 1.4);
    const s = scoreLastNModeTape(thin, cfgP, 0, 0, "independent");
    assert.equal(s.pass, false);
    assert.ok(s.gatedN < 8);
  });

  it("majority 2+ needs two valid windows; a single lucky N does not confirm", () => {
    assert.equal(MAJORITY_MIN_POSITIVE, 2);
    const oneWindow = [...wins(8, 1.2), ...Array.from({ length: 16 }, () => ({ pnl: -3 }))];
    const d = decideLastN(oneWindow, cfgP, 0, 0);
    assert.equal(d.independent, true);
    assert.equal(d.majority, false);
    assert.equal(d.combined, false);
    const maj = scoreLastNModeTape(oneWindow, cfgP, 0, 0, "majority");
    assert.equal(maj.pass, false);
    const fold = foldLastNProcessings(oneWindow, oneWindow, cfgP, 0, 0);
    assert.equal(fold.modes.independent.pass, true);
    assert.equal(fold.modes.majority.pass, false);
    assert.equal(fold.modes.combined.pass, false);
    assert.equal(fold.overall.pass, false, "one positive processing is not overall");
    assert.equal(fold.overall.positive, 1);
  });

  it("majority 2+ and Independent together make overall pass even when Combined is red", () => {
    const win = wins(16, 1.2);
    const mixedBook = mixed(8, 16, 1.2, -1.4);
    const d = decideLastN(win, cfgP, 0, 0);
    assert.equal(d.independent, true);
    assert.equal(d.majority, true);
    const fold = foldLastNProcessings(win, mixedBook, cfgP, 0, 0);
    assert.equal(fold.modes.independent.pass, true);
    assert.equal(fold.modes.majority.pass, true);
    assert.equal(fold.modes.combined.pass, false);
    assert.equal(fold.overall.pass, true);
    assert.ok(fold.overall.positive >= MAJORITY_MIN_POSITIVE);
    assert.ok(fold.overall.keys.includes("independent"));
    assert.ok(fold.overall.keys.includes("majority"));
    assert.ok(Math.abs(fold.overall.pf - fold.modes.independent.pf) < 1e-9, "overall headline stays Independent");
    assert.ok((fold.overall.gatedPf ?? 0) + 1e-9 >= GATED_MIN_PF);
  });

  it("all three primaries positive is overall pass; Parallel is not double-counted", () => {
    const rows = wins(40);
    const fold = foldLastNProcessings(rows, rows, cfgP, 1.2, 1.1);
    assert.equal(fold.modes.independent.pass, true);
    assert.equal(fold.modes.combined.pass, true);
    assert.equal(fold.modes.majority.pass, true);
    assert.equal(fold.modes.parallel.pass, true);
    assert.equal(fold.overall.pass, true);
    assert.equal(fold.overall.positive, 3);
    assert.equal(fold.overall.keys.includes("parallel"), false);
  });

  it("complete correctness: full grids, intern coverage, gated PF<1 never passes", () => {
    const rows = wins(40);
    const fold = foldLastNProcessings(rows, rows, cfgP, 1.2, 1.1);
    const d = decideLastN(rows, cfgP, 1.2, 1.1);
    const evalNs = hitsToProgressRows(d.evalHits, 1.1, cfgP.evalNs);
    const validNs = hitsToProgressRows(d.validHits, 1.2, cfgP.validNs);
    const disableNs = hitsToProgressRows(d.disableHits, 0, cfgP.disableNs, "avg");
    const complete = completeLastNCorrectness(evalNs, validNs, disableNs, fold.modes, fold.overall);
    assert.equal(complete.evalOk, true);
    assert.equal(complete.validOk, true);
    assert.equal(complete.disableOk, true);
    assert.equal(complete.coverage, true);
    assert.equal(complete.pass, true);
    assert.equal(complete.positive, 3);
    assert.equal(complete.typesOk, true);

    const red = Array.from({ length: 24 }, () => ({ pnl: -0.8 }));
    const fail = foldLastNProcessings(red, red, cfgP, 0, 0);
    const rd = decideLastN(red, cfgP, 0, 0);
    const completeFail = completeLastNCorrectness(
      hitsToProgressRows(rd.evalHits, 0, cfgP.evalNs),
      hitsToProgressRows(rd.validHits, 0, cfgP.validNs),
      hitsToProgressRows(rd.disableHits, 0, cfgP.disableNs, "avg"),
      fail.modes,
      fail.overall,
    );
    assert.equal(completeFail.coverage, true);
    assert.equal(completeFail.pass, true, "failed processings still complete-correct when gated PF<1 never passes");
    assert.ok(LAST_N_PASS_MODES.every((k) => !fail.modes[k].pass || fail.modes[k].gatedPf >= GATED_MIN_PF));

    const empty = completeLastNCorrectness(
      hitsToProgressRows([], 0, EVAL_POS_NS),
      hitsToProgressRows([], 0, VALID_EXEC_NS),
      hitsToProgressRows([], 0, LIVE_DISABLE_NS, "avg"),
      fail.modes,
      fail.overall,
    );
    assert.equal(empty.coverage, true, "empty intern cells stay covered");
    assert.equal(empty.pass, true);
  });

  it("lastNMajorityOk: empty intern open, one window fail-closes, two windows pass", () => {
    assert.equal(lastNMajorityOk([], () => true), true);
    const one = lastNWindows(wins(8), VALID_EXEC_NS).filter((h) => h.samples >= h.n);
    assert.equal(lastNMajorityOk(one, (h) => h.ok), false);
    const two = lastNWindows(wins(16), VALID_EXEC_NS).filter((h) => h.samples >= h.n);
    assert.ok(two.length >= 2);
    assert.equal(lastNMajorityOk(two, (h) => h.ok), true);
  });


  it("losing disable windows kill independent (all) and combined (majority)", () => {
    const rows = Array.from({ length: 24 }, () => ({ pnl: -0.8 }));
    const d = decideLastN(rows, cfgP, 1.2, 1.1);
    assert.equal(d.independent, false);
    assert.equal(d.combined, false);
    assert.equal(d.pass, false);
  });

  it("valid-execute pass is not killed by a red disable window", () => {
    const rows = [...Array.from({ length: 6 }, () => ({ pnl: -0.25 })), ...wins(24, 1.2)];
    const d = decideLastN(rows, cfgP, 1.05, 0.9);
    const d6 = d.disableHits.find((h) => h.n === 6);
    assert.ok(d6 && d6.avg < 0, "disable N=6 is red");
    assert.equal(d.independent, true);
    assert.equal(d.pass, true);
  });
});

describe("coordinateLastN picks working windows without shrinking settings", () => {
  it("keeps the full settings grid untouched and returns a slim active set", () => {
    const settings = sanitizeLastNProgress(undefined);
    assert.equal(settings.evalNs.length, EVAL_POS_NS.length);
    assert.deepEqual(settings.validNs, [...VALID_EXEC_NS]);
    assert.deepEqual(settings.disableNs, [...LIVE_DISABLE_NS]);
    const pick = coordinateLastN(wins(60), settings, 1.2, 1.1);
    assert.ok(pick.evalNs.length >= 1 && pick.evalNs.length <= 3, `eval ${pick.evalNs}`);
    assert.ok(pick.validNs.length >= 1 && pick.validNs.length <= 3, `valid ${pick.validNs}`);
    assert.ok(pick.disableNs.length >= 1 && pick.disableNs.length <= 3, `disable ${pick.disableNs}`);
    assert.ok(pick.disableNs.includes(LIVE_DISABLE_N), "disable keeps primary 12");
    assert.equal(settings.evalNs.length, 14);
    assert.equal(pick.mode, "parallel");
    assert.ok(pick.stack >= 1.2);
    const slim = slimLastNProgress(settings, pick);
    assert.ok(slim.evalNs.length <= 3);
    assert.ok(lastNMaxOf(slim) <= lastNMaxOf(settings));
    assert.equal(pick.bestEval, pick.evalNs[pick.evalNs.length - 1]);
    assert.equal(pick.bestValid, pick.validNs[0]);
    assert.ok(pick.validNs.every((n) => n >= VALID_EXEC_NS[0]! && n <= VALID_EXEC_POS_N * 2));
  });

  it("does not force a failing primary eval N into the active set", () => {
    const rows = [...wins(20, 1.6), ...Array.from({ length: 40 }, () => ({ pnl: -0.4 }))];
    const pick = coordinateLastN(rows, cfgP, 1.15, 1.05);
    const eval50 = pick.evalHits.find((h) => h.n === EVAL_POS_N);
    if (eval50 && eval50.samples >= EVAL_POS_N && eval50.avg < 0) {
      assert.equal(pick.evalNs.includes(EVAL_POS_N), false);
    }
    assert.ok(pick.evalNs.every((n) => EVAL_POS_NS.includes(n)));
  });

  it("picks independent vs combined from what actually passes", () => {
    const mixedTape = mixed(8, 12);
    const p = coordinateLastN(mixedTape, cfgP, 1.2, 1.1);
    assert.equal(p.independent, true);
    assert.equal(p.combined, false);
    assert.equal(p.mode, "independent");
    assert.equal(p.stack, 1);
    const allWin = coordinateLastN(wins(50), cfgC, 1.2, 1.1);
    assert.equal(allWin.mode, "parallel");
  });

  it("hitsToProgressRows keeps the full grid keys for display", () => {
    const pick = coordinateLastN(wins(40), cfgP, 1.2, 1.1);
    const rows = hitsToProgressRows(pick.evalHits, 1.1, cfgP.evalNs);
    assert.equal(Object.keys(rows).length, cfgP.evalNs.length);
    assert.ok(rows["50"] || rows["15"]);
  });

  it("eval / valid / disable grids stay full; sampled PF<1 is a fail, empty stays intern-covered", () => {
    const settings = sanitizeLastNProgress(undefined);
    assert.deepEqual(settings.evalNs, [...EVAL_POS_NS]);
    assert.deepEqual(settings.validNs, [...VALID_EXEC_NS]);
    assert.deepEqual(settings.disableNs, [...LIVE_DISABLE_NS]);
    assert.equal(EVAL_POS_NS[0], 15);
    assert.equal(EVAL_POS_NS[EVAL_POS_NS.length - 1], 80);
    assert.deepEqual(VALID_EXEC_NS, [8, 12, 16, 20, 24]);
    assert.equal(LIVE_DISABLE_NS[0], 6);
    assert.equal(LIVE_DISABLE_NS[LIVE_DISABLE_NS.length - 1], 20);
    const red = lastNWindows(Array.from({ length: 24 }, () => ({ pnl: -0.7 })), VALID_EXEC_NS);
    const sampled = hitsToProgressRows(red, 0, VALID_EXEC_NS);
    for (const n of VALID_EXEC_NS) {
      const row = sampled[String(n)];
      assert.ok(row, `valid N=${n}`);
      if ((row?.n ?? 0) > 0) assert.equal(row!.ok, false, `sampled N=${n} PF ${row!.pf} must fail below 1`);
    }
    const empty = hitsToProgressRows([], 0, EVAL_POS_NS);
    assert.equal(Object.keys(empty).length, EVAL_POS_NS.length);
    assert.ok(Object.values(empty).every((r) => r.ok && r.n === 0));
  });

  it("intern still scores PF<1 combos for future configs without claiming a processing pass", () => {
    const lose = Array.from({ length: 16 }, () => ({ pnl: -0.9 }));
    const sc = scoreLastNGroup(lose, cfgP, 0, 0);
    assert.equal(sc.ok, false);
    assert.ok(sc.pf < GATED_MIN_PF);
    assert.ok(sc.n >= 4);
    const mode = scoreLastNModeTape(lose, cfgP, 0, 0, "independent");
    assert.equal(mode.pass, false);
    const fresh = scoreLastNGroup(wins(2), cfgP, 0, 0);
    assert.equal(fresh.ok, true, "undersampled intern coverage stays open");
  });

  it("scoreLastNGroup explores undersampled and uses independent full last-N for types", () => {
    const fresh = scoreLastNGroup(wins(2), cfgP, 1.2, 1.1);
    assert.equal(fresh.ok, true);
    assert.equal(fresh.n, 2);
    const good = scoreLastNGroup(wins(20), cfgP, 1.2, 1.1);
    assert.equal(good.ok, true);
    const bad = scoreLastNGroup(Array.from({ length: 16 }, () => ({ pnl: -0.9 })), cfgP, 1.2, 1.1);
    assert.equal(bad.ok, false);
  });

  it("scoreLastNGroup uses a full passing valid window, not the shortest slice", () => {
    const tape = [...Array.from({ length: 4 }, () => ({ pnl: -0.4 })), ...wins(20, 1.3)];
    const sc = scoreLastNGroup(tape, cfgP, 1.1, 1.0);
    assert.equal(sc.ok, true);
    assert.ok(sc.n >= 12, `full valid window n=${sc.n}`);
    assert.ok(sc.pf >= 1.1, `pf ${sc.pf}`);
  });

  it("each relation scores independent last-N on the full grid", () => {
    const g = scoreLastNGroup(wins(50), cfgP, 1.2, 1.1);
    const b = scoreLastNGroup(Array.from({ length: 20 }, () => ({ pnl: -0.9 })), cfgP, 1.2, 1.1);
    assert.equal(g.ok, true);
    assert.equal(b.ok, false);
    assert.ok(g.n >= 15, `winning relation n=${g.n}`);
    assert.ok(g.stack >= 1);
  });

  it("coverCatalogRows fills every key; sampled PF<1 never passes; empty stays intern-covered", () => {
    const keys = ["trend", "break", "active", "direction", "ema"];
    const scored = coverCatalogRows(
      {
        trend: { n: 12, pf: 1.4, net: 4, ok: true },
        ema: { n: 16, pf: 0.4, net: -3, ok: true },
      },
      keys,
    );
    assert.equal(Object.keys(scored).length, keys.length);
    assert.equal(scored.trend?.ok, true);
    assert.equal(scored.ema?.ok, false, "sampled gated PF<1 is a failed processing");
    assert.equal(scored.break?.n, 0);
    assert.equal(scored.break?.ok, true, "unsampled intern coverage stays open");
    const missing = completeLastNCorrectness(
      Object.fromEntries(EVAL_POS_NS.map((n) => [String(n), { n: 0, pf: 0, net: 0, ok: true }])),
      Object.fromEntries(VALID_EXEC_NS.map((n) => [String(n), { n: 0, pf: 0, net: 0, ok: true }])),
      Object.fromEntries(LIVE_DISABLE_NS.map((n) => [String(n), { n: 0, pf: 0, net: 0, ok: true }])),
      {
        independent: { pass: false, pf: 0, n: 0, net: 0, gatedPf: 0, gatedN: 0 },
        combined: { pass: false, pf: 0, n: 0, net: 0, gatedPf: 0, gatedN: 0 },
        parallel: { pass: false, pf: 0, n: 0, net: 0, gatedPf: 0, gatedN: 0 },
        majority: { pass: false, pf: 0, n: 0, net: 0, gatedPf: 0, gatedN: 0 },
      },
      { pass: false, pf: 0, n: 0, net: 0, gatedPf: 0, gatedN: 0, positive: 0, keys: [] },
      { indications: { trend: { n: 8, pf: 0.5, net: -1, ok: true } }, indicationKeys: ["trend", "break"] },
    );
    assert.equal(missing.typesOk, false);
    assert.equal(missing.pass, false);
  });

  it("relComboKey is indication × tactic × range × playbook", () => {
    assert.equal(
      relComboKey({ indication: "ema", tactic: "axis", rangeType: "atr", playbook: "short" }),
      "ema:axis:atr:short",
    );
    assert.equal(relComboKey({ indication: "trend" }, { tactic: "trailing", range: "atr" }), "trend:trailing:atr:short");
  });
});
