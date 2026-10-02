import { widgetRules } from "@pochical/design/widgets";
import { Fragment, createContext, useContext } from "react";
import type { CSSProperties } from "react";
import { css, cva, cx } from "styled-system/css";

import { presetPatterns } from "../lib/design-patterns";
import type {
  WidgetDay,
  WidgetEntry,
  WidgetNoOff,
  WidgetOff,
  WidgetPair,
  WidgetPersonDay,
} from "../lib/design-widgets";
import { dayName } from "../lib/text-limits";
import { DARK_DRAWING, LIGHT_DRAWING, useAppIcons } from "./design-app-icon";
import { dayCell, dayParts, todayMark } from "./design-day-cell";
import { GroupIcon, MemberLook, PhotoAvatar } from "./design-group-parts";
import { englishMonthOf } from "./design-month-name";
import { ColorSchemeContext } from "./design-theme";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";
import {
  CellNamesContext,
  MarkGlyph,
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
      dayName: day,
      heading: (date: Date) => englishWeekdays[date.getDay()] ?? "",
      inDays: (inDays: number) =>
        inDays === 1 ? "Tomorrow" : `in ${inDays} days`,
      line: (date: Date) => `${day(date)} ${date.getDate()}`,
      apart: "No days off together yet",
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
      unit: "days",
      weekday,
    };
  }
  return {
    apart: "重なる休みはまだありません",
    date: (date: Date) => `${monthDay(date)}(${weekday(date)})`,
    dayName: weekday,
    heading: (date: Date) =>
      `${date.getMonth() + MONTH_NUMBER}月 ${weekday(date)}曜日`,
    inDays: (inDays: number) => (inDays === 1 ? "明日" : `${inDays}日後`),
    line: (date: Date) => `${date.getDate()} ${weekday(date)}`,
    nextDay: () => "明日",
    nextOff: "次の休み",
    nothingYet: "まだ入っていません",
    offAll: "みんな休み",
    offTogether: "一緒に休める日",
    rest: "今日は\nおやすみ",
    restAll: "みんな\nおやすみ",
    restTogether: "ふたりとも\nおやすみ",
    short: monthDay,
    today: "今日",
    tomorrow: "明日",
    unit: "日後",
    waiting: (names: string[]) => `${waitingNames(names)}の入力待ち`,
    weekday,
  };
}

