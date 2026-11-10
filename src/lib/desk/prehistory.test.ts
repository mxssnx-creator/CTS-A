import assert from "node:assert/strict";
import { test } from "node:test";
import { completedHistoricalHours, DEFAULT_PREHISTORY_HOURS, HOUR_MS, prehistoryHours } from "./prehistory.ts";
import { DEFAULT_SHORT_PROGRESS, sanitizeShortProgress } from "./short-progress.ts";
import { SHORT_EVAL_HOURS, seedIndicationHistory } from "./engine.ts";

test("48-hour default is shared and explicit shorter/longer settings are preserved", () => {
  assert.equal(DEFAULT_PREHISTORY_HOURS,48);
  assert.equal(SHORT_EVAL_HOURS,48);
  assert.equal(DEFAULT_SHORT_PROGRESS.evalHours,48);
  for (const hours of [4,20,24,48,96,168]) {
    assert.equal(prehistoryHours(hours),hours);
    assert.equal(sanitizeShortProgress({evalHours:hours}).evalHours,hours);
    assert.equal(seedIndicationHistory("HISTORY-TEST",Array.from({length:200},()=>({px:100,hi:101,lo:99})),hours),hours);
  }
  assert.equal(sanitizeShortProgress({}).evalHours,48);
  assert.equal(prehistoryHours(NaN),48);
  assert.throws(()=>prehistoryHours(721),/operational limit/);
});
test("backfill drops unfinished/unknown bars, deduplicates and sorts before retaining the lookback", () => {
  const now=1_800_000_000_000;
  const rows=Array.from({length:52},(_,i)=>[now-i*HOUR_MS,100,102,98,101]);
  const got=completedHistoricalHours([...rows,rows[3],{high:102,low:98,close:101}],48,now);
  assert.equal(got.length,48);
  assert.equal(got[0].time,now-48*HOUR_MS);
  assert.equal(got.at(-1)!.time,now-HOUR_MS);
  assert.equal(completedHistoricalHours([[now-HOUR_MS,100,102,98,103]],48,now).length,0);
});
