import assert from "node:assert/strict";
import { it } from "node:test";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG } from "./engine.ts";
import { demoBlockSettings, demoCloseConfirmed, measuredDemoProgress, demoStrategySettings, demoTacticSettings, demoRangeConfigs, demoConfigKey } from "./demo-session-policy.ts";

const enabled = { normal: true, trailing: true, axis: true, block: true, dca: true };

it("a Micro or Minimal session rebuild cannot substitute a Short range", () => {
  const short = [{tpAtr:.48,slOfTp:1}];
  for (const family of ["microRange", "minimalRange", "shortRange"] as const) {
    const cfg = {...DEFAULT_TACTIC_CONFIG,microRange:false,minimalRange:false,shortRange:false,
      [family]:true,trailingPct:.25,dcaCount:3,minSlDistancePct:.2};
    const rows = demoRangeConfigs(cfg,short);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(r=>r[family] && r.trailingPct===.25 && r.dcaCount===3 && r.minSlDistancePct===.2));
    assert.equal(new Set(rows.map(demoConfigKey)).size,rows.length);
    if (family==="microRange") assert.deepEqual([...new Set(rows.map(r=>r.tpAtr))],[.2,.3]);
    if (family==="minimalRange") assert.deepEqual([...new Set(rows.map(r=>r.tpAtr))],[1,1.25,1.5,1.75,2,2.25,2.5,2.75,3]);
  }
});

it("configuration matching includes range, trailing, costs and nested own PF policy",()=>{
  const cfg={...DEFAULT_TACTIC_CONFIG,microRange:true,trailingPct:.25};
  assert.equal(demoConfigKey(cfg),demoConfigKey(Object.fromEntries(Object.entries(cfg).reverse()) as typeof cfg));
  for(const patch of [{microRange:false,minimalRange:true},{trailingPct:.5},{minSlDistancePct:.2}])
    assert.notEqual(demoConfigKey(cfg),demoConfigKey({...cfg,...patch}));
});

it("an accepted pending or unknown close retains ownership", () => {
  assert.equal(demoCloseConfirmed({ok:true}),true);
  for (const r of [undefined,null,{ok:false},{ok:true,pending:true},{ok:true,uncertain:true}])
    assert.equal(demoCloseConfirmed(r),false);
});

it("all demo strategy combinations survive a settings reload", () => {
  for (let mask = 0; mask < 32; mask++) {
    const keys = Object.keys(enabled) as Array<keyof typeof enabled>;
    const wanted = Object.fromEntries(keys.map((key, i) => [key, Boolean(mask & (1 << i))])) as typeof enabled;
    assert.deepEqual(demoStrategySettings(enabled, wanted), wanted);
  }
});

it("small trailing distances and explicit DCA counts remain the selected values", () => {
  for (const trailingPct of [0, .1, .25, .5, 1.5]) {
    for (const dcaCount of [1, 2, 4]) {
      const cfg = { ...DEFAULT_TACTIC_CONFIG, trailingPct, dcaCount };
      const result = demoTacticSettings(cfg, enabled);
      assert.equal(result.trailingPct, trailingPct);
      assert.equal(result.dcaCount, dcaCount);
      assert.equal(demoTacticSettings(cfg, { ...enabled, trailing: false }).trailingPct, 0);
    }
  }
});

it("Overall Block, its relation switches and requested low ratios remain independent", () => {
  const result = demoBlockSettings(DEFAULT_BLOCK_CONFIG, { enabled: true, overall: true,
    overallSymbol: false, overallDirection: true, overallSharedStack: "split",
    volumeRatio: .2, relVolumeRatio: .2, sharedVolumeRatio: .4, overallVolumeRatio: .4 }, enabled);
  assert.equal(result.overall, true);
  assert.equal(result.overallSymbol, false);
  assert.equal(result.overallDirection, true);
  assert.equal(result.overallSharedStack, "split");
  assert.equal(result.volumeRatio, .2);
  assert.equal(result.sharedVolumeRatio, .4);
  assert.equal(result.overallVolumeRatio, .4);
  assert.equal(demoBlockSettings(result, { enabled: false }, enabled).enabled, false);
  assert.equal(demoBlockSettings(result, undefined, { ...enabled, block: false }).enabled, false);
});


it("current losing or absent demo evidence never inherits a historical passing PF", () => {
  const row = { n: 12, pf: .4, ok: false };
  const got = measuredDemoProgress({ stats: { pf: .3 }, progressEval: { indications: { trend: row }, lastNOverall: { pass: false } } });
  assert.equal(got.pf, .3);
  assert.deepEqual(got.indications.trend, row);
  assert.deepEqual(got.overall, { pass: false });
  assert.equal(measuredDemoProgress(undefined).pf, null);
  assert.deepEqual(measuredDemoProgress(undefined).overall, { pass: false, state: "unknown", pf: null });
});
