import { css, cva, cx } from "@pochical/styled-system/css";
import { useContext, useLayoutEffect, useRef, useState } from "react";

import { presetPatterns } from "../lib/design-patterns";
import type {
  WidgetDay,
  WidgetEntry,
  WidgetMonth,
} from "../lib/design-widgets";
import { dayCell, dayParts, todayMark } from "./design-day-cell";
import { englishMonthOf } from "./design-month-name";
import { useWeek } from "./design-week";
import {
  firstRunOr,
  DayMark,
  MONTH_NUMBER,
  MarkName,
  SpokenDay,
  WidgetRenderingModeContext,
  WidgetSizeContext,
  list,
  toneText,
  useOffLook,
  useShiftNames,
} from "./design-widgets";
import { useDisplayColor } from "./shift-mark";

// カレンダー: this week and the next, the month, and in the extra large
// sizes this month and the next.

const TWO_WEEKS_ROOMY = 150;

const twoWeeks = {
  // Days already gone this week stay, faint, so the weeks keep their
  // shape.
  day: cva({
    base: { display: "grid" },
    variants: { past: { false: {}, true: { opacity: 0.4 } } },
  }),
  // The two weeks fill the widget's height, as the month's weeks do, so
  // names under the marks change only the marks, not the layout.
  grid: cva({
    base: {
      columnGap: "2px",
      display: "grid",
      flex: 1,
      gridAutoRows: "1fr",
      gridTemplateColumns: "repeat(7, 1fr)",
      minHeight: 0,
    },
    variants: {
      roomy: { false: { rowGap: "4px" }, true: { rowGap: "8px" } },
    },
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    height: "100%",
  }),
  weekdays: css({
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    textAlign: "center",
    textStyle: "caption2",
  }),
};

// This week and the next, seven across from the week start as the
// calendar lays them. Today is its accent date among them, as in the
// calendar; its time is for the other kinds.
function TwoWeeksMediumView({ entry }: { entry: WidgetEntry }) {
  const { weekdayLetter } = useWeek();
  const roomy = useContext(WidgetSizeContext).height >= TWO_WEEKS_ROOMY;
  const named = useShiftNames();
  // A name under each mark takes the room of a smaller mark.
  // Near the month's marks, so the two calendars read as one family.
  let markSize = roomy ? 26 : 22;
  if (named) {
    markSize = roomy ? 22 : 18;
  }
  const todayTime = entry.today.date.getTime();
  return (
    <div className={twoWeeks.root}>
      <div aria-hidden="true" className={twoWeeks.weekdays}>
        {entry.month.weekdays.map((weekday) => (
          <span
            className={toneText({ tone: weekday.tone })}
            key={weekday.label}
          >
            {weekdayLetter(weekday.day)}
          </span>
        ))}
      </div>
      <ol className={`${list} ${twoWeeks.grid({ roomy })}`}>
        {entry.twoWeeks.map((shown) => (
          <TwoWeeksDay
            day={shown}
            key={shown.date.getTime()}
            markSize={markSize}
            named={named}
            todayTime={todayTime}
          />
        ))}
      </ol>
    </div>
  );
}

function TwoWeeksDay({
  day,
  todayTime,
  markSize,
  named,
}: {
  day: WidgetDay;
  todayTime: number;
  markSize: number;
  named: boolean;
}) {
  const time = day.date.getTime();
  // Days already gone this week stay, faint, so the weeks keep their
  // shape.
  return (
    <li className={twoWeeks.day({ past: time < todayTime })}>
      <GridDay
        day={day}
        inMonth
        markSize={markSize}
        named={named}
        inWeek
        todayTime={todayTime}
      />
    </li>
  );
}

