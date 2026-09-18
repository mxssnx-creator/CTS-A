import { createFileRoute } from "@tanstack/react-router";
import { ReplayView } from "@/components/desk/views/replay";

export const Route = createFileRoute("/_desk/replay")({
  component: ReplayView,
});
