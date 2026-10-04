import { Switch } from "@ark-ui/react";
import { ChevronRight } from "lucide-react";
import { createContext, useId } from "react";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { srOnly } from "./design-ui";

// Lists and their rows, a row's toggle, and the row that sums up days.

// A number of days that opens what they are: 今月のお休み under the
// calendar, みんな休み under the group's shifts. A rounded row, not a pill:
// it opens what it sums up, where the pills below it do something.
// Colored as the hub's 次のみんな休み: the label quiet,
// the number in the color of days off, and the chevron faint, as the
// platforms' rows that open more: the whole row is what is pressed.
export const summaryRow = {
  chevron: css({
    alignSelf: "center",
    color: "text.quaternary",
    marginLeft: "12px",
  }),
  count: css({
    alignItems: "baseline",
    color: "accent.default",
    display: "flex",
    fontSize: "25px",
  }),
  row: css({
    alignItems: "center",
    bg: "fill.quaternary",
    border: 0,
    borderRadius: "2xl",
    color: "text.secondary",
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

// The label and the number may be names that roll, as the calendar's
// do with the month.
export function SummaryRow({
  label,
  days,
  onOpen,
}: {
  label: ReactNode;
  days: ReactNode;
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

// A list of rows on one rounded ground, as a grouped list on iOS and a
// card of list items on Android.
export const listStyle = css({
  bg: "fill.quaternary",
  borderRadius: "2xl",
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

// A quiet line inside a list, where its rows go on as something else, as
// where the patterns' buttons go on to their next page. Not a row, so the
// row after it draws no line of its own.
const listDividerStyle = css({
  borderTop: "1px solid token(colors.separator)",
  color: "text.tertiary",
  padding: "12px 16px 4px",
  textStyle: "caption",
});

export function ListDivider({ children }: { children: ReactNode }) {
  return (
    <div className={listDividerStyle} role="separator">
      {children}
    </div>
  );
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
    },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "text.primary",
    display: "flex",
    textStyle: "body",
    gap: "12px",
    // iOS 26's list rows: 52pt, and about 67pt with a subtitle.
    minHeight: "52px",
    paddingInline: "16px",
    // Every row, the first too: its separator hangs from it, and so does
    // a switch's hidden checkbox. Left to a box outside the scrolling
    // list, the checkbox stays where the row was before the list scrolled,
    // and iOS Safari scrolls the whole page to it when a tap focuses it.
    position: "relative",
    textAlign: "left",
    width: "100%",
  },
  variants: { twoLine: { true: { minHeight: "68px" } } },
});

// One row of a list, and its parts for rows drawn by hand.
export const listRow = {
  arrow: css({ color: "text.quaternary", flexShrink: 0, marginRight: "-4px" }),
  // In the arrow's place on a row that adds rather than opens: a plus in
  // the accent, told apart from the gray arrows of rows that go on.
  add: css({ color: "accent.default", flexShrink: 0, marginRight: "-4px" }),
  label: css({
    "& small": { color: "text.tertiary", textStyle: "caption" },
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "2px",
  }),
  // With nothing on the right but a control, the label takes the room.
  labelGrow: css({ flex: 1, minWidth: 0 }),
  // A name someone typed, on one line: cut short with … so the value and
  // arrow after it stay whole (spec/text-limits.md).
  labelText: css({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  valueWhole: css({ flex: "none" }),
  // One width whatever it holds, so every row's words start at the same
  // place, 56px in, as under iOS's icons.
  leading: css({
    // What it holds keeps its own size rather than squeezing to fit.
    "& > *": { flexShrink: 0 },
    color: "text.secondary",
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
    _hover: { "&:is(button)": { bg: "fill.tertiary" } },
    cursor: "pointer",
  }),
  danger: css({
    "& > *": { color: "danger.default" },
    color: "danger.default",
  }),
  value: css({
    color: "text.tertiary",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "right",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
};

// A control that says its value, as a pull-down, is named by the row's
// label and then the value, as the platforms read a Picker's row: シフト
// 日勤. The row's own <label> would name it シフト alone.
export const RowLabelContext = createContext<string | undefined>(undefined);

// A row: its label, a value on the right, something before the label
// (an icon, a mark, a face), and a control after it (a switch, a field).
// Pressed, it is a button with an arrow; holding a control, or pointing at
// one with htmlFor, it is that control's label. `danger` is for rows that
// remove something, and `truncate` for a label that is a typed name.
// `detail` is a line under the label, and makes it a two-line row.
export function ListRow({
  label,
  value,
  leading,
  control,
  onClick,
  arrow,
  danger = false,
  truncate = false,
  detail,
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
  truncate?: boolean;
  detail?: ReactNode;
  htmlFor?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
}) {
  const pressable = Boolean(onClick);
  const isLabel = !pressable && (control !== undefined || Boolean(htmlFor));
  const id = useId();
  // The label's id, for a control it names.
  const labelId = isLabel ? id : undefined;
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
          (value === undefined || truncate) && listRow.labelGrow,
          labelClassName
        )}
        id={labelId}
      >
        {truncate ? <span className={listRow.labelText}>{label}</span> : label}
        {detail !== undefined && <small>{detail}</small>}
      </span>
      {value !== undefined && (
        <span
          className={cx(
            listRow.value,
            truncate && listRow.valueWhole,
            valueClassName
          )}
        >
          {value}
        </span>
      )}
      <RowLabelContext.Provider value={labelId}>
        {control}
      </RowLabelContext.Provider>
      {shownArrow}
    </>
  );
  const rowClass = cx(
    detail === undefined ? listRow.root : listRow.twoLine,
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

const swatchStyle = css({
  borderRadius: "circle",
  flexShrink: 0,
  height: "10px",
  width: "10px",
});

// An on and off switch, as the platforms' Toggle and Switch: a track that
// fills with the theme when on, and a knob that slides across. Ark UI's
// Switch does the rest: the hidden checkbox, its label and focus.
const toggle = {
  thumb: css({
    _checked: { transform: "translateX(18px)" },
    bg: "control.knob",
    borderRadius: "circle",
    boxShadow: "sm",
    display: "block",
    height: "22px",
    transition: "transform 0.15s",
    width: "22px",
  }),
  track: css({
    _checked: { bg: "accent.fill" },
    _focusVisible: {
      outline: "2px solid token(colors.accent.default)",
      outlineOffset: "2px",
    },
    bg: "fill.primary",
    borderRadius: "full",
    cursor: "pointer",
    display: "block",
    flexShrink: 0,
    height: "26px",
    marginLeft: "auto",
    // The gap round the knob is the track's padding, not the knob's margin:
    // a Toggle's root is a block, and the margin would collapse through it.
    padding: "2px",
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
// setting paints with when it has one. `detail` is a line under the label
// saying what switching it changes; the row is then a two-line row's
// height, as the platforms' switches with a subtitle.
export function SwitchRow({
  label,
  detail,
  checked,
  onChange,
  swatch,
  leading,
  className,
}: {
  label: ReactNode;
  detail?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  swatch?: string;
  // Before the label, as a ListRow's: a group's mark.
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <Switch.Root
      checked={checked}
      className={cx(
        detail === undefined ? listRow.root : listRow.twoLine,
        listRow.pressable,
        className
      )}
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
      {leading && (
        <span className={listRow.leading} data-part="leading">
          {leading}
        </span>
      )}
      <Switch.Label className={cx(listRow.label, listRow.labelGrow)}>
        {label}
        {detail !== undefined && <small>{detail}</small>}
      </Switch.Label>
      <ToggleParts />
    </Switch.Root>
  );
}
