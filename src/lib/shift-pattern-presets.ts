import { id } from "@instantdb/react-native";
import { db } from "@/lib/instant";

type TimeTuple = [hour: number, minute: number];

export type ShiftPatternPresetId =
  | "ake"
  | "day"
  | "day-off"
  | "early"
  | "late"
  | "long-day"
  | "medical-two-shift"
  | "medical-three-shift"
  | "midnight"
  | "night"
  | "on-call"
  | "care-worker"
  | "paid-leave"
  | "semi-night"
  | "training";

export type ShiftPatternPresetPattern = {
  countsAsDayOff?: boolean;
  emoji: string;
  end?: TimeTuple;
  isAllDay?: boolean;
  name: string;
  nextDayPatternName?: string;
  start?: TimeTuple;
};

export type ShiftPatternPreset = {
  id: ShiftPatternPresetId;
  patterns: ShiftPatternPresetPattern[];
  title: string;
};

type PatternInsert = {
  countsAsDayOff: boolean;
  emoji: string;
  endDate?: Date;
  isAllDay: boolean;
  name: string;
  orderIndex: number;
  startDate?: Date;
};

const createPresetTime = ([hour, minute]: TimeTuple): Date => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const createPatternInsert = (
  pattern: ShiftPatternPresetPattern,
  orderIndex: number
): PatternInsert => {
  const insert: PatternInsert = {
    countsAsDayOff: pattern.countsAsDayOff ?? false,
    emoji: pattern.emoji,
    isAllDay: pattern.isAllDay ?? false,
    name: pattern.name,
    orderIndex,
  };

  if (pattern.end) {
    insert.endDate = createPresetTime(pattern.end);
  }

  if (pattern.start) {
    insert.startDate = createPresetTime(pattern.start);
  }

  return insert;
};

export const BUNDLED_SHIFT_PATTERN_PRESETS: ShiftPatternPreset[] = [
  {
    id: "medical-two-shift",
    patterns: [
      { emoji: "☀️", end: [17, 30], name: "日勤", start: [8, 30] },
      {
        emoji: "🌃",
        end: [9, 0],
        name: "夜勤",
        nextDayPatternName: "明け",
        start: [16, 30],
      },
      {
        countsAsDayOff: true,
        emoji: "🌅",
        isAllDay: true,
        name: "明け",
      },
      {
        countsAsDayOff: true,
        emoji: "💤",
        isAllDay: true,
        name: "休み",
      },
    ],
    title: "二交代制",
  },
  {
    id: "medical-three-shift",
    patterns: [
      { emoji: "☀️", end: [17, 0], name: "日勤", start: [8, 30] },
      { emoji: "🌞", end: [19, 30], name: "日長", start: [8, 0] },
      { emoji: "🌜", end: [1, 0], name: "準夜", start: [16, 30] },
      {
        emoji: "🌛",
        end: [9, 0],
        name: "深夜",
        nextDayPatternName: "明け",
        start: [0, 30],
      },
      {
        countsAsDayOff: true,
        emoji: "🌅",
        isAllDay: true,
        name: "明け",
      },
      {
        countsAsDayOff: true,
        emoji: "💤",
        isAllDay: true,
        name: "休み",
      },
    ],
    title: "三交代制",
  },
  {
    id: "care-worker",
    patterns: [
      { emoji: "☀️", end: [18, 0], name: "日勤", start: [9, 0] },
      {
        emoji: "🌃",
        end: [10, 0],
        name: "夜勤",
        nextDayPatternName: "明け",
        start: [16, 0],
      },
      {
        countsAsDayOff: true,
        emoji: "🌅",
        isAllDay: true,
        name: "明け",
      },
      {
        countsAsDayOff: true,
        emoji: "💤",
        isAllDay: true,
        name: "休み",
      },
      { emoji: "🐰", end: [16, 0], name: "早番", start: [7, 0] },
      { emoji: "🐢", end: [20, 0], name: "遅番", start: [11, 0] },
    ],
    title: "二交代制 + 早遅",
  },
];

export const SINGLE_SHIFT_PATTERN_PRESETS: ShiftPatternPreset[] = [
  {
    id: "day",
    patterns: [{ emoji: "☀️", end: [17, 30], name: "日勤", start: [8, 30] }],
    title: "日勤",
  },
  {
    id: "night",
    patterns: [{ emoji: "🌃", end: [9, 0], name: "夜勤", start: [17, 0] }],
    title: "夜勤",
  },
  {
    id: "ake",
    patterns: [
      {
        countsAsDayOff: true,
        emoji: "🌅",
        isAllDay: true,
        name: "明け",
      },
    ],
    title: "明け",
  },
  {
    id: "day-off",
    patterns: [
      {
        countsAsDayOff: true,
        emoji: "💤",
        isAllDay: true,
        name: "休み",
      },
    ],
    title: "休み",
  },
  {
    id: "early",
    patterns: [{ emoji: "🐰", end: [15, 0], name: "早番", start: [7, 0] }],
    title: "早番",
  },
  {
    id: "late",
    patterns: [{ emoji: "🐢", end: [21, 0], name: "遅番", start: [13, 0] }],
    title: "遅番",
  },
  {
    id: "semi-night",
    patterns: [{ emoji: "🌜", end: [1, 0], name: "準夜", start: [16, 30] }],
    title: "準夜",
  },
  {
    id: "midnight",
    patterns: [{ emoji: "🌛", end: [8, 30], name: "深夜", start: [0, 0] }],
    title: "深夜",
  },
  {
    id: "long-day",
    patterns: [{ emoji: "🌞", end: [19, 30], name: "日長", start: [8, 0] }],
    title: "日長",
  },
  {
    id: "on-call",
    patterns: [{ emoji: "🏠", isAllDay: true, name: "待機" }],
    title: "待機",
  },
  {
    id: "training",
    patterns: [{ emoji: "📚", end: [17, 0], name: "研修", start: [9, 0] }],
    title: "研修",
  },
  {
    id: "paid-leave",
    patterns: [
      {
        countsAsDayOff: true,
        emoji: "🌿",
        isAllDay: true,
        name: "有給",
      },
    ],
    title: "有給",
  },
];

export const insertShiftPatternPreset = async (
  preset: ShiftPatternPreset,
  startOrderIndex: number,
  userId: string
): Promise<void> => {
  const patternIdsByName = new Map(
    preset.patterns.map((pattern) => [pattern.name, id()])
  );

  await db.transact(
    preset.patterns.map((pattern, index) => {
      const patternId = patternIdsByName.get(pattern.name);
      const nextDayPatternId = pattern.nextDayPatternName
        ? patternIdsByName.get(pattern.nextDayPatternName)
        : undefined;

      if (!patternId) {
        throw new Error(`Pattern id not found: ${pattern.name}`);
      }

      let transaction = db.tx.shiftPatterns[patternId]
        .create(createPatternInsert(pattern, startOrderIndex + index))
        .link({ owner: userId });

      if (nextDayPatternId) {
        transaction = transaction.link({ nextDayPattern: nextDayPatternId });
      }

      return transaction;
    })
  );
};
