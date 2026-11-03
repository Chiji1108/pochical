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

  let dayField: [DayField]
  let coworkerName: [Text]
  let personName: [Text]
  let groupName: [Text]
  let groupMark: [Mark]
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
