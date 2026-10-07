import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › 働き方 (/design's WorkStylePage, RepeatEditorPage and
// RosterSwitchPage; spec/shift-patterns.md, Repeating orders): whether
// shifts come round in a fixed order, the order in use, starting a new one
// or correcting it, and stopping it.

/// The milliseconds now, for an edit's clock.
private func nowMs() -> Int64 {
  Int64(Date.now.timeIntervalSince1970 * 1000)
}

/// The 1st of next month: where a new order, or stopping one, starts
/// unless picked.
private var nextMonthStart: Day {
  Day.today.firstOfMonth.addingMonths(1)
}

/// The day as M/D, as the buttons say it.
private func shortDay(_ day: Day) -> String {
  "\(day.month)/\(day.day)"
}

/// The person's patterns and orders, read again as they change.
private struct WorkValues: FetchKeyRequest, Hashable {
  struct Value: Hashable, Sendable {
    var patterns: [Pattern] = []
    var orders: [RepeatOrder] = []
  }

  func fetch(_ db: Database) throws -> Value {
    Value(patterns: try OwnValues.patterns(in: db), orders: try OwnValues.repeatOrders(in: db))
  }
}

extension [RepeatOrder] {
  /// The order in use, while it repeats.
  var current: RepeatOrder? {
    last.flatMap { $0.sequence.isEmpty ? nil : $0 }
  }
}

/// The person's repeating orders, read again as they change.
struct RepeatOrdersRequest: FetchKeyRequest, Hashable {
  func fetch(_ db: Database) throws -> [RepeatOrder] {
    try OwnValues.repeatOrders(in: db)
  }
}

/// 設定's 働き方 row: how long the order in use runs, or 繰り返しなし.
func workSummary(_ orders: [RepeatOrder]) -> String {
  orders.current.map { "\($0.sequence.count)日ごとの繰り返し" } ?? "繰り返しなし"
}

/// A sequence in a line, runs of a pattern counted: 日勤×2・夕勤×2.
private func sequenceLabel(_ sequence: [PatternID], _ patterns: [PatternID: Pattern]) -> String {
  guard !sequence.isEmpty else { return "繰り返しなし" }
  var runs: [(String, Int)] = []
  for id in sequence {
    let name = patterns[id]?.name ?? "削除したパターン"
    if let last = runs.last, last.0 == name {
      runs[runs.count - 1].1 += 1
    } else {
      runs.append((name, 1))
    }
  }
  return runs.map { $0.1 > 1 ? "\($0.0)×\($0.1)" : $0.0 }.joined(separator: "・")
}

/// 設定 › 働き方.
struct WorkStylePage: View {
  @Environment(\.themeColors) private var colors
  @Dependency(\.defaultDatabase) private var database
  @Fetch(WorkValues()) private var values = WorkValues.Value()

  var body: some View {
    let byID = Dictionary(values.patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let current = values.orders.current
    List {
      Section("今の働き方") {
        Label {
          Text(current == nil ? "シフトがその都度決まる" : "決まった順番で回っている")
        } icon: {
          Text(current == nil ? "📋" : "🔁")
        }
      }
      .settingsRows()

      if let current {
        Section {
          VStack(alignment: .leading, spacing: 10) {
            HStack {
              Text("今の繰り返し").font(.subheadline.weight(.semibold))
              Spacer()
              Text("\(current.sequence.count)日ごと")
                .font(.subheadline)
                .foregroundStyle(colors.textSecondary)
            }
            SequenceTiles(sequence: current.sequence, patterns: byID)
            Text("\(dayName(current.start))から")
              .font(.footnote)
              .foregroundStyle(colors.textTertiary)
          }
          .padding(.vertical, 4)
          Toggle(
            "祝日は休みにする",
            isOn: Binding(get: { current.holidaysOff }, set: setHolidaysOff))
          .disabled(!current.holidaysOff && holidayShift(of: values.patterns) == nil)
          NavigationLink("新しい繰り返しにする") {
            RepeatEditor(mode: .switch)
          }
          NavigationLink("今の繰り返しを直す") {
            RepeatEditor(mode: .fix)
          }
        } footer: {
          Text("異動などで順番が変わるときは、切り替える日を選んで新しい繰り返しにします。それより前のシフトは、そのまま残ります。")
        }
        .settingsRows()
      }

      Section("働き方を変える") {
        NavigationLink {
          if current == nil {
            RepeatEditor(mode: .first)
          } else {
            RosterSwitchPage()
          }
        } label: {
          Label {
            Text(current == nil ? "決まった順番で回すようにする" : "順番で入れるのをやめる")
            Text("シフトパターンはそのまま")
          } icon: {
            Text(current == nil ? "🔁" : "📋")
          }
        }
        NavigationLink {
          JobChangePage()
        } label: {
          Label {
            Text("新しい仕事にする")
            Text("シフトパターンも選び直す")
          } icon: {
            Text("💼")
          }
        }
      }
      .settingsRows()

      if values.orders.count > 1 {
        Section("これまで") {
          ForEach(Array(values.orders.enumerated().reversed()), id: \.offset) { index, order in
            let end = index + 1 < values.orders.count
              ? values.orders[index + 1].start.adding(days: -1) : nil
            LabeledContent(
              "\(shortDay(order.start))〜\(end.map(shortDay) ?? "")",
              value: sequenceLabel(order.sequence, byID))
          }
        }
        .settingsRows()
      }
    }
    .settingsList()
    .navigationTitle("働き方")
  }

  private func setHolidaysOff(_ on: Bool) {
    try? database.write { try OwnValues.setHolidaysOff(on, now: nowMs(), in: $0) }
  }
}

/// An order's days as its editor draws them, smaller and not to press:
/// seven a row, so a week reads as one; each says its place, or, for an
/// order that starts on a Sunday, its weekday.
struct SequenceTiles: View {
  @Environment(\.themeColors) private var colors
  let sequence: [PatternID]
  let patterns: [PatternID: Pattern]
  var weekly = false

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
      ForEach(Array(sequence.enumerated()), id: \.offset) { index, id in
        VStack(spacing: 1) {
          Text(weekly ? WeekdayRow.names[index % 7] : "\(index + 1)")
            .font(.system(size: 9))
            .foregroundStyle(tone(index))
          if let pattern = patterns[id] {
            ShiftMark(pattern: pattern, size: 16)
          }
          Text(patterns[id]?.name ?? "削除")
            .font(.system(size: 10))
            .foregroundStyle(colors.textSecondary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(colors.borderDefault))
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      sequence.map { patterns[$0]?.name ?? "削除したパターン" }.joined(separator: "、"))
  }

  private func tone(_ index: Int) -> Color {
    guard weekly else { return colors.textTertiary }
    switch index % 7 {
    case 0: return colors.calendarHoliday
    case 6: return colors.calendarSaturday
    default: return colors.textTertiary
    }
  }
}

/// A kind of work's patterns as ポチポチ入力's keys will show them,
/// smaller and not to press: the buttons it gives, in no order of days, as
/// wide as an order's days beside them.
struct KeysPreview: View {
  @Environment(\.themeColors) private var colors
  let patternIDs: [PatternID]
  let patterns: [PatternID: Pattern]

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
      ForEach(patternIDs, id: \.self) { id in
        VStack(spacing: 3) {
          if let pattern = patterns[id] {
            ShiftMark(pattern: pattern, size: 16)
          }
          Text(patterns[id]?.name ?? "")
            .font(.system(size: 10))
            .foregroundStyle(colors.textPrimary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(colors.borderDefault))
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(patternIDs.compactMap { patterns[$0]?.name }.joined(separator: "、"))
  }
}

/// How a sequence is being set: the first, a new one from a day, or the
/// one in use corrected.
enum RepeatMode {
  case first, `switch`, fix

  var title: String {
    switch self {
    case .first: "繰り返しを設定"
    case .switch: "新しい繰り返し"
    case .fix: "今の繰り返しを直す"
    }
  }

  var dayLabel: String {
    switch self {
    case .first: "始める日"
    case .switch: "切り替える日"
    case .fix: "並びの1日目"
    }
  }

  var action: String {
    switch self {
    case .first: "から繰り返す"
    case .switch: "から切り替える"
    case .fix: "から入れ直す"
    }
  }
}

/// A sequence built from the person's patterns, the day it starts on,
/// 祝日は休みにする and the first two weeks; saved as a new order, or as the
/// one in use corrected, which keeps its start and moves only the day its
/// first shift falls on.
private struct RepeatEditor: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @Fetch(WorkValues()) private var values = WorkValues.Value()
  let mode: RepeatMode
  @State private var sequence: [PatternID]?
  @State private var day: Day?
  /// Set by hand; until then it follows holidaysOffByDefault.
  @State private var holidaysOff: Bool?
  /// A day of the sequence chosen, to put another pattern in its place or
  /// take it out; with none, keys add to the end.
  @State private var selected: Int?

  var body: some View {
    let byID = Dictionary(values.patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let current = values.orders.current
    let steps = sequence ?? initialSequence
    let picked = day ?? (mode == .fix ? (current?.anchor ?? current?.start) : nil) ?? nextMonthStart
    let start = mode == .fix ? current?.start ?? picked : picked
    let offShift = holidayShift(of: values.patterns)
    let holidays =
      offShift != nil
      && (holidaysOff ?? (mode == .fix ? current?.holidaysOff : nil)
        ?? holidaysOffByDefault(steps, start: picked, patterns: byID))
    Form {
      Section {
        DatePicker(
          mode.dayLabel,
          selection: Binding { date(of: picked) } set: { day = Day($0, in: .current) },
          displayedComponents: .date)
      }
      .settingsRows()

      Section {
        SequenceBuilder(
          steps: Binding(get: { steps }, set: { sequence = $0 }), patterns: values.patterns,
          first: picked, selected: $selected)
      } header: {
        HStack {
          Text("並び")
          Spacer()
          Text(steps.isEmpty ? "下から順番に追加してください" : "\(steps.count)日ごとに繰り返し")
        }
      } footer: {
        if selected != nil {
          Text("下のパターンを押すと、選んだ日と置き換わります。")
        } else {
          Text(mode == .fix ? "並びの1つ目のシフトが入る日を選びます。" : "\(mode.dayLabel)が、並びの1日目になります。")
        }
      }
      .settingsRows()

      Section {
        Toggle("祝日は休みにする", isOn: Binding(get: { holidays }, set: { holidaysOff = $0 }))
          .disabled(offShift == nil)
      }
      .settingsRows()

      if !steps.isEmpty {
        Section {
          Preview(
            schedule: repeatSchedule(
              steps, anchor: picked, from: start, through: start.adding(days: 13),
              holidayShift: holidays ? offShift : nil, holidayCountry: country),
            start: start, patterns: byID)
        } footer: {
          if mode == .fix {
            Text("\(dayName(start))からのシフトを入れ直します。その間に自分で直した日も、並びのとおりに戻ります。")
          }
        }
        .settingsRows()
      }

      Section {
        Button {
          save(steps, start: start, anchor: picked, holidays: holidays, shift: offShift)
        } label: {
          Label("\(shortDay(start))\(mode.action)", systemImage: "arrow.right")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .disabled(steps.isEmpty)
        .settingsOnPage()
      }
    }
    .settingsList()
    .navigationTitle(mode.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  /// The sequence it starts from: the order in use's when correcting it,
  /// else the newest that repeated.
  private var initialSequence: [PatternID] {
    if mode == .fix { return values.orders.current?.sequence ?? [] }
    return values.orders.last { !$0.sequence.isEmpty }?.sequence ?? []
  }

  /// The device's region, whose holidays a new order takes.
  private var country: String {
    Locale.current.region?.identifier ?? "JP"
  }

  private func date(of day: Day) -> Date {
    Calendar.current.date(from: DateComponents(year: day.year, month: day.month, day: day.day))
      ?? .now
  }

  private func save(
    _ steps: [PatternID], start: Day, anchor: Day, holidays: Bool, shift: PatternID?
  ) {
    let order = RepeatOrder(
      sequence: steps, start: start, anchor: anchor, holidaysOff: holidays,
      holidayShift: holidays ? shift : nil,
      holidayCountry: mode == .fix ? values.orders.current?.holidayCountry ?? country : country)
    try? database.write {
      if mode == .fix {
        try OwnValues.fix(order, now: nowMs(), in: $0)
      } else {
        try OwnValues.start(order, now: nowMs(), in: $0)
      }
    }
    dismiss()
  }
}

/// The first two weeks of an order, a row of seven days with each mark.
private struct Preview: View {
  @Environment(\.themeColors) private var colors
  let schedule: [Day: PatternID]
  let start: Day
  let patterns: [PatternID: Pattern]

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 8) {
      ForEach(0..<14, id: \.self) { offset in
        let day = start.adding(days: offset)
        VStack(spacing: 2) {
          Text("\(day.day)")
            .font(.caption2)
            .foregroundStyle(tone(day))
          if let pattern = schedule[day].flatMap({ patterns[$0] }) {
            ShiftMark(pattern: pattern, size: 16)
          } else {
            Color.clear.frame(width: 16, height: 16)
          }
        }
      }
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("はじめの2週間")
  }

  private func tone(_ day: Day) -> Color {
    if day.weekday == 0 || Holidays.name(on: day.key, in: "JP") != nil {
      return colors.calendarHoliday
    }
    return day.weekday == 6 ? colors.calendarSaturday : colors.textSecondary
  }
}

/// 順番をやめる: from a day, days are entered by hand again; those before
/// keep their shifts.
private struct RosterSwitchPage: View {
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @State private var day = nextMonthStart

  var body: some View {
    Form {
      Section {
        DatePicker(
          "やめる日",
          selection: Binding {
            Calendar.current.date(
              from: DateComponents(year: day.year, month: day.month, day: day.day)) ?? .now
          } set: { day = Day($0, in: .current) },
          displayedComponents: .date)
      } footer: {
        Text("この日からの繰り返しのシフトは消えて、空いた状態になります。前の日までのシフトは、そのまま残ります。")
      }
      .settingsRows()

      Section {
        Button {
          let order = RepeatOrder(
            sequence: [], start: day, holidayCountry: Locale.current.region?.identifier ?? "JP")
          try? database.write { try OwnValues.start(order, now: nowMs(), in: $0) }
          dismiss()
        } label: {
          Label("\(shortDay(day))から順番をやめる", systemImage: "arrow.right")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .settingsOnPage()
      }
    }
    .settingsList()
    .navigationTitle("順番をやめる")
    .navigationBarTitleDisplayMode(.inline)
  }
}

/// An order's sequence typed as ポチポチ入力 enters days: the patterns'
/// keys add to its end and ⌫ takes the last day back; a day pressed is
/// chosen, a key then takes its place and ⌫ takes it out. With the day it
/// starts on, each day says its date and weekday.
struct SequenceBuilder: View {
  @Environment(\.themeColors) private var colors
  @Binding var steps: [PatternID]
  let patterns: [Pattern]
  /// The first day's date, when it is known.
  let first: Day?
  @Binding var selected: Int?
  @State private var keyPage = 0

  var body: some View {
    let byID = Dictionary(patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
      ForEach(Array(steps.enumerated()), id: \.offset) { index, id in
        let date = first?.adding(days: index)
        let isSelected = selected == index
        Button {
          selected = isSelected ? nil : index
        } label: {
          VStack(spacing: 2) {
            if let date {
              Text("\(date.month)/\(date.day)\(WeekdayRow.names[date.weekday])")
                .font(.system(size: 9))
                .foregroundStyle(weekdayTone(date))
            } else {
              Text("\(index + 1)").font(.system(size: 9)).foregroundStyle(colors.textTertiary)
            }
            if let pattern = byID[id] {
              ShiftMark(pattern: pattern, size: 18)
            }
            Text(byID[id]?.name ?? "削除").font(.caption2).lineLimit(1)
          }
          .frame(maxWidth: .infinity, minHeight: 58)
          .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
          .overlay {
            RoundedRectangle(cornerRadius: Radius.sm)
              .strokeBorder(isSelected ? colors.accentDefault : colors.borderDefault, lineWidth: isSelected ? 2 : 1)
          }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(index + 1)日目、\(date.map(dayName) ?? "")、\(byID[id]?.name ?? "削除したパターン")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(isSelected ? "" : "選ぶと、置き換えたり消したりできます")
      }
    }
    .padding(.vertical, 4)
    PatternKeys(patterns: patterns, page: $keyPage) { pattern in
      var next = steps
      if let selected, selected < next.count {
        next[selected] = pattern.id
        self.selected = nil
      } else {
        next.append(pattern.id)
      }
      steps = next
    }
    .padding(.vertical, 4)
    HStack {
      let pages = (patterns.count + patternsPerPage - 1) / patternsPerPage
      if pages > 1 {
        PageDots(count: pages, current: $keyPage, label: "シフトのページ")
      }
      Spacer()
      Button(selected == nil ? "1つ消す" : "選んだ日を消す", systemImage: "delete.left") {
        var next = steps
        if let selected, selected < next.count {
          next.remove(at: selected)
        } else if !next.isEmpty {
          next.removeLast()
        }
        selected = nil
        steps = next
      }
      .font(.subheadline)
      .disabled(steps.isEmpty)
    }
  }

  /// A date's color by its weekday: Sundays and holidays red, Saturdays
  /// blue.
  private func weekdayTone(_ day: Day) -> Color {
    if day.weekday == 0 || Holidays.name(on: day.key, in: "JP") != nil {
      return colors.calendarHoliday
    }
    return day.weekday == 6 ? colors.calendarSaturday : colors.textTertiary
  }
}
