// ReadyPatterns.swift and ReadyPatterns.kt: the shift patterns' shared
// data (src/patterns.ts) for the native apps.
import {
  lookFallback,
  lookHints,
  markEmojis,
  offeredMarkIcons,
  readyPatternOrder,
  readyPatterns,
} from "../src/patterns";
import type { ReadyPattern } from "../src/patterns";

const quoted = (text: string) => JSON.stringify(text);
const list = (items: readonly string[]) => items.map(quoted).join(", ");

const entries = Object.entries(readyPatterns) as [string, ReadyPattern][];

const swiftPattern = (id: string, pattern: ReadyPattern) => {
  const fields = [
    `id: ${quoted(id)}`,
    `name: ${quoted(pattern.name)}`,
    `emoji: ${quoted(pattern.emoji)}`,
    `symbol: ${quoted(pattern.symbol)}`,
    `icon: ${quoted(pattern.icon)}`,
    `color: ${pattern.color}`,
    `time: ${pattern.time ? `(${quoted(pattern.time[0])}, ${quoted(pattern.time[1])})` : "nil"}`,
    `countsAsOff: ${pattern.countsAsOff === true}`,
    `nextDay: ${pattern.nextDay === undefined ? "nil" : quoted(pattern.nextDay)}`,
  ];
  return `    ReadyPattern(${fields.join(", ")}),`;
};

export const swiftReadyPatterns = (): string[] => [
  '/// A pattern Pochical offers ready-made (design/src/patterns.ts): a person\'s copy keeps its id. Its time is start and end, "HH:MM"; none is all-day.',
  "public struct ReadyPattern: Sendable, Hashable {",
  "  public let id: String",
  "  public let name: String",
  "  public let emoji: String",
  "  public let symbol: String",
  "  public let icon: String",
  "  /// An index into the mark palette.",
  "  public let color: Int",
  "  public let time: (start: String, end: String)?",
  "  public let countsAsOff: Bool",
  "  public let nextDay: String?",
  "",
  "  public static func == (a: Self, b: Self) -> Bool { a.id == b.id }",
  "  public func hash(into hasher: inout Hasher) { hasher.combine(id) }",
  "}",
  "",
  "/// The shift patterns' shared data (design/src/patterns.ts, spec/shift-patterns.md).",
  "public enum ReadyPatterns {",
  "  /// Every ready-made pattern.",
  "  public static let all: [ReadyPattern] = [",
  ...entries.map(([id, pattern]) => swiftPattern(id, pattern)),
  "  ]",
  "",
  "  /// The ready-made patterns パターンを追加 offers, in its order.",
  `  public static let offered: [String] = [${list(readyPatternOrder)}]`,
  "",
  "  /// The ready-made pattern with the id.",
  "  public static func pattern(_ id: String) -> ReadyPattern? {",
  "    all.first { $0.id == id }",
  "  }",
  "",
  "  /// The emoji offered first for a mark.",
  `  public static let markEmojis: [String] = [${list(markEmojis)}]`,
  "",
  "  /// The icons offered first for a mark.",
  `  public static let markIcons: [String] = [${list(offeredMarkIcons)}]`,
  "",
  "  /// The words that suggest a mark from a pattern's name, the first matching winning (spec/vectors/patterns.json, guessLook).",
  "  public static let lookHints: [(words: [String], emoji: String, icon: String)] = [",
  ...lookHints.map(
    ({ words, emoji, icon }) =>
      `    ([${list(words)}], ${quoted(emoji)}, ${quoted(icon)}),`
  ),
  "  ]",
  "",
  "  /// The mark when no word suggests one.",
  `  public static let fallbackEmoji = ${quoted(lookFallback.emoji)}`,
  `  public static let fallbackIcon = ${quoted(lookFallback.icon)}`,
  "}",
];

const kotlinPattern = (id: string, pattern: ReadyPattern) => {
  const fields = [
    `id = ${quoted(id)}`,
    `name = ${quoted(pattern.name)}`,
    `emoji = ${quoted(pattern.emoji)}`,
    `symbol = ${quoted(pattern.symbol)}`,
    `icon = ${quoted(pattern.icon)}`,
    `color = ${pattern.color}`,
    `time = ${pattern.time ? `${quoted(pattern.time[0])} to ${quoted(pattern.time[1])}` : "null"}`,
    `countsAsOff = ${pattern.countsAsOff === true}`,
    `nextDay = ${pattern.nextDay === undefined ? "null" : quoted(pattern.nextDay)}`,
  ];
  return `    ReadyPattern(${fields.join(", ")}),`;
};

export const kotlinReadyPatterns = (): string[] => [
  "/** A pattern Pochical offers ready-made (design/src/patterns.ts): a person's copy keeps its id. */",
  "data class ReadyPattern(",
  "  val id: String,",
  "  val name: String,",
  "  val emoji: String,",
  "  val symbol: String,",
  "  val icon: String,",
  "  val color: Int,",
  '  /** Start and end, "HH:MM"; none is all-day. */',
  "  val time: Pair<String, String>?,",
  "  val countsAsOff: Boolean,",
  "  val nextDay: String?,",
  ")",
  "",
  "/** The shift patterns' shared data (design/src/patterns.ts, spec/shift-patterns.md). */",
  "object ReadyPatterns {",
  "  val all: List<ReadyPattern> = listOf(",
  ...entries.map(([id, pattern]) => kotlinPattern(id, pattern)),
  "  )",
  "",
  `  val offered: List<String> = listOf(${list(readyPatternOrder)})`,
  "",
  `  val markEmojis: List<String> = listOf(${list(markEmojis)})`,
  "",
  `  val markIcons: List<String> = listOf(${list(offeredMarkIcons)})`,
  "",
  "  data class LookHint(val words: List<String>, val emoji: String, val icon: String)",
  "",
  "  val lookHints: List<LookHint> = listOf(",
  ...lookHints.map(
    ({ words, emoji, icon }) =>
      `    LookHint(listOf(${list(words)}), ${quoted(emoji)}, ${quoted(icon)}),`
  ),
  "  )",
  "",
  `  const val FALLBACK_EMOJI = ${quoted(lookFallback.emoji)}`,
  `  const val FALLBACK_ICON = ${quoted(lookFallback.icon)}`,
  "}",
];