// A day in a grid of days, drawn with the calendar's own parts (its day
// tile, date and today frame), so the two weeks and the month look as
// the app's month does: the date at the top, semibold, red only for a
// holiday; the mark in the room under it; a day off on its tile; days of
// the months beside faded.
function GridDay({
  day,
  todayTime,
  markSize,
  named,
  inMonth,
  inWeek = false,
}: {
  day: WidgetDay;
  todayTime: number;
  markSize: number;
  named: boolean;
  inMonth: boolean;
  inWeek?: boolean;
}) {
  const look = useOffLook(day, inWeek);
  const flat = useContext(WidgetRenderingModeContext) !== "fullColor";
  const { tint } = useDisplayColor(day.color ?? presetPatterns.off.color);
  const tile = look.tile && inMonth;
  const isToday = day.date.getTime() === todayTime;
  const marked = day.shift !== undefined && look.mark !== "none";
  const [markRoom, room] = useRoomHeight();
  return (
    <div
      className={cx(
        dayCell({ off: tile && !flat, outside: !inMonth, today: isToday }),
        tile && flat && flatTile
      )}
      data-off={tile && !flat ? "" : undefined}
      style={{
        "--off-tint": tile ? tint : undefined,
        height: "100%",
      }}
    >
      <SpokenDay day={day} />
      <span
        aria-hidden="true"
        className={cx(
          dayParts.date,
          !inMonth && dayParts.dateOutside,
          day.holiday && !isToday && dayParts.holiday
        )}
      >
        <span className={cx(isToday && todayMark, day.noted && dayParts.noted)}>
          {day.date.getDate()}
        </span>
      </span>
      <span aria-hidden="true" className={gridMark} ref={markRoom}>
        {marked && (
          <DayMark
            day={day}
            faint={look.mark === "faint"}
            size={Math.min(markSize, room ?? markSize)}
          />
        )}
      </span>
      {named && marked && <MarkName day={day} />}
    </div>
  );
}

// How tall the room under a day's date is, measured, so its mark is drawn
// at its size where the day has the room and as large as the room where
// its row is shorter (a six-week month in the upright extra large), never
// running over the next week, as GridDay on iOS fits its mark.
function useRoomHeight() {
  const ref = useRef<HTMLSpanElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    const measure = () => {
      setHeight(element.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, height] as const;
}

// The mark in the room under the date, in its middle.
const gridMark = css({
  display: "grid",
  flex: 1,
  minHeight: 0,
  placeItems: "center",
});

// A day off's tile when the system draws in one color: faint, or it would
// be a solid block over its number.
const flatTile = css({ bg: "rgb(255 255 255 / 0.24)" });

// ── カレンダー ───────────────────────────────────────────────────────────

const month = {
  grid: cva({
    base: {
      columnGap: "2px",
      display: "grid",
      flex: 1,
      gridAutoRows: "1fr",
      gridTemplateColumns: "repeat(7, 1fr)",
      // As tall as the widget leaves it, the weeks sharing that.
      minHeight: 0,
    },
    variants: { named: { false: { rowGap: "4px" }, true: { rowGap: "2px" } } },
  }),
  header: css({
    alignItems: "baseline",
    display: "flex",
    justifyContent: "space-between",
  }),
  // The upright extra large's months, one over the other, as tall alike
  // until their headings are measured.
  stack: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
  }),
  // Where a month's weeks are measured from.
  stacked: css({ flex: "1 1 0", minHeight: 0, position: "relative" }),
  pair: css({
    display: "grid",
    gap: "24px",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "minmax(0, 1fr)",
    height: "100%",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
    minWidth: 0,
  }),
  summary: css({
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
    textStyle: "footnote",
  }),
  title: css({ fontWeight: 700, textStyle: "title3" }),
  weekdays: css({
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    textAlign: "center",
    textStyle: "caption2",
  }),
};

const WEEK = 7;

// Where the month has room, as on Android's 4×4, its marks grow.
const MONTH_ROOMY = 360;

// The month with every day's mark, and today's time over it.
function CalendarLargeView({ entry }: { entry: WidgetEntry }) {
  const roomy = useContext(WidgetSizeContext).height >= MONTH_ROOMY;
  return (
    <MonthView
      entry={entry}
      month={entry.month}
      roomy={roomy}
      rows={entry.month.days.length / WEEK}
    />
  );
}

// This month and the next side by side, each with the large's room: the
// iPad's extra large is two larges wide and as tall, so the calendar shows
// more of what is coming, as Apple's Calendar shows more days there, rather
// than one month stretched. The extra large is iOS's alone, whose marks keep
// the large's size.
function CalendarExtraLargeView({ entry }: { entry: WidgetEntry }) {
  // Their weeks level across, though one month has a week more.
  const rows =
    Math.max(entry.month.days.length, entry.nextMonth.days.length) / WEEK;
  return (
    <div className={month.pair}>
      <MonthView entry={entry} month={entry.month} roomy={false} rows={rows} />
      <MonthView
        entry={entry}
        month={entry.nextMonth}
        roomy={false}
        rows={rows}
      />
    </div>
  );
}

