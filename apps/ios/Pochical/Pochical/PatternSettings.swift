import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › シフトパターン (/design's PatternsPage, AddPatternPage,
// PatternEditor and LookEditorPage; spec/shift-patterns.md): the person's
// patterns in ポチポチ入力's order, adding one ready-made or their own,
// changing each, and deleting one no order in use repeats.

/// A pattern's standard time in a line, as a day writes hours, or 時間なし.
func patternTimeText(_ time: ShiftTime?) -> String {
  time.map { hoursText($0.start, $0.end) } ?? "時間なし"
}

/// The milliseconds now, for an edit's clock.
private func nowMs() -> Int64 {
  Int64(Date.now.timeIntervalSince1970 * 1000)
}

/// The person's patterns in their order.
private func ownPatterns(_ rows: [PatternRow], _ order: [PatternOrderRow]) -> [Pattern] {
  OwnCalendar(days: [], patterns: rows, patternOrder: order, orders: []).patterns
}

/// 設定 › シフトパターン.
struct PatternsPage: View {
  @Environment(\.themeColors) private var colors
  @Dependency(\.defaultDatabase) private var database
  @FetchAll private var rows: [PatternRow]
  @FetchAll private var order: [PatternOrderRow]
  @State private var editMode = EditMode.inactive

  var body: some View {
    let patterns = ownPatterns(rows, order)
    let sorting = editMode.isEditing
    List {
      ForEach(Array(patterns.enumerated()), id: \.element.id) { index, pattern in
        // ポチポチ入力 shows them a page at a time: where each page starts,
        // over its first pattern.
        let page = index > 0 && index % patternsPerPage == 0 ? index / patternsPerPage + 1 : nil
        if sorting {
          row(pattern, page: page)
        } else {
          NavigationLink {
            PatternEditor(pattern: pattern, isNew: false)
          } label: {
            row(pattern, page: page)
          }
        }
      }
      .onMove { from, to in
        var ids = patterns.map(\.id)
        ids.move(fromOffsets: from, toOffset: to)
        try? database.write { try OwnValues.order(ids, now: nowMs(), in: $0) }
      }
      .settingsRows()

      Section {
        if sorting {
          Text("つまみを上下に動かして並べ替えます。ポチポチ入力のボタンも、この順に並びます。")
            .font(.footnote)
            .foregroundStyle(colors.textSecondary)
            .settingsOnPage()
        } else {
          NavigationLink {
            AddPatternPage(patterns: patterns)
          } label: {
            Label("パターンを追加", systemImage: "plus")
              .foregroundStyle(colors.accentDefault)
          }
          .settingsRows()
        }
      }
    }
    .settingsList()
    .environment(\.editMode, $editMode)
    .navigationTitle("シフトパターン")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button(sorting ? "完了" : "並び替え") {
          withAnimation { editMode = sorting ? .inactive : .active }
        }
      }
    }
  }

  private func row(_ pattern: Pattern, page: Int?) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      if let page {
        Text("ポチポチ入力の\(page)ページ目")
          .font(.caption)
          .foregroundStyle(colors.textTertiary)
      }
      LabeledContent {
        Text(patternTimeText(pattern.time))
      } label: {
        Label {
          Text(pattern.name).lineLimit(1)
        } icon: {
          ShiftMark(pattern: pattern, size: 22)
        }
      }
    }
  }
}

