import { css, cva, cx } from "styled-system/css";

import type { WidgetDay, WidgetEntry } from "../lib/design-widgets";
import { ShiftMark } from "./shift-mark";

// The widgets themselves: views of one WidgetEntry, as the native apps'
// SwiftUI widget views and Glance composables will be. They hold no state
// and read no store; taps open the app. The system gives each its margins
// (16pt on the home screen, none on the lock screen), so the views add
// none of their own, and the frame they are shown in (design-widget-frame)
// stands in for the rest.

const MONTH_NUMBER = 1;

function monthDay(date: Date) {
  return `${date.getMonth() + MONTH_NUMBER}月${date.getDate()}日`;
}

// A day's mark, or a quiet dash when nothing is entered.
function DayMark({ day, size }: { day: WidgetDay; size: number }) {
  if (!day.shift) {
    return (
      <span
        aria-hidden="true"
        className={dayMark}
        style={{ height: size, width: size }}
      >
        –
      </span>
    );
  }
  return (
    <ShiftMark
      early={day.early}
      late={day.late}
      shift={day.shift}
      size={size}
    />
  );
}
const dayMark = css({
  alignItems: "center",
  color: "text.quaternary",
  display: "inline-flex",
  justifyContent: "center",
});

const toneText = cva({
  variants: {
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: { color: "text.secondary" },
      saturday: { color: "calendar.saturday" },
    },
  },
});

const NOTHING = "予定なし";

// ── Home screen ─────────────────────────────────────────────────────────

const today = {
  date: css({ color: "text.secondary", textStyle: "footnote" }),
  name: css({ textStyle: "headline" }),
  root: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
  }),
  text: css({ display: "flex", flexDirection: "column", gap: "2px" }),
  time: css({
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
    textStyle: "footnote",
  }),
};

// Today's shift in the small square: the date, the mark, its name and
// time.
export function TodayWidget({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={today.root}>
      <span className={today.date}>
        {monthDay(day.date)}({day.weekday})
      </span>
      <DayMark day={day} size={44} />
      <span className={today.text}>
        <strong className={today.name}>{day.name ?? NOTHING}</strong>
        {day.time && <span className={today.time}>{day.time}</span>}
      </span>
    </div>
  );
}

const week = {
  column: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  }),
  date: css({ fontVariantNumeric: "tabular-nums", textStyle: "footnote" }),
  days: css({
    alignContent: "center",
    display: "grid",
    flex: 1,
    gridTemplateColumns: "repeat(6, 1fr)",
    listStyle: "none",
    margin: 0,
    padding: 0,
  }),
  root: css({ display: "flex", gap: "16px", height: "100%" }),
  rule: css({ bg: "separator", flexShrink: 0, width: "1px" }),
  today: css({ flexShrink: 0, width: "112px" }),
  weekday: css({ textStyle: "caption2" }),
};

// Today as in the small one, and the six days after it beside.
export function WeekWidget({ entry }: { entry: WidgetEntry }) {
  return (
    <div className={week.root}>
      <div className={week.today}>
        <TodayWidget entry={entry} />
      </div>
      <span aria-hidden="true" className={week.rule} />
      <ol className={week.days}>
        {entry.upcoming.slice(1).map((day) => (
          <li className={week.column} key={day.date.getTime()}>
            <span className={week.weekday}>
              <span className={toneText({ tone: day.tone })}>
                {day.weekday}
              </span>
            </span>
            <span className={week.date}>{day.date.getDate()}</span>
            <DayMark day={day} size={24} />
          </li>
        ))}
      </ol>
    </div>
  );
}

