import { createFileRoute } from "@tanstack/react-router";

import { LegalDocument } from "../components/legal-document";
import { pageMeta } from "../lib/site";
export const Route = createFileRoute("/privacy")({
  head: () =>
    pageMeta(
      "プライバシーポリシー",
      "ポチカルが取得する情報、利用目的、共有範囲、アカウント削除について。",
      "/privacy"
    ),
  component: () => <LegalDocument kind="privacy" />,
});
