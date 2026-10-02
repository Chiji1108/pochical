// Code generated from design/ by `mise run gen`. Do not edit.

package app.pochical.design

/** How long free text may be, in characters as a reader sees them, by what it is (spec/text-limits.md). */
object TextLimits {
  const val chatMessage = 1000
  const val dayNote = 100
  const val groupMark = 2
  const val groupName = 30
  const val personName = 20
  const val shiftMark = 1
  const val shiftName = 8
}

/** How a field shows its count and how a shift's name shortens in a day (spec/text-limits.md). */
object TextFields {
  const val countAlwaysUpTo = 30
  const val countWhenLeft = 20
  const val dayNameLength = 3
}

/** The most days one chat message shares. */
const val SHARED_DAYS_MAX = 31

/** The most people in one group. */
const val GROUP_MAX_MEMBERS = 100

/** The most people one person keeps in 一緒に働く人. */
const val COWORKERS_MAX = 100
