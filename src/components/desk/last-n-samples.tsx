import type { SampleCoverage, SampleRow } from "@/lib/desk/last-n-samples";

function CoverageRows({ rows }: { rows: SampleRow[] }) {
  return <table className="w-full min-w-[36rem] text-sm">
    <thead><tr><th className="text-left">Policy / window</th><th>N</th><th>Enough samples</th><th>Short</th><th>Invalid</th><th>Unavailable</th></tr></thead>
    <tbody>{rows.map(row => <tr key={JSON.stringify([row.policy, row.window, row.n])}>
      <td>{row.policy} / {row.window}</td><td className="text-center">{row.n}</td>
      <td className="text-center">{row.pct == null ? `Unavailable · ${row.usable}/${row.contexts} confirmed` : `${row.usable}/${row.contexts} (${row.pct.toFixed(1)}%)`}</td>
      <td className="text-center">{row.insufficient}</td><td className="text-center">{row.unknown}</td><td className="text-center">{row.unavailable ?? 0}</td>
    </tr>)}</tbody>
  </table>;
}
export function LastNSampleCoverageTable({ coverage }: { coverage?: SampleCoverage }) {
  if (!coverage) return <p className="mt-2 text-xs text-muted">Sample coverage is unavailable for this snapshot.</p>;
  return <div className="mt-3 overflow-x-auto">
    <p className="text-xs text-muted">Enough samples · registered exact config / symbol / direction contexts at tick {coverage.at}. Includes empty, denied and cancelled candidates, and losing samples. Missing configuration provenance is unavailable. These percentages measure sample sufficiency, separately from PF validation. Combinations not yet registered are outside this denominator.</p>
    <p className="mt-2 text-xs font-medium">Qualification-selected own history</p>
    <CoverageRows rows={coverage.rows} />
    {coverage.stages && <details className="mt-2 text-xs">
      <summary className="cursor-pointer">Compare actual history stages</summary>
      <p className="mt-2 text-muted">Current own history (without substituting frozen Base)</p>
      <CoverageRows rows={coverage.stages.currentOwn} />
      <p className="mt-2 text-muted">Frozen Base history</p>
      {coverage.stages.frozenBase ? <CoverageRows rows={coverage.stages.frozenBase} /> : <p>Unavailable · no completed Base snapshot.</p>}
    </details>}
  </div>;
}
