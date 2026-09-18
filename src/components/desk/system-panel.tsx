import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot } from "@/lib/desk/live-ctx";
import {
  LAST_N_STAGE_META,
  ORDER_TYPES,
  RANGE_META,
  TACTIC_META,
  symbolIndications,
} from "@/lib/desk/engine";
import {
  TICKS_PER_HOUR,
  VST_BATCH_SIZE,
  VST_MAX_POSITIONS,
  VST_MAX_SYMBOLS,
  VST_RATE_BURST,
  VST_RATE_PER_SEC,
  VST_TICK_MS,
  systemSnapshot,
} from "@/lib/desk/vst";
import { MAX_LIVE_NOTIONAL } from "@/lib/desk/feed";
import { fmtEquity, fmtUsd } from "@/lib/utils";
import { fmtMdd, fmtPf, fmtWr, Kpi, Meter, Panel, pfTone, Pill, StatLine } from "./widgets";

export function SystemPanel({
  combos,
  lanes,
}: {
  combos?: { total: number; positive: number };
  lanes?: { validated: number; candidates: number };
}) {
  const _beat = useDesk((s) => `${s.vst.phase}:${(s.vst.tick / 2) | 0}:${s.vst.stats.trades}`);
  void _beat;
  const vst = useDesk.getState().vst;
  const feed = useDesk((s) => s.feed);
  const liveTape = useDesk((s) => s.liveTape);
  const connections = useDesk((s) => s.connections);
  const tactic = useDesk((s) => s.tactic);
  const rangeType = useDesk((s) => s.rangeType);
  const costStep = useDesk((s) => s.costStep);
  const lastN = useDesk((s) => s.lastN);
  const lastNs = useDesk((s) => s.lastNs);
  const lastNLinked = useDesk((s) => s.lastNLinked);
  const th = useDesk((s) => s.thresholds);
  const activeConnId = useDesk((s) => s.activeConnId);
  const cfg = useDesk((s) => s.tacticConfig);
  const symbolCount = useDesk((s) => s.symbolCount);
  const orderType = useDesk((s) => s.orderType);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const settingsRev = useDesk((s) => s.settingsRev);
  const settingsSource = useDesk((s) => s.settingsSource);
  const symbol = useDesk((s) => s.symbol);
  const liveSnap = useLiveSnapshot();
  const ind = symbolIndications(symbol);

  const snap = systemSnapshot(vst, {
    combos,
    feed,
    connections,
  });
  const st = vst.stats;
  const ledger = vst.ledger;
  const sim = vst.sim;
  const phase = vst.phase;
  const ratePct = snap.rateMax ? snap.rateUsed / snap.rateMax : 0;
  const slotPct = snap.book.positions.maxSlots ? snap.book.positions.slots / snap.book.positions.maxSlots : 0;
  const health =
    liveSnap.hasLive
      ? liveSnap.pingOk
        ? "ok"
        : "warn"
      : phase === "stopped" || feed.state === "error"
        ? "down"
        : phase === "paused" || feed.state === "stale" || ratePct > 0.85 || slotPct > 0.85
          ? "warn"
          : phase === "running"
            ? "ok"
            : "idle";
  const healthTone = health === "ok" ? "up" : health === "down" ? "down" : health === "warn" ? "warn" : "accent";
  const orderLabel = ORDER_TYPES.find((o) => o.id === orderType)?.label ?? orderType;
  const connected = connections.filter((c) => c.status === "connected").length;
  const armed = connections.filter((c) => c.armed).length;

  return (
    <Panel
      title="System"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={healthTone}>{liveSnap.hasLive ? "live" : health}</Pill>
          <Pill tone={liveSnap.hasLive || phase === "running" ? "up" : phase === "paused" ? "warn" : "accent"}>
            {liveSnap.hasLive ? "BingX VST-02" : phase}
          </Pill>
          <Pill tone={liveSnap.pingOk || feed.state === "live" ? "up" : feed.state === "error" ? "down" : "accent"}>
            tape {liveSnap.hasLive ? "live" : liveTape ? feed.state : "off"}
          </Pill>
        </div>
      }
    >
      <p className="text-sm text-muted">{liveSnap.hasLive ? liveSnap.lastMsg : vst.lastMsg}</p>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-widest text-subtle">Stats</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Equity" value={fmtEquity(liveSnap.hasLive ? liveSnap.equity : st.equity)} tone={(liveSnap.hasLive ? liveSnap.net : st.net) >= 0 ? "up" : "down"} hint={`${liveSnap.hasLive ? liveSnap.trades : st.trades} closed`} />
        <Kpi label="Live PF" value={fmtPf(liveSnap.hasLive ? liveSnap.pf : st.pf)} tone={pfTone(liveSnap.hasLive ? liveSnap.pf : st.pf)} hint={fmtWr(liveSnap.hasLive ? liveSnap.wr : st.wr)} />
        <Kpi
          label="Slots"
          value={liveSnap.hasLive ? String(liveSnap.livePos) : `${snap.book.positions.slots}/${snap.book.positions.maxSlots}`}
          hint={liveSnap.hasLive ? `${liveSnap.occupied} occupied` : `${snap.book.positions.long}L · ${snap.book.positions.short}S`}
        />
        <Kpi
          label="Orders placed"
          value={String(liveSnap.hasLive ? liveSnap.liveOrd : snap.book.orders.placed)}
          hint={liveSnap.hasLive ? `SL ${liveSnap.liveSl} · TP ${liveSnap.liveTp}` : `${snap.book.orders.filled}f · ${snap.book.orders.live} live`}
        />
        <Kpi label="SL / TP" value={`${liveSnap.hasLive ? liveSnap.liveSl : ledger.slExits} / ${liveSnap.hasLive ? liveSnap.liveTp : ledger.tpExits}`} hint={`streak ${ledger.winStreak}`} />
        <Kpi label="Net" value={fmtUsd(liveSnap.hasLive ? liveSnap.net : st.net, 0)} tone={(liveSnap.hasLive ? liveSnap.net : st.net) >= 0 ? "up" : "down"} hint={fmtMdd(liveSnap.hasLive ? liveSnap.mdd : st.mdd)} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3 xl:grid-cols-4">
        <StatLine k="Win rate" v={fmtWr(liveSnap.hasLive ? liveSnap.wr : st.wr)} />
        <StatLine k="Max DD" v={fmtMdd(liveSnap.hasLive ? liveSnap.mdd : st.mdd)} />
        <StatLine k="Peak equity" v={fmtUsd(liveSnap.hasLive && liveSnap.equity ? liveSnap.equity : ledger.peak, 0)} />
        <StatLine k="Profit / loss" v={liveSnap.hasLive ? fmtUsd(liveSnap.net) : `${fmtUsd(ledger.profit)} / ${fmtUsd(ledger.loss)}`} />
        <StatLine k="Wins / trades" v={`${ledger.wins} / ${ledger.trades}`} />
        <StatLine k="Win streak" v={`${ledger.winStreak} · max ${ledger.maxWinStreak}`} />
        <StatLine k="Loss streak" v={`${ledger.lossStreak} · max ${ledger.maxLossStreak}`} />
        <StatLine k="Cap rejects" v={String(ledger.capRejects)} />
        <StatLine k="Rate skips" v={String(ledger.rateSkips)} />
        <StatLine k="Fills taped" v={String(snap.fills)} />
        <StatLine k="Closed taped" v={String(snap.closed)} />
        <StatLine k="Batches" v={String(snap.batches)} />
        <StatLine k="Queued" v={String(snap.book.orders.queued)} />
        <StatLine k="Open / partial" v={`${snap.book.orders.open} / ${snap.book.orders.partial}`} />
        <StatLine k="Filled / cancelled / rejected" v={`${snap.book.orders.filled} / ${snap.book.orders.cancelled} / ${snap.book.orders.rejected}`} />
        <StatLine k="Peak legs / orders" v={`${ledger.maxPositions} / ${ledger.maxOrders}`} />
        {lanes ? <StatLine k="Lanes" v={`${lanes.validated} val · ${lanes.candidates} cand`} /> : null}
        {sim ? (
          <StatLine k="Last sim" v={`${sim.hours}h · PF ${fmtPf(sim.pf)} · ${sim.trades} tr`} tone={sim.passed ? "up" : "down"} />
        ) : (
          <StatLine k="Last sim" v="none" />
        )}
      </div>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-widest text-subtle">Infos</h3>
      <div className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-3 xl:grid-cols-4">
        <StatLine k="Engine" v={liveSnap.hasLive ? `host · ${liveSnap.elapsedMin.toFixed(1)} min` : `${phase} · tick ${vst.tick} · ${snap.clock}`} />
        <StatLine k="Universe" v={`${symbolCount} / ${VST_MAX_SYMBOLS} · ${orderLabel}`} />
        <StatLine k="Tactic / range" v={`${TACTIC_META[tactic].label} · ${RANGE_META[rangeType].label}`} />
        <StatLine k="Settings sync" v={`${settingsSource} · rev ${settingsRev}`} />
        <StatLine k="Cost step" v={String(costStep)} />
        <StatLine k="Last N" v={lastNLinked ? `linked N${lastN}` : LAST_N_STAGE_META.map((s) => `${s.id} N${lastNs[s.id]}`).join(" · ")} />
        <StatLine k="Types on" v={enabledKinds.join(" · ")} />
        <StatLine k="Min PF / VF" v={`${th.minPf.toFixed(2)} / ${th.minVf.toFixed(2)}`} />
        <StatLine k="Max DD / DDT" v={`${(th.maxMdd * 100).toFixed(0)}% / ${th.maxDdt} bars`} />
        <StatLine k="Min WR" v={fmtWr(th.minWr)} />
        <StatLine k="Trailing / DCA" v={`${cfg.trailingPct.toFixed(1)}% · ${cfg.dcaCount}×${cfg.dcaDrawdown.toFixed(1)}`} />
        <StatLine k="Axis" v={`${cfg.axisLevels} × ${cfg.axisSpacing.toFixed(1)}`} />
        <StatLine k="Stop / TP" v={`ATR ${cfg.slAtr.toFixed(2)} · TP/SL ${cfg.tpRatio.toFixed(2)}R`} />
        <StatLine
          k="Indications"
          v={`T ${ind.trend.toFixed(2)} · B ${ind.break.toFixed(2)} · A ${ind.active.toFixed(2)} · D ${ind.direction.toFixed(2)}`}
        />
        <StatLine k="Activity / HF" v={`${ind.activity.toFixed(2)} · ${ind.hf ? "HF" : "calm"} · agree ${ind.agree ? "yes" : "no"}`} />
        <StatLine k="Timing / hits" v={`${ind.timing.toFixed(2)} · ${ind.hits} hits`} />
        <StatLine k="Tick" v={`${VST_TICK_MS} ms · ${TICKS_PER_HOUR} ticks/h`} />
        <StatLine k="Batch / rate" v={`${VST_BATCH_SIZE} · ${VST_RATE_PER_SEC}/s burst ${VST_RATE_BURST}`} />
        <StatLine k="Caps" v={`${VST_MAX_SYMBOLS} sym · ${VST_MAX_POSITIONS} legs · unlimited orders`} />
        <StatLine k="Live notional" v={fmtUsd(MAX_LIVE_NOTIONAL, 0)} />
        <StatLine k="Tape" v={`${liveTape ? "BingX live" : "off"} · ${feed.count} px · ${feed.latencyMs} ms`} />
        <StatLine k="Tape missing" v={String(feed.missing)} />
        <StatLine k="Heals" v={`${vst.healCount ?? 0}${vst.lastHeal ? ` · ${vst.lastHeal}` : ""}`} />
        <StatLine k="Current session" v={activeConnId} />
        <StatLine k="Sessions" v={`${connected}/${connections.length} connected · ${armed} armed`} />
        {connections.map((c) => (
          <StatLine
            key={c.id}
            k={c.label}
            v={`${c.network} · ${c.status} · ${c.lastPingMs} ms · rate ${c.rateLimitUsed}/${c.rateLimitMax}`}
          />
        ))}
      </div>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-widest text-subtle">Loads</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snap.loads.map((row) => {
          if (liveSnap.hasLive && row.id === "symbols") {
            const n = liveSnap.occupied || liveSnap.livePos;
            const max = Number(liveSnap.session?.symbols) || symbolCount || 50;
            return <Meter key={row.id} label="Occupied symbols" value={n} max={max} hint={`${n}/${max}`} />;
          }
          if (liveSnap.hasLive && row.id === "slots") {
            return <Meter key={row.id} label={row.label} value={liveSnap.livePos} max={row.max} hint={`${liveSnap.livePos} BingX · ${liveSnap.occupied} occupied`} />;
          }
          if (liveSnap.hasLive && row.id === "orders") {
            return (
              <Meter
                key={row.id}
                label="Order pipeline"
                value={liveSnap.liveOrd}
                max={Math.max(liveSnap.liveOrd, 1)}
                hint={`${liveSnap.liveOrd} open · SL ${liveSnap.liveSl} TP ${liveSnap.liveTp}`}
              />
            );
          }
          if (liveSnap.hasLive && row.id === "legs") {
            return (
              <Meter
                key={row.id}
                label="Position legs"
                value={liveSnap.livePos}
                max={row.max}
                hint={`${liveSnap.livePos}/${row.max} · ${liveSnap.liveLong}L ${liveSnap.liveShort}S`}
              />
            );
          }
          return <Meter key={row.id} label={row.label} value={row.value} max={row.max} hint={row.hint} />;
        })}
      </div>
    </Panel>
  );
}