// Who a day off together waits on: あやさん, or あやさんほか2人.
function waitingNames([first = "", ...rest]: string[]) {
  return rest.length > 0 ? `${first}さんほか${rest.length}人` : `${first}さん`;
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
  // Today's date in bold, as a card dates itself.
  date: css({ fontWeight: 700, textStyle: "headline", whiteSpace: "nowrap" }),
  day: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "12px",
    // The whole height, alone in the small one too, to center in.
    height: "100%",
    justifyContent: "center",
    minWidth: 0,
    textAlign: "center",
  }),
  // Over tomorrow: small spaced capitals, a label rather than a date.
  label: css({
    color: "text.secondary",
    fontSize: "11px",
    letterSpacing: "0.12em",
    lineHeight: "22px",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  }),
  mark: css({ display: "flex" }),
  pair: css({ display: "flex", gap: "16px", height: "100%" }),
  rule: css({ bg: "separator", flexShrink: 0, width: "1px" }),
  note: css({
    color: "text.secondary",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
  words: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 400,
    letterSpacing: "0.02em",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
};

// Where the widget is taller, as on Android's launcher, its marks grow.
const SIMPLE_ROOMY = 150;
// How much larger a mark draws with nothing said under it.
const QUIET_GROWTH = 12;

// A day plainly: its date (or TOMORROW), its mark large, and only what
// changed under it, as one group in the middle of its room. A day with
// nothing changed is its own design, not one with an empty line kept for
// words: its mark grows and the group closes up round it. Beside another
// day each centers on its own, rather than lining its parts up with the
// other's, which left a quiet day high with a gap under it.
function SimpleDay({
  day,
  label,
  withNote = false,
}: {
  day: WidgetDay;
  label?: string;
  // これから's today: the memo's first line where nothing changed.
  withNote?: boolean;
}) {
  const words = useWords();
  const said = changeWords(day, useShiftNames()) !== undefined;
  const note = !said && withNote ? day.note : undefined;
  const roomy = useContext(WidgetSizeContext).height >= SIMPLE_ROOMY;
  const base = roomy ? 64 : 48;
  const quiet = !(said || note);
  return (
    <div className={simple.day}>
      {label ? (
        <span className={simple.label}>{label}</span>
      ) : (
        <span className={simple.date}>{words.short(day.date)}</span>
      )}
      <span className={simple.mark}>
        <DayMark day={day} size={quiet ? base + QUIET_GROWTH : base} />
      </span>
      {said && <Change className={simple.words} day={day} />}
      {note && <span className={simple.note}>{note}</span>}
      {!said && (
        <span className={srOnly}>
          {day.name ?? NOTHING}
          {day.time ? ` ${day.time}` : ""}
        </span>
      )}
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
      <SimpleDay day={entry.today} />
      <span aria-hidden="true" className={simple.rule} />
      {tomorrow && <SimpleDay day={tomorrow} label={words.tomorrow} />}
    </div>
  );
}

// ── これから ─────────────────────────────────────────────────────────────

const upcoming = {
  head: css({ display: "flex", flexDirection: "column", gap: "4px" }),
  // The date at the start and the mark at the end, level with each other.
  headLine: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  }),
  pair: css({ gap: "12px" }),
  row: css({
    "&:not(:first-child)": { borderTop: "1px solid token(colors.separator)" },
    alignItems: "center",
    display: "grid",
    flex: 1,
    gap: "4px",
    gridTemplateColumns: "52px 18px 1fr",
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
  // Today's line and the three days as one group in the middle, not
  // pushed to the top and bottom with a gap between.
  small: css({
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    height: "100%",
    justifyContent: "center",
  }),
  // シンプル's today, in the medium one's left column.
  today: css({ display: "flex", flexShrink: 0, width: "100px" }),
  words: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 400,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
};

// Today large: its date and mark, what changed, and its memo's first
// line.
// Today as a heading line: its date and its mark side by side, and what
// changed under them only on a day that has some.
function UpcomingHead({ day }: { day: WidgetDay }) {
  const words = useWords();
  const said = changeWords(day, useShiftNames()) !== undefined;
  return (
    <div className={upcoming.head}>
      <span className={upcoming.headLine}>
        <span className={simple.date}>{words.short(day.date)}</span>
        <DayMark day={day} size={28} />
      </span>
      {said ? (
        <Change className={upcoming.words} day={day} />
      ) : (
        <span className={srOnly}>
          {day.name ?? NOTHING}
          {day.time ? ` ${day.time}` : ""}
        </span>
      )}
    </div>
  );
}

// Today's line, and the next three days' marks under it; set to someone,
// today and tomorrow, theirs under the person's.
export function UpcomingSmall({ entry }: { entry: WidgetEntry }) {
  if (entry.pair) {
    return <PairDays count={2} entry={entry} pair={entry.pair} />;
  }
  return (
    <div className={upcoming.small}>
      <UpcomingHead day={entry.today} />
      <NextDays days={entry.upcoming.slice(1, 4)} />
    </div>
  );
}

// シンプル's today on the left, with the memo where nothing changed; on
// the right, the days after it a line each, each by its date (25 金),
// with what changed, the memo, or the shift's name when names are shown.
// Set to someone, five days from today, theirs under the person's.
export function UpcomingMedium({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const named = useShiftNames();
  if (entry.pair) {
    return <PairDays count={5} entry={entry} pair={entry.pair} />;
  }
  return (
    <div className={cx(simple.pair, upcoming.pair)}>
      <div className={upcoming.today}>
        <SimpleDay day={entry.today} withNote />
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

// ── これから with someone ───────────────────────────────────────────────

// Where the widget is taller, as on Android's launcher, the marks grow.
const PAIR_ROOMY = 150;
const PAIR_FACE = 24;

// A day off's tile, as in the group's tables: the テーマ's light tint
// whatever the pattern, a little in from the cell; a day both are off
// joins the tiles down the column into one band. Faint where the system
// draws in one color.
const pairTile = {
  borderRadius: "sm",
  content: '""',
  inset: "3px",
  position: "absolute",
  zIndex: -1,
} as const;

const pair = {
  band: cva({
    base: { borderRadius: "sm", marginInline: "3px" },
    variants: {
      flat: {
        false: { bg: "accent.container" },
        true: { bg: "rgb(255 255 255 / 0.24)" },
      },
    },
  }),
  cell: cva({
    base: {
      alignItems: "center",
      display: "flex",
      flexDirection: "column",
      gap: "1px",
      isolation: "isolate",
      justifyContent: "center",
      minWidth: 0,
      position: "relative",
    },
    variants: {
      tile: {
        flat: { "&::before": { ...pairTile, bg: "rgb(255 255 255 / 0.24)" } },
        full: { "&::before": { ...pairTile, bg: "accent.container" } },
        none: {},
      },
    },
  }),
  date: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    paddingBlock: "4px 2px",
    position: "relative",
  }),
  face: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  }),
  grid: css({ columnGap: "2px", display: "grid", height: "100%" }),
  number: css({
    fontSize: "13px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    lineHeight: "16px",
  }),
  weekday: css({ lineHeight: "13px", textStyle: "caption2" }),
};

