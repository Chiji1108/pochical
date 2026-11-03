import PochicalDesign
@testable import PochicalKit
import PochicalProto
import SQLiteData
import Testing

// spec/vectors/fits.json: what the server takes of each value the app
// edits, checked before the value is kept.

struct FitsVectors: Decodable, Sendable {
  struct DayField: VectorCase {
    let name: String
    let field: String
    let value: String?
    let expected: Bool

    var wire: Pochical_V1_DayField {
      switch field {
      case "pattern": .pattern
      case "start": .start
      case "end": .end
      case "note": .note
      case "people": .people
      default: .unspecified
      }
    }
  }

  struct Text: VectorCase {
    let name: String
    let text: String
    let expected: Bool
  }

  struct Mark: VectorCase {
    struct Parts: Decodable, Sendable {
      var emoji = ""
      var icon = ""
      var letter = ""
      var color = 0
      var photoId = ""

      enum CodingKeys: String, CodingKey { case emoji, icon, letter, color, photoId }

      init(from decoder: any Decoder) throws {
        let parts = try decoder.container(keyedBy: CodingKeys.self)
        emoji = try parts.decodeIfPresent(String.self, forKey: .emoji) ?? ""
        icon = try parts.decodeIfPresent(String.self, forKey: .icon) ?? ""
        letter = try parts.decodeIfPresent(String.self, forKey: .letter) ?? ""
        color = try parts.decodeIfPresent(Int.self, forKey: .color) ?? 0
        photoId = try parts.decodeIfPresent(String.self, forKey: .photoId) ?? ""
      }

      var mark: GroupMarkValue {
        GroupMarkValue(emoji: emoji, icon: icon, letter: letter, color: color, photoID: photoId)
      }
    }

    let name: String
    let mark: Parts
    let expected: Bool
  }

  /// Ids separated by single spaces, "" for none.
  struct IDs: VectorCase {
    let name: String
    let ids: String
    let expected: Bool
  }

  struct Rotation: VectorCase {
    let name: String
    let sequence: String
    let expected: Bool
  }

  /// Each order by its rotation, as `Rotation` writes one.
  struct Orders: VectorCase {
    let name: String
    let orders: [String]
    let expected: Bool
  }

  let dayField: [DayField]
  let coworkerName: [Text]
  let personName: [Text]
  let groupName: [Text]
  let groupMark: [Mark]
  let patternOrder: [IDs]
  let rotation: [Rotation]
  let repeatOrders: [Orders]
}

/// Ids separated by single spaces, "" for none, as fits.json writes lists.
private func ids(_ text: String) -> [PatternID] {
  text.isEmpty ? [] : text.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).dayField)
