const sessionAt = Date.now();
const marks = new Map<string, number>();
let fails = 0;
let recovers = 0;
let crashes = 0;

export function markRunning(id: string, on: boolean) {
  if (on) {
    if (!marks.has(id)) marks.set(id, Date.now());
    return;
  }
  marks.delete(id);
}

export function runningMs(id: string): number {
  const t = marks.get(id);
  return t ? Date.now() - t : 0;
}

export function sessionMs(): number {
  return Date.now() - sessionAt;
}

export function noteFail() {
  fails += 1;
}

export function noteRecover() {
  recovers += 1;
}

export function noteCrash() {
  crashes += 1;
}

export function runtimeCounts() {
  return { fails, recovers, crashes };
}

export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}
