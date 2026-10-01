import { holidayName } from "../components/design-week";
import { isDayOff } from "./design-patterns";
import type {
  Pattern,
  PatternBook,
  PresetShift,
  Shift,
} from "./design-patterns";

export type DayEntry = {
  shift: Shift;
  // Set only when the time differs from the pattern's standard time.
  start?: string;
  end?: string;
  note?: string;
  members?: string[];
};
export type Schedule = Record<string, DayEntry | undefined>;
// A repeating order of shifts; `start` is the first day of the sequence and
// the day the rule takes over from the one before it.
// `holidaysOff` turns national holidays into 休み, for people off on them.
// `anchor` is a day that falls on the first shift of the sequence, when
// that is not `start` itself.
export type RepeatRule = {
  sequence: Shift[];
  start: Date;
  anchor?: Date;
  holidaysOff?: boolean;
  // The pattern it put on holidays, so turning them back finds those days
  // even after the person's patterns have changed.
  holidayShift?: Shift;
};

// What a rule fills in from its start, a year ahead, with holidays on
// `holidayShift` when there is one.
export function ruleSchedule(rule: RepeatRule, holidayShift?: Shift) {
  const { sequence, start } = rule;
  return repeatSchedule(
    sequence,
    rule.anchor ?? start,
    start,
    ruleEnd(start),
    holidayShift
  );
}
export type PatternCount = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
const eight: PresetShift[] = [
  "early",
  "day",
  "late",
  "night",
  "after",
  "off",
  "training",
  "paid",
];
export const patternSets: Record<PatternCount, PresetShift[]> = {
  10: [...eight, "junya", "midnight"],
  11: [...eight, "junya", "midnight", "offDuty"],
  12: [...eight, "junya", "midnight", "offDuty", "evening"],
  13: [...eight, "junya", "midnight", "offDuty", "evening", "duty"],
  4: ["day", "night", "after", "off"],
  5: ["early", "day", "night", "after", "off"],
  6: ["early", "day", "late", "night", "after", "off"],
  7: eight.slice(0, 7),
  8: eight,
  9: [...eight, "junya"],
};
export const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const dayMilliseconds = 86_400_000;
const leadingZeroPattern = /^0/;
const sample: PresetShift[] = [
  "day",
  "day",
  "night",
  "after",
  "off",
  "off",
  "day",
  "day",
  "night",
  "after",
  "off",
  "day",
  "day",
  "off",
  "night",
  "after",
  "off",
  "day",
  "day",
  "day",
  "off",
  "night",
  "after",
  "off",
  "day",
  "day",
  "off",
  "night",
  "after",
  "off",
];

// The last rule decides; an empty sequence means back to a roster.
export function isRepeating(rules: RepeatRule[]) {
  return (rules.at(-1)?.sequence.length ?? 0) > 0;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// A week with 休み on a weekend day reads as office hours, which usually
// have national holidays off too.
export function defaultHolidaysOff(
  sequence: Shift[],
  start: Date,
  book: PatternBook
) {
  const weekLength = 7;
  if (sequence.length !== weekLength) {
    return false;
  }
  return sequence.some((shift, index) => {
    const day = addDays(start, index).getDay();
    return isDayOff(book[shift]) && (day === 0 || day === 6);
  });
}

// What a holiday becomes for someone off on them: their first pattern
// that counts as a day off, which is 休み unless they put another first.
export function holidayShiftOf(patterns: readonly Pattern[]) {
  return patterns.find((pattern) => pattern.countsAsOff)?.id;
}

const sampleDetails: Record<string, Omit<DayEntry, "shift">> = {
  "2026-09-08": { end: "20:00", note: "棚卸し" },
  "2026-09-19": { members: ["田中", "山本"], start: "08:00" },
  "2026-09-25": { end: "20:00" },
  "2026-09-26": { note: "新人さん同行" },
};

function sampleShift(patternCount: PatternCount, index: number): PresetShift {
  if (patternCount >= 7) {
    return patternSets[patternCount][index % patternCount];
  }
  const shift = sample[index % sample.length];
  if (shift === "day" && patternCount > 4 && index % 2 === 0) {
    return "early";
  }
  if (shift === "day" && patternCount === 6) {
    return "late";
  }
  return shift;
}

export function initialDesignSchedule(
  patternCount: PatternCount = 4,
  month = 8,
  year = 2026
): Schedule {
  const count = new Date(year, month + 1, 0).getDate();
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const key = dateKey(new Date(year, month, index + 1));
      return [
        key,
        { shift: sampleShift(patternCount, index), ...sampleDetails[key] },
      ];
    })
  );
}

