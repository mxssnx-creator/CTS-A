import { buildBlocks, TACTIC_META } from "@/lib/desk/engine";
import type { TacticKind } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot } from "@/lib/desk/live-ctx";
import { exchangeAsPositions, liveDeskBook, overallLiveStats } from "@/lib/desk/vst";
import { fmtNum, fmtUsd } from "@/lib/utils";
import { Field, fmtPf, Panel, Pill, StatLine } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

export function TacticsView() {
  const symbol = useDesk((s) => s.symbol);
  const lastNs = useDesk((s) => s.lastNs);
  const tactic = useDesk((s) => s.tactic);
  const setTactic = useDesk((s) => s.setTactic);
  const cfg = useDesk((s) => s.tacticConfig);
  const setCfg = useDesk((s) => s.setTacticConfig);
  const applyLive = useDesk((s) => s.applyLiveConfig);
  const vst = useDesk((s) => s.vst);
  const liveSnap = useLiveSnapshot();
  const exchange = liveSnap.exchange;
  const activeConnId = useDesk((s) => s.activeConnId);
  const costStep = useDesk((s) => s.costStep);

  const overall =
    (liveSnap.session?.overall as ReturnType<typeof overallLiveStats> | undefined) ??
    (liveSnap.overall?.live as ReturnType<typeof overallLiveStats> | undefined) ??
    (liveSnap.hasLive ? { byTactic: [] as { key: string; pf: number; n: number }[] } : overallLiveStats(vst));
  const byTactic = (t: TacticKind) => (overall.byTactic ?? []).find((r) => r.key === t);
  const best = (["trailing", "dca", "axis", "hybrid"] as TacticKind[])
    .map((t) => {
      const row = byTactic(t);
      return { t, pf: row?.pf ?? 0, n: row?.n ?? 0 };
    })
    .sort((a, b) => b.pf - a.pf || b.n - a.n);

  const live = liveDeskBook(vst, activeConnId, lastNs.last);
  const exPos = exchangeAsPositions(exchange);
  const pos = [...live.last, ...(exPos.length ? exPos : live.ongoing)];
  const blocks = buildBlocks(pos);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Execution</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tactics</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Trailing, DCA and Axis — plus a hybrid. Adjust the knobs; lanes and PF recompute immediately.
        </p>
      </div>

      <LiveBookStrip />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {best.map((b, i) => (
          <button
            key={b.t}
            type="button"
            onClick={() => setTactic(b.t)}
            className={`border px-4 py-3 text-left transition-[transform,background-color,border-color] duration-150 ease-out active:scale-[0.96] ${
              tactic === b.t ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{TACTIC_META[b.t].label}</span>
              {i === 0 && b.n > 0 ? <Pill tone="up">Best</Pill> : null}
            </div>
            <p className="mt-1 text-xs text-muted">{TACTIC_META[b.t].blurb}</p>
            <div className="mt-3 font-mono text-lg tabular">{fmtPf(b.pf)}</div>
            <div className="text-xs text-subtle">{b.n} live closes</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Adjust">
          <div className="flex flex-col gap-4">
            <Field label={`Trailing ${cfg.trailingPct.toFixed(1)}%`}>
              <input
                type="range"
                min={0.6}
                max={4}
                step={0.1}
                value={cfg.trailingPct}
                onChange={(e) => setCfg({ trailingPct: Number(e.target.value) })}
                onPointerUp={() => applyLive()}
              />
            </Field>
            <Field label="DCA off">
              <input type="range" min={1} max={1} step={1} value={1} disabled aria-label="DCA disabled" />
            </Field>
            <Field label={`DCA drawdown ${cfg.dcaDrawdown.toFixed(1)} ATR`}>
              <input
                type="range"
                min={0.4}
                max={3}
                step={0.1}
                value={cfg.dcaDrawdown}
                onChange={(e) => setCfg({ dcaDrawdown: Number(e.target.value) })}
                onPointerUp={() => applyLive()}
              />
            </Field>
            <Field label={`Axis spacing ${cfg.axisSpacing.toFixed(1)} ATR`}>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.1}
                value={cfg.axisSpacing}
                onChange={(e) => setCfg({ axisSpacing: Number(e.target.value) })}
                onPointerUp={() => applyLive()}
              />
            </Field>
            <Field label={`Axis levels ${cfg.axisLevels}`}>
              <input
                type="range"
                min={2}
                max={8}
                step={1}
                value={cfg.axisLevels}
                onChange={(e) => setCfg({ axisLevels: Number(e.target.value) })}
                onPointerUp={() => applyLive()}
              />
            </Field>
            <Field label={`Stop ATR ${cfg.slAtr.toFixed(2)}`}>
              <input
                type="range"
                min={0.8}
                max={2.2}
                step={0.05}
                value={cfg.slAtr}
                onChange={(e) => setCfg({ slAtr: Number(e.target.value) })}
                onPointerUp={() => applyLive()}
              />
            </Field>
            <Field label="Take-profit / stop">
              <span className="flex h-10 items-center font-mono text-sm tabular">
                {cfg.tpRatio.toFixed(2)}R · SL ≤ TP / ratio (0.25–3.00)
              </span>
            </Field>
          </div>
        </Panel>
        <Panel title="Block counts">
          <p className="mb-3 text-sm text-muted">
            Consecutive same-side fills form a block. Multiples are counted against cost {costStep}.
          </p>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted">No blocks.</p>
          ) : (
            <ul className="divide-y divide-border">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {b.id} · {b.side} · ×{b.multiple}
                  </span>
                  <span className="font-mono tabular">{fmtUsd(b.net)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-border pt-3">
            <StatLine k="Active tactic" v={TACTIC_META[tactic].label} />
            <StatLine k="Levels (DCA/axis)" v={String(Math.max(cfg.dcaCount, cfg.axisLevels))} />
            <StatLine k="Mean block multiple" v={fmtNum(blocks.length ? blocks.reduce((s, b) => s + b.multiple, 0) / blocks.length : 0, 1)} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
