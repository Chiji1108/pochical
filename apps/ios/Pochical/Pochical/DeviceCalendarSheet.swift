import EventKit
import PochicalDesign
import PochicalKit
import SwiftUI
import SwiftUINavigation
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
  private(set) var sources: [(title: String, calendars: [EKCalendar])] = []

  /// Keeps `sources` current until the task ends: read now, then again
  /// whenever the device's calendars change outside the app, as when a
  /// Google account's calendar is turned on in 設定 with the sheet open.
  /// `changed` runs after each, for what the caller works out from them.
  func follow(_ changed: () -> Void) async {
    readSources()
    changed()
    for await _ in NotificationCenter.default.notifications(named: .EKEventStoreChanged) {
      readSources()
      changed()
    }
  }

  private func readSources() {
    let calendars = store.calendars(for: .event).filter(\.allowsContentModifications)
    let grouped = Dictionary(grouping: calendars, by: \.source.sourceIdentifier)
    sources = store.sources.compactMap { source in
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
    do {
      for old in marked(month, by: user) {
        try store.remove(old, span: .thisEvent, commit: false)
      }
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

  /// The events Pochical put in for the month's days as the user's, in
  /// any calendar that takes changes: those adding again replaces, and
  /// ポチカルで入れた〇月の予定を消す takes out.
  func marked(_ month: Day, by user: String) -> [EKEvent] {
    let days = Set(month.daysOfMonth.map(\.key))
    // From the month's first day to two past its last: a night's event
    // ends the day after it.
    let range = store.predicateForEvents(
      withStart: date(of: month.firstOfMonth, at: 0),
      end: date(of: month.daysOfMonth.last!, at: 2 * 24 * 60), calendars: nil)
    return store.events(matching: range).filter { event in
      guard let mark = Self.mark(of: event.url) else { return false }
      return mark.user == user && days.contains(mark.day)
        && event.calendar.allowsContentModifications
    }
  }

  /// Takes out the events Pochical put in for the month as the user's,
  /// all at once or none, and says how many went.
  func remove(_ month: Day, by user: String) throws -> Int {
    let old = marked(month, by: user)
    do {
      for event in old {
        try store.remove(event, span: .thisEvent, commit: false)
      }
      try store.commit()
    } catch {
      store.reset()
      throw error
    }
    return old.count
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
  /// What was done, once added or taken out: the page's title and its
  /// line.
  @State private var done: (title: String, text: String)?
  /// How many of the month's events Pochical put in are in a calendar,
  /// for ポチカルで入れた〇月の予定を消す.
  @State private var put = 0
  @State private var asksToRemove = false
  /// The alert's title when adding or taking out failed.
  @State private var failure: String?
  @State private var guide: OpenedLink?

  var body: some View {
    // The patterns picked, the days' memos, and who works them, kept with
    // the account as last left: the memos and people off at first, as a
    // calendar may be shared with family.
    let putting = settings.device.calendarAdd
    let shown = calendar.shown(from: month, through: month.daysOfMonth.last ?? month)
    let listed = listed(shown)
    let picked = putting.shown(of: calendar.patterns)
    let memos = notes
    let names = people(shown)
    let events = ShiftEvents.month(
      month, days: shown, patterns: calendar.patternsByID, shown: picked,
      notes: putting.notes ? memos : [:], people: putting.people ? names : [:])
    // A switch only when it would put something in: a memo goes in any
    // day, those on a day only in its shift's event.
    let offers = (
      notes: !memos.isEmpty,
      people: names.keys.contains { shown[$0].map { picked.contains($0.shift) } ?? false }
    )
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
                Text(done.text).foregroundStyle(colors.textPrimary)
              } icon: {
                Image(systemName: "checkmark").foregroundStyle(colors.accentDefault)
              }
            }
            .settingsRows()
            Section {
              wide("閉じる") { dismiss() }
            }
          } else {
            form(listed: listed, picked: picked, offers: offers)
            Section {
              wide("\(events.count)件を追加") { add(events) }
                .disabled(events.isEmpty || calendarID == nil)
            }
            // Only while some are in, as from a calendar picked by
            // mistake, so none is taken out one by one.
            if put > 0 {
              Section {
                Button("ポチカルで入れた\(month.monthText)の予定を消す", role: .destructive) {
                  asksToRemove = true
                }
                .frame(maxWidth: .infinity)
              }
              .settingsRows()
            }
          }
        }
      }
      .settingsList()
      .navigationTitle(done?.title ?? "端末カレンダーに追加")
      .confirmationDialog(
        "ポチカルで入れた予定を\(put)件消します", isPresented: $asksToRemove,
        titleVisibility: .visible
      ) {
        Button("消す", role: .destructive) { remove() }
      } message: {
        Text("\(month.monthText)の分を、どのカレンダーからも消します。ほかの予定は消しません。")
      }
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
      .alert(failure ?? "", isPresented: Binding($failure), presenting: failure) { _ in
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
      guard calendars.access == .granted else { return }
      await calendars.follow {
        // The one picked stays while it still takes events.
        if calendarID.flatMap({ calendars.calendar($0) })?.allowsContentModifications != true {
          calendarID = calendars.pickedFirst
        }
        if let meID {
          put = calendars.marked(month, by: meID).count
        }
      }
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

  @ViewBuilder private func form(
    listed: [Pattern], picked: Set<PatternID>, offers: (notes: Bool, people: Bool)
  ) -> some View {
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
    // Which patterns go in, on a page of their own: the first pick leaves
    // out the days off and a night's next day like 明け.
    let switches = offers.notes || offers.people
    Section {
      NavigationLink {
        PatternsPicked(patterns: listed, all: calendar.patterns)
      } label: {
        // What is left out under it, as メモも入れる says what it does, so
        // every name shows rather than one cut off at the row's end.
        VStack(alignment: .leading) {
          Text("入れるシフト")
          Text(leftOut(listed, picked: picked))
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
      }
    } footer: {
      if !switches {
        footer
      }
    }
    .settingsRows()
    if switches {
      Section {
        if offers.notes {
          Toggle(isOn: $settings.device.calendarAdd.notes) {
            Text("メモも入れる")
            Text("予定がない日は、メモだけの予定にします")
          }
        }
        if offers.people {
          Toggle(isOn: $settings.device.calendarAdd.people) {
            Text("一緒に働く人も入れる")
            Text("シフトの予定のメモ欄に入ります")
          }
        }
      } footer: {
        footer
      }
      .settingsRows()
    }
  }

  /// Under the sheet's last rows: that adding again replaces the month,
  /// and the way to Google Calendar.
  private var footer: some View {
    VStack(alignment: .leading, spacing: 8) {
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

  /// The patterns to pick from: those in use, and a pattern left that
  /// still shows in the month.
  private func listed(_ shown: [Day: DayEntry]) -> [Pattern] {
    let inMonth = Set(shown.values.map(\.shift))
    return calendar.patterns.filter { !$0.archived || inMonth.contains($0.id) }
  }

  /// What the row under 入れるシフト says is left out, every name of it.
  private func leftOut(_ listed: [Pattern], picked: Set<PatternID>) -> String {
    let out = listed.filter { !picked.contains($0.id) }
    if out.isEmpty {
      return "すべて入れます"
    }
    if out.count == listed.count {
      return "何も入れません"
    }
    return "\(out.map(\.name).joined(separator: "・"))は入れません"
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
      failure = "追加できませんでした"
      return
    }
    do {
      try calendars.add(events, of: month, by: meID, to: calendarID)
      let name = calendars.calendar(calendarID)?.title ?? ""
      withAnimation {
        done = ("保存しました", "「\(name)」に\(month.monthText)の予定を\(events.count)件追加しました。")
      }
    } catch {
      ReviewPrompt.troubled = true
      failure = "追加できませんでした"
    }
  }

  private func remove() {
    guard let meID else {
      failure = "消せませんでした"
      return
    }
    do {
      let removed = try calendars.remove(month, by: meID)
      withAnimation {
        done = ("消しました", "ポチカルで入れた\(month.monthText)の予定を\(removed)件消しました。")
      }
    } catch {
      ReviewPrompt.troubled = true
      failure = "消せませんでした"
    }
  }
}

/// 入れるシフト: each pattern by its mark and name, checked when its days
/// go in, kept with the account (spec/calendar.md).
private struct PatternsPicked: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  let patterns: [Pattern]
  /// Every pattern, which the first pick is worked out from.
  let all: [Pattern]

  var body: some View {
    let shown = settings.device.calendarAdd.shown(of: all)
    Form {
      Section {
        ForEach(patterns) { pattern in
          let on = shown.contains(pattern.id)
          Button {
            settings.device.calendarAdd.pick(pattern.id, !on, of: all)
          } label: {
            // As a day's 勤務 picker lists them, its time beside each.
            HStack(spacing: 12) {
              LabeledContent {
                Text(patternTimeText(pattern.time))
              } label: {
                Label {
                  Text(pattern.name).lineLimit(1).foregroundStyle(colors.textPrimary)
                } icon: {
                  ShiftMark(pattern: pattern, size: 20)
                }
              }
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
      } footer: {
        Text("チェックしたシフトを、1日ずつ予定として入れます。")
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("入れるシフト")
    .navigationBarTitleDisplayMode(.inline)
  }
}
