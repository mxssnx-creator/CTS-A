import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pickLiveJsonFile } from "./live-files.ts";

describe("live json pick", () => {
  it("prefers pingOk x02 over stale x01", () => {
    const dir = mkdtempSync(join(tmpdir(), "cts-live-"));
    const x01 = join(dir, "vst-session.json");
    const x02 = join(dir, "vst-session-x02.json");
    writeFileSync(x01, JSON.stringify({ at: Date.now(), conn: "bingx-x01", pingOk: true, equity: 0.0004, livePos: 0 }));
    writeFileSync(x02, JSON.stringify({ at: Date.now(), conn: "bingx-vst-02", pingOk: true, equity: 107151, livePos: 17 }));
    const hit = pickLiveJsonFile([x01, x02], "bingx-vst-02");
    assert.equal(hit, x02);
  });
});
