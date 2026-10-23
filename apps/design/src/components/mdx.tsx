import { useDesignTheme } from "@pochical/prototype/components/design-providers";
import { pageStyle } from "@pochical/prototype/components/design-theme";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import type { DesignVariants } from "@pochical/prototype/lib/design-variants";
import { workspace } from "@pochical/showcase/components/design-page";
import { css, cx } from "@pochical/styled-system/css";
import { Link } from "@tanstack/react-router";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { ChevronRight } from "lucide-react";
import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";

// The ground the app's pieces are drawn for: the workspace, the app's text
// color, and the page's size and spacing of text rather than the
// document's, which they would otherwise inherit.
const ground = css({
  color: "text.primary",
  fontSize: "1rem",
  fontWeight: "normal",
  // CSS's own normal, which is not the lineHeights token of that name.
  lineHeight: "initial",
});

// The light page itself, on a dark document as on a light one.
const lightPage = css({
  bg: "var(--ws-bg)",
  borderRadius: "2xl",
  padding: "16px",
});

// The app's pieces on a document, out of Fumadocs UI's typography
// (`not-prose`): they draw only with their own Panda CSS, as on a screen.
// They follow the document's light or dark, or with `light` stay on the
// light page whatever 外観 is, as a page showing light and dark side by
// side (colors.mdx) and the workspace's own controls (the widgets'
// switches) are drawn for.
function Pieces({
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

// /demo opened on what the page just showed, by its choices in the URL
// as /demo keeps them, the current proposal for the rest.
function DemoLink({ state }: { state?: Partial<DesignVariants> }) {
  return (
    <Link
      className="not-prose text-fd-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
      search={parseDesignVariants({ ...state })}
      to="/demo"
    >
      この状態をデモで見る
      <ChevronRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

export function useMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    DemoLink,
    Pieces,
    Step,
    Steps,
    Tab,
    Tabs,
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof useMDXComponents>;
}
