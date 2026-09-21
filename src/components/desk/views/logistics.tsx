import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { fmtEquity, fmtNum, fmtUsd } from "@/lib/utils";
import { LogisticsCampus, type LogisticsNodeId } from "../logistics-campus";
import { Panel, StatLine, Kpi } from "../widgets";
import { Button } from "@/components/ui/button";
import { LiveBookStrip } from "../live-book-strip";

const STACK = [
  { id: 0, name: "L0 Hardware", detail: "Host CPU/mem, BingX venue, TLS sockets. No mock book." },
  { id: 1, name: "L1 Kernel", detail: "tickVst, rate burst, queue caps, self-heal. Owns only CTSAv2_ orders." },
  { id: 2, name: "L2 Drivers", detail: "Quote pack, ATR, 1h vol rank, hedge both sides, max leverage." },
  { id: 3, name: "L3 OS", detail: "armUniverse, last-N coord (eval 50 / valid 15 / disable 12), preEval 20h." },
  { id: 4, name: "L4 API", detail: "Protect SL/TP, trail from peak, partial fills, remaining qty." },
  { id: 5, name: "L5 Services", detail: "Indications, Block 1–6 shared 1.5 / additive 0.2, short lock 0.48/0.75." },
  { id: 6, name: "L6 UI", detail: "Desk pages, Statistics, Replay, Logistics campus, settings sync." },
];

const NODES: Record<
  LogisticsNodeId,
  {
    title: string;
    role: string;
    subs: { id: string; name: string; info: string }[];
    pipeline: string;
  }
