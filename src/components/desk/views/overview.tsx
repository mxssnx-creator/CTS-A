import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  bookStats,
  buildLanes,
  coordinate,
  DESK,
  heatmapForDesk,
  LAST_N_PROGRESS_META,
  posSliceStats,
  STRATEGIES,
  TACTIC_META,
  strategyAdjMod,
  volumeCoord,
  strategyMatchesKinds,
} from "@/lib/desk/engine";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { bookCounts, exchangeAsPositions, liveDeskBook, overallLiveStats, OVERVIEW_HOUR_NS, OVERVIEW_POS_NS, positionsAsTrades, tapeHourCurve, tapeWindowCurve, type LivePnlRow } from "@/lib/desk/vst";
import { fmtNum, fmtPct, fmtSigned, fmtUsd, fmtEquity } from "@/lib/utils";
import { EquityChart, MultiCurveChart } from "../charts";
import { CostHeatmap } from "../heatmap";
import { SessionProgress } from "../session-progress";
import { LiveExchangeStats, type LiveOverview } from "../live-exchange-stats";
import { Field, fmtMdd, fmtPf, fmtWr, Kpi, Panel, pfTone, Pill, Segmented, StatLine } from "../widgets";

export function OverviewView() {
  usePreserveScroll();
  const symbol = useDesk((s) => s.symbol);
  const strategyId = useDesk((s) => s.strategyId);
  const lastNs = useDesk((s) => s.lastNs);
  const overlayLastN = useDesk((s) => s.overlayLastN);
  const setOverlayLastN = useDesk((s) => s.setOverlayLastN);
  const costStep = useDesk((s) => s.costStep);
  const rangeType = useDesk((s) => s.rangeType);
  const tactic = useDesk((s) => s.tactic);
  const cfg = useDesk((s) => s.tacticConfig);
  const th = useDesk((s) => s.thresholds);
  const setCostStep = useDesk((s) => s.setCostStep);
  const setRangeType = useDesk((s) => s.setRangeType);
  const setTactic = useDesk((s) => s.setTactic);
  const setStrategy = useDesk((s) => s.setStrategy);
  const applyLive = useDesk((s) => s.applyLiveConfig);
  const params = useDesk((s) => s.strategyParams);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const vstTick = useDesk((s) => s.vst.tick);
  const vstCoord = useDesk((s) => s.vst.lastNCoord);
  const activeConnId = useDesk((s) => s.activeConnId);
  const liveSnap = useLiveSnapshot();
  const exchange = liveSnap.exchange;
  const session = liveSnap.session;
  const overallFile = liveSnap.overall;

  const adj = useMemo(() => {
    const st = STRATEGIES.find((s) => s.id === strategyId);
    return st ? strategyAdjMod(st, params) : { pf: 1, mdd: 1, wr: 1 };
  }, [strategyId, params]);

  const book = useMemo(
    () => bookStats(lastNs.lanes, cfg, th, undefined, enabledKinds),
    [lastNs.lanes, cfg, th, enabledKinds],
  );
  const [cells, setCells] = useState<ReturnType<typeof heatmapForDesk>>([]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        setCells(heatmapForDesk(strategyId, tactic, lastNs.combos, cfg, th, adj, 8));
      } catch {
        setCells([]);
      }
    }, 40);
    return () => window.clearTimeout(t);
  }, [strategyId, tactic, lastNs.combos, cfg, th, adj]);
  const lanes = useMemo(
    () => buildLanes(lastNs.lanes, cfg, th, undefined, enabledKinds).filter((l) => l.status !== "rejected").slice(0, 12),
    [lastNs.lanes, cfg, th, enabledKinds],
  );
  const live = liveDeskBook(useDesk.getState().vst, activeConnId, lastNs.last);
  void vstTick;
  const exPos = exchangeAsPositions(exchange);
  const lastPos = live.last;
  const ongoingPos = exPos.length ? exPos : live.ongoing;
  const next = live.ongoing.slice(0, lastNs.next);
  const liveTrades = positionsAsTrades(lastPos.length ? lastPos : ongoingPos);
  const vol = volumeCoord(liveTrades);
  const coord = coordinate(lastPos, ongoingPos, next, vol.vf, symbol);
  const lastSlice = posSliceStats(lastPos);
  const openSlice = posSliceStats(ongoingPos);
  const nextSlice = posSliceStats(next);
  const last = {
    pf: lastSlice.pf,
    net: lastSlice.net,
    wr: lastSlice.wr,
    expectancy: lastSlice.n ? lastSlice.net / lastSlice.n : 0,
    sqn: lastSlice.n > 1 ? lastSlice.pf * Math.sqrt(lastSlice.n) : 0,
    recovery: lastSlice.net >= 0 ? lastSlice.pf : 0,
    volumeFactor: vol.vf,
  };
  const eq = (() => {
    const closed = lastPos.length ? lastPos : ongoingPos;
    const base = (exchange?.equity ?? 0) - closed.reduce((s, p) => s + p.pnl, 0);
    let run = base;
    const pts = closed.map((p, i) => {
      run += p.pnl;
      return { i, eq: run };
    });
    return pts.length ? pts : [{ i: 0, eq: exchange?.equity ?? liveSnap.equity ?? 0 }];
  })();
  const stName = STRATEGIES.find((s) => s.id === strategyId)?.name ?? strategyId;
  const remoteOverall = (session?.overall as LiveOverview | undefined) ?? (overallFile?.live as LiveOverview | undefined);
  const overall = ((remoteOverall ?? (liveSnap.hasLive ? {} : overallLiveStats(useDesk.getState().vst))) ?? {}) as LiveOverview;
  const sweepCells = (overallFile?.sweep as { cells?: { ok?: boolean; pf?: number }[] } | undefined)?.cells ?? [];
  const validated = sweepCells.filter((c) => c.ok).length;
  const liveWin = overall?.hours?.["4"] ?? overall?.lastN?.["40"] ?? overall?.lastN?.["12"];
  const winnerPf = Number(
    (overallFile as { complete?: { winner?: { pf?: number } }; sweep?: { winner?: { pf?: number } } } | null)?.complete?.winner?.pf ??
      (overallFile as { sweep?: { winner?: { pf?: number } } } | null)?.sweep?.winner?.pf ??
      0,
  );
  const tapeN = Number(liveSnap.trades);
  const sessPf = tapeN > 0
    ? Number(liveSnap.pf || 0)
    : liveSnap.hasLive
      ? Number(liveSnap.pf || liveWin?.pf || 0)
      : winnerPf || Number(liveSnap.pf || liveWin?.pf || 0);
  const sessWr = tapeN > 0 ? Number(liveSnap.wr) : Number(liveWin?.wr ?? liveSnap.wr);
  const sessNet = Number(liveSnap.net);
  const sessTrades = tapeN;
  const closedPf = tapeN > 0
    ? Number(overall?.overall?.pf ?? overall?.pf ?? sessPf)
    : liveSnap.hasLive
      ? Number(overall?.overall?.pf ?? overall?.pf ?? sessPf)
      : winnerPf || sessPf;
  const closedWr = Number(overall?.overall?.wr ?? overall?.wr ?? sessWr);
  const closedNet = Number(overall?.overall?.net ?? overall?.net ?? sessNet);
  const closedN = tapeN;
  const tape = ((session?.tape as LivePnlRow[] | undefined) ?? []).filter((r) => Number.isFinite(Number(r.v)));
  const overlayN = overlayLastN;
  const overlayBucket = overall.lastN?.[String(overlayN)];
  const overlayPf = Number(overlayBucket?.pf ?? closedPf);
  const overlayWr = Number(overlayBucket?.wr ?? closedWr);
  const overlayNet = Number(overlayBucket?.net ?? closedNet);
  const overlayDdt = Number(overlayBucket?.ddt ?? overall.ddt ?? 0);
  const overlayMdd = Number(overlayBucket?.mdd ?? overall.mdd ?? 0);
  const posCurves = useMemo(() => {
    if (!tape.length) return Object.fromEntries(OVERVIEW_POS_NS.map((n) => [String(n), []] as const));
    return Object.fromEntries(OVERVIEW_POS_NS.map((n) => [String(n), tapeWindowCurve(tape, n)]));
  }, [tape]);
  const hourCurves = useMemo(() => {
    if (!tape.length) return Object.fromEntries(OVERVIEW_HOUR_NS.map((h) => [String(h), []] as const));
    return Object.fromEntries(OVERVIEW_HOUR_NS.map((h) => [String(h), tapeHourCurve(tape, h)]));
  }, [tape]);
  const overlayCurve = posCurves[String(overlayN)] ?? [];
  const overlayVol = overlayCurve.length ? overlayCurve[overlayCurve.length - 1]!.vol : 0;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <SessionProgress book={book} />

      <Panel title="Progress last-N">
        <p className="text-sm text-muted">
          Settings grid stays full. Live execute uses coordinated windows, types and combinations that actually pass — not a full parallel sweep.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          {LAST_N_PROGRESS_META.map((st) => {
            const b = overall.lastN?.[String(st.n)];
            const coord = vstCoord;
            const active =
              st.id === "eval" ? coord?.evalNs : st.id === "valid" ? coord?.validNs : coord?.disableNs;
            return (
              <Kpi
                key={st.id}
                label={`${st.label} N${st.n}`}
                value={fmtPf(b?.pf ?? 0)}
                tone={pfTone(b?.pf ?? 0)}
                hint={active?.length ? `active ${active.join("/")} · ${b?.n ?? 0} closes` : `${b?.n ?? 0} closes`}
              />
            );
          })}
        </div>
        {vstCoord ? (
          <div className="mt-3 flex flex-wrap gap-1">
            <Pill tone={vstCoord.independent || vstCoord.combined ? "up" : "neutral"}>{vstCoord.mode}</Pill>
            {vstCoord.stack > 1 ? <Pill tone="accent">stack ×{vstCoord.stack.toFixed(2)}</Pill> : null}
            {vstCoord.activeInds.slice(0, 6).map((id) => (
              <Pill key={`i${id}`} tone="up">
                {id}
              </Pill>
            ))}
            {vstCoord.activeTacs.slice(0, 4).map((id) => (
              <Pill key={`t${id}`}>{id}</Pill>
            ))}
            {vstCoord.activePlays.slice(0, 4).map((id) => (
              <Pill key={`p${id}`}>{id}</Pill>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title="Overall last positions">
        <p className="text-sm text-muted">
          Overlay uses BingX realized closes (newest first). Header quote is {symbol} only.
        </p>
        <div className="mt-3">
          <Segmented
            value={String(overlayN)}
            onChange={(v) => setOverlayLastN(Number(v) as 12 | 40 | 120 | 650)}
            options={OVERVIEW_POS_NS.map((n) => ({ id: String(n), label: `N${n}` }))}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label={`Last ${overlayN} PF`} value={fmtPf(overlayPf)} tone={pfTone(overlayPf)} hint={`${overlayBucket?.n ?? 0} closes`} />
          <Kpi label="Win rate" value={fmtWr(overlayWr)} hint={`${overlayBucket?.wins ?? 0} wins`} />
          <Kpi label="Net" value={fmtUsd(overlayNet)} tone={overlayNet >= 0 ? "up" : "down"} />
          <Kpi label="DDT" value={fmtNum(overlayDdt, 0)} hint={`MDD ${fmtMdd(overlayMdd)}`} />
          <Kpi label="Volume |PnL|" value={fmtUsd(overlayVol)} hint="realized abs" />
          <Kpi label="Book" value={`${liveSnap.livePos} pos`} hint={`${liveSnap.liveOrd} ord`} tone="accent" />
        </div>
      </Panel>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">Command</p>
          <h1 className="text-2xl font-semibold tracking-tight">Strategy desk</h1>
        </div>
        <p className="max-w-md text-sm text-muted">
          Independent combinations across cost 3–30 for all symbols. Listings and stats are the full book.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Live PF" value={fmtPf(sessPf)} tone={pfTone(sessPf)} hint={tapeN > 0 ? `${tapeN} tape closes` : "independent compute"} />
        <Kpi label="Win rate" value={fmtWr(sessWr)} hint={`${liveSnap.livePos} open`} />
        <Kpi label="Net" value={fmtUsd(sessNet)} tone={sessNet >= 0 ? "up" : "down"} />
        <Kpi label="Closed PF" value={fmtPf(closedPf)} tone={closedPf >= th.minPf ? "up" : closedPf < 1 ? "down" : "accent"} hint={`${closedN} tape closes`} />
        <Kpi label="Overlay PF" value={fmtPf(overlayPf)} tone={pfTone(overlayPf)} hint={`last ${overlayN}`} />
        <Kpi label="Exchange pos" value={String(liveSnap.livePos)} tone="accent" hint={`${liveSnap.liveOrd} orders`} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        <Kpi
          label="BingX equity"
          value={liveSnap.equity ? fmtEquity(liveSnap.equity) : "—"}
          hint={liveSnap.pingOk ? `${liveSnap.latencyMs || "ok"} · ${activeConnId}` : "connecting"}
          tone={liveSnap.pingOk ? "up" : "neutral"}
        />
        <Kpi label="Exchange pos" value={String(liveSnap.livePos)} hint="At BingX" />
        <Kpi label="Exchange orders" value={String(liveSnap.liveOrd)} />
        <Kpi label="Session PF" value={fmtPf(sessPf)} hint={`${sessTrades} all`} tone={pfTone(sessPf)} />
        <Kpi label="Tape PF" value={fmtPf(closedPf)} hint={`${closedN} closed`} tone={pfTone(closedPf)} />
      </div>

      {session ? (
        <Panel title={`${liveSnap.venueLabel} session`}>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <StatLine k="Tactic / range" v={`${String(session.tactic ?? "—")} · ${String(session.range ?? "—")}`} />
            <StatLine k="Elapsed" v={`${Number(session.elapsedMin ?? 0).toFixed(1)} min`} />
            <StatLine k="PF / WR" v={`${fmtPf(Number(session.pf))} · ${fmtWr(Number(session.wr))}`} />
            <StatLine k="Net" v={fmtUsd(Number(session.net))} tone={Number(session.net) >= 0 ? "up" : "down"} />
            <StatLine k="Slots" v={`${session.slots ?? 0} · ${session.liveOrders ?? 0} orders`} />
            <StatLine k="Ping" v={session.pingOk ? "ok" : "down"} tone={session.pingOk ? "up" : "down"} />
            <StatLine k="Exchange book" v={`${session.livePos ?? "—"} pos · ${session.liveOrd ?? "—"} ord`} />
            <StatLine k="Positive" v={session.positive ? "yes" : "building"} />
            <StatLine k="Last" v={String(session.lastMsg ?? "—")} />
          </div>
        </Panel>
      ) : null}

      <VstStrip />

      <LiveExchangeStats
        live={overall}
        session={session}
        validated={validated}
        exchangePos={liveSnap.livePos}
        exchangeOrd={liveSnap.liveOrd}
        avgLivePos={Number(session?.avgLivePos ?? overall.avgPositions ?? liveSnap.livePos)}
        avgLiveOrd={Number(session?.avgLiveOrd ?? overall.avgOrders ?? liveSnap.liveOrd)}
      />

      <Panel title="Windows · PF / DDT / volume / drawdown">
        <p className="text-sm text-muted">
          Last 12 / 40 / 120 / 650 closes and last 2 / 6 / 12 / 45 hours from BingX realized PnL. Curves: equity, |PnL| volume, rolling PF, drawdown.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                <th className="py-1 pr-2">Window</th>
                <th className="py-1 pr-2">N</th>
                <th className="py-1 pr-2">PF</th>
                <th className="py-1 pr-2">WR</th>
                <th className="py-1 pr-2">DDT</th>
                <th className="py-1 pr-2">MDD</th>
                <th className="py-1 pr-2">Volume</th>
                <th className="py-1">Net</th>
              </tr>
            </thead>
            <tbody>
              {OVERVIEW_POS_NS.map((n) => {
                const b = overall.lastN?.[String(n)];
                const c = posCurves[String(n)] ?? [];
                const vol = c.length ? c[c.length - 1]!.vol : 0;
                const on = n === overlayN;
                return (
                  <tr
                    key={`n${n}`}
                    className={`cursor-pointer border-t border-border ${on ? "bg-primary-soft" : ""}`}
                    onClick={() => setOverlayLastN(n)}
                  >
                    <td className="py-1 pr-2 font-medium">Last {n}</td>
                    <td className="py-1 pr-2 font-mono tabular">{b?.n ?? c.length}</td>
                    <td className={`py-1 pr-2 font-mono tabular ${(b?.pf ?? 0) >= 1 ? "text-up" : b?.n ? "text-down" : ""}`}>{fmtPf(b?.pf ?? 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtWr(b?.wr ?? 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtNum(b?.ddt ?? 0, 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtMdd(b?.mdd ?? 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtUsd(vol)}</td>
                    <td className={`py-1 font-mono tabular ${(b?.net ?? 0) >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(b?.net ?? 0)}</td>
                  </tr>
                );
              })}
              {OVERVIEW_HOUR_NS.map((h) => {
                const b = overall.hours?.[String(h)];
                const c = hourCurves[String(h)] ?? [];
                const vol = c.length ? c[c.length - 1]!.vol : 0;
                return (
                  <tr key={`h${h}`} className="border-t border-border">
                    <td className="py-1 pr-2 font-medium">{h}h</td>
                    <td className="py-1 pr-2 font-mono tabular">{b?.n ?? c.length}</td>
                    <td className={`py-1 pr-2 font-mono tabular ${(b?.pf ?? 0) >= 1 ? "text-up" : b?.n ? "text-down" : ""}`}>{fmtPf(b?.pf ?? 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtWr(b?.wr ?? 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtNum(b?.ddt ?? 0, 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtMdd(b?.mdd ?? 0)}</td>
                    <td className="py-1 pr-2 font-mono tabular">{fmtUsd(vol)}</td>
                    <td className={`py-1 font-mono tabular ${(b?.net ?? 0) >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(b?.net ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-widest text-subtle">Last {overlayN} · equity / volume / PF / DD</div>
            <MultiCurveChart data={overlayCurve} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-widest text-subtle">Last 6h · equity / volume / PF / DD</div>
            <MultiCurveChart data={hourCurves["6"] ?? []} />
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {OVERVIEW_POS_NS.map((n) => (
            <div key={`c${n}`}>
              <div className="mb-1 text-xs font-medium uppercase tracking-widest text-subtle">N{n}</div>
              <MultiCurveChart data={posCurves[String(n)] ?? []} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {OVERVIEW_HOUR_NS.map((h) => (
            <div key={`ch${h}`}>
              <div className="mb-1 text-xs font-medium uppercase tracking-widest text-subtle">{h}h</div>
              <MultiCurveChart data={hourCurves[String(h)] ?? []} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Overall tape · ${overall.symbols ?? 50} symbols`}>
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Closed PF" v={fmtPf(closedPf)} />
          <StatLine k="Closed WR" v={fmtWr(closedWr)} />
          <StatLine k="Net" v={fmtUsd(closedNet)} tone={closedNet >= 0 ? "up" : "down"} />
          <StatLine k="Occupied" v={`${liveSnap.occupied || overall.occupied || 0} / ${overall.symbols ?? liveSnap.session?.symbols ?? 50}`} />
          <StatLine k="Legs" v={`${liveSnap.livePos || overall.slots || 0} · ${liveSnap.liveLong}L/${liveSnap.liveShort}S`} />
        </div>
        {overall.byPlaybook?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {overall.byPlaybook.map((r) => (
              <Pill key={r.key} tone={r.pf >= 1 ? "up" : r.n ? "down" : "neutral"}>
                {r.key} n={r.n} PF {fmtPf(r.pf)}
              </Pill>
            ))}
          </div>
        ) : null}
        {overall.bySymbol?.length ? (
          <div className="mt-3 max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                  <th className="py-1 pr-2">Symbol</th>
                  <th className="py-1 pr-2">N</th>
                  <th className="py-1 pr-2">PF</th>
                  <th className="py-1">Net</th>
                </tr>
              </thead>
              <tbody>
                {overall.bySymbol.map((s) => (
                  <tr key={s.key} className="border-t border-border">
                    <td className="py-1 pr-2 font-medium">{s.key}</td>
                    <td className="py-1 pr-2 font-mono tabular">{s.n}</td>
                    <td className={`py-1 pr-2 font-mono tabular ${s.pf >= 1 ? "text-up" : "text-down"}`}>{fmtPf(s.pf)}</td>
                    <td className={`py-1 font-mono tabular ${s.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(s.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No closed trades yet on the live tape.</p>
        )}
      </Panel>

      {liveSnap.hasLive ? (
        <Panel title={`Exchange book · ${activeConnId}`}>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <StatLine k="Equity" v={liveSnap.equity ? fmtEquity(liveSnap.equity) : "—"} />
            <StatLine k="Positions" v={String(liveSnap.livePos)} />
            <StatLine k="Open orders" v={String(liveSnap.liveOrd)} />
            <StatLine k="Ping" v={liveSnap.pingOk ? `${liveSnap.latencyMs || "ok"}` : "connecting"} />
          </div>
          {exchange?.positions?.length ? (
            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                    <th className="py-1 pr-2">Symbol</th>
                    <th className="py-1 pr-2">Side</th>
                    <th className="py-1 pr-2">Qty</th>
                    <th className="py-1 pr-2">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {exchange.positions.map((p) => (
                    <tr key={`${p.symbol}:${p.side}`} className="border-t border-border">
                      <td className="py-1 pr-2 font-medium">{p.symbol}</td>
                      <td className="py-1 pr-2">{p.side}</td>
                      <td className="py-1 pr-2 font-mono tabular">{fmtNum(p.qty, 4)}</td>
                      <td className={`py-1 pr-2 font-mono tabular ${p.pnl >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(p.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {liveSnap.livePos
                ? `${liveSnap.livePos} open positions on ${liveSnap.venueLabel}.`
                : "Account live. No open BingX positions right now."}
            </p>
          )}
        </Panel>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Panel title={`Last ${overlayN} overlay`}>
          <StatLine k="Count" v={String(overlayBucket?.n ?? overlayCurve.length)} />
          <StatLine k="PF" v={fmtPf(overlayPf)} tone={pfTone(overlayPf)} />
          <StatLine k="Net" v={fmtUsd(overlayNet)} tone={overlayNet >= 0 ? "up" : "down"} />
        </Panel>
        <Panel title={`Ongoing · N${lastNs.ongoing}`}>
          <StatLine k="Open" v={String(openSlice.n)} />
          <StatLine k="Mark PF" v={fmtPf(openSlice.pf)} tone={pfTone(openSlice.pf)} />
          <StatLine k="Unrealized" v={fmtUsd(openSlice.net)} tone={openSlice.net >= 0 ? "up" : "down"} />
        </Panel>
        <Panel title={`Next · N${lastNs.next}`}>
          <StatLine k="Projected" v={String(next.length)} />
          <StatLine k="Expectancy" v={fmtUsd(nextSlice.net)} />
          <StatLine k="Recommend" v={coord.recommend} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title={`Equity · last ${overlayN} closes`}
          action={
            <select
              aria-label="Strategy"
              className="h-8 border border-border bg-surface px-2 text-xs"
              value={strategyId}
              onChange={(e) => setStrategy(e.target.value)}
            >
              {DESK.strategies
                .filter((s) => strategyMatchesKinds(s, enabledKinds))
                .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          }
        >
          <EquityChart data={overlayCurve.length ? overlayCurve.map((p) => ({ i: p.i, eq: p.eq })) : eq} />
        </Panel>
        <Panel className="xl:col-span-2" title={`Last ${lastNs.picks} evals`}>
          <StatLine k="PF" v={fmtPf(last.pf)} tone={pfTone(last.pf)} />
          <StatLine k="Net" v={fmtUsd(last.net)} tone={last.net >= 0 ? "up" : "down"} />
          <StatLine k="Win rate" v={fmtWr(last.wr)} />
          <StatLine k="Expectancy" v={fmtUsd(last.expectancy)} />
          <StatLine k="SQN" v={fmtNum(last.sqn, 2)} />
          <StatLine k="Volume factor" v={fmtNum(vol.vf, 2)} />
          <StatLine k="Recovery" v={fmtNum(last.recovery, 2)} />
          <div className="mt-3 border-t border-border pt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-subtle">Coordination</div>
            <p className="mt-1 text-sm text-fg">{coord.reason}</p>
            <p className="mt-1 text-sm text-muted">{vol.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone={coord.aligned ? "up" : "neutral"}>{coord.aligned ? "Aligned" : "Mixed"}</Pill>
              <Pill tone={coord.conflict ? "down" : "neutral"}>
                {coord.conflict ? "Conflict" : "No conflict"}
              </Pill>
              <Pill tone={vol.confirm === "confirm" ? "up" : vol.confirm === "diverge" ? "down" : "accent"}>
                Vol {vol.confirm}
              </Pill>
              <Pill tone="accent">{coord.recommend}</Pill>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Cost × range heatmap (research eval)"
        action={<span className="text-xs text-muted">{TACTIC_META[tactic].label} tactic</span>}
      >
        <CostHeatmap
          cells={cells}
          costStep={costStep}
          rangeType={rangeType}
          onSelect={(c, r) => {
            setCostStep(c);
            setRangeType(r);
            applyLive();
          }}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ongoing validated lanes" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-lg text-left text-sm">
              <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Lane</th>
                  <th className="px-2 py-2">Tactic</th>
                  <th className="px-2 py-2">PF</th>
                  <th className="px-2 py-2">Last N</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {lanes.map((l) => (
                  <tr
                    key={l.id}
                    className="cursor-pointer border-t border-border hover:bg-surface-muted"
                    onClick={() => {
                      setStrategy(l.strategyId);
                      setTactic(l.tactic);
                      setCostStep(l.costStep);
                      setRangeType(l.rangeType);
                      applyLive();
                    }}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">{l.strategyName}</div>
                      <div className="text-xs text-muted">{l.symbol}</div>
                    </td>
                    <td className="px-2 py-2">{TACTIC_META[l.tactic].label}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtPf(l.pf)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtPf(l.lastNPf)}</td>
                    <td className="px-2 py-2">
                      <Pill tone={l.status === "validated" ? "up" : "accent"}>{l.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-3">
            <Link to="/lanes" className="text-sm font-medium text-primary hover:underline">
              Open lane board
            </Link>
          </div>
        </Panel>
        <Panel title="Volume coordination">
          <StatLine k="High-vol WR" v={fmtWr(vol.highVolWr)} tone={vol.highVolWr >= vol.lowVolWr ? "up" : "down"} />
          <StatLine k="Low-vol WR" v={fmtWr(vol.lowVolWr)} />
          <StatLine k="High-vol net" v={fmtUsd(vol.highVolNet)} tone={vol.highVolNet >= 0 ? "up" : "down"} />
          <StatLine k="Low-vol net" v={fmtUsd(vol.lowVolNet)} tone={vol.lowVolNet >= 0 ? "up" : "down"} />
          <StatLine k="Heat" v={fmtPct(coord.heat, 0).replace("+", "")} />
          <StatLine k="Positive combo tracks" v={fmtNum(book.positiveCombos, 0)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Field label="Threshold PF">
              <span className="font-mono text-sm tabular">{fmtNum(th.minPf, 2)}</span>
            </Field>
            <Field label="Min VF">
              <span className="font-mono text-sm tabular">{fmtNum(th.minVf, 2)}</span>
            </Field>
            <Field label="Max DD">
              <span className="font-mono text-sm tabular">{fmtPct(-th.maxMdd, 0)}</span>
            </Field>
            <Field label="Max DDT">
              <span className="font-mono text-sm tabular">{th.maxDdt} bars</span>
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted">
            Last closed {fmtSigned(coord.lastNet)} · ongoing {fmtSigned(coord.ongoingNet)}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function VstStrip() {
  const live = useLiveSnapshot();
  const tpRatio = useDesk((s) => s.tacticConfig.tpRatio);
  return (
    <Panel
      title="BingX VST ×02"
      action={
        <Link to="/engine" className="text-sm font-medium text-primary hover:underline">
          Open engine
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        <StatLine k="Equity" v={live.equity ? fmtUsd(live.equity, 0) : "—"} tone={live.pingOk ? "up" : "neutral"} />
        <StatLine k="Live PF" v={fmtPf(live.pf)} tone={pfTone(live.pf)} />
        <StatLine k="Exchange pos" v={String(live.livePos)} />
        <StatLine k="Exchange orders" v={`${live.liveOrd} · SL ${live.liveSl} · TP ${live.liveTp}`} />
        <StatLine k="Closed" v={`${live.trades} · WR ${fmtWr(live.wr)}`} />
        <StatLine k="Tactic" v={`${live.tactic} · ${live.range}`} />
        <StatLine k="Ping" v={live.pingOk ? "ok" : "connecting"} tone={live.pingOk ? "up" : "neutral"} />
        <StatLine k="TP / SL" v={`${tpRatio.toFixed(2)}R`} />
      </div>
      <p className="mt-3 text-xs text-muted">{live.lastMsg}</p>
    </Panel>
  );
}
