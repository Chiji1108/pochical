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
    let order = try PatternOrderRow.order(by: \.position).fetchAll(db).map(\.patternID)
    let place = Dictionary(order.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
    return try PatternRow.fetchAll(db)
      .sorted { (place[$0.id] ?? .max, $0.id) < (place[$1.id] ?? .max, $1.id) }
      .map(\.pattern)
  }

  /// The person's repeating orders, in their timeline's order.
  public static func repeatOrders(in db: Database) throws -> [RepeatOrder] {
    try RepeatOrderRow.order(by: \.position).fetchAll(db).compactMap(\.order)
  }
}

extension DayRow {
  var ownDay: OwnDay {
    OwnDay(shift: pattern, start: start, end: end, note: note, people: people.map(Self.ids))
  }

  static func ids(_ joined: String) -> [String] {
    joined.split(separator: " ").map(String.init)
  }
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
      sequence: DayRow.ids(sequence), start: start, anchor: anchor.flatMap(Day.init),
      holidaysOff: holidaysOff, holidayShift: holidayShift, holidayCountry: holidayCountry)
  }
}
