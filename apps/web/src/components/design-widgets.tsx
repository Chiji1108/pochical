import { createContext, useContext } from "react";
import { css, cva, cx } from "styled-system/css";

import type { WidgetDay, WidgetOff } from "../lib/design-widgets";
import { dayName } from "../lib/text-limits";
import { shortMonthOf } from "./design-month-name";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";
import {
  CellNamesContext,
  OffDisplayContext,
  ShiftMark,
  ShiftMarkStyleContext,
  useOffHighlight,
} from "./shift-mark";

// The widgets themselves: views of one WidgetEntry, as the native apps'
// SwiftUI widget views and Glance composables will be. They hold no state
// and read no store; taps open the app. The system gives each its margins
// (16pt on the home screen, none on the lock screen), so the views add
// none of their own, and the frame they are shown in (design-widget-frame)
// stands in for the rest.
//
// Four kinds, each in the sizes it suits: シンプル (today, and tomorrow,
// large), 次の休み (how soon the next day off comes, alone, with someone
// or with a group picked when editing the widget), これから (the days
// from today, with someone's beside them if picked) and カレンダー (two
// weeks, the month). The mark says which shift it is, so words beside it
// are only what changed, and screen readers always hear the name. A
// memo's words are the app's; widgets show only that a day has one, with
// the calendar's stroke under its date.
//
// Each kind is in a file of its own (design-widgets-simple, -next-off,
// -upcoming, -calendar, and -lock for the lock screen's); this one holds
// what they share: the contexts the frame sets, the words, and a day's
// mark with its name.

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

export const MONTH_NUMBER = 1;
export const NOTHING = "予定なし";

export function monthDay(date: Date) {
  return `${date.getMonth() + MONTH_NUMBER}月${date.getDate()}日`;
}

