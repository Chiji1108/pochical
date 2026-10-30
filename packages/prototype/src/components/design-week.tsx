import { createContext, useContext } from "react";

import { fallbackHolidayCountry, holidays } from "../lib/holiday-names";

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
// English weekdays come in two lengths: one letter over a column of days,
// where the column's place tells T from T, as calendars head their weeks;
// three letters beside a date, where nothing else tells them apart, even
// down a list of days read row by row, written as other apps write them
// there (9/24 Thu), as the months are Sep.
export const englishWeekdayLetters = [
  "S",
  "M",
  "T",
  "W",
  "T",
  "F",
  "S",
] as const;
export const englishWeekdayNames = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

// A weekday beside a date: 木, or Thu in English.
export function weekdayNameOf(day: number, english = false) {
  return (english ? englishWeekdayNames : weekdayNames)[day] ?? "";
}

// A weekday over a column of days: 木, or T in English.
export function weekdayLetterOf(day: number, english = false) {
  return (english ? englishWeekdayLetters : weekdayNames)[day] ?? "";
}

// A weekday over a column that does not start the week, as the hub's run
// from today: 木, or THU in English.
export function weekdayHeadOf(day: number, english = false) {
  return english
    ? (englishWeekdayNames[day] ?? "").toUpperCase()
    : (weekdayNames[day] ?? "");
}

const SUNDAY = 0;
const SATURDAY = 6;
export const weekLength = 7;

// A day as days and holidays are kept: "YYYY-MM-DD", in local time.
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function holidayName(date: Date) {
  return holidayNameOfKey(dateKey(date));
}

// The country whose holidays the prototype's days take: the apps take
// their device's region when it has them (spec/calendar.md, Holidays), and
// /design is shown as in Japan.
const holidayCountry = fallbackHolidayCountry;

// For dates already written as "YYYY-MM-DD".
export function holidayNameOfKey(key: string) {
  return holidays[holidayCountry]?.[key];
}

// How a day's name or number is colored, for styles that take it as a
// variant rather than the class.
export type DayTone = "holiday" | "saturday" | "plain";

// How `day` (0 for Sunday) is colored as 色をつける日 has it: Sundays and,
// given `holiday`, national holidays whatever day they fall on in Sunday's
// red, Saturdays blue, each only while turned on (spec/vectors/month.json,
// tones). A weekday's name over a column is never a holiday.
export function dayToneOf(
  day: number,
  holiday: boolean,
  colored: WeekSettings["colored"]
): DayTone {
  if ((holiday && colored.holiday) || (day === SUNDAY && colored.sunday)) {
    return "holiday";
  }
  if (day === SATURDAY && colored.saturday) {
    return "saturday";
  }
  return "plain";
}

const toneClasses = {
  holiday: "dc-sunday",
  plain: "",
  saturday: "dc-saturday",
} as const satisfies Record<DayTone, string>;

// How a date's number is colored, for those that take it as a variant: a
// holiday or a Sunday red, a Saturday blue, each only while turned on.
export function dateToneOf(date: Date, colored: WeekSettings["colored"]) {
  return dayToneOf(date.getDay(), holidayName(date) !== undefined, colored);
}

function dateClass(date: Date, colored: WeekSettings["colored"]) {
  return toneClasses[dateToneOf(date, colored)];
}

// The weekday over a page's `column`, from the week's start
// (spec/vectors/month.json, columns).
export function weekdayAt(weekStart: number, column: number) {
  return (weekStart + column) % weekLength;
}

// Days from the week start on or before `date`.
function daysIntoWeek(date: Date, weekStart: number) {
  return (date.getDay() - weekStart + weekLength) % weekLength;
}

export function weekDatesFrom(date: Date, weekStart: number) {
  const offset = daysIntoWeek(date, weekStart);
  return Array.from(
    { length: weekLength },
    (_, index) =>
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - offset + index
      )
  );
}

// Whole weeks covering a page's days, a month's or a シフトの期間's
// (spec/calendar.md, The shift period).
// design-days' Period, which imports from here.
export function periodDatesFrom(
  { first, last }: { first: Date; last: Date },
  weekStart: number
) {
  const offset = daysIntoWeek(first, weekStart);
  const dayOf = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const count = (dayOf(last) - dayOf(first)) / 86_400_000 + 1;
  return Array.from(
    { length: Math.ceil((offset + count) / weekLength) * weekLength },
    (_, index) =>
      new Date(
        first.getFullYear(),
        first.getMonth(),
        first.getDate() + index - offset
      )
  );
}

// Whole weeks covering the month.
export function monthDatesFrom(month: Date, weekStart: number) {
  return periodDatesFrom(
    {
      first: new Date(month.getFullYear(), month.getMonth(), 1),
      last: new Date(month.getFullYear(), month.getMonth() + 1, 0),
    },
    weekStart
  );
}

export function weekdaysFrom(week: WeekSettings, english = false) {
  return Array.from({ length: weekLength }, (_, index) => {
    const day = weekdayAt(week.weekStart, index);
    const tone = dayToneOf(day, false, week.colored);
    return {
      className: toneClasses[tone],
      day,
      label: weekdayLetterOf(day, english),
      tone,
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
    // The same over a column of days, as the week's headings.
    weekdayLetter: (day: number) => weekdayLetterOf(day, english),
    dateClass: (date: Date) => dateClass(date, week.colored),
    dateTone: (date: Date) => dateToneOf(date, week.colored),
    // Whether a date's number shows as a holiday.
    isColoredHoliday: (date: Date) =>
      week.colored.holiday && holidayName(date) !== undefined,
    monthDates: (month: Date) => monthDatesFrom(month, week.weekStart),
    weekDates: (date: Date) => weekDatesFrom(date, week.weekStart),
    weekStart: week.weekStart,
    weekdays: weekdaysFrom(week, english),
  };
}
