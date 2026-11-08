import assert from "node:assert/strict";
import { test } from "node:test";
import { SL_TP_RATIOS, initialProtection, minimumStopFraction, normalizeMinSlDistancePct } from "./protection-policy.ts";

test("every requested SL ratio retains its target and respects the cost-plus-distance floor", () => {
  assert.equal(SL_TP_RATIOS.length, 10);
  assert.equal(new Set(SL_TP_RATIOS).size, 10);
  for (const side of ["long", "short"] as const) for (const ratio of SL_TP_RATIOS) {
    for (const cost of [0, 0.0011, 0.00143, 0.00176]) for (const netPct of [0.1, 0.4, 1]) {
      const entry = 100, target = 0.2;
      const row = initialProtection(side, entry, target * ratio, target, cost, netPct);
      assert.equal(row.tpDist, target);
      assert.ok(Math.abs(row.slDist - Math.max(target * ratio, entry * cost + netPct)) < 1e-12);
      assert.ok(side === "long" ? row.sl < entry && row.tp > entry : row.sl > entry && row.tp < entry);
    }
  }
});

test("setting bounds and venue distance cannot tighten the shared minimum", () => {
  assert.equal(normalizeMinSlDistancePct(undefined), 0.1);
  assert.equal(normalizeMinSlDistancePct(NaN), 0.1);
  assert.equal(normalizeMinSlDistancePct(-1), 0.1);
  assert.equal(normalizeMinSlDistancePct(4), 1);
  assert.ok(Math.abs(minimumStopFraction(0.00176, 0.1) - 0.00276) < 1e-12);
  const row = initialProtection("short", 100, 0.05, 0.2, 0.00176, 0.1, 0.004);
  assert.equal(row.slDist, 0.4);
  assert.equal(row.tpDist, 0.2);
  assert.throws(() => minimumStopFraction(NaN), /Invalid modeled cost/);
  assert.throws(() => initialProtection("long", 0, 1, 1, 0), /Invalid entry/);
});

test("the overall SL setting survives save/reload for Normal, Minimal and Short", async () => {
  const { sanitizeDeskSettings } = await import("./settings-sync.ts");
  for (const flags of [{ minimalRange: false, shortRange: false }, { minimalRange: true }, { shortRange: true }, {microRange: true}])
    for (const value of [.1, .4, 1]) {
      const saved = sanitizeDeskSettings({ tacticConfig: { ...flags, minSlDistancePct: value } } as never);
      const loaded = sanitizeDeskSettings(JSON.parse(JSON.stringify(saved)));
      assert.equal(loaded.tacticConfig.minSlDistancePct, value);
    }
});

test("DCA leg counts and trigger settings survive save/reload in every range", async () => {
  const { sanitizeDeskSettings } = await import("./settings-sync.ts");
  for (const flags of [{}, { minimalRange: true }, { shortRange: true }, {microRange: true}])
    for (const dcaCount of [1, 2, 3]) {
      const saved = sanitizeDeskSettings({ tacticConfig: { ...flags, dcaCount, dcaDrawdown: .7 } } as never);
      const loaded = sanitizeDeskSettings(JSON.parse(JSON.stringify(saved)));
      assert.equal(loaded.tacticConfig.dcaCount, dcaCount);
      assert.equal(loaded.tacticConfig.dcaDrawdown, .7);
    }
});

test("Micro has twenty independent cells and actual modeled fills preserve lowest targets", async () => {
  const { allMicroCombos, microControlPrices, cfgUsesShortRange, DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const { initVstEngine, tickVst, exactProtectionCombo } = await import("./vst.ts");
  const { DEFAULT_STRATEGY_TOGGLES } = await import("./engine.ts");
  const combos = allMicroCombos();
  assert.equal(combos.length, 20);
  assert.equal(new Set(combos.map(exactProtectionCombo)).size, 20);
  for (const cell of combos) for (const side of ["long", "short"] as const) {
    assert.equal(cfgUsesShortRange(cell), false, "a 0.30% Micro target is not Short ATR 0.30");
    assert.notEqual(exactProtectionCombo(cell), exactProtectionCombo({ ...cell, microRange: false, shortRange: true }));
    const cfg = { ...DEFAULT_TACTIC_CONFIG, ...cell, minSlDistancePct: .4, maxHoldTicks: 20000 };
    const e = initVstEngine(cfg, {warmup: 0, symbolCount: 4, arm: false});
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true };
    e.queue = []; e.orders = []; e.positions = [];
    const symbol = Object.keys(e.quotes)[0], px = e.quotes[symbol].px;
    const lv = microControlPrices(side, px, cell.tpAtr, cell.slOfTp, .00176, .4);
    e.orders.push({ id: "own-micro", connId: e.activeConnId, symbol, side, type: "market", qty: .001,
      filled: 0, remaining: .001, price: px, status: "open", rangeType: "atr", level: 1,
      ...cell, ...lv, batchId: "micro", note: "explicit admitted Micro fixture", validExec: true });
    tickVst(e, cfg, "trailing", {bookOnly: true, skipWalk: true});
    assert.equal(e.positions.length, 1);
    const p = e.positions[0];
    assert.equal(p.microRange, true);
    assert.ok(Math.abs(p.tpDist / p.avgEntry - cell.tpAtr / 100) < 1e-10);
    assert.ok(Math.abs(p.slDist / p.avgEntry - Math.max(cell.tpAtr * cell.slOfTp / 100, .00576)) < 1e-10);
  }
});


