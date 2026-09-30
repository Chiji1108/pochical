import { createFileRoute } from "@tanstack/react-router";

import { ShareImage } from "../components/share-image";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/design_/share-image")({
  component: ShareImage,
  head: () =>
    pageMeta(
      "共有したときの画像",
      "リンクを共有したときに出る、ポチカルの画像",
      "/design/share-image",
      true
    ),
});
