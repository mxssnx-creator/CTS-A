import { createFileRoute } from "@tanstack/react-router";
import { SystemView } from "@/components/desk/views/system";

export const Route = createFileRoute("/_desk/system")({
  component: SystemView,
});
