import { Users } from "lucide-react";
import { createContext, useContext } from "react";
import { css, cva } from "styled-system/css";

import type { WidgetDay, WidgetEntry } from "../lib/design-widgets";
import { srOnly } from "./design-ui";
import { ShiftMark } from "./shift-mark";

// The widgets themselves: views of one WidgetEntry, as the native apps'
// SwiftUI widget views and Glance composables will be. They hold no state
// and read no store; taps open the app. The system gives each its margins
// (16pt on the home screen, none on the lock screen), so the views add
// none of their own, and the frame they are shown in (design-widget-frame)
// stands in for the rest.
//
// Three kinds, each in the sizes it suits: これから (today and the days
// after), カレンダー (the month) and 今日の詳細 (today's time, memo and
// 一緒に働く人). The mark says which shift it is, so the words next to it
// are the time; a shift's name shows only where it has no time (休み,
// 明け), and screen readers always hear it.

// How the system is drawing the widget, as SwiftUI's widgetRenderingMode
// tells a view: in full color, or flattened to one color by opacity
// (accented on the home screen's 色合い and クリア, vibrant on the lock
// screen). Filled shapes then read as solid blocks, so views draw them
// faint instead.
export type WidgetRenderingMode = "fullColor" | "accented" | "vibrant";
export const WidgetRenderingModeContext =
  createContext<WidgetRenderingMode>("fullColor");

const MONTH_NUMBER = 1;
const NOTHING = "予定なし";

function monthDay(date: Date) {
  return `${date.getMonth() + MONTH_NUMBER}月${date.getDate()}日`;
}

// What a day's words say: its time, or its name when it has none.
function headline(day: WidgetDay) {
  return day.time ?? day.name ?? NOTHING;
}

// A day's words, with its name for screen readers when the words are its
// time.
function Headline({ day, className }: { day: WidgetDay; className: string }) {
  const spokenName = day.time === undefined ? undefined : day.name;
  return (
    <strong className={className}>
      {spokenName && <span className={srOnly}>{spokenName} </span>}
      {headline(day)}
    </strong>
  );
}

// Today, 明日, then the weekday and date.
function relativeDay(day: WidgetDay, index: number) {
  if (index === 0) {
    return "今日";
  }
  return index === 1 ? "明日" : `${day.date.getDate()}日(${day.weekday})`;
}

// A day as read aloud, for the places whose marks are pictures only.
function SpokenDay({ day }: { day: WidgetDay }) {
  const time = day.time ? ` ${day.time}` : "";
  return (
    <span className={srOnly}>
      {monthDay(day.date)}({day.weekday}) {day.name ?? NOTHING}
      {time}
    </span>
  );
}

const dayMark = css({
  alignItems: "center",
  color: "text.quaternary",
  display: "inline-flex",
  flexShrink: 0,
  justifyContent: "center",
});

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

const toneText = cva({
  variants: {
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: { color: "text.secondary" },
      saturday: { color: "calendar.saturday" },
    },
  },
});

// A date's number in Sunday's red or Saturday's blue, as the calendar's;
// today's keeps the accent instead.
const dateToneText = cva({
  variants: {
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: {},
      saturday: { color: "calendar.saturday" },
    },
  },
});
function dateTone(day: WidgetDay, todayTime: number) {
  return day.date.getTime() === todayTime
    ? ""
    : dateToneText({ tone: day.tone });
}

const list = css({ listStyle: "none", margin: 0, padding: 0 });

// ── これから ─────────────────────────────────────────────────────────────

const today = {
  date: css({ color: "text.secondary", textStyle: "footnote" }),
  headline: css({
    fontVariantNumeric: "tabular-nums",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "headline",
    whiteSpace: "nowrap",
  }),
  root: css({
    // Each piece as wide as itself, so a mark's 早出/残業 corners stay on
    // the mark.
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
    maxWidth: "100%",
  }),
};

