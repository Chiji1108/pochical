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
            Text("\(current.start.fullText)から")
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
              "\(order.start.slashText)〜\(end.map(\.slashText) ?? "")",
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
  @Environment(Settings.self) private var settings
  let sequence: [PatternID]
  let patterns: [PatternID: Pattern]
  var weekly = false

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
      ForEach(Array(sequence.enumerated()), id: \.offset) { index, id in
        VStack(spacing: 1) {
          Text(weekly ? Day.weekdayNames[index % 7] : "\(index + 1)")
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

  /// A weekday's color as the person's カレンダー settings color it.
  private func tone(_ index: Int) -> Color {
    guard weekly else { return colors.textTertiary }
    let week = settings.device.week
    switch index % 7 {
    case 0 where week.sunday: return colors.calendarHoliday
    case 6 where week.saturday: return colors.calendarSaturday
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

  /// What 完了 asks to do, and asks it as.
  var action: String {
    switch self {
    case .first: "繰り返す"
    case .switch: "切り替える"
    case .fix: "入れ直す"
    }
  }

  var question: String {
    switch self {
    case .first: "から繰り返しますか？"
    case .switch: "から切り替えますか？"
    case .fix: "から入れ直しますか？"
    }
  }

  var message: String {
    switch self {
    case .first: "この日から、並びのとおりにシフトが入ります。前の日までのシフトは、そのまま残ります。"
    case .switch: "この日から、新しい並びのとおりにシフトが入ります。前の日までのシフトは、そのまま残ります。"
    case .fix: "並びのとおりにシフトを入れ直します。その間に自分で直した日も、並びのとおりに戻ります。"
    }
  }
}

/// An order typed on the calendar, from the day pressed, with
/// 祝日は休みにする; saved as a new order, or as the one in use corrected,
/// which keeps its start and moves only the day its first shift falls on.
private struct RepeatEditor: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @Fetch(WorkValues()) private var values = WorkValues.Value()
  /// The days as they show now, for those the order leaves.
  @FetchAll private var days: [DayRow]
  @FetchAll private var patternRows: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll private var orderRows: [RepeatOrderRow]
  let mode: RepeatMode
  @State private var sequence: [PatternID]?
  @State private var day: Day?
  /// Set by hand; until then it follows holidaysOffByDefault.
  @State private var holidaysOff: Bool?
  @State private var confirming = false

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
    let shown = OwnCalendar(
      days: days, patterns: patternRows, patternOrder: patternOrder, orders: orderRows)
    RepeatCalendar(
      sequence: Binding(get: { steps }, set: { sequence = $0 }),
      anchor: Binding(get: { picked }, set: { day = $0 }),
      cover: mode == .fix ? .from(start) : .anchor, patterns: values.patterns,
      before: shown, holidayShift: holidays ? offShift : nil, holidayCountry: HolidayCountry.current
    ) {
      Toggle(isOn: Binding(get: { holidays }, set: { holidaysOff = $0 })) {
        Text("祝日は休み").font(.footnote).foregroundStyle(colors.textSecondary)
      }
      .fixedSize()
      .disabled(offShift == nil)
    }
    .background(colors.backgroundBase)
    .navigationTitle(mode.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.hidden, for: .tabBar)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("完了", systemImage: "checkmark", role: .confirm) { confirming = true }
          .disabled(steps.isEmpty)
      }
    }
    // The days from its start change, so 完了 asks first.
    .alert("\(start.slashText)\(mode.question)", isPresented: $confirming) {
      Button("キャンセル", role: .cancel) {}
      Button(mode.action) {
        save(steps, start: start, anchor: picked, holidays: holidays, shift: offShift)
      }
    } message: {
      Text(mode.message)
    }
  }

  /// The sequence it starts from: the order in use's when correcting it,
  /// else the newest that repeated.
  private var initialSequence: [PatternID] {
    if mode == .fix { return values.orders.current?.sequence ?? [] }
    return values.orders.last { !$0.sequence.isEmpty }?.sequence ?? []
  }


  private func save(
    _ steps: [PatternID], start: Day, anchor: Day, holidays: Bool, shift: PatternID?
  ) {
    let order = RepeatOrder(
      sequence: steps, start: start, anchor: anchor, holidaysOff: holidays,
      holidayShift: holidays ? shift : nil,
      holidayCountry: mode == .fix ? values.orders.current?.holidayCountry ?? HolidayCountry.current : HolidayCountry.current)
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
            sequence: [], start: day, holidayCountry: HolidayCountry.current)
          try? database.write { try OwnValues.start(order, now: nowMs(), in: $0) }
          dismiss()
        } label: {
          Label("\(day.slashText)から順番をやめる", systemImage: "arrow.right")
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
