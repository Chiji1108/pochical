import { css, cva } from "styled-system/css";

import { useWeek } from "./design-week";
import type { DayTone } from "./design-week";

// The grid of a week's days and the weekdays over it.

// A month's days, a week to a row, as the calendar, a member's month, the
// saved image and the look preview draw them; as many rows as the days
// given make. The sizes are numbers too, for a grid that animates its
// height.
export const DAY_ROW_HEIGHT = 64;
export const DAY_ROW_GAP = 4;
const weekColumns = "repeat(7, minmax(0, 1fr))";
export const dayGrid = css({
  display: "grid",
  gap: `${DAY_ROW_GAP}px`,
  gridAutoRows: `${DAY_ROW_HEIGHT}px`,
  gridTemplateColumns: weekColumns,
});
export function dayGridHeight(weeks: number) {
  return weeks * DAY_ROW_HEIGHT + (weeks - 1) * DAY_ROW_GAP;
}
// A month keeps room for six weeks, the most one spans, so a month of six
// comes in whole when swiped to from one of four or five, and what is
// under it stays put as the months turn.
export const MONTH_WEEKS = 6;

const weekdayRow = cva({
  base: {
    color: "text.tertiary",
    display: "grid",
    fontSize: "11px",
    gridTemplateColumns: weekColumns,
    // The line 日 gives it, for S too: left to the font, letters stand
    // 3px shorter than kanji, and the month under them moved with 月と曜日.
    lineHeight: 1.5,
    paddingBottom: "12px",
    textAlign: "center",
  },
  variants: {
    // Tighter over a small picture of the calendar.
    compact: { true: { paddingBottom: "8px" } },
  },
});
const weekdayTone: Record<DayTone, string | undefined> = {
  holiday: css({ color: "calendar.holiday" }),
  plain: undefined,
  saturday: css({ color: "calendar.saturday" }),
};

// The weekday names over a DayGrid, from the viewer's week start, Sundays
// and Saturdays in their colors while those are on. Screen readers hear
// each day's own label instead.
export function WeekdayRow({ compact = false }: { compact?: boolean }) {
  const { weekdays } = useWeek();
  return (
    <div aria-hidden="true" className={weekdayRow({ compact })}>
      {weekdays.map((day) => (
        <span className={weekdayTone[day.tone]} key={day.day}>
          {day.label}
        </span>
      ))}
    </div>
  );
}