// Whether the person shows shift names under the marks in the app's
// calendar. The widgets then name the shift as well, for someone who
// tells their marks apart by name.
export function useShiftNames() {
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

// What a day says in words where its mark carries its own name label
// (NamedMark): 予定なし with nothing entered, else only the changed
// hours. The name is the mark's label, not news.
export function newsWords(day: WidgetDay) {
  return day.shift ? day.change : NOTHING;
}

// Those words, with the shift's name and hours for screen readers.
// `withName` false leaves the name to the label under the mark.
export function Change({
  day,
  className,
  withName = true,
  spoken = true,
}: {
  day: WidgetDay;
  className: string;
  withName?: boolean;
  // False where the view reads the whole day aloud itself (SpokenDay).
  spoken?: boolean;
}) {
  const named = useShiftNames();
  const words = withName ? changeWords(day, named) : newsWords(day);
  const time = day.time ? ` ${day.time}` : "";
  return (
    <strong className={className}>
      {spoken && (
        <span className={srOnly}>
          {day.name ?? NOTHING}
          {time}
        </span>
      )}
      {words && <span aria-hidden="true">{words}</span>}
    </strong>
  );
}

// A day as read aloud, for the places whose marks are pictures only.
export function SpokenDay({ day }: { day: WidgetDay }) {
  const time = day.time ? ` ${day.time}` : "";
  const note = day.noted ? " メモあり" : "";
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

export function useOffLook(day: WidgetDay, week: boolean): OffLook {
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

export const dayMark = css({
  alignItems: "center",
  color: "text.quaternary",
  display: "inline-flex",
  flexShrink: 0,
  justifyContent: "center",
});

// A day's mark, or a quiet dash when nothing is entered.
export function DayMark({
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

export function MarkName({ day }: { day: WidgetDay }) {
  return (
    <span aria-hidden="true" className={markName}>
      {day.name ? dayName(day.name) : ""}
    </span>
  );
}

// Under a large mark, its name a size larger.
const markNameLarge = css({ fontSize: "11px", lineHeight: "13px" });

// How much smaller a mark draws with its name under it.
export const NAME_ROOM = 6;

const namedMark = css({
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  maxWidth: "100%",
});

// A day's mark with its name under it when names are shown, as the
// calendar's day has it: the caller draws the mark a size smaller to make
// room, and the two are one group, centered wherever there is room for
// it. `reserve` keeps the name's line on a day without a name, so the
// marks of a row stay level.
export function NamedMark({
  day,
  size,
  named,
  faint = false,
  large = false,
  reserve = false,
}: {
  day: WidgetDay;
  size: number;
  named: boolean;
  faint?: boolean;
  large?: boolean;
  reserve?: boolean;
}) {
  const labelled = named && day.shift !== undefined;
  return (
    <span className={namedMark}>
      <DayMark day={day} faint={faint} size={size} />
      {(labelled || (named && reserve)) && (
        <span
          aria-hidden="true"
          className={cx(markName, large && markNameLarge)}
        >
          {labelled && day.name ? dayName(day.name) : "\u00A0"}
        </span>
      )}
    </span>
  );
}

export const toneText = cva({
  variants: {
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: { color: "text.secondary" },
      saturday: { color: "calendar.saturday" },
    },
  },
});

export const list = css({ listStyle: "none", margin: 0, padding: 0 });

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
export function useWords() {
  const { english, weekdayName } = useWeek();
  // A weekday heading a column of days: 金, or FRI.
  const weekday = (date: Date) => weekdayName(date.getDay()).toUpperCase();
  if (english) {
    // Dates as English writes them, Thu, Sep 24, rather than the month's
    // heading (sep.), which is for the calendar's large title alone.
    const month = (date: Date) => shortMonthOf(date, true) ?? "";
    const day = (date: Date) => weekdayName(date.getDay());
    return {
      date: (date: Date) => `${day(date)}, ${month(date)} ${date.getDate()}`,
      dayName: day,
      heading: (date: Date) => englishWeekdays[date.getDay()] ?? "",
      inDays: (inDays: number) =>
        inDays === 1 ? "Tomorrow" : `in ${inDays} days`,
      apart: "No days off together yet",
      // Over the count on the lock screen's round face.
      circle: { all: "Everyone", alone: "Off", together: "Together" },
      nextOff: "Next day off",
      nothingYet: "Nothing yet",
      offAll: "Everyone off",
      offTogether: "Off together",
      rest: "Day off\ntoday",
      restAll: "Everyone off\ntoday",
      restTogether: "Both off\ntoday",
      waiting: ([first = "", ...rest]: string[]) =>
        `Waiting on ${first}${rest.length > 0 ? ` +${rest.length}` : ""}`,
      short: (date: Date) => `${month(date)} ${date.getDate()}.`,
      today: "Today",
      tomorrow: "Tomorrow",
      // The day after a day off, short enough to keep clear of the
      // poodle in the corner: Fri, as 明日 is in Japanese.
      nextDay: (date: Date) => day(date),
      // How soon on the round face: Today, the weekday for tomorrow, as
      // nextDay, else the number.
      soon: ({ day: { date }, inDays }: WidgetOff) => {
        if (inDays === 0) {
          return "Today";
        }
        return inDays === 1 ? day(date) : `${inDays}`;
      },
      unit: "days",
      weekday,
    };
  }
  return {
    apart: "重なる休みはまだありません",
    circle: { all: "みんな", alone: "休み", together: "一緒" },
    date: (date: Date) => `${monthDay(date)}(${weekday(date)})`,
    dayName: weekday,
    heading: (date: Date) =>
      `${date.getMonth() + MONTH_NUMBER}月 ${weekday(date)}曜日`,
    inDays: inDaysWords,
    nextDay: () => "明日",
    nextOff: "次の休み",
    nothingYet: "まだ入っていません",
    offAll: "みんな休み",
    offTogether: "一緒に休める日",
    rest: "今日は\nおやすみ",
    restAll: "みんな\nおやすみ",
    restTogether: "ふたりとも\nおやすみ",
    short: monthDay,
    soon: ({ inDays }: WidgetOff) =>
      inDays > 1 ? `${inDays}` : inDaysWords(inDays),
    today: "今日",
    tomorrow: "明日",
    unit: "日後",
    waiting: (names: string[]) => `${waitingNames(names)}の入力待ち`,
    weekday,
  };
}

// Who a day off together waits on: あやさん, or あやさんほか2人.
export function waitingNames([first = "", ...rest]: string[]) {
  return rest.length > 0 ? `${first}さんほか${rest.length}人` : `${first}さん`;
}

// When a day off comes, in words: 今日, 明日, else how many days on.
export function inDaysWords(inDays: number) {
  if (inDays === 0) {
    return "今日";
  }
  return inDays === 1 ? "明日" : `${inDays}日後`;
}

// One line, cut with … where it runs out. Written out in each style
// rather than spread from a shared object, which Panda's extraction
// missed, leaving long memos wrapping.
export const oneLine = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
