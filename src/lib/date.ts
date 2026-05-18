import holidayJp from "@holiday-jp/holiday_jp";
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  getDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarHighlightTarget, WeekStartsOn } from "@/lib/app-settings";

type WeekOptions = {
  weekStartsOn: WeekStartsOn;
};

type CalendarDateHighlightColor = "blue" | "red";

/**
 * Returns an array of dates representing all days in the week containing this date.
 */
export const getWeekDates = (
  date: Date,
  { weekStartsOn }: WeekOptions
): Date[] => {
  const start = startOfWeek(date, { weekStartsOn });
  const end = endOfWeek(date, { weekStartsOn });
  return eachDayOfInterval({ start, end });
};

/**
 * Returns an array containing the first day of each week for the given month.
 */
export const getWeeksOfMonth = (
  date: Date,
  { weekStartsOn }: WeekOptions
): Date[] => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return eachWeekOfInterval({ start, end }, { weekStartsOn });
};

export const isJapaneseHoliday = (date: Date): boolean =>
  holidayJp.isHoliday(date);

export const getCalendarDateHighlightColor = (
  date: Date,
  targets: readonly CalendarHighlightTarget[]
): CalendarDateHighlightColor | undefined => {
  const day = getDay(date);

  if (targets.includes("holiday") && isJapaneseHoliday(date)) {
    return "red";
  }

  if (targets.includes("sunday") && day === 0) {
    return "red";
  }

  if (targets.includes("saturday") && day === 6) {
    return "blue";
  }

  return;
};

export const getCalendarWeekdayHighlightColor = (
  date: Date,
  targets: readonly CalendarHighlightTarget[]
): CalendarDateHighlightColor | undefined => {
  const day = getDay(date);

  if (targets.includes("sunday") && day === 0) {
    return "red";
  }

  if (targets.includes("saturday") && day === 6) {
    return "blue";
  }

  return;
};
