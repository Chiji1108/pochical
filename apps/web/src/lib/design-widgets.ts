import {
  addDays,
  dateKey,
  isDayOff,
  timeChangeOf,
  timeRange,
} from "../components/design-calendar";
import type { Schedule } from "../components/design-calendar";
import {
  holidayName,
  monthDatesFrom,
  weekdayNames,
  weekdaysFrom,
} from "../components/design-week";
import type { DayTone, WeekSettings } from "../components/design-week";
import { patterns } from "./design-patterns";
import type { Shift } from "./design-patterns";

// What the home and lock screen widgets show, worked out ahead of time: the
// native apps' WidgetKit TimelineEntry and Glance state. The widget views
// draw only from this, never from the person's store, so they carry over
// to SwiftUI and Compose as views of the same entry. How each field is
// worked out is what the platforms share, and goes to spec/ once settled.

export type WidgetDay = {
  date: Date;
  // 日, 月, ...
  weekday: string;
  tone: DayTone;
  shift?: Shift;
  // The shift's name as the person calls it.
  name?: string;
  // A day off (休み, 有休), which the smallest month shows alone.
  off: boolean;
  // "9:00 – 18:00", when the shift has a time, and its start alone for
  // the smallest places.
  time?: string;
  start?: string;
  // 早出 and 残業, drawn on the mark's sides as in the calendar.
  early: boolean;
  late: boolean;
  note?: string;
  // 一緒に働く人 the person tagged the day with.
  members: string[];
};

export type WidgetEntry = {
  // When the entry is for; a new one starts each day at midnight.
  date: Date;
  today: WidgetDay;
  // Today and the six days after it.
  upcoming: WidgetDay[];
  // Whole weeks covering today's month, from the person's week start.
  month: {
    first: Date;
    weekdays: { label: string; tone: DayTone }[];
    days: (WidgetDay & { inMonth: boolean })[];
  };
};

const UPCOMING_DAYS = 7;
const SUNDAY = 0;
const SATURDAY = 6;

// Holidays and Sundays read red, Saturdays blue, each only while turned on.
function toneOf(date: Date, colored: WeekSettings["colored"]): DayTone {
  const day = date.getDay();
  if (
    (colored.holiday && holidayName(date)) ||
    (colored.sunday && day === SUNDAY)
  ) {
    return "holiday";
  }
  return colored.saturday && day === SATURDAY ? "saturday" : "plain";
}

function widgetDay(
  date: Date,
  schedule: Schedule,
  week: WeekSettings
): WidgetDay {
  const entry = schedule[dateKey(date)];
  const change = timeChangeOf(entry);
  const time = entry && timeRange(entry);
  return {
    date,
    early: change?.early ?? false,
    late: change?.late ?? false,
    members: entry?.members ?? [],
    name: entry && patterns[entry.shift].label,
    note: entry?.note,
    off: isDayOff(entry?.shift),
    shift: entry?.shift,
    start: time?.split(" – ")[0],
    time,
    tone: toneOf(date, week.colored),
    weekday: weekdayNames[date.getDay()] ?? "",
  };
}

export function widgetEntry(
  schedule: Schedule,
  week: WeekSettings,
  now: Date
): WidgetEntry {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = Array.from({ length: UPCOMING_DAYS }, (_, index) =>
    widgetDay(addDays(date, index), schedule, week)
  );
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return {
    date,
    month: {
      days: monthDatesFrom(first, week.weekStart).map((day) => ({
        ...widgetDay(day, schedule, week),
        inMonth: day.getMonth() === first.getMonth(),
      })),
      first,
      weekdays: weekdaysFrom(week).map(({ label, tone }) => ({ label, tone })),
    },
    today: upcoming[0] ?? widgetDay(date, schedule, week),
    upcoming,
  };
}
