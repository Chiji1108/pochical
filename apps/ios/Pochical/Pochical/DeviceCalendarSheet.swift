import EventKit
import OSLog
import PochicalDesign
import PochicalKit
import SQLiteData
import SafariServices
import SwiftUI
import SwiftUINavigation
import UIKit

/// The device's calendars, through EventKit: asked for once, then listed
/// for 追加先 (spec/calendar.md, Adding a month to the device calendar);
/// `CalendarWriter` writes to them.
@MainActor @Observable final class DeviceCalendars {
  enum Access { case notAsked, granted, denied }

  private let store = EKEventStore()
  private(set) var access: Access

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
  func follow(_ changed: () async -> Void) async {
    readSources()
    await changed()
    for await _ in NotificationCenter.default.notifications(named: .EKEventStoreChanged) {
      readSources()
      await changed()
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

  /// The one picked first: `last`, the one added to last, while it still
  /// takes events, else the system's for new events; but none while
  /// 自動で反映 is on, which writes nowhere the person did not pick.
  func pickedFirst(last: String?, reflecting: Bool) -> String? {
    if let last, store.calendar(withIdentifier: last)?.allowsContentModifications == true {
      return last
    }
    return reflecting ? nil : store.defaultCalendarForNewEvents?.calendarIdentifier
  }

  func calendar(_ id: String) -> EKCalendar? {
    store.calendar(withIdentifier: id)
  }
}

/// The writes to the device's calendars, through EventKit: one at a time
/// and off the main thread, whoever asks, 端末カレンダーに追加 or 自動で反映,
/// so two never both take out the same events and both put theirs in
/// (spec/calendar.md, Adding a month to the device calendar and
/// Reflecting automatically).
actor CalendarWriter {
  static let shared = CalendarWriter()

  /// The calendar to write to is gone, takes events no more, or the
  /// calendars' access was taken away: nothing is written anywhere else.
  struct NoCalendar: Error {}

  /// Made as first used, once the access is given: a store made before
  /// sees no calendar.
  private lazy var store = EKEventStore()

  /// Puts the events of the days of `span` in the calendar, writing only
  /// what differs (`ShiftEvents.reflection`). Those Pochical put in for
  /// its days before are found by the mark on a line of each one's notes
  /// (`EventMark`), from any device and any calendar, whichever app,
  /// iOS's or Android's, put them in: one in the calendar that says the
  /// same stays, the others go, so days added again are never there
  /// twice, whatever was reinstalled or synced since. The mark's link
  /// goes in the event's URL too, which Calendar opens the day by, but
  /// which a calendar's sync need not keep. A call put aside by a newer
  /// one writes nothing.
  func put(_ events: [ShiftEvent], in span: Period, by user: String, to calendarID: String) throws {
    try Task.checkCancellation()
    guard EKEventStore.authorizationStatus(for: .event) == .fullAccess,
      let target = store.calendar(withIdentifier: calendarID), target.allowsContentModifications
    else { throw NoCalendar() }
    let old = marked(span, by: user)
    let changes = ShiftEvents.reflection(
      of: events, by: user,
      over: old.enumerated().map { index, found in
        PutEvent(
          id: index, inTarget: found.event.calendar.calendarIdentifier == calendarID,
          event: said(found.event, on: found.day))
      })
    guard !changes.remove.isEmpty || !changes.add.isEmpty else { return }
    do {
      for index in changes.remove {
        try store.remove(old[index].event, span: .thisEvent, commit: false)
      }
      for shift in changes.add {
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
        let mark = EventMark(day: shift.day, user: user)
        event.url = URL(string: mark.link)
        event.notes = mark.appended(to: shift.notes)
        try store.save(event, span: .thisEvent, commit: false)
      }
      try store.commit()
    } catch {
      // Nothing half done stays waiting to go with a later write.
      store.reset()
      throw error
    }
  }

  /// How many events Pochical put in for the days of `span` as the
  /// user's are in a calendar, for ポチカルで入れた〇月の予定を消す.
  func count(in span: Period, by user: String) -> Int {
    guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { return 0 }
    return marked(span, by: user).count
  }

  /// Takes out the events Pochical put in for the days of `span` as the
  /// user's, all at once or none, and says how many went.
  func remove(_ span: Period, by user: String) throws -> Int {
    let old = marked(span, by: user)
    do {
      for found in old {
        try store.remove(found.event, span: .thisEvent, commit: false)
      }
      try store.commit()
    } catch {
      store.reset()
      throw error
    }
    return old.count
  }

  /// The events Pochical put in for the days of `span` as the user's, in
  /// any calendar that takes changes, each with its mark's day: those
  /// adding again replaces, and ポチカルで入れた〇月の予定を消す takes out.
  private func marked(_ span: Period, by user: String) -> [(event: EKEvent, day: Day)] {
    // From the first day to two past the last: a night's event ends the
    // day after it.
    let range = store.predicateForEvents(
      withStart: date(of: span.first, at: 0),
      end: date(of: span.last, at: 2 * 24 * 60), calendars: nil)
    return store.events(matching: range).compactMap { event in
      guard let mark = EventMark(notes: event.notes), mark.user == user, span.contains(mark.day),
        event.calendar.allowsContentModifications
      else { return nil }
      return (event, mark.day)
    }
  }

  /// What an event in a calendar says, as one to put in would: its hours
  /// from `day`'s midnight by the clock, none for one all day on that day.
  private func said(_ event: EKEvent, on day: Day) -> ShiftEvent {
    let wholeDay =
      event.isAllDay && Day(event.startDate, in: .current) == day
      && Day(event.endDate, in: .current) == day
    return ShiftEvent(
      day: day, title: event.title ?? "",
      start: wholeDay ? nil : minutes(from: day, to: event.startDate),
      end: wholeDay ? nil : minutes(from: day, to: event.endDate), notes: event.notes)
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

  /// `date` as minutes after the start of `day` by the clock, as `date(of:at:)` counts them.
  private func minutes(from day: Day, to date: Date) -> Int {
    let time = Calendar.current.dateComponents([.hour, .minute], from: date)
    return Day(date, in: .current).days(since: day) * 24 * 60 + (time.hour ?? 0) * 60
      + (time.minute ?? 0)
  }
}

/// 自動で反映 (spec/calendar.md, Reflecting automatically): while it is on,
/// the days from today's page through the pages ahead are kept in the
/// device's calendar, written anew whenever what would be put in changes,
/// the days, patterns and orders, sync's changes among them, and what
/// 端末カレンダーに追加 is set to put in, and each time the app comes back,
/// as the reminders are (`ReminderUpdates`). Without the calendar or its
/// access nothing is written, and the sheet says so.
struct CalendarReflection: ViewModifier {
  @Environment(Settings.self) private var settings
  @Environment(\.scenePhase) private var scenePhase
  /// The days with the user they are of, read together, so one user's
  /// days never go in under another's mark while the account changes.
  @Fetch(OwnedCalendarRequest()) private var own = OwnedCalendarRequest.Value.empty

  private struct Key: Hashable {
    let on: Bool
    let events: [ShiftEvent]
    let span: Period
    let user: String
    let target: String?
  }

  func body(content: Content) -> some View {
    let device = settings.device
    // A database with no patterns holds nothing of the person's to go by,
    // as one erased and not yet synced again: with none, or while it is
    // no one's, nothing is written, so what was put in stays.
    let on =
      device.calendarReflects && scenePhase == .active && !own.owner.isEmpty
      && !own.calendar.patterns.isEmpty
    let span = device.period.reflected(from: .today)
    // Keyed by what would be put in, so a change that leaves it the same,
    // a pattern's color or the days of another month, reads no calendar.
    let events = on ? own.calendar.shiftEvents(in: span, putting: device.calendarAdd) : []
    let user = own.owner
    let target = device.deviceCalendar
    content.task(id: Key(on: on, events: events, span: span, user: user, target: target)) {
      guard on, let target else { return }
      do {
        try await CalendarWriter.shared.put(events, in: span, by: user, to: target)
        // The device was another user's when it last reflected: theirs
        // go from the days kept, which would else show each day twice.
        if let before = device.calendarReflectedBy, before != user {
          _ = try await CalendarWriter.shared.remove(span, by: before)
        }
        if settings.device.calendarReflectedBy != user {
          settings.device.calendarReflectedBy = user
        }
      } catch {
        // Tried again with the next change, or as the app next comes back.
        Logger(subsystem: "app.pochical", category: "calendar")
          .info("The days were not reflected: \(error)")
      }
    }
  }
}

/// 端末カレンダーに追加 (/design's SaveSheet, its calendar step): the
/// page's shifts, a month's or a シフトの期間's, put in the device's
/// calendar a day each, into the one picked, days off only of the patterns
/// asked for; and 自動で反映, which keeps the days ahead there from then on.
struct DeviceCalendarSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @Environment(\.meID) private var meID
  @Environment(Settings.self) private var settings
  let page: Period
  /// A シフトの期間's page, named by its days wherever the month would be.
  let byPeriod: Bool
  let calendar: OwnCalendar
  @State private var calendars = DeviceCalendars()
  @State private var calendarID: String?
  /// The device's calendars were read, so none picked is none to pick.
  @State private var read = false
  /// What was done, once added or taken out: the page's title and its
  /// line.
  @State private var done: (title: String, text: String)?
  /// How many of the month's events Pochical put in are in a calendar,
  /// for ポチカルで入れた〇月の予定を消す.
  @State private var put = 0
  @State private var asksToRemove = false
  /// While a write runs: its buttons wait, as a second tap would only
  /// queue the same again.
  @State private var writing = false
  /// The calendar just added to, while これからも自動で反映しますか？ asks.
  @State private var asksToReflect: String?
  /// The alert's title when adding or taking out failed.
  @State private var failure: String?
  /// While the guide to Google Calendar shows over the sheet.
  @State private var showsGuide = false

  var body: some View {
    // The patterns picked, the days' memos, and who works them, kept with
    // the account as last left: the memos and people off at first, as a
    // calendar may be shared with family.
    let putting = settings.device.calendarAdd
    let shown = calendar.shown(from: page.first, through: page.last)
    let listed = listed(shown)
    let picked = putting.shown(of: calendar.patterns)
    let events = calendar.shiftEvents(in: page, putting: putting)
    // A switch only when it would put something in: a memo goes in any
    // day, those on a day only in its shift's event.
    let offers = (
      notes: !calendar.memos(in: page).isEmpty,
      people: calendar.peopleNames(on: shown).keys.contains {
        shown[$0].map { picked.contains($0.shift) } ?? false
      }
    )
    let reflects = settings.device.calendarReflects
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
            if reflects {
              Text("自動での反映も止まっています。")
            }
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
                .disabled(events.isEmpty || calendarID == nil || writing)
            }
            // Only while some are in, as from a calendar picked by
            // mistake, so none is taken out one by one; and not of the
            // days 自動で反映 keeps, which would come back at once.
            if put > 0, !(reflects && kept.contains(page.first) && kept.contains(page.last)) {
              Section {
                Button("ポチカルで入れた\(name)の予定を消す", role: .destructive) {
                  asksToRemove = true
                }
                .frame(maxWidth: .infinity)
                .disabled(writing)
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
        Text("\(name)の分を、どのカレンダーからも消します。ほかの予定は消しません。")
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
      // A month first put in: whether the days ahead follow by themselves
      // from now on, asked once (spec/calendar.md, Reflecting
      // automatically).
      .alert(
        "これからも自動で反映しますか？", isPresented: Binding($asksToReflect),
        presenting: asksToReflect
      ) { _ in
        Button("今はしない", role: .cancel) {}
        Button("自動で反映する") { settings.device.calendarReflects = true }
      } message: { calendarName in
        Text("シフトを変えると、「\(calendarName)」の予定も変わります。\(Days.reflectedMonthsAhead)か月先の分まで入ります。")
      }
    }
    .task {
      if calendars.access == .notAsked {
        await calendars.ask()
      }
      guard calendars.access == .granted else { return }
      await calendars.follow {
        pick()
        read = true
        if let meID {
          put = await CalendarWriter.shared.count(in: page, by: meID)
        }
      }
    }
    // Turned off with no calendar picked, the first pick shows again.
    .onChange(of: reflects) { pick() }
    .fullScreenCover(isPresented: $showsGuide) {
      SitePage(url: Site.page("support/google-calendar")).ignoresSafeArea()
    }
  }

  /// The days 自動で反映 keeps in the calendar.
  private var kept: Period {
    settings.device.period.reflected(from: .today)
  }

  /// The one picked stays while it still takes events, else the first pick.
  private func pick() {
    if calendarID.flatMap({ calendars.calendar($0) })?.allowsContentModifications != true {
      calendarID = calendars.pickedFirst(
        last: settings.device.deviceCalendar, reflecting: settings.device.calendarReflects)
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
    let reflects = settings.device.calendarReflects
    Section {
      // 自動で反映 is on and its calendar is gone: it writes nowhere
      // else, and says so until one is picked.
      if reflects, read, calendarID == nil {
        Label {
          Text("追加先のカレンダーが見つからないので、自動での反映を止めています。追加先を選ぶと、また反映します。")
            .foregroundStyle(colors.textPrimary)
        } icon: {
          Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange)
        }
      }
      // While 自動で反映 is on, the one picked is where it writes.
      Picker(
        "追加先",
        selection: Binding(
          get: { calendarID },
          set: { id in
            calendarID = id
            if reflects { settings.device.deviceCalendar = id }
          })
      ) {
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
      Text("\(name)のシフトを、1日ずつ予定として入れます。")
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
    // The days ahead kept in the calendar as the shifts change: turned on
    // here it writes to the 追加先 showing, and is never asked about after.
    Section {
      Toggle(
        isOn: Binding(
          get: { reflects },
          set: { on in
            var device = settings.device
            device.calendarReflectAsked = true
            if on { device.deviceCalendar = calendarID }
            device.calendarReflects = on
            settings.device = device
          })
      ) {
        Text("自動で反映")
        Text("シフトを変えると、\(Days.reflectedMonthsAhead)か月先の分まで入れ直します")
      }
      .disabled(!reflects && calendarID == nil)
    } footer: {
      if reflects {
        Text("アプリを開いたときに反映します。カレンダーアプリで変えた予定は、ポチカルのシフトに戻ります。")
      }
    }
    .settingsRows()
  }

  /// Under the sheet's last rows: that adding again replaces the month,
  /// and the way to Google Calendar.
  private var footer: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("前に入れた\(name)の予定は、入れ直します。")
      // A calendar of a Google account added to the iPhone goes on to
      // Google Calendar, which few find by themselves (spec/calendar.md).
      Button("Googleカレンダーに入れるには") {
        showsGuide = true
      }
      .font(.footnote)
      .accessibilityHint("ブラウザで開きます")
    }
  }

  /// The month, or the period by its days: 10月, 10/15〜11/14.
  private var name: String {
    byPeriod ? page.text : page.month.monthText
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

  private func add(_ events: [ShiftEvent]) {
    guard let calendarID, let meID else {
      failure = "追加できませんでした"
      return
    }
    writing = true
    Task {
      defer { writing = false }
      do {
        try await CalendarWriter.shared.put(events, in: page, by: meID, to: calendarID)
        let calendarName = calendars.calendar(calendarID)?.title ?? ""
        var device = settings.device
        device.deviceCalendar = calendarID
        // Asked once, the first time a month goes in, unless it is on.
        let asks = !device.calendarReflects && !device.calendarReflectAsked
        device.calendarReflectAsked = true
        settings.device = device
        withAnimation {
          done = ("保存しました", "「\(calendarName)」に\(name)の予定を\(events.count)件追加しました。")
        }
        if asks { asksToReflect = calendarName }
      } catch {
        ReviewPrompt.troubled = true
        failure = "追加できませんでした"
      }
    }
  }

  private func remove() {
    guard let meID else {
      failure = "消せませんでした"
      return
    }
    writing = true
    Task {
      defer { writing = false }
      do {
        let removed = try await CalendarWriter.shared.remove(page, by: meID)
        withAnimation {
          done = ("消しました", "ポチカルで入れた\(name)の予定を\(removed)件消しました。")
        }
      } catch {
        ReviewPrompt.troubled = true
        failure = "消せませんでした"
      }
    }
  }
}

/// A page of the site in the system's browser, shown over a sheet by the
/// sheet itself: `openURL(_:prefersInApp:)` presents the browser on the
/// scene's root, which UIKit refuses while that is presenting the sheet
/// ("Attempt to present <SFSafariViewController> ... which is already
/// presenting", on an iPhone's iOS 26 and the simulator's iOS 27), so
/// from a sheet it opens nothing.
private struct SitePage: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    SFSafariViewController(url: url)
  }

  func updateUIViewController(_ browser: SFSafariViewController, context: Context) {}
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
