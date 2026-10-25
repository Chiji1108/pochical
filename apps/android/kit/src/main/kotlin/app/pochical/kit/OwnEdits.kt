package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.DayField
import app.pochical.v1.Pattern
import app.pochical.v1.RepeatOrder as WireOrder
import app.pochical.v1.change
import app.pochical.v1.coworkerOrder
import app.pochical.v1.coworkerValue
import app.pochical.v1.dayValue
import app.pochical.v1.patternOrder
import app.pochical.v1.patternValue
import app.pochical.v1.preferenceValue
import app.pochical.v1.repeatOrders
import com.google.protobuf.ByteString
import java.time.LocalDate
import java.util.UUID

/**
 * The person's edits of their own values, each stamped with the device's next clock and kept in
 * the outbox in the same transaction as it shows (spec/sync-protocol.md, Outbox), whether a socket
 * is open or not: the user's socket sends it once it is.
 */
class OwnEdits(private val database: AppDatabase, private val now: () -> Long = System::currentTimeMillis) {
  /** Sets one field of a day, or clears it with null; nothing when it already shows that. */
  suspend fun setDay(date: String, field: DayField, value: String?) = database.write {
    val shown = day(date)
    val current =
      when (field) {
        DayField.DAY_FIELD_PATTERN -> shown?.pattern
        DayField.DAY_FIELD_START -> shown?.start
        DayField.DAY_FIELD_END -> shown?.end
        DayField.DAY_FIELD_NOTE -> shown?.note
        DayField.DAY_FIELD_PEOPLE -> shown?.people
        else -> throw IllegalArgumentException("No day field $field")
      }
    if (current == value) return@write
    val clock = nextClock(now())
    edit(change {
      day = dayValue {
        this.date = date
        this.field = field
        if (value != null) this.value = value
        hlc = clock
      }
    })
  }

  /**
   * Sets the days in [edits] to show what they say, or nothing (null), as a day's detail does
   * (iOS OwnValues.set): each field whose own value changes is an edit of its own, and only what
   * differs from the repeating orders is kept as the person's (spec/vectors/own-days.json).
   */
  suspend fun setDays(edits: Map<LocalDate, ShownDay?>) = database.write {
    val first = edits.keys.minOrNull() ?: return@write
    setShown(edits, ownCalendar(first, edits.keys.max()))
  }

  /**
   * Enters [shift] on [day], or clears it with null, as a key of ポチポチ入力's tray does: a pattern
   * with a next day fills the day after too (spec/vectors/entering.json, enter).
   */
  suspend fun enter(shift: String?, day: LocalDate) = database.write {
    val next = day.plusDays(1)
    val calendar = ownCalendar(day, next)
    val shown = calendar.shown(day, next)
    val entered = enteringShift(shift, day, shown, calendar::nextDay)
    setShown(listOf(day, next).filter { entered[it] != shown[it] }.associateWith { entered[it] }, calendar)
  }

  /** Puts [shift] on each of [days], as filling the blanks 完了 asks about does. */
  suspend fun fill(days: List<LocalDate>, shift: String) = database.write {
    val first = days.minOrNull() ?: return@write
    setShown(days.associateWith { ShownDay(shift) }, ownCalendar(first, days.max()))
  }

  private suspend fun SyncDao.setShown(edits: Map<LocalDate, ShownDay?>, calendar: OwnCalendar) {
    if (edits.isEmpty()) return
    val edited = editedOwnDays(calendar.own, calendar.planned(edits.keys.min(), edits.keys.max()), edits)
    for (day in edits.keys.sorted()) {
      for ((field, value) in changedFields(calendar.own[day], edited[day])) {
        val clock = nextClock(now())
        edit(change {
          this.day = dayValue {
            date = day.toString()
            this.field = field
            if (value != null) this.value = value
            hlc = clock
          }
        })
      }
    }
  }

  /**
   * Keeps [pattern] as it is now; a new one goes at the end of the order. One the server would
   * refuse, or archiving one a repeating order in use or to come still has, is refused, and nothing
   * is written.
   */
  suspend fun savePattern(id: String, pattern: Pattern): PatternRefusal? = database.write {
    // Asked before the edit shows it.
    val saved = pattern(id)
    if (!fitsPattern(pattern.row(id))) return@write PatternRefusal.Unfit
    if (pattern.archived && refusesArchiving(id, saved?.archived == true, repeatOrders().map { it.order })) {
      return@write PatternRefusal.Repeating
    }
    putPattern(id, pattern)
    if (saved == null) orderPatterns(patternIds() - id + id)
    null
  }

