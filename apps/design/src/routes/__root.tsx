import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { DesignProviders } from "@pochical/prototype/components/design-providers";
import {
  ColorSchemeContext,
  DeviceSchemeContext,
  schemeOf,
  ThemeContext,
  useColorScheme,
  useThemeStyle,
} from "@pochical/prototype/components/design-theme";
import {
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { MotionConfig } from "motion/react";
import { use } from "react";
import type { ReactNode } from "react";

import {
  AppearanceProvider,
  readAppearance,
  useAppearance,
} from "../lib/appearance";
import { japanese } from "../lib/translations";

import stylesheet from "../styles.css?url";

// The loader comes before the component that reads what it returns.
// oxlint-disable-next-line sort-keys
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
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      // Design documents, not pages for search.
      { content: "noindex, nofollow", name: "robots" },
    ],
  }),
  // 外観 as the cookie keeps it, read once, when the server draws the
  // first page; the page keeps it from then on (lib/appearance.tsx).
  loader: async () => await readAppearance(),
  staleTime: Number.POSITIVE_INFINITY,
  notFoundComponent: () => (
    <main id="main">
      <h1>ページが見つかりません。</h1>
      <Link params={{ _splat: "" }} to="/$">
        デザイン資料へ
      </Link>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider saved={Route.useLoaderData()}>
      <DesignProviders>
        <Html>{children}</Html>
      </DesignProviders>
    </AppearanceProvider>
  );
}

// Every page, Fumadocs UI's chrome included, takes its colors from the
// person's テーマ and the documents' 外観, set on <html> so the dialogs
// Fumadocs UI opens on <body> have them too. The pieces on the pages draw
// in the same light or dark, and the home and lock screens they show
// follow the device's. An always-dark テーマ keeps its dark, as
// DesignProviders draws it.
function Html({ children }: { children: ReactNode }) {
  const { device, scheme } = useAppearance();
  const { theme } = use(ThemeContext);
  return (
    <ColorSchemeContext value={schemeOf(theme, scheme)}>
      <DeviceSchemeContext value={device}>
        <ThemedHtml>{children}</ThemedHtml>
      </DeviceSchemeContext>
    </ColorSchemeContext>
  );
}

function ThemedHtml({ children }: { children: ReactNode }) {
  const style = useThemeStyle();
  const dark = useColorScheme() === "dark";
  const ground = style["--background-base"];
  return (
    <html className={dark ? "dark" : undefined} lang="ja" style={style}>
      <head>
        <HeadContent />
        {/* The browser's bars around the page, in the page's ground. */}
        <meta
          content={typeof ground === "string" ? ground : undefined}
          name="theme-color"
        />
      </head>
      <body>
        {/* Movement follows the device's 視差効果を減らす setting. */}
        <MotionConfig reducedMotion="user">
          {/* Light and dark follow 外観 above, not next-themes. */}
          <RootProvider i18n={japanese} theme={{ enabled: false }}>
            {children}
          </RootProvider>
        </MotionConfig>
        <Scripts />
      </body>
    </html>
  );
}
