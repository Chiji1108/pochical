#if DEBUG
  import PochicalKit
  import PochicalProto
  import SQLiteData

  /// A month to look at before entering is built: some of Pochical's
  /// ready-made patterns and an order of them from this month, put in
  /// when the app is launched with `-sample` and has none.
  enum SampleDays {
    static func putIfAsked(in database: any DatabaseWriter) throws {
      guard CommandLine.arguments.contains("-sample") else {
        return
      }
      try database.write { db in
        guard try PatternRow.fetchCount(db) == 0 else {
          return
        }
        let patterns: [(String, String, String, String, UInt32, (String, String)?, Bool, String?)] = [
          ("day", "日勤", "☀️", "日", 1, ("09:00", "18:00"), false, nil),
          ("night", "夜勤", "🌙", "夜", 8, ("16:30", "09:30"), false, "after"),
          ("after", "明け", "🌅", "明", 3, nil, false, nil),
          ("off", "休み", "🌿", "休", 0, nil, true, nil),
        ]
        for (id, name, emoji, symbol, color, time, off, nextDay) in patterns {
          var pattern = Pochical_V1_Pattern()
          pattern.name = name
          pattern.emoji = emoji
          pattern.symbol = symbol
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
          var change = Pochical_V1_Change()
          change.pattern = value
          try OwnValues.take(change, in: db)
        }
        var order = Pochical_V1_PatternOrder()
        order.ids = patterns.map(\.0)
        var change = Pochical_V1_Change()
        change.patternOrder = order
        try OwnValues.take(change, in: db)

        var repeatOrder = Pochical_V1_RepeatOrder()
        repeatOrder.start = Day.today.firstOfMonth.addingMonths(-1).key
        repeatOrder.sequence = ["day", "day", "night", "after", "off", "off"]
        repeatOrder.holidaysOff = true
        repeatOrder.holidayShift = "off"
        repeatOrder.holidayCountry = "JP"
        var orders = Pochical_V1_RepeatOrders()
        orders.orders = [repeatOrder]
        change = Pochical_V1_Change()
        change.repeatOrders = orders
        try OwnValues.take(change, in: db)

        let first = Day.today.firstOfMonth
        for (offset, field, value) in [
          (7, Pochical_V1_DayField.note, "棚卸し"), (7, .end, "20:00"), (12, .start, "08:00"),
          (15, .note, "歯医者"),
        ] {
          var day = Pochical_V1_DayValue()
          day.date = first.adding(days: offset).key
          day.field = field
          day.value = value
          change = Pochical_V1_Change()
          change.day = day
          try OwnValues.take(change, in: db)
        }
      }
    }
  }
#endif
