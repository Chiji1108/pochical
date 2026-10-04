import { RadioGroup, SegmentGroup } from "@ark-ui/react";
import { Check } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type {
  ComponentProps,
  CSSProperties,
  LabelHTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import { css, cva, cx } from "styled-system/css";

import { spring } from "../lib/motion";
import { listRow, listStyle } from "./design-list";
import { srOnly } from "./design-ui";
import type { ButtonProps } from "./design-ui";

// Picking one of a few: segments, grids of choices, rows, chips and tags,
// and the dots under a pager.

// A segmented control: a few choices side by side, the picked one raised,
// as SwiftUI's segmented Picker and Compose's SegmentedButton. Each
// Segment brings its own content, a sample of what it picks or a word.
// Compact for words alone, tall for large samples.
type SegmentSize = "compact" | "regular" | "tall";
const SegmentSizeContext = createContext<SegmentSize>("regular");

// Round-ended, track and picked segment alike, as iOS 26's.
const segmentedStyle = css({
  bg: "fill.tertiary",
  border: 0,
  borderRadius: "full",
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
    _checked: { color: "text.primary", fontWeight: 600 },
    _focusVisible: {
      outline: "2px solid token(colors.accent.default)",
      outlineOffset: "-2px",
    },
    alignItems: "center",
    borderRadius: "full",
    color: "text.secondary",
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
  bg: "background.card",
  borderRadius: "full",
  boxShadow: "sm",
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
  disabled,
  ref,
  children,
}: {
  // What is being picked; hidden unless labelClassName shows it.
  label: string;
  value: Value | null;
  onValueChange: (value: Value) => void;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <RadioGroup.Root
      className={className}
      disabled={disabled}
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
    "&[data-state=checked]": {
      bg: "background.card",
      borderColor: "accent.default",
    },
    aspectRatio: 1,
    bg: "fill.quaternary",
    border: "1.5px solid transparent",
    borderRadius: "md",
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
      boxShadow:
        "0 0 0 3px token(colors.background.base), 0 0 0 5px currentcolor",
    },
    border: "2px solid currentcolor",
    borderRadius: "circle",
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

// Dots under a pager, one for each page, the one shown stretched into a
// short bar, so pages to the side are not missed. It tells the page by
// its shape as well as its shade. The bar follows the swipe, shrinking
// back to a dot as the next one grows, as the month's name follows the
// calendar's swipe: moving only once the page has landed felt late.
const pageDots = {
  bar: css({
    bg: "text.quaternary",
    borderRadius: "full",
    height: "8px",
    overflow: "hidden",
    position: "relative",
  }),
  button: css({
    _focusVisible: {
      outline: "2px solid token(colors.accent.default)",
      outlineOffset: "-2px",
    },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "full",
    cursor: "pointer",
    display: "flex",
    height: "24px",
    justifyContent: "center",
    padding: "0 4px",
  }),
  // The shown page's shade, over the dot as much as the page shows.
  fill: css({ bg: "text.primary", inset: 0, position: "absolute" }),
  group: css({
    border: 0,
    display: "flex",
    justifyContent: "center",
    margin: 0,
    padding: 0,
  }),
};
const DOT_SIZE = 8;
const BAR_LENGTH = 20;

export function PageDots({
  count,
  current,
  label,
  onPick,
  progress,
}: {
  count: number;
  current: number;
  // What the pages hold, for a screen reader.
  label: string;
  onPick: (page: number) => void;
  // The pager's own, how far it is swiped toward the next page.
  progress?: MotionValue<number>;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const still = useMotionValue(0);
  const swipe = progress ?? still;
  // Where the bar is, in pages: the page shown, plus how far it is
  // swiped.
  const position = useMotionValue(current);
  const base = useRef(current);
  // Landed by a swipe, the bar is already on the new page; turned by a
  // dot, it slides there.
  const landed = useRef(false);
  useMotionValueEvent(swipe, "change", (share) => {
    if (Math.abs(share) === 1) {
      landed.current = true;
    }
    position.stop();
    position.set(base.current + share);
  });
  useLayoutEffect(() => {
    if (base.current === current) {
      return;
    }
    base.current = current;
    if (landed.current || reduceMotion) {
      position.set(current);
    } else {
      animate(position, current, spring("standard"));
    }
    landed.current = false;
  }, [current, position, reduceMotion]);
  return (
    <fieldset aria-label={label} className={pageDots.group}>
      {Array.from({ length: count }, (_, page) => (
        <button
          aria-current={page === current}
          aria-label={`${page + 1}ページ目`}
          className={pageDots.button}
          key={page}
          onClick={() => {
            onPick(page);
          }}
          type="button"
        >
          <PageDot page={page} position={position} />
        </button>
      ))}
    </fieldset>
  );
}

// One dot, as long and as dark as the bar is on it.
function PageDot({
  page,
  position,
}: {
  page: number;
  position: MotionValue<number>;
}) {
  const share = useTransform(position, (at) =>
    Math.max(0, 1 - Math.abs(at - page))
  );
  const width = useTransform(
    share,
    (on) => DOT_SIZE + (BAR_LENGTH - DOT_SIZE) * on
  );
  return (
    <motion.span className={pageDots.bar} style={{ width }}>
      <motion.span className={pageDots.fill} style={{ opacity: share }} />
    </motion.span>
  );
}

// The focus ring sits outside a tile, and inside a row, whose list clips.
const choiceStyle = cva({
  base: {
    _focusVisible: { outline: "2px solid token(colors.accent.default)" },
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

const choiceRowHover = css({ _hover: { bg: "fill.tertiary" } });

const choiceRowCheck = css({
  "[data-state=checked] > &": { visibility: "visible" },
  color: "accent.default",
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
      bg: "accent.container",
      borderColor: "accent.border",
      color: "accent.default",
      fontWeight: 600,
    },
    alignItems: "center",
    bg: "background.card",
    border: "1px solid token(colors.border.default)",
    borderRadius: "full",
    color: "text.secondary",
    cursor: "pointer",
    display: "inline-flex",
    textStyle: "footnote",
    gap: "4px",
    minHeight: "34px",
    paddingInline: "12px",
  },
  variants: {
    // A face at its start, as Material's input chips: the chip's end
    // comes in close around it.
    avatar: { true: { gap: "8px", paddingLeft: "4px" } },
    variant: {
      add: { borderStyle: "dashed", color: "text.tertiary" },
      choice: {},
    },
  },
});

// One of a ChoiceGrid as a chip, like a day's shift or a person to show.
export function ChoiceChip({
  avatar = false,
  className,
  ...props
}: ComponentProps<typeof Choice> & { avatar?: boolean }) {
  return <Choice className={cx(chipStyle({ avatar }), className)} {...props} />;
}

// One of a ChoiceGrid as a tile: a picture over its name, framed on a
// ground and its name in bold when picked. large for a few big pictures two to a row, like the
// app icons; small for three to a row, like the テーマ.
const choiceTileStyle = cva({
  base: {
    _checked: {
      bg: "fill.quaternary",
      borderColor: "accent.border",
      color: "text.primary",
      fontWeight: 600,
    },
    bg: "transparent",
    border: "2px solid transparent",
    color: "text.secondary",
    display: "flex",
    flexDirection: "column",
  },
  variants: {
    size: {
      large: {
        alignItems: "center",
        borderRadius: "2xl",
        gap: "8px",
        padding: "20px 0 16px",
        textStyle: "body",
      },
      small: {
        borderRadius: "xl",
        gap: "4px",
        padding: "4px 4px 8px",
        textAlign: "center",
        textStyle: "footnote",
      },
    },
  },
});

export function ChoiceTile({
  size,
  className,
  ...props
}: ComponentProps<typeof Choice> & { size: "large" | "small" }) {
  return (
    <Choice className={cx(choiceTileStyle({ size }), className)} {...props} />
  );
}

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
    borderRadius: "sm",
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
      accent: { bg: "accent.container", color: "accent.default" },
      neutral: { bg: "fill.quaternary", color: "text.secondary" },
      raised: { bg: "background.card", color: "text.primary" },
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
