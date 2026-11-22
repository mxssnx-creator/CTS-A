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

test("fixed trailing keeps its opening gap and its own exact qualification identity", async () => {
  const { trailStopFromPeak, DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } = await import("./engine.ts");
  const { completeConfigSampleKey, initVstEngine, tickVst } = await import("./vst.ts");
  const { sanitizeDeskSettings } = await import("./settings-sync.ts");
  const cfg = { ...DEFAULT_TACTIC_CONFIG, trailingDistance: "fixed" as const };
  const saved = sanitizeDeskSettings({ tacticConfig: cfg } as never);
  assert.equal(sanitizeDeskSettings(JSON.parse(JSON.stringify(saved))).tacticConfig.trailingDistance, "fixed");
  for (const side of ["long", "short"] as const) {
    const sign = side === "long" ? 1 : -1;
    const base = { side, entry: 100, tp: 100+sign*8, sl: 100-sign*3, trailPct: 1.5, minimalRange: true };
    const fixedReference = { entry: 100, target: base.tp };
    const early = 100+sign*4.6, late = 100+sign*6;
    const gap = (peak: number, stop: number) => sign*(peak-stop);
    const startGap = gap(early, trailStopFromPeak({ ...base, peak: early, fixedReference }));
    const laterGap = gap(late, trailStopFromPeak({ ...base, peak: late, fixedReference, entry: 100+sign*.1 }));
    assert.ok(Math.abs(laterGap - startGap) < 1e-10);
    assert.ok(Math.abs(gap(late, trailStopFromPeak({ ...base, peak: late })) - startGap) > .1);
    const engine = initVstEngine(cfg, {arm:false,warmup:0,symbolCount:4});
    engine.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal:true, trailing:true };
    engine.queue = [];
    engine.orders = [];
    engine.positions = [];
    const symbol = Object.keys(engine.quotes)[0], price = engine.quotes[symbol].px;
    const identity = { connId: engine.activeConnId, symbol, side, indication:"trend" as const, tactic:"trailing" as const,
      rangeType:"atr" as const, playbook:"normal", kind:"normal" as const, tpAtr:.5, slOfTp:1, trailPct:1.5, calc:"base" as const,
      microRange:false, minimalRange:false, shortRange:false, modelRtCost:.0011, minSlDistancePct:.1 };
    assert.ok(completeConfigSampleKey(identity));
    assert.notEqual(completeConfigSampleKey(identity), completeConfigSampleKey({ ...identity, trailingDistance:"fixed" }));
    engine.orders.push({ ...identity, trailingDistance:"fixed", id:"own-fixed", type:"market", qty:.01, filled:0,
      remaining:.01, price, status:"open", level:1, sl:price*(1-sign*.03), tp:price*(1+sign*.08),
      slDist:price*.03,tpDist:price*.08, batchId:"",note:"fixed entry",validExec:true });
    tickVst(engine, cfg, "trailing", {bookOnly:true,skipWalk:true});
    const p = engine.positions.find(row => row.legs.some(leg => leg.orderId === "own-fixed"));
    assert.ok(p);
    assert.deepEqual(p.fixedTrailReference, {entry:p.avgEntry, target:p.tp});
    assert.equal(p.trailingDistance, "fixed");
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

test("equal TP and SL with different trailing gaps keep independent filled positions", async () => {
  const { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES } = await import("./engine.ts");
  const { initVstEngine, tickVst } = await import("./vst.ts");
  for (const side of ["long", "short"] as const) {
    const sign = side === "long" ? 1 : -1;
    const e = initVstEngine(DEFAULT_TACTIC_CONFIG, { arm: false, warmup: 0, symbolCount: 4 });
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true };
    e.queue = [];
    e.orders = [];
    e.positions = [];
    const symbol = Object.keys(e.quotes)[0], price = e.quotes[symbol].px;
    for (const [id, trailPct, trailingDistance] of [["near", 1.2, undefined], ["far", 2.6, undefined], ["fixed", 1.2, "fixed"]] as const) {
      e.orders.push({ connId: e.activeConnId, symbol, side, indication: "trend", tactic: "trailing",
        rangeType: "atr", playbook: "normal", kind: "normal", tpAtr: .5, slOfTp: 1, calc: "base",
        microRange: false, minimalRange: false, shortRange: false, modelRtCost: .0011, minSlDistancePct: .1,
        id, trailPct, trailingDistance, type: "market", qty: .01, filled: 0, remaining: .01, price, status: "open", level: 1,
        sl: price * (1 - sign * .03), tp: price * (1 + sign * .08), slDist: price * .03, tpDist: price * .08,
        batchId: "", note: "trailing gap test", validExec: true });
    }
    tickVst(e, DEFAULT_TACTIC_CONFIG, "trailing", { bookOnly: true, skipWalk: true });
    assert.equal(e.positions.length, 3);
    assert.deepEqual(e.positions.map(p => [p.legs.map(leg => leg.orderId), p.trailPct, p.trailingDistance]),
      [[["near"], 1.2, undefined], [["far"], 2.6, undefined], [["fixed"], 1.2, "fixed"]]);
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

test("independent strategy Set fills retain separate positions and evaluation", async () => {
  const { completeConfigSampleKey, initVstEngine, laneLastNDecision, tickVst } = await import("./vst.ts");
  const { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES, microControlPrices } = await import("./engine.ts");
  const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: true, tpAtr: .2, slOfTp: .5 };
  const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true };
  e.orders = [];
  e.queue = [];
  e.positions = [];
  const symbol = Object.keys(e.quotes)[0];
  const px = e.quotes[symbol].px;
  const levels = microControlPrices("long", px, .2, .5, .00176, .1);
  const families = [["normal", "normal"], ["short", "short"]] as const;
  for (const [i, [playbook, kind]] of families.entries()) e.orders.push({ id: `family-${i}`, symbol,
    connId: e.activeConnId, side: "long", type: "market", qty: .001, filled: 0, remaining: .001,
    price: px, status: "open", rangeType: "atr", level: 1, indication: "trend", tactic: "trailing",
    calc: "base", microRange: true, minimalRange: false, shortRange: false, tpAtr: .2, slOfTp: .5,
    trailPct: .3, modelRtCost: .00176, minSlDistancePct: .1, microMinSlDistancePct: .1,
    microMinTrailDistancePct: .2, playbook, kind, ...levels,
    batchId: `family-${i}`, note: "independent strategy Set", validExec: true } as never);
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  tickVst(e, cfg, "trailing", { bookOnly: true, skipWalk: true });
  assert.equal(e.positions.length, 2, JSON.stringify(e.positions.map(p => ({ playbook: p.playbook,
    kind: p.kind, qty: p.qty, legs: p.legs.map(leg => leg.orderId) }))));
  assert.ok(e.positions.every(p => p.qty === .001 && p.legs.length === 1));
  const normal = e.positions.find(p => p.playbook === "normal" && p.kind === "normal");
  const short = e.positions.find(p => p.playbook === "short" && p.kind === "short");
  assert.ok(normal && short);
  const normalIdentity = { ...normal, rangeType: normal.controllingRange };
  const shortIdentity = { ...short, rangeType: short.controllingRange };
  assert.notEqual(completeConfigSampleKey(normalIdentity), completeConfigSampleKey(shortIdentity));
  const evalEngine = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4 });
  evalEngine.tick = 200;
  evalEngine.liveTape = false;
  evalEngine.preEvalDone = false;
  evalEngine.closed = Array.from({ length: 60 }, (_, i) => ({ ...normalIdentity, id: `normal-fill-${i}`,
    tick: 199 - i, pnl: 1, ratio: .01, r: 1, entry: normal.avgEntry,
    exit: normal.avgEntry * 1.01, reason: "tp" as const, validExec: false }));
  assert.equal(laneLastNDecision(evalEngine, normalIdentity).pass, true);
  assert.equal(laneLastNDecision(evalEngine, shortIdentity).pass, false,
    "the independently filled Short Set borrowed the Normal position tape");
  const elapsedMs = performance.now() - started;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  console.info(`strategy fill-lane benchmark elapsedMs=${elapsedMs.toFixed(3)} heapDeltaBytes=${heapDeltaBytes} payloadBytes=${Buffer.byteLength(JSON.stringify(e.positions))}`);
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
      assert.ok(r.slDist/r.price+1e-12 >= (range === "micro" ? (r.microMinSlDistancePct ?? .1)/100 : (r.modelRtCost ?? 0)+.001));
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

test("busy native lanes keep frozen cost-policy siblings independent", async () => {
  const { armUniverse, completeConfigSampleKey, exactProtectionCombo, initVstEngine,
    laneLastNDecision, modeledPositionCost } = await import("./vst.ts");
  const { DEFAULT_STRATEGY_TOGGLES, DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: true, minimalRange: false, shortRange: false,
    tpAtr: .3, slOfTp: 1, priceDistanceGrid: { enabled: true, stopPcts: [.2], trailPcts: [.3] } };
  const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true,
    axis: false, block: false, dca: false };
  armUniverse(e, cfg, "trailing", "atr");
  const seed = e.queue.find(order => order.priceStopPct === .2 && order.priceTrailPct === .3);
  assert.ok(seed, "the native fixture must create an exact cost-policy parent");
  const old = { ...seed, id: "old-cost-policy", modelRtCost: .0011, minSlDistancePct: .2 };
  e.queue = [old];
  e.orders = [];
  e.positions = [];
  e.fees = { maker: .0002, taker: .0005, slippageFeeRatio: .6 };
  e.minSlDistancePct = .1;
  const currentCost = modeledPositionCost(e, seed.symbol);
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  armUniverse(e, cfg, "trailing", "atr");
  const fresh = e.queue.find(order => order.id !== old.id && order.symbol === old.symbol &&
    order.side === old.side && order.indication === old.indication && order.tactic === old.tactic &&
    order.calc === old.calc && order.rangeType === old.rangeType &&
    exactProtectionCombo(order) === exactProtectionCombo(old) && order.modelRtCost === currentCost &&
    order.minSlDistancePct === .1);
  assert.ok(fresh, "an old fee policy suppressed the eligible current-cost sibling");
  assert.notEqual(completeConfigSampleKey(fresh), completeConfigSampleKey(old));
  const sameCurrentLane = (order: typeof fresh) => order.symbol === fresh.symbol &&
    order.side === fresh.side && order.indication === fresh.indication && order.tactic === fresh.tactic &&
    order.calc === fresh.calc && order.rangeType === fresh.rangeType &&
    exactProtectionCombo(order) === exactProtectionCombo(fresh) && order.modelRtCost === currentCost &&
    order.minSlDistancePct === fresh.minSlDistancePct;
  const beforeRearm = e.queue.filter(sameCurrentLane).length;
  armUniverse(e, cfg, "trailing", "atr");
  assert.equal(e.queue.filter(sameCurrentLane).length, beforeRearm,
    "the current frozen policy rearmed an already occupied lane");
  const evalEngine = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4 });
  evalEngine.tick = 200;
  evalEngine.liveTape = false;
  evalEngine.preEvalDone = false;
  evalEngine.closed = Array.from({ length: 60 }, (_, i) => ({ ...fresh, id: `fresh-cost-${i}`,
    tick: 199 - i, pnl: 1, ratio: .01, r: 1, entry: fresh.price,
    exit: fresh.price * (fresh.side === "long" ? 1.01 : .99), reason: "tp" as const,
    validExec: false }));
  assert.equal(laneLastNDecision(evalEngine, fresh).pass, true,
    "the current-cost child did not qualify from its own tape");
  assert.equal(laneLastNDecision(evalEngine, old).pass, false,
    "the old cost-policy sibling borrowed current-cost evidence");
  const elapsedMs = performance.now() - started;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  console.info(`cost-policy busy-lane benchmark elapsedMs=${elapsedMs.toFixed(3)} heapDeltaBytes=${heapDeltaBytes} payloadBytes=${Buffer.byteLength(JSON.stringify([old, fresh]))}`);
});

