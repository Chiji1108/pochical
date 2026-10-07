// Code generated from design/ by `mise run gen`. Do not edit.

package app.pochical.design

/** A pattern Pochical offers ready-made (design/src/patterns.ts): a person's copy keeps its id. */
data class ReadyPattern(
  val id: String,
  val name: String,
  val emoji: String,
  val symbol: String,
  val icon: String,
  val color: Int,
  /** Start and end, "HH:MM"; none is all-day. */
  val time: Pair<String, String>?,
  val countsAsOff: Boolean,
  val nextDay: String?,
)

/** The shift patterns' shared data (design/src/patterns.ts, spec/shift-patterns.md). */
object ReadyPatterns {
  val all: List<ReadyPattern> = listOf(
    ReadyPattern(id = "after", name = "明け", emoji = "🌅", symbol = "明", icon = "sunHorizon", color = 3, time = null, countsAsOff = false, nextDay = null),
    ReadyPattern(id = "day", name = "日勤", emoji = "☀️", symbol = "日", icon = "sun", color = 1, time = "09:00" to "18:00", countsAsOff = false, nextDay = null),
    ReadyPattern(id = "duty", name = "当番", emoji = "🚒", symbol = "当", icon = "siren", color = 4, time = "08:30" to "08:30", countsAsOff = false, nextDay = null),
    ReadyPattern(id = "early", name = "早番", emoji = "🌤️", symbol = "早", icon = "cloudSun", color = 2, time = "07:00" to "16:00", countsAsOff = false, nextDay = null),
    ReadyPattern(id = "evening", name = "夕勤", emoji = "🌆", symbol = "夕", icon = "sunHorizon", color = 2, time = "15:00" to "23:00", countsAsOff = false, nextDay = null),
    ReadyPattern(id = "junya", name = "準夜", emoji = "🌜", symbol = "準", icon = "cloudMoon", color = 7, time = "16:30" to "01:00", countsAsOff = false, nextDay = null),
    ReadyPattern(id = "late", name = "遅番", emoji = "🌇", symbol = "遅", icon = "cloudMoon", color = 4, time = "12:00" to "21:00", countsAsOff = false, nextDay = null),
    ReadyPattern(id = "midnight", name = "深夜", emoji = "🌛", symbol = "深", icon = "moonStar", color = 9, time = "00:00" to "08:30", countsAsOff = false, nextDay = null),
    ReadyPattern(id = "night", name = "夜勤", emoji = "🌙", symbol = "夜", icon = "moon", color = 8, time = "16:30" to "09:30", countsAsOff = false, nextDay = "after"),
    ReadyPattern(id = "off", name = "休み", emoji = "🌿", symbol = "休", icon = "leaf", color = 0, time = null, countsAsOff = true, nextDay = null),
    ReadyPattern(id = "offDuty", name = "非番", emoji = "🛌", symbol = "非", icon = "bed", color = 11, time = null, countsAsOff = false, nextDay = null),
    ReadyPattern(id = "paid", name = "有休", emoji = "🌷", symbol = "有", icon = "flower", color = 5, time = null, countsAsOff = true, nextDay = null),
    ReadyPattern(id = "training", name = "研修", emoji = "📚", symbol = "研", icon = "book", color = 10, time = "09:30" to "17:30", countsAsOff = false, nextDay = null),
  )

  val offered: List<String> = listOf("early", "day", "late", "night", "after", "evening", "junya", "midnight", "duty", "offDuty", "training", "paid", "off")

  val markEmojis: List<String> = listOf("🌅", "🌤️", "☀️", "🌇", "🌆", "🌜", "🌙", "🌛", "⭐️", "🌿", "🌷", "🛌", "☕️", "🌴", "✈️", "❤️", "💼", "💻", "🏢", "🏠", "👥", "📞", "📚", "⏰", "🏪", "🍽️", "✂️", "🔧", "🚚", "🚗", "🚃", "🧑‍🏫", "🏥", "🩺", "💉", "🚑", "🚒", "🚓", "🫶", "👶", "🎓", "🎵", "💪", "🐾", "🛍️", "🎁", "🎉", "📅")

