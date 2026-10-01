import { widgetRules } from "@pochical/design/widgets";

import {
  holidayName,
  monthDatesFrom,
  weekDatesFrom,
  weekdayNames,
  weekdaysFrom,
} from "../components/design-week";
import type { DayTone, WeekSettings } from "../components/design-week";
import type { MarkColor } from "../components/shift-mark";
import { addDays, dateKey, timeChangeOf, timeRange } from "./design-days";
import type { Schedule } from "./design-days";
import { isDayOff } from "./design-patterns";
import type { PatternBook, Shift } from "./design-patterns";

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
  // A day off (休み, 有休), drawn on a tile as the calendar does; the
  // smallest month shows these alone.
  off: boolean;
  // The pattern's color, whose tint is a day off's tile.
  color?: MarkColor;
  // "9:00 – 18:00", when the shift has a time. Read aloud, not shown:
  // a shift's hours are the same day after day.
  time?: string;
  // What is shown instead, and only on a day whose hours differ from its
  // pattern's: "早出 7:00〜", "残業 〜20:00", both, or the new hours.
  change?: string;
  // 早出 and 残業, drawn on the mark's sides as in the calendar.
  early: boolean;
  late: boolean;
  note?: string;
  // 一緒に働く人 the person tagged the day with.
  members: string[];
};

// Someone in the person's groups whose days off 次の休み is set to meet,
// as the person picks them when editing the widget. `offOn` is whether
// they are off on a day, or undefined where they have not entered it.
export type WidgetCompanion = {
  name: string;
  photo?: string;
  offOn: (date: Date) => boolean | undefined;
};

// A day off ahead, and how many days until it.
export type WidgetOff = { day: WidgetDay; inDays: number };

export type WidgetEntry = {
  // When the entry is for; a new one starts each day at midnight.
  date: Date;
  today: WidgetDay;
  // 次の休み: whether today is off, and the next days off after it, as
  // far as they are entered. With a companion, only days both are off.
  offs: {
    with?: { name: string; photo?: string };
    today: boolean;
    next: WidgetOff[];
  };
  // Today and the six days after it.
  upcoming: WidgetDay[];
  // This week and the next, from the person's week start.
  twoWeeks: WidgetDay[];
  // Whole weeks covering today's month, from the person's week start.
  month: {
    first: Date;
    weekdays: { day: number; label: string; tone: DayTone }[];
    days: (WidgetDay & { inMonth: boolean })[];
  };
};

const UPCOMING_DAYS = 7;
const WEEK_LENGTH = 7;
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

// A day's changed hours, in words, from its time and how it moved:
// timeChangeOf says whether it moved at all, and which way.
function changeOf(
  time: string | undefined,
  moved: { early: boolean; late: boolean } | undefined
) {
  if (time === undefined || moved === undefined) {
    return undefined;
  }
  const [start = "", end = ""] = time.split(" – ");
  if (moved.early && moved.late) {
    return `早出・残業 ${start}〜${end}`;
  }
  if (moved.early) {
    return `早出 ${start}〜`;
  }
  return moved.late ? `残業 〜${end}` : `${start}〜${end}`;
}

function widgetDay(
  date: Date,
  schedule: Schedule,
  week: WeekSettings,
  book: PatternBook
): WidgetDay {
  const entry = schedule[dateKey(date)];
  const pattern = entry && book[entry.shift];
  const moved = timeChangeOf(entry, pattern);
  const time = entry && timeRange(entry, pattern);
  return {
    change: changeOf(time, moved),
    color: pattern?.color,
    date,
    early: moved?.early ?? false,
    late: moved?.late ?? false,
    members: entry?.members ?? [],
    name: pattern?.name,
    note: entry?.note,
    off: isDayOff(pattern),
    shift: entry?.shift,
    time,
    tone: toneOf(date, week.colored),
    weekday: weekdayNames[date.getDay()] ?? "",
  };
}

// A day counts as off together when the person is off and so is the
// companion; a day either has not entered does not count, since nobody
// knows yet.
function offTogether(day: WidgetDay, companion?: WidgetCompanion) {
  if (!day.off) {
    return false;
  }
  return companion ? companion.offOn(day.date) === true : true;
}

function offsFrom(
  today: WidgetDay,
  dayAt: (inDays: number) => WidgetDay,
  companion?: WidgetCompanion
): WidgetEntry["offs"] {
  const next: WidgetOff[] = [];
  for (let inDays = 1; inDays <= widgetRules.offLookaheadDays; inDays += 1) {
    const day = dayAt(inDays);
    if (offTogether(day, companion)) {
      next.push({ day, inDays });
      if (next.length === widgetRules.nextOffs) {
        break;
      }
    }
  }
  return {
    next,
    today: offTogether(today, companion),
    with: companion && { name: companion.name, photo: companion.photo },
  };
}

// `book` is the person's patterns, which name and mark each day's shift.
export function widgetEntry(
  schedule: Schedule,
  week: WeekSettings,
  now: Date,
  book: PatternBook,
  companion?: WidgetCompanion
): WidgetEntry {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = Array.from({ length: UPCOMING_DAYS }, (_, index) =>
    widgetDay(addDays(date, index), schedule, week, book)
  );
  const today = upcoming[0] ?? widgetDay(date, schedule, week, book);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const thisWeek = weekDatesFrom(date, week.weekStart);
  const twoWeeks = [
    ...thisWeek,
    ...thisWeek.map((day) => addDays(day, WEEK_LENGTH)),
  ].map((day) => widgetDay(day, schedule, week, book));
  return {
    date,
    month: {
      days: monthDatesFrom(first, week.weekStart).map((day) => ({
        ...widgetDay(day, schedule, week, book),
        inMonth: day.getMonth() === first.getMonth(),
      })),
      first,
      weekdays: weekdaysFrom(week).map(({ day, label, tone }) => ({
        day,
        label,
        tone,
      })),
    },
    offs: offsFrom(
      today,
      (inDays) => widgetDay(addDays(date, inDays), schedule, week, book),
      companion
    ),
    today,
    twoWeeks,
    upcoming,
  };
}
