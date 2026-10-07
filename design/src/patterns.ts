// The shift patterns' shared data, for every platform: the patterns
// ポチカル offers ready-made, the marks offered first in each look, and
// the words that suggest a mark from a pattern's name
// (spec/shift-patterns.md). apps/web imports it, and `mise run gen`
// writes it out for the native apps (ReadyPatterns.swift, ReadyPatterns.kt).
import type { MarkIcon } from "./mark-icons";

// A ready-made pattern: a person's copy keeps its id, so samples and
// templates can name it. The time is "HH:MM" start and end; none is
// all-day.
export type ReadyPattern = {
  name: string;
  emoji: string;
  symbol: string;
  icon: MarkIcon;
  // An index into the mark palette (colors.ts, markColors).
  color: number;
  time?: readonly [string, string];
  countsAsOff?: boolean;
  nextDay?: string;
};

// The patterns ポチカル offers ready-made, by id.
export const readyPatterns = {
  after: {
    color: 3,
    emoji: "🌅",
    icon: "sunHorizon",
    name: "明け",
    symbol: "明",
  },
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
    icon: "sunHorizon",
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
} satisfies Record<string, ReadyPattern>;

export type ReadyPatternId = keyof typeof readyPatterns;

// The ready-made patterns パターンを追加 offers, in its order: through the
// day from early to late, then the night, then days that are not shifts.
export const readyPatternOrder: readonly ReadyPatternId[] = [
  "early",
  "day",
  "late",
  "night",
  "after",
  "evening",
  "junya",
  "midnight",
  "duty",
  "offDuty",
  "training",
  "paid",
  "off",
];

// The emoji offered first for a mark, a row of eight for each kind: the
// sky through the day, days off, work, jobs, care, and the rest of life.
export const markEmojis: readonly string[] = [
  "🌅",
  "🌤️",
  "☀️",
  "🌇",
  "🌆",
  "🌜",
  "🌙",
  "🌛",
  "⭐️",
  "🌿",
  "🌷",
  "🛌",
  "☕️",
  "🌴",
  "✈️",
  "❤️",
  "💼",
  "💻",
  "🏢",
  "🏠",
  "👥",
  "📞",
  "📚",
  "⏰",
  "🏪",
  "🍽️",
  "✂️",
  "🔧",
  "🚚",
  "🚗",
  "🚃",
  "🧑‍🏫",
  "🏥",
  "🩺",
  "💉",
  "🚑",
  "🚒",
  "🚓",
  "🫶",
  "👶",
  "🎓",
  "🎵",
  "💪",
  "🐾",
  "🛍️",
  "🎁",
  "🎉",
  "📅",
];

// The icons offered first for a mark, a row of eight for each kind like
// the emoji. Every other one is in the icon picker.
export const offeredMarkIcons: readonly MarkIcon[] = [
  "letter",
  "sunHorizon",
  "cloudSun",
  "sun",
  "cloudMoon",
  "moon",
  "moonStar",
  "star",
  "leaf",
  "flower",
  "bed",
  "couch",
  "coffee",
  "treePalm",
  "plane",
  "heart",
  "briefcase",
  "laptop",
  "building",
  "house",
  "users",
  "phone",
  "book",
  "clock",
  "storefront",
  "utensils",
  "scissors",
  "wrench",
  "truck",
  "car",
  "train",
  "teacher",
  "hospital",
  "stethoscope",
  "syringe",
  "ambulance",
  "siren",
  "shield",
  "handHeart",
  "baby",
  "graduationCap",
  "music",
  "dumbbell",
  "pawPrint",
  "shoppingBag",
  "gift",
  "partyPopper",
  "calendarCheck",
];

// The words that suggest a mark from a pattern's name: the first whose
// word is in the name gives its emoji and icon. Longer words first, so
// 待機 wins over a single-letter match (spec/vectors/patterns.json,
// guessLook).
export const lookHints: readonly {
  words: readonly string[];
  icon: MarkIcon;
  emoji: string;
}[] = [
  { emoji: "📞", icon: "phone", words: ["待機", "オンコール"] },
  { emoji: "🏠", icon: "house", words: ["在宅", "テレワーク"] },
  { emoji: "💼", icon: "briefcase", words: ["出張"] },
  { emoji: "👥", icon: "users", words: ["会議", "ミーティング"] },
  { emoji: "📚", icon: "book", words: ["研修", "勉強", "講習", "学校"] },
  { emoji: "🚒", icon: "siren", words: ["当番", "当直"] },
  { emoji: "🛌", icon: "bed", words: ["非番"] },
  { emoji: "🌷", icon: "flower", words: ["有休", "有給", "年休"] },
  { emoji: "🌅", icon: "sunHorizon", words: ["明け"] },
  { emoji: "🌆", icon: "sunHorizon", words: ["夕"] },
  { emoji: "🌜", icon: "cloudMoon", words: ["準夜"] },
  { emoji: "🌙", icon: "moon", words: ["深夜", "夜"] },
  { emoji: "🌤️", icon: "cloudSun", words: ["早"] },
  { emoji: "🌇", icon: "cloudMoon", words: ["遅"] },
  { emoji: "🌿", icon: "leaf", words: ["休", "公"] },
  { emoji: "☀️", icon: "sun", words: ["日", "昼"] },
];

// What a mark falls back to when no word suggests one: a star, and the
// letter icon, drawing the name's first letter.
export const lookFallback = { emoji: "⭐️", icon: "letter" } as const;