func dayField(_ vector: FitsVectors.DayField) {
  #expect(fitsDayField(vector.wire, vector.value) == vector.expected)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).coworkerName)
func coworkerName(_ vector: FitsVectors.Text) {
  #expect(fitsCoworkerName(vector.text) == vector.expected)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).personName)
func personName(_ vector: FitsVectors.Text) {
  #expect(fitsPersonName(vector.text) == vector.expected)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).groupName)
func groupName(_ vector: FitsVectors.Text) {
  #expect(fitsGroupName(vector.text) == vector.expected)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).groupMark)
func groupMark(_ vector: FitsVectors.Mark) {
  #expect(fitsGroupMark(vector.mark.mark) == vector.expected)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).patternOrder)
func patternOrder(_ vector: FitsVectors.IDs) {
  #expect(fitsPatternOrder(ids(vector.ids)) == vector.expected)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).rotation)
func rotation(_ vector: FitsVectors.Rotation) {
  #expect(fitsRotation(ids(vector.sequence)) == vector.expected)
}

@Test(arguments: try vectors("fits", as: FitsVectors.self).repeatOrders)
func repeatOrders(_ vector: FitsVectors.Orders) {
  let start = Day(year: 2026, month: 1, day: 1)
  let orders = vector.orders.enumerated().map { index, sequence in
    RepeatOrder(sequence: ids(sequence), start: start.adding(days: index), holidayCountry: "JP")
  }
  #expect(fitsRepeatOrders(orders) == vector.expected)
}

@Test func aCountPastTheServersIsNotWritten() throws {
  let database = try appDatabase()
  let pattern = { (id: PatternID) in
    Pattern(id: id, name: id, emoji: "⭐️", symbol: "!", icon: "star", color: 0)
  }
  let start = Day(year: 2026, month: 1, day: 1)
  let order = { (index: Int) in
    RepeatOrder(sequence: ["p1"], start: start.adding(days: index), holidayCountry: "JP")
  }
  try database.write { db in
    for index in 1...SyncLimits.patterns {
      try OwnValues.save(pattern("p\(index)"), now: 1, in: db)
    }
    for index in 0..<SyncLimits.orders {
      try OwnValues.put(order(index), now: 1, in: db)
    }
  }
  let kept = try database.read { try OutboxEdit.all.fetchCount($0) }
  // Each refused whole, its write keeping nothing.
  #expect(throws: Unfit.self) {
    try database.write { try OwnValues.save(pattern("one-more"), now: 2, in: $0) }
  }
  #expect(throws: Unfit.self) {
    try database.write { try OwnValues.put(order(SyncLimits.orders), now: 2, in: $0) }
  }
  let yearAndADay = Array(repeating: "p1", count: SyncLimits.sequence + 1)
  #expect(throws: Unfit.self) {
    try database.write {
      try OwnValues.put(
        RepeatOrder(sequence: yearAndADay, start: start, holidayCountry: "JP"), now: 2, in: $0)
    }
  }
  #expect(try database.read { try OutboxEdit.all.fetchCount($0) } == kept)
  #expect(try database.read { try PatternRow.find("one-more").fetchOne($0) } == nil)
}

@Test func aNewJobPastThePatternsWithThoseKeptForTheDaysBeforeIsNotWritten() throws {
  let database = try appDatabase()
  let pattern = { (id: PatternID) in
    Pattern(id: id, name: id, emoji: "⭐️", symbol: "!", icon: "star", color: 0)
  }
  let start = Day(year: 2026, month: 1, day: 1)
  // As many patterns as a person keeps, each on a day before the switch,
  // so each stays.
  try database.write { db in
    for index in 1...SyncLimits.patterns {
      try OwnValues.save(pattern("p\(index)"), now: 1, in: db)
      try OwnValues.enter("p\(index)", on: start.adding(days: index), now: 1, in: db)
    }
  }
  let kept = try database.read { try OutboxEdit.all.fetchCount($0) }
  let switchDay = start.adding(days: SyncLimits.patterns + 1)
  #expect(throws: Unfit.self) {
    try database.write {
      try OwnValues.changeJob(
        to: [pattern("day")], sequence: ["day"], start: switchDay, anchor: switchDay,
        holidayCountry: "JP", now: 2, in: $0)
    }
  }
  #expect(try database.read { try OutboxEdit.all.fetchCount($0) } == kept)
}

@Test func aValueTheServerWouldRefuseIsNotWritten() throws {
  let database = try appDatabase()
  try database.write { db in
    let day = Day(year: 2026, month: 11, day: 2)
    #expect(throws: Unfit.self) {
      try OwnValues.setNote(day, to: String(repeating: "あ", count: 101), now: 1, in: db)
    }
    #expect(throws: Unfit.self) { try OwnValues.addCoworker(named: "  ", now: 1, in: db) }
    let crowd = (1...51).map { "p\($0)" }
    #expect(throws: Unfit.self) {
      try OwnValues.set(day, to: DayEntry(shift: "day", people: crowd), now: 1, in: db)
    }
    let waiting = try OutboxEdit.all.fetchCount(db)
    #expect(waiting == 0)
  }
}
