import { useMemo } from "react";
import {
  applyAdjToStats,
  equitySeries,
  getBacktest,
  lastNEval,
  paramBounds,
  paramKey,
  STRATEGIES,
  strategyAdjMod,
  STRATEGY_KINDS,
  TACTIC_META,
  strategyMatchesKinds,
  INDICATION_CONFIGS,
  INDICATION_KINDS,
} from "@/lib/desk/engine";
import { useDesk } from "@/lib/desk/store";
import type { StrategyKind } from "@/lib/desk/types";
import { fmtNum, fmtUsd } from "@/lib/utils";
import { EquityChart } from "../charts";
import { Field, fmtMdd, fmtPf, fmtWr, Panel, pfTone, Pill, Segmented, StatLine } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

export function StrategiesView() {
  const symbol = useDesk((s) => s.symbol);
  const strategyId = useDesk((s) => s.strategyId);
  const setStrategy = useDesk((s) => s.setStrategy);
  const lastNs = useDesk((s) => s.lastNs);
  const tactic = useDesk((s) => s.tactic);
  const setTactic = useDesk((s) => s.setTactic);
  const params = useDesk((s) => s.strategyParams);
  const setParam = useDesk((s) => s.setStrategyParam);
  const resetParams = useDesk((s) => s.resetStrategyParams);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const toggleKind = useDesk((s) => s.toggleKind);

  const ranked = useMemo(() => {
    return STRATEGIES.filter((st) => strategyMatchesKinds(st, enabledKinds))
      .map((st) => {
      const bt = getBacktest(st.id, symbol);
      const adj = strategyAdjMod(st, params);
      const last = applyAdjToStats(lastNEval(bt, lastNs.picks), adj);
      return { st, bt, last, adj };
    }).sort((a, b) => (a.st.kind === "normal" ? -1 : b.st.kind === "normal" ? 1 : b.last.pf - a.last.pf));
  }, [symbol, lastNs.picks, params, enabledKinds]);

  const active = ranked.find((r) => r.st.id === strategyId) ?? ranked[0];
  const eq = useMemo(
    () => (active ? equitySeries(active.st.id, symbol) : []),
    [active?.st.id, symbol],
  );
  const dirty = active ? Object.keys(params).some((k) => k.startsWith(active.st.id + ":")) : false;

  if (!active) {
    return (
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Strategies</h1>
        <p className="text-sm text-muted">Enable Normal or another type to load playbooks.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Configs</p>
        <h1 className="text-2xl font-semibold tracking-tight">Strategies</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Normal is the general lane. Trend, Break, Active and Direction indications run independently on every
          set. Ranked by last {lastNs.picks} picks on {symbol}.
        </p>
      </div>

      <LiveBookStrip />

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Strategy types</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {STRATEGY_KINDS.map((k) => {
            const on = enabledKinds.includes(k.id);
            return (
              <button
                key={k.id}
                type="button"
                aria-pressed={on}
                title={k.blurb}
                onClick={() => toggleKind(k.id as StrategyKind)}
                className={`h-11 min-w-16 px-3 text-xs font-medium transition-colors duration-150 sm:h-8 ${
                  on ? "bg-primary text-primary-fg" : "bg-surface-muted text-muted hover:text-fg"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Independent indications</p>
        <p className="mt-1 text-xs text-muted">
          Trend, Break, Active and Direction configs process on every strategy set, including Normal.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {INDICATION_KINDS.map((k) => (
            <span key={k.id} className="h-8 border border-primary bg-primary-soft px-3 text-xs font-medium text-info leading-8">
              {k.label}
            </span>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {INDICATION_KINDS.map((k) => (
            <Panel key={k.id} title={k.label}>
              <ul className="text-xs text-muted">
                {INDICATION_CONFIGS.filter((c) => c.kind === k.id).map((c) => (
                  <li key={c.id} className="py-1">
                    {c.label}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Exit tactic</span>
        <Segmented
          value={tactic}
          onChange={setTactic}
          options={Object.entries(TACTIC_META).map(([id, m]) => ({
            id: id as typeof tactic,
            label: m.label,
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-2" title="Last N ranking" padded={false}>
          <ul>
            {ranked.map((row, i) => (
              <li key={row.st.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  onClick={() => setStrategy(row.st.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-bg ${
                    row.st.id === strategyId ? "bg-primary-soft" : ""
                  }`}
                >
                  <span className="w-5 font-mono text-xs text-subtle tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{row.st.name}</span>
                    <span className="block text-xs text-muted">
                      {row.st.kind === "normal" ? "Normal · general" : row.st.kind} · {row.last.trades} trades
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular">{fmtPf(row.last.pf)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4 lg:col-span-3">
          <Panel title={active.st.name}>
            <p className="text-sm text-muted">{active.st.thesis}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="accent">{active.st.kind === "normal" ? "Normal" : active.st.kind}</Pill>
              {active.st.kind === "normal" ? <Pill>No type adj</Pill> : null}
              {active.last.pf >= 1.2 ? (
                <Pill tone="up">Positive last N</Pill>
              ) : (
                <Pill tone="down">Below PF gate</Pill>
              )}
              {dirty ? <Pill tone="accent">Adjusted</Pill> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <StatLine k="PF" v={fmtPf(active.last.pf)} tone={pfTone(active.last.pf)} />
              <StatLine k="Win rate" v={fmtWr(active.last.wr)} />
              <StatLine k="Max DD" v={fmtMdd(active.last.mdd)} />
              <StatLine k="Net" v={fmtUsd(active.last.net)} tone={active.last.net >= 0 ? "up" : "down"} />
              <StatLine k="SQN" v={fmtNum(active.last.sqn, 2)} />
              <StatLine k="Volume factor" v={fmtNum(active.last.volumeFactor, 2)} />
            </div>
            <EquityChart data={eq} />
          </Panel>
          <Panel
            title="Indicator stack"
            action={
              dirty ? (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => resetParams(active.st.id)}
                >
                  Reset
                </button>
              ) : null
            }
          >
            <ul className="divide-y divide-border">
              {active.st.indicators.map((ind) => (
                <li key={ind.label} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{ind.label}</div>
                      <div className="text-xs uppercase tracking-wide text-subtle">{ind.id}</div>
                    </div>
                  </div>
                  {Object.keys(ind.params).length === 0 ? (
                    <p className="mt-2 text-xs text-muted">Session default — no knobs</p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-3">
                      {Object.entries(ind.params).map(([k, def]) => {
                        const key = paramKey(active.st.id, ind.label, k);
                        const bounds = paramBounds(k, def);
                        const value = params[key] ?? def;
                        return (
                          <Field key={key} label={`${k} ${Number(value).toFixed(bounds.step < 1 ? 1 : 0)}`}>
                            <input
                              type="range"
                              min={bounds.min}
                              max={bounds.max}
                              step={bounds.step}
                              value={value}
                              onChange={(e) => setParam(key, Number(e.target.value))}
                            />
                          </Field>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
