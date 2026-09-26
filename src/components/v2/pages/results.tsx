import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { coreResults } from "@/core/api";
import { BOTS } from "@/core/bots/bots";
import { INDICATIONS } from "@/core/indications/registry";
import { downloadFile, Empty, ErrorNote, fmt, Panel, pfTone, Pill, Seg, toCsv, tone, useDebounced, usePoll } from "../ui";

type Any = any;

export function ResultsPage() {
  const [stage, setStage] = useState(1);
  const [bot, setBot] = useState("");
  const [ind, setInd] = useState("");
  const [sort, setSort] = useState("score");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const { data, error, loading } = usePoll(() => coreResults({ data: { stage, bot: bot || undefined, ind: ind || undefined, sort, q: dq || undefined, limit: 400 } }), 10000, [stage, bot, ind, sort, dq]);
  const rows = ((data as Any)?.rows ?? []) as Any[];
  return (
    <>
      <ErrorNote error={error} />
      <Panel
        title="Configs"
        sub={`${loading ? "loading… · " : ""}${fmt.num((data as Any)?.total)} rows · every indication × bot × protect, calculated independently`}
        right={
          <button type="button" className="v2-btn" onClick={() => downloadFile(`cts-configs-stage${stage}.csv`, toCsv(rows), "text/csv")}>
            CSV
          </button>
        }
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Seg label="Stage" value={stage} onChange={setStage} options={[{ value: 1, label: "Base" }, { value: 2, label: "Main" }, { value: 3, label: "Evaluated" }]} />
          <select className="v2-select" value={bot} onChange={(e) => setBot(e.target.value)} aria-label="Bot">
            <option value="">all bots</option>
            {BOTS.map((b) => <option key={b.type} value={b.type}>{b.label}</option>)}
          </select>
          <select className="v2-select" value={ind} onChange={(e) => setInd(e.target.value)} aria-label="Indication">
            <option value="">all indications</option>
            <option value="none">none</option>
            {INDICATIONS.map((i) => <option key={i.id} value={i.id}>{i.kind} · {i.label}</option>)}
          </select>
          <select className="v2-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="score">score</option>
            <option value="pf">PF</option>
            <option value="net">net</option>
            <option value="n">orders</option>
            <option value="gh">green hours</option>
            <option value="oos">OOS PF</option>
            <option value="rank">rank</option>
          </select>
          <input className="v2-input" placeholder="filter id…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Panel>
      <Panel flush>
        {rows.length === 0 ? (
          <Empty>No rows yet — Base runs after the first backfill.</Empty>
        ) : (
          <div className="v2-table-wrap">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>config</th><th className="num">n</th><th className="num">WR</th><th className="num">PF</th><th className="num">net</th><th className="num">MDD</th><th className="num">DDT</th><th className="num">green h</th><th className="num">/h</th><th className="num">IS PF</th><th className="num">score</th><th className="num">OOS PF</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link to="/v2/config/$id" params={{ id: r.id }} className="v2-mono">{r.id}</Link></td>
                    <td className="num">{r.n}</td>
                    <td className="num">{fmt.ratio(r.wr)}</td>
                    <td className={`num ${pfTone(r.pf)}`}>{fmt.pf(r.pf)}</td>
                    <td className={`num ${tone(r.net)}`}>{fmt.pct(r.net)}</td>
                    <td className="num">{fmt.num(r.mdd, 2)}%</td>
                    <td className="num">{fmt.h(r.ddt)}</td>
                    <td className="num">{fmt.ratio(r.gh)}</td>
                    <td className="num">{fmt.num(r.tph, 1)}</td>
                    <td className={`num ${pfTone(r.is_pf)}`}>{fmt.pf(r.is_pf)}</td>
                    <td className="num">{fmt.num(r.score, 1)}</td>
                    <td className={`num ${pfTone(r.oos_pf)}`}>{fmt.pf(r.oos_pf)}</td>
                    <td>{r.armed ? <Pill kind="acc">armed</Pill> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