// Marks grow where the widget is taller; a name under each takes the
// room of a smaller one.
function pairMarkSize(roomy: boolean, named: boolean) {
  const grown = roomy ? 32 : 26;
  return named ? grown - 6 : grown;
}

// The days from today in columns, as the group's 週ごと lays a week: the
// dates over them, each under its weekday in one letter as over the
// calendar's columns (S M T), then the person's row and the picked one's,
// each with their face in a first column as wide as the days'. Today is
// always the first day, so its date is drawn plain. Days off sit on the
// group tables' tiles, and a day both are off joins them into one band.
function PairDays({
  entry,
  pair: shown,
  count,
}: {
  entry: WidgetEntry;
  pair: WidgetPair;
  count: number;
}) {
  const { weekdayLetter } = useWeek();
  const named = useShiftNames();
  const flat = useContext(WidgetRenderingModeContext) !== "fullColor";
  const roomy = useContext(WidgetSizeContext).height >= PAIR_ROOMY;
  const size = pairMarkSize(roomy, named);
  const days = entry.upcoming.slice(0, count);
  const tileOf = (off: boolean, together: boolean) => {
    if (!off || together) {
      return "none";
    }
    return flat ? "flat" : "full";
  };
  return (
    <div
      className={pair.grid}
      style={{
        // The faces take a column as wide as a day's, so the columns keep one
        // rhythm and the widget's two sides the same room.
        gridTemplateColumns: `repeat(${count + 1}, 1fr)`,
        gridTemplateRows: "auto 1fr 1fr",
      }}
    >
      {days.map((day, index) => {
        const column = index + 2;
        const { theirs, together } = shown.days[index] ?? { together: false };
        return (
          <Fragment key={day.date.getTime()}>
            {together && (
              <span
                aria-hidden="true"
                className={pair.band({ flat })}
                style={{ gridColumn: column, gridRow: "1 / 4" }}
              />
            )}
            <span
              className={pair.date}
              style={{ gridColumn: column, gridRow: 1 }}
            >
              <span className={srOnly}>
                {monthDay(day.date)}({day.weekday})
                {together ? " ふたりとも休み" : ""}
              </span>
              <span
                aria-hidden="true"
                className={cx(pair.weekday, toneText({ tone: day.tone }))}
              >
                {weekdayLetter(day.date.getDay())}
              </span>
              <span
                aria-hidden="true"
                className={cx(pair.number, day.holiday && dayParts.holiday)}
              >
                {day.date.getDate()}
              </span>
            </span>
            <span
              className={pair.cell({ tile: tileOf(day.off, together) })}
              style={{ gridColumn: column, gridRow: 2 }}
            >
              <SpokenDay day={day} />
              <DayMark day={day} size={size} />
              {named && day.shift && <MarkName day={day} />}
            </span>
            <span
              className={pair.cell({
                tile: tileOf(theirs?.off ?? false, together),
              })}
              style={{ gridColumn: column, gridRow: 3 }}
            >
              <span className={srOnly}>
                {shown.with.name}さん {theirs?.name ?? "未入力"}
                {theirs?.time ? ` ${theirs.time}` : ""}
              </span>
              <TheirMark day={theirs} size={size} style={shown.with.style} />
              {named && theirs && (
                <span aria-hidden="true" className={markName}>
                  {dayName(theirs.name)}
                </span>
              )}
            </span>
          </Fragment>
        );
      })}
      <span className={pair.face} style={{ gridColumn: 1, gridRow: 2 }}>
        <PhotoAvatar
          me
          name={shown.me.name}
          photo={shown.me.photo}
          size={PAIR_FACE}
        />
        <span className={srOnly}>{shown.me.name}</span>
      </span>
      <span className={pair.face} style={{ gridColumn: 1, gridRow: 3 }}>
        <PhotoAvatar
          name={shown.with.name}
          photo={shown.with.photo}
          size={PAIR_FACE}
        />
        <span className={srOnly}>{shown.with.name}</span>
      </span>
    </div>
  );
}

