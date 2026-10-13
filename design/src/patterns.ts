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
  // Half a day off: worked the other half, so not counted as off.
  amOff: {
    color: 7,
    emoji: "☕️",
    icon: "coffee",
    name: "午前休",
    symbol: "前",
    time: ["13:00", "18:00"],
  },
  // A day off in return for working one that was off.
  compOff: {
    color: 10,
    countsAsOff: true,
    emoji: "🌱",
    icon: "pottedPlant",
    name: "代休",
    symbol: "代",
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
  // A hospital's day shift running into the evening.
  longDay: {
    color: 2,
    emoji: "🔆",
    icon: "sun",
    name: "長日勤",
    symbol: "長",
    time: ["08:30", "21:00"],
  },
  // Between 早番 and 遅番, as shops and care homes run.
  middle: {
    color: 5,
    emoji: "🌞",
    icon: "sun",
    name: "中番",
    symbol: "中",
    time: ["10:00", "19:00"],
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
  // A doctor's night in the hospital.
  nightDuty: {
    color: 9,
    emoji: "🩺",
    icon: "stethoscope",
    name: "当直",
    symbol: "直",
    time: ["17:00", "09:00"],
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
  office: {
    color: 8,
    emoji: "💼",
    icon: "briefcase",
    name: "出勤",
    symbol: "出",
    time: ["09:00", "18:00"],
  },
  onCall: { color: 6, emoji: "📞", icon: "phone", name: "待機", symbol: "待" },
  paid: {
    color: 5,
    countsAsOff: true,
    emoji: "🌷",
    icon: "flower",
    name: "有休",
    symbol: "有",
  },
  part: {
    color: 2,
    emoji: "🛒",
    icon: "shoppingBag",
    name: "パート",
    symbol: "パ",
    time: ["10:00", "15:00"],
  },
  partTime: {
    color: 4,
    emoji: "🏪",
    icon: "storefront",
    name: "バイト",
    symbol: "バ",
    time: ["17:00", "22:00"],
  },
  pmOff: {
    color: 7,
    emoji: "🛋️",
    icon: "couch",
    name: "午後休",
    symbol: "後",
    time: ["09:00", "13:00"],
  },
  remote: {
    color: 10,
    emoji: "🏠",
    icon: "house",
    name: "在宅",
    symbol: "在",
    time: ["09:00", "18:00"],
  },
  training: {
    color: 10,
    emoji: "📚",
    icon: "book",
    name: "研修",
    symbol: "研",
    time: ["09:30", "17:30"],
  },
  trip: { color: 6, emoji: "🧳", icon: "suitcase", name: "出張", symbol: "張" },
  // A day off asked for ahead, as rosters take them.
  wishOff: {
    color: 0,
    countsAsOff: true,
    emoji: "🙋",
    icon: "star",
    name: "希望休",
    symbol: "希",
  },
} satisfies Record<string, ReadyPattern>;

export type ReadyPatternId = keyof typeof readyPatterns;

// The ready-made patterns パターンを追加 and the setup questions offer,
// under headings: shifts through the day from early to late, then the
// night and duties; work in the day of other kinds; then days off.
export const readyPatternSections: readonly {
  title: string;
  ids: readonly ReadyPatternId[];
}[] = [
  {
    ids: [
      "early",
      "middle",
      "day",
      "longDay",
      "late",
      "evening",
      "junya",
      "midnight",
      "night",
      "after",
      "duty",
      "offDuty",
      "nightDuty",
      "onCall",
    ],
    title: "交代勤務",
  },
  {
    ids: ["office", "remote", "trip", "training", "part", "partTime"],
    title: "日中の仕事",
  },
  {
    ids: ["off", "wishOff", "paid", "compOff", "amOff", "pmOff"],
    title: "休み",
  },
];

// The same, one after another.
export const readyPatternOrder: readonly ReadyPatternId[] =
  readyPatternSections.flatMap(({ ids }) => ids);

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
  { emoji: "🏠", icon: "house", words: ["在宅", "テレワーク", "リモート"] },
  { emoji: "🧳", icon: "suitcase", words: ["出張"] },
  { emoji: "💼", icon: "briefcase", words: ["出勤", "出社"] },
  { emoji: "👥", icon: "users", words: ["会議", "ミーティング"] },
  { emoji: "📚", icon: "book", words: ["研修", "勉強", "講習", "学校"] },
  { emoji: "🩺", icon: "stethoscope", words: ["当直"] },
  { emoji: "🚒", icon: "siren", words: ["当番"] },
  { emoji: "🛌", icon: "bed", words: ["非番"] },
  { emoji: "🌷", icon: "flower", words: ["有休", "有給", "年休"] },
  { emoji: "🙋", icon: "star", words: ["希望"] },
  { emoji: "🌱", icon: "pottedPlant", words: ["代休", "振休"] },
  { emoji: "☕️", icon: "coffee", words: ["午前休", "午前半休"] },
  { emoji: "🛋️", icon: "couch", words: ["午後休", "午後半休"] },
  { emoji: "🛒", icon: "shoppingBag", words: ["パート"] },
  { emoji: "🏪", icon: "storefront", words: ["バイト"] },
  { emoji: "🔆", icon: "sun", words: ["長日"] },
  { emoji: "🌞", icon: "sun", words: ["中番"] },
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
  // 自分で作る: the person picks the patterns, and types any order, from
  // nothing but 休み, which nearly everyone has and which the month's days
  // off and みんな休み count.
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
    id: "shop",
    note: "お店や介護などの早番・中番・遅番",
    patternKeys: ["early", "middle", "late", "off"],
    title: "早番・中番・遅番",
  },
  {
    id: "part",
    note: "シフト表で、入る日が決まる",
    patternKeys: ["part", "off"],
    title: "パート・アルバイト",
  },
  {
    custom: true,
    id: "roster-custom",
    note: "使う勤務や休みを、ひとつずつ選ぶ",
    patternKeys: ["off"],
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
    note: "平日は出勤、土日は休み",
    patternKeys: ["office", "remote", "off"],
    sequence: ["off", "office", "office", "office", "office", "office", "off"],
    title: "会社勤め",
    weekly: true,
  },
  {
    custom: true,
    id: "rotation-custom",
    note: "並びを組み立てる",
    patternKeys: ["off"],
    sequence: [],
    title: "自分で作る",
  },
];
