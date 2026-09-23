import { createFileRoute } from "@tanstack/react-router";
import { BotsView } from "@/components/desk/views/bots";

export const Route = createFileRoute("/_desk/bots")({
  component: BotsView,
});
