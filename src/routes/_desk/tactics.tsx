import { createFileRoute } from "@tanstack/react-router";
import { TacticsView } from "@/components/desk/views/tactics";

export const Route = createFileRoute("/_desk/tactics")({
  component: TacticsView,
});
