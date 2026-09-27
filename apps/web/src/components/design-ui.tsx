import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, ChangeEvent, ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

// The shared pieces the screens are built from, each the one place its
// look is decided. They map one to one onto the SwiftUI views and Compose
// composables of the native apps; /design/components shows them all.

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
    borderRadius: "control",
    cursor: "pointer",
    display: "flex",
    fontSize: "14px",
    fontWeight: 600,
    gap: "8px",
    justifyContent: "center",
  },
  defaultVariants: { variant: "primary" },
  variants: {
    variant: {
      primary: {
        bg: "accentFill",
        color: "onAccentFill",
        minHeight: "control",
        width: "100%",
      },
      quiet: {
        "&:hover:not(:disabled)": { bg: "fill2" },
        bg: "fill",
        color: "accent",
        minHeight: "control",
        width: "100%",
      },
      subtle: {
        alignSelf: "center",
        bg: "transparent",
        color: "text3",
        fontSize: "13px",
        fontWeight: 400,
        margin: "8px auto 0",
        minHeight: "touch",
        paddingInline: "12px",
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
  className,
  ...props
}: ButtonProps & { variant?: "primary" | "quiet" | "text" | "subtle" }) {
  return (
    <button
      className={cx(
        buttonStyle({ variant }),
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
const iconButtonStyle = css({
  _hover: { bg: "fill" },
  bg: "transparent",
  border: 0,
  borderRadius: "action",
  color: "accent",
  display: "grid",
  flexShrink: 0,
  height: "action",
  placeItems: "center",
  width: "action",
});

export function IconButton({
  label,
  className,
  ...props
}: ButtonProps & { label: string }) {
  return (
    <button
      aria-label={label}
      className={cx(iconButtonStyle, "ui-icon-button", className)}
      type="button"
      {...props}
    />
  );
}

// Back to where the page came from, named after it (設定, グループ), or
// キャンセル without the chevron where leaving drops what was entered.
// Without children it is the chevron alone, labelled 戻る. Disabled, it
// keeps its place but hides, as while a list is being sorted.
const backButtonStyle = css({
  _disabled: { visibility: "hidden" },
  alignItems: "center",
  alignSelf: "flex-start",
  bg: "transparent",
  border: 0,
  color: "accent",
  display: "inline-flex",
  fontSize: "14px",
  gap: "2px",
  marginLeft: "-6px",
  minHeight: "action",
  paddingRight: "8px",
});

export function BackButton({
  chevron = true,
  className,
  children,
  ...props
}: ButtonProps & { chevron?: boolean }) {
  return (
    <button
      aria-label={children ? undefined : "戻る"}
      className={cx(backButtonStyle, className)}
      type="button"
      {...props}
    >
      {chevron && <ChevronLeft aria-hidden="true" size={20} />}
      {children}
    </button>
  );
}

// The action at a page's top right: 保存, 作る, 並び替え and the like.
const headerActionStyle = css({
  _disabled: { color: "textDisabled", cursor: "default" },
  bg: "transparent",
  border: 0,
  color: "accent",
  fontSize: "15px",
  fontWeight: 600,
  minHeight: "action",
  paddingLeft: "12px",
  paddingRight: "4px",
});

export function HeaderAction({ className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(headerActionStyle, className)}
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
    display: "flex",
    justifyContent: "space-between",
  }),
  root: css({ display: "flex", flexDirection: "column", gap: "4px" }),
  title: css({ fontSize: "26px", fontWeight: 600, margin: 0 }),
};

export function PageHeader({
  title,
  back,
  onBack,
  leading,
  trailing,
  children,
}: {
  title?: ReactNode;
  back?: string;
  onBack?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const start =
    leading ?? (onBack && <BackButton onClick={onBack}>{back}</BackButton>);
  return (
    <header className={pageHeader.root}>
      {trailing ? (
        <div className={pageHeader.bar}>
          {start}
          {trailing}
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

// One row of a list, and its parts for rows drawn by hand.
export const listRow = {
  arrow: css({ color: "textFaint", flexShrink: 0, marginRight: "-4px" }),
  label: css({
    "& small": { color: "text3", fontSize: "11px" },
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "2px",
  }),
  // With nothing on the right but a control, the label takes the room.
  labelGrow: css({ flex: 1, minWidth: 0 }),
  leading: css({
    color: "text2",
    display: "flex",
    flexShrink: 0,
    marginRight: "2px",
  }),
  root: css({
    // A line between rows, not above the first: only a row that follows
    // another, whatever else the list holds, like a legend.
    "[data-list-row] + &": { borderTop: "1px solid token(colors.separator)" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "text",
    display: "flex",
    fontSize: "14px",
    gap: "10px",
    minHeight: "48px",
    paddingInline: "14px",
    textAlign: "left",
    width: "100%",
  }),
  // Rows that do something when pressed.
  pressable: css({
    "&:is(button):hover": { bg: "fill2" },
    cursor: "pointer",
  }),
  danger: css({ "& > *": { color: "danger" }, color: "danger" }),
  value: css({
    color: "text3",
    flex: 1,
    fontSize: "13px",
    minWidth: 0,
    overflow: "hidden",
    textAlign: "right",
    textOverflow: "ellipsis",
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
      {leading && <span className={listRow.leading}>{leading}</span>}
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

// An on and off switch, drawn by the pe-toggle styles for now.
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // For a switch outside a row's label.
  label?: string;
}) {
  return (
    <input
      aria-checked={checked}
      aria-label={label}
      checked={checked}
      className="pe-toggle"
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.checked);
      }}
      role="switch"
      type="checkbox"
    />
  );
}

// A row whose control is an on and off switch, with a dot in the color a
// setting paints with when it has one.
export function SwitchRow({
  label,
  checked,
  onChange,
  swatch,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  swatch?: string;
}) {
  return (
    <ListRow
      control={<Toggle checked={checked} onChange={onChange} />}
      label={label}
      leading={
        swatch ? (
          <span
            aria-hidden="true"
            className={swatchStyle}
            style={{ background: swatch }}
          />
        ) : undefined
      }
    />
  );
}

const swatchStyle = css({
  borderRadius: "50%",
  flexShrink: 0,
  height: "10px",
  width: "10px",
});
