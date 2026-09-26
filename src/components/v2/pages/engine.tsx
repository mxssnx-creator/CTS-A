import { useState } from "react";
import { coreControl, coreEngine } from "@/core/api";
import { MultiArcGauge } from "../charts";
import { Confirm, Empty, ErrorNote, fmt, Kpi, Line, Panel, Pill, usePoll } from "../ui";

type Any = any;

export function EnginePage() {
  const { data, error, refresh } = usePoll(() => coreEngine(), 3000);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | "stop" | "resync">(null);
  const d = data as Any;
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  const st = d.status;
  const act = async (action: "start" | "stop" | "recompute" | "resync") => {
    setBusy(true);
    try {
      await coreControl({ data: { action } });
    } finally {
      setBusy(false);
      void refresh();
    }
  };
  return (
    <>
      <ErrorNote error={error} />
      <Panel
        title="Runtime"
        sub="continuous loop · time-sliced compute · watchdog restarts a stale loop"
        right={
          <>
            <button type="button" className="v2-btn" disabled={busy} onClick={() => act("recompute")}>Recompute</button>
            <button type="button" className="v2-btn" disabled={busy} onClick={() => setAsk("resync")}>Resync market</button>
            {st.state === "stopped" ? (
              <button type="button" className="v2-btn primary" disabled={busy} onClick={() => act("start")}>Start</button>
            ) : (
              <button type="button" className="v2-btn" disabled={busy} onClick={() => setAsk("stop")}>Stop</button>
            )}
          </>
        }
      >
        <div className="v2-grid v2-cols-3">
          <MultiArcGauge
            size={170}
            center={`${Math.round(st.progress * 100)}%`}
            centerSub={st.stage || st.state}
            rings={[
              { label: `Stage ${st.stage || "–"}`, value: st.progress, display: `${Math.round(st.progress * 100)}%` },
              { label: "Cycle vs budget", value: Math.min(1, st.lastCycleMs / 20000), display: `${fmt.num(st.lastCycleMs)} ms` },
              { label: "Heap", value: Math.min(1, d.process.heap / 2e9), display: fmt.bytes(d.process.heap) },
              { label: "SQLite", value: Math.min(1, d.bytes / 5e8), display: fmt.bytes(d.bytes) },
            ]}
          />
          <div className="v2-lines">
            <Line k="State" v={<Pill kind={st.state === "error" ? "bad" : "ok"}>{st.state}</Pill>} />
            <Line k="Label" v={st.label || "–"} />
            <Line k="Cycles · computes" v={`${st.cycles} · ${st.computes}`} />
            <Line k="Last compute" v={`${fmt.num(st.lastComputeMs)} ms`} />
            <Line k="Heartbeat" v={fmt.ago(st.heartbeat)} />
            <Line k="Next cycle" v={fmt.time(st.nextCycleAt)} />
            <Line k="Started" v={fmt.time(st.startedAt)} />
            {st.error && <Line k="Error" v={st.error} className="v2-down" />}
          </div>
          <div className="v2-lines">
            <Line k="Source" v={st.source} />
            <Line k="Symbols" v={st.symbols.length} />
            <Line k="Last closed bar" v={fmt.time(st.lastBarT)} />
            <Line k="Node" v={d.process.node} />
            <Line k="RSS" v={fmt.bytes(d.process.rss)} />
            <Line k="Uptime" v={fmt.h(d.process.uptime / 3600)} />
          </div>
        </div>
      </Panel>
      <Confirm
        open={ask !== null}
        title={ask === "stop" ? "Stop the engine?" : "Resync the market?"}
        body={
          ask === "stop"
            ? "The running compute is abandoned at its next yield. Paper positions stay as they are; nothing is sent to an exchange. Start resumes with a fresh compute."
            : "All candles are dropped and the universe is backfilled again from BingX (about 15–30 s for 40 symbols), then everything is recomputed."
        }
        confirm={ask === "stop" ? "Stop" : "Resync"}
        danger={ask === "stop"}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          const a = ask;
          setAsk(null);
          if (a) void act(a);
        }}
      />
      <div className="v2-grid v2-cols-2">
        <Panel title="Compute phases" sub="total time · longest uninterrupted slice (what can delay requests)" flush>
          <table className="v2-table">
            <thead><tr><th>phase</th><th className="num">total</th><th className="num">max slice</th><th /></tr></thead>
            <tbody>
              {Object.entries((st.phases ?? {}) as Record<string, Any>).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{fmt.num(v.ms)} ms</td>
                  <td className={`num ${v.maxSliceMs > 150 ? "v2-down" : v.maxSliceMs > 60 ? "v2-warn" : "v2-up"}`}>{fmt.num(v.maxSliceMs)} ms</td>
                  <td>{v.maxSliceMs > 150 ? <Pill kind="bad">blocking</Pill> : <Pill kind="ok">responsive</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Event loop" sub="delay measured during the last compute">
          <div className="v2-lines">
            <Line k="p50" v={`${fmt.num(st.loop?.p50, 1)} ms`} />
            <Line k="p99" v={`${fmt.num(st.loop?.p99, 1)} ms`} className={st.loop?.p99 > 100 ? "v2-down" : "v2-up"} />
            <Line k="max" v={`${fmt.num(st.loop?.max, 0)} ms`} className={st.loop?.max > 250 ? "v2-down" : st.loop?.max > 100 ? "v2-warn" : "v2-up"} />
            <Line k="Main pairs (of 377 Base)" v={st.mainPairs} />
            <Line k="Compute queued" v={st.pending ? "yes" : "no"} />
          </div>
        </Panel>
      </div>
      <div className="v2-grid v2-cols-4">
        {d.tables.map((t: Any) => (
          <Kpi key={t.table} label={t.table} value={fmt.num(t.rows)} />
        ))}
      </div>
      <div className="v2-grid v2-cols-2">
        <Panel title="Compute runs" flush>
          <div className="v2-table-wrap" style={{ maxHeight: 380 }}>
            <table className="v2-table">
              <thead><tr><th>ended</th><th className="num">items</th><th className="num">ms</th><th>note</th></tr></thead>
              <tbody>
                {d.runs.map((r: Any) => (
                  <tr key={r.id}><td>{fmt.time(r.ended)}</td><td className="num">{fmt.num(r.items)}</td><td className="num">{fmt.num(r.ms)}</td><td className="v2-muted">{r.note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Events" flush>
          <div className="v2-table-wrap" style={{ maxHeight: 380 }}>
            <table className="v2-table">
              <thead><tr><th>time</th><th>level</th><th>message</th></tr></thead>
              <tbody>
                {d.events.map((e: Any) => (
                  <tr key={e.id}>
                    <td>{fmt.time(e.at)}</td>
                    <td><Pill kind={e.level === "error" ? "bad" : e.level === "warn" ? undefined : "ok"}>{e.level}</Pill></td>
                    <td style={{ whiteSpace: "normal" }}>{e.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
