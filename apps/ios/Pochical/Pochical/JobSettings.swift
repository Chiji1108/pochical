import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › 働き方 › 新しい仕事にする (/design's JobChangePage and
// WorkSetupSteps; spec/shift-patterns.md, Changing jobs): the day the new
// job starts, then the questions はじめの設定 asks, ending with its
// patterns taking over and its order from that day.

/// The ready-made patterns by id, as the questions show them.
private let readyByID: [PatternID: Pattern] = Dictionary(
  ReadyPatterns.all.map { ready in
    (ready.id, Pattern(ready, keeping: Set(ReadyPatterns.all.map(\.id))))
  },
  uniquingKeysWith: { first, _ in first })

/// Where the questions are.
private enum JobStep: Hashable {
  case day, kind, roster, rotation
  case custom(JobTemplate)
  case anchor(JobTemplate, [PatternID])
}

/// 新しい仕事にする.
struct JobChangePage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @State private var start = Day.today.firstOfMonth.addingMonths(1)
  @State private var steps: [JobStep] = [.day]
  @State private var sequence: [PatternID] = []
  @State private var chosen: Int?
  @State private var anchor: Day?

  var body: some View {
    let step = steps.last ?? .day
    Form {
      switch step {
      case .day: dayStep
      case .kind: kindStep
      case .roster: templates(ReadyPatterns.rosterTemplates)
      case .rotation: templates(ReadyPatterns.rotationTemplates)
      case .custom(let template): customStep(template)
      case .anchor(let template, let sequence): anchorStep(template, sequence)
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
      Text("新しい仕事の働き方とシフトパターンを、はじめの設定と同じ質問で選び直します。")
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
    question("新しい仕事のシフトはどう決まりますか？", "前の仕事のシフトは、そのまま残ります。")
    Section {
      option("📋", "シフトがその都度決まる", "勤務表・シフト表・店長からの連絡など") { go(.roster) }
      option("🔁", "決まった順番で回っている", "消防・工場の交代勤務・曜日で固定など") { go(.rotation) }
    }
    .settingsRows()
  }

  @ViewBuilder private func templates(_ templates: [JobTemplate]) -> some View {
    question("近い働き方を選んでください", "あとから名前や時間を変えられます。")
    // One list, a row each, as the system's settings list choices.
    Section {
      ForEach(templates) { template in
        Button {
          choose(template)
        } label: {
          HStack {
            VStack(alignment: .leading, spacing: 6) {
              Text(template.title).font(.headline).foregroundStyle(colors.textPrimary)
              Text(template.note).font(.footnote).foregroundStyle(colors.textSecondary)
              // An order's days, or the keys a roster's work gives.
              if let sequence = template.sequence, !template.custom {
                SequenceTiles(sequence: sequence, patterns: readyByID, weekly: template.weekly)
                  .padding(.top, 2)
              } else if !template.custom {
                KeysPreview(patternIDs: template.patternIDs, patterns: readyByID)
                  .padding(.top, 2)
              }
            }
            Spacer(minLength: 8)
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

  @ViewBuilder private func customStep(_ template: JobTemplate) -> some View {
    question("並びを組み立てる", "1日目から順番に、シフトを追加してください。")
    Section {
      SequenceBuilder(
        steps: $sequence, patterns: template.patternIDs.compactMap { readyByID[$0] }, first: nil,
        selected: $chosen)
    } header: {
      HStack {
        Text("並び")
        Spacer()
        Text(sequence.isEmpty ? "下から順番に追加してください" : "\(sequence.count)日ごとに繰り返し")
      }
    }
    .settingsRows()
    Section {
      next("次へ") { askAnchor(template, sequence) }
        .disabled(sequence.isEmpty)
    }
  }

  @ViewBuilder private func anchorStep(_ template: JobTemplate, _ sequence: [PatternID])
    -> some View
  {
    let first = sequence.first.flatMap { readyByID[$0]?.name } ?? ""
    question("「\(first)」の日を1日選んでください", "今日でも、これからの日でも大丈夫です。")
    Section {
      DatePicker(
        "\(first)の日",
        selection: Binding { date(of: anchor ?? start) } set: { anchor = Day($0, in: .current) },
        displayedComponents: .date)
      .datePickerStyle(.graphical)
    }
    .settingsRows()
    if let anchor {
      Section {
        TwoWeeks(
          schedule: repeatSchedule(
            sequence, anchor: anchor, from: anchor, through: anchor.adding(days: 13),
            holidayCountry: country),
          start: anchor)
      } header: {
        Text("\(dayName(anchor))からの2週間")
      }
      .settingsRows()
      Section {
        next("\(start.month)/\(start.day)から切り替える") {
          finish(template, sequence: sequence, anchor: anchor)
        }
      }
    }
  }

  // MARK: Pieces

  private func question(_ title: String, _ description: String) -> some View {
    Section {
      VStack(alignment: .leading, spacing: 6) {
        Text(title).font(.title3.bold()).foregroundStyle(colors.textPrimary)
        Text(description).font(.subheadline).foregroundStyle(colors.textSecondary)
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
          Text(note).font(.footnote).foregroundStyle(colors.textSecondary)
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

  private func next(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Label(title, systemImage: "arrow.right").frame(maxWidth: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .settingsOnPage()
  }

  // MARK: Doing

  private func go(_ step: JobStep) {
    withAnimation { steps.append(step) }
  }

  /// A kind of work picked: a roster's patterns, or a weekly order, end
  /// the questions; others go on to building their order or its first day.
  private func choose(_ template: JobTemplate) {
    if template.custom {
      sequence = []
      chosen = nil
      go(.custom(template))
    } else if let order = template.sequence {
      if template.weekly {
        // A week starts on Sunday: its order lines up with the weekdays.
        finish(template, sequence: order, anchor: start.adding(days: -start.weekday))
      } else {
        askAnchor(template, order)
      }
    } else {
      finish(template, sequence: [], anchor: start)
    }
  }

  /// Asks for a day on the order's first shift, starting from the new
  /// job's first day: a date picker always has one chosen, so it counts
  /// until another is picked.
  private func askAnchor(_ template: JobTemplate, _ order: [PatternID]) {
    anchor = start
    go(.anchor(template, order))
  }

  private func finish(_ template: JobTemplate, sequence: [PatternID], anchor: Day) {
    let ids = Set(template.patternIDs)
    let incoming = template.patternIDs.compactMap(ReadyPatterns.pattern).map {
      Pattern($0, keeping: ids)
    }
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    try? database.write {
      try OwnValues.changeJob(
        to: incoming, sequence: sequence, start: start, anchor: anchor,
        holidayCountry: country, now: now, in: $0)
    }
    dismiss()
  }

  private var country: String {
    Locale.current.region?.identifier ?? "JP"
  }

  private func date(of day: Day) -> Date {
    Calendar.current.date(from: DateComponents(year: day.year, month: day.month, day: day.day))
      ?? .now
  }
}

/// Two weeks of an order from its first day, a mark a day.
private struct TwoWeeks: View {
  @Environment(\.themeColors) private var colors
  let schedule: [Day: PatternID]
  let start: Day

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 8) {
      ForEach(0..<14, id: \.self) { offset in
        let day = start.adding(days: offset)
        VStack(spacing: 2) {
          Text("\(day.day)").font(.caption2).foregroundStyle(colors.textSecondary)
          if let pattern = schedule[day].flatMap({ readyByID[$0] }) {
            ShiftMark(pattern: pattern, size: 16)
          }
        }
      }
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("最初の2週間")
  }
}
