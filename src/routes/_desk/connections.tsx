import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsView } from "@/components/desk/views/connections";

export const Route = createFileRoute("/_desk/connections")({
  component: ConnectionsView,
});
