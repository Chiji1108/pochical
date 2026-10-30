import SQLiteData

extension OwnCalendar {
  /// The person's own calendar as the database holds it.
  public init(_ db: Database) throws {
    self.init(
      days: try DayRow.fetchAll(db), patterns: try PatternRow.fetchAll(db),
      patternOrder: try PatternOrderRow.fetchAll(db), orders: try RepeatOrderRow.fetchAll(db))
  }
}

/// The person's own calendar, read again as its days, patterns or orders
/// change: each one read whole in one transaction, so it never shows new
/// days beside the patterns before them.
public struct OwnCalendarRequest: FetchKeyRequest, Hashable {
  public init() {}

  public func fetch(_ db: Database) throws -> OwnCalendar {
    try OwnCalendar(db)
  }
}
