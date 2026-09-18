import { INDICATION_KINDS, RANGE_META, RANGE_TYPES, STRATEGY_KINDS, TACTIC_META, TACTICS } from "@/lib/desk/engine";
import type { OverallBucket, PlaybookDetail } from "@/lib/desk/vst";
import { LIVE_POS_NS } from "@/lib/desk/vst";
import { fmtNum, fmtUsd } from "@/lib/utils";
import { fmtMdd, fmtPf, fmtWr, Kpi, Panel, pfTone, Pill, StatLine } from "./widgets";

const PLAY: Record<string, string> = { normal: "Normal", axis: "Axis", block: "Block", dca: "DCA" };
const KIND = Object.fromEntries(STRATEGY_KINDS.map((k) => [k.id, k.label]));
const IND = Object.fromEntries(INDICATION_KINDS.map((k) => [k.id, k.label]));
const TAC = Object.fromEntries(TACTICS.map((t) => [t, TACTIC_META[t].label]));
const RNG = Object.fromEntries(RANGE_TYPES.map((r) => [r, RANGE_META[r].label]));

function BucketTable({
  rows,
  labels,
  extra,
}: {
  rows: OverallBucket[];
  labels?: Record<string, string>;
  extra?: (row: OverallBucket) => string | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-subtle">
            <th className="py-1 pr-2">Set</th>
            <th className="py-1 pr-2">N</th>
            <th className="py-1 pr-2">Open</th>
            <th className="py-1 pr-2">PF</th>
            <th className="py-1 pr-2">WR</th>
            <th className="py-1 pr-2">DDT</th>
            <th className="py-1 pr-2">MDD</th>
            <th className="py-1">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.key} className="border-t border-border">
              <td className="py-1 pr-2 font-medium">
                {labels?.[s.key] ?? s.key}
              </td>
              <td className="py-1 pr-2 font-mono tabular">{s.n}</td>
              <td className="py-1 pr-2 font-mono tabular">{s.openN ?? 0}</td>
              <td className={`py-1 pr-2 font-mono tabular ${s.pf >= 1 ? "text-up" : s.n ? "text-down" : ""}`}>{fmtPf(s.pf)}</td>
              <td className="py-1 pr-2 font-mono tabular">{fmtWr(s.wr)}</td>
              <td className="py-1 pr-2 font-mono tabular">{fmtNum(s.ddt ?? 0, 0)}</td>
              <td className="py-1 pr-2 font-mono tabular">{fmtMdd(s.mdd ?? 0)}</td>
              <td className={`py-1 font-mono tabular ${s.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(s.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HourTable({ rows }: { rows: OverallBucket[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-subtle">
            <th className="py-1 pr-2">Hours</th>
            <th className="py-1 pr-2">N</th>
            <th className="py-1 pr-2">Symbols</th>
            <th className="py-1 pr-2">Orders</th>
            <th className="py-1 pr-2">Avg ord</th>
            <th className="py-1 pr-2">PF</th>
            <th className="py-1 pr-2">WR</th>
            <th className="py-1 pr-2">DDT</th>
            <th className="py-1">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.key} className="border-t border-border">
              <td className="py-1 pr-2 font-medium">{s.key}</td>
              <td className="py-1 pr-2 font-mono tabular">{s.n}</td>
              <td className="py-1 pr-2 font-mono tabular">{s.symbols ?? 0}</td>
              <td className="py-1 pr-2 font-mono tabular">{s.orders ?? s.n}</td>
              <td className="py-1 pr-2 font-mono tabular">{fmtNum(s.avgOrders ?? 0, 1)}</td>
              <td className={`py-1 pr-2 font-mono tabular ${s.pf >= 1 ? "text-up" : s.n ? "text-down" : ""}`}>{fmtPf(s.pf)}</td>
              <td className="py-1 pr-2 font-mono tabular">{fmtWr(s.wr)}</td>
              <td className="py-1 pr-2 font-mono tabular">{fmtNum(s.ddt ?? 0, 0)}</td>
              <td className={`py-1 font-mono tabular ${s.net >= 0 ? "text-up" : "text-down"}`}>{fmtUsd(s.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type LiveOverview = {
  overall?: OverallBucket;
  open?: OverallBucket;
  bySymbol?: OverallBucket[];
  byIndication?: OverallBucket[];
  byKind?: OverallBucket[];
  byTactic?: OverallBucket[];
  byPlaybook?: OverallBucket[];
  byRange?: OverallBucket[];
  byReason?: OverallBucket[];
  playbooks?: PlaybookDetail[];
  lastN?: Record<string, OverallBucket>;
  hours?: Record<string, OverallBucket>;
  bestSymbols?: OverallBucket[];
  worstSymbols?: OverallBucket[];
  runningSymbols?: number;
  avgPositions?: number;
  avgOrders?: number;
  maxPositions?: number;
  maxOrders?: number;
  configsLive?: number;
  configsActive?: number;
  avgConfigPf?: number;
  symbols?: number;
  occupied?: number;
  slots?: number;
  pf?: number;
  wr?: number;
  net?: number;
  ddt?: number;
  mdd?: number;
  trades?: number;
};

function emptyHour(h: number): OverallBucket {
  return { key: `${h}h`, n: 0, wins: 0, pf: 0, wr: 0, net: 0, ddt: 0, mdd: 0, symbols: 0, orders: 0, avgOrders: 0 };
}

export function LiveExchangeStats({
  live,
  session,
  validated,
  exchangePos,
  exchangeOrd,
  avgLivePos,
  avgLiveOrd,
}: {
  live: LiveOverview | null | undefined;
  session?: Record<string, unknown> | null;
  validated?: number;
  exchangePos?: number;
  exchangeOrd?: number;
  avgLivePos?: number;
  avgLiveOrd?: number;
}) {
  if (!live) return null;
  const lastN = LIVE_POS_NS.map((n) => live.lastN?.[String(n)] ?? { key: `n${n}`, n: 0, wins: 0, pf: 0, wr: 0, net: 0, ddt: 0, mdd: 0 });
  const hourShort = [1, 2, 4, 6].map((h) => live.hours?.[String(h)] ?? emptyHour(h));
  const hourLong = [8, 12, 50].map((h) => live.hours?.[String(h)] ?? emptyHour(h));
  const playbooks = live.playbooks?.length
    ? live.playbooks
    : (live.byPlaybook ?? []).map((p) => ({ ...p, active: { ...p, key: `${p.key}:active`, n: 0 }, steps: [] }));
  const runSym = Number(live.runningSymbols) || Number(live.occupied) || Number(exchangePos) || 0;
  const avgPos = Number(avgLivePos ?? live.avgPositions ?? exchangePos ?? 0);
  const avgOrd = Number(avgLiveOrd ?? live.avgOrders ?? exchangeOrd ?? 0);
  const liveCfg = Number(live.configsLive ?? playbooks.filter((p) => p.n > 0).length);
  const activeCfg = Number(live.configsActive ?? exchangePos ?? live.slots ?? 0);
  const avgPf = Number(live.avgConfigPf ?? live.pf ?? 0);
  const val = Number(validated ?? 0);
  const ordersNow = Number(exchangeOrd ?? live.avgOrders ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Live exchange results · BingX VST-02">
        <p className="text-sm text-muted">
          Tape closes from the running session. Hour windows include symbols, order counts, average orders and DDT.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Running symbols" value={String(runSym)} hint={`${live.symbols ?? 50} universe`} />
          <Kpi label="Orders now" value={String(ordersNow)} hint={`pos ${exchangePos ?? live.avgPositions ?? 0}`} />
          <Kpi label="Avg orders" value={fmtNum(avgOrd, 1)} hint={`avg pos ${fmtNum(avgPos, 1)}`} />
          <Kpi label="Overall DDT" value={fmtNum(live.ddt ?? live.overall?.ddt ?? 0, 0)} hint={`MDD ${fmtMdd(live.mdd ?? 0)}`} />
          <Kpi label="Live cfgs" value={String(liveCfg)} hint={`${activeCfg} active · val ${val}`} />
          <Kpi label="Avg cfg PF" value={fmtPf(avgPf)} tone={pfTone(avgPf)} />
        </div>
      </Panel>

      <Panel title="Hour windows · 1 / 2 / 4 / 6">
        <HourTable rows={hourShort} />
      </Panel>
      <Panel title="Hour windows · 12 / 50">
        <HourTable rows={hourLong} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Last N positions · 12 / 40 / 120">
          <BucketTable rows={lastN} labels={{ n12: "Last 12", n40: "Last 40", n120: "Last 120" }} />
        </Panel>
        <Panel title="All hour windows">
          <HourTable rows={[...hourShort, ...hourLong]} />
        </Panel>
      </div>

      <Panel title="Playbooks · Normal / Axis / Block / DCA">
        <div className="grid gap-4 lg:grid-cols-2">
          {playbooks.map((p) => (
            <div key={p.key} className="border border-border bg-bg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{PLAY[p.key] ?? p.key}</span>
                <Pill tone={p.pf >= 1 ? "up" : p.n ? "down" : "neutral"}>PF {fmtPf(p.pf)}</Pill>
                <Pill>n {p.n}</Pill>
                <Pill>DDT {fmtNum(p.ddt, 0)}</Pill>
                <Pill tone={p.net >= 0 ? "up" : "down"}>{fmtUsd(p.net)}</Pill>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4">
                <StatLine k="WR" v={fmtWr(p.wr)} />
                <StatLine k="MDD" v={fmtMdd(p.mdd)} />
                <StatLine k="Active n" v={String(p.active?.n ?? 0)} />
                <StatLine k="Active PF" v={fmtPf(p.active?.pf ?? 0)} tone={pfTone(p.active?.pf ?? 0)} />
              </div>
              {p.steps?.some((s) => s.n > 0) ? (
                <div className="mt-2">
                  <div className="text-xs uppercase tracking-widest text-subtle">Steps</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.steps.map((s, i) => (
                      <Pill key={s.key} tone={s.n === 0 ? "neutral" : s.pf >= 1 ? "up" : "down"}>
                        #{i + 1} n={s.n} PF {fmtPf(s.pf)}
                      </Pill>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Indications">
          <BucketTable rows={live.byIndication ?? []} labels={IND} />
        </Panel>
        <Panel title="Strategy kinds">
          <BucketTable rows={live.byKind ?? []} labels={KIND} />
        </Panel>
        <Panel title="Tactics">
          <BucketTable rows={live.byTactic ?? []} labels={TAC} />
        </Panel>
        <Panel title="Range types">
          <BucketTable rows={live.byRange ?? []} labels={RNG} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Best symbols">
          <BucketTable rows={live.bestSymbols ?? []} />
        </Panel>
        <Panel title="Worst symbols">
          <BucketTable rows={live.worstSymbols ?? []} />
        </Panel>
      </div>
      {session?.lastMsg ? <p className="text-xs text-muted">{String(session.lastMsg)}</p> : null}
    </div>
  );
}
