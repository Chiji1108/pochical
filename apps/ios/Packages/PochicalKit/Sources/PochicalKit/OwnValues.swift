import Foundation
import PochicalProto
import SQLiteData

/// The user's own values on the device (spec/sync-protocol.md, Outbox):
/// for each value, the last change the server sent apart from the device's
/// own edits of it still waiting, and the tables of Tables.swift showing
/// the latest waiting edit's value, else the server's. The device never
/// compares clocks to choose: the server has, and its Changes come before
/// the Acked that ends a wait (spec/vectors/local-edits.json).
public enum OwnValues {
  /// A local edit, stamped with its clock: it shows at once and waits in
  /// the outbox until the server acknowledges it. `clearFrom` is a
  /// repeating-orders edit's.
  public static func edit(
    _ change: Pochical_V1_Change, opID: String, clearFrom: Day? = nil, in db: Database
  ) throws {
    guard let key = change.valueKey else {
      return
    }
    let data = try change.serializedData()
    try OutboxEdit.insert {
      OutboxEdit.Draft(opID: opID, key: key, change: data, clearFrom: clearFrom?.key)
    }
    .execute(db)
    try show(change, in: db)
  }

  /// A change from the server: the value's from now on, shown unless an
  /// edit of it still waits.
  public static func take(_ change: Pochical_V1_Change, in db: Database) throws {
    guard let key = change.valueKey else {
      return
    }
    let data = try change.serializedData()
    try ServerValue.upsert { ServerValue(key: key, change: data) }.execute(db)
    if try !isWaiting(key, in: db) {
      try show(change, in: db)
    }
  }

  /// The edits an Acked names stop waiting, and a value with none left
  /// shows the server's: by then the edit's own, the correction for it, or
  /// the newer value it lost to.
  public static func acknowledge(_ opIDs: [String], in db: Database) throws {
    let acked = try OutboxEdit.where { $0.opID.in(opIDs) }.fetchAll(db)
    try OutboxEdit.where { $0.opID.in(opIDs) }.delete().execute(db)
    var shown: Set<String> = []
    for edit in acked where shown.insert(edit.key).inserted {
      if try isWaiting(edit.key, in: db) {
        continue
      }
      let server = try ServerValue.find(edit.key).fetchOne(db)
      let change = try Pochical_V1_Change(serializedBytes: server?.change ?? edit.change)
      try show(server == nil ? change.cleared : change, in: db)
    }
  }

  /// A Reset: the server's values go, and the outbox stays.
  public static func reset(in db: Database) throws {
    try ServerValue.delete().execute(db)
    try DayRow.delete().execute(db)
    try PatternRow.delete().execute(db)
    try PatternOrderRow.delete().execute(db)
    try RepeatOrderRow.delete().execute(db)
    try CoworkerRow.delete().execute(db)
    try CoworkerOrderRow.delete().execute(db)
    for edit in try OutboxEdit.order(by: \.id).fetchAll(db) {
      try show(Pochical_V1_Change(serializedBytes: edit.change), in: db)
    }
  }

  private static func isWaiting(_ key: String, in db: Database) throws -> Bool {
    try OutboxEdit.where { $0.key.eq(key) }.fetchCount(db) > 0
  }

