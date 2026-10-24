package app.pochical.calendar

import app.pochical.kit.AppDatabase
import app.pochical.kit.CoworkerRow
import app.pochical.kit.OwnEdits
import app.pochical.kit.PatternRefusal
import app.pochical.kit.PatternRow
import app.pochical.kit.RepeatOrder
import app.pochical.kit.daysShowing
import app.pochical.kit.readyCopies
import app.pochical.kit.ShownDay
import app.pochical.kit.newId
import app.pochical.kit.ownCalendar
import app.pochical.v1.DayField
import app.pochical.v1.pattern
import java.time.LocalDate
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import app.pochical.kit.OwnCalendar as KitCalendar

/**
 * The person's days as the device keeps them (:kit): read from its database whenever sync or an
 * edit changes it, and edited through its outbox, which sends them to the server and the person's
 * other devices.
 */
class SyncedDays(private val database: AppDatabase, private val edits: OwnEdits, scope: CoroutineScope) : OwnDays {
  private val values = database.values()

  private val unread = Synced(KitCalendar.empty, emptyList())

  // Read first when first asked for, so what the launch puts in before then is in that first read.
  override val calendar: StateFlow<OwnCalendar> =
    combine(values.ownCalendar(), values.coworkers(), ::Synced)
      .stateIn(scope, SharingStarted.Lazily, unread)

  override suspend fun awaitRead() {
    calendar.first { it !== unread }
  }

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

  override fun enter(day: LocalDate, shift: String?) {
    writes.trySend { edits.enter(shift, day) }
  }

  override fun fill(days: List<LocalDate>, shift: String) {
    writes.trySend { edits.fill(days, shift) }
  }

  override suspend fun shownOnceWritten(from: LocalDate, through: LocalDate): Set<LocalDate> =
    inTurn { values.ownCalendar().first().shown(from, through).keys }

  override suspend fun savePattern(pattern: Pattern): PatternRefusal? = inTurn { edits.savePattern(pattern.id, pattern.wire) }

  override suspend fun deletePattern(id: String): PatternRefusal? = inTurn { edits.deletePattern(id) }

  override fun orderPatterns(ids: List<String>) {
    writes.trySend { edits.orderPatterns(ids) }
  }

  override suspend fun daysShowing(id: String): Int = inTurn { database.daysShowing(id) }

  override suspend fun putOrder(order: RepeatOrder) = inTurn { edits.putOrder(order) }

  override suspend fun moveOrder(from: LocalDate, to: LocalDate): Boolean = inTurn { edits.moveOrder(from, to) }

  override suspend fun removeOrder(start: LocalDate) = inTurn { edits.removeOrder(start) }

  override suspend fun setHolidaysOff(on: Boolean, picked: String?, start: LocalDate) = inTurn { edits.setHolidaysOff(on, picked, start) }

  override suspend fun changeJob(ids: List<String>, sequence: List<String>, start: LocalDate, anchor: LocalDate) = inTurn {
    edits.changeJob(readyCopies(ids), sequence, start, anchor, holidayCountry())
  }

  /** What [work] gives once every write before it is done, in the writes' turn. */
  private suspend fun <T> inTurn(work: suspend () -> T): T {
    val done = CompletableDeferred<T>()
    writes.send { done.complete(work()) }
    return done.await()
  }

  override fun setNote(day: LocalDate, note: String) {
    writes.trySend { edits.setDay(day.toString(), DayField.DAY_FIELD_NOTE, note.ifEmpty { null }) }
  }

  override fun addCoworker(name: String): Coworker {
    val coworker = Coworker(newId(), name)
    writes.trySend { edits.addCoworker(name, coworker.id) }
    return coworker
  }

  override fun renameCoworker(id: String, name: String) {
    writes.trySend { edits.renameCoworker(id, name) }
  }

  override fun deleteCoworker(id: String) {
    writes.trySend { edits.deleteCoworker(id) }
  }

  override fun orderCoworkers(ids: List<String>) {
    writes.trySend { edits.orderCoworkers(ids) }
  }

  private class Synced(private val own: KitCalendar, coworkers: List<CoworkerRow>) : OwnCalendar {
    override val patterns = own.patterns.map { it.pattern }
    override val coworkers = coworkers.map { Coworker(it.id, it.name) }

    override fun shown(from: LocalDate, through: LocalDate): Map<LocalDate, DayEntry> =
      own.shown(from, through).mapValues { (_, day) -> DayEntry(day.shift, day.start, day.end, day.people.orEmpty()) }

    override fun note(day: LocalDate): String? = own.note(day)

    override fun nextDay(shift: String): String? = own.nextDay(shift)

    override val orders: List<RepeatOrder>
      get() = own.orders

    override fun hasOwnShift(day: LocalDate): Boolean = own.hasOwnShift(day)
  }
}

/** The pattern as the wire carries it. */
private val Pattern.wire
  get() = pattern {
    name = this@wire.name
    emoji = this@wire.emoji
    symbol = this@wire.symbol
    icon = this@wire.icon
    color = this@wire.color
    this@wire.time?.let { time ->
      start = time.start
      end = time.end
    }
    countsAsOff = this@wire.countsAsOff
    this@wire.nextDay?.let { nextDay = it }
    archived = this@wire.archived
  }

/** The pattern as :kit holds it. */
internal val Pattern.row: PatternRow
  get() = PatternRow(id, name, emoji, symbol, icon, color, time?.start, time?.end, countsAsOff, nextDay, archived)

/** The pattern as the screens draw it. */
internal val PatternRow.pattern: Pattern
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
