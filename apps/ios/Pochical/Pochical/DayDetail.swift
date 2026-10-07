import PochicalDesign
import PochicalKit
import SwiftUI

/// A day opened from the month: its shift, its own hours, the people on
/// it and a memo (spec/calendar.md, A day's detail).
struct DayDetail: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.scenePhase) private var scenePhase
  let day: Day
  let entry: DayEntry?
  /// The day's memo, its own whether it has a shift or not.
  let note: String?
  let patterns: [Pattern]
  let coworkers: [Coworker]
  let onChange: (DayEntry?) -> Void
  /// "" clears the memo.
  let onNoteChange: (String) -> Void
  let onAddCoworker: (String) -> Void
  /// Opens the day before (-1) or after (1).
  let onStep: (Int) -> Void
  /// The memo as it is written, kept when the field is left, the detail
  /// closes or the app goes to the background (spec/calendar.md, Text
  /// fields).
  @State private var draft = ""
  @FocusState private var writingNote: Bool
  @State private var clearing = false
  @State private var addingCoworker = false
  @State private var newCoworker = ""
  /// 一緒に働く人's list, a check by each one on the day.
  @State private var choosingPeople = false
  /// 人を追加 past coworkersMax.
  @State private var coworkersAreFull = false

  var body: some View {
    Form {
      // Rows on a quiet ground on the page's own, as /design's lists.
      Section {
        shiftRow
        if let entry, let pattern, let time = pattern.time {
          timeRow(entry, time)
          if entry.start != nil || entry.end != nil {
            Button("標準（\(hours(time.start, time.end))）に戻す") {
              var reset = entry
              reset.start = nil
              reset.end = nil
              onChange(reset)
            }
          }
        }
        // Someone works alongside on any shift but a day off.
        if let entry, let pattern, !pattern.countsAsOff {
          peopleRows(entry)
        }
      }
      .listRowBackground(colors.fillQuaternary)
      Section {
        memoField
      }
      .listRowBackground(colors.fillQuaternary)
      if let entry {
        Section {
          Button("この日のシフトを消す", role: .destructive) {
            if lost(entry).isEmpty {
              onChange(nil)
            } else {
              clearing = true
            }
          }
          .frame(maxWidth: .infinity)
          .confirmationDialog(
            "この日のシフトを消しますか？", isPresented: $clearing, titleVisibility: .visible
          ) {
            Button("消す", role: .destructive) { onChange(nil) }
          } message: {
            Text("\(lost(entry).joined(separator: "、"))も消えます。")
          }
        }
        .listRowBackground(colors.fillQuaternary)
      }
    }
    .listSectionSpacing(.compact)
    .contentMargins(.top, 12, for: .scrollContent)
    .scrollContentBackground(.hidden)
    .background(colors.backgroundBase)
    .safeAreaInset(edge: .top, spacing: 0) {
      HStack {
        Text(day.fullText)
          .font(.title3.weight(.semibold))
          .foregroundStyle(colors.textPrimary)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        // The day before and after, a week's end no stop.
        Button("前の日", systemImage: "chevron.left") { onStep(-1) }
        Button("次の日", systemImage: "chevron.right") { onStep(1) }
      }
      .labelStyle(.iconOnly)
      .buttonStyle(.borderless)
      .tint(colors.textPrimary)
      .padding(.horizontal, 20)
    }
    .tint(colors.accentDefault)
    .onAppear { draft = note ?? "" }
    .onDisappear { keepNote() }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active {
        keepNote()
      }
    }
  }

  private var pattern: Pattern? {
    entry.flatMap { entry in patterns.first { $0.id == entry.shift } }
  }

  /// The shift, picked from the person's patterns; picking another keeps
  /// the day's memo and people, as entering does.
  private var shiftRow: some View {
    Picker(
      "シフト",
      selection: Binding(
        get: { entry?.shift ?? "" },
        set: { shift in
          guard !shift.isEmpty, shift != entry?.shift else { return }
          onChange(DayEntry(shift: shift, note: entry?.note, people: entry?.people))
        })
    ) {
      if entry == nil {
        Text("なし").tag("")
      }
      ForEach(patterns, id: \.id) { pattern in
        Label {
          Text(pattern.name)
        } icon: {
          ShiftMark(pattern: pattern, size: 18)
        }
        .tag(pattern.id)
      }
    }
    .pickerStyle(.menu)
  }

  /// The day's own hours, a change from the pattern's said in words: 早出
  /// and 残業, else 変更済み.
  private func timeRow(_ entry: DayEntry, _ time: ShiftTime) -> some View {
    let change = timeChange(start: entry.start, end: entry.end, standard: time)
    let moves = [change?.early == true ? "早出" : nil, change?.late == true ? "残業" : nil]
      .compactMap(\.self).joined(separator: "・")
    return HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text("時間")
        if change != nil {
          Text(moves.isEmpty ? "変更済み" : moves)
            .font(.caption)
            .foregroundStyle(colors.accentDefault)
        }
      }
      Spacer()
      clock(entry.start ?? time.start) { setTime(entry, start: $0, standard: time) }
      Text("–").foregroundStyle(colors.textTertiary)
      clock(entry.end ?? time.end) { setTime(entry, end: $0, standard: time) }
    }
  }

  private func clock(_ time: String, set: @escaping (String) -> Void) -> some View {
    DatePicker(
      "", selection: Binding(get: { Self.date(time) }, set: { set(Self.time($0)) }),
      displayedComponents: .hourAndMinute
    )
    .labelsHidden()
  }

  /// A time kept only where it differs from the pattern's standard one.
  private func setTime(_ entry: DayEntry, start: String? = nil, end: String? = nil, standard: ShiftTime) {
    var changed = entry
    if let start {
      changed.start = start == standard.start ? nil : start
    }
    if let end {
      changed.end = end == standard.end ? nil : end
    }
    onChange(changed)
  }

  /// 一緒に働く人 in a row, those on the day by name; a tap opens the list
  /// to check them in, as the Clock app's 繰り返し picks days (Android
  /// keeps /design's filter chips; spec/calendar.md, A day's detail).
  private func peopleRows(_ entry: DayEntry) -> some View {
    Button {
      choosingPeople = true
    } label: {
      HStack(spacing: 8) {
        LabeledContent("一緒に働く人") {
          Text(names(entry.people ?? []))
            .lineLimit(1)
        }
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(colors.textQuaternary)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .sheet(isPresented: $choosingPeople) {
      PeopleChecklist(
        coworkers: coworkers, picked: entry.people ?? [],
        onToggle: { coworker in toggle(coworker, in: entry) },
        onAdd: {
          if coworkers.count >= coworkersMax {
            coworkersAreFull = true
          } else {
            addingCoworker = true
          }
        })
      .presentationDetents([.medium, .large])
      .alert("一緒に働く人を追加", isPresented: $addingCoworker) {
        TextField("名前", text: $newCoworker)
        Button("追加") {
          let name = String(newCoworker.trimmingCharacters(in: .whitespacesAndNewlines)
            .prefix(TextLimits.personName))
          if !name.isEmpty {
            onAddCoworker(name)
          }
          newCoworker = ""
        }
        Button("キャンセル", role: .cancel) { newCoworker = "" }
      }
      .alert(coworkersFull, isPresented: $coworkersAreFull) {
        Button("OK", role: .cancel) {}
      }
    }
  }

  /// Puts someone on the day, or takes them off it.
  private func toggle(_ coworker: Coworker, in entry: DayEntry) {
    // Someone deleted from 一緒に働く人 goes as the day's people are
    // written (spec/sync-protocol.md, Coworkers).
    var people = (entry.people ?? []).filter { id in coworkers.contains { $0.id == id } }
    if people.contains(coworker.id) {
      people.removeAll { $0 == coworker.id }
    } else {
      people.append(coworker.id)
    }
    var changed = entry
    changed.people = people
    onChange(changed)
  }

  private func names(_ ids: [String]) -> String {
    let names = ids.compactMap { id in coworkers.first { $0.id == id }?.name }
    return names.isEmpty ? "なし" : names.joined(separator: "、")
  }

  /// What would go with the shift; the memo stays, as it is the day's. A
  /// day with nothing more is cleared at once, as one tap brings it back;
  /// with more it is asked first.
  private func lost(_ entry: DayEntry) -> [String] {
    [
      entry.start != nil || entry.end != nil ? "時間の変更" : nil,
      (entry.people ?? []).contains { id in coworkers.contains { $0.id == id } }
        ? "一緒に働く人" : nil,
    ].compactMap(\.self)
  }

  /// "" clears the memo; an entry without one keeps the day's.
  private func keepNote() {
    if draft != (note ?? "") {
      onNoteChange(draft)
    }
  }

  /// The memo, on any day, with a button that clears it at once while it
  /// holds words, as a one-line field's does.
  private var memoField: some View {
    // Beside the first line, one line or many.
    HStack(alignment: .firstTextBaseline) {
      TextField("メモ", text: $draft, axis: .vertical)
        .focused($writingNote)
        .onChange(of: draft) { _, text in
          if text.count > TextLimits.dayNote {
            draft = String(text.prefix(TextLimits.dayNote))
          }
        }
        .onChange(of: writingNote) { _, writing in
          if !writing {
            keepNote()
          }
        }
      if !draft.isEmpty {
        Button("メモを消す", systemImage: "xmark.circle.fill") {
          draft = ""
          onNoteChange("")
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.plain)
        .foregroundStyle(colors.textTertiary)
      }
    }
  }

  private func hours(_ start: String, _ end: String) -> String {
    hoursText(start, end)
  }

  // "HH:MM" and the date pickers' dates, on any one day.
  private static func date(_ time: String) -> Date {
    let parts = time.split(separator: ":").compactMap { Int($0) }
    return Calendar.current.date(
      bySettingHour: parts.first ?? 0, minute: parts.dropFirst().first ?? 0, second: 0, of: .now)
      ?? .now
  }

  private static func time(_ date: Date) -> String {
    let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
  }
}

/// 一緒に働く人 to check in on a day: a check by each one on it, 人を追加
/// at the foot, and 完了.
private struct PeopleChecklist: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let coworkers: [Coworker]
  let picked: [String]
  let onToggle: (Coworker) -> Void
  let onAdd: () -> Void

  var body: some View {
    NavigationStack {
      List {
        if !coworkers.isEmpty {
          Section {
            ForEach(coworkers) { coworker in
              let isPicked = picked.contains(coworker.id)
              Button {
                onToggle(coworker)
              } label: {
                HStack {
                  Text(coworker.name).foregroundStyle(colors.textPrimary)
                  Spacer()
                  Image(systemName: "checkmark")
                    .foregroundStyle(colors.accentDefault)
                    .opacity(isPicked ? 1 : 0)
                }
                .contentShape(.rect)
              }
              .buttonStyle(.plain)
              .accessibilityAddTraits(isPicked ? .isSelected : [])
            }
          }
          .settingsRows()
        }
        Section {
          Button(action: onAdd) {
            Label("人を追加…", systemImage: "plus")
              .foregroundStyle(colors.accentDefault)
          }
        } footer: {
          Text("同じシフトに入る人などを、この日にメモできます。名前や並び順は、設定の「一緒に働く人」で直せます。")
        }
        .settingsRows()
      }
      .settingsList()
      .navigationTitle("一緒に働く人")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("完了", systemImage: "checkmark", role: .confirm) { dismiss() }
        }
      }
    }
  }
}

/// Hours as the day and the group's screens write them: 9:00 – 18:00, an
/// end past midnight as 翌9:30.
func hoursText(_ start: String, _ end: String) -> String {
  let trim = { (time: String) in time.hasPrefix("0") ? String(time.dropFirst()) : time }
  return "\(trim(start)) – \(end <= start ? "翌" : "")\(trim(end))"
}
