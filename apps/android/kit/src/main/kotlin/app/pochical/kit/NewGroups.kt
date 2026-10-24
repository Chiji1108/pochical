package app.pochical.kit

import app.pochical.design.ReadyPatterns
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

/**
 * A name's first character as a reader sees it, trimmed, as a group's letters start; the fallback
 * letter for a name with none.
 */
fun initialLetter(name: String): String = firstCharacter(name.trim()).ifEmpty { ReadyPatterns.GROUP_MARK_FALLBACK_LETTER }

/**
 * A group the person asks to make: its name, mark and their name in it, under one request id the
 * server makes it once for, so a retry after a lost answer gives back the same group
 * (spec/sync-protocol.md, Groups).
 */
data class NewGroupRequest(val name: String, val mark: GroupMarkValue, val displayName: String, val id: String) {
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
      newId: () -> String = { UUID.randomUUID().toString() },
    ): NewGroupRequest =
      if (last != null && last.name == name && last.mark == mark && last.displayName == displayName) last
      else NewGroupRequest(name, mark, displayName, newId())
  }
}
