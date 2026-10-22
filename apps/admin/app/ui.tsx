import { css, cva } from "@pochical/styled-system/css";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

// The admin site's pieces, each page built of them: quiet grounds, hairline
// borders and one accent, in ポチカル's colors (theme.ts).

/** A page's column. */
export const page = css({
  display: "flex",
  flexDirection: "column",
  gap: "6",
  marginInline: "auto",
  maxWidth: "1080px",
  paddingBlock: { base: "6", md: "10" },
  paddingInline: { base: "4", md: "10" },
  width: "100%",
});

/** The trail back up to the page above. */
export function Crumbs({ trail }: { trail: { label: string; to: string }[] }) {
  return (
    <nav
      aria-label="パンくず"
      className={css({
        alignItems: "center",
        color: "text.tertiary",
        display: "flex",
        fontSize: "sm",
        gap: "1",
      })}
    >
      {trail.map(({ label, to }) => (
        <span
          className={css({ alignItems: "center", display: "flex", gap: "1" })}
          key={to}
        >
          <Link className={css({ _hover: { color: "text.primary" } })} to={to}>
            {label}
          </Link>
          <ChevronRight aria-hidden size={14} />
        </span>
      ))}
    </nav>
  );
}

/** A page's title, what it holds, and what it does. */
export function PageHeader({
  actions,
  crumbs,
  description,
  title,
}: {
  actions?: ReactNode;
  crumbs?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header
      className={css({
        borderBottom: "1px solid",
        borderColor: "separator",
        display: "flex",
        flexDirection: "column",
        gap: "2",
        paddingBottom: "6",
      })}
    >
      {crumbs}
      <div
        className={css({
          alignItems: "flex-end",
          display: "flex",
          flexWrap: "wrap",
          gap: "4",
          justifyContent: "space-between",
        })}
      >
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "1",
          })}
        >
          <h1
            className={css({
              fontSize: "2xl",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
            })}
          >
            {title}
          </h1>
          {description === undefined ? null : (
            <p className={css({ color: "text.secondary", fontSize: "sm" })}>
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
    </header>
  );
}

/** A section's heading inside a page. */
export const sectionTitle = css({
  fontSize: "md",
  fontWeight: 600,
});

// card, field and code as style objects too, for a page to merge its own
// over them with css(cardStyle, {...}): cx() only joins class names, and
// where two set the same property the stylesheet's order would decide.

/** Something set apart on the page: a table, a form, a figure. */
export const cardStyle = css.raw({
  background: "background.card",
  border: "1px solid",
  borderColor: "border.default",
  borderRadius: "md",
  // A table wider than a narrow screen scrolls inside it.
  overflowX: "auto",
});
export const card = css(cardStyle);

/**
 * A table in a card: its head on a quiet ground, a hairline between rows,
 * and the row under the pointer lit.
 */
