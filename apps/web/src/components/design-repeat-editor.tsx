import { ChevronLeft, ChevronRight, Delete } from "lucide-react";
import { useMotionValue } from "motion/react";
import { useState } from "react";
import { css, cva } from "styled-system/css";

import {
  addDays,
  dateKey,
  dayMilliseconds,
  formatDay,
  monthAfter,
  repeatSchedule,
} from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import { usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { PageDots } from "./design-choices";
import { monthGrid } from "./design-date-picker";
import { DayCell } from "./design-day-cell";
import { dayGrid, WeekdayRow } from "./design-day-grid";
import { monthWithYearOf } from "./design-month-name";
import { PatternKeys, patternPagesOf, shiftInput } from "./design-shift-input";
import { fieldHint, fieldLabel, srOnly } from "./design-ui";
import { useWeek, weekdayNameOf } from "./design-week";
import { ShiftMark } from "./shift-mark";

// A repeating order typed on a month, as ポチポチ入力 enters days: its
// keys under the month, and ⌫ and the pages' dots under them.
const repeatCalendar = {
  actions: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    justifyContent: "space-between",
    marginTop: "4px",
  }),
  heading: css({ marginBottom: "4px" }),
  keys: css({ marginTop: "12px" }),
};

// An order's days as its editor draws them, smaller and not to press:
// seven a row, so a week reads as one.
const sequenceTiles = {
  day: css({
    "& > small": { fontSize: "9px" },
    alignItems: "center",
    bg: "background.card",
    border: "1px solid token(colors.border.default)",
    borderRadius: "sm",
    color: "text.secondary",
    display: "flex",
    flexDirection: "column",
    fontSize: "10px",
    gap: "1px",
    justifyContent: "center",
    minHeight: "48px",
    minWidth: 0,
  }),
  grid: css({
    display: "grid",
    gap: "4px",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    listStyle: "none",
    margin: 0,
    padding: 0,
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
};

// Whole days from one date to another.
function daysFrom(from: Date, to: Date) {
  return Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      dayMilliseconds
  );
}

function monthOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// A repeating order typed on the calendar (spec/shift-patterns.md,
// Typing an order): the day pressed is its 1st, each key fills the next
// day, and the order comes round faintly after the days typed, as the
// calendar will show it. A day typed, pressed, is chosen: a key then
// takes its place and ⌫ takes it out. Any other day pressed moves the
// order to start there, keeping what was typed.
export function RepeatCalendar({
  sequence,
  anchor,
  from,
  before,
  holidayShift,
  patternKeys,
  onChange,
}: {
  sequence: Shift[];
  // The order's 1st day.
  anchor: Date;
  // The first day the order covers, when it starts before its 1st day
  // or after it; with none, it starts on its 1st day. Null covers every
  // day shown, as a first run does.
  from?: Date | null;
  // What the days before the order show, staying as they are.
  before?: Schedule;
  // 祝日は休みにする's pattern, when it is on.
  holidayShift?: Shift;
  patternKeys: Shift[];
  onChange: (order: { sequence: Shift[]; anchor: Date }) => void;
}) {
  const weekTools = useWeek();
  const [month, setMonth] = useState(() => monthOf(anchor));
  const [chosen, setChosen] = useState<number>();
  const [page, setPage] = useState(0);
  const progress = useMotionValue(0);
  const pages = patternPagesOf(patternKeys).length;
  const dates = weekTools.monthDates(month);
  const first = dates[0] ?? month;
  const last = dates.at(-1) ?? month;
  const orderStart = from === undefined ? anchor : from;
  const coversFrom =
    orderStart === null || orderStart < first ? first : orderStart;
  const planned =
    sequence.length > 0 && coversFrom <= last
      ? repeatSchedule(sequence, anchor, coversFrom, last, holidayShift)
      : {};
  const cursor = chosen ?? sequence.length;

  const pick = (key: Shift) => {
    if (chosen !== undefined && chosen < sequence.length) {
      onChange({
        anchor,
        sequence: sequence.map((shift, index) =>
          index === chosen ? key : shift
        ),
      });
      setChosen(undefined);
      return;
    }
    onChange({ anchor, sequence: [...sequence, key] });
    // The next day to type turns the month, as ポチポチ入力 moves on.
    const next = addDays(anchor, sequence.length + 1);
    if (next.getMonth() !== month.getMonth() && next > last) {
      setMonth(monthOf(next));
    }
  };

  const press = (date: Date) => {
    const index = daysFrom(anchor, date);
    if (index >= 0 && index < sequence.length) {
      setChosen(chosen === index ? undefined : index);
      return;
    }
    setChosen(undefined);
    if (index !== sequence.length) {
      onChange({ anchor: date, sequence });
    }
  };

  return (
    <div>
      <p className={fieldLabel()}>
        {formatDay(anchor)}から
        {sequence.length > 0 && (
          <span className={fieldHint}>{sequence.length}日ごとに繰り返し</span>
        )}
      </p>
      <div className={`${monthGrid.heading} ${repeatCalendar.heading}`}>
        <button
          aria-label="前の月"
          className={monthGrid.arrow}
          onClick={() => {
            setMonth(monthAfter(month, -1));
          }}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <strong aria-live="polite">
          <span className={srOnly}>
            {month.getFullYear()}年{month.getMonth() + 1}月
          </span>
          <span aria-hidden="true">
            {monthWithYearOf(month, weekTools.english)}
          </span>
        </strong>
        <button
          aria-label="次の月"
          className={monthGrid.arrow}
          onClick={() => {
            setMonth(monthAfter(month, 1));
          }}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
      <WeekdayRow compact />
      <section aria-label="繰り返しの並び" className={dayGrid}>
        {dates.map((date) => {
          const key = dateKey(date);
          const index = daysFrom(anchor, date);
          const typed = index >= 0 && index < sequence.length;
          const inOrder = orderStart === null || date >= orderStart;
          let entry = before?.[key];
          if (typed) {
            entry = { shift: sequence[index] ?? "" };
          } else if (inOrder) {
            entry = planned[key];
          }
          return (
            <DayCell
              active={index === cursor}
              date={date}
              dimmed={!inOrder}
              editing
              entry={entry}
              faint={inOrder && !typed}
              key={key}
              onPress={() => {
                press(date);
              }}
              outside={date.getMonth() !== month.getMonth()}
            />
          );
        })}
      </section>
      <div className={repeatCalendar.keys}>
        <PatternKeys
          onPage={setPage}
          onPick={pick}
          page={page}
          patternKeys={patternKeys}
          progress={progress}
        />
      </div>
      <div className={repeatCalendar.actions}>
        <span>
          {pages > 1 && (
            <PageDots
              count={pages}
              current={Math.min(page, pages - 1)}
              label="シフトのページ"
              onPick={setPage}
              progress={progress}
            />
          )}
        </span>
        <button
          className={shiftInput.action}
          disabled={sequence.length === 0}
          onClick={() => {
            onChange({
              anchor,
              sequence:
                chosen === undefined
                  ? sequence.slice(0, -1)
                  : sequence.filter((_, index) => index !== chosen),
            });
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
          下のシフトを押すと、選んだ日と置き換わります。
        </p>
      )}
    </div>
  );
}

// An order's days in a card or a summary: each says its place, or, for an
// order that starts on a Sunday, its weekday.
export function SequenceTiles({
  sequence,
  weekly = false,
}: {
  sequence: readonly Shift[];
  weekly?: boolean;
}) {
  const book = usePatterns();
  return (
    <ol
      aria-label={sequence
        .map((shift) => book[shift]?.name ?? "削除したパターン")
        .join("、")}
      className={sequenceTiles.grid}
    >
      {sequence.map((shift, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- the same shift repeats, so its position is its identity.
        <li aria-hidden="true" className={sequenceTiles.day} key={index}>
          <small
            className={sequenceTiles.number({
              tone: weekly ? weeklyTone(index) : "plain",
            })}
          >
            {weekly ? weekdayNameOf(index % 7) : index + 1}
          </small>
          <ShiftMark shift={shift} size={16} />
          {book[shift]?.name ?? "削除"}
        </li>
      ))}
    </ol>
  );
}

function weeklyTone(index: number) {
  if (index % 7 === 0) {
    return "holiday";
  }
  return index % 7 === 6 ? "saturday" : "plain";
}
