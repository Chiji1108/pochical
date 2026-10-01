import { useContext } from "react";
import type { CSSProperties } from "react";
import { css, cva, cx } from "styled-system/css";

import {
  dateKey,
  movesText,
  timeChangeOf,
  timeRange,
} from "../lib/design-days";
import type { DayEntry } from "../lib/design-days";
import { isDayOff, presetPatterns, usePatterns } from "../lib/design-patterns";
import type { Pattern, Shift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { dayName } from "../lib/text-limits";
import { holidayName, useWeek } from "./design-week";
import {
  CellNamesContext,
  OffDisplayContext,
  ShiftMark,
  ShiftMarkStyleContext,
  useDisplayColor,
  useOffHighlight,
} from "./shift-mark";

// Emoji marks draw in the system's emoji font wherever they sit.
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", sans-serif';

// A day of a month: its date, and its shift's mark with the name under
// it when names are shown. The group's month of one person draws its days
// with the same parts.
export const dayCell = cva({
  base: {
    "&:is(button)": { cursor: "pointer" },
    "&:is(button):active": { transform: "scale(0.94)" },
    _hover: { "&:is(button):not([data-active])": { bg: "accent.hover" } },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "md",
    display: "flex",
    flexDirection: "column",
    fontSize: "11px",
    gap: "2px",
    height: "64px",
    minWidth: 0,
    paddingBlock: "4px",
    // None at the sides, a button's own included, which browsers set
    // apart: a shift's name is centered in the same room everywhere.
    paddingInline: 0,
    position: "relative",
  },
  variants: {
    // Picked: the day being entered or opened.
    active: {
      true: {
        outline: "2px solid token(colors.accent.default)",
        outlineOffset: "-2px",
      },
    },
    // A day off in its own pattern's tint, set as --off-tint.
    off: { true: { bg: "var(--off-tint, token(colors.calendar.offTint))" } },
    // A day of the month before or after: the same day, faded whole, as on
    // the group's calendar.
    outside: { true: { opacity: 0.35 } },
    // Today, on the calendar, also has the day framed, as a grid of days
    // shows it; lighter than the picked day's frame, which wins when both
    // are on it. Drawn wholly inside the day: a frame reaching past it
    // showed as a hairline at the edge of the page beside, the pages lying
    // edge to edge.
    today: {
      true: {
        outline: "1.5px solid token(colors.accent.focus)",
        outlineOffset: "-1.5px",
      },
    },
  },
});

// Today, wherever a date is shown: the date in the accent, heavier, so
// it shows on a day off's tile too. Only its color and weight change,
// so nothing around it moves or is covered, as the weekday beside the
// date in 一覧 would be by a shape. The accent is what says today on
// every screen; each layout may add what suits it, as the calendar's
// frame round the day and 一覧's bar at the row's start.
export const todayMark = css({ color: "accent.default", fontWeight: 800 });

export const dayParts = {
  date: css({ flexShrink: 0, fontWeight: 600, lineHeight: "14px" }),
  dateOutside: css({ fontWeight: 400 }),
  holiday: css({ color: "calendar.holiday" }),
  // A shift's name under its mark, on one line: a day's row has room for
  // no more. It comes shortened by dayName; the … here is only for a
  // name of wide letters.
  label: css({
    color: "text.secondary",
    flexShrink: 0,
    fontSize: "9px",
    lineHeight: "12px",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  mark: css({
    display: "grid",
    flexShrink: 0,
    fontFamily: EMOJI_FONT,
    fontSize: "20px",
    height: "24px",
    lineHeight: 1,
    placeItems: "center",
  }),
  // Without a name under it, the mark takes the room below the date.
  markAlone: css({ flex: 1, height: "auto" }),
  // 休みの見せ方 空白, while entering or in the week view.
  markFaint: css({ opacity: 0.35 }),
  // A note: a stroke under the date, as marked in a paper diary.
  noted: css({
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
  }),
};

// The shift's mark, with 早出 and 残業 drawn on its sides.
function CellShift({
  shift,
  early = false,
  late = false,
  faint = false,
}: {
  shift: Shift;
  early?: boolean;
  late?: boolean;
  faint?: boolean;
}) {
  const book = usePatterns();
  const style = useContext(ShiftMarkStyleContext);
  const { names } = useContext(CellNamesContext);
  const withName = names[style];
  let size = style === "badge" ? 26 : 24;
  if (withName) {
    size = style === "badge" ? 22 : 21;
  }
  return (
    <>
      <span
        className={cx(
          dayParts.mark,
          !withName && dayParts.markAlone,
          faint && dayParts.markFaint
        )}
      >
        <ShiftMark early={early} late={late} shift={shift} size={size} />
      </span>
      {withName && (
        <span className={dayParts.label}>
          {dayName(book[shift]?.name ?? "")}
        </span>
      )}
    </>
  );
}

// Days off take a light tint of their own pattern color, not the theme,
// when the setting for the current look asks for it.
function dayOffStyle(dayOff: boolean, highlight: boolean, tint: string) {
  if (!(highlight && dayOff)) {
    return;
  }
  return { "--off-tint": tint } as CSSProperties;
}

// What a screen reader says after the date.
function dayDetails(
  date: Date,
  pattern: Pattern | undefined,
  entry?: DayEntry
) {
  const change = timeChangeOf(entry, pattern);
  const moves = movesText(change);
  return [
    holidayName(date) ?? "",
    pattern?.name ?? "未入力",
    change && entry
      ? `${moves || "時間変更"} ${timeRange(entry, pattern)}`
      : "",
    entry?.note ? "メモあり" : "",
  ].filter(Boolean);
}

export function DayCell({
  date,
  entry,
  outside,
  editing,
  active,
  onPress,
  plain = false,
  className,
}: {
  date: Date;
  entry: DayEntry | undefined;
  outside: boolean;
  editing: boolean;
  active: boolean;
  onPress: () => void;
  // Only the shift, for the saved image: no today frame, no note stroke.
  plain?: boolean;
  className?: string;
}) {
  const markStyle = useContext(ShiftMarkStyleContext);
  // A picture of the month keeps to the month; on screen the days around it
  // show what they hold, faded, and open like any other day.
  const blank = outside && plain;
  const shift = blank ? undefined : entry?.shift;
  const book = usePatterns();
  const pattern = shift === undefined ? undefined : book[shift];
  const highlight = useOffHighlight(markStyle);
  const { tint } = useDisplayColor(pattern?.color ?? presetPatterns.off.color);
  const offDisplay = useContext(OffDisplayContext);
  const dayOff = isDayOff(pattern);
  const hideOff = dayOff && offDisplay === "blank" && !editing;
  const faintOff =
    dayOff && (offDisplay === "faint" || (offDisplay === "blank" && editing));
  const offStyle =
    hideOff || faintOff ? undefined : dayOffStyle(dayOff, highlight, tint);
  const today = dateKey(date) === dateKey(designToday);
  const holiday = useWeek().isColoredHoliday(date);
  const change = blank ? undefined : timeChangeOf(entry, pattern);
  // A note is about the day, not the shift, so the date is marked, with a
  // stroke as in a paper diary, apart from the shift's 早出 and 残業
  // corners, and only on the person's own calendar. Other time
  // changes, a later start or an earlier end, show when the day is opened.
  const noted = !plain && Boolean(entry?.note);
  // The picked frame wins over today's.
  const cellClass = cx(
    dayCell({
      active,
      off: Boolean(offStyle),
      outside,
      today: today && !editing && !active && !plain,
    }),
    className
  );
  // Today's mark, but not in a saved picture, which is for any day.
  const onToday = today && !plain;
  const content = (
    <>
      <span
        className={cx(
          dayParts.date,
          outside && dayParts.dateOutside,
          holiday && !onToday && dayParts.holiday
        )}
      >
        <span className={cx(onToday && todayMark, noted && dayParts.noted)}>
          {date.getDate()}
        </span>
      </span>
      {shift && !hideOff && (
        <CellShift
          early={change?.early}
          faint={faintOff}
          late={change?.late}
          shift={shift}
        />
      )}
    </>
  );
  if (blank) {
    return (
      <div className={cellClass} style={offStyle}>
        {content}
      </div>
    );
  }
  const details = dayDetails(date, pattern, entry);
  return (
    <button
      aria-haspopup={editing ? undefined : "dialog"}
      aria-label={`${date.getMonth() + 1}月${date.getDate()}日、${details.join("、")}`}
      aria-pressed={editing ? active : undefined}
      className={cellClass}
      data-active={active || undefined}
      onClick={onPress}
      style={offStyle}
      type="button"
    >
      {content}
    </button>
  );
}
