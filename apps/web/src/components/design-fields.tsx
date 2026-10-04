import { textLimits } from "@pochical/design/limits";
import type { TextKind } from "@pochical/design/limits";
import { lazy, Suspense, useRef, useState } from "react";
import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { css, cva, cx } from "styled-system/css";

import { characterCount, countShown, limitText } from "../lib/text-limits";

// Fields: times, text held to its limit (spec/text-limits.md) and a
// mark's letter, with the bits shown beside them.

// How a text field looks, for LimitedInput and a plain input alike.
// inline is a row's control with no box of its own, like a pattern's
// name: its words at the row's right, or from its start when it is the
// row itself, like a name being added. box stands on its own ground, as
// a day's memo. chip sits among chips as one more being added.
export const fieldStyle = cva({
  base: { font: "inherit", outline: "none" },
  defaultVariants: { align: "start" },
  variants: {
    align: { end: { textAlign: "right" }, start: {} },
    look: {
      box: {
        _focus: { bg: "background.card", borderColor: "accent.focus" },
        bg: "fill.quaternary",
        border: "1px solid transparent",
        borderRadius: "md",
        color: "text.primary",
        minHeight: "40px",
        minWidth: 0,
        padding: "0 12px",
        textStyle: "body",
      },
      chip: {
        border: "1px solid token(colors.accent.focus)",
        borderRadius: "full",
        minHeight: "34px",
        padding: "0 12px",
        textStyle: "footnote",
      },
      inline: {
        bg: "transparent",
        border: 0,
        color: "text.primary",
        flex: 1,
        minWidth: 0,
        padding: 0,
        textStyle: "body",
      },
    },
  },
});

// A time of day as the platforms' compact time pickers show it: a filled
// pill with the hour and the minute as their own parts, each picked by a
// tap and set by typing digits or with ↑↓ (React Aria's TimeField, which
// HeroUI's is built on). 24-hour, as Japanese schedules write it.
const timeField = {
  // As iOS's compact DatePicker (measured on the iOS 27 simulator): a
  // capsule about 35pt tall in a shade deeper than a text field's fill, so
  // it shows on a list's card too; while it is being set its time turns
  // the accent color.
  field: css({
    "&[data-focus-within]": { color: "accent.default" },
    alignItems: "center",
    bg: "fill.tertiary",
    borderRadius: "full",
    color: "text.primary",
    cursor: "text",
    display: "inline-flex",
    fontVariantNumeric: "tabular-nums",
    minHeight: "36px",
    padding: "0 12px",
    textStyle: "body",
  }),
  segment: css({
    "&[data-placeholder]": { color: "text.tertiary" },
    "&[data-type=literal]": { padding: 0 },
    _focus: { bg: "accent.fill", color: "accent.onFill" },
    borderRadius: "xs",
    outline: "none",
    padding: "0 2px",
  }),
};

const AriaTimeInput = lazy(async () => await import("./design-time-field"));

export function TimeField({
  label,
  value,
  onValueChange,
}: {
  // For screen readers; the row names the time on screen.
  label: string;
  // "HH:MM".
  value: string;
  onValueChange: (value: string) => void;
}) {
  // Until React Aria arrives, the same pill with the time as plain text.
  return (
    <Suspense fallback={<span className={timeField.field}>{value}</span>}>
      <AriaTimeInput
        fieldClassName={timeField.field}
        label={label}
        onValueChange={onValueChange}
        segmentClassName={timeField.segment}
        value={value}
      />
    </Suspense>
  );
}

// A shift's start and end, side by side.
export function TimeRange({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (field: "start" | "end", value: string) => void;
}) {
  return (
    <span className={timeRange}>
      <TimeField
        label="開始時刻"
        onValueChange={(value) => {
          onChange("start", value);
        }}
        value={start}
      />
      <span aria-hidden="true">–</span>
      <TimeField
        label="終了時刻"
        onValueChange={(value) => {
          onChange("end", value);
        }}
        value={end}
      />
    </span>
  );
}

const timeRange = css({
  alignItems: "center",
  color: "text.tertiary",
  display: "inline-flex",
  gap: "8px",
});

// How much of a field's limit is used, after the field while it is in use.
const limitCount = cva({
  base: {
    color: "text.tertiary",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    textStyle: "caption",
  },
  // Only while a word is still being converted can it run past.
  variants: { over: { true: { color: "danger.default" } } },
});

// Free text held to its limit (spec/text-limits.md): typing stops there,
// and while the field is in use a count after it shows how much is used.
// A word still being converted with a Japanese keyboard may run past the
// limit until it is confirmed, and is cut to it then, so a conversion is
// never broken off halfway. Without `value` it keeps its own, for fields
// read as they are left, like adding a name.
type LimitedTextProps = {
  kind: TextKind;
  value?: string;
  onValueChange?: (value: string) => void;
  // False where the field is too small to show it, like a chip.
  counter?: boolean;
};

