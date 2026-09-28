import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { css, cx } from "styled-system/css";

// The pages the phones are shown on, /demo and the design documents under
// /design: their ground, the toolbar at the top, the heading, and the
// screens laid side by side with captions. They are the workspace around
// the app, so the native apps have no counterpart.

// Where the pages go down to one column, as on a phone.
const NARROW = "@media (max-width: 760px)";

// The workspace's own colors around the phones; the app's come from
// lib/design-tokens.ts and design-theme.tsx as CSS variables. `design-page`
// stays on it as the hook the site's header and footer hide by.
const page = css({
  "--ws-bezel": "#333631",
  "--ws-bezel-edge": "#b9bdb6",
  "--ws-bezel-shadow": "#30392f35",
  "--ws-bg": "#fbfaf7",
  "--ws-bg-translucent": "#fbfaf7e8",
  "--ws-island": "#242724",
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
    <main className={cx("design-page", page)} id="main" style={style}>
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

// Back to the site or to the design documents on the left, and the
// page's actions on the right.
export function DesignToolbar({
  back,
  children,
}: {
  back: "site" | "documents";
  children?: ReactNode;
}) {
  return (
    <div className={toolbar.root}>
      <Link to={back === "site" ? "/" : "/design"}>
        <ArrowLeft aria-hidden="true" size={16} />{" "}
        {back === "site" ? "ポチカル" : "デザイン資料"}
      </Link>
      {children && <div className={toolbar.actions}>{children}</div>}
    </div>
  );
}

const intro = {
  description: css({ color: "text.tertiary", fontSize: "13px" }),
  eyebrow: css({
    color: "accent.focus",
    fontSize: "10px",
    letterSpacing: "0.2em",
  }),
  root: css({
    "& h1": {
      fontSize: "clamp(25px, 3vw, 36px)",
      fontWeight: 500,
      letterSpacing: "0.04em",
      margin: "18px 0",
    },
    // A second line of the title goes under the first on a phone.
    "& h1 > span": { [NARROW]: { display: "block", marginTop: "6px" } },
    [NARROW]: { margin: "38px auto" },
    margin: "55px auto 52px",
    textAlign: "center",
  }),
};

// The page's heading: where it is, its title, and what it is for.
export function DesignIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className={intro.root}>
      <p className={intro.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p className={intro.description}>{children}</p>
    </header>
  );
}

// Screens side by side, a phone's width each, each section headed by its
// number and name; one column on a phone.
export const designScreens = css({
  "& > section": {
    [NARROW]: { width: "min(390px, 100%)" },
    flex: "0 0 auto",
    minWidth: 0,
    width: "390px",
  },
  "& > section > h2": {
    color: "accent.default",
    fontSize: "13px",
    fontWeight: 500,
    margin: "0 0 20px 8px",
  },
  "& > section > h2 > span": {
    color: "text.quaternary",
    fontSize: "10px",
    marginRight: "13px",
  },
  [NARROW]: { alignItems: "center", flexDirection: "column", gap: "38px" },
  alignItems: "start",
  display: "flex",
  flexWrap: "wrap",
  gap: "clamp(35px, 7vw, 100px)",
  justifyContent: "center",
  marginInline: "auto",
  maxWidth: "1400px",
});

// A note under a screen.
export const designCaption = css({
  color: "text.tertiary",
  fontSize: "11px",
  lineHeight: "1.9",
  marginTop: "22px",
  textAlign: "center",
});
