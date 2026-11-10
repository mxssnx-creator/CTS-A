/** Evaluated history is separate from the subsequent observation period. */
export const DEFAULT_PREHISTORY_HOURS = 48;
export const MAX_PREHISTORY_HOURS = 720;
export const HOUR_MS = 3_600_000;

/** Keep explicit operator lookbacks, including longer values. */
export function prehistoryHours(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > MAX_PREHISTORY_HOURS)
    throw new RangeError(`Prehistory exceeds the ${MAX_PREHISTORY_HOURS}-hour operational limit`);
  return typeof value === "number" && Number.isFinite(value) && value >= 4
    ? Math.round(value) : DEFAULT_PREHISTORY_HOURS;
}

export interface HistoricalHour { time: number; px: number; hi: number; lo: number }
/** Chronological, unique, completed bars only. Missing time is not proof of completion. */
export function completedHistoricalHours(rows: readonly unknown[], hours: number, nowMs: number): HistoricalHour[] {
  const unique = new Map<number, HistoricalHour>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const rawTime = Number(Array.isArray(row) ? row[0] : o.time ?? o.timestamp ?? o.openTime);
    const time = rawTime < 1e12 ? rawTime * 1000 : rawTime;
    const hi = Number(Array.isArray(row) ? row[2] : o.high ?? o.highPrice);
    const lo = Number(Array.isArray(row) ? row[3] : o.low ?? o.lowPrice);
    const px = Number(Array.isArray(row) ? row[4] : o.close);
    if (![time, hi, lo, px].every(Number.isFinite) || time <= 0 || time + HOUR_MS > nowMs ||
        time < nowMs - (prehistoryHours(hours) + 1) * HOUR_MS || lo <= 0 || hi < lo || px < lo || px > hi) continue;
    unique.set(time, { time, px, hi, lo });
  }
  return [...unique.values()].sort((a,b) => a.time-b.time).slice(-prehistoryHours(hours));
}
