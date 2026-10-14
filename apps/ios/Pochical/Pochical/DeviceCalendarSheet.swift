import EventKit
import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// The device's calendars, through EventKit: asked for once, then listed
/// for 追加先 and written to (spec/calendar.md, Adding a month to the
/// device calendar).
@MainActor @Observable final class DeviceCalendars {
  enum Access { case notAsked, granted, denied }

  private let store = EKEventStore()
  private(set) var access: Access

  /// The calendar added to last, picked first next time.
  private static let lastKey = "deviceCalendar.last"

  init() {
    access =
      switch EKEventStore.authorizationStatus(for: .event) {
      case .fullAccess: .granted
      case .notDetermined: .notAsked
      default: .denied
      }
  }

  func ask() async {
    let granted = (try? await store.requestFullAccessToEvents()) ?? false
    access = granted ? .granted : .denied
  }

  /// The calendars that take new events, by account in the system's
  /// order: read-only ones like holidays and birthdays are left out.
  var sources: [(title: String, calendars: [EKCalendar])] {
    let calendars = store.calendars(for: .event).filter(\.allowsContentModifications)
    let grouped = Dictionary(grouping: calendars, by: \.source.sourceIdentifier)
    return store.sources.compactMap { source in
      grouped[source.sourceIdentifier].map {
        (source.title, $0.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending })
      }
    }
  }

  /// The last one added to, else the system's for new events.
  var pickedFirst: String? {
    let last = UserDefaults.standard.string(forKey: Self.lastKey)
    if let last, store.calendar(withIdentifier: last)?.allowsContentModifications == true {
      return last
    }
    return store.defaultCalendarForNewEvents?.calendarIdentifier
  }

  func calendar(_ id: String) -> EKCalendar? {
    store.calendar(withIdentifier: id)
  }

  /// Puts the month's events in the calendar. Those Pochical put in for its
  /// days before go first, from any device and any calendar, found by the
  /// day each names (`dayURL`), so a month added again is put in anew
  /// rather than twice, whatever was reinstalled or synced since.
  func add(_ events: [ShiftEvent], of month: Day, by user: String, to calendarID: String) throws {
    guard let target = store.calendar(withIdentifier: calendarID) else { return }
    let days = Set(month.daysOfMonth.map(\.key))
    // From the month's first day to two past its last: a night's event
    // ends the day after it.
    let range = store.predicateForEvents(
      withStart: date(of: month.firstOfMonth, at: 0),
      end: date(of: month.daysOfMonth.last!, at: 2 * 24 * 60), calendars: nil)
    for old in store.events(matching: range) {
      if let mark = Self.mark(of: old.url), mark.user == user, days.contains(mark.day),
        old.calendar.allowsContentModifications
      {
        try store.remove(old, span: .thisEvent, commit: false)
      }
    }
    do {
      for shift in events {
        let event = EKEvent(eventStore: store)
        event.calendar = target
        event.title = shift.title
        if let start = shift.start, let end = shift.end {
          event.startDate = date(of: shift.day, at: start)
          event.endDate = date(of: shift.day, at: end)
        } else {
          event.isAllDay = true
          event.startDate = date(of: shift.day, at: 0)
          event.endDate = date(of: shift.day, at: 0)
        }
        event.url = Self.dayURL(shift.day, by: user)
        event.notes = shift.notes
        try store.save(event, span: .thisEvent, commit: false)
      }
      try store.commit()
    } catch {
      // Nothing half done stays waiting to go with a later add.
      store.reset()
      throw error
    }
    UserDefaults.standard.set(calendarID, forKey: Self.lastKey)
  }

  /// The mark Pochical leaves on an event it puts in: the app's own link
  /// to the day it is for (spec/widgets.md's pochical://day), and whose
  /// shift it is, so a calendar shared with family keeps theirs.
  static func dayURL(_ day: Day, by user: String) -> URL? {
    var parts = URLComponents()
    parts.scheme = "pochical"
    parts.host = "day"
    parts.path = "/\(day.key)"
    parts.queryItems = [URLQueryItem(name: "by", value: user)]
    return parts.url
  }

  /// The day and the user an event's mark names, nil for an event not
  /// Pochical's.
  private static func mark(of url: URL?) -> (day: String, user: String)? {
    guard let url, url.scheme == "pochical", url.host() == "day",
      let user = URLComponents(url: url, resolvingAgainstBaseURL: false)?
        .queryItems?.first(where: { $0.name == "by" })?.value
    else { return nil }
    let key = url.path(percentEncoded: false).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    return Day(key) == nil ? nil : (key, user)
  }

  /// The clock time `minutes` after the start of `day`, a day on past
  /// 24 hours: by the clock, so a changeover to summer time moves nothing.
  private func date(of day: Day, at minutes: Int) -> Date {
    let on = day.adding(days: minutes / (24 * 60))
    let time = minutes % (24 * 60)
    return Calendar.current.date(
      from: DateComponents(
        year: on.year, month: on.month, day: on.day, hour: time / 60, minute: time % 60))
      ?? .now
  }

}

