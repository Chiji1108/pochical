import Foundation
import PochicalKit
import Testing

// spec/vectors/reminders.json, read as the file writes it and turned into
// the package's types.

struct ReminderVectors: Decodable, Sendable {
  struct VectorReminder: Decodable, Sendable {
    let kind: String
    let time: String?
    let minutes: Int?
    let skip: [PatternID]

    var reminder: Reminder {
      Reminder(
        id: "r", skip: skip,
        kind: kind == "dayBefore" ? .dayBefore(time: time ?? "") : .beforeStart(minutes: minutes ?? 0))
    }
  }

  struct VectorReminderPattern: Decodable, Sendable {
    let id: String
    let name: String
    let time: [String]?

    var pattern: Pattern {
      Pattern(
        id: id, name: name, emoji: "", symbol: "", icon: "", color: 0,
        time: time.map { ShiftTime(start: $0[0], end: $0[1]) }, countsAsOff: time == nil)
    }
  }

  struct Day: Decodable, Sendable {
    let shift: String
    let start: String?
    let end: String?
  }

  struct Firing: Decodable, Sendable, Equatable {
    let shiftDay: String
    let day: String
    let time: String
    let title: String
    let body: String?
  }

  struct Firings: VectorCase {
    let name: String
    let reminder: VectorReminder
    let days: [String: Day]
    let from: String
    let through: String
    let expected: [Firing]
  }

  struct Named: VectorCase {
    let name: String
    let reminder: VectorReminder
    let expected: String
  }

  struct Remindable: VectorCase {
    let name: String
    let reminder: VectorReminder
    let expected: [String]
  }

  let patterns: [VectorReminderPattern]
  let firings: [Firings]
  let names: [Named]
  let remindable: [Remindable]
}

@Test(arguments: try vectors("reminders", as: ReminderVectors.self).firings)
func reminderFirings(_ vector: ReminderVectors.Firings) throws {
  let patterns = try vectors("reminders", as: ReminderVectors.self).patterns.map(\.pattern)
  let days = Dictionary(
    uniqueKeysWithValues: vector.days.map { key, day in
      (Day(key)!, DayEntry(shift: day.shift, start: day.start, end: day.end))
    })
  let firings = vector.reminder.reminder.firings(
    days: days, patterns: Dictionary(uniqueKeysWithValues: patterns.map { ($0.id, $0) }),
    from: Day(vector.from)!, through: Day(vector.through)!)
  #expect(
    firings.map {
      ReminderVectors.Firing(
        shiftDay: $0.shiftDay.key, day: $0.day.key,
        time: String(format: "%02d:%02d", $0.minute / 60, $0.minute % 60), title: $0.title,
        body: $0.body)
    } == vector.expected)
}

@Test(arguments: try vectors("reminders", as: ReminderVectors.self).names)
func reminderName(_ vector: ReminderVectors.Named) {
  #expect(vector.reminder.reminder.name == vector.expected)
}

@Test(arguments: try vectors("reminders", as: ReminderVectors.self).remindable)
func reminderRemindable(_ vector: ReminderVectors.Remindable) throws {
  let patterns = try vectors("reminders", as: ReminderVectors.self).patterns.map(\.pattern)
  #expect(vector.reminder.reminder.remindable(patterns).map(\.id) == vector.expected)
}

@Test func remindersKeptBeforeThereWereAnyStartWithTheEveningBefore() throws {
  let settings = try JSONDecoder().decode(DeviceSettings.self, from: Data("{}".utf8))
  #expect(settings.reminders == Reminder.defaults)
  let kept = try JSONEncoder().encode(settings)
  #expect(try JSONDecoder().decode(DeviceSettings.self, from: kept).reminders == Reminder.defaults)
}
