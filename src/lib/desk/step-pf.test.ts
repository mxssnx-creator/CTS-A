import { it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STEP_PF, stepPfFloor } from "./step-pf.ts";
it("manual step PF matches CTS-G percent units, flooring, cap and stricter settings", () => {
  for (const [pct, expected] of [[.2,1.04],[.25,1.04],[.3,1.06],[3.2,1.64],[3.5,1.7],[9,1.7]])
    assert.equal(stepPfFloor(1,pct,DEFAULT_STEP_PF),expected);
  assert.equal(stepPfFloor(1,3.2,{...DEFAULT_STEP_PF,max:1.15}),1.15);
  assert.equal(stepPfFloor(1.5,.2,DEFAULT_STEP_PF),1.5);
  assert.equal(stepPfFloor(1.25,NaN,DEFAULT_STEP_PF),1.25);
  assert.equal(stepPfFloor(1.25,2,{...DEFAULT_STEP_PF,enabled:false}),1.25);
});
