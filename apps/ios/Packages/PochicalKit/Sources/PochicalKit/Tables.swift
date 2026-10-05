import Foundation
import SQLiteData

// The user's own values as the device shows them: the latest of its edits
// still waiting in the outbox, else the server's (OwnValues). Each table
// holds a value's fields as the wire carries them.

/// A day's own values (spec/sync-protocol.md, On the wire): a field that is
/// nil is unset, and a day with every field unset has no row.
@Table("days")
public struct DayRow: Hashable, Sendable {
  /// "YYYY-MM-DD".
  @Column(primaryKey: true)
  public var date: String
  /// A pattern's id, or `Days.noShift` for a day cleared on purpose.
  public var pattern: String?
  public var start: String?
  public var end: String?
  public var note: String?
  /// Coworker ids separated by spaces, in the order they were added.
  public var people: String?
}

@Table("patterns")
public struct PatternRow: Hashable, Sendable {
  @Column(primaryKey: true)
  public var id: String
  public var name: String
  public var emoji: String
  public var symbol: String
  public var icon: String
  public var color: Int
  public var start: String?
  public var end: String?
  public var countsAsOff: Bool
  public var nextDay: String?
}

/// The order the patterns are shown in, one row a place.
@Table("patternOrder")
public struct PatternOrderRow: Hashable, Sendable {
  @Column(primaryKey: true)
  public var position: Int
  public var patternID: String
}

/// The repeating orders, one row an order, in their timeline's order.
@Table("repeatOrders")
public struct RepeatOrderRow: Hashable, Sendable {
  @Column(primaryKey: true)
  public var position: Int
  public var start: String
  public var anchor: String?
  /// Pattern ids separated by spaces, one a day.
  public var sequence: String
  public var holidaysOff: Bool
  public var holidayShift: String?
  public var holidayCountry: String
}

@Table("coworkers")
public struct CoworkerRow: Hashable, Sendable {
  @Column(primaryKey: true)
  public var id: String
  public var name: String
}

/// The order the coworkers are listed in, one row a place.
@Table("coworkerOrder")
public struct CoworkerOrderRow: Hashable, Sendable {
  @Column(primaryKey: true)
  public var position: Int
  public var coworkerID: String
}

/// The last change the server sent for each value, as a
/// `pochical.v1.Change`.
@Table("serverValues")
struct ServerValue: Hashable, Sendable {
  @Column(primaryKey: true)
  var key: String
  var change: Data
}

/// The device's own edits not yet acknowledged, in the order they were
/// made: each its value as a `pochical.v1.Change`, stamped with its clock.
@Table("outbox")
struct OutboxEdit: Hashable, Sendable {
  let id: Int
  var opID: String
  var key: String
  var change: Data
  /// A repeating-orders edit's `clear_from`, "YYYY-MM-DD".
  var clearFrom: String?
}

/// The device's own place in sync (spec/sync-protocol.md, HLC): its id,
/// its last clock, and what it adds to its own time to correct it. One row.
@Table("syncState")
struct SyncState: Hashable, Sendable {
  @Column(primaryKey: true)
  var id: Int = 1
  /// The device's own id, a UUID as it is written.
  var deviceID: String
  var lastMs: Int64
  var lastCounter: Int64
  var offsetMs: Int64
}

extension DatabaseMigrator {
  mutating func registerOwnValues() {
    registerMigration("Create the user's own values") { db in
      try #sql(
        """
        CREATE TABLE "days" (
          "date" TEXT PRIMARY KEY NOT NULL,
          "pattern" TEXT,
          "start" TEXT,
          "end" TEXT,
          "note" TEXT,
          "people" TEXT
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "patterns" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "name" TEXT NOT NULL,
          "emoji" TEXT NOT NULL,
          "symbol" TEXT NOT NULL,
          "icon" TEXT NOT NULL,
          "color" INTEGER NOT NULL,
          "start" TEXT,
          "end" TEXT,
          "countsAsOff" INTEGER NOT NULL,
          "nextDay" TEXT
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "patternOrder" (
          "position" INTEGER PRIMARY KEY NOT NULL,
          "patternID" TEXT NOT NULL
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "repeatOrders" (
          "position" INTEGER PRIMARY KEY NOT NULL,
          "start" TEXT NOT NULL,
          "anchor" TEXT,
          "sequence" TEXT NOT NULL,
          "holidaysOff" INTEGER NOT NULL,
          "holidayShift" TEXT,
          "holidayCountry" TEXT NOT NULL
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "coworkers" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "name" TEXT NOT NULL
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "coworkerOrder" (
          "position" INTEGER PRIMARY KEY NOT NULL,
          "coworkerID" TEXT NOT NULL
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "serverValues" (
          "key" TEXT PRIMARY KEY NOT NULL,
          "change" BLOB NOT NULL
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "outbox" (
          "id" INTEGER PRIMARY KEY AUTOINCREMENT,
          "opID" TEXT NOT NULL UNIQUE,
          "key" TEXT NOT NULL,
          "change" BLOB NOT NULL,
          "clearFrom" TEXT
        ) STRICT
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE INDEX "outbox_key" ON "outbox"("key")
        """
      )
      .execute(db)
      try #sql(
        """
        CREATE TABLE "syncState" (
          "id" INTEGER PRIMARY KEY NOT NULL CHECK ("id" = 1),
          "deviceID" TEXT NOT NULL,
          "lastMs" INTEGER NOT NULL,
          "lastCounter" INTEGER NOT NULL,
          "offsetMs" INTEGER NOT NULL
        ) STRICT
        """
      )
      .execute(db)
    }
  }
}
