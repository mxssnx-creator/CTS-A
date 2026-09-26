import { createFileRoute } from "@tanstack/react-router";
import { EnginePage } from "@/components/v2/pages/engine";

export const Route = createFileRoute("/v2/engine")({
  component: EnginePage,
});