  /**
   * Deletes a pattern: it goes from the list and its order, kept as a tombstone, and nothing that
   * names it changes (spec/sync-protocol.md, Deleted values). One a repeating order in use or to
   * come still has is refused, and nothing is written.
   */
  suspend fun deletePattern(id: String): PatternRefusal? = database.write {
    if (repeats(id, repeatOrders().map { it.order })) return@write PatternRefusal.Repeating
    putPattern(id, null)
    orderPatterns(patternIds() - id)
    null
  }

  /** Puts the patterns in this order. */
  suspend fun orderPatterns(ids: List<String>) = database.write { orderPatterns(ids) }

  /**
   * The repeating orders from now on, whole. A new job's order gives its start as [clearFrom], and
   * takes back the days' own shifts and times from there set before it (spec/sync-protocol.md,
   * Repeating orders).
   */
  suspend fun setRepeatOrders(orders: List<WireOrder>, clearFrom: String? = null) = database.write { writeOrders(orders, clearFrom) }

  /**
   * 繰り返し's periods: [order] put in on its start among the others, in place of one that started
   * that day, the rest kept. The days the person entered stay over it.
   */
  suspend fun putOrder(order: RepeatOrder) = database.write {
    writeOrders(ordersPutting(repeatOrders().map { it.order }, order).map { it.wire })
  }

  /**
   * Moves the period starting on [from] to start on [to], its first shift staying on the day it fell
   * on. A start not between those of the periods before and after it is refused, false, and nothing
   * is written, so no period runs over another.
   */
  suspend fun moveOrder(from: LocalDate, to: LocalDate): Boolean = database.write {
    val orders = repeatOrders().map { it.order }
    val index = orders.indexOfFirst { it.start == from }
    if (index < 0 || !startFits(orders, index, to)) return@write false
    val order = orders[index]
    if (to != from) writeOrders(ordersPutting(orders, order.copy(start = to, anchor = order.anchor ?: order.start), replacing = from).map { it.wire })
    true
  }

  /** Takes out the period starting on [start], the one before running on. */
  suspend fun removeOrder(start: LocalDate) = database.write {
    writeOrders(ordersRemoving(repeatOrders().map { it.order }, start).map { it.wire })
  }

  /**
   * Turns 祝日は休みにする on or off for the period starting on [start], holidays taking the pattern
   * [holidaySetting] gives; with none in use that counts as off it cannot be turned on, but it can
   * always be turned off (spec/shift-patterns.md, Holidays).
   */
  suspend fun setHolidaysOff(on: Boolean, picked: String? = null, start: LocalDate) = database.write {
    val orders = repeatOrders().map { it.order }
    val order = orders.find { it.start == start } ?: return@write
    val daysOff = patterns().filter { it.countsAsOff && !it.archived }.map { it.id }
    val setting = holidaySetting(daysOff, order.holidaysOff, order.holidayShift, picked)
    if (on && !order.holidaysOff && !setting.canTurnOn) return@write
    // Turned off, it keeps the pattern holidays took, so turned on again it takes it again.
    val changed = order.copy(holidaysOff = on, holidayShift = setting.shift ?: order.holidayShift)
    writeOrders(ordersPutting(orders, changed).map { it.wire })
  }

  /**
   * 新しい仕事にする (spec/shift-patterns.md, Changing jobs): [incoming] take over the patterns from
   * [start], a pattern of the person's still on a day before it staying after them, archived; and
   * [sequence] repeats from [start] counted from [anchor], taking the days from there back from the
   * person's own. An empty sequence ends repeating there.
   */
  suspend fun changeJob(
    incoming: List<PatternRow>,
    sequence: List<String>,
    start: LocalDate,
    anchor: LocalDate,
    holidayCountry: String,
  ) = database.write {
    val job = takePatterns(incoming, sequence, start)
    repeatFrom(job, start, anchor, holidayCountry)
  }

  /**
   * はじめの設定 (spec/shift-patterns.md, The first run), as iOS's `OwnValues.begin`: [incoming]
   * become the person's patterns, and [sequence], when there is one, repeats counted from [anchor],
   * from the month before [today]'s or from [anchor] when that is earlier, so the days just past
   * show it too. A roster's work, with no sequence, sets no order.
   */
  suspend fun begin(incoming: List<PatternRow>, sequence: List<String>, anchor: LocalDate, today: LocalDate, holidayCountry: String) =
    database.write {
      val start = minOf(anchor, today.withDayOfMonth(1).minusMonths(1))
      val job = takePatterns(incoming, sequence, start)
      if (sequence.isNotEmpty()) repeatFrom(job, start, anchor, holidayCountry)
    }

