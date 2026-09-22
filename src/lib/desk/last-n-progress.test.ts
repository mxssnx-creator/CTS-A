import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LAST_N_PROGRESS,
  EVAL_POS_N,
  EVAL_POS_NS,
  LIVE_DISABLE_N,
  LIVE_DISABLE_NS,
  VALID_EXEC_NS,
  VALID_EXEC_POS_N,
  coordinateLastN,
  decideLastN,
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
    assert.ok(fold.independent.pf > fold.combined.pf + 0.2, `fold ind ${fold.independent.pf} vs comb ${fold.combined.pf}`);
    assert.equal(fold.parallel.pass, true);
    assert.ok(Math.abs(fold.parallel.pf - fold.independent.pf) < 1e-9);
    assert.ok(fold.independent.n <= fold.combined.n || fold.independent.pf > fold.combined.pf);
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

  it("relComboKey is indication × tactic × range × playbook", () => {
    assert.equal(
      relComboKey({ indication: "ema", tactic: "axis", rangeType: "atr", playbook: "short" }),
      "ema:axis:atr:short",
    );
    assert.equal(relComboKey({ indication: "trend" }, { tactic: "trailing", range: "atr" }), "trend:trailing:atr:short");
  });
});
