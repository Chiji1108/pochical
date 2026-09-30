// The shift patterns a person can pick from. Kept apart from the calendar
// so the shift marks can read them without importing the calendar back.
// Patterns without a time are all-day, so they have no time to change.
export const patterns: Record<
  | "day"
  | "night"
  | "after"
  | "off"
  | "early"
  | "late"
  | "training"
  | "paid"
  | "duty"
  | "offDuty"
  | "evening"
  | "junya"
  | "midnight",
  { label: string; emoji: string; time?: readonly [string, string] }
> = {
  after: { emoji: "🌅", label: "明け" },
  day: { emoji: "☀️", label: "日勤", time: ["09:00", "18:00"] },
  duty: { emoji: "🚒", label: "当番", time: ["08:30", "08:30"] },
  early: { emoji: "🌤️", label: "早番", time: ["07:00", "16:00"] },
  evening: { emoji: "🌆", label: "夕勤", time: ["15:00", "23:00"] },
  junya: { emoji: "🌜", label: "準夜", time: ["16:30", "01:00"] },
  late: { emoji: "🌇", label: "遅番", time: ["12:00", "21:00"] },
  midnight: { emoji: "🌛", label: "深夜", time: ["00:00", "08:30"] },
  night: { emoji: "🌙", label: "夜勤", time: ["16:30", "09:30"] },
  off: { emoji: "🌿", label: "休み" },
  offDuty: { emoji: "🛌", label: "非番" },
  paid: { emoji: "🌷", label: "有休" },
  training: { emoji: "📚", label: "研修", time: ["09:30", "17:30"] },
};
export type Shift = keyof typeof patterns;

// As many patterns as the input buttons hold on one page, in two rows of
// five, so they fit under a month six weeks tall. More go on to further
// pages, in the order the person puts them.
export const PATTERNS_PER_PAGE = 10;
