import { createFileRoute } from "@tanstack/react-router";
import { OverviewView } from "@/components/desk/views/overview";

export const Route = createFileRoute("/_desk/")({
  component: OverviewView,
});
