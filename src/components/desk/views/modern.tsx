import { useMemo, useState } from "react";
import { Radar } from "lucide-react";
import { INDICATION_KINDS, STRATEGY_KINDS } from "@/lib/desk/engine";
import { LIVE_HOUR_NS, OVERVIEW_POS_NS } from "@/lib/desk/vst";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { pickLiveOverview } from "../live-exchange-stats";
import {
  HUD_THEMES,
  HudBars,
  HudDepthField,
  HudDisclose,
  HudGauge,
  HudPanel,
  HudRadar,
  mixHour18,
  useHudTheme,
} from "../hud-kit";
import { fmtUsd } from "@/lib/utils";
import { fmtPf, fmtWr } from "../widgets";
import { SpectraOverlay } from "../charts";
import { LiveBookStrip } from "../live-book-strip";

const HOUR_PATH = [1, 2, 4, 6, 8, 12, 18] as const;
const EXAMPLES = [
  { id: "lock", label: "Seed 0.48/0.75", blurb: "Independent winner · all performing cells still run" },
  { id: "lastn", label: "Last-N stack", blurb: "12 / 40 / 120 / 650 pos depth" },
  { id: "inds", label: "Indication mesh", blurb: "18h radar · color by PF" },
  { id: "block", label: "Block Δ", blurb: "Short vs Block extra" },
  { id: "pf", label: "PF lattice", blurb: "Overall / short / base / block" },
] as const;

type ExampleId = (typeof EXAMPLES)[number]["id"];
type CoordMode = "independent" | "combined" | "parallel";
type PfLane = "overall" | "short" | "base" | "block";

function hourVal(
  hours: Record<string, { pf?: number; n?: number; wr?: number; net?: number }> | undefined,
  h: number,
) {
  if (h === 18) return mixHour18(hours);
  return hours?.[String(h)] ?? { pf: 0, n: 0, wr: 0, net: 0 };
}

