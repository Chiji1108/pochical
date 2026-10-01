import { Users } from "lucide-react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { css, cva, cx } from "styled-system/css";

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

// The words beside a day's mark: nothing on an ordinary day, since the
// mark says which shift and its hours are the same every time; the
// changed hours on a day of 早出 or 残業; 予定なし with nothing entered.
function changeWords(day: WidgetDay) {
  return day.shift ? day.change : NOTHING;
}

// Those words, with the shift's name and hours for screen readers.
function Change({ day, className }: { day: WidgetDay; className: string }) {
  const words = changeWords(day);
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

// A day with a memo: the calendar's stroke under its date, as marked in
// a paper diary. Only where each day has its own date and mark; the small
// month's numbers sit in day-off tiles with no room for it.
const noted = css({
  _before: {
    bg: "calendar.noteMarker",
    borderRadius: "2xs",
    content: '""',
    inset: "45% -3px -1px",
    position: "absolute",
    zIndex: -1,
  },
  isolation: "isolate",
  position: "relative",
});

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

// Today large: the date, its mark and any change to its hours.
function TodayBlock({ day }: { day: WidgetDay }) {
  return (
    <div className={today.root}>
      <span className={today.date}>
        {monthDay(day.date)}({day.weekday})
      </span>
      <DayMark day={day} size={48} />
      <Change className={today.headline} day={day} />
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
  // The mark over any change to its hours: side by side, a change with
  // 翌 runs out of the square.
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
        <DayMark day={day} size={40} />
        <Change className={today.headline} day={day} />
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

// Two weeks keep to themselves in the middle; where there is room, as on
// Android's 4×2, their marks grow and the weeks stand further apart.
const TWO_WEEKS_ROOMY = 150;

const twoWeeks = {
  date: cva({
    base: { fontVariantNumeric: "tabular-nums", textStyle: "footnote" },
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
  grid: cva({
    base: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
    variants: {
      roomy: { false: { rowGap: "8px" }, true: { rowGap: "16px" } },
    },
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    height: "100%",
    justifyContent: "center",
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
  const roomy = useContext(WidgetSizeContext).height >= TWO_WEEKS_ROOMY;
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
      <ol className={`${list} ${twoWeeks.grid({ roomy })}`}>
        {entry.twoWeeks.map((shown) => {
          const time = shown.date.getTime();
          return (
            <li className={twoWeeks.day({ past: time < todayTime })} key={time}>
              <SpokenDay day={shown} />
              <span
                aria-hidden="true"
                className={cx(
                  twoWeeks.date({ today: time === todayTime }),
                  dateTone(shown, todayTime),
                  shown.note && noted
                )}
              >
                {shown.date.getDate()}
              </span>
              <DayMark day={shown} size={roomy ? 32 : 28} />
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
      borderRadius: "xs",
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
              <Change className={agenda.time} day={day} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const month = {
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

// Where the month has room, as on Android's 4×4, its marks grow.
const MONTH_ROOMY = 360;

// The month with every day's mark, and today's time over it.
export function CalendarLarge({ entry }: { entry: WidgetEntry }) {
  const markSize =
    useContext(WidgetSizeContext).height >= MONTH_ROOMY ? 24 : 20;
  const { first, days, weekdays } = entry.month;
  const todayTime = entry.today.date.getTime();
  return (
    <div className={month.root}>
      <div className={month.header}>
        <span className={month.title}>{first.getMonth() + MONTH_NUMBER}月</span>
        {entry.today.change && (
          <span className={month.summary}>今日 {entry.today.change}</span>
        )}
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
                  className={cx(
                    month.date({ today: day.date.getTime() === todayTime }),
                    dateTone(day, todayTime),
                    day.note && noted
                  )}
                >
                  {day.date.getDate()}
                </span>
                {day.shift ? (
                  <DayMark day={day} size={markSize} />
                ) : (
                  <span style={{ height: markSize }} />
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

// Where there is room, as on Android's 2×2 and 4×2, the memo gets more
// lines; 一緒に働く人 keep to the foot either way.
const DETAIL_ROOMY = 150;

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
    minWidth: 0,
    textStyle: "footnote",
  }),
  // The names, the longest way that fits the line.
  names: css({
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  // Every way of writing the names, laid out unseen to be measured.
  namesProbe: css({
    "& > span": { display: "block", width: "max-content" },
    left: 0,
    position: "absolute",
    top: 0,
    visibility: "hidden",
  }),
  note: cva({
    base: { margin: 0, textStyle: "footnote" },
    variants: {
      lines: {
        2: { lineClamp: 2 },
        3: { lineClamp: 3 },
        4: { lineClamp: 4 },
        5: { lineClamp: 5 },
      },
    },
  }),
  // In the small one, 一緒に働く人 sit at the foot.
  pinned: css({ marginTop: "auto" }),
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

// The ways to write 一緒に働く人, longest first: everyone, then fewer
// names with ほか and how many more, then the count alone.
function memberLines(names: string[]) {
  const shortened = Array.from(
    { length: names.length - 1 },
    (_, index) => names.length - 1 - index
  ).map(
    (kept) => `${names.slice(0, kept).join("・")} ほか${names.length - kept}人`
  );
  return [names.join("・"), ...shortened, `${names.length}人`];
}

// The longest of those that fits the line, as SwiftUI's ViewThatFits
// picks; the count alone, cut short, if even that does not.
function MemberNames({ names }: { names: string[] }) {
  const lines = memberLines(names);
  const box = useRef<HTMLSpanElement>(null);
  const probes = useRef<(HTMLSpanElement | null)[]>([]);
  const [shown, setShown] = useState(0);
  // A widget's size is fixed, so the names are measured once; a new set
  // of people comes in as a new MemberNames (keyed by them).
  const last = lines.length - 1;
  useLayoutEffect(() => {
    const room = box.current?.clientWidth ?? 0;
    const fits = probes.current.findIndex(
      (probe) => probe !== null && probe.offsetWidth <= room
    );
    setShown(fits === -1 ? last : fits);
  }, [last]);
  return (
    <span aria-hidden="true" className={detail.names} ref={box}>
      {lines[shown]}
      <span aria-hidden="true" className={detail.namesProbe}>
        {lines.map((line, index) => (
          <span
            key={line}
            ref={(probe) => {
              probes.current[index] = probe;
            }}
          >
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}

// The memo and 一緒に働く人 of a day, as far as it has them.
function DayExtras({
  day,
  lines,
  pinMembers = false,
}: {
  day: WidgetDay;
  lines: 2 | 3 | 4 | 5;
  pinMembers?: boolean;
}) {
  return (
    <>
      {day.note && <p className={detail.note({ lines })}>{day.note}</p>}
      {day.members.length > 0 && (
        <span
          className={`${detail.members} ${pinMembers ? detail.pinned : ""}`}
        >
          <span className={srOnly}>一緒に働く人 {day.members.join("、")}</span>
          <Users aria-hidden="true" size={14} />
          <MemberNames key={day.members.join("・")} names={day.members} />
        </span>
      )}
    </>
  );
}

// Today's time with its memo and 一緒に働く人.
export function DetailSmall({ entry }: { entry: WidgetEntry }) {
  const roomy = useContext(WidgetSizeContext).height >= DETAIL_ROOMY;
  const day = entry.today;
  return (
    <div className={detail.root}>
      <div className={detail.top}>
        <span className={today.date}>
          {monthDay(day.date)}({day.weekday})
        </span>
        <DayMark day={day} size={roomy ? 32 : 28} />
      </div>
      <Change className={detail.headline} day={day} />
      <DayExtras day={day} lines={roomy ? 4 : 2} pinMembers />
    </div>
  );
}

// Today large on the left, its memo and 一緒に働く人 beside.
export function DetailMedium({ entry }: { entry: WidgetEntry }) {
  const roomy = useContext(WidgetSizeContext).height >= DETAIL_ROOMY;
  const day = entry.today;
  return (
    <div className={detail.wide}>
      <div className={week.today}>
        <TodayBlock day={day} />
      </div>
      <span aria-hidden="true" className={week.rule} />
      <div className={detail.side}>
        <DayExtras day={day} lines={roomy ? 5 : 3} />
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
