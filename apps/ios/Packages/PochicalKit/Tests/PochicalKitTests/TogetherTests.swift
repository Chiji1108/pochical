import Testing

@testable import PochicalKit

struct TogetherVectors: Decodable, Sendable {
  struct Case: VectorCase {
    struct Member: Decodable, Sendable {
      let days: [String: String]
    }

    struct Expected: Decodable, Sendable {
      let days: [String]
      let unsure: Bool
    }

    let name: String
    let members: [Member]
    let from: String
    let to: String
    let expected: Expected
  }

  let together: [Case]
}

@Test(arguments: try vectors("together", as: TogetherVectors.self).together)
func daysEveryoneIsOff(_ vector: TogetherVectors.Case) throws {
  let members = vector.members.map { member in
    Dictionary(
      uniqueKeysWithValues: member.days.compactMap { date, kind in
        Day(date).map { ($0, kind == "off") }
      })
  }
  let from = try #require(Day(vector.from))
  let through = try #require(Day(vector.to))
  let result = Together.days(members, from: from, through: through)
  #expect(result.days.map(\.key) == vector.expected.days)
  #expect(result.unsure == vector.expected.unsure)
}

@Test func aGroupOfOneHasNoDaysEveryoneIsOff() throws {
  let off = Pattern(
    id: "off", name: "休み", emoji: "🌿", symbol: "休", icon: "leaf", color: 0, countsAsOff: true)
  let day = try #require(Day("2026-11-01"))
  let next = day.adding(days: 1)
  // Off on the 1st; the 2nd not entered.
  let member = { (id: String) in
    GroupMember(userID: id, name: id, calendar: MemberCalendar(patterns: [off], days: [day: "off"]))
  }
  let alone = Together.days(of: [member("aya")], from: day, through: next)
  #expect(alone.days.isEmpty)
  #expect(!alone.unsure)
  let two = Together.days(of: [member("aya"), member("ken")], from: day, through: next)
  #expect(two.days == [day])
  #expect(two.unsure)
}
