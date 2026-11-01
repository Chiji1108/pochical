#if DEBUG
  import Foundation
  import PochicalKit
  import PochicalProto
  import SQLiteData

  /// A month to look at before entering is built: some of Pochical's
  /// ready-made patterns, an order of them from last month with the
  /// device's holidays off, a memo on two days and changed hours on two
  /// 日勤, put in when the app is launched with `-sample` and has none, as
  /// Android's sample is.
  enum SampleDays {
    static func putIfAsked(in database: any DatabaseWriter) throws {
      guard CommandLine.arguments.contains("-sample") else {
        return
      }
      try database.write { db in
        guard try PatternRow.fetchCount(db) == 0 else {
          return
        }
        // Entered as the person would, so they reach the server and the
        // person's groups like anything else they enter.
        let now = Int64(Date.now.timeIntervalSince1970 * 1000)
        func enter(_ change: Pochical_V1_Change) throws {
          try OwnValues.edit(change, opID: UUID().uuidString.lowercased(), in: db)
        }
        let patterns: [(String, String, String, String, String, UInt32, (String, String)?, Bool, String?)] = [
          ("day", "日勤", "☀️", "日", "sun", 1, ("09:00", "18:00"), false, nil),
          ("night", "夜勤", "🌙", "夜", "moon", 8, ("16:30", "09:30"), false, "after"),
          ("after", "明け", "🌅", "明", "sunHorizon", 3, nil, false, nil),
          ("off", "休み", "🌿", "休", "leaf", 0, nil, true, nil),
        ]
        for (id, name, emoji, symbol, icon, color, time, off, nextDay) in patterns {
          var pattern = Pochical_V1_Pattern()
          pattern.name = name
          pattern.emoji = emoji
          pattern.symbol = symbol
          pattern.icon = icon
          pattern.color = color
          if let time {
            pattern.start = time.0
            pattern.end = time.1
          }
          pattern.countsAsOff = off
          if let nextDay {
            pattern.nextDay = nextDay
          }
          var value = Pochical_V1_PatternValue()
          value.id = id
          value.pattern = pattern
          value.hlc = try OwnValues.nextClock(now: now, in: db)
          var change = Pochical_V1_Change()
          change.pattern = value
          try enter(change)
        }
        var order = Pochical_V1_PatternOrder()
        order.ids = patterns.map(\.0)
        order.hlc = try OwnValues.nextClock(now: now, in: db)
        var change = Pochical_V1_Change()
        change.patternOrder = order
        try enter(change)

        var repeatOrder = Pochical_V1_RepeatOrder()
        repeatOrder.start = Day.today.firstOfMonth.addingMonths(-1).key
        repeatOrder.sequence = ["day", "day", "night", "after", "off", "off"]
        repeatOrder.holidaysOff = true
        repeatOrder.holidayShift = "off"
        repeatOrder.holidayCountry = HolidayCountry.current
        var orders = Pochical_V1_RepeatOrders()
        orders.orders = [repeatOrder]
        orders.hlc = try OwnValues.nextClock(now: now, in: db)
        change = Pochical_V1_Change()
        change.repeatOrders = orders
        try enter(change)

        // Changed hours on two 日勤, as Android's sample has them: put in
        // as the day's entry, so a day the order gives another shift
        // becomes 日勤 rather than keeping that shift with the hours.
        let first = Day.today.firstOfMonth
        try OwnValues.set(
          first.adding(days: 7), to: DayEntry(shift: "day", end: "20:00", note: "棚卸し"),
          now: now, in: db)
        try OwnValues.set(
          first.adding(days: 12), to: DayEntry(shift: "day", start: "08:00"), now: now, in: db)
        try OwnValues.setNote(first.adding(days: 15), to: "歯医者", now: now, in: db)
      }
    }
  }
#endif
