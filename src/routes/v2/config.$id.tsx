import { createFileRoute } from "@tanstack/react-router";
import { ConfigPage } from "@/components/v2/pages/config";

export const Route = createFileRoute("/v2/config/$id")({
  component: function ConfigRoute() {
    const { id } = Route.useParams();
    return <ConfigPage id={id} />;
  },
});