/// パターンを追加: the ready-made patterns not in the list yet, added at a
/// tap, and 自分で作る.
private struct AddPatternPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  let patterns: [Pattern]
  /// One made with 自分で作る: back to the list, past this page, once the
  /// editor has gone.
  @State private var made = false

  var body: some View {
    let ids = Set(patterns.map(\.id))
    let names = Set(patterns.map(\.name))
    // One already there, by its id or its name, is left out.
    let offered = ReadyPatterns.offered.compactMap(ReadyPatterns.pattern).filter {
      !ids.contains($0.id) && !names.contains($0.name)
    }
    List {
      if !offered.isEmpty {
        Section {
          ForEach(offered, id: \.id) { ready in
            let pattern = Pattern(ready, keeping: ids)
            Button {
              try? database.write { try OwnValues.save(pattern, now: nowMs(), in: $0) }
              dismiss()
            } label: {
              LabeledContent {
                HStack(spacing: 12) {
                  Text(patternTimeText(pattern.time))
                  Image(systemName: "plus").foregroundStyle(colors.accentDefault)
                }
              } label: {
                Label {
                  Text(pattern.name).foregroundStyle(colors.textPrimary)
                } icon: {
                  ShiftMark(pattern: pattern, size: 22)
                }
              }
            }
            .accessibilityLabel("\(pattern.name)を追加")
          }
        } header: {
          Text("よく使うパターン")
        } footer: {
          Text("名前や時間は、追加したあとで直せます。")
        }
        .settingsRows()
      }
      Section {
        NavigationLink {
          PatternEditor(pattern: newPattern, isNew: true) { made = true }
        } label: {
          Text("自分で作る")
        }
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("パターンを追加")
    .navigationBarTitleDisplayMode(.inline)
    .onAppear {
      if made { dismiss() }
    }
  }

  /// A blank pattern: 9:00 to 18:00, its mark guessed as it is named and
  /// its color the first no pattern uses.
  private var newPattern: Pattern {
    let look = guessLook("")
    return Pattern(
      id: UUID().uuidString.lowercased(), name: "", emoji: look.emoji, symbol: look.symbol,
      icon: look.icon, color: nextColor(patterns.map(\.color), slots: colors.marks.count),
      time: ShiftTime(start: "09:00", end: "18:00"))
  }
}

/// Which of a mark's parts the person picked by hand: those are never
/// guessed from the name again (spec/shift-patterns.md, A new pattern's
/// mark).
private enum LookPart: Hashable {
  case emoji, icon, symbol
}

/// パターンを追加 or パターンを編集: the name, the time, whether it counts as
/// a day off, the next day's pattern and the mark; deleting at the foot.
struct PatternEditor: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @FetchAll private var rows: [PatternRow]
  @FetchAll private var order: [PatternOrderRow]
  let initial: Pattern
  let isNew: Bool
  /// Kept: said to the page that opened it.
  var onSaved: () -> Void = {}
  @State private var draft: Pattern
  @State private var allDay: Bool
  @State private var start: String
  @State private var end: String
  @State private var picked: Set<LookPart>
  /// Shown days with the pattern, asked before deleting.
  @State private var deleting: Int?
  @State private var repeating = false

  init(pattern: Pattern, isNew: Bool, onSaved: @escaping () -> Void = {}) {
    initial = pattern
    self.isNew = isNew
    self.onSaved = onSaved
    _draft = State(initialValue: pattern)
    _allDay = State(initialValue: pattern.time == nil)
    _start = State(initialValue: pattern.time?.start ?? "09:00")
    _end = State(initialValue: pattern.time?.end ?? "18:00")
    // A saved pattern's mark stays as it is when it is renamed.
    _picked = State(initialValue: isNew ? [] : [.emoji, .icon, .symbol])
  }

  var body: some View {
    let others = ownPatterns(rows, order).filter { $0.id != draft.id }
    let saved = shaped
    Form {
      Section {
        HStack(spacing: 16) {
          ShiftMark(pattern: saved, size: 44)
          VStack(alignment: .leading, spacing: 2) {
            Text(draft.name.isEmpty ? "新しいパターン" : draft.name)
              .font(.headline)
              .foregroundStyle(draft.name.isEmpty ? colors.textTertiary : colors.textPrimary)
            Text(patternTimeText(saved.time))
              .font(.footnote)
              .foregroundStyle(colors.textTertiary)
          }
          Spacer()
        }
        .padding(.vertical, 4)
      }
      .settingsRows()

      Section("基本") {
        LabeledContent("名前") {
          LimitedTextField(
            placeholder: "例：日勤", text: nameBinding, limit: TextLimits.shiftName)
          .multilineTextAlignment(.trailing)
        }
        Toggle("時間なし", isOn: $allDay)
        if !allDay {
          HStack {
            ClockPicker(label: "開始時刻", time: $start)
            Text("–").foregroundStyle(colors.textTertiary)
            ClockPicker(label: "終了時刻", time: $end)
          }
        }
        Toggle(isOn: $draft.countsAsOff) {
          Text("休みとして数える")
          Text("今月のお休みの日数に入ります")
        }
        NavigationLink {
          NextDayPicker(name: draft.name, others: others, nextDay: $draft.nextDay)
        } label: {
          LabeledContent("翌日のパターン") {
            if let next = others.first(where: { $0.id == draft.nextDay }) {
              HStack(spacing: 6) {
                ShiftMark(pattern: next, size: 18)
                Text(next.name)
              }
            } else {
              Text("なし")
            }
          }
        }
      }
      .settingsRows()

      Section("見た目") {
        NavigationLink {
          LookEditor(draft: $draft, picked: $picked, others: others)
        } label: {
          LabeledContent("印と色") {
            ShiftMark(pattern: saved, size: 20)
          }
        }
      }
      .settingsRows()

      if !isNew {
        Section {
          if repeating {
            Text("繰り返しの並びに入っているので、削除できません。先に「働き方」で並びを変えてください。")
              .font(.footnote)
              .foregroundStyle(colors.textSecondary)
              .settingsOnPage()
          } else {
            Button("このパターンを削除", role: .destructive) { askToDelete() }
              .frame(maxWidth: .infinity)
              .settingsRows()
          }
        }
      }
    }
    .settingsList()
    .navigationTitle(isNew ? "パターンを追加" : "パターンを編集")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(isNew ? "追加" : "保存", role: .confirm) { save() }
          .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
      }
    }
    .task {
      repeating = (try? await database.read { try OwnValues.isRepeating(initial.id, in: $0) }) ?? false
    }
    .alert(
      "「\(initial.name)」を削除しますか？",
      isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
      presenting: deleting
    ) { _ in
      Button("キャンセル", role: .cancel) {}
      Button("削除", role: .destructive) { delete() }
    } message: { days in
      Text("\(days)日の予定に入っている「\(initial.name)」も一緒に消えます。元に戻せません。")
    }
  }

  /// The draft as it would be kept: its name trimmed and its time, unless
  /// 時間なし.
  private var shaped: Pattern {
    var pattern = draft
    pattern.name = draft.name.trimmingCharacters(in: .whitespaces)
    pattern.time = allDay ? nil : ShiftTime(start: start, end: end)
    return pattern
  }

  /// The name, its mark's parts not picked by hand guessed from it.
  private var nameBinding: Binding<String> {
    Binding {
      draft.name
    } set: { name in
      draft.name = name
      let look = guessLook(name)
      if !picked.contains(.emoji) { draft.emoji = look.emoji }
      if !picked.contains(.icon) { draft.icon = look.icon }
      if !picked.contains(.symbol) { draft.symbol = look.symbol }
    }
  }

  private func save() {
    let pattern = shaped
    try? database.write { try OwnValues.save(pattern, now: nowMs(), in: $0) }
    onSaved()
    dismiss()
  }

  /// Deletes at once when no day shows it; else asks, saying how many.
  private func askToDelete() {
    let days = (try? database.read { try OwnValues.daysShowing(initial.id, in: $0) }) ?? 0
    if days == 0 {
      delete()
    } else {
      deleting = days
    }
  }

  private func delete() {
    try? database.write { try OwnValues.deletePattern(initial.id, now: nowMs(), in: $0) }
    dismiss()
  }
}

