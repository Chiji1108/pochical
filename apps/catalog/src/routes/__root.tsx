import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { DesignProviders } from "@pochical/prototype/components/design-providers";
import {
  useColorScheme,
  useThemeStyle,
} from "@pochical/prototype/components/design-theme";
import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
  useMatch,
} from "@tanstack/react-router";
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

// The MDX documents (design_.$.tsx) take their colors, Fumadocs UI's
// chrome included, from the person's テーマ and 外観, set on <html> so the
// dialogs Fumadocs UI opens on <body> have them too. The other pages draw
// their own grounds and keep the providers fresh, as if this were not here:
// each sets up its own.
function RootDocument({ children }: { children: ReactNode }) {
  const document = useMatch({ from: "/design_/$", shouldThrow: false });
  return (
    <DesignProviders fresh={document === undefined}>
      <Html themed={document !== undefined}>{children}</Html>
    </DesignProviders>
  );
}

function Html({ children, themed }: { children: ReactNode; themed: boolean }) {
  const style = useThemeStyle();
  const dark = useColorScheme() === "dark";
  return (
    <html
      className={themed && dark ? "dark" : undefined}
      lang="ja"
      style={themed ? style : undefined}
    >
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
