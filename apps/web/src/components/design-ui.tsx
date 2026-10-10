import { ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

// The shared pieces the screens are built from, each the one place its
// look is decided. They map one to one onto the SwiftUI views and Compose
// composables of the native apps; /design/components shows them all.
//
// This file holds buttons, screens and sections; the rest are beside it:
// design-fields, design-header, design-list, design-choices, design-menu,
// design-sortable-list, design-day-grid and design-pager.

// Out of sight but read out, like a switch's label beside a row that
// already says it; as accessibilityLabel and contentDescription.
export const srOnly = css({
  clipPath: "inset(50%)",
  height: "1px",
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px",
});

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

// A button in four strengths: primary for the step to take, quiet beside
// it or for a lesser one, text for a link-like choice, and subtle for
// putting something off. Where it sits, its width in a row or its push to
// the bottom, is the place's to say, through `className`; `ui-button` and
// `ui-button-<variant>` stay on it as hooks for the older styles.
const buttonStyle = cva({
  base: {
    _disabled: { cursor: "default", opacity: 0.4 },
    alignItems: "center",
    border: 0,
    // Round-ended, as iOS 26's buttons are by default.
    borderRadius: "full",
    cursor: "pointer",
    display: "flex",
    textStyle: "body",
    // One weight for every strength, as Material and most libraries do:
    // the ground tells them apart. Subtle alone steps down.
    fontWeight: 500,
    gap: "8px",
    justifyContent: "center",
  },
  defaultVariants: { size: "regular", variant: "primary" },
  variants: {
    // Small, as SwiftUI's .controlSize(.small): for two side by side,
    // whose words would not fit a half width at body size.
    size: { regular: {}, small: { textStyle: "subheadline" } },
    variant: {
      primary: {
        bg: "accent.fill",
        color: "accent.onFill",
        minHeight: "control",
        width: "100%",
      },
      quiet: {
        _hover: { "&:not(:disabled)": { bg: "fill.tertiary" } },
        bg: "fill.quaternary",
        color: "accent.default",
        minHeight: "control",
        width: "100%",
      },
      subtle: {
        alignSelf: "center",
        bg: "transparent",
        color: "text.tertiary",
        fontWeight: 400,
        margin: "8px auto 0",
        minHeight: "touch",
        paddingInline: "12px",
        textStyle: "subheadline",
      },
      text: {
        alignSelf: "center",
        bg: "transparent",
        color: "accent.default",
        minHeight: "touch",
        paddingInline: "12px",
      },
    },
  },
});

export function Button({
  variant = "primary",
  size = "regular",
  className,
  ...props
}: ButtonProps & {
  variant?: "primary" | "quiet" | "text" | "subtle";
  size?: "regular" | "small";
}) {
  return (
    <button
      className={cx(
        buttonStyle({ size, variant }),
        `ui-button ui-button-${variant}`,
        className
      )}
      type="button"
      {...props}
    />
  );
}

// An action drawn as its icon alone, like the heading's 招待 or 保存. The
// label is what a screen reader says.
// As iOS 26's bar buttons: an icon in a round of glass, in the text color.
// With glass={false} it is the icon alone, in the accent, for a button
// inside something else, like a reply's way out.
export const iconButtonStyle = cva({
  base: {
    border: 0,
    borderRadius: "full",
    display: "grid",
    flexShrink: 0,
    height: "touch",
    placeItems: "center",
    width: "touch",
  },
  defaultVariants: { glass: true },
  variants: {
    glass: {
      false: {
        _hover: { bg: "fill.quaternary" },
        bg: "transparent",
        color: "accent.default",
      },
      true: { bg: "fill.quaternary", color: "text.primary" },
    },
  },
});

export function IconButton({
  label,
  glass = true,
  className,
  ...props
}: ButtonProps & { label: string; glass?: boolean }) {
  return (
    <button
      aria-label={label}
      className={cx(iconButtonStyle({ glass }), "ui-icon-button", className)}
      type="button"
      {...props}
    />
  );
}

// Bar buttons that go together share one round-ended piece of glass, as
// iOS 26 groups a toolbar's neighbors, like a group's 招待 and 設定.
// Buttons of different kinds stand apart instead, 12px between, as
// Photos' filter and 選択 do.
const barGroupStyle = css({
  "& > *": { bg: "transparent" },
  bg: "fill.quaternary",
  borderRadius: "full",
  display: "flex",
  flexShrink: 0,
});

export function BarGroup({ children }: { children: ReactNode }) {
  return <div className={barGroupStyle}>{children}</div>;
}

// A screen under the phone's status bar: a column that fills the phone,
// so the part that scrolls and what is pinned to its foot share the
// height. Hidden, it keeps its state and takes no room.
const screenStyle = cva({
  base: {
    // Under a floating tab bar the part that scrolls runs on to the screen's
    // foot, ending 16px clear of the bar, so what scrolls passes under it.
    // A rail beside it runs on with it.
    "&:has(> [data-tab-bar]) :is([data-screen-scroll], [data-screen-rail])": {
      marginBottom: "calc(-1 * var(--safe-bottom))",
      paddingBottom: "calc(var(--tab-bar-bottom) + 80px)",
    },
    // The part that scrolls takes that room as its end piece instead; see
    // screenScrollStyle.
    "&:has(> [data-tab-bar]) [data-screen-scroll]": {
      "&::after": { height: "calc(var(--tab-bar-bottom) + 80px)" },
      paddingBottom: 0,
    },
    "&[hidden]": { display: "none" },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    paddingTop: "12px",
  },
  variants: {
    // Its ground runs out to the phone's edges, up under the status bar
    // and down under the home indicator, as a camera's does: SwiftUI's
    // .ignoresSafeArea() on the ground. What is on it keeps clear of them.
    fullBleed: {
      true: {
        marginBottom: "calc(-1 * var(--safe-bottom))",
        marginLeft: "calc(-1 * var(--screen-left))",
        marginRight: "calc(-1 * var(--screen-right))",
        marginTop: "calc(-1 * var(--safe-top))",
        paddingBottom: "var(--safe-bottom)",
        paddingLeft: "var(--screen-left)",
        paddingRight: "var(--screen-right)",
        paddingTop: "calc(var(--safe-top) + 12px)",
      },
    },
  },
});

export function Screen({
  className,
  fullBleed = false,
  statusBar,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  "data-toast-above"?: string;
  fullBleed?: boolean;
  // Light for a dark ground, as the status bar and home indicator turn
  // over a camera.
  statusBar?: "light";
}) {
  return (
    <div
      className={cx(screenStyle({ fullBleed }), className)}
      data-status-bar={statusBar}
      {...props}
    />
  );
}

// The part of a screen that scrolls under the status bar, heading and all,
// as the platforms' large-title pages: its parts in a column with room
// between, each keeping its height, so a long page scrolls rather than
// squeezing its lists, which hide what overflows them.
// The room at its foot is a last piece rather than padding: WebKit leaves
// a scrolling flex column's end padding out of what it scrolls, so on an
// iPhone the foot never cleared the tab bar, and in a home screen app,
// where everything else fits, the page did not scroll at all. The piece
// takes back the gap before it.
const SCREEN_SCROLL_GAP = "24px";
const screenScrollStyle = cva({
  base: {
    "& > *": { flexShrink: 0 },
    "&::after": {
      content: '""',
      flexShrink: 0,
      height: "16px",
      marginTop: `calc(-1 * ${SCREEN_SCROLL_GAP})`,
    },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: SCREEN_SCROLL_GAP,
    // It spans the phone from edge to edge, its parts kept off the sides
    // by its padding, so a row that scrolls sideways, like 1人ずつ's
    // people, can run out to the edges rather than be cut off short of
    // them.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    minHeight: 0,
    overflowY: "auto",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "8px",
  },
  variants: {
    // Beside a rail on its left, like the group hub's list of groups: it
    // takes the rest of the width and runs to the right edge.
    beside: { true: { marginLeft: 0, minWidth: 0, paddingLeft: 0 } },
    // Holding a page that fills the screen and keeps its foot at the
    // bottom, like typing an order: nothing after its parts.
    fill: { true: { "&::after": { display: "none" }, paddingTop: 0 } },
  },
});

// Marked, so a control inside can scroll it back to the top.
export function ScreenScroll({
  beside = false,
  fill = false,
  children,
}: {
  beside?: boolean;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={screenScrollStyle({ beside, fill })} data-screen-scroll="">
      {children}
    </div>
  );
}

// A titled part of a screen, its name small over it as over the
// platforms' grouped lists, with an aside after the name when it needs
// one. A section drawing its own heading styles a direct h4 with
// sectionTitle.
export const sectionTitle = css({
  color: "text.tertiary",
  fontWeight: 600,
  margin: "0 0 8px 16px",
  textStyle: "subheadline",
});
const sectionNote = css({
  color: "text.quaternary",
  fontWeight: 400,
  marginLeft: "8px",
  textStyle: "caption",
});

// A title row with a control at its end, as iOS sets one on the right of
// a section's header; the control lines up with the rows' right inset.
const sectionHead = css({
  "& > h4": { margin: 0 },
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
  margin: "0 16px 8px",
});

export function Section({
  title,
  note,
  trailing,
  children,
}: {
  title: string;
  note?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const heading = (
    <h4 className={sectionTitle}>
      {title}
      {note && <small className={sectionNote}>{note}</small>}
    </h4>
  );
  return (
    <section>
      {trailing ? (
        <div className={sectionHead}>
          {heading}
          {trailing}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}

// A quiet line of explanation under what it explains.
const noteStyle = css({
  color: "text.quaternary",
  lineHeight: 1.6,
  margin: "0 8px",
  textStyle: "caption",
});

export function Note({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cx(noteStyle, className)}>{children}</p>;
}

// A field's name, and a hint after it in lighter words: over what it names,
// at the start of a row whose value sits at the end, or across a grid of
// choices like the colors to pick.
export const fieldLabel = cva({
  base: {
    alignItems: "baseline",
    color: "text.primary",
    display: "flex",
    fontWeight: 600,
    gap: "8px",
    marginInline: 0,
    padding: 0,
    textStyle: "footnote",
  },
  defaultVariants: { place: "above" },
  variants: {
    place: {
      above: { marginBottom: "8px", marginTop: 0 },
      grid: {
        float: "left",
        gridColumn: "1 / -1",
        marginBottom: "8px",
        marginTop: "8px",
        width: "100%",
      },
      row: { marginBlock: 0 },
    },
  },
});
export const fieldHint = css({
  color: "text.tertiary",
  fontWeight: 400,
  textStyle: "caption",
});

// A choice that takes the whole row, for a question with a few answers
// each worth a line of its own: an emoji, the answer and a note under it,
// and an arrow to go on, or a check on the one in use.
const optionCard = {
  arrow: css({ color: "text.quaternary", flexShrink: 0 }),
  card: cva({
    base: {
      _hover: { bg: "fill.quaternary", borderColor: "accent.border" },
      alignItems: "center",
      bg: "background.card",
      border: "1px solid token(colors.border.default)",
      borderRadius: "2xl",
      color: "text.primary",
      display: "flex",
      gap: "12px",
      minHeight: "72px",
      padding: "16px 16px 16px 16px",
      textAlign: "left",
      width: "100%",
    },
  }),
  icon: css({
    flexShrink: 0,
    fontFamily: "emoji",
    fontSize: "28px",
  }),
  list: css({
    border: 0,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    margin: 0,
    padding: 0,
  }),
  note: css({ color: "text.tertiary", textStyle: "caption" }),
  text: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  }),
  title: css({ fontWeight: 600, textStyle: "headline" }),
};

// OptionCards one over another.
export const optionList = optionCard.list;

export function OptionCard({
  icon,
  title,
  note,
  onClick,
  children,
}: {
  icon?: string;
  title: string;
  note: string;
  onClick: () => void;
  // More under the note, like the patterns a template brings.
  children?: ReactNode;
}) {
  return (
    <button className={optionCard.card()} onClick={onClick} type="button">
      {icon !== undefined && (
        <span aria-hidden="true" className={optionCard.icon}>
          {icon}
        </span>
      )}
      <span className={optionCard.text}>
        <strong className={optionCard.title}>{title}</strong>
        <small className={optionCard.note}>{note}</small>
        {children}
      </span>
      <ChevronRight aria-hidden="true" className={optionCard.arrow} size={18} />
    </button>
  );
}

// A step's main button at the foot of its column, as the platforms' flows
// keep it in reach of the thumb.
export const pushToBottom = css({ marginTop: "auto" });

// Removing or leaving at the foot of an editing page: quiet red words,
// no icon, centered under the lists, as the platforms' destructive text
// buttons.
const destructiveButtonStyle = css({
  alignItems: "center",
  alignSelf: "center",
  bg: "transparent",
  border: 0,
  color: "danger.default",
  display: "flex",
  minHeight: "44px",
  padding: "0 16px",
  textStyle: "footnote",
});

export function DestructiveButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={destructiveButtonStyle} onClick={onClick} type="button">
      {children}
    </button>
  );
}
