import siteIcon from "@pochical/prototype/assets/icon.png";
import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import pandaStyles from "../panda.css?url";
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
      { href: pandaStyles, rel: "stylesheet" },
      { href: siteIcon, rel: "icon", type: "image/png" },
      // /try added to an iPhone's home screen, drawn by bun run icon:app.
      { href: "/app/apple-touch-icon-180x180.png", rel: "apple-touch-icon" },
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { content: "#fbfaf7", name: "theme-color" },
      // Design documents and a prototype, not pages for search.
      { content: "noindex, nofollow", name: "robots" },
    ],
  }),
  notFoundComponent: () => (
    <main id="main">
      <h1>ページが見つかりません。</h1>
      <Link to="/design">デザイン資料へ</Link>
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
