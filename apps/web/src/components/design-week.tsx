import { createContext, useContext } from "react";

import { holidayNames } from "../lib/holiday-names";

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

// `english` is the カレンダー page's 月と曜日 set to English, which names the
// weekdays in the headings as it does the month.
export const WeekSettingsContext = createContext<{
  week: WeekSettings;
  english?: boolean;
}>({ week: defaultWeekSettings });

export const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"] as const;
// Lowercase, as the month's English name (sep.) is.
export const englishWeekdayNames = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

// A weekday's name in a heading: 日, or sun in English.
export function weekdayNameOf(day: number, english = false) {
  return (english ? englishWeekdayNames : weekdayNames)[day] ?? "";
}

const SUNDAY = 0;
const SATURDAY = 6;
const WEEK_LENGTH = 7;

function holidayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function holidayName(date: Date) {
  return holidayNameOfKey(holidayKey(date));
}

// For dates already written as "YYYY-MM-DD".
export function holidayNameOfKey(key: string) {
  return holidayNames[key];
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

// How a day's name or number is colored, for styles that take it as a
// variant rather than the class.
export type DayTone = "holiday" | "saturday" | "plain";

function toneOf(className: string): DayTone {
  if (className === "dc-sunday") {
    return "holiday";
  }
  if (className === "dc-saturday") {
    return "saturday";
  }
  return "plain";
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

export function weekdaysFrom(week: WeekSettings, english = false) {
  return Array.from({ length: WEEK_LENGTH }, (_, index) => {
    const day = (week.weekStart + index) % WEEK_LENGTH;
    const className = weekdayClass(day, week.colored);
    return {
      className,
      day,
      label: weekdayNameOf(day, english),
      tone: toneOf(className),
    };
  });
}

export function useWeek() {
  const { week, english = false } = useContext(WeekSettingsContext);
  return {
    english,
    // A weekday's name for a heading or a day's label, in English when
    // 月と曜日 asks; sentences such as 9月24日(木) keep 日本語.
    weekdayName: (day: number) => weekdayNameOf(day, english),
    dateClass: (date: Date) => dateClass(date, week.colored),
    dateTone: (date: Date) => toneOf(dateClass(date, week.colored)),
    // Whether a date's number shows as a holiday.
    isColoredHoliday: (date: Date) =>
      week.colored.holiday && holidayName(date) !== undefined,
    monthDates: (month: Date) => monthDatesFrom(month, week.weekStart),
    weekDates: (date: Date) => weekDatesFrom(date, week.weekStart),
    weekStart: week.weekStart,
    weekdays: weekdaysFrom(week, english),
  };
}
