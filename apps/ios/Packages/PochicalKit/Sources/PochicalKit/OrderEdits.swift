import Foundation
import PochicalProto
import SQLiteData

// The person's repeating orders as 設定 › 働き方 changes them
// (spec/shift-patterns.md, Repeating orders): the timeline as one value,
// a new or corrected order taking the days from its start back from the
// person's own.

extension OwnValues {
  /// Starts a new job's order on its start: an order starting on or after
  /// that day gives way to it, and the days from it show the new one. An
  /// empty sequence ends repeating there.
  public static func start(_ order: RepeatOrder, now: Int64, in db: Database) throws {
    try setOrders(orders(try repeatOrders(in: db), adding: order), clearFrom: order.start,
      now: now, in: db)
  }

  /// 繰り返し's periods: an order put in on its start among the others, or
  /// set again, or moved from `replacing`, the rest kept. The days the
  /// person entered stay over it (spec/shift-patterns.md, Repeating orders).
  public static func put(
    _ order: RepeatOrder, replacing: Day? = nil, now: Int64, in db: Database
  ) throws {
    try setOrders(
      orders(try repeatOrders(in: db), putting: order, replacing: replacing), clearFrom: nil,
      now: now, in: db)
  }

  /// Takes out the period starting on `start`, the one before running on.
  public static func remove(_ start: Day, now: Int64, in db: Database) throws {
    try setOrders(
      orders(try repeatOrders(in: db), removing: start), clearFrom: nil, now: now, in: db)
  }

  /// Turns 祝日は休みにする on or off for the period starting on `start`,
  /// holidays taking the pattern `holidaySetting` gives; with none in use
  /// that counts as off it cannot be turned on, but it can always be
  /// turned off (spec/shift-patterns.md, Holidays).
  public static func setHolidaysOff(
    _ on: Bool, picking picked: PatternID? = nil, from start: Day, now: Int64,
    in db: Database
  ) throws {
    guard var order = try repeatOrders(in: db).first(where: { $0.start == start }) else {
      return
    }
    let setting = holidaySetting(
      of: try patterns(in: db).inUse, on: order.holidaysOff, kept: order.holidayShift,
      picked: picked)
    if on, !order.holidaysOff, !setting.canTurnOn { return }
    order.holidaysOff = on
    // Turned off, it keeps the pattern holidays took, so turned on again
    // it takes it again.
    order.holidayShift = setting.shift ?? order.holidayShift
    try put(order, now: now, in: db)
  }

  /// The orders as one value; from `clearFrom`, the days give their own
  /// pattern and times set before back to the orders, hidden at once while
  /// the edit waits as the server clears them (OwnValues.edit;
  /// spec/vectors/order-clears.json).
  private static func setOrders(
    _ orders: [RepeatOrder], clearFrom: Day?, now: Int64, in db: Database
  ) throws {
    var value = Pochical_V1_RepeatOrders()
    value.orders = orders.map(\.wire)
    value.hlc = try nextClock(now: now, in: db)
    var change = Pochical_V1_Change()
    change.repeatOrders = value
    try edit(change, opID: UUID().uuidString.lowercased(), clearFrom: clearFrom, in: db)
  }
}

extension RepeatOrder {
  /// The order as the wire carries it.
  var wire: Pochical_V1_RepeatOrder {
    var order = Pochical_V1_RepeatOrder()
    order.sequence = sequence
    order.start = start.key
    if let anchor {
      order.anchor = anchor.key
    }
    order.holidaysOff = holidaysOff
    if let holidayShift {
      order.holidayShift = holidayShift
    }
    order.holidayCountry = holidayCountry
    return order
  }
}
