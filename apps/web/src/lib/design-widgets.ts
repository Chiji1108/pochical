import { widgetRules } from "@pochical/design/widgets";

import type { GroupMark } from "../components/design-group-data";
import {
  dateToneOf,
  holidayName,
  monthDatesFrom,
  weekDatesFrom,
  weekLength,
  weekdayNames,
  weekdaysFrom,
} from "../components/design-week";
import type { DayTone, WeekSettings } from "../components/design-week";
import type { Look, LookSettings, MarkColor } from "../components/shift-mark";
import { addDays, dateKey, timeChangeOf, timeRange } from "./design-days";
import type { Schedule } from "./design-days";
import { isDayOff } from "./design-patterns";
import type { PatternBook, Shift } from "./design-patterns";
import { allOff, mayAllBeOff } from "./together";

// What the home and lock screen widgets show, worked out ahead of time: the
// native apps' WidgetKit TimelineEntry and Glance state. The widget views
// draw only from this, never from the person's store, so they carry over
// to SwiftUI and Compose as views of the same entry. How each field is
// worked out is what the platforms share (spec/widgets.md), pinned by
// spec/vectors/widgets.json.

export type WidgetDay = {
  date: Date;
  // 日, 月, ...
  weekday: string;
  tone: DayTone;
  // A national holiday while 祝日 coloring is on: the one date a grid of
  // days colors, as the calendar does; Sundays and Saturdays are colored
  // in the weekdays over it instead.
  holiday: boolean;
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
  // pattern's: "早出 7:00〜", "残業 〜20:00", or the hours alone where
  // both moved and for new hours.
  change?: string;
  // 早出 and 残業, drawn on the mark's sides as in the calendar.
  early: boolean;
  late: boolean;
  // Whether the day has a memo, which the calendar's stroke under its date
  // says. Its words, like 一緒に働く人, stay with their owner: an entry
  // never carries them.
  noted: boolean;
};

// Another person's day, as their own pattern has it: its look, name and
// hours, and whether it is a day off. Undefined where they have not
// entered it.
export type WidgetPersonDay = {
  look: Look;
  name: string;
  time?: string;
  off: boolean;
  early: boolean;
  late: boolean;
};

// Someone in the person's groups: their face, the shape they draw their
// marks in, and their days.
export type WidgetPerson = {
  name: string;
  photo?: string;
  style?: LookSettings;
  dayOn: (date: Date) => WidgetPersonDay | undefined;
};

// Who a widget is set to, as the person picks when editing it: someone
// (次の休み and これから) or a whole group (次の休み).
export type WidgetCompanion =
  | { kind: "person"; person: WidgetPerson }
  | { kind: "group"; name: string; mark: GroupMark; people: WidgetPerson[] };

// A day off ahead, and how many days until it.
export type WidgetOff = { day: WidgetDay; inDays: number };

// Why no day off is ahead: the person has entered none; days are off for
// them but someone has not entered those days yet; or what is entered
// never meets.
export type WidgetNoOff =
  | { kind: "notEntered" }
  | { kind: "waiting"; names: string[] }
  | { kind: "apart" };

// これから with someone: the days of `upcoming`, theirs beside each, and
// whether both are off.
export type WidgetPair = {
  me: { name: string; photo?: string };
  with: { name: string; photo?: string; style?: LookSettings };
  days: { theirs?: WidgetPersonDay; together: boolean }[];
};

export type WidgetEntry = {
  // When the entry is for; a new one starts each day at midnight.
  date: Date;
  today: WidgetDay;
  // 次の休み: whether today is off, and the next day off after it, as far
  // as days are entered. With a companion, only days both are off.
  offs: {
    with?:
      | { kind: "person"; name: string; photo?: string }
      | { kind: "group"; name: string; mark: GroupMark };
    today: boolean;
    next?: WidgetOff;
    // Only when nothing is ahead, today included.
    none?: WidgetNoOff;
  };
  // これから set to someone.
  pair?: WidgetPair;
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

// A day's changed hours, in words, from its time and how it moved:
// timeChangeOf says whether it moved at all, and which way. Where both
// ends moved, the hours alone, so they keep to one line: the mark's
// corners say 早出 and 残業.
function changeOf(
  time: string | undefined,
  moved: { early: boolean; late: boolean } | undefined
) {
  if (time === undefined || moved === undefined) {
    return undefined;
  }
  const [start = "", end = ""] = time.split(" – ");
  if (moved.early !== moved.late) {
    return moved.early ? `早出 ${start}〜` : `残業 〜${end}`;
  }
  return `${start}〜${end}`;
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
    holiday: week.colored.holiday && holidayName(date) !== undefined,
    late: moved?.late ?? false,
    name: pattern?.name,
    noted: Boolean(entry?.note),
    off: isDayOff(pattern),
    shift: entry?.shift,
    time,
    tone: dateToneOf(date, week.colored),
    weekday: weekdayNames[date.getDay()] ?? "",
  };
}