const month = {
  // A day with nothing entered stays empty, keeping the rows even.
  blank: css({ height: "20px" }),
  cell: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  }),
  date: cva({
    base: { fontVariantNumeric: "tabular-nums", textStyle: "caption2" },
    variants: {
      today: {
        false: {},
        true: { color: "accent.default", fontWeight: 800 },
      },
    },
  }),
  grid: css({
    display: "grid",
    flex: 1,
    gridAutoRows: "1fr",
    gridTemplateColumns: "repeat(7, 1fr)",
    listStyle: "none",
    margin: 0,
    padding: 0,
    rowGap: "4px",
  }),
  header: css({
    alignItems: "baseline",
    display: "flex",
    justifyContent: "space-between",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
  }),
  summary: css({ color: "text.secondary", textStyle: "footnote" }),
  title: css({ fontWeight: 700, textStyle: "title3" }),
  weekdays: css({
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    textAlign: "center",
    textStyle: "caption2",
  }),
};

// The month, with today's shift over it.
export function MonthWidget({ entry }: { entry: WidgetEntry }) {
  const { first, days, weekdays } = entry.month;
  const todayTime = entry.today.date.getTime();
  return (
    <div className={month.root}>
      <div className={month.header}>
        <span className={month.title}>{first.getMonth() + MONTH_NUMBER}月</span>
        <span className={month.summary}>
          今日 {entry.today.name ?? NOTHING}
          {entry.today.time && ` ${entry.today.time}`}
        </span>
      </div>
      <div aria-hidden="true" className={month.weekdays}>
        {weekdays.map((day) => (
          <span className={toneText({ tone: day.tone })} key={day.label}>
            {day.label}
          </span>
        ))}
      </div>
      <ol className={month.grid}>
        {days.map((day) => (
          <li className={month.cell} key={day.date.getTime()}>
            {day.inMonth && (
              <>
                <span
                  className={month.date({
                    today: day.date.getTime() === todayTime,
                  })}
                >
                  {day.date.getDate()}
                </span>
                {day.shift ? (
                  <DayMark day={day} size={20} />
                ) : (
                  <span className={month.blank} />
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Lock screen ─────────────────────────────────────────────────────────

const circular = {
  name: css({ fontWeight: 600, textStyle: "caption2" }),
  root: css({
    alignItems: "center",
    // The lock screen's own round ground: AccessoryWidgetBackground.
    bg: "rgb(255 255 255 / 0.16)",
    borderRadius: "999px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    height: "100%",
    justifyContent: "center",
  }),
};

// Today's mark and name in the round one.
export function TodayCircular({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={circular.root}>
      <DayMark day={day} size={28} />
      <span className={circular.name}>{day.name ?? "なし"}</span>
    </div>
  );
}

const rectangular = {
  line: css({
    alignItems: "center",
    display: "flex",
    gap: "4px",
    overflow: "hidden",
    whiteSpace: "nowrap",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "center",
    textStyle: "subheadline",
  }),
  secondary: css({ color: "text.secondary" }),
  title: css({ fontWeight: 700 }),
};

// Today with its time, and tomorrow under it.
export function UpcomingRectangular({ entry }: { entry: WidgetEntry }) {
  const [day, next] = entry.upcoming;
  if (!day) {
    return null;
  }
  return (
    <div className={rectangular.root}>
      <span className={rectangular.line}>
        <DayMark day={day} size={16} />
        <span className={rectangular.title}>{day.name ?? NOTHING}</span>
      </span>
      {day.time && <span className={rectangular.secondary}>{day.time}</span>}
      {next && (
        <span className={cx(rectangular.line, rectangular.secondary)}>
          明日 {next.name ?? NOTHING}
        </span>
      )}
    </div>
  );
}

const inline = css({
  alignItems: "center",
  display: "flex",
  gap: "4px",
  height: "100%",
  overflow: "hidden",
  textStyle: "subheadline",
  whiteSpace: "nowrap",
});

// One line over the clock: today's shift and time.
export function TodayInline({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={inline}>
      <DayMark day={day} size={14} />
      {day.name ?? NOTHING}
      {day.time && ` ${day.time}`}
    </div>
  );
}