// This month over the next, in the upright extra large (iOS 27), a large
// wide and less than two tall: the room under their headings goes to their
// weeks, so a week is as tall in both, a month of six weeks taking more of
// it than one of five, and each day's mark is as large as that leaves it
// (GridDay), as iOS's MonthsByWeeks lays them.
function CalendarExtraLargePortraitView({ entry }: { entry: WidgetEntry }) {
  const { height } = useContext(WidgetSizeContext);
  const months = [entry.month, entry.nextMonth];
  const weeks = months.map((shown) => shown.days.length / WEEK);
  const first = useRef<HTMLDivElement>(null);
  // A month's heading and weekdays, measured: what each month takes before
  // its weeks.
  const [heading, setHeading] = useState<number>();
  useLayoutEffect(() => {
    const days = first.current?.querySelector("ol");
    if (!days) {
      return undefined;
    }
    const measure = () => {
      setHeading(days.offsetTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(days);
    return () => {
      observer.disconnect();
    };
  }, []);
  const weekHeight =
    heading === undefined
      ? undefined
      : (height - UPRIGHT_GAP - heading * months.length) /
        weeks.reduce((sum, count) => sum + count, 0);
  return (
    <div className={month.stack} style={{ gap: UPRIGHT_GAP }}>
      {months.map((shown, index) => (
        <div
          className={month.stacked}
          key={shown.first.getTime()}
          ref={index === 0 ? first : undefined}
          style={
            heading === undefined || weekHeight === undefined
              ? undefined
              : {
                  flex: "none",
                  height: heading + weekHeight * (weeks[index] ?? 0),
                }
          }
        >
          <MonthView
            entry={entry}
            month={shown}
            roomy={false}
            rows={weeks[index] ?? 0}
          />
        </div>
      ))}
    </div>
  );
}

// The room between the upright extra large's months.
const UPRIGHT_GAP = 16;

// A month with every day's mark, and today's time over today's month.
function MonthView({
  entry,
  month: shown,
  roomy,
  rows,
}: {
  entry: WidgetEntry;
  month: WidgetMonth;
  roomy: boolean;
  // How many weeks' rows to lay out: more than the month has leaves the
  // rest empty under it.
  rows: number;
}) {
  const { english, weekdayLetter } = useWeek();
  const named = useShiftNames();
  // A name under each mark takes the room of a smaller mark.
  let markSize = roomy ? 24 : 20;
  if (named) {
    markSize = roomy ? 20 : 16;
  }
  const { first, days, weekdays } = shown;
  const todayTime = entry.today.date.getTime();
  const isTodays = first.getMonth() === entry.today.date.getMonth();
  return (
    <div className={month.root}>
      <div className={month.header}>
        <span className={month.title}>
          {english
            ? englishMonthOf(first)
            : `${first.getMonth() + MONTH_NUMBER}月`}
        </span>
        {isTodays && entry.today.change && (
          <span className={month.summary}>今日 {entry.today.change}</span>
        )}
      </div>
      <div aria-hidden="true" className={month.weekdays}>
        {weekdays.map((day) => (
          <span className={toneText({ tone: day.tone })} key={day.label}>
            {weekdayLetter(day.day)}
          </span>
        ))}
      </div>
      <ol
        className={`${list} ${month.grid({ named })}`}
        style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {days.map((day) => (
          <MonthDay
            day={day}
            key={day.date.getTime()}
            markSize={markSize}
            named={named}
            todayTime={todayTime}
          />
        ))}
      </ol>
    </div>
  );
}

function MonthDay({
  day,
  todayTime,
  markSize,
  named,
}: {
  day: WidgetDay & { inMonth: boolean };
  todayTime: number;
  markSize: number;
  named: boolean;
}) {
  return (
    <li>
      <GridDay
        day={day}
        inMonth={day.inMonth}
        markSize={markSize}
        named={named}
        todayTime={todayTime}
      />
    </li>
  );
}

export const TwoWeeksMedium = firstRunOr(TwoWeeksMediumView);

export const CalendarLarge = firstRunOr(CalendarLargeView);

export const CalendarExtraLarge = firstRunOr(CalendarExtraLargeView);

export const CalendarExtraLargePortrait = firstRunOr(
  CalendarExtraLargePortraitView
);