// Lays a repeating sequence over [from, to], counting from the anchor day so
// days before the anchor line up too.
// Repeating shifts are filled in a year ahead.
function ruleEnd(start: Date) {
  return new Date(start.getFullYear(), start.getMonth() + 13, 0);
}

export function repeatSchedule(
  sequence: Shift[],
  anchor: Date,
  from: Date,
  to: Date,
  holidayShift?: Shift
): Schedule {
  const schedule: Schedule = {};
  const anchorTime = Date.UTC(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate()
  );
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const offset = Math.round(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
        anchorTime) /
        dayMilliseconds
    );
    const index =
      ((offset % sequence.length) + sequence.length) % sequence.length;
    const shift = sequence[index];
    schedule[dateKey(date)] = {
      shift: holidayShift && holidayName(date) ? holidayShift : shift,
    };
  }
  return schedule;
}

export function keepDetails(
  entry: DayEntry | undefined,
  shift: Shift
): DayEntry {
  if (entry?.shift === shift) {
    return entry;
  }
  return { members: entry?.members, note: entry?.note, shift };
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function formatDay(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
}

function formatTime(time: string) {
  return time.replace(leadingZeroPattern, "");
}

// The day's time, its own where it was changed, or its pattern's.
export function timeRange(entry: DayEntry, pattern: Pattern | undefined) {
  const time = pattern?.time;
  if (!time) {
    return;
  }
  const start = entry.start ?? time[0];
  const end = entry.end ?? time[1];
  return `${formatTime(start)} – ${end <= start ? "翌" : ""}${formatTime(end)}`;
}

const minutesPerDay = 1440;
const minutesPerHour = 60;
const halfDay = minutesPerDay / 2;

function minutesOf(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * minutesPerHour + minutes;
}

// How a day's time moved from its pattern's: starting earlier is 早出 and
// ending later is 残業, the two people most need to see on the month.
// Other moves, a later start or an earlier end, are only "changed". Times
// are counted from the standard start, so a night shift's end the next
// morning, or a start the evening before, compares the right way.
export function timeChangeOf(
  entry: DayEntry | undefined,
  pattern: Pattern | undefined
) {
  const time = entry && pattern?.time;
  if (!(entry && time && (entry.start || entry.end))) {
    return;
  }
  const standardStart = minutesOf(time[0]);
  const fromStart = (clock: string) => {
    const offset = minutesOf(clock) - standardStart;
    if (offset > halfDay) {
      return offset - minutesPerDay;
    }
    return offset < -halfDay ? offset + minutesPerDay : offset;
  };
  const endOf = (clock: string) => {
    const offset = minutesOf(clock) - standardStart;
    return offset <= 0 ? offset + minutesPerDay : offset;
  };
  const early = entry.start !== undefined && fromStart(entry.start) < 0;
  const late = entry.end !== undefined && endOf(entry.end) > endOf(time[1]);
  return { early, late };
}

// 早出 and 残業 as words, like 早出・残業; empty when neither.
export function movesText(
  change: { early: boolean; late: boolean } | undefined
) {
  if (!change) {
    return "";
  }
  return [change.early ? "早出" : "", change.late ? "残業" : ""]
    .filter(Boolean)
    .join("・");
}
