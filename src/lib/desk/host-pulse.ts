import { createServerFn } from "@tanstack/react-start";

type CpuSnap = { idle: number; total: number };
let lastCpu: CpuSnap[] | null = null;
let hits = 0;
let windowAt = Date.now();
let reqPerSec = 0;
const serverAt = Date.now();

function cpuPct(cpus: { times: { user: number; nice: number; sys: number; idle: number; irq: number } }[]): number {
  const now = cpus.map((c) => {
    const t = c.times;
    const total = t.user + t.nice + t.sys + t.idle + t.irq;
    return { idle: t.idle, total };
  });
  const prev = lastCpu;
  lastCpu = now;
  if (!prev || prev.length !== now.length) return 0;
  let idle = 0;
  let total = 0;
  for (let i = 0; i < now.length; i++) {
    idle += Math.max(0, now[i]!.idle - prev[i]!.idle);
    total += Math.max(0, now[i]!.total - prev[i]!.total);
  }
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idle / total) * 100));
}

export type HostPulse = {
  cpuPct: number;
  memUsed: number;
  memTotal: number;
  heap: number;
  dbBytes: number;
  dbFiles: number;
  reqPerSec: number;
  uptimeSec: number;
  serverMs: number;
};

export const hostPulse = createServerFn({ method: "GET" }).handler(async (): Promise<HostPulse> => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const now = Date.now();
  hits += 1;
  const span = (now - windowAt) / 1000;
  if (span >= 1) {
    reqPerSec = hits / span;
    hits = 0;
    windowAt = now;
  }
  const mem = process.memoryUsage();
  const paths = [
    process.env.CTS_A_STATUS,
    process.env.CTS_A_OVERALL,
    process.env.CTS_A_SETTINGS,
    "/var/lib/cts-a/vst-session-x01.json",
    "/var/lib/cts-a/vst-session.json",
    "/var/lib/cts-a/overall-stats.json",
    "/var/lib/cts-a/desk-settings.json",
    "/tmp/cts-a-vst-session.json",
    "/tmp/cts-a-overall-stats.json",
    "/tmp/cts-a-desk-settings.json",
    "/tmp/cts-a-desk-settings-x02.json",
  ].filter((p): p is string => Boolean(p));
  const seen = new Set<string>();
  let dbBytes = 0;
  let dbFiles = 0;
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      dbBytes += st.size;
      dbFiles += 1;
    } catch {
      /* missing store */
    }
  }
  return {
    cpuPct: cpuPct(os.cpus() ?? []),
    memUsed: mem.rss,
    memTotal: os.totalmem(),
    heap: mem.heapUsed,
    dbBytes,
    dbFiles,
    reqPerSec,
    uptimeSec: process.uptime(),
    serverMs: now - serverAt,
  };
});
