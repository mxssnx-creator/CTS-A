import { useState } from "react";
import { Cable, Radio, Unplug } from "lucide-react";
import { ORDER_TYPES, orderTypesForVenue } from "@/lib/desk/engine";
import { VST_MAX_POSITIONS, VST_MAX_SYMBOLS, VST_SYMBOLS } from "@/lib/desk/vst";
import { MAX_LIVE_NOTIONAL } from "@/lib/desk/feed";
import type { NetworkMode, OrderTypeId, Side } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { cn, fmtPx, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { controlClass, Field, Panel, Pill, StatLine } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

export function ConnectionsView() {
  usePreserveScroll();
  const connections = useDesk((s) => s.connections);
  const testConnection = useDesk((s) => s.testConnection);
  const setStatus = useDesk((s) => s.setConnectionStatus);
  const toggleOrder = useDesk((s) => s.toggleOrderType);
  const toggleSym = useDesk((s) => s.toggleSymbolOnConn);
  const place = useDesk((s) => s.placePaperOrder);
  const cancel = useDesk((s) => s.cancelOrder);
  const orders = useDesk((s) => s.orders);
  const ticketMsg = useDesk((s) => s.ticketMsg);
  const symbol = useDesk((s) => s.symbol);
  const costStep = useDesk((s) => s.costStep);
  const liveTape = useDesk((s) => s.liveTape);
  const setLiveTape = useDesk((s) => s.setLiveTape);
  const feed = useDesk((s) => s.feed);
  const mark = useDesk((s) => s.vst.quotes[s.symbol]?.px);
  const setNetwork = useDesk((s) => s.setNetwork);
  const setConnKeys = useDesk((s) => s.setConnKeys);
  const armMainnet = useDesk((s) => s.armMainnet);
  const pingLive = useDesk((s) => s.pingLive);
  const orderType = useDesk((s) => s.orderType);
  const setOrderType = useDesk((s) => s.setOrderType);
  const symbolCount = useDesk((s) => s.symbolCount);
  const setSymbolCount = useDesk((s) => s.setSymbolCount);
  const activeConnId = useDesk((s) => s.activeConnId);
  const setActiveConn = useDesk((s) => s.setActiveConn);
  const liveSnap = useLiveSnapshot();
  const exchange = liveSnap.exchange;

  const [side, setSide] = useState<Side>("long");
  const [keys, setKeys] = useState<Record<string, { apiKey: string; secret: string }>>({});

  const connId = activeConnId;
  const conn = connections.find((c) => c.id === connId) ?? connections[0];
  const live = Boolean(conn?.armed && conn.network !== "paper");
  const venueTypes = conn
    ? orderTypesForVenue(conn.venue, conn.orderTypesEnabled)
    : ORDER_TYPES;
  const otype = venueTypes.some((ot) => ot.id === orderType) ? orderType : (venueTypes[0]?.id ?? "market");

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Venues</p>
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Live BingX VST-02 is the default session. Tape, ping and the exchange book come from BingX.
          Tickets, cancels, stops and rearms apply only to the current session.
        </p>
      </div>

      <LiveBookStrip />

      {live ? (
        <Panel title="Live execution armed">
          <p className="text-sm text-muted">
            {conn?.label} will send signed BingX {conn?.network} orders. Cap {MAX_LIVE_NOTIONAL} USDT.
            Uncheck Arm to return to paper.
          </p>
        </Panel>
      ) : null}

      {liveSnap.hasLive ? (
        <Panel title={`BingX book · ${connId}`}>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <StatLine k="Equity" v={liveSnap.equity ? fmtUsd(liveSnap.equity, 0) : "—"} />
            <StatLine k="Positions" v={String(liveSnap.livePos)} />
            <StatLine k="Orders" v={String(liveSnap.liveOrd)} />
            <StatLine k="Ping" v={liveSnap.pingOk ? (liveSnap.latencyMs ? `${liveSnap.latencyMs} ms` : "ok") : "connecting"} />
          </div>
        </Panel>
      ) : (
        <Panel title="BingX book">
          <p className="text-sm text-muted">{exchange?.error ?? "Connecting VST-02…"}</p>
        </Panel>
      )}

      <Panel title="Market tape">
        <div className="flex flex-wrap items-center gap-3">
          <Pill tone={feed.state === "live" ? "up" : feed.state === "error" ? "down" : "accent"}>
            {feed.state} · {feed.count} symbols · {feed.latencyMs} ms
          </Pill>
          {feed.missing ? <Pill>{feed.missing} unmapped</Pill> : null}
          <Button size="sm" variant={liveTape ? "primary" : "secondary"} onClick={() => setLiveTape(!liveTape)}>
            {liveTape ? "Tape on" : "Tape off"}
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted">
          Public BingX swap tickers (VST host first, mainnet fallback). FTM / TON / MKR are not listed
          on BingX USDT perps, so they stay on the last quoted walk.
        </p>
      </Panel>

      <Panel title="Universe & exchange types">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Symbol count ${symbolCount}`}>
            <input
              type="range"
              min={8}
              max={VST_MAX_SYMBOLS}
              step={1}
              value={symbolCount}
              onChange={(e) => setSymbolCount(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-muted">
              VST arms the first {symbolCount} of {VST_SYMBOLS.length} mapped BingX perps.
            </p>
          </Field>
          <Field label="Desk order type">
            <select
              className={controlClass}
              value={otype}
              onChange={(e) => setOrderType(e.target.value as OrderTypeId)}
            >
              {venueTypes.map((ot) => (
                <option key={ot.id} value={ot.id}>
                  {ot.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Types come from the selected {conn?.venue ?? "bingx"} session. Disabled types on that
              exchange are hidden.
            </p>
          </Field>
        </div>
      </Panel>

      <Panel title={live ? "Live ticket" : "Paper ticket"}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Venue">
            <select
              className={controlClass}
              value={connId}
              onChange={(e) => setActiveConn(e.target.value)}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Side">
            <select
              className={controlClass}
              value={side}
              onChange={(e) => setSide(e.target.value as Side)}
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </Field>
          <Field label="Order type">
            <select
              className={controlClass}
              value={otype}
              onChange={(e) => setOrderType(e.target.value as OrderTypeId)}
            >
              {venueTypes.map((ot) => (
                <option key={ot.id} value={ot.id}>
                  {ot.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mark">
            <span className="flex h-10 items-center font-mono text-sm tabular">{fmtPx(mark ?? 0)}</span>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant={live ? "danger" : "primary"}
            onClick={() => {
              if (live) {
                const ok = window.confirm(
                  `Send a live ${conn?.network} ${side} ${symbol} ticket for ${costStep} USDT? Cap ${MAX_LIVE_NOTIONAL} USDT. This hits BingX.`,
                );
                if (!ok) return;
              }
              place({
                connId,
                symbol,
                side,
                type: otype,
                cost: costStep,
                price: mark,
                note: live ? "Live ticket" : "Paper ticket",
              });
            }}
          >
            {live ? "Send live" : "Submit paper"} · cost {costStep}
          </Button>
          <span className="text-xs text-muted">
            {conn?.label} · {symbol} · {conn?.network} · {conn?.armed ? "armed" : "safe"}
          </span>
        </div>
        {ticketMsg ? <p className="mt-3 text-sm text-fg">{ticketMsg}</p> : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {connections.map((c) => {
          const current = c.id === connId;
          return (
          <Panel
            key={c.id}
            className={current ? "ring-2 ring-primary" : undefined}
            title={c.label}
            action={
              <div className="flex items-center gap-2">
                {current ? <Pill tone="accent">current</Pill> : null}
                <Pill tone={c.armed ? "down" : c.status === "connected" ? "up" : c.status === "testing" ? "accent" : "down"}>
                  {c.armed ? "ARMED" : c.status}
                </Pill>
              </div>
            }
          >
            <button
              type="button"
              className="mb-3 text-xs font-medium text-primary hover:underline"
              onClick={() => setActiveConn(c.id)}
            >
              {current ? "This session handles the book" : "Use this session"}
            </button>
            <div className="flex items-center gap-3 text-sm">
              <Cable className="size-4 text-primary" />
              <span className="font-medium uppercase">{c.venue}</span>
              <span className="text-muted">{c.network}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4">
              <StatLine k="API key" v={c.apiKeyMasked} />
              <StatLine k="Ping" v={`${c.lastPingMs} ms`} />
              <StatLine k="Open orders" v={`${c.openOrderCount}`} />
              <StatLine k="Positions" v={`${c.positionCount} / ${c.maxPositions}`} />
              <StatLine k="Rate" v={`${c.rateLimitUsed} / ${c.rateLimitMax}`} />
              <StatLine k="Symbols" v={`${c.symbols.length} / ${c.maxSymbols || VST_MAX_SYMBOLS}`} />
              <StatLine k="Order cap" v={c.unlimitedOrders ? "Unlimited" : "Capped"} />
              <StatLine k="Keys" v={c.hasKeys ? "Loaded" : "None"} />
            </div>

            <Field label="Network" className="mt-4">
              <select
                className={controlClass}
                value={c.network}
                onChange={(e) => setNetwork(c.id, e.target.value as NetworkMode)}
              >
                <option value="paper">Paper</option>
                <option value="testnet">BingX VST / testnet</option>
                <option value="mainnet">BingX mainnet</option>
              </select>
            </Field>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="API key">
                <input
                  className={controlClass}
                  autoComplete="off"
                  spellCheck={false}
                  value={keys[c.id]?.apiKey ?? ""}
                  onChange={(e) =>
                    setKeys((prev) => ({
                      ...prev,
                      [c.id]: { apiKey: e.target.value, secret: prev[c.id]?.secret ?? "" },
                    }))
                  }
                />
              </Field>
              <Field label="Secret">
                <input
                  className={controlClass}
                  type="password"
                  autoComplete="off"
                  value={keys[c.id]?.secret ?? ""}
                  onChange={(e) =>
                    setKeys((prev) => ({
                      ...prev,
                      [c.id]: { apiKey: prev[c.id]?.apiKey ?? "", secret: e.target.value },
                    }))
                  }
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConnKeys(c.id, keys[c.id]?.apiKey ?? "", keys[c.id]?.secret ?? "")}
              >
                Save keys
              </Button>
              <Button size="sm" onClick={() => pingLive(c.id)} disabled={c.status === "testing"}>
                <Radio className="size-4" />
                Ping account
              </Button>
              <Button size="sm" onClick={() => testConnection(c.id)} disabled={c.status === "testing"}>
                Test session
              </Button>
              {c.status === "connected" ? (
                <Button size="sm" variant="secondary" onClick={() => setStatus(c.id, "disconnected")}>
                  <Unplug className="size-4" />
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => pingLive(c.id)}>
                  Connect
                </Button>
              )}
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={c.armed}
                disabled={!c.hasKeys || c.network === "paper"}
                onChange={(e) => armMainnet(c.id, e.target.checked)}
              />
              <span>
                Arm live orders on this session. Real fills, $50 notional cap. Keys never leave this
                browser except on the signed ping/order call.
              </span>
            </label>


            <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-subtle">Order types</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {ORDER_TYPES.map((ot) => {
                const on = c.orderTypesEnabled.includes(ot.id as OrderTypeId);
                return (
                  <button
                    key={ot.id}
                    type="button"
                    onClick={() => toggleOrder(c.id, ot.id)}
                    className={cn(
                      "h-8 border px-3 text-xs font-medium",
                      on ? "border-primary bg-primary-soft text-info" : "border-border text-muted",
                    )}
                  >
                    {ot.label}
                  </button>
                );
              })}
            </div>

            <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-subtle">Symbols</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {VST_SYMBOLS.map((s) => {
                const on = c.symbols.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSym(c.id, s.id)}
                    className={cn(
                      "h-8 border px-2 font-mono text-[11px]",
                      on ? "border-primary bg-primary text-primary-fg" : "border-border text-muted",
                    )}
                  >
                    {s.base}
                  </button>
                );
              })}
            </div>
          </Panel>
        );
        })}
      </div>

      <Panel title={`Order log · ${conn?.label ?? "session"}`} padded={false}>
        {orders.filter((o) => o.connId === connId).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No tickets on this session. Other connections are left alone.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-lg text-left text-sm">
              <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Id</th>
                  <th className="px-2 py-2">Venue</th>
                  <th className="px-2 py-2">Symbol</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Cost</th>
                  <th className="px-2 py-2">Px</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.filter((o) => o.connId === connId).map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">{o.id.slice(-10)}</td>
                    <td className="px-2 py-2 uppercase">{o.venue}</td>
                    <td className="px-2 py-2 font-mono">{o.symbol}</td>
                    <td className="px-2 py-2 capitalize">{o.side}</td>
                    <td className="px-2 py-2">{o.type.replace("_", " ")}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtUsd(o.cost, 0)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtPx(o.price)}</td>
                    <td className="px-2 py-2">
                      <Pill tone={o.status === "filled" ? "up" : o.status === "cancelled" ? "down" : "accent"}>
                        {o.status}
                      </Pill>
                    </td>
                    <td className="px-2 py-2">
                      {o.status === "open" ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => cancel(o.id)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Limits & counts">
        <p className="text-sm text-muted">
          Position counts cap at {VST_MAX_POSITIONS} across the cluster. Each session may enable up to{" "}
          {symbolCount} of {VST_MAX_SYMBOLS} symbols. Ladders use the selected {conn?.venue ?? "bingx"}{" "}
          order type ({otype}). Order count is unlimited; the rate window is the throttle.
        </p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {connections.map((c) => {
            const hot = c.positionCount >= c.maxPositions;
            const rate = c.rateLimitUsed / c.rateLimitMax;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{c.label}</span>
                <span className="text-muted">
                  {c.openOrderCount} orders · {c.positionCount}/{c.maxPositions} pos ·{" "}
                  {Math.round(rate * 100)}% rate
                </span>
                {hot ? <Pill tone="down">At cap</Pill> : <Pill tone="up">Headroom</Pill>}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
