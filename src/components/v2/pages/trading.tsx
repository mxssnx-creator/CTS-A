import { Link } from "@tanstack/react-router";
import { coreMarket, coreTrading } from "@/core/api";
import { Sparkline } from "../charts";
import { Empty, ErrorNote, fmt, Kpi, Line, Panel, Pill, tone, usePoll } from "../ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function TradingPage() {
  const { data, error } = usePoll(() => coreTrading(), 5000);
  const d = data as Any;
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  const trades = d.trades as Any[];
  const pnl = trades.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const live = d.live;
  return (
    <>
      <ErrorNote error={error} />
      <div className="v2-grid v2-cols-4">
        <Kpi label="Paper equity" value={fmt.usd(d.equity)} className={tone(d.equity)} sub="closed + open, per notional setting" />
        <Kpi label="Open paper positions" value={d.positions.length} sub={`${d.selected.length} Real configs this hour`} />
        <Kpi label="Recent paper closes" value={trades.length} sub={fmt.usd(pnl)} className={tone(pnl)} />
        <Kpi label="Live" value={live?.enabled ? "armed" : "off"} sub={live?.reason ?? "disabled in settings"} className={live?.enabled ? "v2-up" : ""} />
      </div>
      <div className="v2-grid v2-cols-2">
        <Panel title="Open paper positions" flush>
          {d.positions.length ? (
            <div className="v2-table-wrap">
              <table className="v2-table">
                <thead><tr><th>symbol</th><th>side</th><th>config</th><th>entry</th><th className="num">px</th><th className="num">stop</th><th className="num">target</th><th className="num">MTM</th></tr></thead>
                <tbody>
                  {d.positions.map((p: Any) => (
                    <tr key={`${p.cfg}|${p.sym}`}>
                      <td>{p.sym}</td>
                      <td>{p.side > 0 ? "long" : "short"}</td>
                      <td><Link to="/v2/config/$id" params={{ id: p.cfg }} className="v2-mono">{p.cfg}</Link></td>
                      <td>{fmt.time(p.entry_t)}</td>
                      <td className="num">{fmt.num(p.entry, 4)}</td>
                      <td className="num">{fmt.num(p.stop, 4)}</td>
                      <td className="num">{fmt.num(p.target, 4)}</td>
                      <td className={`num ${tone(p.mtm)}`}>{fmt.pct(p.mtm * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No open paper positions</Empty>
          )}
        </Panel>
        <Panel title="Due now (Live intents)" sub="signals on the newest closed bar from Real configs" flush>
          {d.pending.length ? (
            <table className="v2-table">
              <thead><tr><th>symbol</th><th>side</th><th>config</th><th className="num">TP</th><th className="num">SL</th></tr></thead>
              <tbody>
                {d.pending.map((p: Any, i: number) => (
                  <tr key={i}>
                    <td>{p.sym}</td>
                    <td>{p.side > 0 ? "long" : "short"}</td>
                    <td className="v2-mono">{p.cfg}</td>
                    <td className="num">{fmt.frac(p.protect.tp)}</td>
                    <td className="num">{fmt.frac(p.protect.sl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Nothing due on the latest bar</Empty>
          )}
          {live && (
            <div className="v2-lines" style={{ padding: 10 }}>
              <Line k="Live status" v={live.reason} />
              <Line k="Placed last cycle" v={live.placed} />
              {(live.skipped ?? []).slice(0, 6).map((s: Any, i: number) => <Line key={i} k={`skip ${s.sym}`} v={s.why} />)}
              {live.error && <Line k="Error" v={live.error} className="v2-down" />}
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Paper closes" flush>
        <div className="v2-table-wrap">
          <table className="v2-table">
            <thead><tr><th>exit</th><th>symbol</th><th>side</th><th>config</th><th className="num">entry</th><th className="num">exit</th><th className="num">net</th><th className="num">pnl</th><th>reason</th></tr></thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i}>
                  <td>{fmt.time(t.exit_t)}</td>
                  <td>{t.sym}</td>
                  <td>{t.side > 0 ? "long" : "short"}</td>
                  <td className="v2-mono">{t.cfg}</td>
                  <td className="num">{fmt.num(t.entry, 4)}</td>
                  <td className="num">{fmt.num(t.exit, 4)}</td>
                  <td className={`num ${tone(t.r)}`}>{fmt.pct(t.r * 100)}</td>
                  <td className={`num ${tone(t.pnl)}`}>{fmt.usd(t.pnl)}</td>
                  <td>{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Live orders" sub="own CTSB tickets only" flush>
        {d.liveOrders.length ? (
          <table className="v2-table">
            <thead><tr><th>time</th><th>coid</th><th>symbol</th><th>kind</th><th className="num">qty</th><th className="num">px</th><th>status</th></tr></thead>
            <tbody>
              {d.liveOrders.map((o: Any) => (
                <tr key={o.coid}>
                  <td>{fmt.time(o.at)}</td>
                  <td className="v2-mono">{o.coid}</td>
                  <td>{o.sym}</td>
                  <td>{o.kind}</td>
                  <td className="num">{o.qty}</td>
                  <td className="num">{fmt.num(o.px, 4)}</td>
                  <td>{o.status === "ok" ? <Pill kind="ok">ok</Pill> : <Pill kind="bad">{o.status}</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No live orders — the Live stage is off unless enabled in Settings and CTS_CORE_LIVE=1 on the host.</Empty>
        )}
      </Panel>
    </>
  );
}

export function MarketPage() {
  const { data, error } = usePoll(() => coreMarket(), 15000);
  const d = data as Any;
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  return (
    <>
      <ErrorNote error={error} />
      <Panel title="Universe" sub={`${d.symbols.length} symbols · ${d.tfMin}m bars · source ${d.source} · ranked by 24h quote volume`} flush>
        <div className="v2-table-wrap">
          <table className="v2-table">
            <thead><tr><th>symbol</th><th className="num">last</th><th className="num">24h</th><th className="num">24h quote vol</th><th className="num">bars</th><th>from</th><th>to</th><th>last 24h</th></tr></thead>
            <tbody>
              {d.symbols.map((s: Any) => (
                <tr key={s.sym}>
                  <td style={{ fontWeight: 600 }}>{s.sym}</td>
                  <td className="num">{fmt.num(s.last, 4)}</td>
                  <td className={`num ${tone(s.change_pct)}`}>{fmt.pct(s.change_pct)}</td>
                  <td className="num">{fmt.num(s.quote_vol / 1e6, 1)}M</td>
                  <td className="num">{s.bars}</td>
                  <td>{fmt.time(s.first_t)}</td>
                  <td>{fmt.time(s.last_t)}</td>
                  <td><Sparkline values={d.spark[s.sym] ?? []} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
