import { createFileRoute } from "@tanstack/react-router";
import { OverviewPage } from "@/components/v2/pages/overview";

export const Route = createFileRoute("/v2/")({
  component: OverviewPage,
});
