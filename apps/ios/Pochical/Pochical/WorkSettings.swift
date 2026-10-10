import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › 繰り返し (/design's RepeatPage, RepeatPeriodPage,
// RepeatEditorPage and StopRepeatPage; spec/shift-patterns.md, Repeating
// orders): the periods of orders, each set again, moved or taken out, and
// new ones, or ones without repeating, put in from a day.

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
  /// The period in use today, while it repeats.
  var current: RepeatOrder? {
    let today = Day.today
    return last { $0.start <= today }.flatMap { $0.sequence.isEmpty ? nil : $0 }
  }
}

/// The person's repeating orders, read again as they change.
struct RepeatOrdersRequest: FetchKeyRequest, Hashable {
  func fetch(_ db: Database) throws -> [RepeatOrder] {
    try OwnValues.repeatOrders(in: db)
  }
}

/// 設定's 繰り返し row: how often today's period comes round, or なし.
func repeatSummary(_ orders: [RepeatOrder]) -> String {
  orders.current.map { "\($0.sequence.count)日ごと" } ?? "なし"
}

/// When a period runs: from its start to the day before the next one's.
private func periodText(_ orders: [RepeatOrder], _ index: Int) -> String {
  let start = orders[index].start.slashText
  guard index + 1 < orders.count else { return "\(start)から" }
  return "\(start)〜\(orders[index + 1].start.adding(days: -1).slashText)"
}

/// 設定 › 繰り返し (/design's RepeatPage): the periods, which never
/// overlap, as cards newest first under the rows that add one: those to
/// come, the one in use today and those over. Each opens to be set again,
/// moved or taken out (spec/shift-patterns.md, Repeating orders).
struct RepeatPage: View {
  @Environment(\.themeColors) private var colors
  @Fetch(WorkValues()) private var values = WorkValues.Value()
  @State private var going: RepeatGoing?

  var body: some View {
    let orders = values.orders
    let byID = Dictionary(values.patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let today = Day.today
    let inUse = orders.lastIndex { $0.start <= today }
    let newestFirst = Array(orders.indices.reversed())
    List {
      if orders.isEmpty {
        Section {
          NavigationLink {
            RepeatEditor(mode: .first)
          } label: {
            LabeledContent("繰り返しを設定する", value: "なし")
          }
        } footer: {
          Text("当番・非番や交代勤務のように順番で回るシフトを、カレンダーに自動で入れられます。違う日だけ、カレンダーで変えられます。")
        }
        .settingsRows()
      } else {
        // Over the newest first, where a new period mostly lands.
        Section {
          NavigationLink {
            RepeatEditor(mode: .switch)
          } label: {
            Label("新しい繰り返しを追加", systemImage: "plus")
              .foregroundStyle(colors.accentDefault)
          }
          NavigationLink {
            StopRepeatPage()
          } label: {
            Label {
              Text("繰り返しをやめる")
            } icon: {
              Image(systemName: "circle.slash").foregroundStyle(colors.textSecondary)
            }
          }
        } footer: {
          Text("どちらも、選んだ日から切り替わります。前後の期間と、自分で入れた日は、そのまま残ります。")
        }
        .settingsRows()
        cards("これから", newestFirst.filter { $0 > (inUse ?? -1) }, byID)
        cards("今の繰り返し", inUse.map { [$0] } ?? [], byID)
        cards("これまで", newestFirst.filter { $0 < (inUse ?? -1) }, byID)
      }
    }
    .settingsList()
    .navigationTitle("繰り返し")
    .navigationDestination(item: $going) { going in
      switch going {
      case .period(let start): RepeatPeriodPage(start: start)
      }
    }
  }

  @ViewBuilder private func cards(
    _ title: String, _ indices: [Int], _ byID: [PatternID: Pattern]
  ) -> some View {
    if !indices.isEmpty {
      Section(title) {
        ForEach(indices, id: \.self) { index in
          let order = values.orders[index]
          Button {
            going = .period(order.start)
          } label: {
            OrderCard(order: order, period: periodText(values.orders, index), patterns: byID)
          }
          .buttonStyle(.plain)
          .settingsOnPage()
          .listRowSeparator(.hidden)
          .padding(.bottom, index == indices.last ? 0 : 12)
        }
      }
    }
  }
}

/// One period on 繰り返し (/design's OrderCard): when it runs, its days
/// and how often they come round, on a card that opens it.
private struct OrderCard: View {
  @Environment(\.themeColors) private var colors
  let order: RepeatOrder
  let period: String
  let patterns: [PatternID: Pattern]

