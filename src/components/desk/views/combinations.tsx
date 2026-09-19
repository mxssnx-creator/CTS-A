import { useEffect, useMemo, useState } from "react";
import { combosFiltered, pickBestCombo, RANGE_META, TACTIC_META, TRAIL_PCTS, TP_SL_RATIOS } from "@/lib/desk/engine";
import type { RangeType, TacticKind } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { clsPnl, fmtNum, fmtUsd } from "@/lib/utils";
import { fmtMdd, fmtPf, fmtWr, Panel, Pill, Segmented } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";
import { Button } from "@/components/ui/button";

export function CombinationsView() {
  usePreserveScroll();
  const symbol = useDesk((s) => s.symbol);
  const lastNs = useDesk((s) => s.lastNs);
  const cfg = useDesk((s) => s.tacticConfig);
  const th = useDesk((s) => s.thresholds);
  const only = useDesk((s) => s.comboOnlyPositive);
  const setOnly = useDesk((s) => s.setComboOnlyPositive);
  const comboTactic = useDesk((s) => s.comboTactic);
  const setComboTactic = useDesk((s) => s.setComboTactic);
  const comboRange = useDesk((s) => s.comboRange);
  const setComboRange = useDesk((s) => s.setComboRange);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const applyBest = useDesk((s) => s.applyBestCombo);
  const liveSnap = useLiveSnapshot();
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [rows, setRows] = useState<ReturnType<typeof combosFiltered>>([]);

  useEffect(() => {
    let dead = false;
    const t = window.setTimeout(() => {
      try {
        const next = combosFiltered({
        symbol,
        lastN: lastNs.combos,
        cfg,
        th,
        tactic: comboTactic,
        rangeType: comboRange,
        onlyPositive: only,
        enabledKinds,
        keepBest: true,
      });
        if (!dead) setRows(next);
      } catch {
        if (!dead) setRows([]);
      }
    }, 180);
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
  }, [symbol, lastNs.combos, cfg, th, comboTactic, comboRange, only, stamp, enabledKinds]);

  const sweepCells = ((liveSnap.overall as { sweep?: { cells?: { tactic: string; range: string; pf: number; wr?: number; net?: number; trades?: number; ok?: boolean }[] } } | null)?.sweep?.cells ?? []);
  const shown = rows.length ? rows.slice(0, 80) : [];
  const best = useMemo(() => (rows.length ? pickBestCombo(rows) : null), [rows]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">Universe</p>
          <h1 className="text-2xl font-semibold tracking-tight">Combinations</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Independent tracks for every enabled type × cost 3–30 × range × tactic × {TRAIL_PCTS.length} trail
            ranges × {TP_SL_RATIOS.length} TP/SL ratios (0.60–3.00). Always computed in full; ranked by PF.
            Position cost unit 0.1% of equity. Normal is the unadjusted general set.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => applyBest()} disabled={!best}>
            Use best
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              window.setTimeout(() => {
                setStamp((n) => n + 1);
                applyBest();
                setBusy(false);
              }, 30);
            }}
          >
            {busy ? "Calculating…" : "Recalculate all"}
          </Button>
        </div>
      </div>

      <LiveBookStrip />
      {!rows.length ? (
        <Panel title="Host sweep · tactic × range">
          <p className="mb-3 text-sm text-muted">Desk combo matrix is computing… showing live host sweep meanwhile.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                  <th className="py-2 pr-3">Tactic</th>
                  <th className="py-2 pr-3">Range</th>
                  <th className="py-2 pr-3">PF</th>
                  <th className="py-2 pr-3">WR</th>
                  <th className="py-2 pr-3">N</th>
                  <th className="py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {sweepCells.map((c) => (
                  <tr key={`${c.tactic}-${c.range}`} className="border-t border-border">
                    <td className="py-2 pr-3 capitalize">{c.tactic}</td>
                    <td className="py-2 pr-3 capitalize">{c.range}</td>
                    <td className={`py-2 pr-3 font-mono tabular ${c.ok ? "text-up" : "text-down"}`}>{fmtPf(c.pf)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{fmtWr(c.wr ?? 0)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{c.trades ?? 0}</td>
                    <td className={`py-2 font-mono tabular ${clsPnl(c.net ?? 0)}`}>{fmtUsd(c.net ?? 0)}</td>
                  </tr>
                ))}
                {!sweepCells.length ? (
                  <tr>
                    <td className="py-3 text-muted" colSpan={6}>
                      Waiting for host sweep…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={comboTactic}
          onChange={(v) => setComboTactic(v as TacticKind | "all")}
          options={[{ id: "all", label: "All tactics" }, ...Object.entries(TACTIC_META).map(([id, m]) => ({ id, label: m.label }))]}
        />
        <Segmented
          value={comboRange}
          onChange={(v) => setComboRange(v as RangeType | "all")}
          options={[{ id: "all", label: "All ranges" }, ...Object.entries(RANGE_META).map(([id, m]) => ({ id, label: m.label }))]}
        />
        <label className="ml-auto flex h-8 items-center gap-2 border border-border bg-surface px-3 text-xs">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          Positive only
        </label>
      </div>

      <Panel
        padded={false}
        title={`${fmtNum(rows.length, 0)} tracks`}
        action={
          <span className="text-xs text-muted">
            Showing {shown.length}
            {best
              ? ` · best ${best.tactic}/${best.rangeType} trail ${best.trailPct.toFixed(1)}% TP/SL ${best.tpRatio.toFixed(2)}R PF ${best.pf.toFixed(2)}`
              : ""}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-2 py-2">Strategy</th>
                <th className="px-2 py-2">Cost</th>
                <th className="px-2 py-2">Range</th>
                <th className="px-2 py-2">Tactic</th>
                <th className="px-2 py-2">Trail</th>
                <th className="px-2 py-2">TP/SL</th>
                <th className="px-2 py-2">PF</th>
                <th className="px-2 py-2">Last N PF</th>
                <th className="px-2 py-2">WR</th>
                <th className="px-2 py-2">MDD</th>
                <th className="px-2 py-2">VF</th>
                <th className="px-2 py-2">Net</th>
                <th className="px-2 py-2">Gate</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs tabular">{r.rank}</td>
                  <td className="px-2 py-2">{r.strategyName}</td>
                  <td className="px-2 py-2 font-mono tabular">{r.costStep}</td>
                  <td className="px-2 py-2 capitalize">{r.rangeType}</td>
                  <td className="px-2 py-2 capitalize">{r.tactic}</td>
                  <td className="px-2 py-2 font-mono tabular">{r.trailPct.toFixed(1)}%</td>
                  <td className="px-2 py-2 font-mono tabular">{r.tpRatio.toFixed(2)}R</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtPf(r.pf)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtPf(r.lastNPf)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtWr(r.wr)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtMdd(r.mdd)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtNum(r.volumeFactor, 2)}</td>
                  <td className={`px-2 py-2 font-mono tabular ${clsPnl(r.net)}`}>{fmtUsd(r.net)}</td>
                  <td className="px-2 py-2">
                    {r.positive && r.lastNPositive ? (
                      <Pill tone="up">Pass</Pill>
                    ) : r.positive ? (
                      <Pill tone="accent">PF only</Pill>
                    ) : (
                      <Pill>Fail</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
