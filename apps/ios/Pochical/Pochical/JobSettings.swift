import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › シフトパターン › 新しい仕事にする (/design's JobChangePage and
// WorkSetupSteps; spec/shift-patterns.md, Changing jobs): the day the new
// job starts, then the questions はじめの設定 asks, ending with its
// patterns taking over and its order from that day.

/// The ready-made patterns by id, as the questions show them.
let readyByID: [PatternID: Pattern] = Dictionary(
  ReadyPatterns.all.map { ready in
    (ready.id, Pattern(ready, keeping: Set(ReadyPatterns.all.map(\.id))))
  },
  uniquingKeysWith: { first, _ in first })

/// Where the questions are.
private enum JobStep: Hashable {
  case day, kind, roster, rotation
  /// The patterns to use, the kind of work's to start with.
  case patterns(JobTemplate)
  /// The order, typed with the patterns chosen.
  case order(JobTemplate, [PatternID])
}

/// 新しい仕事にする.
struct JobChangePage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @State private var start = Day.today.firstOfMonth.addingMonths(1)
  @State private var steps: [JobStep] = [.day]
  @State private var sequence: [PatternID] = []
  @State private var anchor = Day.today
  @State private var confirming = false
  /// The patterns picked on 使うパターンを選んでください.
  @State private var picked: Set<PatternID> = []

  var body: some View {
    let step = steps.last ?? .day
    if case .order(let template, let patterns) = step {
      orderStep(template, patternIDs: patterns)
    } else {
      questions(step)
    }
  }

  private func questions(_ step: JobStep) -> some View {
    Form {
      switch step {
      case .day: dayStep
      case .kind: kindStep
      case .roster: templates(ReadyPatterns.rosterTemplates, asking: "近い働き方を選んでください")
      case .rotation: templates(ReadyPatterns.rotationTemplates, asking: "どんな順番で回りますか？")
      case .patterns(let template): patternsStep(template)
      case .order: EmptyView()
      }
    }
    .settingsList()
    .navigationTitle(steps.count == 1 ? "新しい仕事にする" : "")
    .navigationBarTitleDisplayMode(.inline)
    // A step back is a question back, the first one leaving.
    .navigationBarBackButtonHidden(steps.count > 1)
    .toolbar {
      if steps.count > 1 {
        ToolbarItem(placement: .topBarLeading) {
          Button("戻る", systemImage: "chevron.left") {
            withAnimation { _ = steps.popLast() }
          }
        }
      }
    }
  }

  // MARK: Steps

  @ViewBuilder private var dayStep: some View {
    Section {
      DatePicker(
        "新しい仕事の初日",
        selection: Binding { date(of: start) } set: { start = Day($0, in: .current) },
        displayedComponents: .date)
    } header: {
      Text("新しい仕事の繰り返しとシフトパターンを、はじめの設定と同じ質問で選び直します。")
        .textCase(nil)
    } footer: {
      Text("前の日までのシフトは、そのまま残ります。この日からのシフトは、新しい仕事に合わせて入れ直します。")
    }
    .settingsRows()
    Section {
      next("次へ") { go(.kind) }
    }
  }

  @ViewBuilder private var kindStep: some View {
    question("新しい仕事のシフトに繰り返しはありますか？", "前の仕事のシフトは、そのまま残ります。")
    Section {
      option("🔁", "繰り返しがある", "当番・非番、工場の交代勤務、曜日で固定など") { go(.rotation) }
      option("📋", "繰り返しはない", "勤務表やシフト表で、その都度決まる") { go(.roster) }
    }
    .settingsRows()
  }

  /// The ready-made ways of working, asked as はじめの設定 asks: a roster's
  /// work, or the order a rotation goes round in.
  @ViewBuilder private func templates(_ templates: [JobTemplate], asking title: String)
    -> some View
  {
    question(title, "あとから名前や時間を変えられます。")
    // One list, a row each, as the system's settings list choices.
    Section {
      ForEach(templates) { template in
        Button {
          picked = Set(template.patternIDs)
          go(.patterns(template))
        } label: {
          HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
              Text(template.title).foregroundStyle(colors.textPrimary)
              Text(template.note).font(.caption).foregroundStyle(colors.textTertiary)
              // An order's days, or the keys a roster's work gives.
              if let sequence = template.sequence, !template.custom {
                SequenceTiles(sequence: sequence, patterns: readyByID, weekly: template.weekly)
                  .padding(.top, 6)
              } else if !template.custom {
                KeysPreview(patternIDs: template.patternIDs, patterns: readyByID)
                  .padding(.top, 6)
              }
            }
            // The keys and days across the row, however short its note.
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(colors.textQuaternary)
          }
          .padding(.vertical, 4)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
      }
    }
    .settingsRows()
  }

  /// The patterns to use, the kind of work's own already picked: 次へ
  /// when an order is typed next, else 完了.
  @ViewBuilder private func patternsStep(_ template: JobTemplate) -> some View {
    let ordering = (template.custom || template.sequence != nil) && !template.startsWeekly
    question(
      "使うパターンを選んでください",
      "選んだものが、ポチポチ入力のボタンになります。名前や時間は、あとから変えられます。")
    Section {
      ReadyPatternChips(picked: $picked, needed: template.needed)
        .frame(maxWidth: .infinity, alignment: .leading)
        .settingsOnPage()
    }
    Section {
      Button {
        choose(template, patterns: chosenPatterns(picked))
      } label: {
        Text(ordering ? "次へ" : "完了").frame(maxWidth: .infinity)
      }
      .mainButton()
      .disabled(picked.isEmpty)
      .settingsOnPage()
    }
  }

  /// The order on the calendar, filling the screen: a kind of work's
  /// own, from the new job's first day, or one typed from nothing; either
  /// typed over, and the day pressed moves where it starts.
  private func orderStep(_ template: JobTemplate, patternIDs: [PatternID]) -> some View {
    let first = template.sequence?.first.flatMap { readyByID[$0]?.name }
    return RepeatCalendar(
      sequence: $sequence, anchor: $anchor, cover: .from(start),
      patterns: patternIDs.compactMap { readyByID[$0] }, holidayCountry: HolidayCountry.current
    )
    .background(colors.backgroundBase)
    .navigationTitle(template.custom || first == nil ? "並びを入れる" : "「\(first ?? "")」の日を押す")
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden()
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button("戻る", systemImage: "chevron.left") {
          withAnimation { _ = steps.popLast() }
        }
      }
      ToolbarItem(placement: .confirmationAction) {
        Button("完了", systemImage: "checkmark", role: .confirm) { confirming = true }
          .disabled(sequence.isEmpty)
      }
    }
    .toolbarVisibility(.hidden, for: .tabBar)
    // The days from the new job's first change, so 完了 asks first.
    .alert("\(start.slashText)から新しい仕事にしますか？", isPresented: $confirming) {
      Button("キャンセル", role: .cancel) {}
      Button("切り替える") { finish(patternIDs, sequence: sequence, anchor: anchor) }
    } message: {
      Text("前の日までのシフトは、そのまま残ります。この日からのシフトは、新しい仕事に合わせて入れ直します。")
    }
  }

  // MARK: Pieces

  private func question(_ title: String, _ description: String) -> some View {
    Section {
      VStack(alignment: .leading, spacing: 6) {
        Text(title).font(.title3.bold()).foregroundStyle(colors.textPrimary)
        Text(description).font(.subheadline).foregroundStyle(colors.textTertiary)
      }
      .settingsOnPage()
    }
  }

  private func option(
    _ emoji: String, _ title: String, _ note: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Text(emoji).font(.title2)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).foregroundStyle(colors.textPrimary)
          Text(note).font(.caption).foregroundStyle(colors.textTertiary)
        }
        Spacer()
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(colors.textQuaternary)
      }
      .padding(.vertical, 4)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
  }

  /// On to the next question, its arrow after the words, as /design's.
  private func next(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Text(title)
        Image(systemName: "arrow.right")
      }
      .frame(maxWidth: .infinity)
    }
    .mainButton()
    .settingsOnPage()
  }

  // MARK: Doing

  private func go(_ step: JobStep) {
    withAnimation { steps.append(step) }
  }

  /// The patterns chosen: a roster's work, or a weekly order, end the
  /// questions; others go on to building their order or its first day.
  private func choose(_ template: JobTemplate, patterns: [PatternID]) {
    if let order = template.sequence, template.weekly {
      // A week starts on Sunday: its order lines up with the weekdays.
      finish(patterns, sequence: order, anchor: start.adding(days: -start.weekday))
    } else if template.custom || template.sequence != nil {
      // Typed from the new job's first day until another is pressed.
      sequence = template.sequence ?? []
      anchor = start
      go(.order(template, patterns))
    } else {
      finish(patterns, sequence: [], anchor: start)
    }
  }

  private func finish(_ patternIDs: [PatternID], sequence: [PatternID], anchor: Day) {
    let incoming = readyPatterns(patternIDs)
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write {
      try OwnValues.changeJob(
        to: incoming, sequence: sequence, start: start, anchor: anchor,
        holidayCountry: HolidayCountry.current, now: now, in: $0)
    }
    ReminderOffer.setUpOrder(sequence)
    dismiss()
  }


  private func date(of day: Day) -> Date {
    Calendar.current.date(from: DateComponents(year: day.year, month: day.month, day: day.day))
      ?? .now
  }
}
