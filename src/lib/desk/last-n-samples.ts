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
  pct: number | null;
}
export interface SampleCoverage {
  at: number;
  connId: string;
  scope: "retained-exact-contexts";
  rows: SampleRow[];
}
/** Each iterable member is one own-config newest-first tape, including empty
 * known candidates. All policies are scored separately; no PF condition affects coverage. */
export function sampleRows(tapes: Iterable<readonly { pnl?: number; ratio?: number }[]>, cfg: LastNProgressConfig): SampleRow[] {
  const rows: SampleRow[] = [];
  const policies = cfg.policies?.length ? cfg.policies : [{...cfg,id:"default"}];
  for (const policy of policies) {
    for (const [window, ns] of Object.entries({ base:policy.evalNs, validation:policy.validNs,
      negative:policy.disableNs, recentLoss:(policy.negativeFilter ?? cfg.negativeFilter)?.windows ?? [] })) {
      for (const n of ns) rows.push({policy:policy.id,window,n,contexts:0,full:0,usable:0,insufficient:0,unknown:0,pct:null});
    }
  }
  const cap = Math.max(0,...rows.map(r=>r.n));
  for (const tape of tapes) {
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
  for (const row of rows) row.pct = row.contexts ? 100*row.usable/row.contexts : null;
  return rows;
}
