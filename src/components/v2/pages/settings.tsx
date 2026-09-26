import { useEffect, useState, type ReactNode } from "react";
import { coreSettings, coreStatus, saveCoreSettings } from "@/core/api";
import { GATE_PRESETS, STRATEGY_PRESETS } from "@/core/config";
import { Confirm, downloadFile, Empty, ErrorNote, Panel, Pill, Switch, usePoll } from "../ui";

type Any = any;

function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 3, fontSize: "var(--v-fs-sm)" }}>
      <span style={{ color: "var(--v-text-2)", fontWeight: 600 }}>{props.label}</span>
      {props.children}
      {props.hint && <span className="v2-muted" style={{ fontSize: "var(--v-fs-xs)" }}>{props.hint}</span>}
    </label>
  );
}

function Num(props: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; pct?: boolean }) {
  const toText = (v: number) => String(props.pct ? +(v * 100).toFixed(4) : v);
  const [text, setText] = useState(toText(props.value));
  const [focus, setFocus] = useState(false);
  // follow external changes (presets, import, reload) unless the user is typing
  useEffect(() => {
    if (!focus) setText(toText(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value, props.pct, focus]);
  const bad = text.trim() === "" || !Number.isFinite(Number(text)) || (props.min !== undefined && Number(text) < props.min) || (props.max !== undefined && Number(text) > props.max);
  return (
    <input
      className="v2-input"
      type="number"
      inputMode="decimal"
      step={props.step ?? (props.pct ? 0.01 : 1)}
      min={props.min}
      max={props.max}
      value={text}
      aria-invalid={bad}
      style={bad ? { borderColor: "var(--v-down)" } : undefined}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        if (bad) setText(toText(props.value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(v)) props.onChange(props.pct ? v / 100 : v);
      }}
    />
  );
}

function List(props: { value: readonly number[]; onChange: (v: number[]) => void; pct?: boolean }) {
  const [text, setText] = useState(props.value.map((v) => (props.pct ? +(v * 100).toFixed(4) : v)).join(", "));
  useEffect(() => setText(props.value.map((v) => (props.pct ? +(v * 100).toFixed(4) : v)).join(", ")), [props.value, props.pct]);
  return (
    <input
      className="v2-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const xs = text.split(/[,\s]+/).map(Number).filter((x) => Number.isFinite(x));
        if (xs.length) props.onChange(xs.map((x) => (props.pct ? x / 100 : x)));
      }}
    />
  );
}

const TOGGLE_HELP: Record<string, string> = {
  normal: "plain positions; off = only Block-adjusted ones execute (Base still computes all)",
  trailing: "trailing-stop variants; off = excluded from execution, still computed",
  block: "adds +ratio volume per passing last-n window (1..max)",
  blockActive: "Active: execute only Block level ≥ min (skip normal / lower levels)",
  dca: "adds legs at deeper levels, target re-anchored to the average",
  dcaActive: "Active: skip the base leg, trade only the higher-level (better-priced) fill",
};

