import { createFileRoute } from "@tanstack/react-router";
import { css } from "styled-system/css";

import { CalendarPreview } from "../components/calendar-preview";
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
import { pageStyle } from "../components/design-theme";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/design_/assets")({
  component: AssetsPage,
  head: () => ({
    ...pageMeta(
      "素材",
      "ポチカルのアプリアイコンと、元になる絵",
      "/design/assets",
      true
    ),
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

// The drawings and images, each on a card with its file and what it is for.
const sourceList = css({
  "& code": { color: "text.quaternary", fontSize: "11px" },
  "& figcaption": {
    color: "text.tertiary",
    display: "flex",
    flexDirection: "column",
    fontSize: "12px",
    gap: "4px",
    lineHeight: "1.6",
  },
  "& figure": {
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    margin: 0,
    padding: "16px",
  },
  "& img": {
    aspectRatio: 1,
    bg: "#fff",
    borderRadius: "10px",
    height: "auto",
    objectFit: "contain",
    width: "100%",
  },
  "& strong": { color: "text.primary", fontSize: "14px" },
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
});

// The site's first phone, drawn before the app's screens were designed, on the
// site's own paper so it reads as it did on the top page.
const keyVisual = css({
  bg: "var(--paper)",
  border: "1px solid token(colors.separator)",
  borderRadius: "16px",
  color: "var(--ink)",
  isolation: "isolate",
  overflow: "hidden",
});

function AssetsPage() {
  const theme = useDesignTheme();
  return (
    <DesignPage style={pageStyle(theme)}>
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
            <div className={sourceList}>
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
          <section
            aria-labelledby="assets-key-visual-title"
            style={{ width: "min(1080px, 100%)" }}
          >
            <h2 id="assets-key-visual-title">
              <span>03</span> 最初のキービジュアル
            </h2>
            <div className={keyVisual}>
              <CalendarPreview />
            </div>
            <p className={designCaption}>
              アプリの画面を作る前に、サイトのトップに置いた完成予想図。ここから画面を作ってきました。今のアプリとは違います。
            </p>
          </section>
        </div>
      </DesignProviders>
    </DesignPage>
  );
}