// Their mark in the shape they chose, in the viewer's テーマ, as the
// group's tables draw it; a quiet dash where they have not entered.
function TheirMark({
  day,
  size,
  style,
}: {
  day?: WidgetPersonDay;
  size: number;
  style?: WidgetPair["with"]["style"];
}) {
  if (!day) {
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
    <MemberLook member={{ style: style && { look: style } }}>
      <ViewerGlyph day={day} size={size} />
    </MemberLook>
  );
}

function ViewerGlyph({ day, size }: { day: WidgetPersonDay; size: number }) {
  const style = useContext(ShiftMarkStyleContext);
  return (
    <span aria-hidden="true" className={dayMark}>
      <MarkGlyph
        early={day.early}
        late={day.late}
        look={day.look}
        size={size}
        style={style}
      />
    </span>
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
    paddingTop: "8px",
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
          <DayMark day={day} size={24} />
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
  // A group's mark, framed as the app's list of groups frames it.
  groupFace: css({
    bg: "fill.quaternary",
    borderRadius: "6px",
    display: "grid",
    flexShrink: 0,
    fontSize: "13px",
    height: "20px",
    overflow: "hidden",
    placeItems: "center",
    width: "20px",
  }),
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

// 次の休み, 一緒に休める日 with the person's picture beside it, or
// みんなで休める日 with the group's.
function OffsHead({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const { with: companion } = entry.offs;
  let title = words.nextOff;
  if (companion) {
    title = companion.kind === "group" ? words.offAll : words.offTogether;
  }
  return (
    <span className={offs.head}>
      <span className={oneLine}>{title}</span>
      <CompanionFace entry={entry} />
    </span>
  );
}

// The face of who the widget is set to: a person's round picture, or a
// group's mark in its rounded square, as the app frames them.
function CompanionFace({ entry }: { entry: WidgetEntry }) {
  const { with: companion } = entry.offs;
  if (!companion) {
    return null;
  }
  if (companion.kind === "group") {
    return (
      <span className={offs.groupFace}>
        <GroupIcon mark={companion.mark} size={14} />
      </span>
    );
  }
  return (
    <span className={offs.avatar}>
      <PhotoAvatar name={companion.name} photo={companion.photo} size={20} />
    </span>
  );
}

// What is said when no day off is ahead.
function noOffWords(
  none: WidgetNoOff | undefined,
  words: ReturnType<typeof useWords>
) {
  if (none?.kind === "waiting") {
    return words.waiting(none.names);
  }
  return none?.kind === "apart" ? words.apart : words.nothingYet;
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
  let title = "次の休み";
  if (companion) {
    title =
      companion.kind === "group"
        ? `${companion.name}のみんな休み`
        : `${companion.name}さんと一緒に休める日`;
  }
  if (!off) {
    const { none } = entry.offs;
    if (none?.kind === "waiting") {
      return `${title}、${waitingNames(none.names)}の入力待ち`;
    }
    const apart = none?.kind === "apart";
    return `${title}、${apart ? "重なる休みはまだありません" : "まだ入っていません"}`;
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
  let title = words.rest;
  if (companion) {
    title = companion.kind === "group" ? words.restAll : words.restTogether;
  }
  return (
    <div className={rest.root}>
      <span className={srOnly}>{spokenOff(entry, { day, inDays: 0 })}</span>
      <PeekingDog />
      <span aria-hidden="true" className={offs.head}>
        <span className={oneLine}>{words.date(day.date)}</span>
        <CompanionFace entry={entry} />
      </span>
      <span aria-hidden="true" className={rest.title}>
        {title}
      </span>
      {tomorrow && (
        <span aria-hidden="true" className={rest.tomorrow}>
          {words.nextDay(tomorrow.date)}
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
          noOffWords(entry.offs.none, words)
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
          <li className={cx(offs.date, offs.empty)}>
            {noOffWords(entry.offs.none, words)}
          </li>
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

// 休み, else 一緒 with someone, or みんな with a group.
function circularWord(entry: WidgetEntry) {
  const companion = entry.offs.with;
  if (!companion) {
    return "休み";
  }
  return companion.kind === "group" ? "みんな" : "一緒";
}

// How soon the next day off comes, on the round face: 休み over the
// count, or 今日 and 明日.
export function NextOffCircular({ entry }: { entry: WidgetEntry }) {
  const [next] = offsAhead(entry);
  return (
    <div className={circular.root}>
      <span className={srOnly}>{spokenOff(entry, next)}</span>
      <span aria-hidden="true" className={circular.word}>
        {circularWord(entry)}
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
