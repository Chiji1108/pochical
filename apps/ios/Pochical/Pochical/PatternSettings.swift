import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import SwiftUINavigation

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

/// 設定 › シフトパターン, and below the list 新しい仕事にする.
struct PatternsPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.write) private var write
  @FetchAll private var rows: [PatternRow]
  @FetchAll private var order: [PatternOrderRow]
  @State private var editMode = EditMode.inactive

  var body: some View {
    let all = ownPatterns(rows, order)
    // Those still used, the keys' own; the archived go under their own
    // heading (spec/shift-patterns.md, Patterns no longer used).
    let patterns = all.inUse
    let archived = all.filter(\.archived)
    let sorting = editMode.isEditing
    List {
      ForEach(Array(patterns.enumerated()), id: \.element.id) { index, pattern in
        // ポチポチ入力 shows them a page at a time: where each page starts,
        // over its first pattern.
        let page = index > 0 && index % patternsPerPage == 0 ? index / patternsPerPage + 1 : nil
        if sorting {
          row(pattern, page: page)
        } else {
          PageLink {
            PatternEditor(pattern: pattern, isNew: false)
          } label: {
            row(pattern, page: page)
          }
        }
      }
      .onMove { from, to in
        var ids = patterns.map(\.id)
        ids.move(fromOffsets: from, toOffset: to)
        let order = ids + archived.map(\.id)
        write { try OwnValues.order(order, now: nowMs(), in: $0) }
      }
      .settingsRows()

      Section {
        if sorting {
          // Set in from the cards' edge, as a section's footer.
          Text("つまみを上下に動かして並べ替えます。ポチポチ入力のボタンも、この順に並びます。")
            .font(.footnote)
            .foregroundStyle(colors.textSecondary)
            .padding(.horizontal, 16)
            .settingsOnPage()
        } else {
          PageLink {
            AddPatternPage(patterns: patterns)
          } label: {
            Label("パターンを追加", systemImage: "plus")
              .foregroundStyle(colors.accentDefault)
          }
          .settingsRows()
        }
      }

      if !sorting, !archived.isEmpty {
        Section {
          ForEach(archived) { pattern in
            PageLink {
              PatternEditor(pattern: pattern, isNew: false)
            } label: {
              row(pattern, page: nil)
            }
          }
        } header: {
          Text("使わなくなったパターン")
        } footer: {
          Text("ポチポチ入力のボタンには出ません。入っている日には、そのまま出ます。")
        }
        .settingsRows()
      }

      // Choosing the patterns again with the repeat, for a new job.
      if !sorting {
        Section("仕事") {
          PageLink {
            JobChangePage()
          } label: {
            VStack(alignment: .leading, spacing: 2) {
              Text("新しい仕事にする")
              Text("シフトパターンと繰り返しを選び直す")
                .font(.caption)
                .foregroundStyle(colors.textTertiary)
            }
          }
        }
        .settingsRows()
      }
    }
    .settingsList()
    .environment(\.editMode, $editMode)
    .navigationTitle("シフトパターン")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        SortButton(editMode: $editMode)
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

/// パターンを追加: the ready-made patterns not in the list yet, as chips
/// under their headings as the setup questions show them, several picked
/// and added at once; and 自分で作る.
private struct AddPatternPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(\.write) private var write
  let patterns: [Pattern]
  @State private var picked: Set<PatternID> = []
  /// One made with 自分で作る: back to the list, past this page, once the
  /// editor has gone.
  @State private var made = false

  var body: some View {
    let ids = Set(patterns.map(\.id))
    let names = Set(patterns.map(\.name))
    // One already there, by its id or its name, is left out.
    let offered = { (id: PatternID) in
      !ids.contains(id) && !names.contains(readyByID[id]?.name ?? "")
    }
    let any = ReadyPatterns.offered.contains(where: offered)
    List {
      if any {
        Section {
          ReadyPatternChips(picked: $picked, needed: [], offered: offered)
            .frame(maxWidth: .infinity, alignment: .leading)
            .settingsTextOnPage()
        } footer: {
          Text("名前や時間は、追加したあとで直せます。")
        }
      }
      Section {
        PageLink {
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
    .toolbar {
      if any {
        ToolbarItem(placement: .confirmationAction) {
          Button("追加", role: .confirm) { add(keeping: ids, offered: offered) }
            // Only ones not there yet: a 明け or 非番 picked with its 夜勤
            // or 当番 may be.
            .disabled(!picked.contains(where: offered))
        }
      }
    }
    .onAppear {
      if made { dismiss() }
    }
  }

  /// The picked ones join the list's end, in the chips' order; a next day
  /// (夜勤's 明け, 当番's 非番) comes only when that is there too.
  private func add(keeping ids: Set<PatternID>, offered: (PatternID) -> Bool) {
    let chosen = chosenPatterns(picked).filter(offered)
    let there = ids.union(chosen)
    let added = chosen.compactMap(ReadyPatterns.pattern).map { Pattern($0, keeping: there) }
    let now = nowMs()
    let kept = write { db in
      for pattern in added {
        try OwnValues.save(pattern, now: now, in: db)
      }
    }
    if kept { dismiss() }
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

/// パターンを追加 or パターンを編集: the pattern at the top, the way into its
/// mark; the name and the time; whether it counts as a day off and the
/// next day's pattern; whether it is still in use; deleting at the foot.
struct PatternEditor: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.dismiss) private var dismiss
  @Dependency(\.defaultDatabase) private var database
  @Environment(\.write) private var write
  @FetchAll private var rows: [PatternRow]
  @FetchAll private var order: [PatternOrderRow]
  @FetchAll(RepeatOrderRow.order(by: \.position)) private var repeatOrders
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
  /// A save or delete the rules refused, as a repeating order took the
  /// pattern on since the page showed it.
  @State private var refusal: PatternRefusal?

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
    // The next day's choices: patterns in use, and the one it names.
    let others = ownPatterns(rows, order).filter {
      $0.id != draft.id && (!$0.archived || $0.id == draft.nextDay)
    }
    let saved = shaped
    Form {
      // The pattern as it is being changed, and the way into its mark, as
      // Contacts' edit screen puts 編集 under the photo.
      Section {
        PageLink(indicator: false) {
          LookEditor(draft: $draft, picked: $picked, others: others)
        } label: {
          HStack(spacing: 16) {
            VStack(spacing: 4) {
              ShiftMark(pattern: saved, size: 44)
              Text("印と色を変える")
                .font(.caption)
                .foregroundStyle(colors.accentDefault)
            }
            VStack(alignment: .leading, spacing: 2) {
              Text(draft.name.isEmpty ? "新しいパターン" : draft.name)
                .font(.headline)
                .foregroundStyle(draft.name.isEmpty ? colors.textTertiary : colors.textPrimary)
              Text(patternTimeText(saved.time))
                .font(.footnote)
                .foregroundStyle(colors.textTertiary)
            }
          }
          .padding(.vertical, 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("印と色を変える")
        .accessibilityValue(markDescription)
        .accessibilityAddTraits(.isButton)
      }
      .settingsRows()

      Section {
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
          // From the row's edge, as under the others: a list starts the line
          // at a row's first words, here the dash between the times.
          .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
        }
      }
      .settingsRows()

      Section {
        Toggle(isOn: $draft.countsAsOff) {
          Text("休みとして数える")
          Text("今月のお休みの日数に入ります")
        }
        PageLink {
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

      // A state undone as easily, so a switch saved with the rest, as
      // iOS's; a new pattern is in use.
      if !isNew {
        Section {
          // Locked only where turning it off is refused: one turned off
          // before an order took it on may still be turned back on.
          Toggle("入力に出す", isOn: inUse)
            .disabled(archivingRefused && !draft.archived)
        } footer: {
          Text(
            archivingRefused
              ? "繰り返しの並びに入っているので、オフにしたり削除したりできません。先に「繰り返し」で並びを変えてください。"
              : "オフにすると、ポチポチ入力のボタンに出なくなります。入っている日には、そのまま出ます。")
        }
        .settingsRows()
      }

      // Said once: under the switch, while that is blocked too.
      if !isNew, !archivingRefused {
        Section {
          if repeating {
            Text("繰り返しの並びに入っているので、削除できません。先に「繰り返し」で並びを変えてください。")
              .font(.footnote)
              .foregroundStyle(colors.textSecondary)
              .padding(.horizontal, 16)
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
    .alert(
      "「\(initial.name)」を削除しますか？",
      isPresented: Binding($deleting),
      presenting: deleting
    ) { _ in
      Button("キャンセル", role: .cancel) {}
      Button("削除", role: .destructive) { delete() }
    } message: { days in
      Text(
        "\(days)日の予定に入っている「\(initial.name)」も一緒に消えます。元に戻せません。日の印を残すなら「入力に出す」をオフにしてください。"
      )
    }
    .alert("繰り返しの並びに入っています", isPresented: Binding($refusal)) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("先に「繰り返し」で並びを変えてください。")
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

  /// Whether a repeating order in use or to come has it, kept as the
  /// orders change: it cannot be deleted until then.
  private var repeating: Bool {
    repeats(initial.id, in: repeatOrders.compactMap(\.order))
  }

  /// The mark as the person's スタイル draws it, and its color, for
  /// VoiceOver.
  private var markDescription: String {
    let mark =
      switch look.style {
      case .icon: MarkIconNames.names[draft.icon] ?? draft.icon
      case .emoji: draft.emoji
      case .badge: draft.symbol
      }
    return look.colored ? "\(mark)、\(colors.mark(draft.color).name)" : mark
  }

  /// 入力に出す: whether it is in use, archived when off.
  private var inUse: Binding<Bool> {
    Binding { !draft.archived } set: { draft.archived = !$0 }
  }

  /// Whether keeping it archived would be refused, as `OwnValues.save`
  /// refuses it, against how it is saved now.
  private var archivingRefused: Bool {
    refusesArchiving(
      initial.id, archived: rows.first { $0.id == initial.id }?.archived ?? false,
      orders: repeatOrders.compactMap(\.order))
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
    guard write({ try OwnValues.save(pattern, now: nowMs(), in: $0) }, refused: { refusal = $0 })
    else { return }
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
    if write({ try OwnValues.deletePattern(initial.id, now: nowMs(), in: $0) }, refused: { refusal = $0 }) {
      dismiss()
    }
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

  var body: some View {
    let shown = tab ?? look.style
    Form {
      Section {
        ShiftMark(pattern: draft, size: 48)
          .environment(\.look, sampleLook(shown))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
        Picker("印の種類", selection: Binding(get: { shown }, set: { tab = $0 })) {
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
          MarkChoiceGrid(withPicked(ReadyPatterns.markIcons, draft.icon), chosen: draft.icon) { icon in
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
          MarkChoiceGrid(withPicked(ReadyPatterns.markEmojis, draft.emoji), chosen: draft.emoji) { emoji in
            Text(emoji).font(.system(size: 26))
          } pick: { emoji in
            draft.emoji = emoji
            picked.insert(.emoji)
          }
          Button("ほかの絵文字を選ぶ", systemImage: "plus") { choosingEmoji = true }
        case .badge:
          LabeledContent("文字") {
            MarkLetterField(letter: draft.symbol, limit: TextLimits.shiftMark) { letter in
              draft.symbol = letter
              picked.insert(.symbol)
            }
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
          MarkColorGrid(chosen: draft.color) { slot in
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
