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

// The emoji offered first for a group's mark, a row of eight for each kind
// as a pattern's are: family, friends, school, work, play, and food, trips
// and nature. Every other one is in the emoji picker.
export const groupMarkEmojis: readonly string[] = [
  "🏠",
  "👨‍👩‍👧",
  "👶",
  "💑",
  "❤️",
  "🫶",
  "🐾",
  "🌷",
  "👭",
  "🤝",
  "🎉",
  "🥂",
  "🍻",
  "💬",
  "⭐️",
  "🌈",
  "🎓",
  "🏫",
  "📚",
  "✏️",
  "🧪",
  "🎒",
  "🏀",
  "🎵",
  "💼",
  "🏢",
  "🏥",
  "🏪",
  "🍳",
  "🚒",
  "🏭",
  "💻",
  "⚽️",
  "🎾",
  "🏃",
  "🎮",
  "🎨",
  "🎤",
  "📷",
  "🎬",
  "🍙",
  "☕️",
  "🍰",
  "✈️",
  "🏕️",
  "⛰️",
  "🌸",
  "🌊",
];

// The icons offered first for a group's mark, a row of eight for each kind
// like its emoji. Every other one is in the icon picker.
export const groupMarkIcons: readonly MarkIcon[] = [
  "house",
  "users",
  "heart",
  "baby",
  "babyCarriage",
  "handHeart",
  "pawPrint",
  "flower",
  "smiley",
  "handshake",
  "partyPopper",
  "balloon",
  "beer",
  "wine",
  "star",
  "rainbow",
  "graduationCap",
  "books",
  "backpack",
  "pencil",
  "microscope",
  "teacher",
  "calculator",
  "music",
  "briefcase",
  "building",
  "hospital",
  "storefront",
  "chefHat",
  "fireTruck",
  "factory",
  "laptop",
  "soccer",
  "tennis",
  "run",
  "game",
  "paintBrush",
  "microphone",
  "camera",
  "film",
  "utensils",
  "coffee",
  "cake",
  "plane",
  "tent",
  "mountains",
  "tree",
  "island",
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

// The kinds of work はじめの設定 and 新しい仕事にする offer: their
// ready-made patterns, and for work that repeats, its order.
export type JobTemplate = {
  id: string;
  title: string;
  note: string;
  patternKeys: ReadyPatternId[];
  // Present only for work that repeats in a fixed order.
  sequence?: ReadyPatternId[];
  // The sequence starts on Sunday, so the first day comes from the weekday.
  weekly?: boolean;
  custom?: boolean;
};

// The work whose shifts are given out each time (a roster): the patterns
// to start with.
export const rosterTemplates: readonly JobTemplate[] = [
  {
    id: "two-shift",
    note: "日勤と夜勤、夜勤の翌日は明け",
    patternKeys: ["day", "night", "after", "off"],
    title: "二交代制",
  },
  {
    id: "three-shift",
    note: "日勤・準夜・深夜",
    patternKeys: ["day", "junya", "midnight", "off"],
    title: "三交代制",
  },
  {
    id: "two-shift-early-late",
    note: "時間の違う日勤が混ざる",
    patternKeys: ["early", "day", "late", "night", "after", "off"],
    title: "二交代制 + 早番・遅番",
  },
  {
    id: "roster-custom",
    note: "まずは二交代制で始めて、あとで設定から変えられます",
    patternKeys: ["day", "night", "after", "off"],
    title: "自分で作る",
  },
];

// The work whose shifts come round in a fixed order: the order too.
export const rotationTemplates: readonly JobTemplate[] = [
  {
    id: "duty",
    note: "消防などの24時間勤務",
    patternKeys: ["duty", "offDuty", "off"],
    sequence: ["duty", "offDuty", "off"],
    title: "当番・非番・休み",
  },
  {
    id: "factory",
    note: "工場などの3交代（2日ずつ回る例）",
    patternKeys: ["day", "evening", "midnight", "off"],
    sequence: [
      "day",
      "day",
      "evening",
      "evening",
      "midnight",
      "midnight",
      "off",
      "off",
    ],
    title: "日勤・夕勤・深夜の交代",
  },
  {
    id: "weekdays",
    note: "曜日で決まっている勤務",
    patternKeys: ["day", "off"],
    sequence: ["off", "day", "day", "day", "day", "day", "off"],
    title: "平日は日勤、土日は休み",
    weekly: true,
  },
  {
    custom: true,
    id: "rotation-custom",
    note: "並びを組み立てる",
    patternKeys: ["duty", "offDuty", "day", "night", "after", "off"],
    sequence: [],
    title: "自分で作る",
  },
];