> = {
  quotes: {
    title: "Quote logistics",
    role: "Market ingest → ATR / span / 1h vol. Universe ranked by volatility.",
    pipeline: "venue book → pack.atr → indicationQuality → arm",
    subs: [
      { id: "q-stream", name: "Stream", info: "Per-symbol quote.px, hi/lo, chg. Desk conn only." },
      { id: "q-atr", name: "ATR cell", info: "Short TP/SL are ATR multiples. Lock 0.48 / 0.75." },
      { id: "q-rank", name: "Vol rank", info: "Symbols selected by last-hour range, not mock lists." },
    ],
  },
  indications: {
    title: "Indication logistics",
    role: "Independent tactics: Trend, Break, Direction, Active, EMA, Bollinger, MACD, SAR, RSI, Move.",
    pipeline: "pack → quality floor → playbook (short/normal/axis/block)",
    subs: [
      { id: "i-break", name: "Break", info: "Donchian exclude-bar, squeeze, wick filter, mag ≥ 0.22." },
      { id: "i-dir", name: "Direction", info: "Side flip tactics, dual long/short on same symbol." },
      { id: "i-active", name: "Active", info: "High activity / ranging changes. Block Active = adjusted only." },
    ],
  },
  eval: {
    title: "Eval / last-N logistics",
    role: "Base eval last-N 15–80, valid-exec 8–24, disable 6–20. Combined + independent.",
    pipeline: "intern score 126 combos → lock 0.48/0.75 → validExec tag",
    subs: [
      { id: "e-base", name: "Base N", info: "Default 50. Scores intern PF before Block extra." },
      { id: "e-valid", name: "Valid N", info: "Default 15. Tags live execute. Not exchange flatten." },
      { id: "e-off", name: "Disable N", info: "Default 12. Stops a relation if last-N average is red." },
    ],
  },
  arm: {
    title: "Arm / universe",
    role: "Queue + position caps. Lock cell first on the intern grid so winners are not rotated out.",
    pipeline: "rankUniverse → skipLiveSymbol → enqueue ladder",
    subs: [
      { id: "a-lock", name: "Lock first", info: "0.48/0.75 reserved in every sliceShortGrid." },
      { id: "a-intern", name: "Intern rest", info: "Complete sim still scores all 126 TP×SL tapes." },
      { id: "a-own", name: "Owned only", info: "CTSAv2_ client ids. Foreign book is never cancelled." },
    ],
  },
  queue: {
    title: "Order logistics",
    role: "Working SL/TP, partials, remaining qty. Control orders = widest of partials.",
    pipeline: "queue → rate window → fill → protectOne",
    subs: [
      { id: "o-sl", name: "Stops", info: "Min SL pulled to cell. Trail from peak, shortRange holds until peak." },
      { id: "o-tp", name: "Targets", info: "Independent TP per combo. Common control uses widest." },
      { id: "o-part", name: "Partials", info: "Fill remaining parsed from exchange; no double-cut." },
    ],
  },
  positions: {
    title: "Position logistics",
    role: "Legs = symbol + direction. Hedge both. System net = owned closed + owned open.",
    pipeline: "fill → legKey → MTM → flattenBelowMinPf (hold > 24m only)",
    subs: [
      { id: "p-long", name: "Long", info: "Independent of short on the same symbol." },
      { id: "p-short", name: "Short", info: "Forced one-side is off. Dual occupancy counts as 2." },
      { id: "p-own", name: "Owned vs foreign", info: "Foreign positions stay. Stats use systemNet." },
    ],
  },
  protect: {
    title: "Protect / trail",
    role: "ensureProtect always runs — no early return when a wide SL already exists.",
    pipeline: "cell SL → slLoose pull-in → trailStopFromPeak",
    subs: [
      { id: "t-cell", name: "Cell", info: "Lock 0.48 ATR TP, SL 0.75 of TP, hold 24 ticks." },
      { id: "t-trail", name: "Trail", info: "Updates from peak. Tight trails were disabled as losers." },
      { id: "t-gap", name: "Gap", info: "Health: SL gap should go to 0 after protect." },
    ],
  },
  block: {
    title: "Block logistics",
    role: "Counts 1–6 independent. Shared stacks additively across lanes. Overall block extra on all positions.",
    pipeline: "evalBlockRelations → adjustActiveBlocks → extra size cap 2.5",
    subs: [
      { id: "b-shared", name: "Shared", info: "Default ratio 1.5. Stack 1–2. Additive across lanes." },
      { id: "b-add", name: "Additive", info: "Default 0.2 per independent relation. Not axis 0.08." },
      { id: "b-overall", name: "Overall", info: "Symbol + direction extra, independent of set/lane." },
    ],
  },
  close: {
    title: "Close / PnL logistics",
    role: "Owned realized only. Overlay tags indication, tactic, playbook, side.",
    pipeline: "exit → ingestLivePnls → overlayLiveExecutions → overallLiveStats",
    subs: [
      { id: "c-sys", name: "System net", info: "closed owned + open owned. Foreign income excluded." },
      { id: "c-tag", name: "Tags", info: "side / indication / tactic / playbook / kind on every close." },
      { id: "c-hour", name: "Hour tape", info: "gatedN/P/L summed — not the 600-close ring." },
    ],
  },
  stores: {
    title: "Polyglot stores",
    role: "JSON session, overall-stats, settings, tape. Auth off. Host files are the database.",
    pipeline: "atomic write → session ingest-before-stats → UI snapshot",
    subs: [
      { id: "s-rel", name: "Relational", info: "Settings, presets, PF floors, Block counts." },
      { id: "s-doc", name: "Document", info: "vst-session-x02.json, overall-stats-x02.json." },
      { id: "s-ts", name: "Time series", info: "Hourly, last-N windows, 20-min interval guard." },
      { id: "s-graph", name: "Graph", info: "Relations: symbol×side×indication×tactic×combo." },
    ],
  },
  network: {
    title: "Dual-path network",
    role: "x01 mainnet / x02 VST. Only the active conn is handled. BGP-style failover is ping + book.",
    pipeline: "edge → CE → desk connId → mayCancelOrder",
    subs: [
      { id: "n-x02", name: "VST-02", info: "Default demo. Max 50 symbols live install." },
      { id: "n-x01", name: "Live-01", info: "Mainnet after validated lock. Min PF 1.4+." },
      { id: "n-own", name: "Ownership", info: "isDeskClientOrderId. Foreign never cancelled." },
    ],
  },
  ui: {
    title: "Desk surface",
    role: "Overview, Statistics, Replay, Engine, Settings. No full-page refresh; scroll pinned.",
    pipeline: "LiveDeskProvider → useLiveSnapshot → views",
    subs: [
      { id: "u-stat", name: "Statistics", info: "Independent Results sibling. Live buckets only." },
      { id: "u-rep", name: "Replay", info: "Up to 12 days, multi-symbol, complete computing." },
      { id: "u-log", name: "Logistics", info: "This campus. Expand layers, adjust flow, apply hold/vol." },
    ],
  },
  stack: {
    title: "Seven-layer stack",
    role: "Hardware → kernel → drivers → OS → API → services → UI. Coordinated expansion.",
    pipeline: "L0…L6 always live; expand highlights the active layer",
    subs: STACK.map((s) => ({ id: `l${s.id}`, name: s.name, info: s.detail })),
  },
};

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  fmt?: (n: number) => string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex justify-between text-xs uppercase tracking-wide text-subtle">
        <span>{label}</span>
        <span className="font-mono tabular text-fg">{fmt ? fmt(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full accent-primary"
      />
    </label>
  );
}

