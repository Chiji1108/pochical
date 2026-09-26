import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "../components/legal-document";
import { pageMeta } from "../lib/site";
export const Route = createFileRoute("/terms")({
  head: () =>
    pageMeta(
      "利用規約",
      "ポチカルをご利用いただく際のルールについて。",
      "/terms"
    ),
  component: () => <LegalDocument kind="terms" />,
});
