import { Menu, RadioGroup, SegmentGroup, Switch } from "@ark-ui/react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements, DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
} from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import { css, cva, cx } from "styled-system/css";

import { useWeek } from "./design-week";
import type { DayTone } from "./design-week";

// The shared pieces the screens are built from, each the one place its
// look is decided. They map one to one onto the SwiftUI views and Compose
// composables of the native apps; /design/components shows them all.

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

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

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
    borderRadius: "999px",
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
        bg: "accentFill",
        color: "onAccentFill",
        minHeight: "control",
        width: "100%",
      },
      quiet: {
        _hover: { "&:not(:disabled)": { bg: "fill2" } },
        bg: "fill",
        color: "accent",
        minHeight: "control",
        width: "100%",
      },
      subtle: {
        alignSelf: "center",
        bg: "transparent",
        color: "text3",
        fontWeight: 400,
        margin: "8px auto 0",
        minHeight: "touch",
        paddingInline: "12px",
        textStyle: "subheadline",
      },
      text: {
        alignSelf: "center",
        bg: "transparent",
        color: "accent",
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
const iconButtonStyle = cva({
  base: {
    border: 0,
    borderRadius: "999px",
    display: "grid",
    flexShrink: 0,
    height: "touch",
    placeItems: "center",
    width: "touch",
  },
  defaultVariants: { glass: true },
  variants: {
    glass: {
      false: { _hover: { bg: "fill" }, bg: "transparent", color: "accent" },
      true: { bg: "fill", color: "text" },
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
  bg: "fill",
  borderRadius: "999px",
  display: "flex",
  flexShrink: 0,
});

export function BarGroup({ children }: { children: ReactNode }) {
  return <div className={barGroupStyle}>{children}</div>;
}

// A screen under the phone's status bar: a column that fills the phone,
// so the part that scrolls and what is pinned to its foot share the
// height. Hidden, it keeps its state and takes no room.
const screenStyle = css({
  // Under a floating tab bar the part that scrolls runs on to the screen's
  // foot, ending 16px clear of the bar, so what scrolls passes under it.
  "&:has(> [data-tab-bar]) [data-screen-scroll]": {
    marginBottom: "calc(-1 * var(--safe-bottom))",
    paddingBottom: "calc(var(--tab-bar-bottom) + 80px)",
  },
  "&[hidden]": { display: "none" },
  display: "flex",
  flex: 1,
  flexDirection: "column",
  minHeight: 0,
  paddingTop: "12px",
});

export function Screen({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { "data-toast-above"?: string }) {
  return <div className={cx(screenStyle, className)} {...props} />;
}

// The part of a screen that scrolls under the status bar, heading and all,
// as the platforms' large-title pages: its parts in a column with room
// between, each keeping its height, so a long page scrolls rather than
// squeezing its lists, which hide what overflows them.
const screenScrollStyle = cva({
  base: {
    "& > *": { flexShrink: 0 },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "24px",
    minHeight: 0,
    overflowY: "auto",
    padding: "8px 0 16px",
  },
  variants: {
    // Beside a rail on its left, like the group hub's list of groups: it
    // takes the rest of the width and runs to the right edge.
    beside: { true: { minWidth: 0, paddingRight: 0 } },
  },
});

// Marked, so a control inside can scroll it back to the top.
export function ScreenScroll({
  beside = false,
  children,
}: {
  beside?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={screenScrollStyle({ beside })} data-screen-scroll="">
      {children}
    </div>
  );
}

// A titled part of a screen, its name small over it as over the
// platforms' grouped lists, with an aside after the name when it needs
// one. A section drawing its own heading styles a direct h4 with
// sectionTitle.
export const sectionTitle = css({
  color: "text3",
  fontWeight: 600,
  margin: "0 0 8px 16px",
  textStyle: "subheadline",
});
const sectionNote = css({
  color: "text4",
  fontWeight: 400,
  marginLeft: "8px",
  textStyle: "caption",
});

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h4 className={sectionTitle}>
        {title}
        {note && <small className={sectionNote}>{note}</small>}
      </h4>
      {children}
    </section>
  );
}

// A quiet line of explanation under what it explains.
const noteStyle = css({
  color: "text4",
  lineHeight: 1.6,
  margin: "0 8px",
  textStyle: "caption",
});

export function Note({ children }: { children: ReactNode }) {
  return <p className={noteStyle}>{children}</p>;
}

// A field's name, and a hint after it in lighter words: over what it names,
// at the start of a row whose value sits at the end, or across a grid of
// choices like the colors to pick.
export const fieldLabel = cva({
  base: {
    alignItems: "baseline",
    color: "text",
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
  color: "text3",
  fontWeight: 400,
  textStyle: "caption",
});

// A choice that takes the whole row, for a question with a few answers
// each worth a line of its own: an emoji, the answer and a note under it,
// and an arrow to go on, or a check on the one in use.
const optionCard = {
  arrow: css({ color: "textFaint", flexShrink: 0 }),
  card: cva({
    base: {
      _hover: { bg: "fill", borderColor: "accentMuted" },
      alignItems: "center",
      bg: "surface",
      border: "1px solid token(colors.border)",
      borderRadius: "20px",
      color: "text",
      display: "flex",
      gap: "12px",
      minHeight: "72px",
      padding: "16px 16px 16px 16px",
      textAlign: "left",
      width: "100%",
    },
    variants: {
      picked: {
        true: {
          _hover: { bg: "surface", borderColor: "accent" },
          border: "2px solid token(colors.accent)",
          cursor: "default",
        },
      },
    },
  }),
  check: css({ color: "accent", flexShrink: 0 }),
  icon: css({
    flexShrink: 0,
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", sans-serif',
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
  note: css({ color: "text3", textStyle: "caption" }),
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
  picked,
  onClick,
  children,
}: {
  icon?: string;
  title: string;
  note: string;
  // Set where one of the answers is the one in use, as in settings.
  picked?: boolean;
  onClick: () => void;
  // More under the note, like the patterns a template brings.
  children?: ReactNode;
}) {
  return (
    <button
      aria-pressed={picked}
      className={optionCard.card({ picked })}
      onClick={onClick}
      type="button"
    >
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
      {picked === true ? (
        <Check aria-hidden="true" className={optionCard.check} size={20} />
      ) : (
        <ChevronRight
          aria-hidden="true"
          className={optionCard.arrow}
          size={18}
        />
      )}
    </button>
  );
}

// A step's main button at the foot of its column, as the platforms' flows
// keep it in reach of the thumb.
export const pushToBottom = css({ marginTop: "auto" });

// Adding one more to the list above: a dashed, full-width button, as the
// platforms' "add" rows are.
const addButtonStyle = css({
  alignItems: "center",
  bg: "transparent",
  border: "1px dashed var(--border-strong)",
  borderRadius: "16px",
  color: "accent",
  display: "flex",
  gap: "8px",
  justifyContent: "center",
  minHeight: "46px",
  textStyle: "subheadline",
});

export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={addButtonStyle} onClick={onClick} type="button">
      <Plus aria-hidden="true" size={14} />
      {children}
    </button>
  );
}

// Removing or leaving at the foot of an editing page: quiet red words,
// no icon, centered under the lists, as the platforms' destructive text
// buttons.
const destructiveButtonStyle = css({
  alignItems: "center",
  alignSelf: "center",
  bg: "transparent",
  border: 0,
  color: "danger",
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

// A field that is a row's control, like a pattern's name: no box of its
// own, its words at the row's right.
export const inlineInput = css({
  bg: "transparent",
  border: 0,
  color: "text",
  flex: 1,
  font: "inherit",
  minWidth: 0,
  outline: "none",
  padding: 0,
  textAlign: "right",
  textStyle: "body",
});

// A row's value that is a mark with words, or a mark alone: side by side,
// at the right.
export const markValue = css({
  alignItems: "center",
  display: "inline-flex",
  gap: "8px",
  justifyContent: "flex-end",
});

// A mark shown large at the top of the page that edits it, with its name
// and time beside it, or alone in the middle.
export const markPreview = cva({
  base: {
    "& strong": { textStyle: "body" },
    alignItems: "center",
    bg: "fill",
    borderRadius: "20px",
    display: "flex",
    gap: "16px",
    padding: "16px",
  },
  variants: {
    alone: { true: { justifyContent: "center", minHeight: "84px" } },
  },
});

// 完了 at a screen's top right, for the mode that has to be left on
// purpose: entering shifts, a day opened in the week.
const doneButtonStyle = css({
  alignItems: "center",
  bg: "accentFill",
  border: 0,
  borderRadius: "24px",
  color: "onAccentFill",
  display: "inline-flex",
  gap: "8px",
  height: "44px",
  justifyContent: "center",
  padding: "0 20px",
  textStyle: "subheadline",
});

export function DoneButton({ className, ...props }: ButtonProps) {
  return (
    <button className={cx(doneButtonStyle, className)} type="button" {...props}>
      <Check aria-hidden="true" size={18} />
      完了
    </button>
  );
}

// 今月 or 今週: back to the month or week that holds today, dimmed once
// there.
// As iOS 26's bar buttons with words, like the calendar's 今日: the word
// in a round-ended piece of glass.
const todayButtonStyle = css({
  _disabled: { color: "textDisabled", cursor: "default" },
  bg: "fill",
  border: 0,
  borderRadius: "999px",
  color: "text",
  flexShrink: 0,
  height: "touch",
  paddingInline: "16px",
  textStyle: "body",
});

export function TodayButton({
  unit,
  className,
  ...props
}: ButtonProps & { unit: "月" | "週" | "日" }) {
  return (
    <button
      aria-label={`今${unit}に戻る`}
      className={cx(todayButtonStyle, className)}
      type="button"
      {...props}
    >
      今{unit}
    </button>
  );
}

// A number of days that opens what they are: 今月のお休み under the
// calendar, みんな休み under the group's shifts. It has the corners of the
// buttons it sits with.
export const summaryRow = {
  chevron: css({ alignSelf: "center", marginLeft: "12px" }),
  count: css({
    alignItems: "baseline",
    color: "accentStrong",
    display: "flex",
    fontSize: "25px",
  }),
  row: css({
    alignItems: "center",
    bg: "fill",
    border: 0,
    borderRadius: "control",
    color: "text",
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    justifyContent: "space-between",
    padding: "12px 16px",
    textStyle: "footnote",
    width: "100%",
  }),
  unit: css({ marginLeft: "2px", textStyle: "footnote" }),
};

export function SummaryRow({
  label,
  days,
  onOpen,
}: {
  label: string;
  days: number;
  onOpen: () => void;
}) {
  return (
    <button
      aria-haspopup="dialog"
      className={summaryRow.row}
      onClick={onOpen}
      type="button"
    >
      <span>{label}</span>
      <strong className={summaryRow.count}>
        {days}
        <span className={summaryRow.unit}>日</span>
        <ChevronRight
          aria-hidden="true"
          className={summaryRow.chevron}
          size={17}
        />
      </strong>
    </button>
  );
}

// Back to where the page came from, named after it (設定, グループ), or
// キャンセル without the chevron where leaving drops what was entered.
// Without children it is the chevron alone, labelled 戻る. Disabled, it
// keeps its place but hides, as while a list is being sorted.
// The way back, as iOS 26 and Android draw it: an arrow alone, here in
// iOS's round of glass, naming where it goes only to a screen reader.
const backButtonStyle = css({
  _disabled: { visibility: "hidden" },
  alignItems: "center",
  alignSelf: "flex-start",
  bg: "fill",
  border: 0,
  borderRadius: "999px",
  color: "text",
  display: "inline-flex",
  flexShrink: 0,
  height: "touch",
  justifyContent: "center",
  width: "touch",
});

export function BackButton({
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) {
  const name =
    ariaLabel ?? (typeof children === "string" ? `${children}に戻る` : "戻る");
  return (
    <button
      aria-label={name}
      className={cx(backButtonStyle, className)}
      type="button"
      {...props}
    >
      <ChevronLeft aria-hidden="true" size={24} />
    </button>
  );
}

// The action at a page's top right: 保存, 作る, 並び替え and the like.
// As iOS 26's bar buttons with words: in a round-ended piece of glass,
// and filled with the accent when it confirms, like 保存 or 追加; gray
// glass while it cannot yet.
const headerActionStyle = cva({
  base: {
    _disabled: { bg: "fill", color: "textDisabled", cursor: "default" },
    alignItems: "center",
    border: 0,
    borderRadius: "999px",
    display: "inline-flex",
    flexShrink: 0,
    height: "touch",
    paddingInline: "16px",
    textStyle: "body",
  },
  defaultVariants: { prominent: false },
  variants: {
    prominent: {
      false: { bg: "fill", color: "text" },
      true: { bg: "accentFill", color: "onAccentFill", fontWeight: 600 },
    },
  },
});

export function HeaderAction({
  prominent = false,
  className,
  ...props
}: ButtonProps & { prominent?: boolean }) {
  return (
    <button
      className={cx(headerActionStyle({ prominent }), className)}
      type="button"
      {...props}
    />
  );
}

// A page's top, as the platforms' navigation bars have it: the way back
// (or キャンセル) on the left, an action on the right, and the large title
// under them. `back` and `onBack` are the usual way back; `leading` takes
// anything else there. `children` go between the bar and the title, like
// a step count.
const pageHeader = {
  bar: css({
    alignItems: "center",
    display: "grid",
    gap: "8px",
    // The ends keep their buttons whole; a long title in the middle gives
    // way, cut short, and stays centered while the ends allow.
    gridTemplateColumns:
      "minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)",
  }),
  // A page with no large title names itself small in the bar's middle,
  // as the platforms' inline titles.
  inlineTitle: css({
    fontWeight: 600,
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "center",
    textOverflow: "ellipsis",
    textStyle: "body",
    whiteSpace: "nowrap",
  }),
  trailing: css({ display: "flex", justifyContent: "flex-end" }),
  root: css({ display: "flex", flexDirection: "column", gap: "4px" }),
  title: css({ fontWeight: 600, margin: 0, textStyle: "largeTitle" }),
};

export function PageHeader({
  title,
  back,
  onBack,
  leading,
  trailing,
  inlineTitle,
  children,
}: {
  title?: ReactNode;
  back?: string;
  onBack?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  inlineTitle?: ReactNode;
  children?: ReactNode;
}) {
  const start =
    leading ?? (onBack && <BackButton onClick={onBack}>{back}</BackButton>);
  return (
    <header className={pageHeader.root}>
      {trailing || inlineTitle ? (
        <div className={pageHeader.bar}>
          <div>{start}</div>
          {inlineTitle ? (
            <h3 className={pageHeader.inlineTitle}>{inlineTitle}</h3>
          ) : (
            <span />
          )}
          <div className={pageHeader.trailing}>{trailing}</div>
        </div>
      ) : (
        start
      )}
      {children}
      {title && <h3 className={pageHeader.title}>{title}</h3>}
    </header>
  );
}

// A list of rows on one rounded ground, as a grouped list on iOS and a
// card of list items on Android.
export const listStyle = css({
  bg: "fill",
  borderRadius: "list",
  overflow: "hidden",
});

export function List({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(listStyle, className)}>{children}</div>;
}

const listRowRoot = cva({
  base: {
    // A line between rows, not above the first: only a row that follows
    // another, whatever else the list holds, like a legend. As iOS draws
    // it: from where the words start to 16px short of the right edge.
    "[data-list-row] + &": {
      "&::before": {
        borderTop: "1px solid token(colors.separator)",
        content: '""',
        left: "16px",
        position: "absolute",
        right: "16px",
        top: 0,
      },
      "&:has(> [data-part=leading])::before": { left: "56px" },
      position: "relative",
    },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "text",
    display: "flex",
    textStyle: "body",
    gap: "12px",
    // iOS 26's list rows: 52pt, and about 67pt with a subtitle.
    minHeight: "52px",
    paddingInline: "16px",
    textAlign: "left",
    width: "100%",
  },
  variants: { twoLine: { true: { minHeight: "68px" } } },
});

// One row of a list, and its parts for rows drawn by hand.
export const listRow = {
  arrow: css({ color: "textFaint", flexShrink: 0, marginRight: "-4px" }),
  // In the arrow's place on a row that adds rather than opens: a plus in
  // the accent, told apart from the gray arrows of rows that go on.
  add: css({ color: "accent", flexShrink: 0, marginRight: "-4px" }),
  label: css({
    "& small": { color: "text3", textStyle: "caption" },
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "2px",
  }),
  // With nothing on the right but a control, the label takes the room.
  labelGrow: css({ flex: 1, minWidth: 0 }),
  // One width whatever it holds, so every row's words start at the same
  // place, 56px in, as under iOS's icons.
  leading: css({
    // What it holds keeps its own size rather than squeezing to fit.
    "& > *": { flexShrink: 0 },
    color: "text2",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    width: "28px",
  }),
  root: listRowRoot(),
  // A row of two lines, like a chat's name over its last message: taller,
  // as the platforms' two-line list rows are.
  twoLine: listRowRoot({ twoLine: true }),
  // Rows that do something when pressed.
  pressable: css({
    _hover: { "&:is(button)": { bg: "fill2" } },
    cursor: "pointer",
  }),
  danger: css({ "& > *": { color: "danger" }, color: "danger" }),
  value: css({
    color: "text3",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "right",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
};

// A row: its label, a value on the right, something before the label
// (an icon, a mark, a face), and a control after it (a switch, a field).
// Pressed, it is a button with an arrow; holding a control, or pointing at
// one with htmlFor, it is that control's label. `danger` is for rows that
// remove something.
export function ListRow({
  label,
  value,
  leading,
  control,
  onClick,
  arrow,
  danger = false,
  htmlFor,
  disabled,
  className,
  labelClassName,
  valueClassName,
  ...rest
}: {
  label: ReactNode;
  value?: ReactNode;
  leading?: ReactNode;
  control?: ReactNode;
  onClick?: () => void;
  // Shown on pressable rows unless false; a node replaces the chevron.
  arrow?: ReactNode;
  danger?: boolean;
  htmlFor?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
}) {
  const pressable = Boolean(onClick);
  const isLabel = !pressable && (control !== undefined || Boolean(htmlFor));
  const shownArrow =
    arrow === undefined || arrow === true
      ? pressable && (
          <ChevronRight
            aria-hidden="true"
            className={listRow.arrow}
            size={17}
          />
        )
      : arrow || null;
  const content = (
    <>
      {leading && (
        <span className={listRow.leading} data-part="leading">
          {leading}
        </span>
      )}
      <span
        className={cx(
          listRow.label,
          value === undefined && listRow.labelGrow,
          labelClassName
        )}
      >
        {label}
      </span>
      {value !== undefined && (
        <span className={cx(listRow.value, valueClassName)}>{value}</span>
      )}
      {control}
      {shownArrow}
    </>
  );
  const rowClass = cx(
    listRow.root,
    (pressable || isLabel) && listRow.pressable,
    danger && listRow.danger,
    className
  );
  if (pressable) {
    return (
      <button
        className={rowClass}
        data-list-row=""
        disabled={disabled}
        onClick={onClick}
        type="button"
        {...rest}
      >
        {content}
      </button>
    );
  }
  if (isLabel) {
    return (
      <label className={rowClass} data-list-row="" htmlFor={htmlFor} {...rest}>
        {content}
      </label>
    );
  }
  return (
    <div className={rowClass} data-list-row="" {...rest}>
      {content}
    </div>
  );
}

// An on and off switch, as the platforms' Toggle and Switch: a track that
// fills with the theme when on, and a knob that slides across. Ark UI's
// Switch does the rest: the hidden checkbox, its label and focus.
const toggle = {
  thumb: css({
    _checked: { transform: "translateX(18px)" },
    bg: "var(--knob)",
    borderRadius: "50%",
    boxShadow: "0 1px 3px var(--shadow-strong)",
    display: "block",
    height: "22px",
    margin: "2px",
    transition: "transform 0.15s",
    width: "22px",
  }),
  track: css({
    _checked: { bg: "accentFill" },
    _focusVisible: {
      outline: "2px solid token(colors.accent)",
      outlineOffset: "2px",
    },
    bg: "controlOff",
    borderRadius: "999px",
    cursor: "pointer",
    display: "block",
    flexShrink: 0,
    height: "26px",
    marginLeft: "auto",
    transition: "background 0.15s",
    width: "44px",
  }),
};

function ToggleParts() {
  return (
    <>
      <Switch.Control className={toggle.track}>
        <Switch.Thumb className={toggle.thumb} />
      </Switch.Control>
      <Switch.HiddenInput />
    </>
  );
}

// A switch on its own, named for a screen reader.
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(details) => {
        onChange(details.checked);
      }}
    >
      <Switch.Label className={srOnly}>{label}</Switch.Label>
      <ToggleParts />
    </Switch.Root>
  );
}

// A row whose control is an on and off switch, with a dot in the color a
// setting paints with when it has one.
export function SwitchRow({
  label,
  checked,
  onChange,
  swatch,
  className,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  swatch?: string;
  className?: string;
}) {
  return (
    <Switch.Root
      checked={checked}
      className={cx(listRow.root, listRow.pressable, className)}
      data-list-row=""
      onCheckedChange={(details) => {
        onChange(details.checked);
      }}
    >
      {swatch && (
        <span className={listRow.leading}>
          <span
            aria-hidden="true"
            className={swatchStyle}
            style={{ background: swatch }}
          />
        </span>
      )}
      <Switch.Label className={cx(listRow.label, listRow.labelGrow)}>
        {label}
      </Switch.Label>
      <ToggleParts />
    </Switch.Root>
  );
}

const swatchStyle = css({
  borderRadius: "50%",
  flexShrink: 0,
  height: "10px",
  width: "10px",
});

// A segmented control: a few choices side by side, the picked one raised,
// as SwiftUI's segmented Picker and Compose's SegmentedButton. Each
// Segment brings its own content, a sample of what it picks or a word.
// Compact for words alone, tall for large samples.
type SegmentSize = "compact" | "regular" | "tall";
const SegmentSizeContext = createContext<SegmentSize>("regular");

// Round-ended, track and picked segment alike, as iOS 26's.
const segmentedStyle = css({
  bg: "fill2",
  border: 0,
  borderRadius: "999px",
  display: "grid",
  gap: "4px",
  gridAutoColumns: "minmax(0, 1fr)",
  gridAutoFlow: "column",
  margin: 0,
  padding: "4px",
  position: "relative",
});

const segmentStyle = cva({
  base: {
    _checked: { color: "text", fontWeight: 600 },
    _focusVisible: {
      outline: "2px solid token(colors.accent)",
      outlineOffset: "-2px",
    },
    alignItems: "center",
    borderRadius: "999px",
    color: "text2",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    position: "relative",
    textStyle: "subheadline",
    zIndex: 1,
  },
  variants: {
    size: {
      compact: { minHeight: "action" },
      regular: { minHeight: "62px" },
      tall: { minHeight: "76px" },
    },
  },
});

const segmentText = css({
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
});

// The raised ground under the picked segment, which slides to the next
// one as it is picked; Ark UI measures where it goes.
const segmentIndicator = css({
  bg: "surface",
  borderRadius: "999px",
  boxShadow: "0 1px 3px var(--shadow)",
  height: "var(--height)",
  top: "var(--top)",
  width: "var(--width)",
});

// Picks one of `value`'s kind, as SwiftUI's Picker(selection:) with a tag
// on each choice: each Segment carries its value.
export function SegmentedControl<Value extends string>({
  label,
  value,
  onValueChange,
  size = "regular",
  className,
  children,
}: {
  // What is being picked, for a screen reader.
  label: string;
  // Null while nothing is picked, like a group icon that is a photo.
  value: Value | null;
  onValueChange: (value: Value) => void;
  size?: SegmentSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SegmentGroup.Root
      className={cx(segmentedStyle, className)}
      orientation="horizontal"
      onValueChange={(details) => {
        if (details.value !== null) {
          onValueChange(details.value as Value);
        }
      }}
      value={value}
    >
      <SegmentGroup.Label className={srOnly}>{label}</SegmentGroup.Label>
      <SegmentGroup.Indicator className={segmentIndicator} />
      <SegmentSizeContext value={size}>{children}</SegmentSizeContext>
    </SegmentGroup.Root>
  );
}

// One choice: a sample of what it picks, a word, or both. `label` names it
// for a screen reader when the words shown are short, like 日 for 日曜.
export function Segment({
  value,
  label,
  className,
  children,
}: {
  value: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const size = useContext(SegmentSizeContext);
  return (
    <SegmentGroup.Item
      className={cx(segmentStyle({ size }), className)}
      value={value}
    >
      <SegmentGroup.ItemText className={segmentText}>
        {children}
      </SegmentGroup.ItemText>
      <SegmentGroup.ItemHiddenInput aria-label={label} />
    </SegmentGroup.Item>
  );
}

// One of several, laid out as the place likes: icons, colors, emoji,
// app icons. As SwiftUI's Picker in a grid and Compose's selectable
// tiles; Ark UI's RadioGroup makes each a radio button, so arrow keys move
// the pick and a screen reader says which of how many it is. The look of
// each choice, picked or not, is the place's, through className and
// [data-state=checked].
export function ChoiceGrid<Value extends string>({
  label,
  value,
  onValueChange,
  className,
  labelClassName = srOnly,
  ref,
  children,
}: {
  // What is being picked; hidden unless labelClassName shows it.
  label: string;
  value: Value | null;
  onValueChange: (value: Value) => void;
  className?: string;
  labelClassName?: string;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <RadioGroup.Root
      className={className}
      ref={ref}
      onValueChange={(details) => {
        if (details.value !== null) {
          onValueChange(details.value as Value);
        }
      }}
      value={value}
    >
      <RadioGroup.Label className={labelClassName}>{label}</RadioGroup.Label>
      {children}
    </RadioGroup.Root>
  );
}

// A ChoiceGrid of marks, icons or emoji, eight to a row: tiles on the
// fill, the picked one on the surface inside an accent edge.
export const markGrid = css({
  "& [data-part=item]": {
    "&[data-state=checked]": { bg: "surface", borderColor: "accent" },
    aspectRatio: 1,
    bg: "fill",
    border: "1.5px solid transparent",
    borderRadius: "12px",
    display: "grid",
    fontSize: "20px",
    placeItems: "center",
  },
  border: 0,
  display: "grid",
  gap: "4px",
  gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
  margin: 0,
  padding: 0,
});

// A ChoiceGrid of a mark's colors, six to a row: each a circle edged in
// its color (set on the choice), the picked one ringed apart from it.
export const colorGrid = css({
  "& [data-part=item]": {
    "&[data-state=checked]": {
      boxShadow: "0 0 0 3px var(--bg), 0 0 0 5px currentcolor",
    },
    border: "2px solid currentcolor",
    borderRadius: "50%",
    height: "36px",
    width: "36px",
  },
  border: 0,
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  justifyItems: "center",
  margin: 0,
  padding: 0,
});

// The focus ring sits outside a tile, and inside a row, whose list clips.
const choiceStyle = cva({
  base: {
    _focusVisible: { outline: "2px solid token(colors.accent)" },
    cursor: "pointer",
  },
  variants: {
    ring: {
      inside: { _focusVisible: { outlineOffset: "-2px" } },
      outside: { _focusVisible: { outlineOffset: "2px" } },
    },
  },
});

// One choice in a ChoiceGrid or ChoiceList. `label` names it for a screen
// reader when it shows no words, like a color.
export function Choice({
  value,
  label,
  ring = "outside",
  className,
  style,
  children,
  ...rest
}: {
  value: string;
  label?: string;
  ring?: "inside" | "outside";
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Omit<LabelHTMLAttributes<HTMLLabelElement>, "onChange">) {
  return (
    <RadioGroup.Item
      className={cx(choiceStyle({ ring }), className)}
      style={style}
      value={value}
      {...rest}
    >
      {children}
      <RadioGroup.ItemHiddenInput aria-label={label} />
    </RadioGroup.Item>
  );
}

// One of several as rows with a check on the picked one, as iOS's
// inset list picker and Android's list of radio items.
export function ChoiceList<Value extends string>({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: Value | null;
  onValueChange: (value: Value) => void;
  children: ReactNode;
}) {
  return (
    <ChoiceGrid
      className={listStyle}
      label={label}
      onValueChange={onValueChange}
      value={value}
    >
      {children}
    </ChoiceGrid>
  );
}

const choiceRowHover = css({ _hover: { bg: "fill2" } });

const choiceRowCheck = css({
  "[data-state=checked] > &": { visibility: "visible" },
  color: "accent",
  flexShrink: 0,
  marginLeft: "auto",
  visibility: "hidden",
});

export function ChoiceRow({
  value,
  label,
  leading,
}: {
  value: string;
  label: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <Choice
      className={cx(listRow.root, choiceRowHover)}
      data-list-row=""
      ring="inside"
      value={value}
    >
      {leading && (
        <span className={listRow.leading} data-part="leading">
          {leading}
        </span>
      )}
      <span className={cx(listRow.label, listRow.labelGrow)}>{label}</span>
      <Check aria-hidden="true" className={choiceRowCheck} size={20} />
    </Choice>
  );
}

// A chip to press: picked or not, one of several or several at once,
// with a mark or a check before its words. `add` is the dashed chip that
// adds another.
export const chipStyle = cva({
  base: {
    // Picked: a chip that toggles, or one choice of a ChoiceGrid.
    "&:is([aria-pressed=true], [data-state=checked])": {
      bg: "accentSoft",
      borderColor: "accentMuted",
      color: "accent",
      fontWeight: 600,
    },
    alignItems: "center",
    bg: "surface",
    border: "1px solid token(colors.border)",
    borderRadius: "999px",
    color: "text2",
    cursor: "pointer",
    display: "inline-flex",
    textStyle: "footnote",
    gap: "4px",
    minHeight: "34px",
    paddingInline: "12px",
  },
  variants: {
    variant: {
      add: { borderStyle: "dashed", color: "text3" },
      choice: {},
    },
  },
});

export function Chip({
  selected,
  variant = "choice",
  className,
  ...props
}: ButtonProps & { selected?: boolean; variant?: "choice" | "add" }) {
  return (
    <button
      aria-pressed={selected}
      className={cx(chipStyle({ variant }), className)}
      type="button"
      {...props}
    />
  );
}

// Chips or tags in a wrapping row. With a label it is a group of choices
// (a fieldset); as a list it is a ul or ol of tags.
const chipGroupStyle = css({
  border: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  listStyle: "none",
  margin: 0,
  padding: 0,
});

export function ChipGroup({
  label,
  as = "div",
  className,
  children,
}: {
  label?: string;
  as?: "div" | "ul" | "ol";
  className?: string;
  children: ReactNode;
}) {
  const style = cx(chipGroupStyle, className);
  if (label) {
    return (
      <fieldset className={style}>
        <legend className={srOnly}>{label}</legend>
        {children}
      </fieldset>
    );
  }
  const Element = as;
  return <Element className={style}>{children}</Element>;
}

// A small word to show, not to press: みんな休み, a date, a shift in an
// order. Accent for news about the group, neutral on the page, raised on
// a card that is already filled.
const tagStyle = cva({
  base: {
    alignItems: "center",
    borderRadius: "8px",
    display: "inline-flex",
    gap: "4px",
    lineHeight: 1.4,
  },
  variants: {
    size: {
      md: { paddingBlock: "4px", paddingInline: "12px", textStyle: "footnote" },
      sm: { paddingBlock: "1px", paddingInline: "8px", textStyle: "caption2" },
    },
    tone: {
      accent: { bg: "accentSoft", color: "accent" },
      neutral: { bg: "fill", color: "text2" },
      raised: { bg: "surface", color: "text" },
    },
  },
});

export function Tag({
  tone = "neutral",
  size = "md",
  as = "span",
  className,
  children,
}: {
  tone?: "accent" | "neutral" | "raised";
  size?: "sm" | "md";
  as?: "span" | "li";
  className?: string;
  children: ReactNode;
}) {
  const Element = as;
  return (
    <Element className={cx(tagStyle({ size, tone }), className)}>
      {children}
    </Element>
  );
}

// Every menu has iOS 26's look, a pull-down or a message's 返信 and
// コピー alike: the icon or check leading in the text's own color, rows
// apart without lines, a line only between groups, and round corners.
const menu = {
  check: css({ color: "text", flexShrink: 0 }),
  content: css({
    _closed: { animation: "fadeOut 0.12s ease-in" },
    _open: { animation: "fadeIn 0.12s ease-out" },
    bg: "raised",
    border: "1px solid token(colors.border)",
    borderRadius: "24px",
    boxShadow: "0 8px 24px var(--shadow-strong)",
    minWidth: "200px",
    outline: "none",
    padding: "8px",
    zIndex: 30,
  }),
  icon: css({ color: "text", display: "flex", flexShrink: 0 }),
  item: css({
    _focusVisible: {
      outline: "2px solid token(colors.accent)",
      outlineOffset: "-2px",
    },
    _highlighted: { bg: "fill2" },
    _hover: { bg: "fill2" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "16px",
    color: "text",
    cursor: "default",
    display: "flex",
    gap: "12px",
    padding: "12px",
    textAlign: "start",
    textStyle: "body",
    userSelect: "none",
    width: "100%",
  }),
  separator: css({
    border: 0,
    borderTop: "1px solid token(colors.separator)",
    margin: "4px 12px",
  }),
  trigger: css({
    alignItems: "center",
    bg: "fill2",
    border: 0,
    borderRadius: "16px",
    color: "text2",
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 600,
    gap: "4px",
    padding: "8px 12px 8px 12px",
    textStyle: "subheadline",
  }),
};

// The menu's look, for a menu Ark UI's Menu cannot hold, as a message's
// under its reactions.
export const menuStyle = {
  content: menu.content,
  icon: menu.icon,
  item: menu.item,
};

// A pull-down for a page's secondary actions, as SwiftUI's Menu and
// Compose's DropdownMenu: its button names what is chosen now, and the
// choices and actions open under it. Ark UI's Menu moves through them by
// arrow keys and closes on a pick, outside or by Escape.
export function PullDownMenu({
  label,
  children,
}: {
  // What the button says, usually the current choice.
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <Menu.Root positioning={{ gutter: 6, placement: "bottom-end" }}>
      <Menu.Trigger className={menu.trigger}>
        {label}
        <ChevronDown aria-hidden="true" size={15} />
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content className={menu.content}>{children}</Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

// The same menu opened from an icon alone, as a toolbar's Menu in SwiftUI
// or an IconButton with a DropdownMenu in Compose. The label is what a
// screen reader says.
export function IconMenu({
  label,
  icon,
  className,
  children,
}: {
  label: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Menu.Root positioning={{ gutter: 6, placement: "bottom-end" }}>
      <Menu.Trigger
        aria-label={label}
        className={cx(iconButtonStyle(), "ui-icon-button", className)}
      >
        {icon}
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content className={menu.content}>{children}</Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

// One choice among several inside a menu, marked with a check, as a
// Picker inside a SwiftUI Menu.
export function MenuPicker<Value extends string>({
  value,
  onValueChange,
  options,
}: {
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly { value: Value; label: string }[];
}) {
  return (
    <Menu.RadioItemGroup
      onValueChange={(details) => {
        const option = options.find((item) => item.value === details.value);
        if (option) {
          onValueChange(option.value);
        }
      }}
      value={value}
    >
      {options.map((option) => (
        <Menu.RadioItem
          className={menu.item}
          key={option.value}
          value={option.value}
        >
          <Check
            aria-hidden="true"
            className={menu.check}
            size={18}
            visibility={option.value === value ? "visible" : "hidden"}
          />
          <Menu.ItemText>{option.label}</Menu.ItemText>
        </Menu.RadioItem>
      ))}
    </Menu.RadioItemGroup>
  );
}

// An action in a menu, with its icon.
export function MenuItem({
  value,
  icon,
  onSelect,
  children,
}: {
  // Names the item for the menu; not shown.
  value: string;
  icon?: ReactNode;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Menu.Item className={menu.item} onSelect={onSelect} value={value}>
      {icon && <span className={menu.icon}>{icon}</span>}
      {children}
    </Menu.Item>
  );
}

export function MenuSeparator() {
  return <Menu.Separator className={menu.separator} />;
}

// A list to reorder by its handles, as SwiftUI's List with .onMove: drag
// a handle, or focus it and use the arrow keys, with each move said to a
// screen reader. dnd kit does the dragging.
export function SortableList<Item extends { id: string }>({
  items,
  label,
  onChange,
  children,
}: {
  items: Item[];
  // What the handle and the announcements call the row.
  label: (item: Item) => string;
  onChange: (items: Item[]) => void;
  // The row's content, before the handle.
  children: (item: Item) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const nameOf = (id: string | number) =>
    label(items.find((item) => item.id === id) ?? items[0]);
  const place = (id: string | number | undefined) =>
    items.findIndex((item) => item.id === id) + 1;
  const announcements: Announcements = {
    onDragCancel: ({ active }) => `${nameOf(active.id)}を元の場所に戻しました`,
    onDragEnd: ({ active, over }) =>
      `${nameOf(active.id)}を${place(over?.id)}番目に置きました`,
    onDragOver: ({ active, over }) =>
      `${nameOf(active.id)}は${place(over?.id)}番目です`,
    onDragStart: ({ active }) => `${nameOf(active.id)}を持ち上げました`,
  };
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    onChange(arrayMove(items, from, to));
  };
  return (
    <DndContext
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "スペースキーで持ち上げ、上下の矢印キーで動かし、もう一度スペースキーで置きます。Escで取り消します。",
        },
      }}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={end}
      sensors={sensors}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={listStyle}>
          {items.map((item) => (
            <SortableRow id={item.id} key={item.id} label={label(item)}>
              {children(item)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

const sortable = {
  dragging: css({
    bg: "fill",
    boxShadow: "0 4px 14px var(--shadow-strong)",
    position: "relative",
    zIndex: 1,
  }),
  handle: css({
    _focusVisible: {
      outline: "2px solid token(colors.accent)",
      outlineOffset: "-2px",
    },
    bg: "transparent",
    border: 0,
    color: "textFaint",
    cursor: "grab",
    display: "grid",
    height: "action",
    marginLeft: "auto",
    marginRight: "-8px",
    placeItems: "center",
    touchAction: "none",
    width: "36px",
  }),
};

function SortableRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  return (
    <div
      className={cx(listRow.root, isDragging && sortable.dragging)}
      data-list-row=""
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children}
      <button
        {...attributes}
        {...listeners}
        aria-label={`${label}を並べ替え`}
        className={sortable.handle}
        // Dragging it moves the row, not a sheet the list is in.
        data-no-drag=""
        ref={setActivatorNodeRef}
        type="button"
      >
        <GripVertical aria-hidden="true" size={18} />
      </button>
    </div>
  );
}

// A month's days, a week to a row, as the calendar, a member's month, the
// saved image and the look preview draw them; as many rows as the days
// given make. The sizes are numbers too, for a grid that animates its
// height.
export const DAY_ROW_HEIGHT = 64;
export const DAY_ROW_GAP = 4;
const weekColumns = "repeat(7, minmax(0, 1fr))";
export const dayGrid = css({
  display: "grid",
  gap: `${DAY_ROW_GAP}px`,
  gridAutoRows: `${DAY_ROW_HEIGHT}px`,
  gridTemplateColumns: weekColumns,
});
export function dayGridHeight(weeks: number) {
  return weeks * DAY_ROW_HEIGHT + (weeks - 1) * DAY_ROW_GAP;
}

const weekdayRow = cva({
  base: {
    color: "text3",
    display: "grid",
    fontSize: "11px",
    gridTemplateColumns: weekColumns,
    paddingBottom: "12px",
    textAlign: "center",
  },
  variants: {
    // Tighter over a small picture of the calendar.
    compact: { true: { paddingBottom: "8px" } },
  },
});
const weekdayTone: Record<DayTone, string | undefined> = {
  holiday: css({ color: "holiday" }),
  plain: undefined,
  saturday: css({ color: "saturday" }),
};

// The weekday names over a DayGrid, from the viewer's week start, Sundays
// and Saturdays in their colors while those are on. Screen readers hear
// each day's own label instead.
export function WeekdayRow({ compact = false }: { compact?: boolean }) {
  const { weekdays } = useWeek();
  return (
    <div aria-hidden="true" className={weekdayRow({ compact })}>
      {weekdays.map((day) => (
        <span className={weekdayTone[day.tone]} key={day.day}>
          {day.label}
        </span>
      ))}
    </div>
  );
}

const pager = {
  // Pages of different heights, as a month and a week: the pager takes the
  // height of the one shown, which animates itself. At rest the track sits
  // a page to the left in CSS, so the middle page shows whatever the width
  // and before the script runs; the finger's offset goes on the layer
  // around it, and is nothing again once a swipe has landed.
  container: css({
    alignItems: "flex-start",
    display: "flex",
    transform: "translateX(-100%)",
  }),
  // Motion writes touch-action: pan-y on what it drags, which leaves the
  // page only to scroll up and down; pinching to zoom stays the browser's.
  drag: css({ touchAction: "pan-y pinch-zoom !important" }),
  slide: css({ flex: "0 0 100%", minWidth: 0 }),
  // clip rather than hidden: a hidden box can still be scrolled, as the
  // browser keeping its place while the grid folds, which slid the pages.
  viewport: css({ overflow: "clip" }),
};

type PageOffset = -1 | 0 | 1;

const pageOffsets: PageOffset[] = [-1, 0, 1];

// A swipe turns the page when let go past a quarter of it, or flicked
// faster than this many pixels a second, and turns one page at most.
const TURN_SHARE = 0.25;
const FLICK_SPEED = 400;
// How far a flick carries on, in seconds of its speed, when judging where
// it would come to rest.
const FLICK_CARRY = 0.2;

// Pages that follow the finger sideways, as SwiftUI's TabView(.page) and
// Compose's HorizontalPager, for months or weeks without end. Only the
// pages before and after are drawn; once a swipe lands, `onStep` moves on
// and the pager quietly goes back to the middle, which now shows the new
// page. Motion does the dragging.
export function Pager({
  page,
  onStep,
  renderPage,
}: {
  // Names the page shown, so the pager recenters when it changes.
  page: string;
  onStep: (direction: 1 | -1) => void;
  renderPage: (offset: PageOffset) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion() ?? false;
  // A page's width, only to keep a drag within the pages beside; the
  // pages are placed without it.
  const [width, setWidth] = useState(0);
  // Dragged since the finger went down, so letting go presses nothing.
  const dragged = useRef(false);
  // The pager is as tall as the page in the middle, whatever the pages
  // beside it hold, and follows it as it grows or shrinks, as when the
  // month turns into one week.
  useEffect(() => {
    const viewport = viewportRef.current;
    const container = containerRef.current;
    const middle = middleRef.current;
    if (!(viewport && container && middle)) {
      return;
    }
    const observer = new ResizeObserver(() => {
      container.style.height = `${middle.offsetHeight}px`;
      // Hidden, as behind another tab, it has no width to go by.
      if (viewport.offsetWidth > 0) {
        setWidth(viewport.offsetWidth);
      }
    });
    observer.observe(middle);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, []);
  // Before the new page paints, so the jump back to the middle is unseen;
  // also when the page changes otherwise, as by the arrows, mid-swipe.
  const shownPage = useRef(page);
  useLayoutEffect(() => {
    if (shownPage.current !== page) {
      shownPage.current = page;
      x.jump(0);
    }
  }, [page, x]);
  const land = (velocity: number) => {
    const pageWidth = viewportRef.current?.offsetWidth ?? 0;
    if (pageWidth === 0) {
      x.jump(0);
      return;
    }
    const at = x.get();
    const flicked = Math.abs(velocity) > FLICK_SPEED;
    const rest = flicked ? at + velocity * FLICK_CARRY : at;
    const turned = Math.abs(rest) > pageWidth * TURN_SHARE;
    let direction: -1 | 0 | 1 = 0;
    if (turned) {
      direction = rest < 0 ? 1 : -1;
    }
    const settle = () => {
      if (direction !== 0) {
        onStep(direction);
      }
    };
    const target = -direction * pageWidth;
    if (reduceMotion) {
      x.jump(target);
      settle();
      return;
    }
    animate(x, target, {
      bounce: 0,
      onComplete: settle,
      type: "spring",
      velocity,
      visualDuration: 0.3,
    });
  };
  return (
    <div className={pager.viewport} ref={viewportRef}>
      <motion.div
        className={pager.drag}
        drag="x"
        dragConstraints={{ left: -width, right: width }}
        dragDirectionLock
        dragElastic={0.1}
        dragMomentum={false}
        onClickCapture={(event) => {
          if (dragged.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDragEnd={(_event, info) => {
          land(info.velocity.x);
        }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onPointerDownCapture={() => {
          dragged.current = false;
        }}
        style={{ x }}
      >
        <div className={pager.container} ref={containerRef}>
          {pageOffsets.map((offset) => (
            // The pages beside the one shown are only there to be dragged in.
            <div
              aria-hidden={offset !== 0}
              className={pager.slide}
              inert={offset !== 0}
              key={offset}
              ref={offset === 0 ? middleRef : undefined}
            >
              {renderPage(offset)}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
