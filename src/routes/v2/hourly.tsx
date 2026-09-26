import { createFileRoute } from "@tanstack/react-router";
import { HourlyPage } from "@/components/v2/pages/hourly";

export const Route = createFileRoute("/v2/hourly")({
  component: HourlyPage,
});
