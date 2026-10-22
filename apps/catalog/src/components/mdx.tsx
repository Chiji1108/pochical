import { css, cx } from "@pochical/styled-system/css";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";

import { workspace } from "./design-page";

// The ground the app's pieces are drawn for, as the other /design pages
// give them: the workspace, the app's text color, and the page's size and
// spacing of text rather than the document's, which they would otherwise
// inherit.
const ground = css({
  color: "text.primary",
  fontSize: "1rem",
  fontWeight: "normal",
  // CSS's own normal, which is not the lineHeights token of that name.
  lineHeight: "initial",
});

// The app's pieces on a document, out of Fumadocs UI's typography
// (`not-prose`): they draw only with their own Panda CSS, as on a screen.
function Pieces({ children }: { children: ReactNode }) {
  return (
    <div className={cx("not-prose my-6", workspace, ground)}>{children}</div>
  );
}

export function useMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Pieces,
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof useMDXComponents>;
}
