import { Plus } from "lucide-react";
import { css, cva } from "styled-system/css";

import { dateKey } from "../lib/design-days";
import { usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { fieldHint, fieldLabel } from "./design-ui";
import { useWeek } from "./design-week";
import { ShiftMark } from "./shift-mark";

// A repeating order being put together: the days so far as tiles, each
// taken out by a tap, over the patterns to add, dashed like the
// platforms' add buttons.
const repeatEditor = {
  add: css({
    alignItems: "center",
    bg: "transparent",
    border: "1px dashed token(colors.border.strong)",
    borderRadius: "full",
    color: "accent.default",
    display: "inline-flex",
    gap: "4px",
    minHeight: "32px",
    padding: "0 12px",
    textStyle: "caption",
  }),
  day: css({
    "& > small": { color: "text.quaternary", fontSize: "8px" },
    "& > span": { fontFamily: "emoji", fontSize: "18px", lineHeight: 1.2 },
    alignItems: "center",
    bg: "background.card",
    border: "1px solid token(colors.border.default)",
    borderRadius: "lg",
    color: "text.secondary",
    display: "flex",
    flexDirection: "column",
    fontSize: "9px",
    gap: "1px",
    height: "58px",
    justifyContent: "center",
    position: "relative",
    width: "38px",
  }),
  palette: css({ display: "flex", flexWrap: "wrap", gap: "8px" }),
  sequence: css({
    bg: "fill.quaternary",
    borderRadius: "2xl",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    listStyle: "none",
    margin: "0 0 8px",
    minHeight: "58px",
    padding: "8px",
  }),
};

// Days with the shift each gets, as a strip of small tiles a week wide:
// the first two weeks of an order being set up, in the first run and in
// settings alike.
const shiftPreview = {
  day: css({
    alignItems: "center",
    bg: "fill.quaternary",
    borderRadius: "sm",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    padding: "4px 0",
  }),
  number: cva({
    base: {
      color: "text.tertiary",
      fontFamily: "-apple-system, sans-serif",
      fontSize: "9px",
    },
    variants: {
      tone: {
        holiday: { color: "calendar.holiday" },
        plain: {},
        saturday: { color: "calendar.saturday" },
      },
    },
  }),
  strip: css({
    display: "grid",
    fontFamily: "emoji",
    fontSize: "16px",
    gap: "4px",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    textAlign: "center",
  }),
};

export function ShiftPreview({
  label,
  days,
}: {
  label: string;
  days: { date: Date; shift: Shift | undefined }[];
}) {
  const weekTools = useWeek();
  return (
    <div aria-label={label} className={shiftPreview.strip} role="img">
      {days.map(({ date, shift }) => (
        <span className={shiftPreview.day} key={dateKey(date)}>
          <small
            className={shiftPreview.number({ tone: weekTools.dateTone(date) })}
          >
            {date.getDate()}
          </small>
          {shift && <ShiftMark shift={shift} size={16} />}
        </span>
      ))}
    </div>
  );
}

export function RepeatSequenceEditor({
  sequence,
  patternKeys,
  onChange,
}: {
  sequence: Shift[];
  patternKeys: Shift[];
  onChange: (sequence: Shift[]) => void;
}) {
  const book = usePatterns();
  return (
    <div>
      <p className={fieldLabel()}>
        並び
        <span className={fieldHint}>
          {sequence.length > 0
            ? `${sequence.length}日ごとに繰り返し`
            : "下から順番に追加してください"}
        </span>
      </p>
      <ol className={repeatEditor.sequence}>
        {sequence.map((shift, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- the same shift repeats, so its position is its identity.
          <li key={index}>
            <button
              aria-label={`${index + 1}日目、${book[shift]?.name}。タップで外す`}
              className={repeatEditor.day}
              onClick={() => {
                onChange(sequence.filter((_, position) => position !== index));
              }}
              type="button"
            >
              <small>{index + 1}</small>
              <ShiftMark shift={shift} size={18} />
              {book[shift]?.name}
            </button>
          </li>
        ))}
      </ol>
      <div className={repeatEditor.palette}>
        {patternKeys.map((key) => (
          <button
            className={repeatEditor.add}
            key={key}
            onClick={() => {
              onChange([...sequence, key]);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={11} />
            <ShiftMark shift={key} size={13} />
            {book[key]?.name}
          </button>
        ))}
      </div>
    </div>
  );
}