test("derived strategy lanes cannot suppress or qualify their native parent", async () => {
  const { armUniverse, completeConfigSampleKey, exactProtectionCombo, initVstEngine,
    laneLastNDecision } = await import("./vst.ts");
  const { DEFAULT_STRATEGY_TOGGLES, DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const cfg = { ...DEFAULT_TACTIC_CONFIG, microRange: true, minimalRange: false, shortRange: false,
    tpAtr: .3, slOfTp: 1, priceDistanceGrid: { enabled: true, stopPcts: [.2], trailPcts: [.3] } };
  const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true,
    axis: false, block: false, dca: false };
  armUniverse(e, cfg, "trailing", "atr");
  const seed = e.queue.find(order => order.priceStopPct === .2 && order.priceTrailPct === .3 &&
    order.playbook === "normal");
  assert.ok(seed, "the native fixture must create a Normal parent");
  const child = { ...seed, id: "derived-block-child", playbook: "block", kind: "block" as const };
  e.queue = [child];
  e.orders = [];
  e.positions = [];
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  armUniverse(e, cfg, "trailing", "atr");
  const parent = e.queue.find(order => order.id !== child.id && order.symbol === child.symbol &&
    order.side === child.side && order.indication === child.indication && order.tactic === child.tactic &&
    order.calc === child.calc && order.rangeType === child.rangeType && order.playbook === "normal" &&
    order.kind === seed.kind && exactProtectionCombo(order) === exactProtectionCombo(child));
  assert.ok(parent, "a derived Block child suppressed its eligible Normal parent");
  assert.notEqual(completeConfigSampleKey(parent), completeConfigSampleKey(child));
  const beforeRearm = e.queue.filter(order => completeConfigSampleKey(order) === completeConfigSampleKey(parent)).length;
  armUniverse(e, cfg, "trailing", "atr");
  assert.equal(e.queue.filter(order => completeConfigSampleKey(order) === completeConfigSampleKey(parent)).length,
    beforeRearm, "the restored Normal parent duplicated on re-arm");
  const evalEngine = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4 });
  evalEngine.tick = 200;
  evalEngine.liveTape = false;
  evalEngine.preEvalDone = false;
  evalEngine.closed = Array.from({ length: 60 }, (_, i) => ({ ...parent, id: `normal-parent-${i}`,
    tick: 199 - i, pnl: 1, ratio: .01, r: 1, entry: parent.price,
    exit: parent.price * (parent.side === "long" ? 1.01 : .99), reason: "tp" as const,
    validExec: false }));
  assert.equal(laneLastNDecision(evalEngine, parent).pass, true,
    "the restored parent did not qualify from its own tape");
  assert.equal(laneLastNDecision(evalEngine, child).pass, false,
    "the derived child borrowed the parent’s evidence");
  const elapsedMs = performance.now() - started;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  console.info(`strategy busy-lane benchmark elapsedMs=${elapsedMs.toFixed(3)} heapDeltaBytes=${heapDeltaBytes} payloadBytes=${Buffer.byteLength(JSON.stringify([parent, child]))}`);
});

