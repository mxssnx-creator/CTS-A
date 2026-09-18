import { createFileRoute } from "@tanstack/react-router";
import { OrdersView } from "@/components/desk/views/orders";

export const Route = createFileRoute("/_desk/orders")({
  component: OrdersView,
});
