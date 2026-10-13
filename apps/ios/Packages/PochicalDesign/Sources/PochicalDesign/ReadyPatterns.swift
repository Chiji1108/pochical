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
    ReadyPattern(id: "amOff", name: "午前休", emoji: "☕️", symbol: "前", icon: "coffee", color: 7, time: ("13:00", "18:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "compOff", name: "代休", emoji: "🌱", symbol: "代", icon: "pottedPlant", color: 10, time: nil, countsAsOff: true, nextDay: nil),
    ReadyPattern(id: "day", name: "日勤", emoji: "☀️", symbol: "日", icon: "sun", color: 1, time: ("09:00", "18:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "duty", name: "当番", emoji: "🚒", symbol: "当", icon: "siren", color: 4, time: ("08:30", "08:30"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "early", name: "早番", emoji: "🌤️", symbol: "早", icon: "cloudSun", color: 2, time: ("07:00", "16:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "evening", name: "夕勤", emoji: "🌆", symbol: "夕", icon: "sunHorizon", color: 2, time: ("15:00", "23:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "junya", name: "準夜", emoji: "🌜", symbol: "準", icon: "cloudMoon", color: 7, time: ("16:30", "01:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "late", name: "遅番", emoji: "🌇", symbol: "遅", icon: "cloudMoon", color: 4, time: ("12:00", "21:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "longDay", name: "長日勤", emoji: "🔆", symbol: "長", icon: "sun", color: 2, time: ("08:30", "21:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "middle", name: "中番", emoji: "🌞", symbol: "中", icon: "sun", color: 5, time: ("10:00", "19:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "midnight", name: "深夜", emoji: "🌛", symbol: "深", icon: "moonStar", color: 9, time: ("00:00", "08:30"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "night", name: "夜勤", emoji: "🌙", symbol: "夜", icon: "moon", color: 8, time: ("16:30", "09:30"), countsAsOff: false, nextDay: "after"),
    ReadyPattern(id: "nightDuty", name: "当直", emoji: "🩺", symbol: "直", icon: "stethoscope", color: 9, time: ("17:00", "09:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "off", name: "休み", emoji: "🌿", symbol: "休", icon: "leaf", color: 0, time: nil, countsAsOff: true, nextDay: nil),
    ReadyPattern(id: "offDuty", name: "非番", emoji: "🛌", symbol: "非", icon: "bed", color: 11, time: nil, countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "office", name: "出勤", emoji: "💼", symbol: "出", icon: "briefcase", color: 8, time: ("09:00", "18:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "onCall", name: "待機", emoji: "📞", symbol: "待", icon: "phone", color: 6, time: nil, countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "paid", name: "有休", emoji: "🌷", symbol: "有", icon: "flower", color: 5, time: nil, countsAsOff: true, nextDay: nil),
    ReadyPattern(id: "part", name: "パート", emoji: "🛒", symbol: "パ", icon: "shoppingBag", color: 2, time: ("10:00", "15:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "partTime", name: "バイト", emoji: "🏪", symbol: "バ", icon: "storefront", color: 4, time: ("17:00", "22:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "pmOff", name: "午後休", emoji: "🛋️", symbol: "後", icon: "couch", color: 7, time: ("09:00", "13:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "remote", name: "在宅", emoji: "🏠", symbol: "在", icon: "house", color: 10, time: ("09:00", "18:00"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "training", name: "研修", emoji: "📚", symbol: "研", icon: "book", color: 10, time: ("09:30", "17:30"), countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "trip", name: "出張", emoji: "🧳", symbol: "張", icon: "suitcase", color: 6, time: nil, countsAsOff: false, nextDay: nil),
    ReadyPattern(id: "wishOff", name: "希望休", emoji: "🙋", symbol: "希", icon: "star", color: 0, time: nil, countsAsOff: true, nextDay: nil),
  ]

  /// The ready-made patterns パターンを追加 offers, in its order.
  public static let offered: [String] = ["early", "middle", "day", "longDay", "late", "evening", "junya", "midnight", "night", "after", "duty", "offDuty", "nightDuty", "onCall", "office", "remote", "trip", "training", "part", "partTime", "off", "wishOff", "paid", "compOff", "amOff", "pmOff"]

  /// The same under their headings.
  public static let offeredSections: [(title: String, ids: [String])] = [
    ("交代勤務", ["early", "middle", "day", "longDay", "late", "evening", "junya", "midnight", "night", "after", "duty", "offDuty", "nightDuty", "onCall"]),
    ("日中の仕事", ["office", "remote", "trip", "training", "part", "partTime"]),
    ("休み", ["off", "wishOff", "paid", "compOff", "amOff", "pmOff"]),
  ]

  /// The ready-made pattern with the id.
  public static func pattern(_ id: String) -> ReadyPattern? {
    all.first { $0.id == id }
  }

  /// The emoji offered first for a mark.
  public static let markEmojis: [String] = ["🌅", "🌤️", "☀️", "🌇", "🌆", "🌜", "🌙", "🌛", "⭐️", "🌿", "🌷", "🛌", "☕️", "🌴", "✈️", "❤️", "💼", "💻", "🏢", "🏠", "👥", "📞", "📚", "⏰", "🏪", "🍽️", "✂️", "🔧", "🚚", "🚗", "🚃", "🧑‍🏫", "🏥", "🩺", "💉", "🚑", "🚒", "🚓", "🫶", "👶", "🎓", "🎵", "💪", "🐾", "🛍️", "🎁", "🎉", "📅"]

  /// The icons offered first for a mark.
  public static let markIcons: [String] = ["letter", "sunHorizon", "cloudSun", "sun", "cloudMoon", "moon", "moonStar", "star", "leaf", "flower", "bed", "couch", "coffee", "treePalm", "plane", "heart", "briefcase", "laptop", "building", "house", "users", "phone", "book", "clock", "storefront", "utensils", "scissors", "wrench", "truck", "car", "train", "teacher", "hospital", "stethoscope", "syringe", "ambulance", "siren", "shield", "handHeart", "baby", "graduationCap", "music", "dumbbell", "pawPrint", "shoppingBag", "gift", "partyPopper", "calendarCheck"]

  /// The emoji offered first for a group's mark.
  public static let groupMarkEmojis: [String] = ["🏠", "👨‍👩‍👧", "👶", "💑", "❤️", "🫶", "🐾", "🌷", "👭", "🤝", "🎉", "🥂", "🍻", "💬", "⭐️", "🌈", "🎓", "🏫", "📚", "✏️", "🧪", "🎒", "🏀", "🎵", "💼", "🏢", "🏥", "🏪", "🍳", "🚒", "🏭", "💻", "⚽️", "🎾", "🏃", "🎮", "🎨", "🎤", "📷", "🎬", "🍙", "☕️", "🍰", "✈️", "🏕️", "⛰️", "🌸", "🌊"]

  /// The icons offered first for a group's mark.
  public static let groupMarkIcons: [String] = ["house", "users", "heart", "baby", "babyCarriage", "handHeart", "pawPrint", "flower", "smiley", "handshake", "partyPopper", "balloon", "beer", "wine", "star", "rainbow", "graduationCap", "books", "backpack", "pencil", "microscope", "teacher", "calculator", "music", "briefcase", "building", "hospital", "storefront", "chefHat", "fireTruck", "factory", "laptop", "soccer", "tennis", "run", "game", "paintBrush", "microphone", "camera", "film", "utensils", "coffee", "cake", "plane", "tent", "mountains", "tree", "island"]

  /// The words that suggest a mark from a pattern's name, the first matching winning (spec/vectors/patterns.json, guessLook).
  public static let lookHints: [(words: [String], emoji: String, icon: String)] = [
    (["待機", "オンコール"], "📞", "phone"),
    (["在宅", "テレワーク", "リモート"], "🏠", "house"),
    (["出張"], "🧳", "suitcase"),
    (["出勤", "出社"], "💼", "briefcase"),
    (["会議", "ミーティング"], "👥", "users"),
    (["研修", "勉強", "講習", "学校"], "📚", "book"),
    (["当直"], "🩺", "stethoscope"),
    (["当番"], "🚒", "siren"),
    (["非番"], "🛌", "bed"),
    (["有休", "有給", "年休"], "🌷", "flower"),
    (["希望"], "🙋", "star"),
    (["代休", "振休"], "🌱", "pottedPlant"),
    (["午前休", "午前半休"], "☕️", "coffee"),
    (["午後休", "午後半休"], "🛋️", "couch"),
    (["パート"], "🛒", "shoppingBag"),
    (["バイト"], "🏪", "storefront"),
    (["長日"], "🔆", "sun"),
    (["中番"], "🌞", "sun"),
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
    JobTemplate(id: "shop", title: "早番・中番・遅番", note: "お店や介護などの早番・中番・遅番", patternIDs: ["early", "middle", "late", "off"], sequence: nil, weekly: false, custom: false),
    JobTemplate(id: "part", title: "パート・アルバイト", note: "シフト表で、入る日が決まる", patternIDs: ["part", "off"], sequence: nil, weekly: false, custom: false),
    JobTemplate(id: "roster-custom", title: "自分で作る", note: "使う勤務や休みを、ひとつずつ選ぶ", patternIDs: ["off"], sequence: nil, weekly: false, custom: true),
  ]

  /// Work whose shifts come round in a fixed order: the order too.
  public static let rotationTemplates: [JobTemplate] = [
    JobTemplate(id: "duty", title: "当番・非番・休み", note: "消防などの24時間勤務", patternIDs: ["duty", "offDuty", "off"], sequence: ["duty", "offDuty", "off"], weekly: false, custom: false),
    JobTemplate(id: "factory", title: "日勤・夕勤・深夜の交代", note: "工場などの3交代（2日ずつ回る例）", patternIDs: ["day", "evening", "midnight", "off"], sequence: ["day", "day", "evening", "evening", "midnight", "midnight", "off", "off"], weekly: false, custom: false),
    JobTemplate(id: "weekdays", title: "会社勤め", note: "平日は出勤、土日は休み", patternIDs: ["office", "remote", "off"], sequence: ["off", "office", "office", "office", "office", "office", "off"], weekly: true, custom: false),
    JobTemplate(id: "rotation-custom", title: "自分で作る", note: "並びを組み立てる", patternIDs: ["off"], sequence: [], weekly: false, custom: true),
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