export function LogisticsView() {
  usePreserveScroll();
  const live = useLiveSnapshot();
  const tacticConfig = useDesk((s) => s.tacticConfig);
  const blockConfig = useDesk((s) => s.blockConfig);
  const setTacticConfig = useDesk((s) => s.setTacticConfig);
  const setBlockConfig = useDesk((s) => s.setBlockConfig);
  const [selected, setSelected] = useState<LogisticsNodeId>("positions");
  const [expand, setExpand] = useState(5);
  const [flow, setFlow] = useState(1);
  const [pfGate, setPfGate] = useState(0.95);
  const [vol, setVol] = useState(Number(blockConfig.sharedVolumeRatio ?? 1.5));
  const [hold, setHold] = useState(Number(tacticConfig.maxHoldTicks ?? 24));
  const node = NODES[selected];
  const campusLive = useMemo(
    () => ({
      equity: live.equity,
      pf: live.pf,
      livePos: live.livePos,
      liveOrd: live.liveOrd,
      liveSl: live.liveSl,
      liveTp: live.liveTp,
      occupied: live.occupied,
      liveLong: live.liveLong,
      liveShort: live.liveShort,
      pingOk: live.pingOk,
      latencyMs: live.latencyMs,
      systemNet: live.systemNet,
      closedNet: live.closedNet,
      openNet: live.openNet,
      foreignPos: live.foreignPos,
      liveOwned: live.liveOwned,
      conn: live.conn,
      venueLabel: live.venueLabel,
      trades: live.trades,
    }),
    [live],
  );

  const stages = [
    { id: "quotes", n: live.occupied, label: "Quotes" },
    { id: "indications", n: 10, label: "Indications" },
    { id: "eval", n: live.trades, label: "Eval" },
    { id: "arm", n: live.occupied, label: "Arm" },
    { id: "queue", n: live.liveOrd, label: "Queue" },
    { id: "positions", n: live.livePos, label: "Pos" },
    { id: "protect", n: live.liveSl + live.liveTp, label: "Protect" },
    { id: "block", n: live.livePos, label: "Block" },
    { id: "close", n: live.trades, label: "Close" },
    { id: "stores", n: live.hasLive ? 4 : 0, label: "Stores" },
  ] as const;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">Infrastructure</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Network className="size-6 text-primary" />
            Logistics
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Interactive campus of CTS process logistics. Click a volume to inspect sub-logistics. Sliders change
            flow, gate and mass; Apply writes hold and Block shared ratio into the live engine.
          </p>
        </div>
      </div>
      <LiveBookStrip />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="System net" value={fmtUsd(live.systemNet)} tone={live.systemNet >= 0 ? "up" : "down"} hint={live.venueLabel} />
        <Kpi label="Owned legs" value={String(live.liveOwned)} hint={`${live.liveLong} long · ${live.liveShort} short`} />
        <Kpi label="Working" value={`${live.liveOrd}`} hint={`${live.liveSl} SL · ${live.liveTp} TP`} />
        <Kpi label="Occupied" value={`${live.occupied}`} hint={live.pingOk ? `ping ${live.latencyMs}ms` : "down"} tone={live.pingOk ? "up" : "down"} />
      </div>

      <Panel title="Coordinated controls">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <SliderRow label="Expand layers" value={expand} min={1} max={7} step={1} onChange={setExpand} />
          <SliderRow label="Flow" value={flow} min={0.4} max={2.4} step={0.1} onChange={setFlow} fmt={(n) => n.toFixed(1)} />
          <SliderRow label="PF gate" value={pfGate} min={0.5} max={2} step={0.05} onChange={setPfGate} fmt={(n) => n.toFixed(2)} />
          <SliderRow label="Block shared vol" value={vol} min={0.2} max={2} step={0.1} onChange={setVol} fmt={(n) => n.toFixed(1)} />
          <SliderRow label="Hold ticks" value={hold} min={8} max={48} step={1} onChange={setHold} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              setTacticConfig({ maxHoldTicks: Math.round(hold) });
              setBlockConfig({ sharedVolumeRatio: vol, overallVolumeRatio: vol });
            }}
          >
            Apply hold + Block vol
          </Button>
          <p className="self-center text-xs text-muted">
            Campus pipes scale immediately. Apply pushes hold {Math.round(hold)} and shared vol {vol.toFixed(1)} into the engine.
          </p>
        </div>
      </Panel>

      <Panel title="Campus" padded={false}>
        <LogisticsCampus
          live={campusLive}
          selected={selected}
          onSelect={setSelected}
          expand={expand}
          flow={flow}
          vol={vol}
          hold={hold}
          pfGate={pfGate}
          pf={live.pf}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel title={node.title} className="lg:col-span-3">
          <p className="text-sm text-muted">{node.role}</p>
          <p className="mt-2 font-mono text-xs text-subtle">{node.pipeline}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {node.subs.map((s) => (
              <div key={s.id} className="border border-border bg-surface-muted px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide">{s.name}</div>
                <p className="mt-1 text-sm text-muted">{s.info}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Live node" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-x-4">
            <StatLine k="Equity" v={fmtEquity(live.equity)} />
            <StatLine k="PF" v={fmtNum(live.pf, 2)} tone={live.pf >= pfGate ? "up" : "down"} />
            <StatLine k="Closed net" v={fmtUsd(live.closedNet)} />
            <StatLine k="Open net" v={fmtUsd(live.openNet)} />
            <StatLine k="Foreign pos" v={String(live.foreignPos)} />
            <StatLine k="Tactic" v={live.tactic} />
            <StatLine k="Range" v={live.range} />
            <StatLine k="Last" v={live.lastMsg || "—"} />
          </div>
        </Panel>
      </div>

      <Panel title="Progression course">
        <div className="flex min-w-0 gap-1 overflow-x-auto pb-2">
          {stages.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s.id as LogisticsNodeId)}
              className={`min-w-[5.5rem] flex-1 border px-2 py-3 text-left ${
                selected === s.id ? "border-primary bg-primary-soft" : "border-border bg-surface"
              }`}
            >
              <div className="text-[10px] uppercase tracking-widest text-subtle">
                {i + 1}/{stages.length}
              </div>
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="font-mono text-xs tabular text-muted">{s.n}</div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Seven-layer stack">
        <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {STACK.map((s) => (
            <li
              key={s.id}
              className={`border px-3 py-2 ${s.id < expand ? "border-primary bg-primary-soft" : "border-border"}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide">{s.name}</div>
              <p className="mt-1 text-sm text-muted">{s.detail}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
