import SQLiteData

extension OwnCalendar {
  /// The person's own calendar as the database holds it, with only the own
  /// days in `days` when it names some.
  public init(_ db: Database, days: ClosedRange<Day>? = nil) throws {
    let rows =
      try days.map { days in
        try DayRow.where { $0.date >= days.lowerBound.key && $0.date <= days.upperBound.key }
          .fetchAll(db)
      } ?? DayRow.fetchAll(db)
    self.init(
      days: rows, patterns: try PatternRow.fetchAll(db),
      patternOrder: try PatternOrderRow.fetchAll(db), orders: try RepeatOrderRow.fetchAll(db),
      coworkers: try OwnValues.coworkers(in: db))
  }
}

/// The person's own calendar, read again as its days, patterns, orders or
/// coworkers change: each one read whole in one transaction, so it never
/// shows new days beside the patterns or the coworkers before them.
public struct OwnCalendarRequest: FetchKeyRequest, Hashable {
  public init() {}

  public func fetch(_ db: Database) throws -> OwnCalendar {
    try OwnCalendar(db)
  }
}
