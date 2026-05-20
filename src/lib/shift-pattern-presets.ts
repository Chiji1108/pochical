import type { useDb } from "jazz-tools/react-native";
import { app } from "@/schema";

type JazzDb = ReturnType<typeof useDb>;
type JazzBatch = Parameters<Parameters<JazzDb["batch"]>[0]>[0];

type TimeTuple = [hour: number, minute: number];

export type ShiftPatternPresetId =
  | "basic"
  | "medical-two-shift"
  | "medical-three-shift"
  | "care-worker";

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
  description: string;
  id: ShiftPatternPresetId;
  patterns: ShiftPatternPresetPattern[];
  title: string;
};

type PatternInsert = {
  countsAsDayOff: boolean;
  emoji: string;
  endDate: Date | null;
  isAllDay: boolean;
  name: string;
  nextDayPatternId?: string | null;
  orderIndex: number;
  startDate: Date | null;
};

const createPresetTime = ([hour, minute]: TimeTuple): Date => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const createPatternInsert = (
  pattern: ShiftPatternPresetPattern,
  orderIndex: number
): PatternInsert => ({
  countsAsDayOff: pattern.countsAsDayOff ?? false,
  emoji: pattern.emoji,
  endDate: pattern.end ? createPresetTime(pattern.end) : null,
  isAllDay: pattern.isAllDay ?? false,
  name: pattern.name,
  nextDayPatternId: null,
  orderIndex,
  startDate: pattern.start ? createPresetTime(pattern.start) : null,
});

export const SHIFT_PATTERN_PRESETS: ShiftPatternPreset[] = [
  {
    description: "よく使う勤務パターンをひと通り含む標準セット",
    id: "basic",
    patterns: [
      { emoji: "☀️", end: [17, 30], name: "日勤", start: [8, 30] },
      {
        emoji: "🌃",
        end: [9, 0],
        name: "夜勤",
        nextDayPatternName: "明け",
        start: [17, 0],
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
      { emoji: "🐰", end: [15, 0], name: "早番", start: [7, 0] },
      { emoji: "🐢", end: [21, 0], name: "遅番", start: [13, 0] },
      {
        emoji: "🌜",
        end: [1, 0],
        name: "準夜",
        nextDayPatternName: "明け",
        start: [16, 30],
      },
      { emoji: "🌛", end: [8, 30], name: "深夜", start: [0, 0] },
      { emoji: "🌞", end: [19, 30], name: "日長", start: [8, 0] },
      { emoji: "🏠", isAllDay: true, name: "待機" },
      { emoji: "📚", end: [17, 0], name: "研修", start: [9, 0] },
      {
        countsAsDayOff: true,
        emoji: "🎉",
        isAllDay: true,
        name: "有給",
      },
    ],
    title: "基本",
  },
  {
    description: "日勤・夜勤・明け・休みの二交代セット",
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
    title: "医療 二交代制",
  },
  {
    description: "日勤・準夜・深夜・休みの三交代セット",
    id: "medical-three-shift",
    patterns: [
      { emoji: "☀️", end: [17, 0], name: "日勤", start: [8, 30] },
      { emoji: "🌜", end: [1, 0], name: "準夜", start: [16, 30] },
      { emoji: "🌛", end: [9, 0], name: "深夜", start: [0, 30] },
      {
        countsAsDayOff: true,
        emoji: "💤",
        isAllDay: true,
        name: "休み",
      },
    ],
    title: "医療 三交代制",
  },
  {
    description: "早番・日勤・遅番・夜勤を含む介護向けセット",
    id: "care-worker",
    patterns: [
      { emoji: "🌤️", end: [16, 0], name: "早番", start: [7, 0] },
      { emoji: "☀️", end: [18, 0], name: "日勤", start: [9, 0] },
      { emoji: "🌆", end: [20, 0], name: "遅番", start: [11, 0] },
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
    ],
    title: "介護士",
  },
];

export const insertShiftPatternPreset = (
  batch: JazzBatch,
  preset: ShiftPatternPreset,
  startOrderIndex: number
): void => {
  const insertedPatternsByName = new Map<string, { id: string }>();

  for (const [index, pattern] of preset.patterns.entries()) {
    const insertedPattern = batch.insert(
      app.patterns,
      createPatternInsert(pattern, startOrderIndex + index)
    );
    insertedPatternsByName.set(pattern.name, insertedPattern);
  }

  for (const pattern of preset.patterns) {
    if (!pattern.nextDayPatternName) {
      continue;
    }

    const insertedPattern = insertedPatternsByName.get(pattern.name);
    const nextDayPattern = insertedPatternsByName.get(
      pattern.nextDayPatternName
    );

    if (insertedPattern && nextDayPattern) {
      batch.update(app.patterns, insertedPattern.id, {
        nextDayPatternId: nextDayPattern.id,
      });
    }
  }
};