// What LimitedInput and LimitedTextArea share: the text held to its
// limit, the handlers that hold it there, and the count to show.
function useLimitedText<Field extends HTMLInputElement | HTMLTextAreaElement>({
  kind,
  value,
  onValueChange,
  counter = true,
  onFocus,
  onBlur,
}: LimitedTextProps & {
  onFocus?: (event: FocusEvent<Field>) => void;
  onBlur?: (event: FocusEvent<Field>) => void;
}) {
  const limit = textLimits[kind];
  const [own, setOwn] = useState("");
  const [focused, setFocused] = useState(false);
  const composing = useRef(false);
  const text = value ?? own;
  const change = (next: string) => {
    setOwn(next);
    onValueChange?.(next);
  };
  const count = characterCount(text);
  const handlers = {
    onBlur: (event: FocusEvent<Field>) => {
      setFocused(false);
      onBlur?.(event);
    },
    onChange: (event: ChangeEvent<Field>) => {
      const next = event.target.value;
      change(composing.current ? next : limitText(next, limit));
    },
    onCompositionEnd: (event: CompositionEvent<Field>) => {
      composing.current = false;
      change(limitText(event.currentTarget.value, limit));
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onFocus: (event: FocusEvent<Field>) => {
      setFocused(true);
      onFocus?.(event);
    },
    value: text,
  };
  const shown = counter && focused && countShown(count, limit);
  const countNode = shown && (
    <span aria-hidden="true" className={limitCount({ over: count > limit })}>
      {count}/{limit}
    </span>
  );
  return { countNode, handlers, text };
}

type Unlimited = "value" | "defaultValue" | "onChange" | "maxLength";

export function LimitedInput({
  kind,
  value,
  onValueChange,
  counter,
  onFocus,
  onBlur,
  look,
  align,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, Unlimited> &
  LimitedTextProps & {
    look: "inline" | "box" | "chip";
    align?: "start" | "end";
  }) {
  const { countNode, handlers } = useLimitedText<HTMLInputElement>({
    counter,
    kind,
    onBlur,
    onFocus,
    onValueChange,
    value,
  });
  return (
    <>
      <input
        className={cx(fieldStyle({ align, look }), className)}
        {...props}
        {...handlers}
      />
      {countNode}
    </>
  );
}

// A mark's letter, a shift's or a group's: its first characters, up to the
// limit, with no count, since the mark beside it shows what fits. It may
// be empty while written, and left empty it shows the letter it had; a
// mark is never without one. Focusing selects the letter, so typing
// replaces it.
export function MarkLetterInput({
  kind,
  value,
  onLetter,
}: {
  kind: "shiftMark" | "groupMark";
  value: string;
  onLetter: (letter: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <LimitedInput
      align="end"
      aria-label="文字"
      counter={false}
      kind={kind}
      look="inline"
      onBlur={() => {
        setDraft(undefined);
      }}
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onValueChange={(next) => {
        setDraft(next);
        const count = characterCount(next);
        if (count > 0 && count <= textLimits[kind]) {
          onLetter(next);
        }
      }}
      value={draft ?? value}
    />
  );
}

// A field over as many lines as it is written in, as a message is. The
// field and an unseen copy of its text share one grid cell, and the copy
// sizes the cell: the field grows with its lines, up to `--lines` of them
// (5 unless its class says), then scrolls. It is never shrunk to measure
// itself, which on iPhone Safari pulled the chat above it down a line with
// every letter typed on a second line. Its class gives the box; the
// padding comes as `--pad-y` and `--pad-x`, shared by field and copy.
const growing = {
  box: css({
    "&::after": {
      content: "attr(data-value) ' '",
      gridArea: "1 / 1",
      maxHeight: "calc(var(--lines, 5) * 1lh + 2 * var(--pad-y, 0px))",
      overflow: "hidden",
      overflowWrap: "anywhere",
      padding: "var(--pad-y, 0px) var(--pad-x, 0px)",
      visibility: "hidden",
      whiteSpace: "pre-wrap",
    },
    display: "grid",
  }),
  field: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    font: "inherit",
    gridArea: "1 / 1",
    lineHeight: "inherit",
    minWidth: 0,
    outline: "none",
    overflowWrap: "anywhere",
    overflowY: "auto",
    padding: "var(--pad-y, 0px) var(--pad-x, 0px)",
    resize: "none",
    whiteSpace: "pre-wrap",
    width: "100%",
  }),
};

// LimitedInput over several lines: Return starts a new one, as in the
// messaging apps on a phone.
export function LimitedTextArea({
  kind,
  value,
  onValueChange,
  counter,
  onFocus,
  onBlur,
  className,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, Unlimited | "rows"> &
  LimitedTextProps) {
  const { countNode, handlers, text } = useLimitedText<HTMLTextAreaElement>({
    counter,
    kind,
    onBlur,
    onFocus,
    onValueChange,
    value,
  });
  return (
    <>
      <span className={cx(growing.box, className)} data-value={text}>
        <textarea {...props} {...handlers} className={growing.field} rows={1} />
      </span>
      {countNode}
    </>
  );
}

// A row's value that is a mark with words, or a mark alone: side by side,
// at the right.
export const markValue = css({
  alignItems: "center",
  display: "inline-flex",
  gap: "8px",
  justifyContent: "flex-end",
});

// 見本 on a preview's top edge at the right, as the style page's calendar
// has it: what is under it shows how something looks, and is not a row
// to press. The preview is positioned.
const sampleTagStyle = css({
  bg: "background.base",
  border: "1px solid token(colors.separator)",
  borderRadius: "sm",
  color: "text.tertiary",
  fontSize: "10px",
  fontWeight: 600,
  padding: "1px 8px",
  position: "absolute",
  right: "12px",
  top: "-8px",
});

// A preview that pages between places names the one shown instead, as
// the style page's カレンダー and ウィジェット.
export function SampleTag({ label = "見本" }: { label?: ReactNode }) {
  return (
    <span aria-hidden="true" className={sampleTagStyle}>
      {label}
    </span>
  );
}

// A mark shown large at the top of the page that edits it, with its name
// and time beside it, or alone in the middle; marked 見本, as it looks
// like a list's row but is not one.
export const markPreview = cva({
  base: {
    "& strong": { textStyle: "body" },
    alignItems: "center",
    bg: "fill.quaternary",
    borderRadius: "2xl",
    display: "flex",
    gap: "16px",
    padding: "16px",
    position: "relative",
  },
  variants: {
    alone: { true: { justifyContent: "center", minHeight: "84px" } },
  },
});
