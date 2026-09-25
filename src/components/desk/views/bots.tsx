import { useMemo } from "react";
import {
  BOT_HOURS,
  BOT_PARALLEL_CAP,
  BOT_SELECT_META,
  BOT_SELECT_MODES,
  BOT_SL_STEPS,
  BOT_STRATEGY_KEYS,
  BOT_SYMBOL_COUNTS,
  BOT_TP_STEPS,
  BOT_TRAIL_STEPS,
  BOT_TYPE_META,
  BOT_TYPES,
  BOT_VF_STEPS,
  LAST_HOUR_WINDOWS,
  LAST_POS_WINDOWS,
  VF_RECALC_RATIO,
  defaultBotConfig,
  liveBotDeskStats,
  liveBotFloors,
  liveBotTape,
  rankBotTypes,
  runParallelBots,
  type BotConfig,
  type BotHours,
  type BotReport,
  type BotSelectMode,
  type BotStrategyKey,
  type BotSymbolCount,
  type BotTypeId,
} from "@/lib/desk/bots";
import { useDesk } from "@/lib/desk/store";
import { fmtDur, runningMs } from "@/lib/desk/runtime-clock";
import { usePreserveScroll } from "@/lib/desk/live-ctx";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EquityChart, HourPfChart } from "../charts";
import { Field, fmtPf, fmtWr, Kpi, Panel, pfTone, Pill, Segmented, StatLine } from "../widgets";

const chip = "h-11 min-w-12 px-3 text-xs font-medium transition-colors duration-150 sm:h-8";
const chipOn = "bg-primary text-primary-fg";
const chipOff = "bg-surface-muted text-muted hover:text-fg";

const STRATEGY_LABEL: Record<BotStrategyKey, string> = {
  normal: "Normal",
  trailing: "Trailing",
  axis: "Axis",
  block: "Block",
  dca: "DCA",
};

