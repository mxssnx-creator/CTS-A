import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Cable,
  Gauge,
  Grid3x3,
  LayoutDashboard,
  Layers,
  LineChart,
  Menu,
  Play,
  Route as RouteIcon,
  Settings,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DESK, LAST_N_OPTIONS, lastPrice, priceChange, RANGE_META, REPLAY_RANGES, replayBarsFor, TACTIC_META, WARMUP } from "@/lib/desk/engine";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, useDeskPaneScroll, bindDeskScroll } from "@/lib/desk/live-ctx";
import { universeSymbols, VST_TICK_MS } from "@/lib/desk/vst";
import { cn, clsPnl, fmtPct, fmtPx, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { controlClass, Segmented } from "./widgets";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/strategies", label: "Strategies", icon: LineChart },
  { to: "/positions", label: "Positions", icon: Layers },
  { to: "/engine", label: "VST Engine", icon: Gauge },
  { to: "/combinations", label: "Combinations", icon: Grid3x3 },
  { to: "/lanes", label: "Lanes", icon: RouteIcon },
  { to: "/replay", label: "Replay", icon: Play },
  { to: "/tactics", label: "Tactics", icon: SlidersHorizontal },
  { to: "/performance", label: "Performance", icon: Trophy },
  { to: "/results", label: "Results", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/connections", label: "Connections", icon: Cable },
] as const;

function NavLinks({ onNavigate, inverse }: { onNavigate?: () => void; inverse?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            preload={false}
            onClick={onNavigate}
            className={cn(
              "flex h-11 items-center gap-3 px-3 text-sm font-medium transition-colors duration-150",
              inverse
                ? active
                  ? "bg-primary text-primary-fg"
                  : "text-nav-muted hover:bg-nav-hover hover:text-nav-fg"
                : active
                  ? "bg-primary-soft text-info"
                  : "text-muted hover:bg-surface-muted hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const paneRef = useRef<HTMLElement | null>(null);
  const [pane, setPane] = useState<HTMLElement | null>(null);
  useDeskPaneScroll(pane);
  const liveSnap = useLiveSnapshot();
  const pullLiveDesk = useDesk((s) => s.pullLiveDesk);
  const [open, setOpen] = useState(false);
  const symbol = useDesk((s) => s.symbol);
  const setSymbol = useDesk((s) => s.setSymbol);
  const lastN = useDesk((s) => s.lastN);
  const lastNLinked = useDesk((s) => s.lastNLinked);
  const setLastN = useDesk((s) => s.setLastN);
  const costStep = useDesk((s) => s.costStep);
  const setCostStep = useDesk((s) => s.setCostStep);
  const tactic = useDesk((s) => s.tactic);
  const rangeType = useDesk((s) => s.rangeType);
  const connected = useDesk((s) => s.connections.filter((c) => c.status === "connected").length);
  const vstRunning = useDesk((s) => s.vst.running);
  const tickEngine = useDesk((s) => s.tickEngine);
  const watchdog = useDesk((s) => s.watchdog);
  const vstStats = useDesk((s) => s.vst.stats);
  const liveTape = useDesk((s) => s.liveTape);
  const replayPlaying = useDesk((s) => s.replayPlaying);
  const replaySpeed = useDesk((s) => s.replaySpeed);
  const replayRangeId = useDesk((s) => s.replayRangeId);
  const feed = useDesk((s) => s.feed);
  const pullTape = useDesk((s) => s.pullTape);
  const hydrateCredentials = useDesk((s) => s.hydrateCredentials);
  const hydrateSettings = useDesk((s) => s.hydrateSettings);
  const pullRemoteSettings = useDesk((s) => s.pullRemoteSettings);
  const pullExchange = useDesk((s) => s.pullExchange);
  const quote = useDesk((s) => (s.liveSession ? undefined : s.vst.quotes[s.symbol]));
  const armed = useDesk((s) => s.connections.some((c) => c.armed));
  const symbolCount = useDesk((s) => s.symbolCount);
  const universe = universeSymbols(symbolCount);
  const px = quote?.px ?? lastPrice(symbol);
  const chg = quote?.chg ?? priceChange(symbol);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void pullLiveDesk();
    }, 12000);
    void pullLiveDesk();
    return () => window.clearInterval(id);
  }, [pullLiveDesk]);

  useEffect(() => {
    void hydrateCredentials();
    void hydrateSettings();
  }, [hydrateCredentials, hydrateSettings]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void pullRemoteSettings();
    }, 30000);
    return () => window.clearInterval(id);
  }, [pullRemoteSettings]);

  useEffect(() => {
    if (!vstRunning || liveSnap.hasLive) return;
    let dead = false;
    let timer = 0;
    const step = () => {
      if (dead) return;
      try {
        if (!document.hidden) tickEngine();
      } catch {
        /* self-heal: keep the clock */
      }
      timer = window.setTimeout(step, VST_TICK_MS);
    };
    timer = window.setTimeout(step, VST_TICK_MS);
    const onVis = () => {
      if (!document.hidden && !dead) tickEngine();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [vstRunning, tickEngine, liveSnap.hasLive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      try {
        watchdog();
      } catch {
        /* keep the watchdog alive */
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [watchdog]);

  useEffect(() => {
    if (!liveTape || liveSnap.hasLive) return;
    let dead = false;
    let timer = 0;
    const loop = async () => {
      try {
        await Promise.race([
          pullTape(),
          new Promise((_, rej) => {
            window.setTimeout(() => rej(new Error("tape timeout")), 6000);
          }),
        ]);
      } catch {
        /* keep polling — never stall the tape loop */
      }
      if (!dead) timer = window.setTimeout(loop, 4000);
    };
    void loop();
    return () => {
      dead = true;
      window.clearTimeout(timer);
    };
  }, [liveTape, pullTape, liveSnap.hasLive]);

  useEffect(() => {
    if (liveSnap.hasLive) return;
    const id = window.setInterval(() => {
      void pullExchange();
    }, 20000);
    return () => window.clearInterval(id);
  }, [pullExchange, liveSnap.hasLive]);

  useEffect(() => {
    if (!replayPlaying) return;
    const hours = REPLAY_RANGES.find((r) => r.id === replayRangeId)?.hours ?? 48;
    const max = Math.max(0, replayBarsFor(hours) - 1);
    const ms = replaySpeed === 4 ? 80 : replaySpeed === 2 ? 160 : 280;
    const id = window.setInterval(() => {
      const cur = useDesk.getState().replayIndex;
      if (cur >= max) {
        useDesk.getState().setReplayIndex(WARMUP);
        return;
      }
      useDesk.getState().setReplayIndex(Math.min(max, cur + 1));
    }, ms);
    return () => window.clearInterval(id);
  }, [replayPlaying, replaySpeed, symbol, replayRangeId]);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-nav text-nav-fg lg:flex">
        <div className="flex h-12 items-center gap-2 px-4">
          <AxisMark />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">AXIS</div>
            <div className="text-xs uppercase tracking-widest text-nav-muted">Desk</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks inverse />
        </div>
        <div className="border-t border-white/10 px-4 py-3 text-xs text-nav-muted">
          <div className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", liveSnap.pingOk || feed.state === "live" ? "bg-up" : armed ? "bg-down" : "bg-up")} />
            {liveSnap.hasLive ? "BingX VST-02 live" : feed.state === "live" ? "BingX live tape" : `${connected} BingX sessions`}
          </div>
          <div className="mt-1">
            {liveSnap.hasLive
              ? `${liveSnap.livePos} pos · ${liveSnap.liveOrd} ord · ${liveSnap.equity ? fmtUsd(liveSnap.equity, 0) : "—"}`
              : `${vstStats.positions}/100 pos · ${vstStats.openOrders} wrk`}
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 bg-header px-3 text-header-fg sm:px-4">
          <Button
            variant="inverse"
            size="iconSm"
            className="text-header-fg hover:bg-primary-hover lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="flex items-center gap-2 lg:hidden">
            <AxisMark />
            <span className="text-sm font-semibold">AXIS</span>
          </div>
          <div className="hidden items-center gap-2 text-sm md:flex">
            <Activity className="size-4" />
            <span className="font-medium">
              {armed ? "MAINNET ARMED" : liveSnap.hasLive ? "BingX VST-02 live" : feed.state === "live" ? "Live tape" : vstRunning ? "VST live" : "VST paused"}
            </span>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <select
              aria-label="Symbol"
              className="h-8 max-w-28 border-0 bg-primary-hover px-2 text-sm text-header-fg sm:max-w-none"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {universe.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.base}
                </option>
              ))}
            </select>
            <div className="hidden items-baseline gap-2 sm:flex">
              <span className="font-mono text-sm tabular">{fmtPx(px)}</span>
              <span className={cn("font-mono text-xs tabular", clsPnl(chg))}>{fmtPct(chg, 2)}</span>
            </div>
            <div className="hidden lg:block">
              <Segmented
                value={String(lastN)}
                onChange={(v) => setLastN(Number(v) as typeof lastN)}
                options={LAST_N_OPTIONS.map((n) => ({ id: String(n), label: `N${n}` }))}
              />
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2 text-xs text-muted sm:px-4">
          <span>
            Cost <span className="font-mono text-fg tabular">{costStep}</span>
          </span>
          <input
            aria-label="Position cost step"
            type="range"
            min={3}
            max={30}
            value={costStep}
            onChange={(e) => setCostStep(Number(e.target.value))}
            className="w-28 sm:w-40"
          />
          <span className="hidden sm:inline">
            {TACTIC_META[tactic].label} · {RANGE_META[rangeType].label}
          </span>
          <span className="ml-auto hidden font-medium text-fg md:inline">
            {lastNLinked ? `Last ${lastN} evals` : `Picks N${lastN}`}
          </span>
          <select
            aria-label="Last N"
            className={cn(controlClass, "h-8 w-20 lg:hidden")}
            value={lastN}
            onChange={(e) => setLastN(Number(e.target.value) as typeof lastN)}
          >
            {LAST_N_OPTIONS.map((n) => (
              <option key={n} value={n}>
                N{n}
              </option>
            ))}
          </select>
        </div>

        <main
          id="desk-scroll"
          ref={(el) => {
            paneRef.current = el;
            bindDeskScroll(el);
            if (el && el !== pane) setPane(el);
          }}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 lg:px-6"
        >
          <Outlet />
        </main>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-fg/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-nav text-nav-fg shadow-panel">
            <div className="flex h-12 items-center justify-between px-3">
              <span className="text-sm font-semibold">AXIS Desk</span>
              <Button
                variant="inverse"
                size="iconSm"
                className="text-nav-fg"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            <NavLinks inverse onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface lg:hidden">
        {NAV.slice(0, 5).map((item) => (
          <MobileTab key={item.to} to={item.to} label={item.label} icon={item.icon} />
        ))}
      </nav>
      <div className="h-14 lg:hidden" />
    </div>
  );
}

function MobileTab({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium leading-none",
        active ? "text-primary" : "text-muted",
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {label}
    </Link>
  );
}

function AxisMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-primary-fg" aria-hidden="true">
      <path
        d="M4 20 L12 4 L20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="miter"
      />
      <path d="M2 14 H22" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