/// 端末カレンダーに追加 (/design's SaveSheet, its calendar step): the
/// month's shifts put in the device's calendar a day each, into the one
/// picked, days off only of the patterns asked for.
struct DeviceCalendarSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @Environment(\.meID) private var meID
  @Environment(Settings.self) private var settings
  let month: Day
  let calendar: OwnCalendar
  /// The person's coworkers' names by id, for 一緒に働く人も入れる.
  let coworkers: [String: String]
  @State private var calendars = DeviceCalendars()
  @State private var calendarID: String?
  /// What was done, once added.
  @State private var done: String?
  @State private var failed = false
  @State private var guide: OpenedLink?

  var body: some View {
    // The days off, the days' memos, and who works them, put in too when
    // asked: each off at first, as a calendar may be shared with family,
    // and kept with the account as last left.
    let putting = settings.device.calendarAdd
    let shown = calendar.shown(from: month, through: month.daysOfMonth.last ?? month)
    let events = ShiftEvents.month(
      month, days: shown, patterns: calendar.patternsByID, offShown: Set(putting.off),
      notes: putting.notes ? notes : [:], people: putting.people ? people(shown) : [:])
    let carried = ShiftEvents.carriedOver(
      month, days: shown, patterns: calendar.patternsByID, offShown: Set(putting.off)
    ).compactMap { calendar.patternsByID[$0]?.name }
    NavigationStack {
      Form {
        switch calendars.access {
        case .notAsked:
          Section {
            ProgressView().frame(maxWidth: .infinity)
          }
        case .denied:
          Section {
            Text("カレンダーへのアクセスが許可されていません。設定アプリで、ポチカルにカレンダーへのフルアクセスを許可してください。")
            Button("設定を開く") {
              if let url = URL(string: UIApplication.openSettingsURLString) {
                openURL(url)
              }
            }
          }
          .settingsRows()
        case .granted:
          if let done {
            Section {
              Label {
                Text(done).foregroundStyle(colors.textPrimary)
              } icon: {
                Image(systemName: "checkmark").foregroundStyle(colors.accentDefault)
              }
            }
            .settingsRows()
            Section {
              wide("閉じる") { dismiss() }
            }
          } else {
            form(carried: carried)
            Section {
              wide("\(events.count)件を追加") { add(events) }
                .disabled(events.isEmpty || calendarID == nil)
            }
          }
        }
      }
      .settingsList()
      .navigationTitle(done == nil ? "端末カレンダーに追加" : "保存しました")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
      .alert("追加できませんでした", isPresented: $failed) {
        Button("OK", role: .cancel) {}
      }
      .sheet(item: $guide) { page in
        SafariView(url: page.url).ignoresSafeArea()
      }
    }
    .task {
      if calendars.access == .notAsked {
        await calendars.ask()
      }
      calendarID = calendarID ?? calendars.pickedFirst
    }
  }

  /// The page's main button, as /design's at the foot of the sheet.
  private func wide(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title).frame(maxWidth: .infinity, minHeight: Metrics.control)
    }
    .buttonStyle(.borderedProminent)
    .buttonBorderShape(.capsule)
    .tint(colors.accentFill)
    .foregroundStyle(colors.accentOnFill)
    .settingsOnPage()
  }

  @ViewBuilder private func form(carried: [String]) -> some View {
    @Bindable var settings = settings
    Section {
      Picker("追加先", selection: $calendarID) {
        ForEach(calendars.sources, id: \.title) { source in
          Section(source.title) {
            ForEach(source.calendars, id: \.calendarIdentifier) { item in
              Label {
                Text(item.title)
              } icon: {
                Image(systemName: "circle.fill").foregroundStyle(Color(cgColor: item.cgColor))
              }
              .tag(Optional(item.calendarIdentifier))
            }
          }
        }
      }
      .pickerStyle(.navigationLink)
    } header: {
      Text("\(month.monthText)のシフトを、1日ずつ予定として入れます。")
        .textCase(nil)
    }
    .settingsRows()
    // Each kind of day off on its own, as 有休 may go in without 休み, by
    // its mark and name, so 休み reads as the pattern rather than any day
    // off.
    let off = calendar.patterns.filter(\.countsAsOff)
    if !off.isEmpty {
      Section("予定に入れる休み") {
        ForEach(off) { pattern in
          Toggle(isOn: putsIn(pattern.id)) {
            Label {
              Text(pattern.name)
            } icon: {
              ShiftMark(pattern: pattern, size: 18)
            }
          }
        }
      }
      .settingsRows()
    }
    Section {
      Toggle(isOn: $settings.device.calendarAdd.notes) {
        Text("メモも入れる")
        Text("予定がない日は、メモだけの予定にします")
      }
      Toggle(isOn: $settings.device.calendarAdd.people) {
        Text("一緒に働く人も入れる")
        Text("シフトの予定のメモ欄に入ります")
      }
    } footer: {
      VStack(alignment: .leading, spacing: 8) {
        // A day like 明け shows the night shift running into it already.
        if !carried.isEmpty {
          Text("\(carried.joined(separator: "・"))は、前の日の勤務が翌朝まで続いて表示されるので入れません。")
        }
        Text("前に入れた\(month.monthText)の予定は、入れ直します。")
        // A calendar of a Google account added to the iPhone goes on to
        // Google Calendar, which few find by themselves (spec/calendar.md).
        Button("Googleカレンダーに入れるには") {
          guide = OpenedLink(url: Site.page("support/google-calendar"))
        }
        .font(.footnote)
        .accessibilityHint("ブラウザで開きます")
      }
    }
    .settingsRows()
  }

  /// Whether the days of a pattern counted as off go in, kept with the
  /// account.
  private func putsIn(_ id: PatternID) -> Binding<Bool> {
    Binding {
      settings.device.calendarAdd.off.contains(id)
    } set: { on in
      // Only the patterns still there, so a deleted one's leaves too.
      var off = settings.device.calendarAdd.off.filter {
        $0 != id && calendar.patternsByID[$0] != nil
      }
      if on {
        off.append(id)
      }
      settings.device.calendarAdd.off = off.sorted()
    }
  }

  /// Each day's memo in the month.
  private var notes: [Day: String] {
    Dictionary(
      uniqueKeysWithValues: month.daysOfMonth.compactMap { day in
        calendar.note(on: day).map { (day, $0) }
      })
  }

  /// Each day's people by name, those still among the coworkers.
  private func people(_ shown: [Day: DayEntry]) -> [Day: [String]] {
    shown.compactMapValues { entry in
      let names = (entry.people ?? []).compactMap { coworkers[$0] }
      return names.isEmpty ? nil : names
    }
  }

  private func add(_ events: [ShiftEvent]) {
    guard let calendarID, let meID else {
      failed = true
      return
    }
    do {
      try calendars.add(events, of: month, by: meID, to: calendarID)
      let name = calendars.calendar(calendarID)?.title ?? ""
      withAnimation {
        done = "「\(name)」に\(month.monthText)の予定を\(events.count)件追加しました。"
      }
    } catch {
      ReviewPrompt.troubled = true
      failed = true
    }
  }
}
