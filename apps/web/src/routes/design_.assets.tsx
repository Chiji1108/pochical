import { createFileRoute } from "@tanstack/react-router";

import { DesignAppIcon } from "../components/design-app-icon";
import {
  designCaption,
  DesignIntro,
  DesignPage,
  designScreens,
  DesignToolbar,
} from "../components/design-page";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { themeStyle } from "../components/design-theme";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

export const Route = createFileRoute("/design_/assets")({
  component: AssetsPage,
  head: () => ({
    ...pageMeta(
      "素材",
      "ポチカルのアプリアイコンと、元になる絵",
      "/design/assets",
      true
    ),
    links: [{ href: designStyles, rel: "stylesheet" }],
  }),
});

// Images the apps and the site ship, and the drawings they come from.
const sources = [
  {
    alt: "プードルの線画",
    note: "黒い線と白地、1254px。アプリアイコンはここから作ります。",
    path: "public/design/poodle.png",
    src: "/design/poodle.png",
    title: "プードルの絵",
  },
  {
    alt: "モスの地に白いプードルのアイコン",
    note: "ファビコン、共有したときの画像、サイトのヘッダーで使っています。アプリアイコンのモスと同じ絵です。",
    path: "public/icon.png",
    src: "/icon.png",
    title: "サイトのアイコン",
  },
] as const;

function AssetsPage() {
  const theme = useDesignTheme();
  return (
    <DesignPage style={themeStyle(theme, "light")}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / ASSETS" title="素材">
        アプリやサイトで使う画像と、その元になる絵。
      </DesignIntro>
      <DesignProviders>
        <div className={designScreens}>
          <section aria-labelledby="assets-app-icon-title">
            <h2 id="assets-app-icon-title">
              <span>01</span> アプリアイコン
            </h2>
            <DesignAppIcon />
            <p className={designCaption}>
              「ポチ」カルのプードル。色を選ぶと、小さいサイズとホーム画面での見え方が変わります。
            </p>
          </section>
          <section aria-labelledby="assets-sources-title">
            <h2 id="assets-sources-title">
              <span>02</span> 元の絵とサイトの画像
            </h2>
            <div className="as-sources">
              {sources.map((source) => (
                <figure key={source.path}>
                  <img
                    alt={source.alt}
                    height={160}
                    src={source.src}
                    width={160}
                  />
                  <figcaption>
                    <strong>{source.title}</strong>
                    <code>{source.path}</code>
                    {source.note}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        </div>
      </DesignProviders>
    </DesignPage>
  );
}