// Today large: the date, its mark and its time.
function TodayBlock({ day }: { day: WidgetDay }) {
  return (
    <div className={today.root}>
      <span className={today.date}>
        {monthDay(day.date)}({day.weekday})
      </span>
      <DayMark day={day} size={44} />
      <Headline className={today.headline} day={day} />
    </div>
  );
}

const upcoming = {
  day: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  }),
  next: css({
    borderTop: "1px solid token(colors.separator)",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    paddingTop: "4px",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    height: "100%",
  }),
  // The mark over its time: side by side, a time with 翌 runs out of
  // the square.
  today: css({
    alignItems: "flex-start",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
    justifyContent: "center",
    minWidth: 0,
  }),
  weekday: css({ textStyle: "caption2" }),
};

// A day in a row of days: its weekday over its mark.
function UpcomingDay({ day, size }: { day: WidgetDay; size: number }) {
  return (
    <li className={upcoming.day}>
      <SpokenDay day={day} />
      <span
        aria-hidden="true"
        className={`${upcoming.weekday} ${toneText({ tone: day.tone })}`}
      >
        {day.weekday}
      </span>
      <DayMark day={day} size={size} />
    </li>
  );
}

// Today, and the next three days under it.
export function UpcomingSmall({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={upcoming.root}>
      <span className={today.date}>
        {monthDay(day.date)}({day.weekday})
      </span>
      <div className={upcoming.today}>
        <DayMark day={day} size={32} />
        <Headline className={today.headline} day={day} />
      </div>
      <ol className={`${list} ${upcoming.next}`}>
        {entry.upcoming.slice(1, 4).map((next) => (
          <UpcomingDay day={next} key={next.date.getTime()} size={18} />
        ))}
      </ol>
    </div>
  );
}

const week = {
  rule: css({ bg: "separator", flexShrink: 0, width: "1px" }),
  today: css({ flexShrink: 0, width: "112px" }),
};

