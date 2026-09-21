import { existsSync, readFileSync, statSync } from "node:fs";

export function liveSessionCandidates(): string[] {
  return [
    process.env.CTS_A_STATUS,
    "/var/lib/cts-a/vst-session-x02.json",
    "/var/lib/cts-a/vst-session.json",
    "/tmp/cts-a-vst-session-x02.json",
    "/tmp/cts-a-vst-session.json",
  ].filter((p): p is string => Boolean(p));
}

export function liveOverallCandidates(): string[] {
  return [
    process.env.CTS_A_OVERALL,
    "/var/lib/cts-a/overall-stats-x02.json",
    "/var/lib/cts-a/overall-stats.json",
    "/tmp/cts-a-overall-stats-x02.json",
    "/tmp/cts-a-overall-stats.json",
  ].filter((p): p is string => Boolean(p));
}

export function liveSettingsCandidates(): string[] {
  return [
    process.env.CTS_A_SETTINGS,
    "/var/lib/cts-a/desk-settings-x02.json",
    "/var/lib/cts-a/desk-settings.json",
    "/tmp/cts-a-desk-settings-x02.json",
    "/tmp/cts-a-desk-settings.json",
  ].filter((p): p is string => Boolean(p));
}

export function preferLiveConn(): string {
  return (process.env.CTS_A_CONN || "bingx-vst-02").trim();
}

export function pickLiveJsonFile(cands: string[], preferConn = preferLiveConn()): string | null {
  let best: string | null = null;
  let bestScore = -1;
  const seen = new Set<string>();
  for (const f of cands) {
    if (!f || seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    let score = 0;
    try {
      const st = statSync(f);
      score += Math.max(0, st.mtimeMs);
      const d = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
      const at = Number(d.at ?? 0);
      if (Number.isFinite(at) && at > 1e12) score = Math.max(score, at);
      if (Boolean(d.pingOk || d.liveOk)) score += 1e15;
      if (Number(d.equity ?? 0) > 1) score += 1e13;
      if (Number(d.livePos ?? d.slots ?? 0) > 0) score += 1e12;
      const conn = String(d.conn || d.activeConnId || "");
      if (conn && conn === preferConn) score += 1e14;
    } catch {
      /* unreadable */
    }
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

export function readLiveJson(cands: string[]): Record<string, unknown> | null {
  const file = pickLiveJsonFile(cands);
  if (!file) return null;
  try {
    const d = JSON.parse(readFileSync(file, "utf8"));
    return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