test("Micro and Minimal trailing positions use their captured gap on both quote paths", async () => {
  const { DEFAULT_TACTIC_CONFIG, DEFAULT_STRATEGY_TOGGLES, trailStopFromPeak } = await import("./engine.ts");
  const { initVstEngine, tickVst } = await import("./vst.ts");
  for (const micro of [false, true]) for (const side of ["long", "short"] as const) for (const liveTape of [false, true]) {
    const e = initVstEngine(DEFAULT_TACTIC_CONFIG, { arm: false, warmup: 0, symbolCount: 4 });
    e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true };
    e.queue = [];
    e.orders = [];
    e.positions = [];
    const symbol = Object.keys(e.quotes)[0], q = e.quotes[symbol], price = q.px;
    const sign = side === "long" ? 1 : -1;
    for (const [id, trailPct, trailingDistance] of [
      ["tight", 1.2, undefined], ["wide", 2.6, undefined], ["fixed", 2.6, "fixed"],
    ] as const) {
      e.orders.push({ connId: e.activeConnId, id, symbol, side, indication: "trend", tactic: "trailing",
        rangeType: "atr", playbook: "normal", kind: "normal", calc: "base", tpAtr: micro ? .3 : 3,
        slOfTp: micro ? 1 : 1.25, trailPct, trailingDistance, microRange: micro, minimalRange: !micro,
        shortRange: false, modelRtCost: .0011, minSlDistancePct: .1, microMinTrailDistancePct: .01,
        type: "market", qty: .01, filled: 0, remaining: .01, price, status: "open", level: 1,
        sl: price * (1 - sign * .03), tp: price * (1 + sign * .08), slDist: price * .03, tpDist: price * .08,
        batchId: "", note: "owned trailing gap", validExec: true });
    }
    tickVst(e, DEFAULT_TACTIC_CONFIG, "trailing", { bookOnly: true, skipWalk: true });
    assert.equal(e.positions.length, 3);
    const first = e.positions[0], entry = first.avgEntry, peak = entry + .75 * (first.tp - entry);
    const expected = e.positions.map(p => trailStopFromPeak({ side, entry: p.avgEntry, peak, tp: p.tp,
      sl: p.sl, trailPct: p.trailPct!, minimalRange: true, fixedReference: p.fixedTrailReference,
      microMinTrailDistancePct: micro ? p.microMinTrailDistancePct : undefined }));
    assert.equal(new Set(expected).size, 3, "the chosen peak distinguishes all three captured gaps");
    Object.assign(q, { open: entry, px: peak, hi: Math.max(entry, peak), lo: Math.min(entry, peak) });
    if (liveTape) {
      e.botMode = false;
      tickVst(e, DEFAULT_TACTIC_CONFIG, "trailing", { skipWalk: true, skipMatch: true });
    } else {
      e.tick++;
      tickVst(e, DEFAULT_TACTIC_CONFIG, "trailing", { bookOnly: true, skipWalk: true, skipMatch: true });
    }
    assert.deepEqual(e.positions.map(p => p.sl), expected, `micro=${micro}, side=${side}, liveTape=${liveTape}`);
    if (liveTape) {
      const exit = entry - sign * .001 * entry;
      Object.assign(q, { open: peak, px: exit, hi: Math.max(peak, exit), lo: Math.min(peak, exit) });
      tickVst(e, DEFAULT_TACTIC_CONFIG, "trailing", { skipWalk: true, skipMatch: true });
      assert.equal(e.positions.length, 0, "the next adverse quote crossed all three carried stops");
      assert.equal(e.closed.filter(row => row.reason === "sl").length, 3);
    }
  }
});


