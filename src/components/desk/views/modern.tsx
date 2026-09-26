// Modern — command view of the live exchange tape: KPIs, hour path, last-N depth, indication mesh, playbooks,
// strategies, exits, sides, symbols and the live book. Same data as Statistics (session runner files); no mock
// series. HUD themes are selectable and stay on this page.
import { useMemo, type ReactNode } from "react";
import { Activity, Gauge, Radar, Wifi, WifiOff } from "lucide-react";
import { INDICATION_KINDS, STRATEGY_KINDS } from "@/lib/desk/engine";
import { LIVE_HOUR_NS, OVERVIEW_POS_NS } from "@/lib/desk/vst";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { pickLiveOverview } from "../live-exchange-stats";
import { HUD_THEMES, HudPanel, HudRadar, lerpPfColor, useHudTheme } from "../hud-kit";
import { fmtUsd } from "@/lib/utils";
import { fmtPf, fmtWr } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

type Bucket = { key?: string; n?: number; wins?: number; pf?: number; wr?: number; net?: number; ddt?: number; mdd?: number; symbols?: number; openN?: number };

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const ago = (t: number) => {
  if (!t) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${(s / 3600).toFixed(1)}h ago`;
};
const pfTone = (pf: number, n: number) => (n > 0 ? (pf >= 1 ? "text-[var(--hud-ok)]" : pf >= 0.85 ? "text-[var(--hud-b)]" : "text-[var(--hud-bad)]") : "text-[var(--hud-muted)]");

function Tile(props: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; children?: ReactNode }) {
  return (
    <div className="hud-panel relative min-w-0 overflow-hidden px-4 py-3">
      <p className="hud-kicker">{props.label}</p>
      <p className={`mt-1 truncate font-mono text-2xl font-semibold tabular-nums ${props.tone ?? ""}`}>{props.value}</p>
      {props.sub ? <p className="mt-0.5 truncate text-xs text-[var(--hud-muted)]">{props.sub}</p> : null}
      {props.children}
    </div>
  );
}

/** Horizontal PF bar on a 0 … 2.4 scale with the neutral 1.0 mark. */
function PfBar(props: { pf: number; n: number }) {
  const w = Math.max(0, Math.min(100, (props.pf / 2.4) * 100));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--hud-line)]" aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out" style={{ width: `${w}%`, background: lerpPfColor(props.pf, props.n) }} />
      <div className="absolute inset-y-0 w-px bg-[var(--hud-fg)] opacity-60" style={{ left: `${100 / 2.4}%` }} />
    </div>
  );
}

/** Hour windows as PF columns (height) with win rate dots and net under each column. */
function HourPath(props: { rows: Array<{ h: number; b: Bucket }> }) {
  const W = 640;
  const H = 180;
  const pad = 24;
  const colW = (W - pad * 2) / props.rows.length;
  const maxPf = Math.max(2, ...props.rows.map((r) => num(r.b.pf)));
  const y = (pf: number) => H - pad - (Math.min(pf, maxPf) / maxPf) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="w-full" role="img" aria-label="PF, win rate and net per hour window">
      {[0.5, 1, 1.5, 2, 3, 4].filter((v) => v <= maxPf).map((v) => (
        <g key={v}>
          <line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} stroke={v === 1 ? "var(--hud-fg)" : "var(--hud-grid)"} strokeOpacity={v === 1 ? 0.5 : 1} strokeDasharray={v === 1 ? "4 4" : undefined} />
          <text x={4} y={y(v) + 4} fontSize="10" fill="var(--hud-muted)">{v.toFixed(1)}</text>
        </g>
      ))}
      {props.rows.map((r, i) => {
        const pf = num(r.b.pf);
        const n = num(r.b.n);
        const x = pad + i * colW + colW * 0.2;
        const w = colW * 0.6;
        const top = n > 0 ? y(pf) : H - pad - 2;
        return (
          <g key={r.h}>
            <title>{`${r.h}h · n ${n} · PF ${fmtPf(pf)} · WR ${fmtWr(num(r.b.wr))} · net ${fmtUsd(num(r.b.net))}`}</title>
            <rect x={x} y={top} width={w} height={Math.max(2, H - pad - top)} rx={3} fill={lerpPfColor(pf, n)} opacity={0.85} />
            {n > 0 ? <circle cx={x + w / 2} cy={H - pad - num(r.b.wr) * (H - pad * 2)} r={3.5} fill="var(--hud-fg)" stroke="var(--hud-bg)" strokeWidth={2} /> : null}
            <text x={x + w / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--hud-fg)">{r.h}h</text>
            <text x={x + w / 2} y={H + 10} fontSize="10" textAnchor="middle" fill="var(--hud-muted)">{n ? `n ${n}` : "—"}</text>
            <text x={x + w / 2} y={H + 24} fontSize="10" textAnchor="middle" fill={num(r.b.net) >= 0 ? "var(--hud-ok)" : "var(--hud-bad)"}>{n ? fmtUsd(num(r.b.net)) : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

function RankList(props: { rows: Array<{ id: string; label: string; b: Bucket }>; empty: string }) {
  const rows = [...props.rows].sort((a, b) => num(b.b.n) - num(a.b.n) || num(b.b.pf) - num(a.b.pf));
  if (!rows.some((r) => num(r.b.n) > 0)) return <p className="text-sm text-[var(--hud-muted)]">{props.empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm">{r.label}</span>
          <span className={`font-mono text-sm tabular-nums ${pfTone(num(r.b.pf), num(r.b.n))}`}>{num(r.b.n) ? fmtPf(num(r.b.pf)) : "—"}</span>
          <PfBar pf={num(r.b.pf)} n={num(r.b.n)} />
          <span className="text-right font-mono text-xs text-[var(--hud-muted)] tabular-nums">n {num(r.b.n)} · {fmtUsd(num(r.b.net))}</span>
        </li>
      ))}
    </ul>
  );
}

function Stack(props: { parts: Array<{ label: string; n: number; color: string }>; label: string }) {
  const total = props.parts.reduce((a, p) => a + p.n, 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--hud-line)]" role="img" aria-label={props.label}>
        {total > 0 ? props.parts.map((p) => <div key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} title={`${p.label} ${p.n}`} />) : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {props.parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="text-[var(--hud-muted)]">{p.label}</span>
            <span className="font-mono tabular-nums">{p.n}</span>
            {total > 0 ? <span className="text-[var(--hud-muted)]">({Math.round((p.n / total) * 100)}%)</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ModernView() {
  usePreserveScroll();
  const live = useLiveSnapshot();
  const { theme, setTheme } = useHudTheme();
  const view = pickLiveOverview(live.session, live.overall as { live?: unknown });
  const hours = (view.hours ?? {}) as Record<string, Bucket>;
  const lastN = (view.lastN ?? {}) as Record<string, Bucket>;
  const find = (list: Bucket[] | undefined, key: string) => (list ?? []).find((r) => r.key === key) ?? {};

  const hourRows = useMemo(() => LIVE_HOUR_NS.map((h) => ({ h, b: hours[String(h)] ?? hours[`${h}h`] ?? {} })), [hours]);
  const indRows = useMemo(
    () => INDICATION_KINDS.map((k) => ({ id: k.id, label: k.label, b: find(view.byIndication as Bucket[], k.id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.byIndication],
  );
  const kindRows = STRATEGY_KINDS.map((k) => ({ id: k.id, label: k.label, b: find(view.byKind as Bucket[], k.id) }));
  const playRows = ((view.byPlaybook ?? []) as Bucket[]).map((b) => ({ id: String(b.key), label: String(b.key), b }));
  const reasons = (view.byReason ?? []) as Bucket[];
  const sides = (view.bySide ?? []) as Bucket[];
  const best = ((view.bestSymbols ?? []) as Bucket[]).slice(0, 5);
  const worst = ((view.worstSymbols ?? []) as Bucket[]).slice(0, 5);
  const overall = (view.overall ?? {}) as Bucket;
  const open = (view.open ?? {}) as Bucket;
  const pf = num(live.pf || view.pf || overall.pf);
  const trades = num(live.trades || overall.n);
  const reasonColor: Record<string, string> = { tp: "var(--hud-ok)", target: "var(--hud-ok)", trail: "var(--hud-a)", sl: "var(--hud-bad)", stop: "var(--hud-bad)", time: "var(--hud-b)" };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">Command grid</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Radar className="size-6 text-primary" />
            Modern
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The live exchange tape at a glance — hour path, last-N depth, indications, playbooks and the book. Same data as
            Statistics; nothing is simulated here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 ${live.pingOk ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400"}`}>
            {live.pingOk ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {live.venueLabel || live.conn || "no connection"} · {live.pingOk ? `${live.latencyMs} ms` : "down"}
          </span>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-muted">
            <Activity className="size-3.5" /> updated {ago(live.at)}
          </span>
        </div>
      </header>

      <LiveBookStrip />

      <div className="hud-frame rounded-xl p-3 sm:p-4" data-theme={theme}>
        <div className="mb-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="HUD theme">
          <span className="hud-kicker mr-1">Theme</span>
          {HUD_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              onClick={() => setTheme(t.id)}
              className={`min-h-9 rounded-full border px-3 text-xs transition-[transform,border-color,color] duration-150 ease-out active:scale-[0.96] ${
                theme === t.id ? "border-[var(--hud-a)] text-[var(--hud-fg)]" : "border-[var(--hud-line)] text-[var(--hud-muted)] hover:text-[var(--hud-fg)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!live.hasLive ? (
          <div className="hud-panel mb-4 flex items-start gap-3 px-4 py-3 text-sm">
            <Gauge className="mt-0.5 size-5 shrink-0 text-[var(--hud-b)]" />
            <div>
              <p className="font-semibold">Waiting for the live session</p>
              <p className="text-[var(--hud-muted)]">
                This view reads the exchange tape the session runner writes. Until it reports, every figure below stays empty
                instead of showing guessed values.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="System net" value={fmtUsd(num(live.systemNet))} tone={num(live.systemNet) >= 0 ? "text-[var(--hud-ok)]" : "text-[var(--hud-bad)]"} sub={`closed ${fmtUsd(num(live.closedNet))} · open ${fmtUsd(num(live.openNet))}`} />
          <Tile label="Profit factor" value={trades ? fmtPf(pf) : "—"} tone={pfTone(pf, trades)} sub="neutral 1.00">
            <div className="mt-2"><PfBar pf={pf} n={trades} /></div>
          </Tile>
          <Tile label="Win rate" value={trades ? fmtWr(num(live.wr)) : "—"} sub={`${trades} closed`} />
          <Tile label="Drawdown" value={fmtUsd(num(live.mdd || overall.mdd))} sub={`DDT ${num(overall.ddt).toFixed(1)} h`} />
          <Tile label="Open positions" value={num(live.livePos)} sub={`${num(live.liveLong)} long · ${num(live.liveShort)} short`}>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[var(--hud-line)]">
              <div style={{ width: `${live.livePos ? (live.liveLong / live.livePos) * 100 : 0}%`, background: "var(--hud-a)" }} />
              <div style={{ width: `${live.livePos ? (live.liveShort / live.livePos) * 100 : 0}%`, background: "var(--hud-b)" }} />
            </div>
          </Tile>
          <Tile label="Slots" value={`${num(live.occupied)}/${num(live.slots) || "—"}`} sub={`${num(live.liveOwned)} owned · ${num(live.liveOrd)} orders`} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <HudPanel title="Hour path" kicker="PF columns · WR dots · net per window" className="lg:col-span-8">
            <HourPath rows={hourRows} />
          </HudPanel>
          <HudPanel title="Last-N depth" kicker="Rolling windows of closed positions" className="lg:col-span-4">
            <ul className="space-y-3">
              {OVERVIEW_POS_NS.map((n) => {
                const b = lastN[String(n)] ?? lastN[`n${n}`] ?? {};
                return (
                  <li key={n}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">Last {n}</span>
                      <span className={`font-mono text-sm tabular-nums ${pfTone(num(b.pf), num(b.n))}`}>{num(b.n) ? `PF ${fmtPf(num(b.pf))}` : "—"}</span>
                    </div>
                    <div className="my-1"><PfBar pf={num(b.pf)} n={num(b.n)} /></div>
                    <p className="font-mono text-xs text-[var(--hud-muted)] tabular-nums">
                      n {num(b.n)} · WR {fmtWr(num(b.wr))} · {fmtUsd(num(b.net))}
                    </p>
                  </li>
                );
              })}
            </ul>
          </HudPanel>

          <HudPanel title="Indication mesh" kicker="Radius = PF / 2.4 · colour by PF" className="lg:col-span-5">
            <HudRadar axes={indRows.map((r) => ({ id: r.id, label: r.label, pf: num(r.b.pf), n: num(r.b.n) }))} />
          </HudPanel>
          <HudPanel title="Indications" kicker="Ranked by closed positions" className="lg:col-span-7">
            <RankList rows={indRows} empty="No closed positions per indication yet." />
          </HudPanel>

          <HudPanel title="Strategies" kicker="Per strategy kind" className="lg:col-span-6">
            <RankList rows={kindRows} empty="No closed positions per strategy yet." />
          </HudPanel>
          <HudPanel title="Playbooks" kicker="Normal · short · Block · DCA …" className="lg:col-span-6">
            <RankList rows={playRows} empty="No playbook results yet." />
          </HudPanel>

          <HudPanel title="Exits" kicker="Why positions closed" className="lg:col-span-4">
            <Stack label="Exit reasons" parts={reasons.map((r) => ({ label: String(r.key), n: num(r.n), color: reasonColor[String(r.key)] ?? "var(--hud-muted)" }))} />
          </HudPanel>
          <HudPanel title="Sides" kicker="Long vs short" className="lg:col-span-4">
            <div className="space-y-3">
              {(["long", "short"] as const).map((k) => {
                const b = find(sides, k);
                return (
                  <div key={k}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm capitalize">{k}</span>
                      <span className={`font-mono text-sm tabular-nums ${pfTone(num(b.pf), num(b.n))}`}>{num(b.n) ? `PF ${fmtPf(num(b.pf))}` : "—"}</span>
                    </div>
                    <div className="my-1"><PfBar pf={num(b.pf)} n={num(b.n)} /></div>
                    <p className="font-mono text-xs text-[var(--hud-muted)] tabular-nums">n {num(b.n)} · WR {fmtWr(num(b.wr))} · {fmtUsd(num(b.net))}</p>
                  </div>
                );
              })}
            </div>
          </HudPanel>
          <HudPanel title="Open book" kicker="Protection · leverage · ownership" className="lg:col-span-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--hud-muted)]">Open net</dt><dd className="text-right font-mono tabular-nums">{fmtUsd(num(open.net ?? live.openNet))}</dd>
              <dt className="text-[var(--hud-muted)]">SL / TP orders</dt><dd className="text-right font-mono tabular-nums">{num(live.liveSl)} / {num(live.liveTp)}</dd>
              <dt className="text-[var(--hud-muted)]">Leverage</dt><dd className="text-right font-mono tabular-nums">{num(live.liveLevMin)}–{num(live.liveLevMax)}× (⌀ {num(live.liveLevAvg).toFixed(1)})</dd>
              <dt className="text-[var(--hud-muted)]">Foreign pos / ord</dt><dd className="text-right font-mono tabular-nums">{num(live.foreignPos)} / {num(live.foreignOrd)}</dd>
              <dt className="text-[var(--hud-muted)]">Book hash</dt><dd className="truncate text-right font-mono text-xs">{live.bookHash || "—"}</dd>
              <dt className="text-[var(--hud-muted)]">Control hash</dt><dd className="truncate text-right font-mono text-xs">{live.ctlHash || "—"}</dd>
            </dl>
          </HudPanel>

          <HudPanel title="Best symbols" kicker="By net" className="lg:col-span-6">
            <RankList rows={best.map((b) => ({ id: String(b.key), label: String(b.key), b }))} empty="No symbol results yet." />
          </HudPanel>
          <HudPanel title="Weakest symbols" kicker="By net" className="lg:col-span-6">
            <RankList rows={worst.map((b) => ({ id: String(b.key), label: String(b.key), b }))} empty="No symbol results yet." />
          </HudPanel>
        </div>

        <p className="mt-4 text-xs text-[var(--hud-muted)]">
          {live.hasLive ? `Exchange tape · ${live.tactic || "—"} · ${live.range || "—"} · ${live.lastMsg || ""}` : "Waiting for the session runner"} · hour windows {LIVE_HOUR_NS.join(" / ")} h · last-N {OVERVIEW_POS_NS.join(" / ")}
        </p>
      </div>
    </div>
  );
}