  /**
   * [incoming] take over the patterns from [start], a pattern of the person's still on a day before
   * it staying after them; the job's patterns and its [sequence] under their ids.
   */
  private suspend fun SyncDao.takePatterns(incoming: List<PatternRow>, sequence: List<String>, start: LocalDate): NewJob {
    val shownBefore = shownSoFar(through = start.minusDays(1)).mapTo(HashSet()) { it.shift }
    val job = patternsForJob(patterns(), incoming, sequence, usedBefore = shownBefore::contains, newId = ::newId)
    val own = patterns()
    val kept = job.patterns.mapTo(HashSet()) { it.id }
    for (pattern in own) if (pattern.id !in kept) putPattern(pattern.id, null)
    for (pattern in job.patterns) if (pattern !in own) putPattern(pattern.id, pattern.wire)
    orderPatterns(job.patterns.map { it.id })
    return job
  }

  /** The job's sequence repeats from [start] counted from [anchor]; an empty one ends repeating there. */
  private suspend fun SyncDao.repeatFrom(job: NewJob, start: LocalDate, anchor: LocalDate, holidayCountry: String) {
    val byId = job.patterns.associateBy { it.id }
    val offShift = holidayShift(job.patterns.filter { it.countsAsOff && !it.archived }.map { it.id })
    val holidaysOff = offShift != null && holidaysOffByDefault(job.sequence, anchor) { byId[it]?.countsAsOff == true }
    val order = RepeatOrder(job.sequence, start, anchor, holidaysOff, offShift.takeIf { holidaysOff }, holidayCountry)
    writeOrders(ordersAdding(repeatOrders().map { it.order }, order).map { it.wire }, clearFrom = start.toString())
  }

  private suspend fun SyncDao.writeOrders(orders: List<WireOrder>, clearFrom: String? = null) {
    val clock = nextClock(now())
    edit(change {
      repeatOrders = repeatOrders {
        this.orders += orders
        hlc = clock
      }
    }, clearFrom)
  }

  /** Keeps [pattern] under [id], or deletes it with null, kept as a tombstone. */
  private suspend fun SyncDao.putPattern(id: String, pattern: Pattern?) {
    val clock = nextClock(now())
    edit(change {
      this.pattern = patternValue {
        this.id = id
        if (pattern != null) this.pattern = pattern
        hlc = clock
      }
    })
  }

  /**
   * Adds someone to 一緒に働く人, at the end of the list, and gives back their id: [id] when the caller
   * names them before this is written, as a day's detail does to put them on the day too.
   */
  suspend fun addCoworker(name: String, id: String = newId()): String = database.write {
    putCoworker(id, name)
    orderCoworkers(coworkerOrder() + id)
    id
  }

  /**
   * Gives someone a new name, on every day they are on too; nothing for someone gone, whose newer
   * clock would bring them back (spec/sync-protocol.md, Deleted values).
   */
  suspend fun renameCoworker(id: String, name: String) = database.write { if (id in coworkerIds()) putCoworker(id, name) }

  /** Deletes someone: gone from the list, and skipped on the days that name them. */
  suspend fun deleteCoworker(id: String) = database.write {
    putCoworker(id, null)
    orderCoworkers(coworkerIds() - id)
  }

  /** Lists the coworkers in this order. */
  suspend fun orderCoworkers(ids: List<String>) = database.write { orderCoworkers(ids) }

  /**
   * Sets preferences kept with the account, each its key's message encoded
   * (proto/pochical/v1/preferences.proto), in one write, so no reader sees some set and not others.
   */
  suspend fun setPreferences(messages: Map<String, ByteArray>) = database.write {
    for ((key, message) in messages.toSortedMap()) {
      val clock = nextClock(now())
      edit(change {
        preference = preferenceValue {
          this.key = key
          this.message = ByteString.copyFrom(message)
          hlc = clock
        }
      })
    }
  }

  private suspend fun SyncDao.edit(change: Change, clearFrom: String? = null) = edit(change, newId(), clearFrom)

  private suspend fun SyncDao.orderPatterns(ids: List<String>) {
    val clock = nextClock(now())
    edit(change {
      patternOrder = patternOrder {
        this.ids += ids
        hlc = clock
      }
    })
  }

  private suspend fun SyncDao.putCoworker(id: String, name: String?) {
    val clock = nextClock(now())
    edit(change {
      coworker = coworkerValue {
        this.id = id
        if (name != null) this.name = name
        hlc = clock
      }
    })
  }

  private suspend fun SyncDao.orderCoworkers(ids: List<String>) {
    val clock = nextClock(now())
    edit(change {
      coworkerOrder = coworkerOrder {
        this.ids += ids
        hlc = clock
      }
    })
  }
}

/** A new id for a value, an edit or a device: a UUID as the wire writes them, lowercase. */
fun newId(): String = UUID.randomUUID().toString().lowercase()
