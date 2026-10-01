import { Users } from "lucide-react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import { css, cva, cx } from "styled-system/css";

import { presetPatterns } from "../lib/design-patterns";
import type { WidgetDay, WidgetEntry, WidgetOff } from "../lib/design-widgets";
import { dayName } from "../lib/text-limits";
import { DARK_DRAWING, LIGHT_DRAWING, useAppIcons } from "./design-app-icon";
import { PhotoAvatar } from "./design-group-parts";
import { ColorSchemeContext } from "./design-theme";
import { srOnly } from "./design-ui";
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

// A day with a memo: the calendar's stroke under its date, as marked in
// a paper diary. Only where each day has its own date and mark; the small
// month's numbers sit in day-off tiles with no room for it.
const noted = css({
  // On a day off's tile, the tile's own color a step deeper, as in the
  // calendar.
  "[data-off] &": {
    _before: {
      bg: "oklch(from var(--off-tint) calc(l + var(--note-on-tile-lightness)) calc(c * var(--note-on-tile-chroma)) h)",
    },
  },
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

const offTile = cva({
  // Faint when the system draws in one color, or it would be a solid
  // block over its number.
  variants: {
    flat: {
      false: { bg: "var(--off-tint)" },
      true: { bg: "rgb(255 255 255 / 0.24)" },
    },
  },
});

// A day off's tile on a day's cell, in its pattern's tint: a class, and
// the tint as --off-tint, which a memo's stroke on it deepens.
function useOffTile(day: WidgetDay, on: boolean) {
  const { tint } = useDisplayColor(day.color ?? presetPatterns.off.color);
  const flat = useContext(WidgetRenderingModeContext) !== "fullColor";
  if (!on) {
    return {};
  }
  return {
    className: offTile({ flat }),
    "data-off": flat ? undefined : "",
    style: { "--off-tint": tint } as CSSProperties,
  };
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

// ── 今日 ────────────────────────────────────────────────────────────────

const oneLine = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const today = {
  date: css({ color: "text.secondary", textStyle: "footnote" }),
  headline: css({
    fontVariantNumeric: "tabular-nums",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "headline",
    whiteSpace: "nowrap",
  }),
  note: css({ ...oneLine, color: "text.secondary", textStyle: "footnote" }),
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
  words: css({ display: "flex", flexDirection: "column", maxWidth: "100%" }),
};

// Today large: the date, its mark and any change to its hours, and the
// memo's first line where the memo has no room of its own.
function TodayBlock({ day, note = false }: { day: WidgetDay; note?: boolean }) {
  return (
    <div className={today.root}>
      <span className={today.date}>
        {monthDay(day.date)}({day.weekday})
      </span>
      <DayMark day={day} size={48} />
      <span className={today.words}>
        <Change className={today.headline} day={day} />
        {note && day.note && <span className={today.note}>{day.note}</span>}
      </span>
    </div>
  );
}

// Today has nothing to say beside its mark: no change, no memo, and no
// name to show. The words' room then goes to the next three days.
function useQuiet(day: WidgetDay) {
  const named = useShiftNames();
  return changeWords(day, named) === undefined && !day.note;
}

export function TodaySmall({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  const quiet = useQuiet(day);
  if (day.off && quiet) {
    return (
      <RestToday
        entry={{ ...entry, offs: { ...entry.offs, with: undefined } }}
      />
    );
  }
  if (!quiet) {
    return <TodayBlock day={day} note />;
  }
  return (
    <div className={today.root}>
      <span className={srOnly}>
        {day.name ?? NOTHING}
        {day.time ? ` ${day.time}` : ""}
      </span>
      <span aria-hidden="true" className={today.date}>
        {monthDay(day.date)}({day.weekday})
      </span>
      <DayMark day={day} size={48} />
      <NextDays days={entry.upcoming.slice(1, 4)} />
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
  return (
    <ol className={`${list} ${nextDays.root}`}>
      {days.map((day) => (
        <li className={nextDays.day} key={day.date.getTime()}>
          <SpokenDay day={day} />
          <span
            aria-hidden="true"
            className={cx(nextDays.weekday, toneText({ tone: day.tone }))}
          >
            {day.weekday}
          </span>
          <DayMark day={day} size={18} />
        </li>
      ))}
    </ol>
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
      borderRadius: "sm",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      paddingBlock: "2px",
    },
    // Days already gone this week stay, faint, so the weeks keep their
    // shape.
    variants: { past: { false: {}, true: { opacity: 0.4 } } },
  }),
  grid: cva({
    base: {
      columnGap: "2px",
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
    },
    compoundVariants: [{ css: { rowGap: "4px" }, named: true, roomy: false }],
    variants: {
      named: { false: {}, true: {} },
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
export function TwoWeeksMedium({ entry }: { entry: WidgetEntry }) {
  const roomy = useContext(WidgetSizeContext).height >= TWO_WEEKS_ROOMY;
  const named = useShiftNames();
  // A name under each mark takes the room of a smaller mark.
  let markSize = roomy ? 32 : 28;
  if (named) {
    markSize = roomy ? 26 : 20;
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
            {weekday.label}
          </span>
        ))}
      </div>
      <ol className={`${list} ${twoWeeks.grid({ named, roomy })}`}>
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
  const look = useOffLook(day, true);
  const { className, ...tile } = useOffTile(day, look.tile);
  const time = day.date.getTime();
  return (
    <li
      className={cx(twoWeeks.day({ past: time < todayTime }), className)}
      {...tile}
    >
      <SpokenDay day={day} />
      <span
        aria-hidden="true"
        className={cx(
          twoWeeks.date({ today: time === todayTime }),
          dateTone(day, todayTime),
          day.note && noted
        )}
      >
        {day.date.getDate()}
      </span>
      <DayMark day={day} faint={look.mark === "faint"} size={markSize} />
      {named && <MarkName day={day} />}
    </li>
  );
}

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
  const { with: companion } = entry.offs;
  return (
    <span className={offs.head}>
      <span className={css(oneLine)}>
        {companion ? "一緒に休める日" : "次の休み"}
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
  const number = inDays > 1;
  return (
    <span aria-hidden="true" className={offs.count} style={{ fontSize: size }}>
      {number ? inDays : inDaysWords(inDays)}
      {number && <span className={offs.unit}>日後</span>}
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
  const day = entry.today;
  const [, tomorrow] = entry.upcoming;
  const companion = entry.offs.with;
  return (
    <div className={rest.root}>
      <span className={srOnly}>{spokenOff(entry, { day, inDays: 0 })}</span>
      <PeekingDog />
      <span aria-hidden="true" className={offs.head}>
        <span className={css(oneLine)}>
          {monthDay(day.date)}({day.weekday})
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
      <span aria-hidden="true" className={rest.title}>
        {companion ? "ふたりとも\nおやすみ" : "今日は\nおやすみ"}
      </span>
      {tomorrow && (
        <span aria-hidden="true" className={rest.tomorrow}>
          明日
          <DayMark day={tomorrow} size={16} />
        </span>
      )}
    </div>
  );
}

// The next day off large: how soon, and its date and mark.
export function NextOffSmall({ entry }: { entry: WidgetEntry }) {
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
            {monthDay(next.day.date)}({next.day.weekday})
            <DayMark day={next.day} size={16} />
          </>
        ) : (
          "まだ入っていません"
        )}
      </span>
    </div>
  );
}

// The next days off, a line each: the date, its mark and how soon.
export function NextOffMedium({ entry }: { entry: WidgetEntry }) {
  const ahead = offsAhead(entry).slice(0, 3);
  return (
    <div className={offs.root}>
      <span className={srOnly}>{spokenOff(entry, ahead[0])}</span>
      <OffsHead entry={entry} />
      <ol aria-hidden="true" className={`${list} ${offs.rows}`}>
        {ahead.map(({ day, inDays }) => (
          <li className={offs.row} key={day.date.getTime()}>
            <span className={offs.rowDate}>
              {monthDay(day.date)}({day.weekday})
            </span>
            <DayMark day={day} size={18} />
            <span className={offs.rowCount}>{inDaysWords(inDays)}</span>
          </li>
        ))}
        {ahead.length === 0 && (
          <li className={cx(offs.date, offs.empty)}>まだ入っていません</li>
        )}
      </ol>
    </div>
  );
}

// ── リスト ───────────────────────────────────────────────────────────────

const listing = {
  date: cva({
    base: { fontVariantNumeric: "tabular-nums", textStyle: "subheadline" },
    variants: {
      today: {
        false: {},
        true: { color: "accent.default", fontWeight: 800 },
      },
    },
  }),
  head: css({ alignItems: "baseline", display: "flex", gap: "4px" }),
  headDate: css({
    fontSize: "22px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    lineHeight: 1.1,
  }),
  headWeekday: css({ color: "text.secondary", textStyle: "footnote" }),
  root: css({ display: "flex", flexDirection: "column", height: "100%" }),
  row: cva({
    base: {
      "&:not(:first-child)": {
        borderTop: "1px solid token(colors.separator)",
      },
      alignItems: "center",
      display: "grid",
      flex: 1,
      gap: "8px",
    },
    variants: {
      wide: {
        // The day's number, and its mark in the middle of the rest.
        false: { gridTemplateColumns: "32px 1fr", justifyItems: "start" },
        true: { gridTemplateColumns: "28px 20px 24px 1fr" },
      },
    },
  }),
  rows: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    marginTop: "8px",
  }),
  smallMark: css({ justifySelf: "center" }),
  text: css({ ...oneLine, color: "text.secondary", textStyle: "footnote" }),
  weekday: css({ textStyle: "caption1" }),
};

// What a row says after its mark, where there is room: the changed
// hours, else the memo, else the shift's name when names are shown.
function rowWords(day: WidgetDay, named: boolean) {
  return day.change ?? day.note ?? (named ? day.name : undefined);
}

function ListDays({ entry, wide }: { entry: WidgetEntry; wide: boolean }) {
  const named = useShiftNames();
  const todayTime = entry.today.date.getTime();
  const { today: first } = entry;
  return (
    <div className={listing.root}>
      <span aria-hidden="true" className={listing.head}>
        <span className={listing.headDate}>
          {first.date.getMonth() + MONTH_NUMBER}.{first.date.getDate()}
        </span>
        <span className={listing.headWeekday}>{first.weekday}</span>
      </span>
      <ol className={`${list} ${listing.rows}`}>
        {entry.upcoming.slice(0, 4).map((day) => (
          <li className={listing.row({ wide })} key={day.date.getTime()}>
            <SpokenDay day={day} />
            <span
              aria-hidden="true"
              className={cx(
                listing.date({ today: day.date.getTime() === todayTime }),
                dateTone(day, todayTime)
              )}
            >
              {day.date.getDate()}
            </span>
            {wide && (
              <span
                aria-hidden="true"
                className={cx(listing.weekday, toneText({ tone: day.tone }))}
              >
                {day.weekday}
              </span>
            )}
            <span aria-hidden="true" className={wide ? "" : listing.smallMark}>
              <DayMark day={day} size={18} />
            </span>
            {wide && (
              <span aria-hidden="true" className={listing.text}>
                {rowWords(day, named)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Today and the three days after, a line each.
export function ListSmall({ entry }: { entry: WidgetEntry }) {
  return <ListDays entry={entry} wide={false} />;
}

// The same, with each day's weekday and what it says beside the mark.
export function ListMedium({ entry }: { entry: WidgetEntry }) {
  return <ListDays entry={entry} wide />;
}

// ── カレンダー ───────────────────────────────────────────────────────────

const month = {
  // With a name under each mark, the parts of a day and the weeks close
  // up, so a month six weeks tall keeps within the widget.
  cell: cva({
    base: {
      alignItems: "center",
      borderRadius: "sm",
      display: "flex",
      flexDirection: "column",
      paddingTop: "2px",
    },
    variants: { named: { false: { gap: "2px" }, true: { gap: 0 } } },
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
  const look = useOffLook(day, false);
  const { className, ...tile } = useOffTile(day, day.inMonth && look.tile);
  if (!day.inMonth) {
    return <li aria-hidden="true" className={month.cell({ named })} />;
  }
  const marked = day.shift !== undefined && look.mark !== "none";
  return (
    <li className={cx(month.cell({ named }), className)} {...tile}>
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
      {marked ? (
        <DayMark day={day} faint={look.mark === "faint"} size={markSize} />
      ) : (
        <span style={{ height: markSize }} />
      )}
      {named && marked && <MarkName day={day} />}
    </li>
  );
}

// ── 今日（中）: the memo and 一緒に働く人 ────────────────────────────

const detail = {
  members: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    gap: "4px",
    maxWidth: "100%",
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

// Today large on the left, its memo and 一緒に働く人 beside.
export function TodayMedium({ entry }: { entry: WidgetEntry }) {
  const [, tomorrow] = entry.upcoming;
  const day = entry.today;
  // Most days have no change, memo or people: then today stands large,
  // beside tomorrow and the next day off, rather than over empty room.
  if (!(day.change || day.note || day.members.length > 0)) {
    return <PlainToday entry={entry} />;
  }
  return (
    <div className={detail.wide}>
      <DayColumn day={entry.today} label="今日" />
      <span aria-hidden="true" className={week.rule} />
      {tomorrow && <DayColumn day={tomorrow} label="明日" />}
    </div>
  );
}

const plain = {
  // Today's date large, as a desk calendar shows it, in the accent that
  // marks today everywhere, with its mark beside it.
  big: css({ alignItems: "center", display: "flex", gap: "8px" }),
  label: css({ color: "text.secondary", textStyle: "footnote" }),
  number: css({
    color: "accent.default",
    fontSize: "48px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1,
  }),
  row: css({
    "&:not(:first-child)": { borderTop: "1px solid token(colors.separator)" },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
    justifyContent: "center",
    minWidth: 0,
  }),
  rows: css({ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }),
  today: css({
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    justifyContent: "space-between",
    width: "112px",
  }),
  value: css({
    ...oneLine,
    alignItems: "center",
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    gap: "4px",
    textStyle: "subheadline",
  }),
  words: css({ ...oneLine, fontWeight: 400 }),
};

// Today on the left, its date large with its mark; on the right,
// tomorrow and the next day off, a line each.
function PlainToday({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  const [, tomorrow] = entry.upcoming;
  const [next] = entry.offs.next;
  return (
    <div className={detail.wide}>
      <div className={plain.today}>
        <span className={srOnly}>
          {monthDay(day.date)}({day.weekday}) {day.name ?? NOTHING}
          {day.time ? ` ${day.time}` : ""}
        </span>
        <span aria-hidden="true" className={today.date}>
          {day.date.getMonth() + MONTH_NUMBER}月 {day.weekday}曜日
        </span>
        <span aria-hidden="true" className={plain.big}>
          <span className={plain.number}>{day.date.getDate()}</span>
          <DayMark day={day} size={36} />
        </span>
      </div>
      <span aria-hidden="true" className={week.rule} />
      <div className={plain.rows}>
        {tomorrow && (
          <div className={plain.row}>
            <span className={plain.label}>明日</span>
            <span className={plain.value}>
              <DayMark day={tomorrow} size={18} />
              <Change className={plain.words} day={tomorrow} />
            </span>
          </div>
        )}
        <div className={plain.row}>
          <span className={plain.label}>次の休み</span>
          <span className={plain.value}>
            {next
              ? `${inDaysWords(next.inDays)}・${monthDay(next.day.date)}(${next.day.weekday})`
              : "まだ入っていません"}
          </span>
        </div>
      </div>
    </div>
  );
}

const column = {
  label: css({
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
    textStyle: "footnote",
  }),
  note: css({ ...oneLine, color: "text.secondary", textStyle: "footnote" }),
  root: css({
    alignItems: "flex-start",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  }),
  words: css({
    ...oneLine,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    maxWidth: "100%",
    textStyle: "subheadline",
  }),
};

// A day as one of a pair: when it is, its mark, then whatever it has to
// say: a change, its memo's first line and 一緒に働く人. Most days have
// none of these, and the pair still reads as today and tomorrow.
function DayColumn({ day, label }: { day: WidgetDay; label: string }) {
  return (
    <div className={column.root}>
      <span className={column.label}>
        {label} {day.date.getMonth() + MONTH_NUMBER}/{day.date.getDate()}(
        {day.weekday})
      </span>
      <DayMark day={day} size={40} />
      <Change className={column.words} day={day} />
      {day.note && <span className={column.note}>{day.note}</span>}
      {day.members.length > 0 && (
        <span className={detail.members}>
          <span className={srOnly}>一緒に働く人 {day.members.join("、")}</span>
          <Users aria-hidden="true" size={14} />
          <MemberNames key={day.members.join("・")} names={day.members} />
        </span>
      )}
    </div>
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
