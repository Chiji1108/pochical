import { createFileRoute } from "@tanstack/react-router";

import { DesignColors } from "../components/design-colors";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import { themeStyle } from "../components/design-theme";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

function ColorsPage() {
  return (
    <DesignPage style={themeStyle("moss", "light")}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / COLOR PALETTE" title="カラーパレット">
        画面の色はすべて、ここにある役割の名前で決まります。ライトとダークを並べています。
      </DesignIntro>
      <DesignColors />
    </DesignPage>
  );
}

export const Route = createFileRoute("/design_/colors")({
  component: ColorsPage,
  head: () => ({
    ...pageMeta(
      "カラーパレット",
      "ポチカルの色の役割と、ライト・ダークの値",
      "/design/colors",
      true
    ),
    links: [{ href: designStyles, rel: "stylesheet" }],
  }),
});
