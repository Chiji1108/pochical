"use client";

import { useDesignTheme } from "@pochical/prototype/components/design-providers";
import { pageStyle } from "@pochical/prototype/components/design-theme";
import { css, cx } from "@pochical/styled-system/css";
import type { ReactNode } from "react";

// #699's components/mdx.tsx: the workspace the app's pieces are drawn on,
// out of Fumadocs UI's typography. A client component because `light`
// reads the person's テーマ from the settings store.
const workspace = cx(
  "design-page",
  css({
    "--ws-bezel": "#333631",
    "--ws-bezel-edge": "#b9bdb6",
    "--ws-bezel-shadow": "#30392f35",
    "--ws-bg": "#fbfaf7",
    "--ws-bg-translucent": "#fbfaf7e8",
    "--ws-island": "#242724",
  })
);

const ground = css({
  color: "text.primary",
  fontSize: "1rem",
  fontWeight: "normal",
  lineHeight: "initial",
});

const lightPage = css({
  bg: "var(--ws-bg)",
  borderRadius: "2xl",
  padding: "16px",
});

export function Pieces({
  children,
  light = false,
}: {
  children: ReactNode;
  light?: boolean;
}) {
  const theme = useDesignTheme();
  return (
    <div
      className={cx("not-prose my-6", workspace, ground, light && lightPage)}
      style={light ? pageStyle(theme) : undefined}
    >
      {children}
    </div>
  );
}
