import { Link } from "@tanstack/react-router";
import { coreOverview, coreResults } from "@/core/api";
import { Empty, ErrorNote, fmt, Line, Panel, pfTone, Pill, tone, usePoll } from "../ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function StagesPage() {
  const { data, error } = usePoll(() => coreOverview(), 5000);
  const { data: ranked } = usePoll(() => coreResults({ data: { stage: 3, sort: "rank", limit: 40 } }), 15000);
  const d = data as Any;
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  const c = d.counts ?? {};
  const g = d.settings.gates;
  const tg = d.settings.toggles;
  const pipe = d.pipeline;
  const port = pipe?.portfolio;
  return (
    <>
      <ErrorNote error={error} />
      <Panel title="Coordination" sub="each stage only evaluates what passed the previous one — no overload, full coverage in Base">
        <div className="v2-funnel">
          <div className="v2-stage">
            <div className="t">1 · Base</div>
            <div className="n">{fmt.num(c.base)}</div>
            <p>Every indication × bot type with the base protect, plus {d.wf.tapes} independent strategy tapes (normal, trailing, DCA, DCA Active × {d.wf.protects} protect variants). Always computed, whatever the toggles.</p>
          </div>
          <div className="v2-stage">
            <div className="t">2 · Main</div>
            <div className="n">{fmt.num(c.main)}</div>
            <p>In-sample PF ≥ {g.minPf}, DDT ≤ {g.maxDdtH}h/72h, ≥ {g.minTrades} trades; pair must be parameter-robust. Refined on the protect grid.</p>
          </div>
          <div className="v2-stage">
            <div className="t">3 · Real</div>
            <div className="n">{d.paper.selected.length}</div>
            <p>Still working in the {d.wf.preH}h pre-historic window (PF ≥ 1.00), last-N {d.wf.lastN} gate, Block levels. Executed on paper every hour.</p>
          </div>
          <div className="v2-stage">
            <div className="t">4 · Live</div>
            <div className="n">{d.settings.live.enabled ? "armed" : "off"}</div>
            <p>{d.live?.reason ?? "Disabled in settings"}. Own CTSB tags only; foreign symbols are skipped.</p>
          </div>
        </div>
      </Panel>

      <div className="v2-grid v2-cols-3">
        <Panel title="Execution toggles" sub="filters execution only">
          <div className="v2-lines">
            {Object.entries(tg as Record<string, boolean>).map(([k, v]) => (
              <Line key={k} k={k} v={<Pill kind={v ? "ok" : undefined}>{v ? "on" : "off"}</Pill>} />
            ))}
            <Line k="Block" v={`+${d.settings.block.ratio}/level · 1–${d.settings.block.maxLevel} · cap ${d.settings.block.maxMult}×`} />
            <Line k="DCA" v={`${d.settings.dca.levels} levels · step ${fmt.frac(d.settings.dca.step)}`} />
          </div>
        </Panel>
        <Panel title="Pipeline run" sub={pipe ? fmt.ago(pipe.at) : ""}>
          {pipe ? (
            <div className="v2-lines">
              <Line k="Universe" v={`${pipe.universe.symbols.length} symbols · ${fmt.num(pipe.universe.bars)} bars`} />
              <Line k="In-sample / OOS split" v={fmt.time(pipe.universe.splitT)} />
              <Line k="Base (S1)" v={`${pipe.s1} combos · ${fmt.num(pipe.timings.S1)} ms`} />
              <Line k="Main (S2)" v={`${pipe.s2} runs · ${fmt.num(pipe.timings.S2)} ms`} />
              <Line k="Real eval (S3)" v={`${pipe.ranked} configs · ${fmt.num(pipe.timings.S3)} ms`} />
            </div>
          ) : (
            <Empty>–</Empty>
          )}
        </Panel>
        <Panel title="Validated portfolio" sub="in-sample picked, out-of-sample reported">
          {port ? (
            <div className="v2-lines">
              <Line k="Members" v={port.members.length} />
              <Line k="Hour guard" v={port.guardPct ? `${port.guardPct}%` : "off"} />
              <Line k="In-sample PF · net" v={`${fmt.pf(port.is.pf)} · ${fmt.pct(port.is.net)}`} className={pfTone(port.is.pf, g.minPf)} />
              <Line k="Out-of-sample PF · net" v={`${fmt.pf(port.oos.pf)} · ${fmt.pct(port.oos.net)}`} className={pfTone(port.oos.pf, g.minPf)} />
              <Line k="OOS green hours" v={`${port.oos.greenHours}/${port.oos.hours}`} />
            </div>
          ) : (
            <Empty>–</Empty>
          )}
        </Panel>
      </div>

      <Panel title="Ranked (Main → Real candidates)" sub="last-N chosen in-sample, validated out-of-sample; continuous window evals" flush>
        <div className="v2-table-wrap">
          <table className="v2-table">
            <thead>
              <tr>
                <th>#</th><th>config</th><th className="num">n</th><th className="num">PF</th><th className="num">net</th><th className="num">best N</th><th className="num">OOS n</th><th className="num">OOS PF</th><th className="num">OOS net</th><th>last-N</th><th className="num">eval pass</th><th>armed</th>
              </tr>
            </thead>
            <tbody>
              {((ranked as Any)?.rows ?? []).map((r: Any) => (
                <tr key={r.id}>
                  <td>{r.rank}</td>
                  <td><Link to="/v2/config/$id" params={{ id: r.id }} className="v2-mono">{r.id}</Link></td>
                  <td className="num">{r.n}</td>
                  <td className={`num ${pfTone(r.pf, g.minPf)}`}>{fmt.pf(r.pf)}</td>
                  <td className={`num ${tone(r.net)}`}>{fmt.pct(r.net)}</td>
                  <td className="num">{r.best_n || "all"}</td>
                  <td className="num">{r.oos_n}</td>
                  <td className={`num ${pfTone(r.oos_pf, g.minPf)}`}>{fmt.pf(r.oos_pf)}</td>
                  <td className={`num ${tone(r.oos_net)}`}>{fmt.pct(r.oos_net)}</td>
                  <td>{r.lastn_ok ? <Pill kind="ok">pass</Pill> : <Pill kind="bad">fail</Pill>}</td>
                  <td className="num">{fmt.ratio(r.eval_pass)}</td>
                  <td>{r.armed ? <Pill kind="acc">armed</Pill> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
