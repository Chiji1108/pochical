package app.pochical.kit

import app.pochical.design.ReadyPatterns
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * The mark グループを作る offers from the name as it is typed (spec/vectors/groups.json, guessMark):
 * the emoji of the first hint with a word anywhere in the name, else the name's first letter in
 * [color].
 */
fun guessGroupMark(name: String, color: Int): GroupMarkValue {
  val hint = ReadyPatterns.groupMarkHints.hintedBy(name) { it.words }
  return if (hint != null) GroupMarkValue(emoji = hint.emoji) else GroupMarkValue(letter = initialLetter(name), color = color)
}

/** The icon's or letters' color slot; none for an emoji or a photo, which bring colors of their own. */
val GroupMarkValue.paletteColor: Int?
  get() = if (icon.isEmpty() && letter.isEmpty()) null else color

/**
 * The color a group's icon or letters start in, from the user's other groups' [marks]
 * (spec/vectors/groups.json, nextGroupColor): as a new pattern's ([nextColor]), counting only marks
 * drawn in a color, as an emoji's or a photo's 0 is no color.
 */
fun nextGroupColor(marks: List<GroupMarkValue>, slots: Int): Int = nextColor(marks.mapNotNull { it.paletteColor }, slots)

/**
 * A name's first character as a reader sees it, trimmed, as a group's letters start; the fallback
 * letter for a name with none.
 */
fun initialLetter(name: String): String = firstCharacter(name.trim()).ifEmpty { ReadyPatterns.GROUP_MARK_FALLBACK_LETTER }

/**
 * A group the person asks to make: its name, mark, their name in it and its end ([endsAtMs], 0 for
 * none), under one request id the server makes it once for, so a retry after a lost answer gives
 * back the same group (spec/sync-protocol.md, Groups).
 */
data class NewGroupRequest(val name: String, val mark: GroupMarkValue, val displayName: String, val id: String, val endsAtMs: Long = 0) {
  /** Whether the server takes its name, mark and the person's name in it (spec/vectors/fits.json). */
  val fits: Boolean
    get() = fitsGroupName(name) && fitsGroupMark(mark) && fitsPersonName(displayName)

  companion object {
    /**
     * The request for these after [last]: the same one again while nothing it asks for has changed,
     * else a new one, as one request id stands for one request.
     */
    fun asking(
      name: String,
      mark: GroupMarkValue,
      displayName: String,
      last: NewGroupRequest?,
      endsAtMs: Long = 0,
      newId: () -> String = { UUID.randomUUID().toString() },
    ): NewGroupRequest =
      if (last != null && last.name == name && last.mark == mark && last.displayName == displayName && last.endsAtMs == endsAtMs) last
      else NewGroupRequest(name, mark, displayName, newId(), endsAtMs)
  }
}

/**
 * グループを作る's draft, whole, as iOS's: the group's [name] as typed, the mark picked by hand
 * ([pickedMark], none while the mark follows the name), its [end] if one was picked, and what 作る
 * [sent] last. It is what the page holds, what a call into the group is begun with
 * ([GroupCalls.making]), and what the page opened again while that call is under way takes back,
 * whole: so nothing of what the person left, that the mark was theirs among it, can be missing
 * from what the page then shows or sends again.
 */
data class NewGroupDraft(val name: String = "", val pickedMark: GroupMarkValue? = null, val end: LocalDate? = null, val sent: NewGroupRequest? = null) {
  /**
   * The mark picked, which stays as the name changes, else the one the name gives in [freeColor],
   * the first color the user's groups do not use yet. Once sent, the guess stays as sent while the
   * name does: the group made from it takes its color, which a new guess would skip.
   */
  fun mark(freeColor: Int): GroupMarkValue = pickedMark ?: sent?.takeIf { it.name == name.trim() }?.mark ?: guessGroupMark(name, freeColor)

  /**
   * The request for the draft, the person called [displayName] in the group: the one sent last
   * again while nothing it asks for has changed ([NewGroupRequest.asking]). The end is the moment
   * the day picked ends in [zone], so the same day asked again is the same request.
   */
  fun request(freeColor: Int, displayName: String, zone: ZoneId): NewGroupRequest =
    NewGroupRequest.asking(name.trim(), mark(freeColor), displayName, sent, end?.let { groupEndsAt(it, zone) } ?: 0)

  /** Only what the server takes (spec/vectors/fits.json), with a name for the person, so the call is never refused for it. */
  fun canMake(freeColor: Int, displayName: String): Boolean =
    fitsGroupName(name.trim()) && fitsGroupMark(mark(freeColor)) && displayName.isNotEmpty() && fitsPersonName(displayName)
}