  /// Writes a value into the tables that show it.
  private static func show(_ change: Pochical_V1_Change, in db: Database) throws {
    switch change.kind {
    case .day(let value):
      var row = try DayRow.find(value.date).fetchOne(db) ?? DayRow(date: value.date)
      let field = value.hasValue ? value.value : nil
      switch value.field {
      case .pattern: row.pattern = field
      case .start: row.start = field
      case .end: row.end = field
      case .note: row.note = field
      case .people: row.people = field
      case .unspecified, .UNRECOGNIZED: return
      }
      if row == DayRow(date: value.date) {
        try DayRow.find(value.date).delete().execute(db)
      } else {
        try DayRow.upsert { row }.execute(db)
      }
    case .pattern(let value):
      if value.hasPattern {
        let row = PatternRow(id: value.id, value.pattern)
        try PatternRow.upsert { row }.execute(db)
      } else {
        try PatternRow.find(value.id).delete().execute(db)
      }
    case .patternOrder(let order):
      try PatternOrderRow.delete().execute(db)
      for (position, id) in order.ids.enumerated() {
        try PatternOrderRow.insert { PatternOrderRow(position: position, patternID: id) }
          .execute(db)
      }
    case .repeatOrders(let orders):
      try RepeatOrderRow.delete().execute(db)
      for (position, order) in orders.orders.enumerated() {
        let row = RepeatOrderRow(position: position, order)
        try RepeatOrderRow.insert { row }.execute(db)
      }
    case .coworker(let value):
      if value.hasName {
        let row = CoworkerRow(id: value.id, name: value.name)
        try CoworkerRow.upsert { row }.execute(db)
      } else {
        try CoworkerRow.find(value.id).delete().execute(db)
      }
    case .coworkerOrder(let order):
      try CoworkerOrderRow.delete().execute(db)
      for (position, id) in order.ids.enumerated() {
        try CoworkerOrderRow.insert { CoworkerOrderRow(position: position, coworkerID: id) }
          .execute(db)
      }
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .groupProfile, .member,
      .chatLine, .readMark, nil:
      return
    }
  }
}

extension Pochical_V1_Change {
  /// Which of the user's own values the change is of: one a day's field,
  /// a pattern or a coworker, and one each for the orders. Nil for what is
  /// not the user's own.
  var valueKey: String? {
    switch kind {
    case .day(let value):
      switch value.field {
      case .unspecified, .UNRECOGNIZED: nil
      default: "day/\(value.date)/\(value.field.rawValue)"
      }
    case .pattern(let value): "pattern/\(value.id)"
    case .patternOrder: "patternOrder"
    case .repeatOrders: "repeatOrders"
    case .coworker(let value): "coworker/\(value.id)"
    case .coworkerOrder: "coworkerOrder"
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .groupProfile, .member,
      .chatLine, .readMark, nil:
      nil
    }
  }

  /// The same value, cleared: what shows of it with no server value.
  var cleared: Pochical_V1_Change {
    var change = Pochical_V1_Change()
    switch kind {
    case .day(var value):
      value.clearValue()
      change.day = value
    case .pattern(var value):
      value.clearPattern()
      change.pattern = value
    case .patternOrder:
      change.patternOrder = Pochical_V1_PatternOrder()
    case .repeatOrders:
      change.repeatOrders = Pochical_V1_RepeatOrders()
    case .coworker(var value):
      value.clearName()
      change.coworker = value
    case .coworkerOrder:
      change.coworkerOrder = Pochical_V1_CoworkerOrder()
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .groupProfile, .member,
      .chatLine, .readMark, nil:
      break
    }
    return change
  }
}

extension DayRow {
  init(date: String) {
    self.init(date: date, pattern: nil, start: nil, end: nil, note: nil, people: nil)
  }
}

extension PatternRow {
  init(id: String, _ pattern: Pochical_V1_Pattern) {
    self.init(
      id: id, name: pattern.name, emoji: pattern.emoji, symbol: pattern.symbol,
      icon: pattern.icon, color: Int(pattern.color),
      start: pattern.hasStart ? pattern.start : nil, end: pattern.hasEnd ? pattern.end : nil,
      countsAsOff: pattern.countsAsOff, nextDay: pattern.hasNextDay ? pattern.nextDay : nil)
  }
}

extension RepeatOrderRow {
  init(position: Int, _ order: Pochical_V1_RepeatOrder) {
    self.init(
      position: position, start: order.start, anchor: order.hasAnchor ? order.anchor : nil,
      sequence: order.sequence.joined(separator: " "), holidaysOff: order.holidaysOff,
      holidayShift: order.hasHolidayShift ? order.holidayShift : nil,
      holidayCountry: order.holidayCountry)
  }
}
