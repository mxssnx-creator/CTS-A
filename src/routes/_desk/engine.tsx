import { createFileRoute } from "@tanstack/react-router";
import { EngineView } from "@/components/desk/views/engine";

export const Route = createFileRoute("/_desk/engine")({
  component: EngineView,
});
