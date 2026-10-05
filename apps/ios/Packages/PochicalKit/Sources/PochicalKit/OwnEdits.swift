import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData

extension OwnValues {
  /// Enters `shift` on `day` as ポチポチ入力 does (spec/shift-patterns.md,
  /// The next day), or clears the day for nil, keeping only what differs
  /// from the repeating orders as the person's own. `now` is the device's
  /// time in milliseconds.
  public static func enter(
    _ shift: PatternID?, on day: Day, now: Int64, in db: Database
  ) throws {
    let next = day.adding(days: 1)
    let calendar = try ownCalendar(from: day, through: next, in: db)
    let shown = calendar.shown(from: day, through: next)
    let entered = enteringShift(shift, on: day, in: shown, patterns: calendar.patternsByID)
    var edits: [Day: DayEntry?] = [:]
    for changed in [day, next] where entered[changed] != shown[changed] {
      edits[changed] = entered[changed]
    }
    try setShown(edits, calendar: calendar, now: now, in: db)
  }

  /// Puts `shift` on each of `days`, as filling the blanks 完了 asks about
  /// does (spec/shift-patterns.md, Blanks when entering ends).
  public static func fill(_ days: [Day], with shift: PatternID, now: Int64, in db: Database)
    throws
  {
    guard let first = days.min(), let last = days.max() else {
      return
    }
    let calendar = try ownCalendar(from: first, through: last, in: db)
    let edits = Dictionary(
      days.map { ($0, Optional(DayEntry(shift: shift))) }, uniquingKeysWith: { _, new in new })
    try setShown(edits, calendar: calendar, now: now, in: db)
  }

  /// Sets a day to show `entry`, or nothing, as its detail changes it.
  public static func set(_ day: Day, to entry: DayEntry?, now: Int64, in db: Database) throws {
    let calendar = try ownCalendar(from: day, through: day, in: db)
    try setShown([day: entry], calendar: calendar, now: now, in: db)
  }

  /// Sets a day's memo, whether it has a shift or not; "" clears it
  /// (spec/shift-patterns.md, A day's memo).
  public static func setNote(_ day: Day, to note: String, now: Int64, in db: Database) throws {
    let stored = try DayRow.find(day.key).fetchOne(db)?.note
    let kept = note.isEmpty ? nil : note
    guard kept != stored else { return }
    var dayValue = Pochical_V1_DayValue()
    dayValue.date = day.key
    dayValue.field = .note
    if let kept {
      dayValue.value = kept
    }
    dayValue.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.day = dayValue
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
  }

  /// Adds a person to 一緒に働く人, at the end of the list, and gives back
  /// their id.
  public static func addCoworker(named name: String, now: Int64, in db: Database) throws
    -> String
  {
    let id = UUID().uuidString.lowercased()
    var coworker = Pochical_V1_CoworkerValue()
    coworker.id = id
    coworker.name = name
    coworker.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.coworker = coworker
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)

    var order = Pochical_V1_CoworkerOrder()
    order.ids = try CoworkerOrderRow.order(by: \.position).fetchAll(db).map(\.coworkerID) + [id]
    order.hlc = try nextClock(now: now, in: db)
    change = Pochical_V1_Change()
    change.coworkerOrder = order
    try edit(change, opID: UUID().uuidString.lowercased(), in: db)
    return id
  }

  /// Makes the days in `edits` show what they say, as edits of the fields
  /// whose own values change.
  private static func setShown(
    _ edits: [Day: DayEntry?], calendar: OwnCalendar, now: Int64, in db: Database
  ) throws {
    guard let first = edits.keys.min(), let last = edits.keys.max() else {
      return
    }
    let own = calendar.own
    let planned = calendar.planned(from: first, through: last)
    let edited = editedOwnDays(own: own, planned: planned, edits: edits)
    for day in edits.keys.sorted() {
      for (field, value) in changedFields(from: own[day], to: edited[day]) {
        var dayValue = Pochical_V1_DayValue()
        dayValue.date = day.key
        dayValue.field = field
        if let value {
          dayValue.value = value
        }
        dayValue.hlc = try nextClock(now: now, in: db)
        var change = Pochical_V1_Change()
        change.day = dayValue
        try edit(change, opID: UUID().uuidString.lowercased(), in: db)
      }
    }
  }

  /// The calendar with the own days from `from` through `through`.
  private static func ownCalendar(from: Day, through: Day, in db: Database) throws
    -> OwnCalendar
  {
    try OwnCalendar(
      days: DayRow.where { $0.date >= from.key && $0.date <= through.key }.fetchAll(db),
      patterns: PatternRow.fetchAll(db), patternOrder: PatternOrderRow.fetchAll(db),
      orders: RepeatOrderRow.fetchAll(db))
  }

  /// The clock of a local edit (spec/sync-protocol.md, HLC), from the
  /// device's last one at its corrected now, kept as its new last one.
  public static func nextClock(now: Int64, in db: Database) throws -> Pochical_V1_Hlc {
    var state = try SyncState.current(in: db)
    let last = HlcTime(ms: state.lastMs, counter: UInt32(state.lastCounter))
    let clock = last.tick(now: now + state.offsetMs)
    state.lastMs = clock.ms
    state.lastCounter = Int64(clock.counter)
    try SyncState.upsert { state }.execute(db)
    var hlc = Pochical_V1_Hlc()
    hlc.physicalMs = clock.ms
    hlc.counter = clock.counter
    hlc.deviceID = state.deviceID
    return hlc
  }
}

/// The day fields whose own values differ between two own days, each with
/// its new value as the wire carries it (nil clears it).
func changedFields(from old: OwnDay?, to new: OwnDay?) -> [(Pochical_V1_DayField, String?)] {
  let fields: [(Pochical_V1_DayField, (OwnDay?) -> String?)] = [
    (.pattern, { $0?.shift }),
    (.start, { $0?.start }),
    (.end, { $0?.end }),
    (.note, { $0?.note }),
    (.people, { $0?.people?.joined(separator: " ") }),
  ]
  return fields.compactMap { field, value in
    value(old) == value(new) ? nil : (field, value(new))
  }
}