export const table = css({
  // A table with no head names each row in its first cell.
  "& tbody th": { width: "40%" },
  "& tbody tr": {
    _hover: { background: "fill.quaternary" },
    transition: "background 120ms",
  },
  "& tbody tr:not(:last-child) > *": {
    borderBottom: "1px solid",
    borderColor: "separator",
  },
  "& td": {
    paddingBlock: "3",
    paddingInline: "4",
    textAlign: "left",
    verticalAlign: "top",
  },
  "& th": {
    color: "text.tertiary",
    fontWeight: 500,
    paddingBlock: "3",
    paddingInline: "4",
    textAlign: "left",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  "& thead th": {
    background: "fill.quaternary",
    borderBottom: "1px solid",
    borderColor: "separator",
    fontSize: "xs",
    paddingBlock: "2.5",
  },
  borderCollapse: "collapse",
  fontSize: "sm",
  width: "100%",
});

/** Numbers, lined up by their digits. */
export const numeric = css({
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

/** An id, a key or a path: fixed width, shortened where it shows. */
export const codeStyle = css.raw({
  fontFamily: "mono",
  fontSize: "0.92em",
});
export const code = css(codeStyle);

/** What says when, by whom, from where: small and quiet. */
export const meta = css({ color: "text.tertiary", fontSize: "xs" });

/** A word of state beside something: 未返信, 使われている. */
export const badge = cva({
  base: {
    alignItems: "center",
    borderRadius: "full",
    display: "inline-flex",
    fontSize: "xs",
    fontWeight: 500,
    gap: "1",
    lineHeight: 1.5,
    paddingInline: "2",
    whiteSpace: "nowrap",
  },
  defaultVariants: { tone: "neutral" },
  variants: {
    tone: {
      accent: { background: "accent.container", color: "accent.default" },
      danger: {
        background:
          "color-mix(in srgb, var(--danger-default) 12%, transparent)",
        color: "danger.default",
      },
      neutral: { background: "fill.tertiary", color: "text.secondary" },
    },
  },
});

/** A button, by how much it asks of whoever presses it. */
export const button = cva({
  base: {
    _disabled: { cursor: "not-allowed", opacity: 0.5 },
    alignItems: "center",
    border: "1px solid transparent",
    borderRadius: "sm",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: "sm",
    fontWeight: 500,
    gap: "2",
    height: "9",
    justifyContent: "center",
    paddingInline: "3.5",
    transition: "background 120ms, border-color 120ms, 120ms filter",
    whiteSpace: "nowrap",
  },
  defaultVariants: { variant: "solid" },
  variants: {
    variant: {
      // What cannot be undone.
      danger: {
        _hover: { filter: "brightness(1.08)" },
        background: "danger.fill",
        color: "danger.onFill",
      },
      // Beside the page's own, or backing out.
      outline: {
        _hover: { background: "fill.quaternary" },
        background: "background.base",
        borderColor: "border.default",
        color: "text.primary",
      },
      // What the page is for: answer, delete.
      solid: {
        _hover: { filter: "brightness(1.08)" },
        background: "accent.fill",
        color: "accent.onFill",
      },
    },
  },
});

/** A row of buttons. */
export const actionsStyle = css.raw({
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "2",
});
export const actions = css(actionsStyle);

/** A text field or area. */
export const fieldStyle = css.raw({
  _focusVisible: {
    borderColor: "accent.default",
    boxShadow: "0 0 0 3px var(--accent-container)",
    outline: "none",
  },
  background: "background.base",
  border: "1px solid",
  borderColor: "border.default",
  borderRadius: "sm",
  color: "text.primary",
  display: "block",
  fontSize: "sm",
  paddingBlock: "2",
  paddingInline: "3",
  transition: "border-color 120ms, box-shadow 120ms",
  width: "100%",
});
export const field = css(fieldStyle);

/** A field's name over it. */
export const label = css({
  display: "block",
  fontSize: "sm",
  fontWeight: 500,
  marginBottom: "1.5",
});

/** Something gone wrong, or about to: said apart, in the danger color. */
export const alert = css({
  background: "color-mix(in srgb, var(--danger-default) 8%, transparent)",
  border: "1px solid",
  borderColor: "color-mix(in srgb, var(--danger-default) 35%, transparent)",
  borderRadius: "md",
  color: "danger.default",
  fontSize: "sm",
  paddingBlock: "3",
  paddingInline: "4",
});

/** Words said in the danger color, inline. */
export const danger = css({ color: "danger.default", fontWeight: 500 });

/** A dialog over the page, the page dimmed behind it. */
export const dialog = css({
  _backdrop: {
    backdropFilter: "blur(2px)",
    background: "scrim",
  },
  _open: {
    animation: "fadeIn 150ms ease-out",
    display: "flex",
    flexDirection: "column",
    gap: "4",
  },
  background: "background.elevated",
  border: "1px solid",
  borderColor: "border.default",
  borderRadius: "lg",
  boxShadow: "lg",
  color: "text.primary",
  margin: "auto",
  maxWidth: "560px",
  padding: "6",
  width: "calc(100% - 32px)",
});

/** What a table holds when it holds nothing. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p
      className={css({
        color: "text.tertiary",
        fontSize: "sm",
        paddingBlock: "10",
        textAlign: "center",
      })}
    >
      {children}
    </p>
  );
}
