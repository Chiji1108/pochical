import { Delete } from "lucide-react";
import { useMotionValue } from "motion/react";
import { useState } from "react";
import { css, cva } from "styled-system/css";

import { dateKey } from "../lib/design-days";
import { usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { PageDots } from "./design-choices";
import { PatternKeys, patternPagesOf, shiftInput } from "./design-shift-input";
import { fieldHint, fieldLabel } from "./design-ui";
import { useWeek, weekdayNameOf } from "./design-week";
import { ShiftMark } from "./shift-mark";

// A repeating order being put together: the days so far as tiles, one
// chosen ringed in the accent, over ポチポチ入力's keys.
const repeatEditor = {
  actions: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
    marginTop: "4px",
  }),
  day: cva({
    base: {
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
    },
    variants: {
      chosen: {
        true: {
          borderColor: "accent.default",
          boxShadow: "0 0 0 1px token(colors.accent.default)",
        },
      },
    },
  }),
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

// The order typed as ポチポチ入力 enters days: the patterns' keys add to
// its end, and ⌫ takes the last day back. A day pressed is chosen: a key
// then takes its place, and ⌫ takes it out. With the day it starts on,
// each day says its date, so where the weekend falls shows.
export function RepeatSequenceEditor({
  sequence,
  patternKeys,
  start,
  onChange,
}: {
  sequence: Shift[];
  patternKeys: Shift[];
  // The first day's date, when it is known.
  start?: Date;
  onChange: (sequence: Shift[]) => void;
}) {
  const book = usePatterns();
  const weekTools = useWeek();
  const [chosen, setChosen] = useState<number>();
  const [page, setPage] = useState(0);
  const progress = useMotionValue(0);
  const pages = patternPagesOf(patternKeys).length;
  const dateOf = (index: number) =>
    start &&
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
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
        {sequence.map((shift, index) => {
          const date = dateOf(index);
          return (
            // oxlint-disable-next-line react/no-array-index-key -- the same shift repeats, so its position is its identity.
            <li key={index}>
              <button
                aria-label={`${index + 1}日目、${book[shift]?.name}`}
                aria-pressed={chosen === index}
                className={repeatEditor.day({ chosen: chosen === index })}
                onClick={() => {
                  setChosen(chosen === index ? undefined : index);
                }}
                type="button"
              >
                <small
                  className={
                    date &&
                    shiftPreview.number({ tone: weekTools.dateTone(date) })
                  }
                >
                  {date
                    ? `${date.getMonth() + 1}/${date.getDate()}${weekdayNameOf(date.getDay())}`
                    : index + 1}
                </small>
                <ShiftMark shift={shift} size={18} />
                {book[shift]?.name}
              </button>
            </li>
          );
        })}
      </ol>
      <PatternKeys
        onPage={setPage}
        onPick={(key) => {
          if (chosen !== undefined && chosen < sequence.length) {
            onChange(
              sequence.map((shift, index) => (index === chosen ? key : shift))
            );
            setChosen(undefined);
          } else {
            onChange([...sequence, key]);
          }
        }}
        page={page}
        patternKeys={patternKeys}
        progress={progress}
      />
      <div className={repeatEditor.actions}>
        {pages > 1 && (
          <PageDots
            count={pages}
            current={Math.min(page, pages - 1)}
            label="シフトのページ"
            onPick={setPage}
            progress={progress}
          />
        )}
        <button
          className={shiftInput.action}
          disabled={sequence.length === 0}
          onClick={() => {
            onChange(
              chosen === undefined
                ? sequence.slice(0, -1)
                : sequence.filter((_, index) => index !== chosen)
            );
            setChosen(undefined);
          }}
          type="button"
        >
          <Delete aria-hidden="true" size={14} />
          {chosen === undefined ? "1つ消す" : "選んだ日を消す"}
        </button>
      </div>
      {chosen !== undefined && (
        <p className={fieldHint}>
          下のパターンを押すと、選んだ日と置き換わります。
        </p>
      )}
    </div>
  );
}