function peopleOf(companion?: WidgetCompanion): WidgetPerson[] {
  if (!companion) {
    return [];
  }
  return companion.kind === "person" ? [companion.person] : companion.people;
}

// Whether each of those picked is off on the day, undefined where they
// have not entered it.
function theirOffs(day: WidgetDay, people: WidgetPerson[]) {
  return people.map((one) => one.dayOn(day.date)?.off);
}

// A day counts as off together when the person is off and so is everyone
// they picked, as みんな休み is counted in a group.
function offTogether(day: WidgetDay, people: WidgetPerson[]) {
  const mine = day.shift === undefined ? undefined : day.off;
  return allOff([mine, ...theirOffs(day, people)]);
}

// Those who have not entered a day the person is off and no one who has
// entered it works: the day may yet be off together.
function waitingOn(day: WidgetDay, people: WidgetPerson[]) {
  const theirs = theirOffs(day, people);
  if (!(day.off && mayAllBeOff(theirs))) {
    return [];
  }
  return people.filter((_, index) => theirs[index] === undefined);
}

function noOffOf(
  days: WidgetDay[],
  people: WidgetPerson[]
): WidgetNoOff | undefined {
  const waiting = new Set<string>();
  for (const day of days) {
    for (const one of waitingOn(day, people)) {
      waiting.add(one.name);
    }
  }
  if (waiting.size > 0) {
    return { kind: "waiting", names: [...waiting] };
  }
  const entered = days.some((day) => day.shift !== undefined);
  return entered && people.length > 0
    ? { kind: "apart" }
    : { kind: "notEntered" };
}

function offsFrom(
  today: WidgetDay,
  dayAt: (inDays: number) => WidgetDay,
  companion?: WidgetCompanion
): WidgetEntry["offs"] {
  const people = peopleOf(companion);
  const looked = [today];
  let next: WidgetOff | undefined;
  for (let inDays = 1; inDays <= widgetRules.offLookaheadDays; inDays += 1) {
    const day = dayAt(inDays);
    looked.push(day);
    if (offTogether(day, people)) {
      next = { day, inDays };
      break;
    }
  }
  const offToday = offTogether(today, people);
  const nothing = next === undefined && !offToday;
  return {
    next,
    none: nothing ? noOffOf(looked, people) : undefined,
    today: offToday,
    with: companion && withOf(companion),
  };
}

function withOf(companion: WidgetCompanion) {
  if (companion.kind === "group") {
    const { name, mark } = companion;
    return { kind: "group", mark, name } as const;
  }
  const { name, photo } = companion.person;
  return { kind: "person", name, photo } as const;
}

function pairOf(
  upcoming: WidgetDay[],
  companion: WidgetCompanion | undefined,
  me: { name: string; photo?: string }
): WidgetPair | undefined {
  if (companion?.kind !== "person") {
    return undefined;
  }
  const { person } = companion;
  return {
    days: upcoming.map((day) => {
      const theirs = person.dayOn(day.date);
      return { theirs, together: day.off && theirs?.off === true };
    }),
    me,
    with: { name: person.name, photo: person.photo, style: person.style },
  };
}

// `book` is the person's patterns, which name and mark each day's shift;
// `me` is their face, beside someone else's in これから.
export function widgetEntry(
  schedule: Schedule,
  week: WeekSettings,
  now: Date,
  book: PatternBook,
  {
    companion,
    me = { name: "自分" },
  }: { companion?: WidgetCompanion; me?: { name: string; photo?: string } } = {}
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
    ...thisWeek.map((day) => addDays(day, weekLength)),
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
    pair: pairOf(upcoming, companion, me),
    today,
    twoWeeks,
    upcoming,
  };
}
