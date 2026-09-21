import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { SystemPanel } from "../system-panel";
import { LiveBookStrip } from "../live-book-strip";
import { pickLiveOverview, type LiveOverview } from "../live-exchange-stats";
import { Panel, StatLine } from "../widgets";
import { fmtEquity, fmtNum } from "@/lib/utils";

function stamp(ms: number) {
  if (!(ms > 1e12)) return "—";
  try {
    return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
  } catch {
    return "—";
  }
}

export function SystemView() {
  usePreserveScroll();
  const live = useLiveSnapshot();
  const sess = live.session ?? {};
  const file = live.overall ?? {};
  const ov = pickLiveOverview(sess, file as { live?: LiveOverview });
  const sessAt = Number(sess.at ?? live.at);
  const fileAt = Number((file as { at?: number }).at ?? 0);
  const tapeN = Array.isArray(sess.tape) ? sess.tape.length : 0;
  const keys = Object.keys(sess).length;
  const ovKeys = Object.keys(file).length;
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
      <Panel title="Database · JSON store">
        <p className="text-sm text-muted">
          Auth is off. The trading database is host JSON: session, overall-stats, settings. Desk picks x02 when ping is ok.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Session keys" v={String(keys)} />
          <StatLine k="Overall keys" v={String(ovKeys)} />
          <StatLine k="Session at" v={stamp(sessAt)} />
          <StatLine k="Overall at" v={stamp(fileAt)} />
          <StatLine k="Tape rows" v={String(tapeN)} />
          <StatLine k="Closed n" v={String(ov.overall?.n ?? live.trades)} />
          <StatLine k="Indication n" v={fmtNum((ov.byIndication ?? []).reduce((s, b) => s + (b.n || 0), 0), 0)} />
          <StatLine k="Playbook n" v={fmtNum((ov.byPlaybook ?? []).reduce((s, b) => s + (b.n || 0), 0), 0)} />
        </div>
      </Panel>
      <SystemPanel />
    </div>
  );
}