  val markIcons: List<String> = listOf("letter", "sunHorizon", "cloudSun", "sun", "cloudMoon", "moon", "moonStar", "star", "leaf", "flower", "bed", "couch", "coffee", "treePalm", "plane", "heart", "briefcase", "laptop", "building", "house", "users", "phone", "book", "clock", "storefront", "utensils", "scissors", "wrench", "truck", "car", "train", "teacher", "hospital", "stethoscope", "syringe", "ambulance", "siren", "shield", "handHeart", "baby", "graduationCap", "music", "dumbbell", "pawPrint", "shoppingBag", "gift", "partyPopper", "calendarCheck")

  data class LookHint(val words: List<String>, val emoji: String, val icon: String)

  val lookHints: List<LookHint> = listOf(
    LookHint(listOf("待機", "オンコール"), "📞", "phone"),
    LookHint(listOf("在宅", "テレワーク"), "🏠", "house"),
    LookHint(listOf("出張"), "💼", "briefcase"),
    LookHint(listOf("会議", "ミーティング"), "👥", "users"),
    LookHint(listOf("研修", "勉強", "講習", "学校"), "📚", "book"),
    LookHint(listOf("当番", "当直"), "🚒", "siren"),
    LookHint(listOf("非番"), "🛌", "bed"),
    LookHint(listOf("有休", "有給", "年休"), "🌷", "flower"),
    LookHint(listOf("明け"), "🌅", "sunHorizon"),
    LookHint(listOf("夕"), "🌆", "sunHorizon"),
    LookHint(listOf("準夜"), "🌜", "cloudMoon"),
    LookHint(listOf("深夜", "夜"), "🌙", "moon"),
    LookHint(listOf("早"), "🌤️", "cloudSun"),
    LookHint(listOf("遅"), "🌇", "cloudMoon"),
    LookHint(listOf("休", "公"), "🌿", "leaf"),
    LookHint(listOf("日", "昼"), "☀️", "sun"),
  )

  const val FALLBACK_EMOJI = "⭐️"
  const val FALLBACK_ICON = "letter"

  val rosterTemplates: List<JobTemplate> = listOf(
    JobTemplate(id = "two-shift", title = "二交代制", note = "日勤と夜勤、夜勤の翌日は明け", patternIds = listOf("day", "night", "after", "off"), sequence = null, weekly = false, custom = false),
    JobTemplate(id = "three-shift", title = "三交代制", note = "日勤・準夜・深夜", patternIds = listOf("day", "junya", "midnight", "off"), sequence = null, weekly = false, custom = false),
    JobTemplate(id = "two-shift-early-late", title = "二交代制 + 早番・遅番", note = "時間の違う日勤が混ざる", patternIds = listOf("early", "day", "late", "night", "after", "off"), sequence = null, weekly = false, custom = false),
    JobTemplate(id = "roster-custom", title = "自分で作る", note = "まずは二交代制で始めて、あとで設定から変えられます", patternIds = listOf("day", "night", "after", "off"), sequence = null, weekly = false, custom = false),
  )

  val rotationTemplates: List<JobTemplate> = listOf(
    JobTemplate(id = "duty", title = "当番・非番・休み", note = "消防などの24時間勤務", patternIds = listOf("duty", "offDuty", "off"), sequence = listOf("duty", "offDuty", "off"), weekly = false, custom = false),
    JobTemplate(id = "factory", title = "日勤・夕勤・深夜の交代", note = "工場などの3交代（2日ずつ回る例）", patternIds = listOf("day", "evening", "midnight", "off"), sequence = listOf("day", "day", "evening", "evening", "midnight", "midnight", "off", "off"), weekly = false, custom = false),
    JobTemplate(id = "weekdays", title = "平日は日勤、土日は休み", note = "曜日で決まっている勤務", patternIds = listOf("day", "off"), sequence = listOf("off", "day", "day", "day", "day", "day", "off"), weekly = true, custom = false),
    JobTemplate(id = "rotation-custom", title = "自分で作る", note = "並びを組み立てる", patternIds = listOf("duty", "offDuty", "day", "night", "after", "off"), sequence = listOf(), weekly = false, custom = true),
  )
}

/** A kind of work はじめの設定 and 新しい仕事にする offer (design/src/patterns.ts). */
data class JobTemplate(
  val id: String,
  val title: String,
  val note: String,
  val patternIds: List<String>,
  val sequence: List<String>?,
  val weekly: Boolean,
  val custom: Boolean,
)