export function ModernView() {
  usePreserveScroll();
  const live = useLiveSnapshot();
  const { theme, setTheme } = useHudTheme();
  const view = pickLiveOverview(live.session, live.overall as { live?: unknown });
  const [example, setExample] = useState<ExampleId>("lock");
  const [coord, setCoord] = useState<CoordMode>("independent");
  const [pfLane, setPfLane] = useState<PfLane>("short");
  const [open, setOpen] = useState<string | null>("lastn");
  const hours = view.hours ?? {};
  const lastN = view.lastN ?? {};
  const indRows = useMemo(
    () =>
      INDICATION_KINDS.map((k) => {
        const b = (view.byIndication ?? []).find((r) => r.key === k.id);
        return { id: k.id, label: k.label, pf: Number(b?.pf || 0), n: Number(b?.n || 0) };
      }),
    [view.byIndication],
  );
  const playShort = (view.byPlaybook ?? []).find((r) => r.key === "short");
  const playBlock = (view.byPlaybook ?? []).find((r) => r.key === "block");
  const hourPf = HOUR_PATH.map((h) => Number(hourVal(hours, h).pf || 0));
  const hourWr = HOUR_PATH.map((h) => Number(hourVal(hours, h).wr || 0));
  const hourNet = HOUR_PATH.map((h) => Number(hourVal(hours, h).net || 0));
  const posLayers = OVERVIEW_POS_NS.map((n, i) => {
    const b = lastN[String(n)] ?? lastN[`n${n}`];
    const pf = Number(b?.pf || 0);
    const wr = Number(b?.wr || 0);
    const net = Number(b?.net || 0);
    return {
      id: `n${n}`,
      label: `N ${n}`,
      values: [pf, wr * 2, net],
      wide: i >= 2,
    };
  });
  const hourLayers = [
    { id: "pf", label: "PF", values: hourPf, wide: false },
    { id: "wr", label: "WR×2", values: hourWr.map((v) => v * 2), wide: false },
    { id: "net", label: "Net", values: hourNet, wide: true },
  ];
  const pfRead = {
    overall: Number(live.pf || view.pf || view.overall?.pf || 0),
    short: Number(playShort?.pf || live.pf || 0),
    base: Number((view.byKind ?? []).find((k) => k.key === "normal")?.pf || 0),
    block: Number(playBlock?.pf || 0),
  };
  const focus = pfRead[pfLane];
  const spectraA = HOUR_PATH.map((h, i) => ({ x: `${h}h`, y: hourPf[i] ?? 0 }));

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">Command grid</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Radar className="size-6 text-primary" />
            Modern
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            HUD of live last-N, 18h indication mesh, Block Δ and PF lanes. Theme stays on this page. Data is the same
            exchange tape as Statistics — no mock series.
          </p>
        </div>
      </div>
      <LiveBookStrip />

      <div className={`hud-frame p-3 sm:p-4`} data-theme={theme}>
        <div className="mb-3 flex flex-wrap gap-2">
          {HUD_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`min-h-11 border px-3 text-xs uppercase tracking-wide transition-[transform,border-color,color] duration-150 ease-out active:scale-[0.96] ${
                theme === t.id ? "border-[var(--hud-a)] text-[var(--hud-fg)]" : "border-[var(--hud-line)] text-[var(--hud-muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => setExample(ex.id)}
              className={`min-h-11 border px-3 text-left text-xs transition-[transform,border-color,color] duration-150 ease-out active:scale-[0.96] ${
                example === ex.id ? "border-[var(--hud-b)] text-[var(--hud-fg)]" : "border-[var(--hud-line)] text-[var(--hud-muted)]"
              }`}
            >
              <span className="block font-semibold uppercase tracking-wide">{ex.label}</span>
              <span className="text-[var(--hud-muted)]">{ex.blurb}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <HudPanel title="Field alignment" kicker="Core telemetry" className="lg:col-span-4">
            <HudGauge
              value={focus}
              label={`${pfLane} PF`}
              sub={`${live.venueLabel} · ${live.occupied} occ · ${live.liveOwned} owned`}
              max={2.4}
            />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {(Object.keys(pfRead) as PfLane[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPfLane(k)}
                  className={`min-h-11 border px-2 uppercase tracking-wide transition-[transform,border-color] duration-150 ease-out active:scale-[0.96] ${
                    pfLane === k ? "border-[var(--hud-a)]" : "border-[var(--hud-line)] text-[var(--hud-muted)]"
                  }`}
                >
                  {k} {fmtPf(pfRead[k])}
                </button>
              ))}
            </div>
          </HudPanel>

          <HudPanel title="A.I. navigation core" kicker="Indication mesh · 18h" className="lg:col-span-5">
            <HudRadar axes={indRows} />
            <p className="mt-2 text-xs text-[var(--hud-muted)]">
              Radius = PF / 2.4. Cyan = ≥1, orange = 0.85–1, rose = below. Empty n stays on the hub.
            </p>
          </HudPanel>

          <HudPanel title="System mesh" kicker="Live book" className="lg:col-span-3">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span className="text-[var(--hud-muted)]">Ping</span><span>{live.pingOk ? `${live.latencyMs} ms` : "down"}</span></li>
              <li className="flex justify-between"><span className="text-[var(--hud-muted)]">SL / TP</span><span>{live.liveSl} / {live.liveTp}</span></li>
              <li className="flex justify-between"><span className="text-[var(--hud-muted)]">Long / short</span><span>{live.liveLong} / {live.liveShort}</span></li>
              <li className="flex justify-between"><span className="text-[var(--hud-muted)]">System net</span><span>{fmtUsd(live.systemNet)}</span></li>
              <li className="flex justify-between"><span className="text-[var(--hud-muted)]">Closed n</span><span>{live.trades}</span></li>
              <li className="flex justify-between"><span className="text-[var(--hud-muted)]">WR</span><span>{fmtWr(live.wr)}</span></li>
            </ul>
          </HudPanel>

          {(example === "lastn" || example === "lock") && (
            <HudPanel title="Last-N depth" kicker="Wider ranges sit further back · orange" className="lg:col-span-7">
              <HudDepthField layers={posLayers} xLabels={["PF", "WR×2", "Net"]} />
            </HudPanel>
          )}
          {(example === "lock" || example === "pf" || example === "inds") && (
            <HudPanel title="18h transient" kicker="1 → 18h · PF / WR / net" className="lg:col-span-5">
              <HudDepthField layers={hourLayers} xLabels={HOUR_PATH.map((h) => `${h}h`)} />
            </HudPanel>
          )}

          <HudPanel title="Indication bars" kicker="Color by live PF" className="lg:col-span-5">
            <HudBars rows={indRows} />
          </HudPanel>
          <HudPanel title="Block Δ" kicker="With vs without extra" className="lg:col-span-7">
            <SpectraOverlay
              a={spectraA}
              b={HOUR_PATH.map((h) => ({ x: `${h}h`, y: Number(playBlock?.pf || 0) }))}
              aLabel="Short / lock"
              bLabel="Block extra"
            />
            <p className="mt-2 text-xs text-[var(--hud-muted)]">
              Short n {playShort?.n ?? 0} PF {fmtPf(Number(playShort?.pf || 0))} · Block n {playBlock?.n ?? 0} PF{" "}
              {fmtPf(Number(playBlock?.pf || 0))}
            </p>
          </HudPanel>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <p className="hud-kicker mb-2">Coordination</p>
            <div className="flex flex-wrap gap-2">
              {(["independent", "combined", "parallel"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCoord(m)}
                  className={`min-h-11 border px-3 text-xs uppercase tracking-wide transition-[transform,border-color] duration-150 ease-out active:scale-[0.96] ${
                    coord === m ? "border-[var(--hud-a)]" : "border-[var(--hud-line)] text-[var(--hud-muted)]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--hud-muted)]">
              {coord === "independent" && "Each last-N window votes alone. A red 12 does not veto a green 40."}
              {coord === "combined" && "Majority of last-N windows must pass. Used for disable."}
              {coord === "parallel" && "Independent or combined may arm. Stack adds volume when both pass."}
            </p>
          </div>
          <HudDisclose title="Last-N disclosure" kicker="12 / 40 / 120 / 650" open={open === "lastn"} onToggle={() => setOpen(open === "lastn" ? null : "lastn")}>
            <ul className="space-y-1 text-sm">
              {OVERVIEW_POS_NS.map((n) => {
                const b = lastN[String(n)] ?? lastN[`n${n}`];
                return (
                  <li key={n} className="flex justify-between font-mono">
                    <span>N {n}</span>
                    <span>
                      n {b?.n ?? 0} · PF {fmtPf(Number(b?.pf || 0))} · {fmtUsd(Number(b?.net || 0))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </HudDisclose>
          <HudDisclose title="Hour disclosure" kicker="incl. 18h mix" open={open === "hours"} onToggle={() => setOpen(open === "hours" ? null : "hours")}>
            <ul className="space-y-1 text-sm">
              {HOUR_PATH.map((h) => {
                const b = hourVal(hours, h);
                return (
                  <li key={h} className="flex justify-between font-mono">
                    <span>{h}h</span>
                    <span>
                      n {b.n ?? 0} · PF {fmtPf(Number(b.pf || 0))}
                    </span>
                  </li>
                );
              })}
              <li className="text-xs text-[var(--hud-muted)]">18h is mixed from 12h and 45h when the store has no 18h bucket.</li>
            </ul>
          </HudDisclose>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STRATEGY_KINDS.map((k) => {
            const b = (view.byKind ?? []).find((r) => r.key === k.id);
            return (
              <div key={k.id} className="hud-panel px-3 py-2">
                <p className="hud-kicker">{k.label}</p>
                <p className="font-mono text-lg">{fmtPf(Number(b?.pf || 0))}</p>
                <p className="text-xs text-[var(--hud-muted)]">n {b?.n ?? 0}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-[var(--hud-muted)]">
          Live hours in store: {LIVE_HOUR_NS.join("/")} · example {example} · coord {coord} · PF lane {pfLane} ·{" "}
          {live.hasLive ? "exchange tape" : "waiting for host session"}
        </p>
      </div>
    </div>
  );
}
