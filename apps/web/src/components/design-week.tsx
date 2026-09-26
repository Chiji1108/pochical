import holidayJp from "@holiday-jp/holiday_jp";
import { createContext, useContext } from "react";

// 週の始まり and 色をつける日 from settings. They are the viewer's own and
// shape every calendar and group view on their screen; members never see
// them.

export type ColoredDay = "saturday" | "sunday" | "holiday";

export type WeekSettings = {
  weekStart: number;
  colored: Record<ColoredDay, boolean>;
};

export const defaultWeekSettings: WeekSettings = {
  colored: { holiday: true, saturday: true, sunday: true },
  weekStart: 0,
};

export const WeekSettingsContext = createContext<{
  week: WeekSettings;
  setWeek?: (week: WeekSettings) => void;
}>({ week: defaultWeekSettings });

export const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"] as const;

const SUNDAY = 0;
const SATURDAY = 6;
const WEEK_LENGTH = 7;

const holidays: Record<string, { name: string } | undefined> =
  holidayJp.holidays;

function holidayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function holidayName(date: Date) {
  return holidayNameOfKey(holidayKey(date));
}

// For dates already written as "YYYY-MM-DD".
export function holidayNameOfKey(key: string) {
  return holidays[key]?.name;
}

// Sundays read red and Saturdays blue, each only while it is turned on.
function weekdayClass(day: number, colored: WeekSettings["colored"]) {
  if (day === SUNDAY && colored.sunday) {
    return "dc-sunday";
  }
  if (day === SATURDAY && colored.saturday) {
    return "dc-saturday";
  }
  return "";
}

// A national holiday takes Sunday's red, whatever day it falls on.
function dateClass(date: Date, colored: WeekSettings["colored"]) {
  if (colored.holiday && holidayName(date)) {
    return "dc-sunday";
  }
  return weekdayClass(date.getDay(), colored);
}

// Days from the week start on or before `date`.
function daysIntoWeek(date: Date, weekStart: number) {
  return (date.getDay() - weekStart + WEEK_LENGTH) % WEEK_LENGTH;
}

export function weekDatesFrom(date: Date, weekStart: number) {
  const offset = daysIntoWeek(date, weekStart);
  return Array.from(
    { length: WEEK_LENGTH },
    (_, index) =>
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - offset + index
      )
  );
}

// Whole weeks covering the month.
export function monthDatesFrom(month: Date, weekStart: number) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  const offset = daysIntoWeek(first, weekStart);
  return Array.from(
    { length: Math.ceil((offset + count) / WEEK_LENGTH) * WEEK_LENGTH },
    (_, index) =>
      new Date(month.getFullYear(), month.getMonth(), index - offset + 1)
  );
}

export function weekdaysFrom(week: WeekSettings) {
  return Array.from({ length: WEEK_LENGTH }, (_, index) => {
    const day = (week.weekStart + index) % WEEK_LENGTH;
    return {
      className: weekdayClass(day, week.colored),
      day,
      label: weekdayNames[day] ?? "",
    };
  });
}

export function useWeek() {
  const { week } = useContext(WeekSettingsContext);
  return {
    dateClass: (date: Date) => dateClass(date, week.colored),
    // Whether a date's number shows as a holiday.
    isColoredHoliday: (date: Date) =>
      week.colored.holiday && holidayName(date) !== undefined,
    monthDates: (month: Date) => monthDatesFrom(month, week.weekStart),
    weekDates: (date: Date) => weekDatesFrom(date, week.weekStart),
    weekdays: weekdaysFrom(week),
  };
}
