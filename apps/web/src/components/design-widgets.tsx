import { widgetRules } from "@pochical/design/widgets";
import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import { css, cva, cx } from "styled-system/css";

import { presetPatterns } from "../lib/design-patterns";
import type { WidgetDay, WidgetEntry, WidgetOff } from "../lib/design-widgets";
import { dayName } from "../lib/text-limits";
import { DARK_DRAWING, LIGHT_DRAWING, useAppIcons } from "./design-app-icon";
import { dayCell, dayParts, todayMark } from "./design-day-cell";
import { PhotoAvatar } from "./design-group-parts";
import { englishMonthOf } from "./design-month-name";
import { ColorSchemeContext } from "./design-theme";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";
import {
  CellNamesContext,
  OffDisplayContext,
  ShiftMark,
  ShiftMarkStyleContext,
  useDisplayColor,
  useOffHighlight,
} from "./shift-mark";

// The widgets themselves: views of one WidgetEntry, as the native apps'
// SwiftUI widget views and Glance composables will be. They hold no state
// and read no store; taps open the app. The system gives each its margins
// (16pt on the home screen, none on the lock screen), so the views add
// none of their own, and the frame they are shown in (design-widget-frame)
// stands in for the rest.
//
// Four kinds, each in the sizes it suits: 今日, 次の休み (how soon the
// next day off comes, alone or with someone picked when editing the
// widget), リスト (today and the days after, a line each) and カレンダー
// (two weeks, the month). The mark says which shift it is, so words beside
// it are only what changed, and screen readers always hear the name.

// How the system is drawing the widget, as SwiftUI's widgetRenderingMode
// tells a view: in full color, or flattened to one color by opacity
// (accented on the home screen's 色合い and クリア, vibrant on the lock
// screen). Filled shapes then read as solid blocks, so views draw them
// faint instead.
export type WidgetRenderingMode = "fullColor" | "accented" | "vibrant";
export const WidgetRenderingModeContext =
  createContext<WidgetRenderingMode>("fullColor");

// The room the widget's content has, in pt (dp on Android), as SwiftUI's
// widget family and Glance's LocalSize tell a view: the same kind is
// taller on Android's launcher than on the iPhone, and a view spends the
// extra room on its own spacing rather than stretching.
export const WidgetSizeContext = createContext({ height: 0, width: 0 });

const MONTH_NUMBER = 1;
const NOTHING = "予定なし";

function monthDay(date: Date) {
  return `${date.getMonth() + MONTH_NUMBER}月${date.getDate()}日`;
}

// Whether the person shows shift names under the marks in the app's
// calendar. The widgets then name the shift as well, for someone who
// tells their marks apart by name.
function useShiftNames() {
  const style = useContext(ShiftMarkStyleContext);
  return useContext(CellNamesContext).names[style];
}

// The words beside a day's mark: nothing on an ordinary day, since the
// mark says which shift and its hours are the same every time, or its
// name when names are shown; the changed hours on a day of 早出 or 残業;
// 予定なし with nothing entered.
function changeWords(day: WidgetDay, named: boolean) {
  if (!day.shift) {
    return NOTHING;
  }
  return day.change ?? (named ? day.name : undefined);
}

