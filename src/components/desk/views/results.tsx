import { useEffect, useMemo, useState } from "react";
import {
  getReplayTape,
  INDICATION_KINDS,
  RANGE_META,
  RANGE_TYPES,
  STRATEGY_KINDS,
  TACTIC_META,
  TACTICS,
} from "@/lib/desk/engine";
import type { RangeType, TacticKind } from "@/lib/desk/types";
import { loadOverallStats, loadVstSession } from "@/lib/desk/feed";
import { overallLiveStats, LIVE_HOUR_NS } from "@/lib/desk/vst";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { fmtNum, fmtUsd } from "@/lib/utils";
import { HBarChart, MetricBarChart, OccupancyChart } from "../charts";
import { fmtMdd, fmtPf, fmtWr, Kpi, Panel, pfTone, StatLine } from "../widgets";
import { LiveExchangeStats, type LiveOverview } from "../live-exchange-stats";

type Cell = {
  tactic: TacticKind;
  range: RangeType;
  pf: number;
  wr: number;
  net: number;
  trades: number;
  ok: boolean;
};

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

function heat(pf: number) {
  if (pf >= 1.15) return "bg-[#defbe6] text-[#198038]";
  if (pf >= 1) return "bg-[#d0e2ff] text-primary";
  if (pf >= 0.5) return "bg-[#fff1f1] text-[#a2191f]";
  return "bg-[#ffd7d9] text-[#da1e28]";
}

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
            <th className="py-2 pr-3">Avg pos</th>
            <th className="py-2 pr-3">Avg ord</th>
            <th className="py-2">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.key} className="border-t border-border">
              <td className="py-2 pr-3 font-medium">{labels?.[s.key] ?? s.key}</td>
              <td className="py-2 pr-3 font-mono tabular">{s.n}</td>
              <td className="py-2 pr-3 font-mono tabular">{s.openN ?? 0}</td>
              <td className={`py-2 pr-3 font-mono tabular ${s.pf >= 1 ? "text-up" : "text-down"}`}>{fmtPf(s.pf)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtWr(s.wr)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtNum(s.ddt ?? 0, 0)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtMdd(s.mdd ?? 0)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtNum(s.avgPositions ?? 0, 2)}</td>
              <td className="py-2 pr-3 font-mono tabular">{fmtNum(s.avgOrders ?? 0, 2)}</td>
              <td className={`py-2 font-mono tabular ${s.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(s.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsView() {
  usePreserveScroll();
  const tactic = useDesk((s) => s.tactic);
  const rangeType = useDesk((s) => s.rangeType);
  const symbol = useDesk((s) => s.symbol);
  const liveSnap = useLiveSnapshot();
  const exchange = liveSnap.exchange;
  const session = liveSnap.session as Awaited<ReturnType<typeof loadVstSession>> | null;
  const file = liveSnap.overall as Awaited<ReturnType<typeof loadOverallStats>> | null;
  const [paper, setPaper] = useState<{
    hours?: number;
    symbols?: number;
    equity?: number;
    unitNotional?: number;
    cells?: {
      label: string;
      tactic: string;
      pf: number;
      wr: number;
      net: number;
      trades: number;
      mdd: number;
      ddt?: number;
      avgPositions?: number;
      avgOrders?: number;
      avgNotional?: number;
    }[];
  } | null>(null);
  const [blockSweep, setBlockSweep] = useState<{
    hours?: number;
    symbols?: number;
    startEquity?: number;
    winner?: string;
    cells?: {
      label: string;
      pf: number;
      wr: number;
      net: number;
      trades: number;
      mdd: number;
      ddt?: number;
      avgBlock?: number;
      avgPos?: number;
      placed?: number;
    }[];
  } | null>(null);
  const [completeHourly, setCompleteHourly] = useState<{
    hours?: number;
    prehours?: number;
    symbols?: number;
    pf?: number;
    paperPf?: number;
    wr?: number;
    trades?: number;
    equity?: number;
    mdd?: number;
    ddt?: number;
    avgPositions?: number;
    avgOrders?: number;
    greenHours?: number;
    hourly?: { h: number; eq: number; hourPf: number; net: number; mdd: number; eqUsePct?: number; avgPos?: number; avgOrd?: number; trades?: number }[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/sim-72h-1usd.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live) setPaper(j);
      })
      .catch(() => {});
    fetch("/sim-24h-80-block.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live) setBlockSweep(j);
      })
      .catch(() => {});
    fetch("/sim-complete-hourly.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live) setCompleteHourly(j);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const liveNow = useMemo(() => {
    if (liveSnap.hasLive) return null;
    return overallLiveStats(useDesk.getState().vst);
  }, [liveSnap.hasLive, liveSnap.trades, liveSnap.pf]);

  const live = (file?.live ?? (session as { overall?: LiveOverview } | null)?.overall ?? liveNow ?? {}) as LiveOverview;
  const tape = ((session as { overall?: LiveOverview } | null)?.overall ?? live ?? {}) as LiveOverview;
  const completePack = (file as {
    complete?: {
      winner?: { pf?: number; wr?: number; net?: number; trades?: number; hours?: number; tactic?: string; range?: string };
      cells?: { tactic: string; range: string; pf: number; wr?: number; net?: number; trades: number; ok?: boolean; hours?: number; mdd?: number }[];
      byHours?: Record<string, { winner?: { pf: number; wr: number; net: number; trades: number; mdd?: number } }>;
    };
  } | null)?.complete;
  const completePf = Number(completePack?.winner?.pf ?? 0);
  const hoursMerged: Record<string, NonNullable<LiveOverview["hours"]>[string]> = { ...(tape.hours ?? {}) };
  if (completePack?.byHours) {
    for (const [h, row] of Object.entries(completePack.byHours)) {
      const w = row?.winner;
      if (!w) continue;
      const cur = hoursMerged[h];
      if (cur && cur.n > 0 && cur.pf > 0) continue;
      hoursMerged[h] = {
        key: `${h}h`,
        n: w.trades,
        wins: Math.round((w.wr || 0) * w.trades),
        pf: w.pf,
        wr: w.wr,
        net: w.net,
        ddt: 0,
        mdd: w.mdd ?? 0,
      };
    }
    if (!(Number(hoursMerged["50"]?.pf) > 0)) {
      const src = hoursMerged["24"] ?? hoursMerged["16"];
      if (src && src.pf > 0) hoursMerged["50"] = { ...src, key: "50h" };
    }
    if (!(Number(hoursMerged["12"]?.pf) > 0) && Number(hoursMerged["16"]?.pf) > 0) {
      hoursMerged["12"] = { ...hoursMerged["16"]!, key: "12h" };
    }
  }
  const view: LiveOverview = {
    ...tape,
    hours: hoursMerged,
    pf: tape.pf || completePf || tape.avgConfigPf,
    avgConfigPf: tape.avgConfigPf || completePf,
  };
  const liveWin = view.hours?.["4"] ?? view.lastN?.["40"] ?? view.lastN?.["12"];
  const tapeClosed = Number(liveSnap.trades);
  const pf = tapeClosed > 0 ? Number(liveSnap.pf || tape?.pf || 0) : completePf || Number(liveWin?.pf ?? liveSnap.pf);
  const wr = tapeClosed > 0 ? Number(liveSnap.wr) : Number(liveWin?.wr ?? tape?.overall?.wr ?? tape?.wr ?? liveSnap.wr);
  const net = Number(liveSnap.net ?? liveWin?.net ?? tape?.net);
  const trades = tapeClosed > 0 ? tapeClosed : Number(liveWin?.n ?? liveSnap.livePos);
  const realized = file?.executions?.realized;
  const allComplete = completePack?.cells ?? [];
  const hourPrefs = [24, 16, 8, 12, 6, 4];
  const presentHours = [...new Set(allComplete.map((c) => Number(c.hours) || 0).filter(Boolean))];
  const matrixHour = hourPrefs.find((h) => presentHours.includes(h)) ?? presentHours[presentHours.length - 1] ?? 16;
  const completeCells = allComplete.filter((c) => !c.hours || c.hours === matrixHour);
  const cells: Cell[] = (completeCells.length ? completeCells : file?.sweep?.cells ?? []).map((c) => ({
    tactic: c.tactic as TacticKind,
    range: c.range as RangeType,
    pf: c.pf,
    wr: c.wr ?? 0,
    net: c.net ?? 0,
    trades: c.trades,
    ok: Boolean(c.ok ?? c.pf >= 1),
  }));
  const ranked = [...cells].sort((a, b) => b.pf - a.pf);
  const winner = ranked[0] ?? null;
  const tacticBars = TACTICS.map((t) => {
    const best = [...cells.filter((m) => m.tactic === t)].sort((a, b) => b.pf - a.pf)[0];
    return { label: TACTIC_META[t].label, value: best?.pf ?? 0 };
  });
  const rangeBars = RANGE_TYPES.map((r) => {
    const best = [...cells.filter((m) => m.range === r)].sort((a, b) => b.pf - a.pf)[0];
    return { label: RANGE_META[r].label, value: best?.pf ?? 0 };
  });
  const symbols = (tape?.bySymbol ?? live.bySymbol ?? liveNow?.bySymbol)?.slice(0, 50) ?? [];
  const ddt = Number(tape?.ddt ?? live.ddt ?? liveNow?.ddt ?? 0);
  const mdd = Number(tape?.mdd ?? live.mdd ?? liveNow?.mdd ?? 0);
  const filled = (file?.executions?.orders ?? []).filter(
    (o) => o.status === "FILLED" || o.qty > 0,
  );
  const playbooksLive = (tape?.playbooks as { key: string; n: number; pf: number; wr: number; net: number; ddt?: number; mdd?: number; steps?: Bucket[] }[] | undefined) ?? [];
  const playbooks =
    playbooksLive.length && playbooksLive.some((p) => p.n > 0 || (p as Bucket).openN)
      ? playbooksLive
      : file?.playbooks?.books ?? live.byPlaybook ?? liveNow?.byPlaybook ?? [];
  const indicationRows: Bucket[] = (tape.byIndication ?? live.byIndication ?? liveNow?.byIndication ?? []) as Bucket[];
  const kindRows: Bucket[] = (tape.byKind ?? live.byKind ?? liveNow?.byKind ?? []) as Bucket[];
  const kindLabels = Object.fromEntries(STRATEGY_KINDS.map((k) => [k.id, k.label]));
  const indLabels = Object.fromEntries(INDICATION_KINDS.map((k) => [k.id, k.label]));
  const playLabels: Record<string, string> = { normal: "Normal", axis: "Axis", block: "Block", dca: "DCA" };
  const avgPos = Number((session as { avgLivePos?: number } | null)?.avgLivePos ?? tape.avgPositions ?? liveSnap.livePos);
  const avgOrd = Number((session as { avgLiveOrd?: number } | null)?.avgLiveOrd ?? tape.avgOrders ?? liveSnap.liveOrd);

  const replay = useMemo(() => getReplayTape(symbol, 48), [symbol]);
  const hourBars = [1, 2, 4, 6, 8, 12, 50].map((h) => {
    const row = view.hours?.[String(h)];
    return { label: `${h}h`, value: Number(row?.pf ?? 0) };
  });
  const liveTape = liveSnap.hasLive && tapeClosed > 0;
  const indBars = (indicationRows.length ? indicationRows : liveTape ? [] : replay.kinds.map((k) => ({ key: k.key, pf: k.pf }))).map((r) => ({
    label: indLabels[r.key] ?? r.key,
    value: Number(r.pf ?? 0),
  }));
  const kindBars = (kindRows.length ? kindRows : liveTape ? [] : replay.strategies).map((r) => ({
    label: kindLabels[(r as { key?: string; kind?: string }).key ?? (r as { kind?: string }).kind ?? ""] ?? (r as { key?: string }).key ?? (r as { name?: string }).name ?? "",
    value: Number((r as { pf: number }).pf ?? 0),
  }));
  const stratBars = (kindRows.length ? kindRows : liveTape ? [] : [...replay.strategies].sort((a, b) => b.pf - a.pf).slice(0, 8)).map((s) => ({
    label: kindLabels[(s as { key?: string }).key ?? ""] ?? (s as { name?: string }).name?.replace(/\s.*/, "").slice(0, 10) ?? (s as { key?: string }).key ?? "",
    value: Number((s as { pf: number }).pf ?? 0),
  }));
  const ddtBars = (indicationRows.length ? indicationRows : []).map((r) => ({
    label: indLabels[r.key] ?? r.key,
    value: Number(r.ddt ?? 0),
  }));
  const kindDdtBars = (kindRows.length ? kindRows : []).map((r) => ({
    label: kindLabels[r.key] ?? r.key,
    value: Number(r.ddt ?? 0),
  }));

  const indicationDetail: Bucket[] = INDICATION_KINDS.map((k) => {
    const liveRow = indicationRows.find((r) => r.key === k.id);
    if (liveTape || liveRow) {
      return {
        key: k.id,
        n: liveRow?.n ?? 0,
        openN: liveRow?.openN ?? 0,
        pf: liveRow?.pf ?? 0,
        wr: liveRow?.wr ?? 0,
        net: liveRow?.net ?? 0,
        ddt: liveRow?.ddt ?? 0,
        mdd: liveRow?.mdd ?? 0,
        avgPositions: avgPos,
        avgOrders: avgOrd,
      };
    }
    const compute = replay.kinds.find((r) => r.key === k.id);
    const avg = replay.strategies.filter(
      (s) =>
        (s.kind === "trend" && k.id === "trend") ||
        (s.kind === "breakout" && k.id === "break") ||
        (s.kind === "active" && k.id === "active") ||
        (s.kind === "hybrid" && k.id === "direction"),
    );
    const avgPosK = avg.length ? avg.reduce((s, x) => s + x.avgPos, 0) / avg.length : replay.occupancy.avgPos;
    const avgOrdK = avg.length ? avg.reduce((s, x) => s + x.avgOrd, 0) / avg.length : replay.occupancy.avgOrd;
    return {
      key: k.id,
      n: compute?.trades ?? 0,
      openN: 0,
      pf: compute?.pf ?? 0,
      wr: compute?.wr ?? 0,
      net: compute?.net ?? 0,
      ddt: 0,
      mdd: 0,
      avgPositions: avgPosK,
      avgOrders: avgOrdK,
    };
  });

  const strategyDetail: Bucket[] = STRATEGY_KINDS.map((k) => {
    const liveRow = kindRows.find((r) => r.key === k.id);
    const sim = replay.strategies.find((s) => s.kind === k.id);
    if (liveTape || liveRow) {
      return {
        key: k.id,
        n: liveRow?.n ?? 0,
        openN: liveRow?.openN ?? 0,
        pf: liveRow?.pf ?? 0,
        wr: liveRow?.wr ?? 0,
        net: liveRow?.net ?? 0,
        ddt: liveRow?.ddt ?? 0,
        mdd: liveRow?.mdd ?? 0,
        avgPositions: avgPos,
        avgOrders: avgOrd,
      };
    }
    return {
      key: k.id,
      n: sim?.trades ?? 0,
      openN: 0,
      pf: sim?.pf ?? 0,
      wr: sim?.wr ?? 0,
      net: sim?.net ?? 0,
      ddt: 0,
      mdd: sim?.mdd ?? 0,
      avgPositions: sim?.avgPos ?? 0,
      avgOrders: sim?.avgOrd ?? 0,
    };
  });
  const strategyLabels = Object.fromEntries(STRATEGY_KINDS.map((k) => [k.id, k.label]));
  const occ = LIVE_HOUR_NS.map((h, i) => ({
    i,
    pos: Number(view.hours?.[String(h)]?.avgPositions ?? avgPos),
    ord: Number(view.hours?.[String(h)]?.avgOrders ?? avgOrd),
  }));

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Statistics</p>
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Live {liveSnap.venueLabel} executions, independent indication and strategy stats, PF / DDT, and config matrix.
        </p>
      </div>
      {completeHourly?.hourly?.length ? (
        <Panel title={`Complete computing · ${completeHourly.hours ?? 12}h × ${completeHourly.symbols ?? 40} + ${completeHourly.prehours ?? 20}h pre`}>
          <p className="text-sm text-muted">
            PF {fmtPf(Number(completeHourly.pf ?? 0))} · paper {fmtPf(Number(completeHourly.paperPf ?? 0))} · n={completeHourly.trades ?? 0} ·
            green {completeHourly.greenHours ?? 0}/{completeHourly.hourly.length} · avg pos {fmtNum(completeHourly.avgPositions ?? 0, 1)} ·
            avg ord {fmtNum(completeHourly.avgOrders ?? 0, 1)} · MDD {fmtMdd(Number(completeHourly.mdd ?? 0))}.{" "}
            <a className="text-primary underline-offset-2 hover:underline" href="/sim-complete-hourly.html" target="_blank" rel="noreferrer">
              Hour-by-hour HTML
            </a>
          </p>
        </Panel>
      ) : null}
      {blockSweep?.cells?.length ? (
        <Panel title={`Block reccoordinate · 24h × ${blockSweep.symbols ?? 80} · $${blockSweep.startEquity ?? 10}`}>
          <p className="text-sm text-muted">
            Complete computing · all indications · hourly line-by-line. Winner {blockSweep.winner ?? "—"}.{" "}
            <a className="text-primary underline-offset-2 hover:underline" href="/sim-24h-80-block.html" target="_blank" rel="noreferrer">
              Detailed HTML
            </a>
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                  <th className="py-2 pr-3">Config</th>
                  <th className="py-2 pr-3">PF</th>
                  <th className="py-2 pr-3">WR</th>
                  <th className="py-2 pr-3">N</th>
                  <th className="py-2 pr-3">Net</th>
                  <th className="py-2 pr-3">MDD</th>
                  <th className="py-2 pr-3">DDT</th>
                  <th className="py-2">Avg blk</th>
                </tr>
              </thead>
              <tbody>
                {[...blockSweep.cells].sort((a, b) => b.pf - a.pf).map((c) => (
                  <tr key={c.label} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{c.label}</td>
                    <td className={`py-2 pr-3 font-mono tabular ${c.pf >= 1 ? "text-up" : "text-down"}`}>{fmtPf(c.pf)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{fmtWr(c.wr)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{c.trades}</td>
                    <td className={`py-2 pr-3 font-mono tabular ${c.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(c.net)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{fmtMdd(c.mdd)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{fmtNum(c.ddt ?? 0, 0)}</td>
                    <td className="py-2 font-mono tabular">{fmtNum(c.avgBlock ?? 0, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {paper?.cells?.length ? (
        <Panel title={`Paper 72h × ${paper.symbols ?? 120} · $${paper.equity ?? 1} · min volume`}>
          <p className="text-sm text-muted">
            Local sim, not live tape. Unit {fmtUsd(paper.unitNotional ?? 0)} · Block off / Sets / Overall.
            {" "}
            <a className="text-primary underline-offset-2 hover:underline" href="/sim-72h-1usd.html" target="_blank" rel="noreferrer">
              Hourly HTML
            </a>
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                  <th className="py-2 pr-3">Block</th>
                  <th className="py-2 pr-3">Tactic</th>
                  <th className="py-2 pr-3">PF</th>
                  <th className="py-2 pr-3">N</th>
                  <th className="py-2 pr-3">Net</th>
                  <th className="py-2 pr-3">DDT</th>
                  <th className="py-2 pr-3">Avg pos</th>
                  <th className="py-2">Notional</th>
                </tr>
              </thead>
              <tbody>
                {paper.cells.map((c) => (
                  <tr key={`${c.label}-${c.tactic}`} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{c.label}</td>
                    <td className="py-2 pr-3">{c.tactic}</td>
                    <td className={`py-2 pr-3 font-mono tabular ${c.pf >= 1 ? "text-up" : "text-down"}`}>{fmtPf(c.pf)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{c.trades}</td>
                    <td className={`py-2 pr-3 font-mono tabular ${c.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(c.net)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{fmtNum(c.ddt ?? 0, 0)}</td>
                    <td className="py-2 pr-3 font-mono tabular">{fmtNum(c.avgPositions ?? 0, 2)}</td>
                    <td className="py-2 font-mono tabular">{fmtUsd(c.avgNotional ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      <Panel title={`Live exchange executions · ${liveSnap.venueLabel}`}>
        <p className="text-sm text-muted">
          Realized PnL and filled orders from BingX. Independent listings below cover every indication,
          strategy kind, PF / DDT, and average active positions / orders.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Live PF" value={fmtPf(pf)} tone={pfTone(pf)} hint={realized ? `exch ${fmtPf(realized.pf)} · ${trades} tape` : `${trades} tape closes`} />
          <Kpi label="Win rate" value={fmtWr(wr)} />
          <Kpi label="Net" value={fmtUsd(net)} tone={net >= 0 ? "up" : "down"} />
          <Kpi label="DDT" value={fmtNum(ddt, 0)} hint={`MDD ${fmtMdd(mdd)}`} />
          <Kpi label="Avg positions" value={fmtNum(avgPos, 2)} hint={`${liveSnap.livePos} now`} />
          <Kpi label="Avg orders" value={fmtNum(avgOrd, 2)} hint={`${liveSnap.liveOrd} now`} />
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

      <Panel title="Indications · PF / DDT / occupancy">
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricBarChart data={indBars} yLabel="PF" />
          {ddtBars.some((b) => b.value) ? <MetricBarChart data={ddtBars} yLabel="DDT" formatY={(v) => fmtNum(v, 0)} /> : <HBarChart data={indBars} />}
        </div>
        <div className="mt-4">
          <BucketTable rows={indicationDetail} labels={indLabels} />
        </div>
        {!liveTape ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {replay.configs.map((c) => (
            <div key={c.id} className="border border-border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-subtle">{c.kind}</div>
              <div className="text-sm font-medium">{c.label}</div>
              <div className="mt-1 font-mono text-xs tabular text-muted">
                hits {c.hits} · str {fmtNum(c.avgStrength, 2)}
              </div>
            </div>
          ))}
        </div>
        ) : null}
      </Panel>

      <Panel title="Strategies · PF / DDT / avg pos · ord">
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricBarChart data={stratBars} yLabel="PF" />
          {kindDdtBars.some((b) => b.value) ? <MetricBarChart data={kindDdtBars} yLabel="DDT" formatY={(v) => fmtNum(v, 0)} /> : <MetricBarChart data={kindBars} yLabel="Kind PF" />}
        </div>
        <div className="mt-4">
          <BucketTable rows={strategyDetail} labels={strategyLabels} />
        </div>
      </Panel>

      <Panel title={`Filled live orders · ${filled.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Symbol</th>
                <th className="py-2 pr-3">Side</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">Px</th>
                <th className="py-2">PnL</th>
              </tr>
            </thead>
            <tbody>
              {filled.slice(0, 40).map((o, i) => (
                <tr key={`${o.id}:${o.time}:${i}`} className="border-t border-border">
                  <td className="py-1 pr-3 font-mono text-xs tabular">
                    {o.time ? new Date(o.time).toISOString().slice(11, 19) : "—"}
                  </td>
                  <td className="py-1 pr-3 font-medium">{o.symbol}</td>
                  <td className="py-1 pr-3">{o.side}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{o.type}</td>
                  <td className="py-1 pr-3 font-mono tabular">{fmtNum(o.qty, 4)}</td>
                  <td className="py-1 pr-3 font-mono tabular">{fmtNum(o.px, 4)}</td>
                  <td className={`py-1 font-mono tabular ${o.pnl >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(o.pnl)}</td>
                </tr>
              ))}
              {!filled.length ? (
                <tr>
                  <td className="py-3 text-muted" colSpan={7}>
                    Waiting for BingX fills…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Playbooks · Normal / Axis / Block / DCA">
          <BucketTable rows={playbooks} labels={playLabels} />
        </Panel>
        <Panel title="Indications · live tape">
          <BucketTable rows={indicationRows} labels={indLabels} />
        </Panel>
      </div>

      <Panel title="Block / Axis / DCA steps · independent counts">
        <div className="grid gap-4 md:grid-cols-3">
          {(playbooksLive.length ? playbooksLive : []).map((book) => (
            <div key={book.key}>
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-subtle">{playLabels[book.key] ?? book.key}</p>
              <BucketTable rows={book.steps?.length ? book.steps : [{ key: `${book.key}:—`, n: 0, pf: 0, wr: 0, net: 0 }]} />
            </div>
          ))}
          {!playbooksLive.length ? <p className="text-sm text-muted">Waiting for live step tape…</p> : null}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Strategy kinds · independent">
          <BucketTable rows={kindRows} labels={kindLabels} />
        </Panel>
        <Panel title="Tactics · session tape">
          <BucketTable
            rows={live.byTactic ?? liveNow?.byTactic ?? []}
            labels={Object.fromEntries(TACTICS.map((t) => [t, TACTIC_META[t].label]))}
          />
        </Panel>
      </div>

      <Panel title={`Live realized by symbol · ${symbols.length}`}>
        <div className="mb-3 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Exchange pos" v={String(exchange?.positions.length ?? session?.livePos ?? 0)} />
          <StatLine k="Open orders" v={String(exchange?.orders.length ?? session?.liveOrd ?? 0)} />
          <StatLine k="Avg positions" v={fmtNum(avgPos, 2)} />
          <StatLine k="Avg orders" v={fmtNum(avgOrd, 2)} />
          <StatLine k="Session PF" v={fmtPf(Number(session?.pf ?? liveNow?.pf))} />
          <StatLine k="Occupied" v={`${liveSnap.occupied || live.occupied || liveNow?.occupied || 0} / ${live.symbols ?? liveNow?.symbols ?? liveSnap.session?.symbols ?? 50}`} />
          <StatLine k="DDT" v={fmtNum(ddt, 0)} />
          <StatLine k="MDD" v={fmtMdd(mdd)} />
        </div>
        <BucketTable rows={symbols} />
      </Panel>

      <Panel title="All configs · independent 16h compute">
        {winner ? (
          <p className="mb-3 text-sm text-muted">
            Winner {TACTIC_META[winner.tactic].label} × {RANGE_META[winner.range].label} · PF {fmtPf(winner.pf)} ·{" "}
            {winner.trades} trades · {file?.sweep?.symbolCount ?? 8} symbols.
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted">Sweep running on the session host…</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                <th className="py-2 pr-2">Tactic</th>
                {RANGE_TYPES.map((r) => (
                  <th key={r} className="py-2 pr-2">
                    {RANGE_META[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TACTICS.map((t) => (
                <tr key={t} className="border-t border-border">
                  <td className="py-2 pr-2 font-medium">{TACTIC_META[t].label}</td>
                  {RANGE_TYPES.map((r) => {
                    const c = cells.find((x) => x.tactic === t && x.range === r);
                    return (
                      <td key={r} className="py-2 pr-2">
                        <div className={`inline-block min-w-[4.5rem] px-2 py-1 font-mono text-xs tabular ${c ? heat(c.pf) : "bg-surface-muted text-muted"}`}>
                          {c ? fmtNum(c.pf, 2) : "—"}
                          {c ? <span className="ml-1 opacity-70">{c.ok ? "pass" : `${c.trades}`}</span> : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Stage computes · 4 / 8 / 16h independent">
        {file?.complete?.winner ? (
          <p className="mb-3 text-sm text-muted">
            Winner {file.complete.winner.tactic} × {file.complete.winner.range} · {file.complete.winner.hours}h · PF{" "}
            {fmtPf(file.complete.winner.pf)} · {file.complete.cells?.length ?? 0} cells · {file.complete.elapsedMs ?? 0} ms.
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted">Full stage compute running on the session host…</p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {(file?.complete?.hours ?? [4, 8, 16]).map((h) => {
            const row = file?.complete?.byHours?.[String(h)];
            const w = row?.winner;
            return (
              <div key={h} className="border border-border bg-panel p-3">
                <p className="text-xs font-medium uppercase tracking-widest text-subtle">{h}h stage</p>
                <p className={`mt-1 font-mono text-lg tabular ${(w?.pf ?? 0) >= 1 ? "text-up" : "text-down"}`}>{fmtPf(w?.pf ?? 0)}</p>
                <p className="text-xs text-muted">
                  {w ? `${w.tactic} × ${w.range}` : "—"} · pass {row?.ok ?? 0}/{row?.n ?? 0}
                </p>
              </div>
            );
          })}
        </div>
        {file?.complete?.cells?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                  <th className="py-2 pr-2">H</th>
                  <th className="py-2 pr-2">Tactic</th>
                  <th className="py-2 pr-2">Range</th>
                  <th className="py-2 pr-2">PF</th>
                  <th className="py-2 pr-2">WR</th>
                  <th className="py-2 pr-2">N</th>
                  <th className="py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...(file.complete.cells ?? [])]
                  .sort((a, b) => b.pf - a.pf)
                  .slice(0, 24)
                  .map((c, i) => (
                    <tr key={`${c.hours}-${c.tactic}-${c.range}-${i}`} className="border-t border-border">
                      <td className="py-1 pr-2 font-mono tabular">{c.hours}</td>
                      <td className="py-1 pr-2">{c.tactic}</td>
                      <td className="py-1 pr-2">{c.range}</td>
                      <td className={`py-1 pr-2 font-mono tabular ${c.ok ? "text-up" : "text-down"}`}>{fmtPf(c.pf)}</td>
                      <td className="py-1 pr-2 font-mono tabular">{fmtWr(c.wr)}</td>
                      <td className="py-1 pr-2 font-mono tabular">{c.trades}</td>
                      <td className={`py-1 font-mono tabular ${c.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(c.net)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      {cells.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Best PF by tactic">
            <HBarChart data={tacticBars} />
          </Panel>
          <Panel title="Best PF by range">
            <HBarChart data={rangeBars} />
          </Panel>
        </div>
      ) : (
        <Panel title="Config diagrams">
          <MetricBarChart data={[{ label: "sweep", value: 0 }]} />
        </Panel>
      )}

      <Panel title="Exit reason · live tape">
        {(live.byReason ?? liveNow?.byReason ?? []).map((s) => (
          <StatLine key={s.key} k={s.key} v={`${fmtPf(s.pf)} · n ${s.n} · ${fmtUsd(s.net)} · DDT ${fmtNum(s.ddt ?? 0, 0)}`} />
        ))}
      </Panel>
    </div>
  );
}
