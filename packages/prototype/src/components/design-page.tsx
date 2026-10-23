import { css, cx } from "@pochical/styled-system/css";
import type { CSSProperties, ReactNode } from "react";

// The page the phones are shown on, /demo (apps/design) and the app to try
// on a computer (apps/try): the workspace around the app, so the native
// apps have no counterpart. The design documents (apps/design) set their
// pieces on the same workspace.

// The workspace's own colors around the phones; the app's come from
// design/ through design-theme.tsx as CSS variables. Every page showing
// the app's pieces sits on it, the design documents' pieces too
// (apps/design/src/components/mdx.tsx), with `design-page` as the hook for
// the pieces' focus rings and button colors (@pochical/styled-system's
// globalCss). Its ground is the browser's bars' color around a page on it
// too.
export const workspaceGround = "#fbfaf7";

export const workspace = cx(
  "design-page",
  css({
    "--ws-bg": workspaceGround,
    "--ws-bg-translucent": "#fbfaf7e8",
  })
);

const page = css({
  "@media (max-width: 760px)": { padding: "20px 18px 36px" },
  bg: "var(--ws-bg)",
  minHeight: "100vh",
  padding: "28px 40px 48px",
});

// The theme comes in through `style`.
export function DesignPage({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <main className={cx(workspace, page)} id="main" style={style}>
      {children}
    </main>
  );
}
