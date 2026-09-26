import { coreSim } from "@/core/api";
import { EquityChart, HeatGrid, SERIES } from "../charts";
import { Empty, ErrorNote, fmt, Panel, pfTone, Pill, tone, usePoll } from "../ui";

type Any = any;
const H = 3_600_000;

export function ComparePage() {
  const { data, error } = usePoll(() => coreSim(), 10000);
  const d = data as Any;
  const p = d?.presets;
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  if (!p) return <Empty>Preset comparisons appear after the first compute.</Empty>;
  const names = Object.keys(p.presets);
  const hoursAll: number[] = [];
  for (let t = p.startT; t < p.endT; t += H) hoursAll.push(t);
  const series = names.slice(0, 8).map((n, i) => {
    let cum = 0;
    const byT = new Map(((p.presets[n].hourly ?? []) as Any[]).map((h) => [h.t, h.net]));
    return { name: p.presets[n].label, color: SERIES[i], points: hoursAll.map((t) => ({ t: t + H, v: (cum += (byT.get(t) as number) ?? 0) })) };
  });
  const cols = hoursAll.map((t) => fmt.hour(t).slice(6, 8) + "h·" + fmt.hour(t).slice(3, 5));
  return (
    <>
      <ErrorNote error={error} />
      <Panel title="Presets on the same tapes" sub={`${fmt.hour(p.startT)} → ${fmt.hour(p.endT)} UTC · with / without Block, DCA and Active · same selection, same costs`} flush>
        <div className="v2-table-wrap">
          <table className="v2-table">
            <thead>
              <tr>
                <th>preset</th><th>toggles</th><th className="num">orders</th><th className="num">WR</th><th className="num">PF</th><th className="num">net</th><th className="num">green h</th><th className="num">worst h</th><th className="num">MDD</th><th className="num">DDT</th><th>by kind</th><th />
              </tr>
            </thead>
            <tbody>
              {names.map((n) => {
                const x = p.presets[n];
                const s = x.stats;
                return (
                  <tr key={n}>
                    <td style={{ fontWeight: 600 }}>{x.label}</td>
                    <td className="v2-muted">{Object.entries(x.toggles).filter(([, v]) => v).map(([k]) => k).join(" · ")}</td>
                    <td className="num">{s.n}</td>
                    <td className="num">{fmt.ratio(s.wr)}</td>
                    <td className={`num ${pfTone(s.pf)}`}>{fmt.pf(s.pf)}</td>
                    <td className={`num ${tone(s.net)}`}>{fmt.pct(s.net)}</td>
                    <td className="num">{s.greenHours}/{s.hours}</td>
                    <td className="num v2-down">{fmt.pct(s.worstHour)}</td>
                    <td className="num">{fmt.num(s.mdd, 2)}%</td>
                    <td className="num">{fmt.h(s.ddt)}</td>
                    <td className="v2-muted">{Object.entries(x.byKind as Record<string, Any>).map(([k, v]) => `${k} ${v.n}/${fmt.pf(v.pf)}`).join(" · ")}</td>
                    <td>{x.stable ? <Pill kind="ok">stable</Pill> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Cumulative net per preset">
        <EquityChart series={series} unit="%" />
      </Panel>
      <Panel title="Hour × preset" sub="PF per hour (grey = neutral 1.0, empty = no closes)">
        <HeatGrid
          rows={names.map((n) => p.presets[n].label)}
          cols={cols}
          cell={(label, col) => {
            const name = names.find((n) => p.presets[n].label === label)!;
            const t = hoursAll[cols.indexOf(col)];
            const h = (p.presets[name].hourly as Any[]).find((x) => x.t === t);
            if (!h) return null;
            return { v: h.pf, tip: `${label} · ${fmt.hour(t)} · ${h.n} closes · PF ${fmt.pf(h.pf)} · ${fmt.pct(h.net)}` };
          }}
        />
      </Panel>
    </>
  );
}
