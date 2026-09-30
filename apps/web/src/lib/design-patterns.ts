import { createContext, useContext } from "react";

import type { Look } from "../components/shift-mark";

// A shift pattern, as the person made it: its name, its mark, its standard
// time, and what it means for the days it is on. Each person has their own
// list, in their order; a day names its pattern by id. Kept apart from the
// calendar so the shift marks can read them without importing it back.
export type Pattern = Look & {
  id: string;
  name: string;
  // Start and end, "HH:MM". Without one it is all-day, with no time to
  // change.
  time?: readonly [string, string];
  // Counted among the month's days off, and marked as one.
  countsAsOff: boolean;
  // Another pattern entered on the following day too, like 明け after 夜勤.
  nextDay?: string;
};

// A pattern's id, as a day names its shift.
export type Shift = string;

// Patterns by id, to look up a day's. A day may name one since deleted.
export type PatternBook = Partial<Record<string, Pattern>>;

// The patterns ポチカル offers ready-made, to start from or add with a tap.
// A person's copy keeps the id, so the samples can name them.
const presets = {
  after: { color: 3, emoji: "🌅", icon: "sunrise", name: "明け", symbol: "明" },
  day: {
    color: 1,
    emoji: "☀️",
    icon: "sun",
    name: "日勤",
    symbol: "日",
    time: ["09:00", "18:00"],
  },
  duty: {
    color: 4,
    emoji: "🚒",
    icon: "siren",
    name: "当番",
    symbol: "当",
    time: ["08:30", "08:30"],
  },
  early: {
    color: 2,
    emoji: "🌤️",
    icon: "cloudSun",
    name: "早番",
    symbol: "早",
    time: ["07:00", "16:00"],
  },
  evening: {
    color: 2,
    emoji: "🌆",
    icon: "sunMoon",
    name: "夕勤",
    symbol: "夕",
    time: ["15:00", "23:00"],
  },
  junya: {
    color: 7,
    emoji: "🌜",
    icon: "cloudMoon",
    name: "準夜",
    symbol: "準",
    time: ["16:30", "01:00"],
  },
  late: {
    color: 4,
    emoji: "🌇",
    icon: "cloudMoon",
    name: "遅番",
    symbol: "遅",
    time: ["12:00", "21:00"],
  },
  midnight: {
    color: 9,
    emoji: "🌛",
    icon: "moonStar",
    name: "深夜",
    symbol: "深",
    time: ["00:00", "08:30"],
  },
  night: {
    color: 8,
    emoji: "🌙",
    icon: "moon",
    name: "夜勤",
    nextDay: "after",
    symbol: "夜",
    time: ["16:30", "09:30"],
  },
  off: {
    color: 0,
    countsAsOff: true,
    emoji: "🌿",
    icon: "leaf",
    name: "休み",
    symbol: "休",
  },
  offDuty: { color: 11, emoji: "🛌", icon: "bed", name: "非番", symbol: "非" },
  paid: {
    color: 5,
    countsAsOff: true,
    emoji: "🌷",
    icon: "flower",
    name: "有休",
    symbol: "有",
  },
  training: {
    color: 10,
    emoji: "📚",
    icon: "book",
    name: "研修",
    symbol: "研",
    time: ["09:30", "17:30"],
  },
} satisfies Record<
  string,
  Omit<Pattern, "id" | "countsAsOff"> & { countsAsOff?: boolean }
>;
export type PresetShift = keyof typeof presets;

export const presetPatterns = Object.fromEntries(
  Object.entries(presets).map(([id, preset]) => [
    id,
    { countsAsOff: false, ...preset, id },
  ])
) as Record<PresetShift, Pattern>;

// The ready-made patterns, in the order given.
export function presetList(ids: readonly PresetShift[]): Pattern[] {
  return ids.map((id) => presetPatterns[id]);
}

export function bookOf(list: readonly Pattern[]): PatternBook {
  return Object.fromEntries(list.map((pattern) => [pattern.id, pattern]));
}

// The patterns marks are drawn from: the person's own inside their
// calendar, over the ready-made ones that samples and templates name.
export const PatternsContext = createContext<PatternBook>(presetPatterns);

export function usePatterns() {
  return useContext(PatternsContext);
}

// The person's own patterns in their order, for samples of how their
// calendar would look. A page with no one in view shows ready-made ones.
export const OwnPatternsContext = createContext<readonly Pattern[]>(
  presetList(["day", "night", "after", "off"])
);

export function isDayOff(pattern: Pattern | undefined) {
  return pattern?.countsAsOff === true;
}

// As many patterns as the input buttons hold on one page, in two rows of
// five, so they fit under a month six weeks tall. More go on to further
// pages, in the order the person puts them.
export const PATTERNS_PER_PAGE = 10;
