import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { SystemPanel } from "../system-panel";
import { LiveBookStrip } from "../live-book-strip";
import { Panel, StatLine } from "../widgets";
import { fmtEquity } from "@/lib/utils";

export function SystemView() {
  usePreserveScroll();
  const live = useLiveSnapshot();
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Host</p>
        <h1 className="text-2xl font-semibold tracking-tight">System</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {live.venueLabel} · {live.network} · live loads, session and book.
        </p>
      </div>
      <LiveBookStrip />
      <Panel title="Live connection">
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Conn" v={live.conn || "—"} />
          <StatLine k="Network" v={live.network || "—"} />
          <StatLine k="Equity" v={fmtEquity(live.equity)} />
          <StatLine k="Ping" v={live.pingOk ? "ok" : "down"} tone={live.pingOk ? "up" : "down"} />
          <StatLine k="Occupied" v={`${live.occupied}`} />
          <StatLine k="Legs" v={`${live.livePos}`} />
          <StatLine k="SL / TP" v={`${live.liveSl} / ${live.liveTp}`} />
          <StatLine k="Phase" v={String(live.session?.phase ?? live.session?.sessionPhase ?? "—")} />
        </div>
      </Panel>
      <SystemPanel />
    </div>
  );
}