function BotResultsColumn({ type, report }: { type: BotTypeId; report: BotReport }) {
  const meta = BOT_TYPE_META[type];
  const eq = report.hourly.map((h) => ({ i: h.hour, eq: h.eq }));
  const hourBars = report.hourly.map((h) => ({
    label: String(h.hour),
    value: h.empty ? 0 : h.pf,
    net: h.net,
    empty: h.empty,
  }));
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{meta.label}</h3>
        <Pill tone={report.liveStats.pf >= 1 ? "up" : "down"}>PF {fmtPf(report.liveStats.pf)}</Pill>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Live PF" value={fmtPf(report.liveStats.pf)} tone={pfTone(report.liveStats.pf) === "up" ? "up" : report.liveStats.pf < 1 ? "down" : "neutral"} hint={`${report.liveOrders} fills`} />
        <Kpi
          label="Hour green"
          value={`${report.hourSuccess}/${report.hourActive}`}
          tone={report.hourSuccess === report.hourActive && report.hourActive > 0 ? "up" : report.hourActive > 0 && report.hourSuccess / report.hourActive >= 0.95 ? "up" : "neutral"}
          hint={`${report.hourly.filter((h) => h.empty).length} empty = G0`}
        />
        <Kpi label="Net" value={fmtUsd(report.liveStats.net)} tone={report.liveStats.net >= 0 ? "up" : "down"} hint={`WR ${fmtWr(report.liveStats.wr)}`} />
        <Kpi label="Equity" value={fmtUsd(report.hourly[report.hourly.length - 1]?.eq ?? 10)} tone="neutral" hint={`from $10 · MDD ${fmtPct(report.liveStats.mdd, 1)}`} />
      </div>
      <Panel title={`${report.hours}h from $10`} padded>
        {[1, 6, 12, 18, 24].filter((h) => h <= report.hours).map((n) => {
          const s = report.hourly[n - 1];
          if (!s) return null;
          return (
            <StatLine
              key={`snap${n}`}
              k={`H${n}`}
              v={`${fmtUsd(s.eq)} · PF ${fmtPf(s.pf)} · n ${s.n} · ${s.net >= 0 ? "+" : ""}${fmtUsd(s.net)} · m ${fmtUsd(s.margin)}`}
              tone={s.green ? "up" : "down"}
            />
          );
        })}
      </Panel>
      <Panel title="Last pos / hours" padded>
        {LAST_POS_WINDOWS.map((n) => {
          const s = report.lastPos[String(n)];
          return (
            <StatLine
              key={`p${n}`}
              k={`Last ${n} pos`}
              v={`PF ${fmtPf(s?.pf ?? 0)} · n ${s?.n ?? 0} · DDT ${fmtNum(s?.ddt ?? 0, 0)}m`}
              tone={pfTone(s?.pf ?? 0)}
            />
          );
        })}
        {LAST_HOUR_WINDOWS.map((n) => {
          const s = report.lastHours[String(n)];
          return (
            <StatLine
              key={`h${n}`}
              k={`Last ${n}h`}
              v={`PF ${fmtPf(s?.pf ?? 0)} · n ${s?.n ?? 0} · DDT ${fmtNum(s?.ddt ?? 0, 0)}m`}
              tone={pfTone(s?.pf ?? 0)}
            />
          );
        })}
      </Panel>
      <Panel title="Hour PF">
        <HourPfChart data={hourBars} />
        <div className="mt-3 max-h-56 overflow-auto border-t border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface text-subtle">
              <tr>
                {["h", "eq", "PF", "n", "net", "margin"].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.hourly.map((h) => (
                <tr key={h.hour} className="border-t border-border">
                  <td className="px-2 py-1 font-mono tabular">{h.hour}</td>
                  <td className="px-2 py-1 font-mono tabular">{fmtUsd(h.eq)}</td>
                  <td className={`px-2 py-1 font-mono tabular ${h.empty ? "text-muted" : h.green ? "text-up" : "text-down"}`}>{h.empty ? "—" : fmtPf(h.pf)}</td>
                  <td className="px-2 py-1 font-mono tabular">{h.n}</td>
                  <td className={`px-2 py-1 font-mono tabular ${h.net >= 0 ? "text-up" : "text-down"}`}>{h.net >= 0 ? "+" : ""}{fmtUsd(h.net)}</td>
                  <td className="px-2 py-1 font-mono tabular">{fmtUsd(h.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Equity">
        <EquityChart data={eq} />
      </Panel>
      <Panel title="Strategies + last-N">
        {BOT_STRATEGY_KEYS.map((k) => {
          const st = report.strategies[k];
          return (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0">
              <span className="text-xs text-muted">
                {STRATEGY_LABEL[k]} {st.active ? <Pill tone="accent">Active</Pill> : <Pill>Intern</Pill>}
              </span>
              <span className="font-mono text-xs tabular">
                intern {fmtPf(st.intern.pf)} n {st.intern.n}
                {st.live ? ` · live ${fmtPf(st.live.pf)} n ${st.live.n}` : " · off"}
              </span>
            </div>
          );
        })}
        <div className="mt-2">
          <StatLine k="Overall 2+" v={report.overall.pass ? `Yes · ${report.overall.positive}/3` : `No · ${report.overall.positive}/3`} tone={report.overall.pass ? "up" : "down"} />
          <StatLine k="Overall PF" v={fmtPf(report.overall.pf)} tone={pfTone(report.overall.pf)} />
          <StatLine k="Gated PF" v={fmtPf(report.overall.gatedPf ?? 0)} tone={(report.overall.gatedPf ?? 0) >= 1 ? "up" : "down"} />
          <StatLine k="Complete" v={report.complete.coverage ? "Full grid" : "Partial"} />
        </div>
      </Panel>
    </div>
  );
}

export function BotsView() {
  usePreserveScroll();
  const bots = useDesk((s) => s.bots);
  const running = useDesk((s) => s.botsRunning);
  const activeConnId = useDesk((s) => s.activeConnId);
  const botByConn = useDesk((s) => s.botByConn);
  const vst = useDesk((s) => s.vst);
  const setSelected = useDesk((s) => s.setBotsSelected);
  const setHours = useDesk((s) => s.setBotsHours);
  const toggleArmed = useDesk((s) => s.toggleBotArmed);
  const setArmed = useDesk((s) => s.setBotsArmed);
  const patch = useDesk((s) => s.patchBotConfig);
  const startBot = useDesk((s) => s.startBot);
  const stopBot = useDesk((s) => s.stopBot);
  const selected = bots.selected;
  const cfg = bots.configs[selected] ?? defaultBotConfig(selected);
  const hours = bots.hours;
  const armed = bots.armed.length ? bots.armed : (["pivot", "magnet", "clamp"] as BotTypeId[]);

  const ranked = useMemo(() => rankBotTypes(12, 20260922, 10), []);
  const best = useMemo(() => ranked.slice(0, BOT_PARALLEL_CAP).map((r) => r.type), [ranked]);

  const parallel = useMemo(() => {
    if (running) return {} as ReturnType<typeof runParallelBots>;
    const cfgs: Partial<Record<BotTypeId, Partial<BotConfig>>> = {};
    for (const t of armed) cfgs[t] = bots.configs[t] ?? defaultBotConfig(t);
    return runParallelBots(armed, hours, 20260922, cfgs);
  }, [running, armed, hours, bots.configs]);

  const cols = armed.length <= 1 ? "grid-cols-1" : armed.length === 2 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 lg:grid-cols-3";
  const floors = liveBotFloors(cfg);
  const setCfg = (p: Partial<BotConfig>) => patch(selected, p);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Bots</p>
        <h1 className="text-2xl font-semibold tracking-tight">High-frequency bots</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Best three run side by side on the connection selected at the top. Each connection keeps its own bots, orders, and results.
        </p>
      </div>

      <Panel
        title={`Best ${BOT_PARALLEL_CAP} · independent parallel`}
        action={
          <span className="flex items-center gap-2">
            <button type="button" className={`${chip} ${chipOff}`} onClick={() => setArmed(best)}>
              Arm best {BOT_PARALLEL_CAP}
            </button>
            <Pill tone="accent">{armed.length}/{BOT_PARALLEL_CAP} selected</Pill>
          </span>
        }
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {best.map((t, i) => {
            const meta = BOT_TYPE_META[t];
            const row = ranked.find((r) => r.type === t)?.report.liveStats;
            const on = selected === t;
            const isArmed = armed.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelected(t)}
                className={`border px-4 py-3 text-left transition-[transform,background-color,border-color] duration-150 ease-out active:scale-[0.96] ${
                  on ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="flex items-center gap-1">
                    {i === 0 ? <Pill tone="accent">Best</Pill> : <Pill>#{i + 1}</Pill>}
                    {isArmed ? <Pill tone="up">On</Pill> : <Pill>Off</Pill>}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{meta.blurb}</p>
                <div className="mt-2 flex gap-3 font-mono text-xs tabular">
                  <span className={row && row.pf >= 1 ? "text-up" : "text-muted"}>PF {fmtPf(row?.pf ?? 0)}</span>
                  <span className="text-muted">n {row?.n ?? 0}</span>
                  {isArmed && running ? <span className="text-fg">{fmtDur(runningMs(`bot:${activeConnId}:${t}`))}</span> : null}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BOT_TYPES.map((t) => {
            const isArmed = armed.includes(t);
            const on = selected === t;
            const rank = ranked.findIndex((r) => r.type === t) + 1;
            const full = armed.length >= BOT_PARALLEL_CAP && !isArmed;
            return (
              <div key={t} className={`flex h-11 items-stretch overflow-hidden border sm:h-8 ${on ? "border-primary" : "border-border"}`}>
                <button
                  type="button"
                  onClick={() => setSelected(t)}
                  className={`flex items-center gap-2 px-3 text-xs ${on ? chipOn : chipOff}`}
                >
                  <span className="font-medium">{BOT_TYPE_META[t].label}</span>
                  <span className="font-mono tabular text-subtle">#{rank}</span>
                </button>
                <button
                  type="button"
                  disabled={full || (isArmed && armed.length <= 1)}
                  onClick={() => toggleArmed(t)}
                  className={`border-l border-border px-2 text-[10px] font-medium uppercase tracking-wide ${
                    isArmed ? "bg-up-soft text-up" : "bg-surface-muted text-muted"
                  } disabled:opacity-40`}
                >
                  {isArmed ? "On" : full ? "Full" : "Select"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Click a type to focus its options. Use Select to arm it into the parallel set (max {BOT_PARALLEL_CAP}). Results below only use selected types — tapes never mix.
        </p>
      </Panel>

      <Panel title={`${BOT_TYPE_META[selected].label} options`}>
        <p className="mb-3 text-xs text-muted">{BOT_TYPE_META[selected].thesis}</p>
        <div className="grid gap-3 lg:grid-cols-5">
          <Field label="Symbol count">
            <div className="flex flex-wrap gap-1">
              {BOT_SYMBOL_COUNTS.map((n) => (
                <button key={n} type="button" className={`${chip} ${cfg.symbolCount === n ? chipOn : chipOff}`} onClick={() => setCfg({ symbolCount: n as BotSymbolCount })}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Selection">
            <select
              className="h-10 w-full border border-border bg-surface px-3 text-sm"
              value={cfg.selectMode}
              onChange={(e) => setCfg({ selectMode: e.target.value as BotSelectMode })}
            >
              {BOT_SELECT_MODES.map((m) => (
                <option key={m} value={m}>
                  {BOT_SELECT_META[m].label}
                </option>
              ))}
            </select>
            <span className="text-xs text-subtle">{BOT_SELECT_META[cfg.selectMode].blurb}</span>
          </Field>
          <Field label="Min take-profit %">
            <div className="flex flex-wrap gap-1">
              {BOT_TP_STEPS.map((n) => (
                <button key={n} type="button" className={`${chip} ${cfg.minTp === n ? chipOn : chipOff}`} onClick={() => setCfg({ minTp: n })}>
                  {n.toFixed(1)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Min stop-loss %">
            <div className="flex flex-wrap gap-1">
              {BOT_SL_STEPS.map((n) => (
                <button key={n} type="button" className={`${chip} ${cfg.minSl === n ? chipOn : chipOff}`} onClick={() => setCfg({ minSl: n })}>
                  {n.toFixed(1)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Min trail distance %">
            <div className="flex flex-wrap gap-1">
              {BOT_TRAIL_STEPS.map((n) => (
                <button key={n} type="button" className={`${chip} ${cfg.minTrail === n ? chipOn : chipOff}`} onClick={() => setCfg({ minTrail: n })}>
                  {n.toFixed(1)}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <Field label={`Volume factor (recalc +${Math.round(VF_RECALC_RATIO * 100)}% equity)`} className="min-w-56 flex-1">
            <div className="flex flex-wrap gap-1">
              {BOT_VF_STEPS.map((n) => (
                <button key={n} type="button" className={`${chip} ${cfg.volumeFactor === n ? chipOn : chipOff}`} onClick={() => setCfg({ volumeFactor: n })}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex gap-2">
            <Button type="button" onClick={() => startBot()} disabled={running}>
              Start
            </Button>
            <Button type="button" variant="secondary" onClick={() => stopBot()} disabled={!running}>
              Stop
            </Button>
          </div>
          <Pill tone={running ? "up" : "neutral"}>{running ? "Live" : "Stopped"}</Pill>
          <span className="text-xs text-muted">
            {activeConnId === "bingx-x01" ? "Live mainnet x01" : activeConnId}
            {running ? ` · ${armed.length} bots on this connection` : " · this connection is stopped"}
            {Object.entries(botByConn).some(([id, s]) => id !== activeConnId && s.running) ? " · other connections still running" : ""}
            {" · "}
            Focused {BOT_TYPE_META[selected].label}
            {armed.includes(selected) ? " · selected for parallel" : " · not in parallel set"}
            · live TP {floors.tpAtr.toFixed(2)}% · SL/TP {floors.slOfTp.toFixed(2)} · trail {floors.trailPct.toFixed(1)}%
          </span>
        </div>
        {running ? (
          <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
            {armed.map((t) => {
              const st = liveBotDeskStats(vst, t);
              return (
                <div key={t} className="border border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{BOT_TYPE_META[t].label}</span>
                    <Pill tone={st.n > 0 && st.pf >= 1 ? "up" : st.n > 0 ? "down" : "neutral"}>{st.n ? `PF ${fmtPf(st.pf)}` : "arming"}</Pill>
                  </div>
                  <p className="mt-1 font-mono text-xs tabular text-muted">
                    fills {st.n} · open {st.open} · working {st.orders}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium text-muted">Strategies — intern always scores; live execute only when Active</p>
          <div className="flex flex-wrap gap-2">
            {BOT_STRATEGY_KEYS.map((k) => {
              const on = cfg.strategies[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCfg({ strategies: { ...cfg.strategies, [k]: !on } })}
                  className={`h-11 px-3 text-xs font-medium sm:h-8 ${on ? chipOn : chipOff}`}
                >
                  {STRATEGY_LABEL[k]} {on ? "Active" : "Off"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <Field label="Backtest last hours">
            <Segmented
              value={String(hours)}
              onChange={(v) => setHours(Number(v) as BotHours)}
              options={BOT_HOURS.map((h) => ({ id: String(h), label: `${h}h` }))}
            />
          </Field>
        </div>
      </Panel>

      <Panel title={running ? "Live tape · selected types" : "Independent results · selected types only"} action={<span className="text-xs text-muted">{running ? "Desk clock · tapes stay separate" : "Tapes never mix"}</span>}>
        {running ? (
          <div className="mb-4 border border-border px-3 py-2">
            <p className="text-xs text-muted">Open on {activeConnId}</p>
            <ul className="mt-2 divide-y divide-border text-sm">
              {vst.positions.filter((p) => p.connId === activeConnId && p.qty > 0 && String(p.playbook || "").startsWith("bot:")).slice(0, 16).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="font-mono text-xs">{p.symbol.replace("USDT", "")}</span>
                  <span className="capitalize">{p.side}</span>
                  <span className="text-muted">{String(p.playbook || "").replace("bot:", "")}</span>
                </li>
              ))}
            </ul>
            {vst.positions.some((p) => p.connId === activeConnId && p.qty > 0 && String(p.playbook || "").startsWith("bot:")) ? null : (
              <p className="mt-2 text-xs text-muted">Waiting for the first fill on this connection.</p>
            )}
          </div>
        ) : null}
        {running ? (
          <div className={`grid gap-4 ${cols}`}>
            {armed.map((t) => {
              const tape = liveBotTape(vst, t, activeConnId);
              return (
                <div key={t} className="flex min-w-0 flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{BOT_TYPE_META[t].label}</h3>
                    <Pill tone={tape.stats.n > 0 && tape.stats.pf >= 1 ? "up" : tape.stats.n > 0 ? "down" : "neutral"}>
                      {tape.stats.n ? `PF ${fmtPf(tape.stats.pf)}` : "Live"}
                    </Pill>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Kpi label="Live PF" value={fmtPf(tape.stats.pf)} tone={tape.stats.n > 0 && tape.stats.pf >= 1 ? "up" : tape.stats.n > 0 ? "down" : "neutral"} hint={`${tape.stats.n} fills`} />
                    <Kpi label="Open" value={String(tape.stats.open)} tone="neutral" hint={`${tape.stats.orders} working`} />
                  </div>
                  <Panel title="Hour by hour" padded>
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface text-subtle">
                          <tr>
                            {["h", "eq", "PF", "n", "net"].map((h) => (
                              <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tape.hours.map((h) => (
                            <tr key={h.hour} className="border-t border-border">
                              <td className="px-2 py-1 font-mono tabular">{h.hour}</td>
                              <td className="px-2 py-1 font-mono tabular">{fmtUsd(h.eq)}</td>
                              <td className={`px-2 py-1 font-mono tabular ${h.n === 0 ? "text-muted" : h.pf >= 1 ? "text-up" : "text-down"}`}>{h.n ? fmtPf(h.pf) : "—"}</td>
                              <td className="px-2 py-1 font-mono tabular">{h.n}</td>
                              <td className={`px-2 py-1 font-mono tabular ${h.net >= 0 ? "text-up" : "text-down"}`}>{h.net >= 0 ? "+" : ""}{fmtUsd(h.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </div>
              );
            })}
          </div>
        ) : (
        <div className={`grid gap-4 ${cols}`}>
          {armed.map((t) => {
            const report = parallel[t];
            if (!report) return null;
            return <BotResultsColumn key={t} type={t} report={report} />;
          })}
        </div>
        )}
      </Panel>
    </div>
  );
}
