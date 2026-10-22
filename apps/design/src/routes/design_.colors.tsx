import { themeStyle } from "@pochical/prototype/components/design-theme";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "@pochical/showcase/components/design-page";
import { pageMeta } from "@pochical/showcase/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";

import { DesignColors } from "../components/design-colors";

function ColorsPage() {
  return (
    <DesignPage style={themeStyle("pochical", "light")}>
      <DesignToolbar documentsHref="/" />
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
    ...pageMeta("カラーパレット", "ポチカルの色の役割と、ライト・ダークの値"),
  }),
});
