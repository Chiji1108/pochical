import siteIcon from "@pochical/prototype/assets/icon.png?url";
import poodle from "@pochical/prototype/assets/poodle.png?url";
import shareImage from "@pochical/prototype/assets/share.png?url";
import { css } from "@pochical/styled-system/css";

import { CalendarPreview } from "./calendar-preview";

import previewStyles from "../calendar-preview.css?url";

// The pieces of content/design/assets.mdx: the images the apps and the
// site ship, and the drawings they come from.

export { DesignAppIcon as AppIcon } from "@pochical/prototype/components/design-app-icon";

const sources = [
  {
    alt: "プードルの線画",
    note: "黒い線と白地、1254px。アプリアイコンはここから作ります。",
    path: "packages/prototype/src/assets/poodle.png",
    src: poodle,
    title: "プードルの絵",
    wide: false,
  },
  {
    alt: "モスの地に白いプードルのアイコン",
    note: "ファビコンとサイトのヘッダーで使っています。アプリアイコンのモスと同じ絵です。",
    path: "packages/prototype/src/assets/icon.png",
    src: siteIcon,
    title: "サイトのアイコン",
    wide: false,
  },
  {
    alt: "ポチカルのロゴと「シフトを、ポチッと。」、カレンダーの画面",
    note: "リンクを共有したときの画像、1200×630。デモの /_render/share-image を bun run --cwd apps/demo image:share で撮っています。",
    path: "packages/prototype/src/assets/share.png",
    src: shareImage,
    title: "共有したときの画像",
    wide: true,
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
  // A wide picture takes the whole row, at its own shape.
  "& figure[data-wide]": { gridColumn: "1 / -1" },
  "& figure[data-wide] img": { aspectRatio: "1200 / 630" },
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

export function SourceImages() {
  return (
    <div className={sourceList}>
      {sources.map((source) => (
        <figure data-wide={source.wide || undefined} key={source.path}>
          <img alt={source.alt} height={160} src={source.src} width={160} />
          <figcaption>
            <strong>{source.title}</strong>
            <code>{source.path}</code>
            {source.note}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

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

export function KeyVisual() {
  return (
    <div className={keyVisual}>
      {/* Its own old styles, which this picture alone needs: React puts
          the stylesheet in the head, and waits for it before showing the
          picture. */}
      <link href={previewStyles} precedence="default" rel="stylesheet" />
      <CalendarPreview />
    </div>
  );
}
