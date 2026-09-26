import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { DesignColors } from "../components/design-colors";
import { themeStyle } from "../components/design-theme";
import { parseDesignVariants } from "../lib/design-variants";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

function ColorsPage() {
  return (
    <main className="design-page" id="main" style={themeStyle("moss", "light")}>
      <div className="design-toolbar">
        <Link search={parseDesignVariants({})} to="/design">
          <ArrowLeft aria-hidden="true" size={16} /> デザインプレビュー
        </Link>
      </div>
      <header className="design-intro">
        <p>POCHICAL / COLOR PALETTE</p>
        <h1>カラーパレット</h1>
        <p className="design-description">
          画面の色はすべて、ここにある役割の名前で決まります。ライトとダークを並べています。
        </p>
      </header>
      <DesignColors />
    </main>
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
