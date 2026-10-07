// Code generated from design/ by `mise run gen`. Do not edit.

/// A pattern Pochical offers ready-made (design/src/patterns.ts): a person's copy keeps its id. Its time is start and end, "HH:MM"; none is all-day.
public struct ReadyPattern: Sendable, Hashable {
  public let id: String
  public let name: String
  public let emoji: String
  public let symbol: String
  public let icon: String
  /// An index into the mark palette.
  public let color: Int
  public let time: (start: String, end: String)?
  public let countsAsOff: Bool
  public let nextDay: String?

  public static func == (a: Self, b: Self) -> Bool { a.id == b.id }
  public func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// The shift patterns' shared data (design/src/patterns.ts, spec/shift-patterns.md).
public enum ReadyPatterns {
  /// Every ready-made pattern.
  public static let all: [ReadyPattern] = [
    ReadyPattern(id: "after", name: "明け", emoji: "🌅", symbol: "明", icon: "sunHorizon", color: 3, time: nil, countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "day", name: "日勤", emoji: "☀️", symbol: "日", icon: "sun", color: 1, time: ("09:00", "18:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "duty", name: "当番", emoji: "🚒", symbol: "当", icon: "siren", color: 4, time: ("08:30", "08:30"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "early", name: "早番", emoji: "🌤️", symbol: "早", icon: "cloudSun", color: 2, time: ("07:00", "16:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "evening", name: "夕勤", emoji: "🌆", symbol: "夕", icon: "sunHorizon", color: 2, time: ("15:00", "23:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "junya", name: "準夜", emoji: "🌜", symbol: "準", icon: "cloudMoon", color: 7, time: ("16:30", "01:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "late", name: "遅番", emoji: "🌇", symbol: "遅", icon: "cloudMoon", color: 4, time: ("12:00", "21:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "midnight", name: "深夜", emoji: "🌛", symbol: "深", icon: "moonStar", color: 9, time: ("00:00", "08:30"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "night", name: "夜勤", emoji: "🌙", symbol: "夜", icon: "moon", color: 8, time: ("16:30", "09:30"), countsAsOff: false, nextDay: "after"),
    ReadyPattern(id: "off", name: "休み", emoji: "🌿", symbol: "休", icon: "leaf", color: 0, time: nil, countsAsOff: true, nextDay: nil),
    ReadyPattern(id: "offDuty", name: "非番", emoji: "🛌", symbol: "非", icon: "bed", color: 11, time: nil, countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "paid", name: "有休", emoji: "🌷", symbol: "有", icon: "flower", color: 5, time: nil, countsAsOff: true, nextDay: nil),
    ReadyPattern(id: "training", name: "研修", emoji: "📚", symbol: "研", icon: "book", color: 10, time: ("09:30", "17:30"), countsAsOff: false, nextDay: nil),
  ]

  /// The ready-made patterns パターンを追加 offers, in its order.
  public static let offered: [String] = ["early", "day", "late", "night", "after", "evening", "junya", "midnight", "duty", "offDuty", "training", "paid", "off"]

  /// The ready-made pattern with the id.
  public static func pattern(_ id: String) -> ReadyPattern? {
    all.first { $0.id == id }
  }

  /// The emoji offered first for a mark.
  public static let markEmojis: [String] = ["🌅", "🌤️", "☀️", "🌇", "🌆", "🌜", "🌙", "🌛", "⭐️", "🌿", "🌷", "🛌", "☕️", "🌴", "✈️", "❤️", "💼", "💻", "🏢", "🏠", "👥", "📞", "📚", "⏰", "🏪", "🍽️", "✂️", "🔧", "🚚", "🚗", "🚃", "🧑‍🏫", "🏥", "🩺", "💉", "🚑", "🚒", "🚓", "🫶", "👶", "🎓", "🎵", "💪", "🐾", "🛍️", "🎁", "🎉", "📅"]

  /// The icons offered first for a mark.
  public static let markIcons: [String] = ["letter", "sunHorizon", "cloudSun", "sun", "cloudMoon", "moon", "moonStar", "star", "leaf", "flower", "bed", "couch", "coffee", "treePalm", "plane", "heart", "briefcase", "laptop", "building", "house", "users", "phone", "book", "clock", "storefront", "utensils", "scissors", "wrench", "truck", "car", "train", "teacher", "hospital", "stethoscope", "syringe", "ambulance", "siren", "shield", "handHeart", "baby", "graduationCap", "music", "dumbbell", "pawPrint", "shoppingBag", "gift", "partyPopper", "calendarCheck"]

  /// The words that suggest a mark from a pattern's name, the first matching winning (spec/vectors/patterns.json, guessLook).
  public static let lookHints: [(words: [String], emoji: String, icon: String)] = [
    (["待機", "オンコール"], "📞", "phone"),
    (["在宅", "テレワーク"], "🏠", "house"),
    (["出張"], "💼", "briefcase"),
    (["会議", "ミーティング"], "👥", "users"),
    (["研修", "勉強", "講習", "学校"], "📚", "book"),
    (["当番", "当直"], "🚒", "siren"),
    (["非番"], "🛌", "bed"),
    (["有休", "有給", "年休"], "🌷", "flower"),
    (["明け"], "🌅", "sunHorizon"),
    (["夕"], "🌆", "sunHorizon"),
    (["準夜"], "🌜", "cloudMoon"),
    (["深夜", "夜"], "🌙", "moon"),
    (["早"], "🌤️", "cloudSun"),
    (["遅"], "🌇", "cloudMoon"),
    (["休", "公"], "🌿", "leaf"),
    (["日", "昼"], "☀️", "sun"),
  ]

  /// The mark when no word suggests one.
  public static let fallbackEmoji = "⭐️"
  public static let fallbackIcon = "letter"

  /// Work whose shifts are given out each time: the patterns to start with.
  public static let rosterTemplates: [JobTemplate] = [
    JobTemplate(id: "two-shift", title: "二交代制", note: "日勤と夜勤、夜勤の翌日は明け", patternIDs: ["day", "night", "after", "off"], sequence: nil, weekly: false, custom: false),
    JobTemplate(id: "three-shift", title: "三交代制", note: "日勤・準夜・深夜", patternIDs: ["day", "junya", "midnight", "off"], sequence: nil, weekly: false, custom: false),
    JobTemplate(id: "two-shift-early-late", title: "二交代制 + 早番・遅番", note: "時間の違う日勤が混ざる", patternIDs: ["early", "day", "late", "night", "after", "off"], sequence: nil, weekly: false, custom: false),
    JobTemplate(id: "roster-custom", title: "自分で作る", note: "まずは二交代制で始めて、あとで設定から変えられます", patternIDs: ["day", "night", "after", "off"], sequence: nil, weekly: false, custom: false),
  ]

  /// Work whose shifts come round in a fixed order: the order too.
  public static let rotationTemplates: [JobTemplate] = [
    JobTemplate(id: "duty", title: "当番・非番・休み", note: "消防などの24時間勤務", patternIDs: ["duty", "offDuty", "off"], sequence: ["duty", "offDuty", "off"], weekly: false, custom: false),
    JobTemplate(id: "factory", title: "日勤・夕勤・深夜の交代", note: "工場などの3交代（2日ずつ回る例）", patternIDs: ["day", "evening", "midnight", "off"], sequence: ["day", "day", "evening", "evening", "midnight", "midnight", "off", "off"], weekly: false, custom: false),
    JobTemplate(id: "weekdays", title: "平日は日勤、土日は休み", note: "曜日で決まっている勤務", patternIDs: ["day", "off"], sequence: ["off", "day", "day", "day", "day", "day", "off"], weekly: true, custom: false),
    JobTemplate(id: "rotation-custom", title: "自分で作る", note: "並びを組み立てる", patternIDs: ["duty", "offDuty", "day", "night", "after", "off"], sequence: [], weekly: false, custom: true),
  ]
}

/// A kind of work はじめの設定 and 新しい仕事にする offer (design/src/patterns.ts): its ready-made patterns, and for work that repeats, its order; `weekly` starts it on a Sunday, `custom` has it built.
public struct JobTemplate: Sendable, Hashable, Identifiable {
  public let id: String
  public let title: String
  public let note: String
  public let patternIDs: [String]
  public let sequence: [String]?
  public let weekly: Bool
  public let custom: Bool
}