const twoWeeks = {
  date: cva({
    base: { fontVariantNumeric: "tabular-nums", textStyle: "caption2" },
    variants: {
      today: {
        false: {},
        true: { color: "accent.default", fontWeight: 800 },
      },
    },
  }),
  day: cva({
    base: {
      alignItems: "center",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
    },
    // Days already gone this week stay, faint, so the weeks keep their
    // shape.
    variants: { past: { false: {}, true: { opacity: 0.4 } } },
  }),
  grid: css({
    display: "grid",
    flex: 1,
    gridTemplateColumns: "repeat(7, 1fr)",
    rowGap: "4px",
  }),
  header: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    minWidth: 0,
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    height: "100%",
  }),
  time: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
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
export function UpcomingMedium({ entry }: { entry: WidgetEntry }) {
  const todayTime = entry.today.date.getTime();
  return (
    <div className={twoWeeks.root}>
      <div aria-hidden="true" className={twoWeeks.weekdays}>
        {entry.month.weekdays.map((weekday) => (
          <span
            className={toneText({ tone: weekday.tone })}
            key={weekday.label}
          >
            {weekday.label}
          </span>
        ))}
      </div>
      <ol className={`${list} ${twoWeeks.grid}`}>
        {entry.twoWeeks.map((shown) => {
          const time = shown.date.getTime();
          return (
            <li className={twoWeeks.day({ past: time < todayTime })} key={time}>
              <SpokenDay day={shown} />
              <span
                aria-hidden="true"
                className={`${twoWeeks.date({ today: time === todayTime })} ${dateTone(shown, todayTime)}`}
              >
                {shown.date.getDate()}
              </span>
              <DayMark day={shown} size={28} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── カレンダー ───────────────────────────────────────────────────────────

const mini = {
  date: cva({
    base: {
      alignItems: "center",
      borderRadius: "4px",
      display: "flex",
      fontSize: "11px",
      fontVariantNumeric: "tabular-nums",
      justifyContent: "center",
    },
    // The calendar's own day-off tile, the one mark small enough to read
    // here; faint when the system draws in one color, or it would be a
    // solid block over its number.
    compoundVariants: [
      { css: { bg: "calendar.offTint" }, flat: false, off: true },
      { css: { bg: "rgb(255 255 255 / 0.24)" }, flat: true, off: true },
    ],
    variants: {
      flat: { false: {}, true: {} },
      off: { false: {}, true: {} },
      today: {
        false: {},
        true: { color: "accent.default", fontWeight: 800 },
      },
    },
  }),
  grid: css({
    display: "grid",
    flex: 1,
    gap: "2px",
    gridAutoRows: "1fr",
    gridTemplateColumns: "repeat(7, 1fr)",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    height: "100%",
  }),
  title: css({ fontWeight: 700, textStyle: "subheadline" }),
  weekdays: css({
    display: "grid",
    fontSize: "11px",
    gridTemplateColumns: "repeat(7, 1fr)",
    textAlign: "center",
  }),
};

// The month with its days off alone, as tiles: all a small square can
// show of a month and still be read.
function MiniMonth({ entry }: { entry: WidgetEntry }) {
  const flat = useContext(WidgetRenderingModeContext) !== "fullColor";
  const { first, days, weekdays } = entry.month;
  const todayTime = entry.today.date.getTime();
  return (
    <div className={mini.root}>
      <span className={mini.title}>{first.getMonth() + MONTH_NUMBER}月</span>
      <div aria-hidden="true" className={mini.weekdays}>
        {weekdays.map((day) => (
          <span className={toneText({ tone: day.tone })} key={day.label}>
            {day.label}
          </span>
        ))}
      </div>
      <ol className={`${list} ${mini.grid}`}>
        {days.map((day) => (
          <li
            aria-hidden={!day.inMonth}
            className={mini.date({
              flat,
              off: day.inMonth && day.off,
              today: day.date.getTime() === todayTime,
            })}
            key={day.date.getTime()}
          >
            {day.inMonth && (
              <>
                <SpokenDay day={day} />
                <span aria-hidden="true" className={dateTone(day, todayTime)}>
                  {day.date.getDate()}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CalendarSmall({ entry }: { entry: WidgetEntry }) {
  return <MiniMonth entry={entry} />;
}

const agenda = {
  label: css({ color: "text.secondary", textStyle: "footnote" }),
  month: css({ flexShrink: 0, width: "140px" }),
  root: css({ display: "flex", gap: "16px", height: "100%" }),
  row: css({
    alignItems: "center",
    display: "grid",
    gap: "8px",
    gridTemplateColumns: "20px 1fr",
  }),
  rows: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "8px",
    justifyContent: "center",
    minWidth: 0,
  }),
  text: css({ display: "flex", flexDirection: "column", minWidth: 0 }),
  time: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
};

// The month beside today and the next two days, as calendar apps' own
// widgets pair them.
export function CalendarMedium({ entry }: { entry: WidgetEntry }) {
  return (
    <div className={agenda.root}>
      <div className={agenda.month}>
        <MiniMonth entry={entry} />
      </div>
      <ol className={`${list} ${agenda.rows}`}>
        {entry.upcoming.slice(0, 3).map((day, index) => (
          <li className={agenda.row} key={day.date.getTime()}>
            <DayMark day={day} size={20} />
            <span className={agenda.text}>
              <span className={agenda.label}>{relativeDay(day, index)}</span>
              <Headline className={agenda.time} day={day} />
            </span>
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

// The month with every day's mark, and today's time over it.
export function CalendarLarge({ entry }: { entry: WidgetEntry }) {
  const { first, days, weekdays } = entry.month;
  const todayTime = entry.today.date.getTime();
  return (
    <div className={month.root}>
      <div className={month.header}>
        <span className={month.title}>{first.getMonth() + MONTH_NUMBER}月</span>
        <span className={month.summary}>今日 {headline(entry.today)}</span>
      </div>
      <div aria-hidden="true" className={month.weekdays}>
        {weekdays.map((day) => (
          <span className={toneText({ tone: day.tone })} key={day.label}>
            {day.label}
          </span>
        ))}
      </div>
      <ol className={`${list} ${month.grid}`}>
        {days.map((day) => (
          <li
            aria-hidden={!day.inMonth}
            className={month.cell}
            key={day.date.getTime()}
          >
            {day.inMonth && (
              <>
                <SpokenDay day={day} />
                <span
                  aria-hidden="true"
                  className={`${month.date({
                    today: day.date.getTime() === todayTime,
                  })} ${dateTone(day, todayTime)}`}
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

// ── 今日の詳細 ───────────────────────────────────────────────────────────

const detail = {
  headline: css({
    fontVariantNumeric: "tabular-nums",
    textStyle: "headline",
    whiteSpace: "nowrap",
  }),
  members: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    gap: "4px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "footnote",
    whiteSpace: "nowrap",
  }),
  note: cva({
    base: { margin: 0, textStyle: "footnote" },
    variants: { lines: { 2: { lineClamp: 2 }, 3: { lineClamp: 3 } } },
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    height: "100%",
  }),
  side: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "8px",
    justifyContent: "center",
    minWidth: 0,
  }),
  top: css({
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "space-between",
  }),
  wide: css({ display: "flex", gap: "16px", height: "100%" }),
};

// The memo and 一緒に働く人 of a day, as far as it has them.
function DayExtras({ day, lines }: { day: WidgetDay; lines: 2 | 3 }) {
  return (
    <>
      {day.note && <p className={detail.note({ lines })}>{day.note}</p>}
      {day.members.length > 0 && (
        <span className={detail.members}>
          <Users aria-label="一緒に働く人" size={14} />
          {day.members.join("・")}
        </span>
      )}
    </>
  );
}

// Today's time with its memo and 一緒に働く人.
export function DetailSmall({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={detail.root}>
      <div className={detail.top}>
        <span className={today.date}>
          {monthDay(day.date)}({day.weekday})
        </span>
        <DayMark day={day} size={28} />
      </div>
      <Headline className={detail.headline} day={day} />
      <DayExtras day={day} lines={2} />
    </div>
  );
}

// Today large on the left, its memo and 一緒に働く人 beside.
export function DetailMedium({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={detail.wide}>
      <div className={week.today}>
        <TodayBlock day={day} />
      </div>
      <span aria-hidden="true" className={week.rule} />
      <div className={detail.side}>
        <DayExtras day={day} lines={3} />
      </div>
    </div>
  );
}

// ── Lock screen ─────────────────────────────────────────────────────────

const circular = {
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
  start: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    textStyle: "caption2",
  }),
};

// Today's mark and when it starts, in the round one.
export function TodayCircular({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={circular.root}>
      <DayMark day={day} size={28} />
      <span className={circular.start}>{day.start ?? day.name ?? "なし"}</span>
    </div>
  );
}

const rectangular = {
  label: css({ fontWeight: 700, width: "32px" }),
  line: css({
    alignItems: "center",
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    gap: "4px",
    overflow: "hidden",
    whiteSpace: "nowrap",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    height: "100%",
    justifyContent: "center",
    textStyle: "footnote",
  }),
  time: css({ fontWeight: 400 }),
};

// Today and tomorrow, a line each.
export function UpcomingRectangular({ entry }: { entry: WidgetEntry }) {
  return (
    <ol className={`${list} ${rectangular.root}`}>
      {entry.upcoming.slice(0, 2).map((day, index) => (
        <li className={rectangular.line} key={day.date.getTime()}>
          <span className={rectangular.label}>{relativeDay(day, index)}</span>
          <DayMark day={day} size={16} />
          <Headline className={rectangular.time} day={day} />
        </li>
      ))}
    </ol>
  );
}

const inline = css({
  alignItems: "center",
  display: "flex",
  fontVariantNumeric: "tabular-nums",
  gap: "4px",
  height: "100%",
  overflow: "hidden",
  textStyle: "subheadline",
  whiteSpace: "nowrap",
});

const inlineText = css({ fontWeight: 400 });

// One line over the clock: today's mark and time.
export function TodayInline({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  return (
    <div className={inline}>
      <DayMark day={day} size={14} />
      <Headline className={inlineText} day={day} />
    </div>
  );
}
