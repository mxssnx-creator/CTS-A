import type { LastNProgressConfig } from "./types.ts";
import { measuredEdgePnl } from "./last-n-progress.ts";

export interface SampleRow {
  policy: string;
  window: string;
  n: number;
  contexts: number;
  full: number;
  usable: number;
  insufficient: number;
  unknown: number;
  unavailable: number;
  pct: number | null;
}
export interface SampleCoverage {
  at: number;
  connId: string;
  scope: "retained-exact-contexts" | "registered-exact-contexts";
  /** Actual tape provenance, separate from the configured qualification windows. */
  stages?: { currentOwn: SampleRow[]; frozenBase: SampleRow[] | null };
  rows: SampleRow[];
}
/** Each iterable member is one own-config newest-first tape, including empty
 * known candidates. All policies are scored separately; no PF condition affects coverage. */
export function sampleRows(tapes: Iterable<readonly { pnl?: number; ratio?: number }[] | null>, cfg: LastNProgressConfig): SampleRow[] {
  const rows: SampleRow[] = [];
  const policies = cfg.policies?.length ? cfg.policies : [{...cfg,id:"default"}];
  for (const policy of policies) {
    for (const [window, ns] of Object.entries({ base:policy.evalNs, validation:policy.validNs,
      negative:policy.disableNs, recentLoss:(policy.negativeFilter ?? cfg.negativeFilter)?.windows ?? [] })) {
      for (const n of ns) rows.push({policy:policy.id,window,n,contexts:0,full:0,usable:0,insufficient:0,unknown:0,unavailable:0,pct:null});
    }
  }
  const cap = Math.max(0,...rows.map(r=>r.n));
  for (const tape of tapes) {
    if (tape === null) {
      for (const row of rows) { row.contexts++; row.unavailable++; }
      continue;
    }
    const bad = [0];
    for (let i=0;i<Math.min(cap,tape.length);i++) bad.push(bad[i] + (Number.isFinite(measuredEdgePnl(tape[i])) ? 0 : 1));
    for (const row of rows) {
      row.contexts++;
      if (tape.length < row.n) row.insufficient++;
      else {
        row.full++;
        if (bad[row.n]) row.unknown++;
        else row.usable++;
      }
    }
  }
  for (const row of rows) row.pct = row.contexts && row.unavailable === 0 ? 100*row.usable/row.contexts : null;
  return rows;
}

/** Extend only a provably identical newest prefix. Stable IDs/ticks prevent an
 * old winning ring from replacing a new losing tape after truncation/restart. */
export function extendOwnSampleHistory<T extends {id?: string; tick?: number; pnl?: number; ratio?: number}>(
  current: T[], retained: T[], limit = 200,
): T[] {
  if (!current.length) return retained.slice(0,limit);
  if (retained.length <= current.length) return current.slice(0,limit);
  const prefixMatches=current.every((row,i)=>Boolean(row.id) && Number.isFinite(row.tick) &&
    row.id===retained[i]?.id && row.tick===retained[i]?.tick &&
    Object.is(measuredEdgePnl(row),measuredEdgePnl(retained[i])));
  return (prefixMatches ? retained : current).slice(0,limit);
}
