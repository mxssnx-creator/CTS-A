import { createFileRoute } from "@tanstack/react-router";
import { V2Shell } from "@/components/v2/shell";

export const Route = createFileRoute("/v2")({
  head: () => ({ meta: [{ title: "CTS-A Core v2" }] }),
  component: V2Shell,
});
