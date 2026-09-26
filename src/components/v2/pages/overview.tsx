import { Link } from "@tanstack/react-router";
import { coreOverview } from "@/core/api";
import { ArcShare, EquityChart, MultiArcGauge, RadialHours, SignedBars } from "../charts";
import { Empty, ErrorNote, fmt, Kpi, Line, Panel, pfTone, Pill, tone, usePoll } from "../ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function OverviewPage() {
  const { data, error } = usePoll(() => coreOverview(), 4000);
  const d = data as Any;
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Starting the engine…</Empty>}</>;
  const sim = d.sim;
  const s = sim?.stats;
  const minPf = d.settings.gates.minPf;
  const hours = (sim?.hourly ?? []) as Array<{ t: number; net: number; n: number; pf: number }>;
  let cum = 0;
  const curve = hours.map((h) => ({ t: h.t + 3_600_000, v: (cum += h.net) }));
  const simDays = sim ? (sim.endT - sim.startT) / 86_400_000 : 1;
  const c = d.counts ?? {};
  const byKind = Object.entries((sim?.byKind ?? {}) as Record<string, { n: number }>).map(([label, v]) => ({ label, value: v.n }));
  return (
    <>
      <ErrorNote error={error} />
      <div className="v2-grid v2-cols-6">
        <Kpi label="Sim PF" value={fmt.pf(s?.pf)} className={pfTone(s?.pf, minPf)} sub={`min ${minPf} · neutral 1.00`} />
        <Kpi label="Sim net" value={fmt.pct(s?.net)} className={tone(s?.net)} sub={`${d.wf.simH}h run · ${d.wf.preH}h pre-calc`} />
        <Kpi label="Orders" value={fmt.num(s?.n)} sub={`${fmt.num((s?.n ?? 0) / Math.max(simDays, 0.01))}/day · ${fmt.num(s?.tph, 1)}/active h`} />
        <Kpi label="Green hours" value={s ? `${s.greenHours}/${s.hours}` : "–"} sub={fmt.ratio(s?.gh)} className={s && s.gh >= 0.6 ? "v2-up" : ""} />
        <Kpi label="DDT · MDD" value={fmt.h(s?.ddt)} sub={`MDD ${fmt.num(s?.mdd, 2)}% · worst h ${fmt.pct(s?.worstHour)}`} />
        <Kpi label="Paper equity" value={fmt.usd(d.paper.equity)} className={tone(d.paper.equity)} sub={`${d.paper.positions} open · ${d.paper.selected.length} Real configs`} />
      </div>

      <div className="v2-grid v2-cols-3">
        <Panel title="Health arcs" sub="each ring against its own target">
          <MultiArcGauge
            size={190}
            center={fmt.pf(s?.pf)}
            centerSub="sim PF"
            rings={[
              { label: `PF vs 2.0`, value: (s?.pf ?? 0) / 2, display: fmt.pf(s?.pf) },
              { label: "Green hours", value: s?.gh ?? 0, display: fmt.ratio(s?.gh) },
              { label: "Win rate", value: s?.wr ?? 0, display: fmt.ratio(s?.wr) },
              { label: "Base passing", value: c.base ? c.basePass / c.base : 0, display: `${c.basePass ?? 0}/${c.base ?? 0}` },
              { label: "DDT headroom", value: s ? Math.max(0, 1 - s.ddt / Math.max(1, d.settings.gates.maxDdtH)) : 0, display: fmt.h(s?.ddt) },
            ]}
          />
        </Panel>
        <Panel title="Hours" sub="net per hour, outward = profit">
          {hours.length ? <RadialHours hours={hours} size={230} /> : <Empty>No simulated hours yet</Empty>}
        </Panel>
        <Panel title="Orders by sub-strategy" sub="executed in the simulated run">
          {byKind.length ? <ArcShare parts={byKind} center={String(s?.n ?? 0)} /> : <Empty>–</Empty>}
          <div className="v2-lines" style={{ marginTop: 10 }}>
            {Object.entries((sim?.skips ?? {}) as Record<string, number>).map(([k, v]) => (
              <Line key={k} k={`skipped · ${k}`} v={fmt.num(v)} />
            ))}
          </div>
        </Panel>
      </div>

      <div className="v2-grid v2-cols-2">
        <Panel title="Cumulative net (simulated run)" sub={sim ? `${fmt.hour(sim.startT)} → ${fmt.hour(sim.endT)} UTC · ${sim.stable ? "stable" : "not stable"}` : ""} right={sim && <Pill kind={sim.stable ? "ok" : "bad"}>{sim.stable ? "stable" : "unstable"}</Pill>}>
          <EquityChart series={[{ name: "net %", points: curve }]} unit="%" />
        </Panel>
        <Panel title="Net per hour" right={<Link to="/v2/hourly" className="v2-btn">Hour by hour →</Link>}>
          <SignedBars unit="%" data={hours.map((h) => ({ k: fmt.hour(h.t).slice(6), v: h.net, tip: `${fmt.hour(h.t)} · ${h.n} closes · PF ${fmt.pf(h.pf)} · ${fmt.pct(h.net)}` }))} />
        </Panel>
      </div>

      <div className="v2-grid v2-cols-2">
        <Panel title="Stages" sub="Base → Main → Real → Live" right={<Link to="/v2/stages" className="v2-btn">Open</Link>}>
          <div className="v2-funnel">
            <div className="v2-stage"><div className="t">Base</div><div className="n">{fmt.num(c.base)}</div><p>combos computed · {d.wf.tapes} strategy tapes</p></div>
            <div className="v2-stage"><div className="t">Main</div><div className="n">{fmt.num(c.main)}</div><p>refined · {c.evaluated ?? 0} evaluated</p></div>
            <div className="v2-stage"><div className="t">Real</div><div className="n">{d.paper.selected.length}</div><p>{d.paper.eligible} eligible this hour</p></div>
            <div className="v2-stage"><div className="t">Live</div><div className="n">{d.settings.live.enabled ? "on" : "off"}</div><p>{d.live?.reason ?? "disabled"}</p></div>
          </div>
        </Panel>
        <Panel title="Top configs in the run" sub="by net">
          <table className="v2-table">
            <thead>
              <tr><th>config</th><th className="num">n</th><th className="num">PF</th><th className="num">net</th></tr>
            </thead>
            <tbody>
              {(sim?.byConfig ?? []).map((r: Any) => (
                <tr key={r.id}>
                  <td><Link to="/v2/config/$id" params={{ id: r.id }} className="v2-mono">{r.id}</Link></td>
                  <td className="num">{r.n}</td>
                  <td className={`num ${pfTone(r.pf, minPf)}`}>{fmt.pf(r.pf)}</td>
                  <td className={`num ${tone(r.net)}`}>{fmt.pct(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
