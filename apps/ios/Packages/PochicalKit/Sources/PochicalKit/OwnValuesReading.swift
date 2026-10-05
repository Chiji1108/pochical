import SQLiteData

extension OwnValues {
  /// The person's own days from `from` through `through`, as the day logic
  /// reads them (DayEntry.swift).
  public static func ownDays(from: Day, through: Day, in db: Database) throws -> [Day: OwnDay] {
    let rows = try DayRow.where { $0.date >= from.key && $0.date <= through.key }.fetchAll(db)
    var days: [Day: OwnDay] = [:]
    for row in rows {
      if let day = Day(row.date) {
        days[day] = row.ownDay
      }
    }
    return days
  }

  /// The person's patterns in their order. One the order does not name yet
  /// comes after those it does.
  public static func patterns(in db: Database) throws -> [Pattern] {
    try ordered(PatternRow.fetchAll(db), by: PatternOrderRow.fetchAll(db))
  }

  /// The person's repeating orders, in their timeline's order.
  public static func repeatOrders(in db: Database) throws -> [RepeatOrder] {
    try RepeatOrderRow.order(by: \.position).fetchAll(db).compactMap(\.order)
  }
}

/// The patterns in the order `order` gives. One it does not name yet comes
/// after those it does.
func ordered(_ rows: [PatternRow], by order: [PatternOrderRow]) -> [Pattern] {
  let place = Dictionary(
    order.map { ($0.patternID, $0.position) }, uniquingKeysWith: { first, _ in first })
  return rows
    .sorted { (place[$0.id] ?? .max, $0.id) < (place[$1.id] ?? .max, $1.id) }
    .map(\.pattern)
}

extension DayRow {
  var ownDay: OwnDay {
    OwnDay(shift: pattern, start: start, end: end, note: note, people: people.map(ids))
  }
}

/// Ids as the wire joins them, separated by spaces.
private func ids(_ joined: String) -> [String] {
  joined.split(separator: " ").map(String.init)
}

extension PatternRow {
  var pattern: Pattern {
    let time = start.flatMap { start in end.map { ShiftTime(start: start, end: $0) } }
    return Pattern(
      id: id, name: name, emoji: emoji, symbol: symbol, icon: icon, color: color, time: time,
      countsAsOff: countsAsOff, nextDay: nextDay)
  }
}

extension RepeatOrderRow {
  /// Nil for a start that names no day, which the server never sends.
  var order: RepeatOrder? {
    guard let start = Day(start) else {
      return nil
    }
    return RepeatOrder(
      sequence: ids(sequence), start: start, anchor: anchor.flatMap(Day.init),
      holidaysOff: holidaysOff, holidayShift: holidayShift, holidayCountry: holidayCountry)
  }
}
