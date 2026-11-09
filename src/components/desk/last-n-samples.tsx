import type { SampleCoverage } from "@/lib/desk/last-n-samples";

export function LastNSampleCoverageTable({ coverage }: { coverage?: SampleCoverage }) {
  if (!coverage) return <p className="mt-2 text-xs text-muted">Sample coverage is unavailable for this snapshot.</p>;
  return <div className="mt-3 overflow-x-auto">
    <p className="text-xs text-muted">Enough samples · retained exact config / symbol / direction contexts at tick {coverage.at}. Includes known empty candidates and losing samples. This is sample coverage, not PF validation; configs never generated are outside this denominator.</p>
    <table className="w-full min-w-[32rem] text-sm">
      <thead><tr><th className="text-left">Policy / window</th><th>N</th><th>Enough samples</th><th>Short</th><th>Unknown</th></tr></thead>
      <tbody>{coverage.rows.map(row => <tr key={JSON.stringify([row.policy, row.window, row.n])}>
        <td>{row.policy} / {row.window}</td><td className="text-center">{row.n}</td>
        <td className="text-center">{row.pct == null ? "Unavailable" : `${row.usable}/${row.contexts} (${row.pct.toFixed(1)}%)`}</td>
        <td className="text-center">{row.insufficient}</td><td className="text-center">{row.unknown}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