  var body: some View {
    let repeats = !order.sequence.isEmpty
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline) {
          Text(period).font(.footnote.weight(.semibold))
          Spacer()
          Text(repeats ? "\(order.sequence.count)日ごと" : "繰り返しなし")
            .font(.footnote)
            .foregroundStyle(colors.textTertiary)
        }
        .padding(.bottom, 12)
        if repeats {
          SequenceTiles(sequence: order.sequence, patterns: patterns)
          if order.holidaysOff {
            Text("祝日は\(order.holidayShift.flatMap { patterns[$0]?.name } ?? "休み")")
              .font(.footnote)
              .foregroundStyle(colors.textTertiary)
              .padding(.top, 12)
          }
        } else {
          Text("自分で入れる期間")
            .font(.footnote)
            .foregroundStyle(colors.textTertiary)
        }
      }
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(colors.textQuaternary)
        .accessibilityHidden(true)
    }
    .foregroundStyle(colors.textPrimary)
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
    .contentShape(RoundedRectangle(cornerRadius: Radius.xxl))
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(period)の繰り返し")
  }
}

/// A period opened from 繰り返し (/design's RepeatPeriodPage): its order to
/// type again on the calendar, the day it starts, 祝日は休みにする, and
/// taking it out. It starts after the period before starts and before the
/// next one does, so moving it never runs over either.
private struct RepeatPeriodPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(\.say) private var say
  @Dependency(\.defaultDatabase) private var database
  @Fetch(WorkValues()) private var values = WorkValues.Value()
  @State var start: Day
  @State private var removing = false

  var body: some View {
    let orders = values.orders
    let byID = Dictionary(values.patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    if let index = orders.firstIndex(where: { $0.start == start }) {
      let order = orders[index]
      let repeats = !order.sequence.isEmpty
      List {
        if repeats {
          Section {
            VStack(alignment: .leading, spacing: 12) {
              HStack(alignment: .firstTextBaseline) {
                Text("並び").font(.footnote.weight(.semibold))
                Spacer()
                Text("\(order.sequence.count)日ごと")
                  .font(.footnote)
                  .foregroundStyle(colors.textTertiary)
              }
              SequenceTiles(sequence: order.sequence, patterns: byID)
            }
            .padding(.vertical, 6)
            NavigationLink("カレンダーで直す") {
              RepeatEditor(mode: .fix(start))
            }
          }
          .settingsRows()
        }
        Section {
          DatePicker(
            "始まる日",
            selection: Binding {
              Calendar.current.date(
                from: DateComponents(year: start.year, month: start.month, day: start.day)) ?? .now
            } set: { move(order, index: index, to: Day($0, in: .current)) },
            displayedComponents: .date)
        } footer: {
          Text(
            repeats
              ? "並びを直しても、自分で入れた日は、そのまま残ります。"
              : "この期間は繰り返さず、カレンダーで1日ずつ入れます。")
        }
        .settingsRows()
        if repeats {
          HolidayChoice(
            patterns: values.patterns,
            on: Binding(get: { order.holidaysOff }, set: { setHolidaysOff($0) }),
            shift: Binding(
              // The one it takes, even one that no longer counts as off.
              get: { order.holidayShift ?? holidayShift(of: values.patterns) },
              set: { setHolidaysOff(true, picking: $0) }))
        }
        Section {
          Button("この期間を削除", role: .destructive) { removing = true }
            .frame(maxWidth: .infinity)
        }
        .settingsRows()
      }
      .settingsList()
      .navigationTitle(periodText(orders, index))
      .navigationBarTitleDisplayMode(.inline)
      .alert("この期間を削除しますか？", isPresented: $removing) {
        Button("キャンセル", role: .cancel) {}
        Button("削除", role: .destructive) { remove() }
      } message: {
        Text(
          index > 0
            ? "前の期間の繰り返しが、そのまま続きます。自分で入れた日は、そのまま残ります。"
            : "この期間には、繰り返しのシフトが入らなくなります。自分で入れた日は、そのまま残ります。")
      }
    }
  }

  /// A new start, kept between the periods around it; its first shift
  /// stays on the day it fell on.
  private func move(_ order: RepeatOrder, index: Int, to day: Day) {
    let orders = values.orders
    let fits =
      (index == 0 || day > orders[index - 1].start)
      && (index + 1 >= orders.count || day < orders[index + 1].start)
    guard fits else {
      say("前後の期間と重なる日にはできません")
      return
    }
    guard day != order.start else { return }
    var moved = order
    moved.anchor = order.anchor ?? order.start
    moved.start = day
    try? database.write { try OwnValues.put(moved, replacing: order.start, now: nowMs(), in: $0) }
    start = day
  }

  private func setHolidaysOff(_ on: Bool, picking: PatternID? = nil) {
    try? database.write {
      try OwnValues.setHolidaysOff(on, picking: picking, from: start, now: nowMs(), in: $0)
    }
  }

  private func remove() {
    try? database.write { try OwnValues.remove(start, now: nowMs(), in: $0) }
    dismiss()
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

/// 祝日は休みにする (/design's HolidayChoice), asked as an order is saved
/// and kept with its period: on, holidays take a pattern that counts as
/// off, picked among them as chips when there are more than one, as
/// 完了's blanks pick theirs. With none, there is nothing for holidays to
/// take, so it is not asked (spec/shift-patterns.md, Holidays).
struct HolidayChoice: View {
  let patterns: [Pattern]
  @Binding var on: Bool
  /// The pattern holidays take while on.
  @Binding var shift: PatternID?

  var body: some View {
    let offs = patterns.filter(\.countsAsOff)
    if !offs.isEmpty {
      Section {
        Toggle(isOn: $on) {
          Text("祝日は休みにする")
          Text("祝日は、並びの代わりに休みにします")
        }
      }
      .settingsRows()
      if on, offs.count > 1 {
        Section {
          WrappingRow(spacing: 8) {
            ForEach(offs, id: \.id) { pattern in
              ChoiceChip(name: pattern.name, picked: pattern.id == shift) {
                shift = pattern.id
              } leading: {
                ShiftMark(pattern: pattern, size: 16)
              }
            }
          }
          .accessibilityElement(children: .contain)
          .accessibilityLabel("祝日に入れるパターン")
          .settingsOnPage()
        }
      }
    }
  }
}

/// How a sequence is being set: the first, a new period from a day, or
/// the period starting on a day set again.
enum RepeatMode: Hashable {
  case first, `switch`
  case fix(Day)

  var title: String {
    switch self {
    case .first: "繰り返しを設定"
    case .switch: "新しい繰り返し"
    case .fix: "繰り返しを直す"
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
    case .first: "この日から、並びのとおりにシフトが入ります。自分で入れた日は、そのまま残ります。"
    case .switch: "この日から、新しい並びのとおりにシフトが入ります。前後の期間と、自分で入れた日は、そのまま残ります。"
    case .fix: "この期間のシフトを、並びのとおりに入れ直します。自分で入れた日は、そのまま残ります。"
    }
  }
}

/// An order typed on the calendar, from the day pressed, with
/// 祝日は休みにする; saved as a new period among the others, or as the
/// period being set again, which keeps its start and moves only the day
/// its first shift falls on. The days the person entered stay.
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
  /// Set by hand in 完了's sheet; until then it follows
  /// holidaysOffByDefault, or the period's own.
  @State private var holidaysOff: Bool?
  /// The pattern holidays take, picked in 完了's sheet.
  @State private var holidayPick: PatternID?
  @State private var confirming = false

  var body: some View {
    let byID = Dictionary(values.patterns.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let current = fixing
    let steps = sequence ?? initialSequence
    let picked = day ?? current.map { $0.anchor ?? $0.start } ?? nextMonthStart
    let start = current?.start ?? picked
    let offShift = holidayShift(
      of: values.patterns, picked: holidayPick ?? current?.holidayShift)
    let holidays =
      offShift != nil
      && (holidaysOff ?? current?.holidaysOff
        ?? holidaysOffByDefault(steps, start: picked, patterns: byID))
    let shown = OwnCalendar(
      days: days, patterns: patternRows, patternOrder: patternOrder, orders: orderRows)
    RepeatCalendar(
      sequence: Binding(get: { steps }, set: { sequence = $0 }),
      anchor: Binding(get: { picked }, set: { day = $0 }),
      cover: current == nil ? .anchor : .from(start), patterns: values.patterns,
      before: shown, holidayShift: holidays ? offShift : nil, holidayCountry: HolidayCountry.current
    )
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
    // The days from its start change, so 完了 asks first, with
    // 祝日は休みにする, which shows behind it on the days.
    .sheet(isPresented: $confirming) {
      // A new period on a day another starts takes its place.
      let replaces = fixing == nil && values.orders.contains { $0.start == start }
      NavigationStack {
        Form {
          Section {
            Text(
              replaces
                ? "この日から始まる繰り返しと入れ替えます。自分で入れた日は、そのまま残ります。" : mode.message
            )
            .font(.subheadline)
            .foregroundStyle(colors.textSecondary)
            .settingsOnPage()
          }
          HolidayChoice(
            patterns: values.patterns,
            on: Binding(get: { holidays }, set: { holidaysOff = $0 }),
            shift: Binding(get: { offShift }, set: { holidayPick = $0 }))
          Section {
            Button {
              confirming = false
              save(steps, start: start, anchor: picked, holidays: holidays, shift: offShift)
            } label: {
              Text(mode.action).frame(maxWidth: .infinity)
            }
            .mainButton()
            .settingsOnPage()
          }
        }
        .settingsList()
        .navigationTitle("\(start.slashText)\(mode.question)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("閉じる", systemImage: "xmark", role: .close) { confirming = false }
          }
        }
      }
      .presentationDetents([.medium, .large])
    }
  }

  /// The period being set again, by its start.
  private var fixing: RepeatOrder? {
    guard case .fix(let start) = mode else { return nil }
    return values.orders.first { $0.start == start }
  }

  /// The sequence it starts from: the period's own when setting it again,
  /// else the newest that repeated.
  private var initialSequence: [PatternID] {
    if let fixing { return fixing.sequence }
    return values.orders.last { !$0.sequence.isEmpty }?.sequence ?? []
  }


  private func save(
    _ steps: [PatternID], start: Day, anchor: Day, holidays: Bool, shift: PatternID?
  ) {
    let order = RepeatOrder(
      sequence: steps, start: start, anchor: anchor, holidaysOff: holidays,
      holidayShift: holidays ? shift : nil,
      holidayCountry: fixing?.holidayCountry ?? HolidayCountry.current)
    try? database.write { try OwnValues.put(order, now: nowMs(), in: $0) }
    dismiss()
  }
}

/// 繰り返しをやめる: a period without repeating from a day, days entered
/// by hand until the next period; the others, and days entered, stay.
private struct StopRepeatPage: View {
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @Fetch(WorkValues()) private var values = WorkValues.Value()
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
        // A period starting that day gives way to this one.
        let replaces = values.orders.contains { $0.start == day }
        Text(
          (replaces ? "この日から始まる繰り返しと入れ替わります。" : "")
            + "この日から、繰り返しのシフトが入らなくなります。あとに別の期間があれば、そこからはその繰り返しになります。自分で入れた日は、そのまま残ります。")
      }
      .settingsRows()

      Section {
        Button {
          let order = RepeatOrder(
            sequence: [], start: day, holidayCountry: HolidayCountry.current)
          try? database.write { try OwnValues.put(order, now: nowMs(), in: $0) }
          dismiss()
        } label: {
          HStack(spacing: 6) {
            Text("\(day.slashText)から繰り返しをやめる")
            Image(systemName: "arrow.right")
          }
          .frame(maxWidth: .infinity)
        }
        .mainButton()
        .settingsOnPage()
      }
    }
    .settingsList()
    .navigationTitle("繰り返しをやめる")
    .navigationBarTitleDisplayMode(.inline)
  }
}

/// Where a card on 繰り返し goes: its period, by its start.
private enum RepeatGoing: Hashable {
  case period(Day)
}