/// A time of day as "HH:MM", picked as the system's wheels pick one.
private struct ClockPicker: View {
  let label: String
  @Binding var time: String

  var body: some View {
    DatePicker(
      label,
      selection: Binding {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        return Calendar.current.date(
          bySettingHour: parts.first ?? 9, minute: parts.last ?? 0, second: 0, of: .now) ?? .now
      } set: { date in
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        time = String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
      },
      displayedComponents: .hourAndMinute
    )
    .labelsHidden()
    .accessibilityLabel(label)
  }
}

/// 翌日のパターン: none, or another of the person's patterns.
private struct NextDayPicker: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let name: String
  let others: [Pattern]
  @Binding var nextDay: PatternID?

  var body: some View {
    List {
      Section {
        choice(nil) { Text("なし") }
        ForEach(others) { pattern in
          choice(pattern.id) {
            Label {
              Text(pattern.name)
            } icon: {
              ShiftMark(pattern: pattern, size: 20)
            }
          }
        }
      } header: {
        Text("翌日のパターン")
      } footer: {
        Text("\(name.isEmpty ? "このパターン" : name)を入れると、翌日に1日分だけ自動でシフトが入ります。夜勤の翌日の明けなどに使います。")
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("翌日のパターン")
    .navigationBarTitleDisplayMode(.inline)
  }

  private func choice(_ id: PatternID?, @ViewBuilder label: () -> some View) -> some View {
    Button {
      nextDay = id
      dismiss()
    } label: {
      HStack {
        label().foregroundStyle(colors.textPrimary)
        Spacer()
        if nextDay == id {
          Image(systemName: "checkmark").foregroundStyle(colors.accentDefault)
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(nextDay == id ? .isSelected : [])
  }
}

/// 印と色: the mark in each look, so what people on other styles see is
/// never left out, and its color.
private struct LookEditor: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Binding var draft: Pattern
  @Binding var picked: Set<LookPart>
  let others: [Pattern]
  @State private var tab: MarkStyle?
  @State private var choosingEmoji = false
  @State private var choosingIcon = false
  @FocusState private var letterFocused: Bool

  var body: some View {
    let shown = tab ?? look.style
    Form {
      Section {
        ShiftMark(pattern: draft, size: 48)
          .environment(\.look, sampleLook(shown))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
        Picker("どの見た目の印を選ぶか", selection: Binding(get: { shown }, set: { tab = $0 })) {
          Text("アイコン").tag(MarkStyle.icon)
          Text("絵文字").tag(MarkStyle.emoji)
          Text("文字").tag(MarkStyle.badge)
        }
        .pickerStyle(.segmented)
      }
      .settingsRows()

      Section {
        switch shown {
        case .icon:
          grid(withPicked(ReadyPatterns.markIcons, draft.icon), chosen: draft.icon) { icon in
            var sample = draft
            sample.icon = icon
            return ShiftMark(pattern: sample, size: 28)
              .environment(\.look, sampleLook(.icon))
          } pick: { icon in
            draft.icon = icon
            picked.insert(.icon)
          }
          Button("ほかのアイコンを選ぶ", systemImage: "plus") { choosingIcon = true }
        case .emoji:
          grid(withPicked(ReadyPatterns.markEmojis, draft.emoji), chosen: draft.emoji) { emoji in
            Text(emoji).font(.system(size: 26))
          } pick: { emoji in
            draft.emoji = emoji
            picked.insert(.emoji)
          }
          Button("ほかの絵文字を選ぶ", systemImage: "plus") { choosingEmoji = true }
        case .badge:
          LabeledContent("文字") {
            TextField("", text: letterBinding)
              .multilineTextAlignment(.trailing)
              .focused($letterFocused)
          }
        }
        if let alike = lookalike(in: shown) {
          Text(alike)
            .font(.caption)
            .foregroundStyle(colors.dangerDefault)
        }
      }
      .settingsRows()

      // Emoji bring colors of their own.
      if shown != .emoji {
        Section {
          grid(Array(colors.marks.indices), chosen: draft.color) { slot in
            Circle()
              .fill(colors.marks[slot].color)
              .frame(width: 28, height: 28)
              .accessibilityLabel(colors.marks[slot].name)
          } pick: { slot in
            draft.color = slot
          }
        } header: {
          Text("色")
        } footer: {
          if !look.colored {
            Text("スタイルの「シフトの色」を色分けにすると、この色で表示されます。")
          }
        }
        .settingsRows()
      }
    }
    .settingsList()
    .navigationTitle("印と色")
    .navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $choosingIcon) {
      IconPickerSheet(picked: draft.icon) { icon in
        var sample = draft
        sample.icon = icon
        return ShiftMark(pattern: sample, size: 26)
          .environment(\.look, sampleLook(.icon))
      } onPick: { icon in
        draft.icon = icon
        picked.insert(.icon)
      }
    }
    .sheet(isPresented: $choosingEmoji) {
      EmojiKeyboardSheet { emoji in
        guard isEmoji(emoji) else { return }
        draft.emoji = emoji
        picked.insert(.emoji)
      }
    }
  }

  /// The person's look in `style`, every mark in its own color.
  private func sampleLook(_ style: MarkStyle) -> Look {
    var sample = look
    sample.style = style
    sample.colored = true
    return sample
  }

  /// The letter, one character; left empty it keeps the one before.
  private var letterBinding: Binding<String> {
    Binding {
      draft.symbol
    } set: { text in
      guard let last = text.last else { return }
      draft.symbol = String(last)
      picked.insert(.symbol)
    }
  }

  /// A grid of choices, eight across, the chosen one ringed.
  private func grid<Item: Hashable>(
    _ items: [Item], chosen: Item, @ViewBuilder cell: @escaping (Item) -> some View,
    pick: @escaping (Item) -> Void
  ) -> some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 8), spacing: 6) {
      ForEach(items, id: \.self) { item in
        Button {
          pick(item)
        } label: {
          cell(item)
            .frame(width: 38, height: 38)
            .background {
              if item == chosen {
                RoundedRectangle(cornerRadius: Radius.sm)
                  .strokeBorder(colors.accentDefault, lineWidth: 2)
              }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(item == chosen ? .isSelected : [])
      }
    }
    .padding(.vertical, 4)
  }

  /// The emoji offered, the one picked from the keyboard first when it is
  /// not among them.
  /// The offered ones, the one picked from all of them first when it is
  /// not among them.
  private func withPicked(_ offered: [String], _ chosen: String) -> [String] {
    offered.contains(chosen) || chosen.isEmpty ? offered : [chosen] + offered
  }

  /// Another pattern drawn the same in this look, said under the choices.
  private func lookalike(in style: MarkStyle) -> String? {
    let same: (Pattern) -> Bool
    let what: String
    switch style {
    case .icon:
      what = "アイコンと色"
      same = { other in
        other.color == draft.color
          && (draft.icon == "letter"
            ? other.icon == "letter" && other.symbol == draft.symbol : other.icon == draft.icon)
      }
    case .emoji:
      what = "絵文字"
      same = { $0.emoji == draft.emoji }
    case .badge:
      what = "文字と色"
      same = { $0.symbol == draft.symbol && $0.color == draft.color }
    }
    return others.first(where: same).map { "同じ\(what)の「\($0.name)」がもうあります。" }
  }
}
