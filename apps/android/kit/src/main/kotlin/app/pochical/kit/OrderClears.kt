package app.pochical.kit

import app.pochical.v1.DayField

/**
 * Orders taken at [clock] that clear the days from [from], "YYYY-MM-DD": a new job's order
 * (spec/sync-protocol.md, Repeating orders).
 */
data class OrderFloor(val from: String, val clock: Clock)

private val ordered = setOf(DayField.DAY_FIELD_PATTERN, DayField.DAY_FIELD_START, DayField.DAY_FIELD_END)

/**
 * Whether a day's value gives way to orders taken from [floor]: a shift or a time, on or after its
 * start, set before them (spec/vectors/order-clears.json).
 */
fun givesWay(date: String, field: DayField, set: Clock, floor: OrderFloor): Boolean =
  date >= floor.from && field in ordered && set < floor.clock
