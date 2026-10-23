package app.pochical.calendar

import app.pochical.kit.AppDatabase
import app.pochical.kit.CoworkerRow
import app.pochical.kit.OwnEdits
import app.pochical.kit.PatternRow
import app.pochical.kit.ShownDay
import app.pochical.kit.ownCalendar
import app.pochical.v1.DayField
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import app.pochical.kit.OwnCalendar as KitCalendar

/**
 * The person's days as the device keeps them (:kit): read from its database whenever sync or an
 * edit changes it, and edited through its outbox, which sends them to the server and the person's
 * other devices.
 */
class SyncedDays(database: AppDatabase, private val edits: OwnEdits, scope: CoroutineScope) : OwnDays {
  override val calendar: StateFlow<OwnCalendar> =
    combine(database.values().ownCalendar(), database.values().coworkers(), ::Synced)
      .stateIn(scope, SharingStarted.Eagerly, Synced(KitCalendar.empty, emptyList()))

  // One at a time in the order they were made: each reads the day as the one before left it.
  private val writes = Channel<suspend () -> Unit>(Channel.UNLIMITED)

  init {
    scope.launch { for (write in writes) write() }
  }

  override fun set(day: LocalDate, entry: DayEntry?) {
    // No memo in the entry keeps the day's.
    val shown = entry?.let { ShownDay(it.shift, it.start, it.end, people = it.people) }
    writes.trySend { edits.setDays(mapOf(day to shown)) }
  }

  override fun setNote(day: LocalDate, note: String) {
    writes.trySend { edits.setDay(day.toString(), DayField.DAY_FIELD_NOTE, note.ifEmpty { null }) }
  }

  override fun addCoworker(name: String): Coworker {
    val coworker = Coworker(UUID.randomUUID().toString().lowercase(), name)
    writes.trySend { edits.addCoworker(name, coworker.id) }
    return coworker
  }

  private class Synced(private val own: KitCalendar, coworkers: List<CoworkerRow>) : OwnCalendar {
    override val patterns = own.patterns.map { it.pattern }
    override val coworkers = coworkers.map { Coworker(it.id, it.name) }

    override fun shown(from: LocalDate, through: LocalDate): Map<LocalDate, DayEntry> =
      own.shown(from, through).mapValues { (_, day) -> DayEntry(day.shift, day.start, day.end, day.people.orEmpty()) }

    override fun note(day: LocalDate): String? = own.note(day)
  }
}

private val PatternRow.pattern
  get() =
    Pattern(
      id = id,
      name = name,
      icon = icon,
      emoji = emoji,
      symbol = symbol,
      color = color,
      time = start?.let { start -> end?.let { ShiftTime(start, it) } },
      countsAsOff = countsAsOff,
      nextDay = nextDay,
      archived = archived,
    )
