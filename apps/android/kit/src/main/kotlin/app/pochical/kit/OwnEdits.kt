package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.DayField
import app.pochical.v1.Pattern
import app.pochical.v1.RepeatOrder
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
   * Keeps [pattern] as it is now; a new one goes at the end of the order. Archiving one a repeating
   * order in use or to come still has is refused, and nothing is written.
   */
  suspend fun savePattern(id: String, pattern: Pattern): PatternRefusal? = database.write {
    // Asked before the edit shows it.
    val saved = pattern(id)
    if (pattern.archived && refusesArchiving(id, saved?.archived == true, repeatOrders().map { it.order })) {
      return@write PatternRefusal.Repeating
    }
    val clock = nextClock(now())
    edit(change {
      this.pattern = patternValue {
        this.id = id
        this.pattern = pattern
        hlc = clock
      }
    })
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
    val clock = nextClock(now())
    edit(change {
      pattern = patternValue {
        this.id = id
        hlc = clock
      }
    })
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
  suspend fun setRepeatOrders(orders: List<RepeatOrder>, clearFrom: String? = null) = database.write {
    val clock = nextClock(now())
    edit(change {
      repeatOrders = repeatOrders {
        this.orders += orders
        hlc = clock
      }
    }, clearFrom)
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

  /** Gives someone a new name, on every day they are on too. */
  suspend fun renameCoworker(id: String, name: String) = database.write { putCoworker(id, name) }

  /** Deletes someone: gone from the list, and skipped on the days that name them. */
  suspend fun deleteCoworker(id: String) = database.write {
    putCoworker(id, null)
    orderCoworkers(coworkerIds() - id)
  }

  /** Lists the coworkers in this order. */
  suspend fun orderCoworkers(ids: List<String>) = database.write { orderCoworkers(ids) }

  /**
   * Sets one of the preferences kept with the account to [message], its key's message encoded
   * (proto/pochical/v1/preferences.proto), or clears it.
   */
  suspend fun setPreference(key: String, message: ByteArray?) = database.write {
    val clock = nextClock(now())
    edit(change {
      preference = preferenceValue {
        this.key = key
        if (message != null) this.message = ByteString.copyFrom(message)
        hlc = clock
      }
    })
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
