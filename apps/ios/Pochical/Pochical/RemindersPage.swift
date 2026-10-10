import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UIKit

/// 設定 › 通知 › リマインド (/design's RemindersPage): reminders as the Clock
/// app lists alarms, each on its own switch, a tap to change it, and as
/// many as wanted. Nothing arrives until the system allows it, so the page
/// leads with asking.
struct RemindersPage: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @FetchAll private var days: [DayRow]
  @FetchAll private var patternRows: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll private var orders: [RepeatOrderRow]
  /// The reminder open in the sheet, or a new one.
  @State private var editing: Editing?

  struct Editing: Identifiable {
    let reminder: Reminder?
    var id: String { reminder?.id ?? "new" }
  }

  var body: some View {
    @Bindable var settings = settings
    let calendar = OwnCalendar(
      days: days, patterns: patternRows, patternOrder: patternOrder, orders: orders)
    List {
      PermissionCard()
      Section {
        ForEach($settings.device.reminders) { $reminder in
          row($reminder, calendar: calendar)
        }
        Button {
          editing = Editing(reminder: nil)
        } label: {
          Label("リマインドを追加", systemImage: "plus")
            .foregroundStyle(colors.accentDefault)
        }
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("リマインド")
    .sheet(item: $editing) { editing in
      ReminderEditor(reminder: editing.reminder, calendar: calendar) { saved in
        save(saved)
      } onDelete: {
        settings.device.reminders.removeAll { $0.id == editing.reminder?.id }
        self.editing = nil
      }
    }
  }

  /// What it is and when it next goes off, opening it to edit, and its
  /// switch.
  private func row(_ reminder: Binding<Reminder>, calendar: OwnCalendar) -> some View {
    let shown = reminder.wrappedValue.remindable(calendar.patterns)
    let picked = shown.filter { !reminder.wrappedValue.skip.contains($0.id) }
    let next = nextFiring(reminder.wrappedValue, calendar: calendar)
    return HStack {
      Button {
        editing = Editing(reminder: reminder.wrappedValue)
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 8) {
            Text(reminder.wrappedValue.name)
              .foregroundStyle(reminder.wrappedValue.on ? colors.textPrimary : colors.textTertiary)
            // The shifts it goes off for, when not all of them.
            if picked.count < shown.count {
              HStack(spacing: 4) {
                ForEach(picked) { ShiftMark(pattern: $0, size: 16) }
              }
              .accessibilityElement(children: .ignore)
              .accessibilityLabel("\(picked.map(\.name).joined(separator: "・"))だけ")
            }
          }
          if reminder.wrappedValue.on {
            Text(next.map { "次は \($0.text)・\($0.shift)" } ?? "この先、届くシフトがありません")
              .font(.footnote)
              .foregroundStyle(colors.textTertiary)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      Toggle(reminder.wrappedValue.name, isOn: reminder.on)
        .labelsHidden()
        .onChange(of: reminder.wrappedValue.on) { _, on in
          if on { Notifications.shared.askOnce() }
        }
    }
  }

  private func save(_ saved: Reminder) {
    if let index = settings.device.reminders.firstIndex(where: { $0.id == saved.id }) {
      settings.device.reminders[index] = saved
    } else {
      settings.device.reminders.append(saved)
    }
    editing = nil
    // The moment a notification is first wanted.
    Notifications.shared.askOnce()
  }
}

/// The next notification a reminder sends from now, if any day in the next
/// two months has one.
@MainActor func nextFiring(_ reminder: Reminder, calendar: OwnCalendar) -> ReminderFiring? {
  let today = Day.today
  let through = today.adding(days: 60)
  let now = Date.now
  return reminder.firings(
    days: calendar.shown(from: today, through: through), patterns: calendar.patternsByID,
    from: today, through: through
  ).first { (ReminderSchedule.date(of: $0) ?? .distantPast) > now }
}

/// Adding or changing a reminder: when it goes off, the shifts it goes off
/// for, and the next notification it sends drawn under them, so what
/// arrives is seen before saving.
private struct ReminderEditor: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let reminder: Reminder?
  let calendar: OwnCalendar
  let onSave: (Reminder) -> Void
  let onDelete: () -> Void
  @State private var dayBefore: Bool
  @State private var time: Date
  @State private var minutes: Int
  @State private var skip: [PatternID]
  @State private var deleting = false

  init(
    reminder: Reminder?, calendar: OwnCalendar, onSave: @escaping (Reminder) -> Void,
    onDelete: @escaping () -> Void
  ) {
    self.reminder = reminder
    self.calendar = calendar
    self.onSave = onSave
    self.onDelete = onDelete
    var dayBefore = true
    var time = Reminder.defaultTime
    var minutes = Reminder.defaultMinutes
    switch reminder?.kind {
    case .dayBefore(let kept): time = kept
    case .beforeStart(let kept):
      dayBefore = false
      minutes = kept
    case nil: break
    }
    _dayBefore = State(initialValue: dayBefore)
    _time = State(initialValue: Self.date(of: time))
    _minutes = State(initialValue: minutes)
    _skip = State(initialValue: reminder?.skip ?? [])
  }

  var body: some View {
    let draft = self.draft
    let shown = draft.remindable(calendar.patterns)
    let picked = shown.filter { !skip.contains($0.id) }
    NavigationStack {
      Form {
        Section {
          Picker("いつ", selection: $dayBefore) {
            Text("前日").tag(true)
            Text("開始前").tag(false)
          }
          .pickerStyle(.segmented)
          .settingsOnPage()
        }
        Section {
          if dayBefore {
            DatePicker("時刻", selection: $time, displayedComponents: .hourAndMinute)
          } else {
            Picker("シフトの開始", selection: $minutes) {
              ForEach(Reminder.minutesChoices, id: \.self) {
                Text("\(Reminder.beforeText($0))前").tag($0)
              }
            }
          }
        }
        .settingsRows()
        Section("届くシフト") {
          ForEach(shown) { pattern in
            let on = !skip.contains(pattern.id)
            Button {
              if on {
                skip.append(pattern.id)
              } else {
                skip.removeAll { $0 == pattern.id }
              }
            } label: {
              HStack(spacing: 12) {
                ShiftMark(pattern: pattern, size: 20)
                Text(pattern.name).foregroundStyle(colors.textPrimary)
                Spacer()
                Image(systemName: "checkmark")
                  .fontWeight(.semibold)
                  .foregroundStyle(colors.accentDefault)
                  .opacity(on ? 1 : 0)
              }
              .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? .isSelected : [])
          }
        }
        .settingsRows()
        if let sample = sample(draft) {
          Section(sample.next ? "次の通知・\(sample.firing.text)" : "通知の例") {
            NotificationBanner(title: sample.firing.title, line: sample.firing.body)
              .settingsOnPage()
          }
        }
        if reminder != nil {
          Section {
            Button("このリマインドを削除", role: .destructive) { deleting = true }
              .frame(maxWidth: .infinity)
          }
          .settingsRows()
        }
      }
      .settingsList()
      .navigationTitle(reminder == nil ? "リマインドを追加" : "リマインドを編集")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("キャンセル", systemImage: "xmark", role: .cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("保存", systemImage: "checkmark", role: .confirm) { onSave(draft) }
            .disabled(picked.isEmpty)
        }
      }
      .confirmationDialog("このリマインドを削除しますか？", isPresented: $deleting, titleVisibility: .visible) {
        Button("削除", role: .destructive) { onDelete() }
      }
    }
  }

  /// The reminder as the sheet now has it.
  private var draft: Reminder {
    let kind: Reminder.Kind = dayBefore ? .dayBefore(time: Self.text(of: time)) : .beforeStart(minutes: minutes)
    return Reminder(
      id: reminder?.id ?? newID, on: reminder?.on ?? true, skip: skip, kind: kind)
  }

  /// One no other reminder has.
  private var newID: String {
    let used = Set(settings.device.reminders.map(\.id))
    var count = settings.device.reminders.count
    while used.contains("reminder-\(count)") { count += 1 }
    return "reminder-\(count)"
  }

  /// The next one it sends; with nothing ahead, one for a shift it would go
  /// off for, so the words still show.
  private func sample(_ draft: Reminder) -> (firing: ReminderFiring, next: Bool)? {
    if let next = nextFiring(draft, calendar: calendar) {
      return (next, true)
    }
    let tomorrow = Day.today.adding(days: 1)
    for pattern in draft.remindable(calendar.patterns) where !draft.skip.contains(pattern.id) {
      if let firing = draft.firing(on: tomorrow, entry: DayEntry(shift: pattern.id), pattern: pattern) {
        return (firing, false)
      }
    }
    return nil
  }

  private static func date(of time: String) -> Date {
    let parts = time.split(separator: ":").compactMap { Int($0) }
    return Calendar.current.date(
      bySettingHour: parts.first ?? 21, minute: parts.last ?? 0, second: 0, of: .now) ?? .now
  }

  private static func text(of date: Date) -> String {
    let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
  }
}

/// One notification from the app, as the lock screen shows it: its icon,
/// its name and when, then the title and its line.
struct NotificationBanner: View {
  @Environment(\.themeColors) private var colors
  let title: String
  /// The line under the title: the shift's time.
  let line: String?

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      AppIconChoice.current.image(size: 38)
      VStack(alignment: .leading, spacing: 2) {
        HStack {
          Text("ポチカル")
          Spacer()
          Text("今")
        }
        .font(.caption)
        .foregroundStyle(colors.textTertiary)
        Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(colors.textPrimary)
        if let line {
          Text(line).font(.subheadline).foregroundStyle(colors.textPrimary)
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xxl))
    .shadow(Shadow.md)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("通知：\(title)")
  }
}
