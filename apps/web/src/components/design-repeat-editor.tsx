import { ArrowRight, Trash2 } from "lucide-react";
import { useMotionValue } from "motion/react";
import { useState } from "react";
import type { ReactNode } from "react";
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
import { DayCell } from "./design-day-cell";
import {
  dayGrid,
  dayGridHeight,
  MONTH_WEEKS,
  WeekdayRow,
} from "./design-day-grid";
import { MonthRow } from "./design-group-shifts-list";
import { monthKey } from "./design-group-shifts-parts";
import { Pager } from "./design-pager";
import { monthIndex } from "./design-rolling";
import { PatternKeys, patternPagesOf, shiftInput } from "./design-shift-input";
import { useWeek, weekdayNameOf } from "./design-week";
import { ShiftMark } from "./shift-mark";

// A repeating order typed on a month, filling the screen as 1人ずつ's
// month does: the month's row, the days swiped a month at a time with
// room for six weeks, and ポチポチ入力's keys at the foot, ⌫ and the
// pages' dots under them. No 今月: the month that matters is the order's,
// which typing keeps in sight, and the month's name picks any other.
const repeatCalendar = {
  foot: css({ marginTop: "auto", paddingTop: "2px" }),
  monthRow: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    justifyContent: "space-between",
  }),
  root: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "4px",
    minHeight: 0,
  }),
  // The page's title over its order's first day and length.
  subtitle: css({
    color: "text.tertiary",
    display: "block",
    fontWeight: 400,
    textStyle: "caption2",
  }),
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

// A page's title with its order's first day and length under it, as the
// native pages' navigation subtitle.
export function OrderTitle({
  title,
  anchor,
  sequence,
}: {
  title: string;
  anchor: Date;
  sequence: readonly Shift[];
}) {
  return (
    <>
      {title}
      <small className={repeatCalendar.subtitle}>
        {formatDay(anchor)}から
        {sequence.length > 0 && `・${sequence.length}日ごとに繰り返し`}
      </small>
    </>
  );
}

// The days of a month as the order shows them: those typed solid, the
// rest of the order faint, and those before it as they show now, faded.
function OrderMonth({
  month,
  sequence,
  anchor,
  orderStart,
  before,
  holidayShift,
  cursor,
  onPress,
}: {
  month: Date;
  sequence: Shift[];
  anchor: Date;
  orderStart: Date | null;
  before?: Schedule;
  holidayShift?: Shift;
  cursor: number;
  onPress: (date: Date) => void;
}) {
  const weekTools = useWeek();
  const dates = weekTools.monthDates(month);
  const first = dates[0] ?? month;
  const last = dates.at(-1) ?? month;
  const coversFrom =
    orderStart === null || orderStart < first ? first : orderStart;
  const planned =
    sequence.length > 0 && coversFrom <= last
      ? repeatSchedule(sequence, anchor, coversFrom, last, holidayShift)
      : {};
  return (
    <section
      aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月の並び`}
      className={dayGrid}
      style={{ alignContent: "start", minHeight: dayGridHeight(MONTH_WEEKS) }}
    >
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
              onPress(date);
            }}
            outside={date.getMonth() !== month.getMonth()}
          />
        );
      })}
    </section>
  );
}

// A repeating order typed on the calendar (spec/shift-patterns.md,
// Typing an order): the day pressed is its 1st, and the order comes round
// faintly after the days typed, as the calendar will show it. It is typed
// as ポチポチ入力 enters days: a key fills the framed day and the frame
// moves on, 翌日へ moves it without typing, and 消す takes the framed day
// out, those after it closing up. A day typed, pressed, takes the frame;
// any other moves the order to start there, keeping what was typed.
// `accessory` goes at the end of the month's row; what saves it is the
// page's 完了.
export function RepeatCalendar({
  sequence,
  anchor,
  from,
  before,
  holidayShift,
  patternKeys,
  onChange,
  accessory,
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
  accessory?: ReactNode;
}) {
  const weekTools = useWeek();
  const [month, setMonth] = useState(() => monthOf(anchor));
  // How far the months are dragged, which the month's row follows, and
  // the month a swipe last landed on, whose name the drag brought in.
  const pageDrag = useMotionValue(0);
  const [swipedTo, setSwipedTo] = useState<number>();
  // The framed day, among those typed; none frames the day after them.
  const [framed, setFramed] = useState<number>();
  const [page, setPage] = useState(0);
  const progress = useMotionValue(0);
  const pages = patternPagesOf(patternKeys).length;
  const orderStart = from === undefined ? anchor : from;
  const cursor = framed ?? sequence.length;
  const goTo = (target: Date) => {
    setSwipedTo(undefined);
    setMonth(monthOf(target));
  };

  // The frame to the day after `at`, at most the one after those typed,
  // its month turned to when it is out of sight.
  const moveOn = (at: number, length: number) => {
    const next = at + 1 < length ? at + 1 : undefined;
    setFramed(next);
    const day = addDays(anchor, next ?? length);
    const shown = weekTools.monthDates(month);
    if (!shown.some((date) => dateKey(date) === dateKey(day))) {
      goTo(day);
    }
  };

  // A key: on the framed day, the frame moving on, as ポチポチ入力 does.
  const pick = (key: Shift) => {
    const at = framed ?? sequence.length;
    const next =
      at < sequence.length
        ? sequence.map((shift, index) => (index === at ? key : shift))
        : [...sequence, key];
    onChange({ anchor, sequence: next });
    moveOn(at, next.length);
  };

  // A day typed takes the frame, as the next one does; any other moves
  // the order there.
  const press = (date: Date) => {
    const index = daysFrom(anchor, date);
    if (index >= 0 && index < sequence.length) {
      setFramed(index);
      return;
    }
    setFramed(undefined);
    if (index !== sequence.length) {
      onChange({ anchor: date, sequence });
    }
  };

  return (
    <div className={repeatCalendar.root}>
      <div className={repeatCalendar.monthRow}>
        <MonthRow
          month={month}
          onPick={goTo}
          progress={pageDrag}
          swiped={swipedTo === monthIndex(month)}
          unit="月"
        />
        {accessory}
      </div>
      <div>
        <WeekdayRow compact />
        <Pager
          onStep={(direction) => {
            const target = monthAfter(month, direction);
            setMonth(target);
            setSwipedTo(monthIndex(target));
          }}
          page={monthKey(month)}
          progress={pageDrag}
          renderPage={(offset) => (
            <OrderMonth
              anchor={anchor}
              before={before}
              cursor={offset === 0 ? cursor : -1}
              holidayShift={holidayShift}
              month={monthAfter(month, offset)}
              onPress={press}
              orderStart={orderStart}
              sequence={sequence}
            />
          )}
        />
      </div>
      {/* ポチポチ入力's tray. No date over the keys: the framed day shows
      where typing goes, and the room is the month's. */}
      <div className={repeatCalendar.foot}>
        <PatternKeys
          onPage={setPage}
          onPick={pick}
          page={page}
          patternKeys={patternKeys}
          progress={progress}
        />
        <div className={shiftInput.actions}>
          <button
            className={shiftInput.action}
            disabled={framed === undefined}
            onClick={() => {
              if (framed === undefined) {
                return;
              }
              const rest = sequence.filter((_, index) => index !== framed);
              onChange({ anchor, sequence: rest });
              setFramed(framed < rest.length ? framed : undefined);
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" size={14} />
            消す
          </button>
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
            disabled={framed === undefined}
            onClick={() => {
              moveOn(framed ?? sequence.length, sequence.length);
            }}
            type="button"
          >
            翌日へ
            <ArrowRight aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
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
