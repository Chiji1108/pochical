import Foundation
import PochicalProto
import SQLiteData

// What a group's socket brings (spec/sync-protocol.md, Groups; Group
// projection): who is in the group, and each member's shared days,
// patterns and repeating orders, kept for each group as the server last
// sent them. Nothing here is edited on the device.

/// Someone in a group, as they appear in it.
@Table("groupMembers")
public struct GroupMemberRow: Hashable, Sendable {
  public var groupID: String
  public var userID: String
  public var displayName: String
  /// When they joined, in ms since the epoch: the group's order.
  public var joinedAtMs: Int64
}

/// A member's day as the group sees it: its pattern and times only.
@Table("memberDays")
struct MemberDayRow: Hashable, Sendable {
  var groupID: String
  var userID: String
  /// "YYYY-MM-DD".
  var date: String
  var pattern: String?
  var start: String?
  var end: String?
}

/// One of a member's patterns, so the group can draw their marks.
@Table("memberPatterns")
struct MemberPatternRow: Hashable, Sendable {
  var groupID: String
  var userID: String
  var id: String
  var name: String
  var emoji: String
  var symbol: String
  var icon: String
  var color: Int
  var start: String?
  var end: String?
  var countsAsOff: Bool
  var nextDay: String?
}

/// One of a member's repeating orders, in their timeline's order.
@Table("memberOrders")
struct MemberOrderRow: Hashable, Sendable {
  var groupID: String
  var userID: String
  var position: Int
  var start: String
  var anchor: String?
  var sequence: String
  var holidaysOff: Bool
  var holidayShift: String?
  var holidayCountry: String
}

/// How far the device has taken a group's log.
@Table("groupCursors")
struct GroupCursorRow: Hashable, Sendable {
  @Column(primaryKey: true)
  var groupID: String
  var cursor: Int64
}

