import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { designUrl } from "@pochical/showcase/lib/app-urls";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import stylesheet from "../styles.css?url";

export const Route = createRootRoute({
  errorComponent: ({ reset }) => (
    <main id="main">
      <h1>ページを読み込めませんでした。</h1>
      <button onClick={reset} type="button">
        再読み込み
      </button>
    </main>
  ),
  head: () => ({
    links: [
      { href: stylesheet, rel: "stylesheet" },
      { href: siteIcon, rel: "icon", type: "image/png" },
      // Added to an iPhone's home screen, drawn by bun run icon:app.
      { href: "/app/apple-touch-icon-180x180.png", rel: "apple-touch-icon" },
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { content: "#fbfaf7", name: "theme-color" },
      // A prototype, not pages for search.
      { content: "noindex, nofollow", name: "robots" },
    ],
  }),
  notFoundComponent: () => (
    <main id="main">
      <h1>ページが見つかりません。</h1>
      <a href={designUrl("/")}>デザイン資料へ</a>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Movement follows the device's 視差効果を減らす setting. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <Scripts />
      </body>
    </html>
  );
}
