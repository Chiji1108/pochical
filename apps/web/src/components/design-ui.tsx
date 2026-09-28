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
import useEmblaCarousel from "embla-carousel-react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
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
    // One weight for every strength, as Material and most libraries do:
    // the ground tells them apart. Subtle alone steps down.
    fontWeight: 500,
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
    borderRadius: "13px",
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
      <Switch.Label className="dc-sr-only">{label}</Switch.Label>
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

const segmentedStyle = css({
  bg: "fill2",
  border: 0,
  borderRadius: "14px",
  display: "grid",
  gap: "3px",
  gridAutoColumns: "minmax(0, 1fr)",
  gridAutoFlow: "column",
  margin: 0,
  padding: "3px",
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
    borderRadius: "11px",
    color: "text2",
    cursor: "pointer",
    display: "flex",
    fontSize: "13px",
    justifyContent: "center",
    position: "relative",
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
  borderRadius: "11px",
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
      <SegmentGroup.Label className="dc-sr-only">{label}</SegmentGroup.Label>
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
  labelClassName = "dc-sr-only",
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
      {leading && <span className={listRow.leading}>{leading}</span>}
      <span className={cx(listRow.label, listRow.labelGrow)}>{label}</span>
      <Check aria-hidden="true" className={choiceRowCheck} size={20} />
    </Choice>
  );
}

// A chip to press: picked or not, one of several or several at once,
// with a mark or a check before its words. `add` is the dashed chip that
// adds another.
const chipStyle = cva({
  base: {
    "&[aria-pressed=true]": {
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
    fontSize: "12px",
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
  gap: "6px",
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
        <legend className="dc-sr-only">{label}</legend>
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
    gap: "3px",
    lineHeight: 1.4,
  },
  variants: {
    size: {
      md: { fontSize: "12px", paddingBlock: "4px", paddingInline: "10px" },
      sm: { fontSize: "10px", paddingBlock: "1px", paddingInline: "7px" },
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

const menu = {
  check: css({ color: "accent", flexShrink: 0 }),
  content: css({
    _closed: { animation: "fadeOut 0.12s ease-in" },
    _open: { animation: "fadeIn 0.12s ease-out" },
    bg: "raised",
    border: "1px solid token(colors.border)",
    borderRadius: "14px",
    boxShadow: "0 8px 24px var(--shadow-strong)",
    minWidth: "190px",
    outline: "none",
    padding: "6px",
    zIndex: 30,
  }),
  icon: css({ color: "text3", flexShrink: 0 }),
  item: css({
    _highlighted: { bg: "fill2" },
    alignItems: "center",
    borderRadius: "9px",
    color: "text",
    cursor: "default",
    display: "flex",
    fontSize: "14px",
    gap: "10px",
    padding: "9px 10px",
    userSelect: "none",
  }),
  separator: css({
    border: 0,
    borderTop: "1px solid token(colors.separator)",
    margin: "4px 6px",
  }),
  trigger: css({
    alignItems: "center",
    bg: "fill2",
    border: 0,
    borderRadius: "16px",
    color: "text2",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: "13px",
    fontWeight: 600,
    gap: "4px",
    padding: "7px 10px 7px 12px",
  }),
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
            size={16}
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
    paddingBottom: "11px",
    textAlign: "center",
  },
  variants: {
    // Tighter over a small picture of the calendar.
    compact: { true: { paddingBottom: "6px" } },
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
  // height of the one shown, which animates itself.
  container: css({
    alignItems: "flex-start",
    display: "flex",
    touchAction: "pan-y pinch-zoom",
  }),
  slide: css({ flex: "0 0 100%", minWidth: 0 }),
  // clip rather than hidden: a hidden box can still be scrolled, as the
  // browser keeping its place while the grid folds, which slid the pages.
  viewport: css({ overflow: "clip" }),
};

type PageOffset = -1 | 0 | 1;

const pageOffsets: PageOffset[] = [-1, 0, 1];

// How close, in pixels, a swiped page is to its place when it counts as there.
const LANDED_DISTANCE = 0.5;

// Pages that follow the finger sideways, as SwiftUI's TabView(.page) and
// Compose's HorizontalPager, for months or weeks without end. Only the
// pages before and after are drawn; once a swipe settles, `onStep` moves
// on and the pager quietly goes back to the middle, which now shows the
// new page. Embla Carousel does the dragging, and keeps a drag from also
// pressing what is under the finger.
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
  // Keeps all three pages as places to stop even while they have no width
  // yet, as before the stylesheet comes in; otherwise Embla folds them into
  // one and keeps showing the page before once they widen.
  const [viewportRef, api] = useEmblaCarousel({
    containScroll: "keepSnaps",
    startIndex: 1,
  });
  const shownPage = useRef(page);
  // Stepped already, until the new page is in the middle.
  const stepped = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  // The pager is as tall as the page in the middle, whatever the pages
  // beside it hold, and follows it as it grows or shrinks, as when the
  // month turns into one week.
  useEffect(() => {
    const container = containerRef.current;
    const middle = middleRef.current;
    if (!(container && middle)) {
      return;
    }
    const observer = new ResizeObserver(() => {
      container.style.height = `${middle.offsetHeight}px`;
    });
    observer.observe(middle);
    return () => {
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!api) {
      return;
    }
    // Embla's own "settle" waits for the spring to come within a
    // thousandth of a pixel, seconds after it looks still. Step as soon as
    // the page is within half a pixel of its place and barely moving, not
    // passing through it on the bounce.
    const land = () => {
      const index = api.selectedScrollSnap();
      const { dragHandler, location, previousLocation, target } =
        api.internalEngine();
      const resting =
        !dragHandler.pointerDown() &&
        Math.abs(target.get() - location.get()) < LANDED_DISTANCE &&
        Math.abs(location.get() - previousLocation.get()) < LANDED_DISTANCE;
      if (index === 1 || stepped.current || !resting) {
        return;
      }
      stepped.current = true;
      onStep(index === 2 ? 1 : -1);
    };
    api.on("scroll", land);
    api.on("settle", land);
    return () => {
      api.off("scroll", land);
      api.off("settle", land);
    };
  }, [api, onStep]);
  // Before the new page paints, so the jump back to the middle is unseen.
  useLayoutEffect(() => {
    if (shownPage.current !== page) {
      shownPage.current = page;
      api?.scrollTo(1, true);
      // Only after the jump: Embla tells of it before it names the middle
      // page as the one shown.
      stepped.current = false;
    }
  }, [api, page]);
  return (
    <div className={pager.viewport} ref={viewportRef}>
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
    </div>
  );
}
