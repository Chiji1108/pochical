"use client";

import { DesignProviders } from "@pochical/prototype/components/design-providers";
import {
  useColorScheme,
  useThemeStyle,
} from "@pochical/prototype/components/design-theme";
import type { ReactNode } from "react";

// #699's RootDocument: the documents (`themed`) take their colors, Fumadocs
// UI's chrome included, from the person's テーマ and 外観, set on <html>.
// Other pages keep the providers fresh.
export function HtmlShell({
  children,
  themed,
}: {
  children: ReactNode;
  themed: boolean;
}) {
  return (
    <DesignProviders fresh={!themed}>
      <Html themed={themed}>{children}</Html>
    </DesignProviders>
  );
}

function Html({ children, themed }: { children: ReactNode; themed: boolean }) {
  const style = useThemeStyle();
  const dark = useColorScheme() === "dark";
  return (
    <html
      className={themed && dark ? "dark" : undefined}
      // base.css scrolls smoothly; Next.js turns it off during route
      // transitions when told so.
      data-scroll-behavior="smooth"
      lang="ja"
      style={themed ? style : undefined}
    >
      <body>{children}</body>
    </html>
  );
}
