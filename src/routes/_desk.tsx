import { useLayoutEffect, useRef } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/desk/app-shell";
import { LiveDeskProvider } from "@/lib/desk/live-ctx";
import { loadLiveDesk } from "@/lib/desk/feed";
import { useDesk } from "@/lib/desk/store";

export const Route = createFileRoute("/_desk")({
  loader: () => loadLiveDesk(),
  staleTime: Infinity,
  gcTime: Infinity,
  shouldReload: false,
  component: DeskFrame,
  notFoundComponent: DeskNotFound,
});

function DeskNotFound() {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-xl flex-col gap-3 py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-subtle">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted">That section is not in the desk.</p>
      <Link to="/" preload={false} className="text-sm font-medium text-primary hover:underline">
        Back to overview
      </Link>
    </div>
  );
}

function DeskFrame() {
  const live = Route.useLoaderData();
  const once = useRef(false);
  useLayoutEffect(() => {
    if (once.current || !live) return;
    once.current = true;
    const sess = live.session as { livePos?: number } | null;
    const incoming = Number(sess?.livePos ?? live.exchange?.positions?.length ?? 0);
    const cur = Number(useDesk.getState().liveSession?.livePos ?? 0);
    if (!(incoming === 0 && cur > 0)) useDesk.getState().applyLiveDesk(live);
  }, [live]);
  return (
    <LiveDeskProvider value={null}>
      <AppShell />
    </LiveDeskProvider>
  );
}