// Those words, with the shift's name and hours for screen readers.
function Change({ day, className }: { day: WidgetDay; className: string }) {
  const words = changeWords(day, useShiftNames());
  const time = day.time ? ` ${day.time}` : "";
  return (
    <strong className={className}>
      <span className={srOnly}>
        {day.name ?? NOTHING}
        {time}
      </span>
      {words && <span aria-hidden="true">{words}</span>}
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
  const note = day.note ? " メモあり" : "";
  return (
    <span className={srOnly}>
      {monthDay(day.date)}({day.weekday}) {day.name ?? NOTHING}
      {time}
      {note}
    </span>
  );
}

// How a day off shows where each day has its own mark, as the calendar
// shows it with the person's 休みを塗る and 休みの見せ方: on a tile of its
// pattern's tint, its mark faint, or left empty. The two weeks read as
// the calendar's week, where a day off left empty comes back faint, to
// tell it from a day with nothing entered.
type OffLook = { tile: boolean; mark: "show" | "faint" | "none" };
const shownOff: OffLook = { mark: "show", tile: false };

function useOffLook(day: WidgetDay, week: boolean): OffLook {
  const highlight = useOffHighlight(useContext(ShiftMarkStyleContext));
  const display = useContext(OffDisplayContext);
  if (!day.off) {
    return shownOff;
  }
  const shown = week && display === "blank" ? "faint" : display;
  if (shown === "blank") {
    return { mark: "none", tile: false };
  }
  if (shown === "faint") {
    return { mark: "faint", tile: false };
  }
  return { mark: "show", tile: highlight };
}

const dayMark = css({
  alignItems: "center",
  color: "text.quaternary",
  display: "inline-flex",
  flexShrink: 0,
  justifyContent: "center",
});

// A day's mark, or a quiet dash when nothing is entered.
function DayMark({
  day,
  size,
  faint = false,
}: {
  day: WidgetDay;
  size: number;
  faint?: boolean;
}) {
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
  const mark = (
    <ShiftMark
      early={day.early}
      late={day.late}
      shift={day.shift}
      size={size}
    />
  );
  return faint ? <span className={faintMark}>{mark}</span> : mark;
}

// 休みの見せ方 空白, where a day off comes back faint.
const faintMark = css({ display: "inline-flex", opacity: 0.35 });

// A shift's name under its mark, shortened as the calendar's.
const markName = css({
  color: "text.secondary",
  fontSize: "9px",
  lineHeight: "11px",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

function MarkName({ day }: { day: WidgetDay }) {
  return (
    <span aria-hidden="true" className={markName}>
      {day.name ? dayName(day.name) : ""}
    </span>
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

const list = css({ listStyle: "none", margin: 0, padding: 0 });

const englishMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const englishWeekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ── Words ───────────────────────────────────────────────────────────────

// The widgets' few words. 月と曜日 set to English writes the dates as the
// app's headings do (sep. 24 THU) and the words with them, so a widget
// reads in one language; changed hours and memos stay as entered.
function useWords() {
  const { english, weekdayName } = useWeek();
  // A weekday heading a column of days: 金, or FRI.
  const weekday = (date: Date) => weekdayName(date.getDay()).toUpperCase();
  if (english) {
    // Dates as English writes them, Thu, Sep 24, rather than the month's
    // heading (sep.), which is for the calendar's large title alone.
    const month = (date: Date) => englishMonths[date.getMonth()] ?? "";
    const day = (date: Date) => weekdayName(date.getDay());
    return {
      date: (date: Date) => `${day(date)}, ${month(date)} ${date.getDate()}`,
      heading: (date: Date) => englishWeekdays[date.getDay()] ?? "",
      inDays: (inDays: number) =>
        inDays === 1 ? "Tomorrow" : `in ${inDays} days`,
      line: (date: Date) => `${day(date)} ${date.getDate()}`,
      nextOff: "Next day off",
      nothingYet: "Nothing yet",
      offTogether: "Off together",
      rest: "Day off\ntoday",
      restTogether: "Both off\ntoday",
      today: "Today",
      tomorrow: "Tomorrow",
      unit: "days",
      weekday,
    };
  }
  return {
    date: (date: Date) => `${monthDay(date)}(${weekday(date)})`,
    heading: (date: Date) =>
      `${date.getMonth() + MONTH_NUMBER}月 ${weekday(date)}曜日`,
    inDays: (inDays: number) => (inDays === 1 ? "明日" : `${inDays}日後`),
    line: (date: Date) => `${date.getDate()} ${weekday(date)}`,
    nextOff: "次の休み",
    nothingYet: "まだ入っていません",
    offTogether: "一緒に休める日",
    rest: "今日は\nおやすみ",
    restTogether: "ふたりとも\nおやすみ",
    today: "今日",
    tomorrow: "明日",
    unit: "日後",
    weekday,
  };
}

// ── シンプル ─────────────────────────────────────────────────────────────

// One line, cut with … where it runs out. Written out in each style
// rather than spread from a shared object, which Panda's extraction
// missed, leaving long memos wrapping.
const oneLine = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const simple = {
  // The date large, as a desk calendar shows it.
  big: css({
    fontSize: "44px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1,
  }),
  label: css({ color: "text.secondary", textStyle: "footnote" }),
  markRow: css({
    alignItems: "center",
    display: "flex",
    gap: "4px",
    maxWidth: "100%",
    minWidth: 0,
  }),
  pair: css({ display: "flex", gap: "16px", height: "100%" }),
  root: css({
    alignItems: "flex-start",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
    minWidth: 0,
  }),
  rule: css({ bg: "separator", flexShrink: 0, width: "1px" }),
  words: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
};

// A day plainly: when it is, its date large, and its mark with what
// changed beside it. Nothing more, for someone who wants the day alone.
function SimpleDay({ day, label }: { day: WidgetDay; label?: string }) {
  const words = useWords();
  return (
    <div className={simple.root}>
      <span className={simple.label}>
        {label
          ? `${label} · ${words.weekday(day.date)}`
          : words.heading(day.date)}
      </span>
      <span aria-hidden="true" className={simple.big}>
        {day.date.getDate()}
      </span>
      <span className={simple.markRow}>
        <DayMark day={day} size={32} />
        <Change className={simple.words} day={day} />
      </span>
    </div>
  );
}

// Today alone; on a day off, said as such, with the poodle.
export function SimpleSmall({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  if (day.off && !day.change) {
    return (
      <RestToday
        entry={{ ...entry, offs: { ...entry.offs, with: undefined } }}
      />
    );
  }
  return <SimpleDay day={day} />;
}

// Today and tomorrow, side by side.
export function SimpleMedium({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const [, tomorrow] = entry.upcoming;
  return (
    <div className={simple.pair}>
      <SimpleDay day={entry.today} label={words.today} />
      <span aria-hidden="true" className={simple.rule} />
      {tomorrow && <SimpleDay day={tomorrow} label={words.tomorrow} />}
    </div>
  );
}

// ── これから ─────────────────────────────────────────────────────────────

const upcoming = {
  pair: css({ gap: "12px" }),
  // Today on the left of the medium one.
  today: css({
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    justifyContent: "space-between",
    width: "104px",
  }),
  note: css({
    color: "text.secondary",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "footnote",
    whiteSpace: "nowrap",
  }),
  row: css({
    "&:not(:first-child)": { borderTop: "1px solid token(colors.separator)" },
    alignItems: "center",
    display: "grid",
    flex: 1,
    gap: "4px",
    gridTemplateColumns: "56px 20px 1fr",
    minHeight: 0,
  }),
  rowLabel: css({
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
    textStyle: "footnote",
    whiteSpace: "nowrap",
  }),
  rowWords: css({
    color: "text.secondary",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "footnote",
    whiteSpace: "nowrap",
  }),
  rows: css({ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }),
  small: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
  }),
  todayHead: css({ alignItems: "center", display: "flex", gap: "8px" }),
};

// Today large: its date and mark, what changed, and its memo's first
// line.
function UpcomingToday({ day, note }: { day: WidgetDay; note: boolean }) {
  const words = useWords();
  return (
    <>
      <span className={simple.label}>{words.heading(day.date)}</span>
      <span className={upcoming.todayHead}>
        <span aria-hidden="true" className={simple.big}>
          {day.date.getDate()}
        </span>
        <DayMark day={day} size={32} />
      </span>
      <span className={simple.markRow}>
        <Change className={simple.words} day={day} />
      </span>
      {note && day.note && <span className={upcoming.note}>{day.note}</span>}
    </>
  );
}

// Today large, and the next three days' marks under it.
export function UpcomingSmall({ entry }: { entry: WidgetEntry }) {
  return (
    <div className={upcoming.small}>
      <UpcomingToday day={entry.today} note={false} />
      <NextDays days={entry.upcoming.slice(1, 4)} />
    </div>
  );
}

// Today large on the left; on the right, the days after it a line each,
// each by its date as the rows under it read (25 金), with what changed,
// the memo, or the shift's name when names are shown.
export function UpcomingMedium({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const named = useShiftNames();
  return (
    <div className={cx(simple.pair, upcoming.pair)}>
      <div className={upcoming.today}>
        <UpcomingToday day={entry.today} note />
      </div>
      <span aria-hidden="true" className={simple.rule} />
      <ol className={`${list} ${upcoming.rows}`}>
        {entry.upcoming.slice(1, 5).map((day) => (
          <li className={upcoming.row} key={day.date.getTime()}>
            <SpokenDay day={day} />
            <span aria-hidden="true" className={upcoming.rowLabel}>
              {words.line(day.date)}
            </span>
            <DayMark day={day} size={18} />
            <span aria-hidden="true" className={upcoming.rowWords}>
              {day.change ?? day.note ?? (named ? day.name : "")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const nextDays = {
  day: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  }),
  root: css({
    borderTop: "1px solid token(colors.separator)",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    paddingTop: "4px",
    width: "100%",
  }),
  weekday: css({ textStyle: "caption2" }),
};

// A row of days: each weekday over its mark.
function NextDays({ days }: { days: WidgetDay[] }) {
  const words = useWords();
  return (
    <ol className={`${list} ${nextDays.root}`}>
      {days.map((day) => (
        <li className={nextDays.day} key={day.date.getTime()}>
          <SpokenDay day={day} />
          <span
            aria-hidden="true"
            className={cx(nextDays.weekday, toneText({ tone: day.tone }))}
          >
            {words.weekday(day.date)}
          </span>
          <DayMark day={day} size={18} />
        </li>
      ))}
    </ol>
  );
}

// Two weeks keep to themselves in the middle; where there is room, as on
// Android's 4×2, their marks grow and the weeks stand further apart.
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
export function TwoWeeksMedium({ entry }: { entry: WidgetEntry }) {
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
  return (
    <div
      className={cx(
        dayCell({ off: tile && !flat, outside: !inMonth, today: isToday }),
        tile && flat && flatTile
      )}
      data-off={tile && !flat ? "" : undefined}
      style={
        {
          "--off-tint": tile ? tint : undefined,
          height: "100%",
        } as CSSProperties
      }
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
        <span className={cx(isToday && todayMark, day.note && dayParts.noted)}>
          {day.date.getDate()}
        </span>
      </span>
      <span aria-hidden="true" className={gridMark}>
        {marked && (
          <DayMark day={day} faint={look.mark === "faint"} size={markSize} />
        )}
      </span>
      {named && marked && <MarkName day={day} />}
    </div>
  );
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

// ── 次の休み ─────────────────────────────────────────────────────────────

// When a day off comes, in words: 今日, 明日, else how many days on.
function inDaysWords(inDays: number) {
  if (inDays === 0) {
    return "今日";
  }
  return inDays === 1 ? "明日" : `${inDays}日後`;
}

const offs = {
  avatar: css({ flexShrink: 0 }),
  // With nothing to count, the words sit in the middle of the rows' room.
  empty: css({ marginBlock: "auto" }),
  // The count, large: a number with 日後 after it, or 今日 and 明日.
  count: css({
    alignItems: "baseline",
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1,
  }),
  date: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    gap: "4px",
    textStyle: "footnote",
  }),
  head: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    gap: "4px",
    justifyContent: "space-between",
    minWidth: 0,
    textStyle: "footnote",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
  }),
  row: css({
    "&:not(:first-child)": { borderTop: "1px solid token(colors.separator)" },
    alignItems: "center",
    display: "grid",
    flex: 1,
    gap: "8px",
    // As quiet as リスト's lines: the date, its mark, and how soon at the
    // end in the secondary color. Only the small one counts large.
    gridTemplateColumns: "auto 18px 1fr",
  }),
  rowCount: css({
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
    justifySelf: "end",
    textStyle: "footnote",
  }),
  rowDate: css({
    fontVariantNumeric: "tabular-nums",
    textStyle: "subheadline",
  }),
  rows: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    marginTop: "4px",
  }),
  unit: css({ fontSize: "13px", fontWeight: 600, marginLeft: "2px" }),
};

// 次の休み, or 一緒に休める日 with the person's picture beside it.
function OffsHead({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const { with: companion } = entry.offs;
  return (
    <span className={offs.head}>
      <span className={oneLine}>
        {companion ? words.offTogether : words.nextOff}
      </span>
      {companion && (
        <span className={offs.avatar}>
          <PhotoAvatar
            name={companion.name}
            photo={companion.photo}
            size={20}
          />
        </span>
      )}
    </span>
  );
}

// A count: the number of days large with 日後 small, or 今日 and 明日.
function OffCount({ inDays, size }: { inDays: number; size: number }) {
  const words = useWords();
  const number = inDays > 1;
  return (
    <span aria-hidden="true" className={offs.count} style={{ fontSize: size }}>
      {number ? inDays : words.inDays(inDays)}
      {number && <span className={offs.unit}>{words.unit}</span>}
    </span>
  );
}

// Today when it is off, then the days off after it.
function offsAhead(entry: WidgetEntry): WidgetOff[] {
  const ahead = entry.offs.today ? [{ day: entry.today, inDays: 0 }] : [];
  return [...ahead, ...entry.offs.next];
}

// The whole of it as read aloud.
function spokenOff(entry: WidgetEntry, off: WidgetOff | undefined) {
  const companion = entry.offs.with;
  const title = companion
    ? `${companion.name}さんと一緒に休める日`
    : "次の休み";
  if (!off) {
    return `${title}、まだ入っていません`;
  }
  const { day, inDays } = off;
  return `${title}、${inDaysWords(inDays)}、${monthDay(day.date)}(${day.weekday}) ${day.name ?? ""}`;
}

const rest = {
  // The poodle looking up from the bottom edge at the right, its head
  // weighing against the words on the left.
  dog: css({
    bottom: "calc(-1 * var(--widget-margin) - 26px)",
    height: "92px",
    pointerEvents: "none",
    position: "absolute",
    right: "calc(-1 * var(--widget-margin) - 4px)",
    width: "92px",
  }),
  // The words keep to the top, clear of the dog in the corner below.
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
    position: "relative",
  }),
  title: css({
    fontWeight: 600,
    lineHeight: 1.3,
    position: "relative",
    textStyle: "title3",
    whiteSpace: "pre-line",
  }),
  tomorrow: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    gap: "4px",
    marginTop: "auto",
    position: "relative",
    textStyle: "footnote",
  }),
};

// The poodle, white in dark lines, as it sits on any ground.
function PeekingDog() {
  const icons = useAppIcons();
  const dark = useContext(ColorSchemeContext) === "dark";
  const drawing = icons[dark ? DARK_DRAWING : LIGHT_DRAWING];
  return drawing ? (
    <img alt="" className={rest.dog} height={92} src={drawing} width={92} />
  ) : null;
}

// A day off today, said as such rather than counted: おやすみ, with the
// date over it, tomorrow's mark under it, and the app icon's poodle
// looking up from the corner.
function RestToday({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const day = entry.today;
  const [, tomorrow] = entry.upcoming;
  const companion = entry.offs.with;
  return (
    <div className={rest.root}>
      <span className={srOnly}>{spokenOff(entry, { day, inDays: 0 })}</span>
      <PeekingDog />
      <span aria-hidden="true" className={offs.head}>
        <span className={oneLine}>{words.date(day.date)}</span>
        {companion && (
          <span className={offs.avatar}>
            <PhotoAvatar
              name={companion.name}
              photo={companion.photo}
              size={20}
            />
          </span>
        )}
      </span>
      <span aria-hidden="true" className={rest.title}>
        {companion ? words.restTogether : words.rest}
      </span>
      {tomorrow && (
        <span aria-hidden="true" className={rest.tomorrow}>
          {words.tomorrow}
          <DayMark day={tomorrow} size={16} />
        </span>
      )}
    </div>
  );
}

// The next day off large: how soon, and its date and mark.
export function NextOffSmall({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  if (entry.offs.today) {
    return <RestToday entry={entry} />;
  }
  const [next] = offsAhead(entry);
  return (
    <div className={offs.root}>
      <span className={srOnly}>{spokenOff(entry, next)}</span>
      <OffsHead entry={entry} />
      {next ? (
        <OffCount inDays={next.inDays} size={next.inDays > 1 ? 48 : 36} />
      ) : (
        <span
          aria-hidden="true"
          className={offs.count}
          style={{ fontSize: 36 }}
        >
          –
        </span>
      )}
      <span aria-hidden="true" className={offs.date}>
        {next ? (
          <>
            {words.date(next.day.date)}
            <DayMark day={next.day} size={16} />
          </>
        ) : (
          words.nothingYet
        )}
      </span>
    </div>
  );
}

// The next days off, a line each: the date, its mark and how soon.
export function NextOffMedium({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const ahead = offsAhead(entry).slice(0, widgetRules.nextOffs);
  return (
    <div className={offs.root}>
      <span className={srOnly}>{spokenOff(entry, ahead[0])}</span>
      <OffsHead entry={entry} />
      <ol aria-hidden="true" className={`${list} ${offs.rows}`}>
        {ahead.map(({ day, inDays }) => (
          <li className={offs.row} key={day.date.getTime()}>
            <span className={offs.rowDate}>{words.date(day.date)}</span>
            <DayMark day={day} size={18} />
            <span className={offs.rowCount}>{words.inDays(inDays)}</span>
          </li>
        ))}
        {ahead.length === 0 && (
          <li className={cx(offs.date, offs.empty)}>{words.nothingYet}</li>
        )}
      </ol>
    </div>
  );
}

// ── カレンダー ───────────────────────────────────────────────────────────

const month = {
  grid: cva({
    base: {
      columnGap: "2px",
      display: "grid",
      flex: 1,
      gridAutoRows: "1fr",
      gridTemplateColumns: "repeat(7, 1fr)",
    },
    variants: { named: { false: { rowGap: "4px" }, true: { rowGap: "2px" } } },
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

// Where the month has room, as on Android's 4×4, its marks grow.
const MONTH_ROOMY = 360;

// The month with every day's mark, and today's time over it.
export function CalendarLarge({ entry }: { entry: WidgetEntry }) {
  const { english, weekdayLetter } = useWeek();
  const roomy = useContext(WidgetSizeContext).height >= MONTH_ROOMY;
  const named = useShiftNames();
  // A name under each mark takes the room of a smaller mark.
  let markSize = roomy ? 24 : 20;
  if (named) {
    markSize = roomy ? 20 : 16;
  }
  const { first, days, weekdays } = entry.month;
  const todayTime = entry.today.date.getTime();
  return (
    <div className={month.root}>
      <div className={month.header}>
        <span className={month.title}>
          {english
            ? englishMonthOf(first)
            : `${first.getMonth() + MONTH_NUMBER}月`}
        </span>
        {entry.today.change && (
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
      <ol className={`${list} ${month.grid({ named })}`}>
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

// ── Lock screen ─────────────────────────────────────────────────────────

const circular = {
  count: css({
    fontSize: "20px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1,
  }),
  root: css({
    alignItems: "center",
    // The lock screen's own round ground: AccessoryWidgetBackground.
    bg: "rgb(255 255 255 / 0.16)",
    borderRadius: "full",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    height: "100%",
    justifyContent: "center",
  }),
  word: css({ fontWeight: 600, textStyle: "caption2" }),
};

// 早出 and 残業 alone, all a round face this small has room to say.
function movedWord(day: WidgetDay) {
  if (day.early && day.late) {
    return "早出・残業";
  }
  if (day.early) {
    return "早出";
  }
  return day.late ? "残業" : undefined;
}

// Today's mark in the round one, with 早出 or 残業 under it on such a day.
export function TodayCircular({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  const word = day.shift ? movedWord(day) : "なし";
  return (
    <div className={circular.root}>
      <span className={srOnly}>
        {day.name ?? NOTHING}
        {day.time ? ` ${day.time}` : ""}
      </span>
      <DayMark day={day} size={word ? 28 : 36} />
      {word && (
        <span aria-hidden="true" className={circular.word}>
          {word}
        </span>
      )}
    </div>
  );
}

// How soon the next day off comes, on the round face: 休み over the
// count, or 今日 and 明日.
export function NextOffCircular({ entry }: { entry: WidgetEntry }) {
  const [next] = offsAhead(entry);
  return (
    <div className={circular.root}>
      <span className={srOnly}>{spokenOff(entry, next)}</span>
      <span aria-hidden="true" className={circular.word}>
        {entry.offs.with ? "一緒" : "休み"}
      </span>
      <span aria-hidden="true" className={circular.count}>
        {next ? inDaysWords(next.inDays).replace("日後", "") : "–"}
      </span>
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
          <Change className={rectangular.time} day={day} />
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

// One line over the clock: today's mark and name, and any change to its
// hours. A line of text, it names the shift where the others let the
// mark say it.
export function TodayInline({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  const words = [day.name ?? NOTHING, day.change].filter(Boolean).join(" ");
  return (
    <div className={inline}>
      <DayMark day={day} size={14} />
      {words}
      <span className={srOnly}>{day.time}</span>
    </div>
  );
}