extension DatabaseMigrator {
  mutating func registerGroupValues() {
    registerMigration("Create the groups' values") { db in
      try #sql(
        """
        CREATE TABLE "groupMembers" (
          "groupID" TEXT NOT NULL,
          "userID" TEXT NOT NULL,
          "displayName" TEXT NOT NULL,
          "joinedAtMs" INTEGER NOT NULL,
          PRIMARY KEY ("groupID", "userID")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "memberDays" (
          "groupID" TEXT NOT NULL,
          "userID" TEXT NOT NULL,
          "date" TEXT NOT NULL,
          "pattern" TEXT,
          "start" TEXT,
          "end" TEXT,
          PRIMARY KEY ("groupID", "userID", "date")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "memberPatterns" (
          "groupID" TEXT NOT NULL,
          "userID" TEXT NOT NULL,
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "emoji" TEXT NOT NULL,
          "symbol" TEXT NOT NULL,
          "icon" TEXT NOT NULL,
          "color" INTEGER NOT NULL,
          "start" TEXT,
          "end" TEXT,
          "countsAsOff" INTEGER NOT NULL,
          "nextDay" TEXT,
          PRIMARY KEY ("groupID", "userID", "id")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "memberOrders" (
          "groupID" TEXT NOT NULL,
          "userID" TEXT NOT NULL,
          "position" INTEGER NOT NULL,
          "start" TEXT NOT NULL,
          "anchor" TEXT,
          "sequence" TEXT NOT NULL,
          "holidaysOff" INTEGER NOT NULL,
          "holidayShift" TEXT,
          "holidayCountry" TEXT NOT NULL,
          PRIMARY KEY ("groupID", "userID", "position")
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "groupCursors" (
          "groupID" TEXT PRIMARY KEY NOT NULL,
          "cursor" INTEGER NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}

/// What a group's socket brings into the database, each in one
/// transaction with the cursor it moves.
public enum GroupSync {
  /// The cursor to say in the group's Hello: 0 before any.
  public static func cursor(of groupID: String, in db: Database) throws -> UInt64 {
    UInt64(max(try GroupCursorRow.find(groupID).fetchOne(db)?.cursor ?? 0, 0))
  }

  /// Changes, in cursor order: each the group's value from now on.
  public static func take(_ changes: [Pochical_V1_Change], of groupID: String, in db: Database)
    throws
  {
    var cursor = Int64(try Self.cursor(of: groupID, in: db))
    for change in changes {
      try take(change, of: groupID, in: db)
      cursor = max(cursor, Int64(change.cursor))
    }
    let row = GroupCursorRow(groupID: groupID, cursor: cursor)
    try GroupCursorRow.upsert { row }.execute(db)
  }

  /// Reset: the group's values go, and its cursor goes back to the start
  /// for the Changes with everything that follow.
  public static func reset(_ groupID: String, in db: Database) throws {
    try GroupMemberRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
    try MemberDayRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
    try MemberPatternRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
    try MemberOrderRow.where { $0.groupID.eq(groupID) }.delete().execute(db)
    try GroupCursorRow.find(groupID).delete().execute(db)
  }

  private static func take(_ change: Pochical_V1_Change, of groupID: String, in db: Database)
    throws
  {
    switch change.kind {
    case .groupProfile(let profile):
      // The list of groups shows the name and mark the group last said.
      try GroupRow.find(groupID).update {
        $0.name = profile.name
        $0.emoji = profile.emoji
      }
      .execute(db)
    case .member(let member):
      try GroupMemberRow.where { $0.groupID.eq(groupID) && $0.userID.eq(member.userID) }
        .delete().execute(db)
      let row = GroupMemberRow(
        groupID: groupID, userID: member.userID, displayName: member.displayName,
        joinedAtMs: member.joinedAtMs)
      try GroupMemberRow.insert { row }.execute(db)
    case .memberDay(let member):
      try takeDay(member.day, of: member.userID, in: groupID, db: db)
    case .memberPattern(let member):
      let value = member.pattern
      try MemberPatternRow.where {
        $0.groupID.eq(groupID) && $0.userID.eq(member.userID) && $0.id.eq(value.id)
      }
      .delete().execute(db)
      if value.hasPattern {
        let pattern = PatternRow(id: value.id, value.pattern)
        let row = MemberPatternRow(
          groupID: groupID, userID: member.userID, id: pattern.id, name: pattern.name,
          emoji: pattern.emoji, symbol: pattern.symbol, icon: pattern.icon, color: pattern.color,
          start: pattern.start, end: pattern.end, countsAsOff: pattern.countsAsOff,
          nextDay: pattern.nextDay)
        try MemberPatternRow.insert { row }.execute(db)
      }
    case .memberRepeatOrders(let member):
      try MemberOrderRow.where { $0.groupID.eq(groupID) && $0.userID.eq(member.userID) }
        .delete().execute(db)
      for (position, order) in member.orders.orders.enumerated() {
        let own = RepeatOrderRow(position: position, order)
        let row = MemberOrderRow(
          groupID: groupID, userID: member.userID, position: position, start: own.start,
          anchor: own.anchor, sequence: own.sequence, holidaysOff: own.holidaysOff,
          holidayShift: own.holidayShift, holidayCountry: own.holidayCountry)
        try MemberOrderRow.insert { row }.execute(db)
      }
    case .day, .pattern, .patternOrder, .repeatOrders, .coworker, .coworkerOrder, .membership,
      nil:
      return
    }
  }

  /// One field of a member's day; a day with none left has no row.
  private static func takeDay(
    _ value: Pochical_V1_DayValue, of userID: String, in groupID: String, db: Database
  ) throws {
    let match = MemberDayRow.where {
      $0.groupID.eq(groupID) && $0.userID.eq(userID) && $0.date.eq(value.date)
    }
    let empty = MemberDayRow(groupID: groupID, userID: userID, date: value.date)
    var row = try match.fetchOne(db) ?? empty
    let field = value.hasValue ? value.value : nil
    switch value.field {
    case .pattern: row.pattern = field
    case .start: row.start = field
    case .end: row.end = field
    // A group never holds the memo or the people.
    case .note, .people, .unspecified, .UNRECOGNIZED: return
    }
    try match.delete().execute(db)
    if row != empty {
      try MemberDayRow.insert { row }.execute(db)
    }
  }
}

/// A member of a group with their calendar as the group sees it.
public struct GroupMember: Hashable, Sendable, Identifiable {
  public let userID: String
  public let name: String
  public let calendar: MemberCalendar
  public var id: String { userID }
}

/// A member's shifts as the group sees them: their days over their
/// repeating orders, as their own devices work them out.
public struct MemberCalendar: Hashable, Sendable {
  public let patternsByID: [PatternID: Pattern]
  let days: [Day: OwnDay]
  let orders: [RepeatOrder]

  /// Each day from `from` through `through` that shows a shift.
  public func shown(from: Day, through: Day) -> [Day: DayEntry] {
    let known = Set(patternsByID.keys)
    return shownDays(
      own: days.filter { $0.key >= from && $0.key <= through },
      planned: plannedShifts(orders: orders, known: known, from: from, through: through),
      known: known)
  }
}

extension GroupSync {
  /// Everyone in the group in the order they joined, each with what the
  /// group holds of their shifts.
  public static func members(of groupID: String, in db: Database) throws -> [GroupMember] {
    let members = try GroupMemberRow.where { $0.groupID.eq(groupID) }
      .order(by: \.joinedAtMs).fetchAll(db)
    let days = try MemberDayRow.where { $0.groupID.eq(groupID) }.fetchAll(db)
    let patterns = try MemberPatternRow.where { $0.groupID.eq(groupID) }.fetchAll(db)
    let orders = try MemberOrderRow.where { $0.groupID.eq(groupID) }.order(by: \.position)
      .fetchAll(db)
    return members.map { member in
      var own: [Day: OwnDay] = [:]
      for row in days where row.userID == member.userID {
        if let day = Day(row.date) {
          own[day] = OwnDay(shift: row.pattern, start: row.start, end: row.end)
        }
      }
      let byID = Dictionary(
        patterns.filter { $0.userID == member.userID }.map { ($0.id, $0.pattern) },
        uniquingKeysWith: { first, _ in first })
      let timeline = orders.filter { $0.userID == member.userID }.compactMap(\.order)
      return GroupMember(
        userID: member.userID, name: member.displayName,
        calendar: MemberCalendar(patternsByID: byID, days: own, orders: timeline))
    }
  }
}

extension MemberPatternRow {
  var pattern: Pattern {
    PatternRow(
      id: id, name: name, emoji: emoji, symbol: symbol, icon: icon, color: color, start: start,
      end: end, countsAsOff: countsAsOff, nextDay: nextDay
    ).pattern
  }
}

extension MemberOrderRow {
  var order: RepeatOrder? {
    RepeatOrderRow(
      position: position, start: start, anchor: anchor, sequence: sequence,
      holidaysOff: holidaysOff, holidayShift: holidayShift, holidayCountry: holidayCountry
    ).order
  }
}