test("absolute stop and fixed or dynamic trailing grids remain independent settings and evidence", async () => {
  const { STOP_DISTANCE_PCTS, TRAIL_DISTANCE_PCTS, priceDistanceBatch, priceDistanceVariants } = await import("./price-distance-grid.ts");
  const { DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const { completeConfigSampleKey, initVstEngine, lowRangeProtectGrid } = await import("./vst.ts");
  const { sanitizeDeskSettings } = await import("./settings-sync.ts");

  assert.equal(STOP_DISTANCE_PCTS.length, 21);
  assert.equal(TRAIL_DISTANCE_PCTS.length, 25);
  assert.deepEqual(STOP_DISTANCE_PCTS, Array.from({ length: 21 }, (_, i) => (i + 2) / 10));
  assert.deepEqual(TRAIL_DISTANCE_PCTS, Array.from({ length: 25 }, (_, i) => (i + 2) / 10));

  const legacy = sanitizeDeskSettings({ tacticConfig: DEFAULT_TACTIC_CONFIG } as never);
  assert.equal(legacy.tacticConfig.priceDistanceGrid?.enabled, false);
  assert.equal(priceDistanceVariants(legacy.tacticConfig, "axis").length, 0);

  const configured = sanitizeDeskSettings({ tacticConfig: { ...DEFAULT_TACTIC_CONFIG,
    priceDistanceGrid: { enabled: true, stopPcts: STOP_DISTANCE_PCTS, trailPcts: TRAIL_DISTANCE_PCTS },
  } } as never);
  assert.deepEqual(configured.tacticConfig.priceDistanceGrid,
    { enabled: true, stopPcts: STOP_DISTANCE_PCTS, trailPcts: TRAIL_DISTANCE_PCTS });

  const ordinary = priceDistanceVariants(configured.tacticConfig, "axis");
  const trailing = priceDistanceVariants(configured.tacticConfig, "trailing");
  assert.equal(ordinary.length, 21);
  assert.equal(trailing.length, 21 * 25 * 2);
  assert.equal(priceDistanceVariants(configured.tacticConfig, "trailing"), trailing, "repeat materialization reuses one bounded catalog");
  assert.equal(new Set([...ordinary, ...trailing].map(row =>
    JSON.stringify([row.priceStopPct, row.priceTrailPct, row.trailingDistance ?? "dynamic"]))).size, 21 * (1 + 25 * 2));
  const covered = new Set<string>();
  for (let tick = 0; tick < Math.ceil(trailing.length / 16); tick++) {
    const batch = priceDistanceBatch(trailing, tick, "BTCUSDT:long:low-range-breakout:trailing");
    assert.ok(batch.length <= 16);
    for (const row of batch) covered.add(JSON.stringify([row.priceStopPct, row.priceTrailPct, row.trailingDistance ?? "dynamic"]));
  }
  assert.equal(covered.size, trailing.length, "bounded tick batches cover every independent child");

  const engine = initVstEngine(configured.tacticConfig, { arm: false, warmup: 0, symbolCount: 4 });
  engine.completeSim = true;
  assert.deepEqual(lowRangeProtectGrid(engine, configured.tacticConfig, "axis"), ordinary);
  assert.deepEqual(lowRangeProtectGrid(engine, configured.tacticConfig, "trailing"), trailing);

  const identity = {
    connId: "bingx-x02", symbol: "BTCUSDT", side: "long" as const, indication: "low-range-breakout",
    tactic: "trailing", rangeType: "atr", playbook: "normal", kind: "normal", calc: "base",
    tpAtr: .3, slOfTp: 1, trailPct: 1.5, microRange: true, minimalRange: false, shortRange: false,
    modelRtCost: .0011, minSlDistancePct: .1, microMinSlDistancePct: .1, microMinTrailDistancePct: .05,
  };
  const keys = trailing.map(row => completeConfigSampleKey({ ...identity, ...row }));
  assert.ok(keys.every(Boolean));
  assert.equal(new Set(keys).size, trailing.length);
  assert.throws(() => sanitizeDeskSettings({ tacticConfig: { ...DEFAULT_TACTIC_CONFIG,
    priceDistanceGrid: { enabled: true, stopPcts: [.21], trailPcts: [.2] },
  } } as never), /0.1 percentage-point/);
});

test("PF pair coordination creates a child for every exact native trailing parent", async () => {
  const { performance } = await import("node:perf_hooks");
  const { DEFAULT_STRATEGY_TOGGLES, DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const { armUniverse, completeConfigSampleKey, initVstEngine } = await import("./vst.ts");
  const cfg = { ...DEFAULT_TACTIC_CONFIG, shortRange: true,
    priceDistanceGrid: { enabled: true, stopPcts: [.2, .3], trailPcts: [.2] } };
  const e = initVstEngine(cfg, { arm: false, warmup: 0, symbolCount: 4, complete: true });
  e.openCompleteTape = true;
  e.pfCoords = { hourKeep: false, bankWin: false, pairAdd: true, laneCool: false, winAgain: false };
  e.strategyToggles = { ...DEFAULT_STRATEGY_TOGGLES, normal: true, trailing: true, axis: false, dca: false, block: false };
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  armUniverse(e, cfg, "trailing", "atr");
  const elapsedMs = performance.now() - started;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const symbol = e.queue.find(order => order.tactic === "trailing" && order.note.startsWith("pf-pair"))?.symbol;
  assert.ok(symbol, "two indications must create a trailing coordination");
  const pairs = e.queue.filter(order => order.symbol === symbol && order.tactic === "trailing" && order.note.startsWith("pf-pair"));
  const cells = new Set(pairs.map(order => JSON.stringify([
    order.priceStopPct, order.priceTrailPct, order.trailingDistance ?? "dynamic",
  ])));
  assert.equal(cells.size, 4, "both stops and fixed/dynamic trailing need separate coordinated children");
  const keys = pairs.map(order => completeConfigSampleKey(order));
  assert.ok(keys.every(Boolean), "every coordinated child needs complete own evidence");
  assert.equal(new Set(keys).size, pairs.length, "each exact coordinated child must evaluate independently");
  console.info(`pair-coordination benchmark children=${pairs.length} cells=${cells.size} elapsedMs=${elapsedMs.toFixed(3)} heapDeltaBytes=${heapDeltaBytes} payloadBytes=${Buffer.byteLength(JSON.stringify(pairs))}`);
});

test("absolute trail gaps use the selected fixed or dynamic price basis", async () => {
  const { absoluteProtection, priceTrailStop } = await import("./price-distance-grid.ts");
  const fixed = priceTrailStop("long", 100, 110, 90, 2, "fixed");
  const dynamic = priceTrailStop("long", 100, 110, 90, 2, "dynamic");
  assert.equal(fixed, 108);
  assert.equal(dynamic, 107.8);
  assert.deepEqual(absoluteProtection("short", 100, .7, 4), { sl: 100.7, slDist: .7, tp: 96, tpDist: 4 });
});


test("full native price grid reports bounded active materialization cost", async () => {
  const { performance } = await import("node:perf_hooks");
  const { sanitizeDeskSettings } = await import("./settings-sync.ts");
  const { DEFAULT_TACTIC_CONFIG } = await import("./engine.ts");
  const { STOP_DISTANCE_PCTS, TRAIL_DISTANCE_PCTS, priceDistanceVariants } = await import("./price-distance-grid.ts");
  const configured = sanitizeDeskSettings({ tacticConfig: { ...DEFAULT_TACTIC_CONFIG,
    priceDistanceGrid: { enabled: true, stopPcts: STOP_DISTANCE_PCTS, trailPcts: TRAIL_DISTANCE_PCTS },
  } } as never);
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const variants = priceDistanceVariants(configured.tacticConfig, "trailing");
  const keys = new Set(variants.map(row => JSON.stringify([
    row.priceStopPct, row.priceTrailPct, row.trailingDistance ?? "dynamic",
  ])));
  const elapsedMs = performance.now() - started;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const payloadBytes = Buffer.byteLength(JSON.stringify(variants));
  assert.equal(variants.length, 1_050);
  assert.equal(keys.size, 1_050);
  console.info(`price-distance-grid benchmark variants=1050 elapsedMs=${elapsedMs.toFixed(3)} heapDeltaBytes=${heapDeltaBytes} payloadBytes=${payloadBytes}`);
});
