// Code generated from design/ by `mise run gen`. Do not edit.

package tech.chiji.pochical.design

/**
 * How long free text may be, in characters as a reader sees them (grapheme
 * clusters, ICU's BreakIterator), by what it is. spec/text-limits.md says
 * how fields hold to them.
 */
object TextLimits {
  const val chatMessage = 1000
  const val dayNote = 100
  const val groupMark = 2
  const val groupName = 30
  const val personName = 20
  const val shiftMark = 1
  const val shiftName = 8
}

/** The most days one chat message shares. */
const val SHARED_DAYS_MAX = 31

/** The most people in one group. */
const val GROUP_MAX_MEMBERS = 100
