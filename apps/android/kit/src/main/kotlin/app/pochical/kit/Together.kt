package app.pochical.kit

import java.time.LocalDate

/** The days everyone in a group is off (みんな休み), and whether another day may yet be one. */
data class Together(val days: List<LocalDate>, val unsure: Boolean)

/**
 * みんな休み from [from] through [through] (spec/shift-patterns.md, Days everyone is off), from each
 * member's days: true where it is a day off, false where it is a work day, missing where they have
 * not entered it, which never counts. A day is unsure when no one who has entered it works but
 * someone has not entered it (spec/vectors/together.json).
 */
fun together(members: List<Map<LocalDate, Boolean>>, from: LocalDate, through: LocalDate): Together {
  val days = mutableListOf<LocalDate>()
  var unsure = false
  for (day in daysFrom(from, through)) {
    val offs = members.map { it[day] }
    when {
      offs.all { it == true } -> days += day
      offs.none { it == false } -> unsure = true
    }
  }
  return Together(days, unsure)
}