export function SettingsPage() {
  const [s, setS] = useState<Any>(null);
  const [wf, setWf] = useState<Any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [base, setBase] = useState<string>("");
  const [ask, setAsk] = useState<null | "live" | "reset">(null);
  const [savedAt, setSavedAt] = useState(0);
  const { data: st } = usePoll(() => coreStatus(), 2500);
  const status = st as Any;
  const load = () =>
    coreSettings()
      .then((d: Any) => {
        setS(d.settings);
        setWf(d.wf);
        setBase(JSON.stringify({ settings: d.settings, wf: d.wf }));
      })
      .catch((e) => setError(String(e?.message ?? e)));
  useEffect(() => {
    void load();
  }, []);
  if (!s || !wf) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  const dirty = base !== "" && JSON.stringify({ settings: s, wf }) !== base;
  const applied = savedAt > 0 && status && status.appliedSettingsAt >= status.settingsAt && status.lastComputeAt >= savedAt && !status.pending;
  const applyState = !savedAt ? null : applied ? `applied in compute #${status.computes}` : status?.state === "computing" ? `applying… ${status.stage} ${Math.round((status.progress ?? 0) * 100)}%` : "applying…";
  const set = (path: string[], v: unknown) => {
    setS((prev: Any) => {
      const next = structuredClone(prev);
      let o = next;
      for (const k of path.slice(0, -1)) o = o[k];
      o[path[path.length - 1]] = v;
      return next;
    });
    setSaved(null);
  };
  const setW = (k: string, v: unknown) => {
    setWf((p: Any) => ({ ...p, [k]: v }));
    setSaved(null);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveCoreSettings({ data: { settings: s, wf } });
      setSavedAt(Date.now());
      setSaved("Saved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const importFile = (f: File) =>
    f.text().then((t) => {
      try {
        const j = JSON.parse(t);
        if (j.settings) setS(j.settings);
        if (j.wf) setWf(j.wf);
        setSaved("Imported — press Save to apply");
      } catch {
        setError("Not a settings JSON");
      }
    });
  return (
    <>
      <ErrorNote error={error} />
      <Confirm
        open={ask !== null}
        title={ask === "live" ? `Enable the Live stage on ${s.live.connId}?` : "Discard unsaved changes?"}
        danger={ask === "live"}
        confirm={ask === "live" ? "Enable Live" : "Discard"}
        body={
          ask === "live" ? (
            <>
              {s.live.connId === "bingx-x01" ? <p className="v2-down" style={{ fontWeight: 600 }}>This is the MAINNET account — real money.</p> : null}
              <p>Orders are only sent when the host also has CTS_CORE_LIVE=1 and API keys, and only while the rolling simulated run holds PF ≥ {s.gates.minPf} and is stable. Up to {s.live.maxPositions} positions of ${s.live.notionalUsd} each. Takes effect after Save.</p>
            </>
          ) : (
            "Your edits on this page are lost and the saved settings are loaded again."
          )
        }
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          if (ask === "live") set(["live", "enabled"], true);
          else void load();
          setAsk(null);
        }}
      />
      <Panel
        title="Settings"
        sub="stored in the in-memory SQLite (kv) and applied on the next compute"
        right={
          <>
            {dirty && <Pill kind="acc">unsaved changes</Pill>}
            {!dirty && saved && <Pill kind={applied ? "ok" : undefined}>{saved} · {applyState}</Pill>}
            <label className="v2-btn">
              Import
              <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <button type="button" className="v2-btn" onClick={() => downloadFile("cts-core-settings.json", JSON.stringify({ settings: s, wf }, null, 2))}>Export</button>
            <button type="button" className="v2-btn" disabled={!dirty} onClick={() => setAsk("reset")}>Discard</button>
            <button type="button" className="v2-btn primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          </>
        }
      >
        <div className="v2-grid v2-cols-4">
          <Field label="Timeframe" hint="bars; 15m cleared the 0.2% cost best in holdout tests">
            <select className="v2-select" value={s.tfMin} onChange={(e) => set(["tfMin"], Number(e.target.value))}>
              {[5, 15, 30, 60].map((m) => <option key={m} value={m}>{m}m</option>)}
            </select>
          </Field>
          <Field label="Symbols" hint="top by 24h quote volume"><Num value={s.symbols} min={2} max={120} onChange={(v) => set(["symbols"], v)} /></Field>
          <Field label="History (days)"><Num value={s.historyDays} min={2} max={30} onChange={(v) => set(["historyDays"], v)} /></Field>
          <Field label="Cycle (ms)"><Num value={s.cycleMs} step={1000} min={5000} onChange={(v) => set(["cycleMs"], v)} /></Field>
          <Field label="Position cost (round trip, %)" hint="0.20% = 0.1% per side × 2"><Num pct value={s.cost} onChange={(v) => set(["cost"], v)} /></Field>
          <Field label="Paper notional ($)"><Num value={s.paperNotional} onChange={(v) => set(["paperNotional"], v)} /></Field>
          <Field label="Main refine top"><Num value={s.refineTop} onChange={(v) => set(["refineTop"], v)} /></Field>
          <Field label="Evaluated top"><Num value={s.evalTop} onChange={(v) => set(["evalTop"], v)} /></Field>
        </div>
      </Panel>

      <div className="v2-grid v2-cols-2">
        <Panel title="Gates" sub="PF neutral = 1.00 · default min 1.10" right={
          <select className="v2-select" aria-label="Gate preset" onChange={(e) => e.target.value && set(["gates"], { ...GATE_PRESETS[e.target.value] })} defaultValue="">
            <option value="">preset…</option>
            {Object.keys(GATE_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        }>
          <div className="v2-grid v2-cols-2">
            <Field label="Min PF"><Num step={0.05} value={s.gates.minPf} onChange={(v) => set(["gates", "minPf"], v)} /></Field>
            <Field label="Max DDT (h per 72h)"><Num value={s.gates.maxDdtH} onChange={(v) => set(["gates", "maxDdtH"], v)} /></Field>
            <Field label="Min trades"><Num value={s.gates.minTrades} onChange={(v) => set(["gates", "minTrades"], v)} /></Field>
            <Field label="Eval quorum (0–1)"><Num step={0.05} value={s.gates.quorum} onChange={(v) => set(["gates", "quorum"], v)} /></Field>
          </div>
        </Panel>
        <Panel title="Strategies" sub="execution toggles — Base always computes every sub-strategy" right={
          <select className="v2-select" aria-label="Strategy preset" onChange={(e) => e.target.value && set(["toggles"], { ...STRATEGY_PRESETS[e.target.value].toggles })} defaultValue="">
            <option value="">preset…</option>
            {Object.entries(STRATEGY_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        }>
          <div className="v2-lines" style={{ gap: 8 }}>
            {Object.keys(TOGGLE_HELP).map((k) => (
              <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Switch label={k} checked={!!s.toggles[k]} onChange={(v) => set(["toggles", k], v)} />
                <div>
                  <div style={{ fontWeight: 600 }}>{k}</div>
                  <div className="v2-muted" style={{ fontSize: "var(--v-fs-xs)" }}>{TOGGLE_HELP[k]}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="v2-grid v2-cols-3">
        <Panel title="Block">
          <div className="v2-grid v2-cols-2">
            <Field label="Ratio per level"><Num step={0.05} value={s.block.ratio} onChange={(v) => set(["block", "ratio"], v)} /></Field>
            <Field label="Max level (last-n 1..N)"><Num value={s.block.maxLevel} min={1} max={12} onChange={(v) => set(["block", "maxLevel"], v)} /></Field>
            <Field label="Active min level"><Num value={s.block.minActiveLevel} min={1} onChange={(v) => set(["block", "minActiveLevel"], v)} /></Field>
            <Field label="Max multiple"><Num step={0.1} value={s.block.maxMult} onChange={(v) => set(["block", "maxMult"], v)} /></Field>
          </div>
        </Panel>
        <Panel title="DCA">
          <div className="v2-grid v2-cols-2">
            <Field label="Levels"><Num value={s.dca.levels} min={1} max={6} onChange={(v) => set(["dca", "levels"], v)} /></Field>
            <Field label="Step (%)"><Num pct value={s.dca.step} onChange={(v) => set(["dca", "step"], v)} /></Field>
          </div>
        </Panel>
        <Panel title="Protect grid" sub="every combination is its own independent tape">
          <div className="v2-grid" style={{ gap: 8 }}>
            <Field label="TP (%)"><List pct value={s.grid.tp} onChange={(v) => set(["grid", "tp"], v)} /></Field>
            <Field label="SL × TP (max ratio 2–2.5)"><List value={s.grid.slOfTp} onChange={(v) => set(["grid", "slOfTp"], v)} /></Field>
            <Field label="Trail share of TP (0 = off)"><List value={s.grid.trailOfTp} onChange={(v) => set(["grid", "trailOfTp"], v)} /></Field>
            <div className="v2-grid v2-cols-3">
              <Field label="Min trail (%)"><Num pct value={s.grid.minTrail} onChange={(v) => set(["grid", "minTrail"], v)} /></Field>
              <Field label="Min SL (%)"><Num pct value={s.grid.minSl} onChange={(v) => set(["grid", "minSl"], v)} /></Field>
              <Field label="Hold (h)"><List value={s.grid.holdH} onChange={(v) => set(["grid", "holdH"], v)} /></Field>
            </div>
          </div>
        </Panel>
      </div>

      <div className="v2-grid v2-cols-2">
        <Panel title="Real stage (walk-forward)" sub="pre-historic window, last-N and book limits">
          <div className="v2-grid v2-cols-3">
            <Field label="Pre-calc (h)" hint="configs must still work here"><Num value={wf.preH} onChange={(v) => setW("preH", v)} /></Field>
            <Field label="Long window (h)" hint="Main robustness window"><Num value={wf.longH} onChange={(v) => setW("longH", v)} /></Field>
            <Field label="Sim run (h)"><Num value={wf.simH} onChange={(v) => setW("simH", v)} /></Field>
            <Field label="Re-evaluate every (min)" hint="≥ 1 min; never finer than one bar (BingX has no sub-minute history)">
              <Num value={Math.round((wf.stepH ?? 1) * 60)} min={1} max={2880} onChange={(v) => setW("stepH", Math.max(1, v) / 60)} />
            </Field>
            <Field label="Portfolio size"><Num value={wf.portfolio} onChange={(v) => setW("portfolio", v)} /></Field>
            <Field label="Last-N (0 = off)"><Num value={wf.lastN} onChange={(v) => setW("lastN", v)} /></Field>
            <Field label="Last-N min PF"><Num step={0.05} value={wf.lastNMinPf} onChange={(v) => setW("lastNMinPf", v)} /></Field>
            <Field label="Robust share"><Num step={0.05} value={wf.robustFrac} onChange={(v) => setW("robustFrac", v)} /></Field>
            <Field label="Max / symbol"><Num value={wf.maxPerSymbol} onChange={(v) => setW("maxPerSymbol", v)} /></Field>
            <Field label="Max / side"><Num value={wf.maxPerSide} onChange={(v) => setW("maxPerSide", v)} /></Field>
            <Field label="Max open"><Num value={wf.maxOpen} onChange={(v) => setW("maxOpen", v)} /></Field>
            <Field label="Hour guard (%)" hint="0 = off"><Num step={0.1} value={wf.guardPct} onChange={(v) => setW("guardPct", v)} /></Field>
            <Field label="Rank by">
              <select className="v2-select" value={wf.rank} onChange={(e) => setW("rank", e.target.value)}>
                <option value="lcb">confidence bound</option>
                <option value="score">composite score</option>
              </select>
            </Field>
          </div>
        </Panel>
        <Panel title="Live stage" sub="off by default · also requires CTS_CORE_LIVE=1 on the host">
          <div className="v2-grid v2-cols-2">
            <Field label="Enabled">
              <Switch label="Live enabled" checked={!!s.live.enabled} onChange={(v) => (v ? setAsk("live") : set(["live", "enabled"], false))} />
            </Field>
            <Field label="Connection">
              <select className="v2-select" value={s.live.connId} onChange={(e) => set(["live", "connId"], e.target.value)}>
                <option value="bingx-vst-02">bingx-vst-02 (testnet)</option>
                <option value="bingx-vst-01">bingx-vst-01 (testnet)</option>
                <option value="bingx-x01">bingx-x01 (mainnet)</option>
              </select>
            </Field>
            <Field label="Notional per entry ($)"><Num value={s.live.notionalUsd} onChange={(v) => set(["live", "notionalUsd"], v)} /></Field>
            <Field label="Max positions"><Num value={s.live.maxPositions} onChange={(v) => set(["live", "maxPositions"], v)} /></Field>
          </div>
        </Panel>
      </div>
    </>
  );
}
