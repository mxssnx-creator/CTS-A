import { Link } from "@tanstack/react-router";
import { INDICATION_KINDS, RANGE_META, RANGE_TYPES, STRATEGY_KINDS, TACTIC_META, TACTICS } from "@/lib/desk/engine";
import { loadOverallStats, loadVstSession } from "@/lib/desk/feed";
import { LIVE_HOUR_NS } from "@/lib/desk/vst";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { fmtNum, fmtUsd } from "@/lib/utils";
import { HBarChart, MetricBarChart, OccupancyChart } from "../charts";
import { LiveExchangeStats, pickLiveOverview } from "../live-exchange-stats";
import { fmtMdd, fmtPf, fmtWr, Kpi, Panel, pfTone, StatLine } from "../widgets";

type Bucket = {
  key: string;
  n: number;
  pf: number;
  wr: number;
  net: number;
  ddt?: number;
  mdd?: number;
  openN?: number;
  symbols?: number;
  orders?: number;
  avgOrders?: number;
  avgPositions?: number;
};

function BucketTable({ rows, labels }: { rows: Bucket[]; labels?: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-subtle">
            <th className="py-2 pr-3">Set</th>
            <th className="py-2 pr-3">N</th>
            <th className="py-2 pr-3">Open</th>
            <th className="py-2 pr-3">PF</th>
            <th className="py-2 pr-3">WR</th>
            <th className="py-2 pr-3">DDT</th>
            <th className="py-2 pr-3">MDD</th>
            <th className="py-2">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.key} className="border-t border-border">
              <td className="py-2 pr-3 font-medium">{labels?.[s.key] ?? s.key}</td>
              <td className="py-2 pr-3 font-mono tabular">{s.n}</td>
              <td className="py-2 pr-3 font-mono tabular">{s.openN ?? 0}</td>
              <td className={`py-2 pr-3 font-mono tabular ${s.pf >= 1 ? "text-up" : s.n ? "text-down" : ""}`}>{fmtPf(s.pf)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtWr(s.wr)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtNum(s.ddt ?? 0, 0)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtMdd(s.mdd ?? 0)}</td>
              <td className={`py-2 font-mono tabular ${s.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(s.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function nz(rows?: { n?: number }[] | null) {
  return (rows ?? []).filter((r) => Number(r.n) > 0).length;
}

function stamp(ms: number) {
  if (!(ms > 1e12)) return "—";
  try {
    return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
  } catch {
    return "—";
  }
}

export function StatisticsView() {
  usePreserveScroll();
  const liveSnap = useLiveSnapshot();
  const session = liveSnap.session as Awaited<ReturnType<typeof loadVstSession>> | null;
  const file = liveSnap.overall as Awaited<ReturnType<typeof loadOverallStats>> | null;
  const view = pickLiveOverview(session as Record<string, unknown> | null, file);
  const tapeClosed = Number(liveSnap.trades);
  const pf = Number(liveSnap.pf || view.pf || view.overall?.pf || 0);
  const wr = Number(liveSnap.wr || view.wr || view.overall?.wr || 0);
  const net = Number(liveSnap.net ?? view.net ?? view.overall?.net ?? 0);
  const ddt = Number(view.ddt ?? view.overall?.ddt ?? 0);
  const mdd = Number(liveSnap.mdd || view.mdd || view.overall?.mdd || 0);
  const avgPos = Number((session as { avgLivePos?: number } | null)?.avgLivePos ?? view.avgPositions ?? liveSnap.livePos);
  const avgOrd = Number((session as { avgLiveOrd?: number } | null)?.avgLiveOrd ?? view.avgOrders ?? liveSnap.liveOrd);
  const indicationRows = (view.byIndication ?? []) as Bucket[];
  const kindRows = (view.byKind ?? []) as Bucket[];
  const playRows = (view.byPlaybook ?? []) as Bucket[];
  const symbols = (view.bySymbol ?? []).slice(0, 50) as Bucket[];
  const indLabels = Object.fromEntries(INDICATION_KINDS.map((k) => [k.id, k.label]));
  const kindLabels = Object.fromEntries(STRATEGY_KINDS.map((k) => [k.id, k.label]));
  const playLabels: Record<string, string> = { normal: "Normal", axis: "Axis", block: "Block", dca: "DCA", short: "Short" };
  const hourBars = LIVE_HOUR_NS.map((h) => ({ label: `${h}h`, value: Number(view.hours?.[String(h)]?.pf ?? 0) }));
  const occ = LIVE_HOUR_NS.map((h, i) => ({
    i,
    pos: Number(view.hours?.[String(h)]?.avgPositions ?? avgPos),
    ord: Number(view.hours?.[String(h)]?.avgOrders ?? avgOrd),
  }));
  const sessAt = Number((session as { at?: number } | null)?.at ?? liveSnap.at);
  const fileAt = Number((file as { at?: number } | null)?.at ?? 0);
  const tapeN = Array.isArray((session as { tape?: unknown[] } | null)?.tape)
    ? ((session as { tape: unknown[] }).tape.length)
    : 0;
  const execN = Array.isArray((file as { executions?: { orders?: unknown[] } } | null)?.executions?.orders)
    ? ((file as { executions: { orders: unknown[] } }).executions.orders.length)
    : 0;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Live tape</p>
        <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Independent BingX {liveSnap.venueLabel} buckets — indications, kinds, playbooks, hours and last-N from the live
          JSON store, not sim replay. Config matrix stays on{" "}
          <Link to="/results" preload={false} className="text-primary underline-offset-2 hover:underline">
            Results
          </Link>
          .
        </p>
      </div>

      <Panel title="Database · session / overall JSON">
        <p className="text-sm text-muted">
          Trading store is the host JSON files (auth off). Session writes every cycle; overall-stats about every 45s.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Conn" v={liveSnap.conn || "—"} />
          <StatLine k="Ping" v={liveSnap.pingOk ? "ok" : "down"} tone={liveSnap.pingOk ? "up" : "down"} />
          <StatLine k="Session at" v={stamp(sessAt)} />
          <StatLine k="Overall at" v={stamp(fileAt)} />
          <StatLine k="Tape rows" v={String(tapeN)} />
          <StatLine k="Exec fills" v={String(execN)} />
          <StatLine k="Closed n" v={String(view.overall?.n ?? tapeClosed)} />
          <StatLine k="Open n" v={String(view.open?.n ?? liveSnap.livePos)} />
          <StatLine k="Indication sets" v={`${nz(view.byIndication)} / ${(view.byIndication ?? []).length}`} />
          <StatLine k="Kind sets" v={`${nz(view.byKind)} / ${(view.byKind ?? []).length}`} />
          <StatLine k="Playbook sets" v={`${nz(view.byPlaybook)} / ${(view.byPlaybook ?? []).length}`} />
          <StatLine k="Symbol sets" v={`${nz(view.bySymbol)} / ${(view.bySymbol ?? []).length}`} />
        </div>
      </Panel>

      <Panel title={`Live exchange · ${liveSnap.venueLabel}`}>
        <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Live PF" value={fmtPf(pf)} tone={pfTone(pf)} hint={`${tapeClosed} tape closes`} />
          <Kpi label="Win rate" value={fmtWr(wr)} />
          <Kpi label="Net" value={fmtUsd(net)} tone={net >= 0 ? "up" : "down"} />
          <Kpi label="DDT" value={fmtNum(ddt, 0)} hint={`MDD ${fmtMdd(mdd)}`} />
          <Kpi label="Occupied" value={String(liveSnap.occupied)} hint={`${liveSnap.livePos} legs`} />
          <Kpi label="Orders" value={String(liveSnap.liveOrd)} hint={`SL ${liveSnap.liveSl} · TP ${liveSnap.liveTp}`} />
        </div>
      </Panel>

      <LiveExchangeStats
        live={view}
        session={session as Record<string, unknown> | null}
        validated={(file?.sweep?.cells ?? []).filter((c) => c.ok).length}
        exchangePos={liveSnap.livePos}
        exchangeOrd={liveSnap.liveOrd}
        avgLivePos={avgPos}
        avgLiveOrd={avgOrd}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Hour PF">
          <MetricBarChart data={hourBars} yLabel="PF" />
        </Panel>
        <Panel title="Active positions / orders">
          <OccupancyChart data={occ} />
          <div className="mt-2 grid grid-cols-2 gap-x-4">
            <StatLine k="Live avg pos" v={fmtNum(avgPos, 2)} />
            <StatLine k="Live avg ord" v={fmtNum(avgOrd, 2)} />
            <StatLine k="Positions now" v={String(liveSnap.livePos)} />
            <StatLine k="Orders now" v={String(liveSnap.liveOrd)} />
          </div>
        </Panel>
      </div>

      <Panel title="Indications · independent">
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricBarChart
            data={indicationRows.map((r) => ({ label: indLabels[r.key] ?? r.key, value: Number(r.pf ?? 0) }))}
            yLabel="PF"
          />
          <HBarChart data={indicationRows.map((r) => ({ label: indLabels[r.key] ?? r.key, value: Number(r.net ?? 0) }))} />
        </div>
        <div className="mt-4">
          <BucketTable rows={indicationRows} labels={indLabels} />
        </div>
      </Panel>

      <Panel title="Strategy kinds · independent">
        <MetricBarChart
          data={kindRows.map((r) => ({ label: kindLabels[r.key] ?? r.key, value: Number(r.pf ?? 0) }))}
          yLabel="PF"
        />
        <div className="mt-4">
          <BucketTable rows={kindRows} labels={kindLabels} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Playbooks">
          <BucketTable rows={playRows} labels={playLabels} />
        </Panel>
        <Panel title="Tactics">
          <BucketTable
            rows={(view.byTactic ?? []) as Bucket[]}
            labels={Object.fromEntries(TACTICS.map((t) => [t, TACTIC_META[t].label]))}
          />
        </Panel>
      </div>

      <Panel title={`Live realized by symbol · ${symbols.length}`}>
        <div className="mb-3 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Occupied" v={`${liveSnap.occupied} / ${view.symbols ?? 50}`} />
          <StatLine k="Legs" v={`${liveSnap.livePos} · ${liveSnap.liveLong}L/${liveSnap.liveShort}S`} />
          <StatLine k="Avg pos" v={fmtNum(avgPos, 2)} />
          <StatLine k="Avg ord" v={fmtNum(avgOrd, 2)} />
        </div>
        <BucketTable rows={symbols} />
      </Panel>

      <Panel title="Range types">
        <BucketTable
          rows={(view.byRange ?? []) as Bucket[]}
          labels={Object.fromEntries(RANGE_TYPES.map((r) => [r, RANGE_META[r].label]))}
        />
      </Panel>
    </div>
  );
}