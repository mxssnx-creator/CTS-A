import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/v2/pages/trading";

export const Route = createFileRoute("/v2/market")({
  component: MarketPage,
});
