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
/// picked, days off only when asked for.
struct DeviceCalendarSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @Environment(\.meID) private var meID
  let month: Day
  let calendar: OwnCalendar
  /// The person's coworkers' names by id, for 一緒に働く人も入れる.
  let coworkers: [String: String]
  @State private var calendars = DeviceCalendars()
  @State private var calendarID: String?
  @State private var includeOff = false
  @State private var includeNotes = false
  @State private var includePeople = false
  /// What was done, once added.
  @State private var done: String?
  @State private var failed = false

  var body: some View {
    let shown = calendar.shown(from: month, through: month.daysOfMonth.last ?? month)
    let events = ShiftEvents.month(
      month, days: shown, patterns: calendar.patternsByID, includeOff: includeOff,
      notes: includeNotes ? notes : [:], people: includePeople ? people(shown) : [:])
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
            form
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

  @ViewBuilder private var form: some View {
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
      // The line under it from the row's edge, as under the switch, not
      // from where the picked calendar's dot puts its words.
      .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
      Toggle("休みの日も入れる", isOn: $includeOff)
      Toggle("メモも入れる", isOn: $includeNotes)
      Toggle("一緒に働く人も入れる", isOn: $includePeople)
    } header: {
      Text("\(month.monthText)のシフトを、1日ずつ予定として入れます。")
        .textCase(nil)
    } footer: {
      Text("前に入れた\(month.monthText)の予定は、入れ直します。")
    }
    .settingsRows()
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
        done = "「\(name)」に\(month.monthText)のシフトを\(events.count)件追加しました。"
      }
    } catch {
      ReviewPrompt.troubled = true
      failed = true
    }
  }
}
