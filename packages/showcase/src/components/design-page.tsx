import { css, cx } from "@pochical/styled-system/css";
import { ArrowLeft } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

// The pages the phones are shown on, /demo (apps/design) and the app to try
// on a computer (apps/try): their ground, the toolbar at the top, and the
// captions under the phones. They are the workspace around the app, so the
// native apps have no counterpart. The design documents (apps/design) set
// their pieces on the same workspace.

// Where the pages go down to one column, as on a phone.
const NARROW = "@media (max-width: 760px)";

// The workspace's own colors around the phones; the app's come from
// design/ through design-theme.tsx as CSS variables. Every page showing
// the app's pieces sits on it, the design documents' pieces too
// (apps/design/src/components/mdx.tsx), with `design-page` as the hook for the pieces'
// focus rings and button colors (@pochical/styled-system's globalCss).
export const workspace = cx(
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

const page = css({
  [NARROW]: { padding: "20px 18px 36px" },
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

const toolbar = {
  actions: css({ display: "flex", gap: "8px" }),
  root: css({
    "& a, & button": {
      alignItems: "center",
      display: "inline-flex",
      gap: "8px",
    },
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    fontSize: "12px",
    justifyContent: "space-between",
    margin: "auto",
    maxWidth: "1100px",
  }),
};

// A toolbar action, link or button, drawn as a pill.
export const toolbarAction = css({
  bg: "transparent",
  border: "1px solid token(colors.border.default)",
  borderRadius: "22px",
  padding: "10px 14px",
});

// Back to the design documents on the left, and the page's actions on the
// right. A plain link, as apps/try draws it with no router.
export function DesignToolbar({
  documentsHref,
  children,
}: {
  documentsHref: string;
  children?: ReactNode;
}) {
  return (
    <div className={toolbar.root}>
      <a href={documentsHref}>
        <ArrowLeft aria-hidden="true" size={16} /> デザイン資料
      </a>
      {children && <div className={toolbar.actions}>{children}</div>}
    </div>
  );
}

// A note under a screen.
export const designCaption = css({
  color: "text.tertiary",
  fontSize: "11px",
  lineHeight: "1.9",
  marginTop: "22px",
  textAlign: "center",
});
