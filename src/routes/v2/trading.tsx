import { createFileRoute } from "@tanstack/react-router";
import { TradingPage } from "@/components/v2/pages/trading";

export const Route = createFileRoute("/v2/trading")({
  component: TradingPage,
});
