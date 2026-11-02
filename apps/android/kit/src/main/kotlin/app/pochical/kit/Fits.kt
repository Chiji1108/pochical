package app.pochical.kit

import app.pochical.design.Days
import app.pochical.design.MarkIcons
import app.pochical.design.SyncLimits
import app.pochical.design.TextLimits
import app.pochical.v1.DayField

// What the server takes of each value the app edits (design/src/values.ts; spec/vectors/fits.json),
// as iOS's Fits.swift: checked before the value is kept, so a value kept stays once sent rather
// than going back on the next sync with the edits around it. A pattern's own rule is `fitsPattern`.

private val TIME = Regex("^(?:[01]\\d|2[0-3]):[0-5]\\d$")

/** Whether the text can be an id or an icon's name: 1 to `SyncLimits.idLength`, no spaces. */
fun isId(text: String): Boolean = text.isNotEmpty() && text.length <= SyncLimits.idLength && text.none(Char::isWhitespace)

/** Whether the text is a time of day as "HH:MM", 00:00 to 23:59. */
fun isClockTime(text: String): Boolean = TIME.matches(text)

/** Whether the server keeps [value] for a day's [field]; clearing, null, always fits (spec/vectors/fits.json, dayField). */
fun fitsDayField(field: DayField, value: String?): Boolean =
  value == null ||
    when (field) {
      DayField.DAY_FIELD_PATTERN -> value == Days.noShift || isId(value)
      DayField.DAY_FIELD_START, DayField.DAY_FIELD_END -> isClockTime(value)
      DayField.DAY_FIELD_NOTE -> fitsDayNote(value)
      DayField.DAY_FIELD_PEOPLE -> fitsDayPeople(value.split(" "))
      else -> false
    }

/** A day's memo: up to `TextLimits.dayNote` characters, spaces and all. */
fun fitsDayNote(note: String): Boolean = withinLimit(note, TextLimits.dayNote)

/** A day's people: coworker ids, each once, and `SyncLimits.peopleADay` at most, so a day that has them all takes no one more. */
fun fitsDayPeople(ids: List<String>): Boolean =
  ids.isNotEmpty() && ids.size <= SyncLimits.peopleADay && ids.toSet().size == ids.size && ids.all(::isId)

/** A coworker's name: 1 to `TextLimits.personName` characters, not only spaces. */
fun fitsCoworkerName(name: String): Boolean = fitsText(name, TextLimits.personName)

/** A person's name as their profile or a group shows it, trimmed: up to `TextLimits.personName` characters; empty is no name of their own. */
fun fitsPersonName(name: String): Boolean = withinLimit(name.trim(), TextLimits.personName)

/** A group's name: 1 to `TextLimits.groupName` characters, not only spaces. */
fun fitsGroupName(name: String): Boolean = fitsText(name, TextLimits.groupName)

/**
 * A group's mark: exactly one of one emoji, a mark icon (never "letter", which only patterns draw),
 * 1 to `TextLimits.groupMark` letters, not only spaces, and a photo's id, with a color of the palette.
 */
fun fitsGroupMark(mark: GroupMarkValue): Boolean =
  listOf(mark.emoji, mark.icon, mark.letter, mark.photoId).count { it.isNotEmpty() } == 1 &&
    (mark.emoji.isEmpty() || isEmoji(mark.emoji)) &&
    (mark.icon.isEmpty() || mark.icon in MarkIcons.glyphs) &&
    (mark.letter.isEmpty() || fitsText(mark.letter, TextLimits.groupMark)) &&
    (mark.photoId.isEmpty() || isId(mark.photoId)) &&
    mark.color in 0 until MARK_SLOTS
