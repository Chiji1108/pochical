import {
  addDays,
  clockOf,
  dateKey,
  formatDay,
  movesText,
  timeChangeOf,
  timeRange,
} from "./design-days";
import type { DayEntry, Schedule } from "./design-days";
import type { PatternBook, Pattern, Shift } from "./design-patterns";
import { designToday } from "./design-today";

// Reminders of the person's own shifts, as the native apps schedule them
// with local notifications: kept on the device, like alarms, several at
// once, each on or off. A reminder goes off the evening before a day with
// a shift (前日), or some time before the shift starts (開始前), which
// only days with a time have. Like an alarm's days, each picks the shifts
// it goes off for: it keeps the ones it skips, so a pattern added later is
// reminded of until it is turned off.
export type Reminder = { id: string; on: boolean; skip: Shift[] } & (
  | { kind: "dayBefore"; time: string }
  | { kind: "beforeStart"; minutes: number }
);

export type ReminderKind = Reminder["kind"];

export const defaultReminders: Reminder[] = [
  { id: "reminder-0", kind: "dayBefore", on: true, skip: [], time: "21:00" },
];

export const defaultDayBeforeTime = "21:00";
export const defaultBeforeMinutes = 60;

const minutesPerHour = 60;

// How long before, as the platforms' alert choices write it.
// The patterns a reminder can go off for: every one the evening before,
// only those with a time before they start.
export function remindable(kind: ReminderKind, patterns: readonly Pattern[]) {
  return kind === "dayBefore"
    ? patterns
    : patterns.filter((pattern) => pattern.time !== undefined);
}

export const beforeStartOptions = [15, 30, 60, 90, 120, 180] as const;

export function beforeText(minutes: number) {
  const hours = Math.floor(minutes / minutesPerHour);
  const rest = minutes % minutesPerHour;
  if (hours === 0) {
    return `${rest}分`;
  }
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

export function reminderName(reminder: Reminder) {
  return reminder.kind === "dayBefore"
    ? `前日 ${reminder.time.replace(leadingZero, "")}`
    : `開始の${beforeText(reminder.minutes)}前`;
}

const leadingZero = /^0/u;

// /design's "now": the sample today at noon, so the evening's reminder for
// tomorrow is still to come.
const NOON = 12;
const designNow = new Date(
  designToday.getFullYear(),
  designToday.getMonth(),
  designToday.getDate(),
  NOON
);

// How far ahead to look for the next day a reminder goes off.
const lookAhead = 60;

function at(date: Date, time: string) {
  const { hours, minutes } = clockOf(time);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes
  );
}

export type Firing = {
  // When the notification arrives.
  when: Date;
  // The day it is about, its shift and that shift's pattern.
  date: Date;
  entry: DayEntry;
  pattern: Pattern;
};

// When a reminder goes off for a day, if it does: for a shift it does not
// skip, 前日 on every day with one, days off included, and 開始前 only
// for a shift with a time.
function firingFor(
  reminder: Reminder,
  date: Date,
  entry: DayEntry,
  pattern: Pattern
): Date | undefined {
  if (reminder.skip.includes(entry.shift)) {
    return;
  }
  if (reminder.kind === "dayBefore") {
    return at(addDays(date, -1), reminder.time);
  }
  const start = entry.start ?? pattern.time?.[0];
  if (!start) {
    return;
  }
  const begins = at(date, start);
  return new Date(begins.getTime() - reminder.minutes * 60_000);
}

// The next notification a reminder sends from now, on the person's
// schedule, if any day ahead has one.
export function nextFiring(
  reminder: Reminder,
  schedule: Schedule,
  book: PatternBook
): Firing | undefined {
  // From today, since 開始前 of today's shift may still be ahead.
  for (let offset = 0; offset <= lookAhead; offset += 1) {
    const date = addDays(designToday, offset);
    const entry = schedule[dateKey(date)];
    const pattern = entry && book[entry.shift];
    if (!entry || !pattern) {
      continue;
    }
    const when = firingFor(reminder, date, entry, pattern);
    if (when && when >= designNow) {
      return { date, entry, pattern, when };
    }
  }
}

export function clockText(date: Date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// When it arrives, as a row says it: 9月24日(木) 21:00.
export function firingText(when: Date) {
  return `${formatDay(when)} ${clockText(when)}`;
}

// The shift by name, with the day's own 早出 or 残業 always said, as the
// calendar marks them: the time alone looks like any other day's.
export function shiftText({
  entry,
  pattern,
}: Pick<Firing, "entry" | "pattern">) {
  const moves = movesText(timeChangeOf(entry, pattern));
  return moves ? `${pattern.name}（${moves}）` : pattern.name;
}

// What the notification says: the shift as its title, and its time.
export function notificationText(
  reminder: Reminder,
  { entry, pattern }: Pick<Firing, "entry" | "pattern">
) {
  const time = timeRange(entry, pattern);
  const shift = shiftText({ entry, pattern });
  const title =
    reminder.kind === "dayBefore"
      ? `明日は${shift}`
      : `あと${beforeText(reminder.minutes)}で${shift}`;
  return { body: time, title };
}