test("Minimal and Short position identities keep every TP, ratio and range independent", async () => {
  const { exactProtectionCombo, initVstEngine, queueOrder } = await import("./vst.ts");
  const { DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const keys = new Set<string>();
  for (const minimalRange of [false, true]) for (const tpAtr of [0.3, 0.6, 1, 1.25, 2, 3])
    for (const slOfTp of SL_TP_RATIOS) keys.add(exactProtectionCombo({ minimalRange, tpAtr, slOfTp }));
  assert.equal(keys.size, 120);
  const e = initVstEngine({ ...DEFAULT_TACTIC_CONFIG, minSlDistancePct: 0.4 }, {arm: false, warmup: 0});
  const o = { symbol: "BTCUSDT" } as Parameters<typeof queueOrder>[1];
  queueOrder(e, o);
  e.minSlDistancePct = 1;
  e.fees = { maker: .001, taker: .002, slippageFeeRatio: .1 };
  assert.equal(o.minSlDistancePct, .4);
  assert.ok(Math.abs(o.modelRtCost! - .00176) < 1e-12);
});

test("step PF follows held geometry and policy when overall range or fees change", async () => {
  const { configStepFloor, initVstEngine } = await import("./vst.ts");
  const { DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const e = initVstEngine({...DEFAULT_TACTIC_CONFIG, microRange: true}, {arm:false,warmup:0});
  assert.equal(configStepFloor(e, 1, {microRange:true,tpAtr:.2}), 1.04);
  assert.equal(configStepFloor(e, 1, {microRange:false,minimalRange:true,tpAtr:3,modelRtCost:.002}), 1.12);
  assert.equal(configStepFloor(e, 1, {microRange:false,shortRange:true,tpAtr:.3,avgEntry:100,tpDist:2}), 1.4);
  e.microRange=false; e.fees={maker:.001,taker:.01,slippageFeeRatio:.1};
  assert.equal(configStepFloor(e, 1, {microRange:false,minimalRange:true,tpAtr:3,modelRtCost:.002}), 1.12);
});

test("ordinary fills keep indication, tactic, calculation and range lanes separate", async () => {
  const { initVstEngine, tickVst } = await import("./vst.ts");
  const { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES, microControlPrices } = await import("./engine.ts");
  const cfg={...DEFAULT_TACTIC_CONFIG,microRange:true,tpAtr:.2,slOfTp:.5};
  const e=initVstEngine(cfg,{arm:false,warmup:0,symbolCount:4});
  e.completeSim=false; e.strategyToggles={...DEFAULT_STRATEGY_TOGGLES,normal:true};
  e.orders=[]; e.queue=[]; e.positions=[];
  const symbol=Object.keys(e.quotes)[0],px=e.quotes[symbol].px;
  const levels=microControlPrices("long",px,.2,.5,.00176,.1);
  const lanes=[{}, {indication:"break"}, {tactic:"hybrid"}, {calc:"rng"}, {rangeType:"linear"}];
  for (const [i,extra] of lanes.entries()) e.orders.push({id:`lane-${i}`,symbol,connId:e.activeConnId,
    side:"long",type:"market",qty:.001,filled:0,remaining:.001,price:px,status:"open",rangeType:"atr",level:1,
    indication:"trend",tactic:"trailing",calc:"base",microRange:true,tpAtr:.2,slOfTp:.5,
    ...levels,...extra,batchId:`lane-${i}`,note:"admitted independent lane",validExec:true} as never);
  tickVst(e,cfg,"trailing",{bookOnly:true,skipWalk:true});
  assert.equal(e.positions.length,5, JSON.stringify({positions:e.positions.map(p=>({ind:p.indication,tactic:p.tactic,calc:p.calc,range:p.controllingRange,qty:p.qty})),orders:e.orders.map(o=>({id:o.id,status:o.status}))}));
  assert.ok(e.positions.every(p=>p.qty===.001 && p.microRange));
  assert.equal(new Set(e.positions.map(p=>JSON.stringify([p.indication,p.tactic,p.calc,p.controllingRange]))).size,5);
});

test("native Micro and Minimal grids arm every cell without rearming an occupied lane", async () => {
  const { initVstEngine, armUniverse, lowRangeProtectGrid, exactProtectionCombo } = await import("./vst.ts");
  const { DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  for (const range of ["micro", "minimal"]) {
    const cfg={...DEFAULT_TACTIC_CONFIG,microRange:range==="micro",minimalRange:range==="minimal",
      shortRange:false,tpAtr:range==="micro"?.2:1,slOfTp:.25};
    const e=initVstEngine(cfg,{arm:false,warmup:0,symbolCount:4,complete:true});
    e.strategyToggles!.normal=true;
    armUniverse(e,cfg,"trailing","atr");
    const rows=[...e.queue,...e.orders], expected=range==="micro"?20:90;
    assert.equal(lowRangeProtectGrid(e,cfg).length,expected);
    assert.equal(new Set(rows.map(exactProtectionCombo)).size,expected);
    assert.ok(rows.some(r=>r.indication==="trend") && rows.some(r=>r.indication==="break"));
    for(const r of rows) {
      assert.ok(r.slDist/r.price+1e-12 >= (r.modelRtCost ?? 0)+.001);
      const target=range==="micro"?r.tpAtr!/100:r.tpAtr!*r.modelRtCost!;
      assert.ok(Math.abs(r.tpDist/r.price-target)<1e-10);
    }
    e.orders=[];e.queue=rows.slice(0,30);
    const key=(r: typeof rows[number])=>JSON.stringify([r.symbol,r.side,r.indication,r.tactic,exactProtectionCombo(r),r.calc,r.rangeType]);
    const kept=new Map<string,number>();
    for(const r of e.queue)kept.set(key(r),(kept.get(key(r))??0)+1);
    armUniverse(e,cfg,"trailing","atr");
    for(const [lane,count] of kept)assert.equal(e.queue.filter(r=>key(r)===lane).length,count,"occupied lane must not be duplicated");
  }
});
