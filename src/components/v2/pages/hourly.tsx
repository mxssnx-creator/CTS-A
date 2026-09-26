import { useMemo, useState } from "react";
import { coreSim } from "@/core/api";
import { STRATEGY_PRESETS } from "@/core/config";
import { EquityChart, RadialHours, SignedBars } from "../charts";
import { downloadFile, Empty, ErrorNote, fmt, Kpi, Line, Panel, pfTone, Pill, toCsv, tone, usePoll } from "../ui";

type Any = any;
const H = 3_600_000;

export function HourlyPage() {
  const { data, error } = usePoll(() => coreSim(), 8000);
  const [preset, setPreset] = useState("current");
  const d = data as Any;
  const sim = d?.sim;
  const presets = d?.presets?.presets ?? {};
  const view = preset === "current" ? sim : presets[preset];
  const hours = useMemo(() => (view?.hourly ?? []) as Array<{ t: number; net: number; n: number; pf: number }>, [view]);
  const steps = useMemo(() => new Map(((sim?.steps ?? []) as Any[]).map((s) => [s.t, s])), [sim]);
  const startT = sim?.startT ?? 0;
  const endT = sim?.endT ?? 0;
  const lines = useMemo(() => {
    const byT = new Map(hours.map((h) => [h.t, h]));
    const out: Array<{ t: number; n: number; pf: number; net: number; cum: number; main: number; real: number; taken: number; skipped: number }> = [];
    let cum = 0;
    for (let t = startT; t < endT; t += H) {
      const h = byT.get(t);
      cum += h?.net ?? 0;
      const st = steps.get(t);
      out.push({ t, n: h?.n ?? 0, pf: h?.pf ?? 0, net: h?.net ?? 0, cum, main: st?.main ?? 0, real: st?.real ?? 0, taken: st?.taken ?? 0, skipped: st?.skipped ?? 0 });
    }
    return out;
  }, [hours, startT, endT, steps]);
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  if (!sim) return <Empty>The first simulated run appears after the first compute.</Empty>;
  const s = view?.stats;
  return (
    <>
      <ErrorNote error={error} />
      <Panel
        title="Simulated run"
        sub={`${fmt.hour(startT)} → ${fmt.hour(endT)} UTC · each hour picks configs from the prior ${sim.opts.preH}h (and the long window), then trades the hour`}
        right={
          <>
            <select className="v2-select" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Preset">
              <option value="current">current settings</option>
              {Object.keys(presets).map((k) => (
                <option key={k} value={k}>{STRATEGY_PRESETS[k]?.label ?? k}</option>
              ))}
            </select>
            <button type="button" className="v2-btn" onClick={() => downloadFile(`cts-hourly-${preset}.csv`, toCsv(lines), "text/csv")}>CSV</button>
          </>
        }
      >
        <div className="v2-grid v2-cols-6">
          <Kpi label="PF" value={fmt.pf(s?.pf)} className={pfTone(s?.pf)} sub={view?.stable ? "stable" : "not stable"} />
          <Kpi label="Net" value={fmt.pct(s?.net)} className={tone(s?.net)} />
          <Kpi label="Orders" value={fmt.num(s?.n)} sub={`${fmt.num(s?.tph, 1)} per active hour`} />
          <Kpi label="Green hours" value={s ? `${s.greenHours}/${s.hours}` : "–"} sub={fmt.ratio(s?.gh)} />
          <Kpi label="Worst hour" value={fmt.pct(s?.worstHour)} className="v2-down" />
          <Kpi label="DDT" value={fmt.h(s?.ddt)} sub={`MDD ${fmt.num(s?.mdd, 2)}%`} />
        </div>
      </Panel>
      <div className="v2-grid v2-cols-3">
        <Panel title="Hours" sub="radial: profit outward">
          <RadialHours hours={hours} size={240} />
        </Panel>
        <Panel title="Cumulative" className="v2-span-2">
          <EquityChart series={[{ name: "net %", points: lines.map((l) => ({ t: l.t + H, v: l.cum })) }]} unit="%" />
        </Panel>
      </div>
      <Panel title="Net per hour">
        <SignedBars unit="%" data={lines.map((l) => ({ k: fmt.hour(l.t).slice(6), v: l.net, tip: `${fmt.hour(l.t)} · ${l.n} closes · PF ${fmt.pf(l.pf)} · ${fmt.pct(l.net)} · cum ${fmt.pct(l.cum)}` }))} />
      </Panel>
      <div className="v2-grid v2-cols-3">
        <Panel title="By sub-strategy">
          <div className="v2-lines">
            {Object.entries((view?.byKind ?? {}) as Record<string, Any>).map(([k, v]) => (
              <Line key={k} k={k} v={`n ${v.n} · PF ${fmt.pf(v.pf)} · ${fmt.pct(v.net)}`} className={pfTone(v.pf)} />
            ))}
          </div>
        </Panel>
        <Panel title="Skipped entries" sub="Real-stage rules">
          <div className="v2-lines">
            {Object.entries((view?.skips ?? {}) as Record<string, number>).map(([k, v]) => (
              <Line key={k} k={k} v={fmt.num(v)} />
            ))}
          </div>
        </Panel>
        <Panel title="8h blocks" sub="stability">
          <div className="v2-lines">
            {((view?.blocks ?? []) as Any[]).map((b) => (
              <Line key={b.t} k={fmt.hour(b.t)} v={`n ${b.n} · PF ${fmt.pf(b.pf)} · ${fmt.pct(b.net)}`} className={b.n ? pfTone(b.pf) : "v2-muted"} />
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Hour by hour" sub="line for line" flush>
        <div className="v2-table-wrap">
          <table className="v2-table">
            <thead>
              <tr>
                <th>hour (UTC)</th><th className="num">closes</th><th className="num">PF</th><th className="num">net</th><th className="num">cum</th><th className="num">Main</th><th className="num">Real</th><th className="num">entries</th><th className="num">skipped</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.t}>
                  <td>{fmt.hour(l.t)}</td>
                  <td className="num">{l.n}</td>
                  <td className={`num ${l.n ? pfTone(l.pf) : ""}`}>{l.n ? fmt.pf(l.pf) : "–"}</td>
                  <td className={`num ${tone(l.net)}`}>{l.n ? fmt.pct(l.net) : "–"}</td>
                  <td className={`num ${tone(l.cum)}`}>{fmt.pct(l.cum)}</td>
                  <td className="num">{preset === "current" ? l.main : "–"}</td>
                  <td className="num">{preset === "current" ? l.real : "–"}</td>
                  <td className="num">{preset === "current" ? l.taken : "–"}</td>
                  <td className="num">{preset === "current" ? l.skipped : "–"}</td>
                  <td>{l.n ? l.net > 0 ? <Pill kind="ok">green</Pill> : <Pill kind="bad">red</Pill> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
