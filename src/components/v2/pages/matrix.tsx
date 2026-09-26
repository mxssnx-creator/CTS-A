import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { coreMatrix, coreResults } from "@/core/api";
import { BOTS } from "@/core/bots/bots";
import { INDICATIONS } from "@/core/indications/registry";
import { ArcDiagram, HeatGrid } from "../charts";
import { Empty, ErrorNote, fmt, Panel, Seg, usePoll } from "../ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function MatrixPage() {
  const { data, error } = usePoll(() => coreMatrix(), 20000);
  const [metric, setMetric] = useState<"pf" | "is_pf" | "gh">("pf");
  const nav = useNavigate();
  const d = data as Any;
  const rows = (d?.rows ?? []) as Any[];
  const byKey = useMemo(() => new Map(rows.map((r) => [`${r.bot}|${r.ind}`, r])), [rows]);
  const bots = BOTS.map((b) => b.type);
  const inds = ["none", ...INDICATIONS.map((i) => i.id)];
  const links = useMemo(
    () =>
      rows
        .filter((r) => r.ind !== "none" && r.n >= 8)
        .sort((a, b) => b.score - a.score)
        .slice(0, 60)
        .map((r) => ({ a: r.bot, b: r.ind, w: r.n, pf: r.pf, tip: `${r.bot} × ${r.ind} · n ${r.n} · PF ${fmt.pf(r.pf)} · net ${fmt.pct(r.net)}` })),
    [rows],
  );
  const usedInds = [...new Set(links.map((l) => l.b))];
  if (!d) return <>{error ? <ErrorNote error={error} /> : <Empty>Loading…</Empty>}</>;
  return (
    <>
      <ErrorNote error={error} />
      <Panel title="Relations" sub="top 60 Base relations by score — arc = bot × indication">
        {links.length ? <ArcDiagram links={links} left={bots.filter((b) => links.some((l) => l.a === b))} right={usedInds} /> : <Empty>No Base results yet</Empty>}
      </Panel>
      <Panel
        title="Bot × indication"
        sub="Base stage, default protect · click a cell to open its best configs"
        right={<Seg label="Metric" value={metric} onChange={setMetric} options={[{ value: "pf", label: "PF" }, { value: "is_pf", label: "IS PF" }, { value: "gh", label: "green h" }]} />}
      >
        <HeatGrid
          rows={bots}
          cols={inds}
          neutral={metric === "gh" ? 0.5 : 1}
          cell={(b, i) => {
            const r = byKey.get(`${b}|${i}`);
            if (!r) return null;
            const v = r[metric] as number;
            return { v, tip: `${b} × ${i} · n ${r.n} · PF ${fmt.pf(r.pf)} · IS PF ${fmt.pf(r.is_pf)} · net ${fmt.pct(r.net)} · green ${fmt.ratio(r.gh)}` };
          }}
          onPick={(b, i) => {
            void coreResults({ data: { bot: b, ind: i, sort: "score", limit: 1 } }).then((res) => {
              const id = (res as Any).rows?.[0]?.id;
              if (id) void nav({ to: "/v2/config/$id", params: { id } });
            });
          }}
        />
      </Panel>
    </>
  );
}
