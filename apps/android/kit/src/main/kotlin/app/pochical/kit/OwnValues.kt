package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.Change.KindCase
import app.pochical.v1.DayField
import app.pochical.v1.Hlc
import app.pochical.v1.Pattern
import app.pochical.v1.RepeatOrder
import app.pochical.v1.change
import app.pochical.v1.coworkerOrder
import app.pochical.v1.patternOrder
import app.pochical.v1.repeatOrders

// The user's own values on the device (spec/sync-protocol.md, Outbox): for each value, the last
// change the server sent apart from the device's own edits of it still waiting, and the tables of
// Tables.kt showing the latest waiting edit's value, else the server's. The device never compares
// clocks to choose: the server has, and its Changes come before the Acked that ends a wait
// (spec/vectors/local-edits.json). A new job's order waiting hides the days' shifts and times it
// takes back (spec/vectors/order-clears.json), until its Acked.

/**
 * A local edit, stamped with its clock: it shows at once and waits in the outbox until the server
 * acknowledges it. [clearFrom] is a new job's repeating-orders edit's, "YYYY-MM-DD".
 */
internal suspend fun SyncDao.edit(change: Change, opId: String, clearFrom: String? = null) {
  val key = change.valueKey ?: return
  insert(OutboxEdit(opId = opId, key = key, change = change.toByteArray(), clearFrom = clearFrom))
  show(change, waitingFloors())
  if (clearFrom != null) showDays(listOf(clearFrom))
}

/**
 * A change from the server: the value's from now on, shown unless an edit of it still waits.
 * [floors] are the waiting orders', read once for a frame's changes, which leave the outbox alone.
 */
internal suspend fun SyncDao.takeOwn(change: Change, floors: List<OrderFloor>? = null) {
  val key = change.valueKey ?: return
  upsert(ServerValue(key, change.toByteArray()))
  if (!isWaiting(key)) show(change, floors ?: waitingFloors())
}

/**
 * The edits an Acked names stop waiting, and a value with none left shows the server's: by then
 * the edit's own, the correction for it, or the newer value it lost to.
 */
internal suspend fun SyncDao.acknowledge(opIds: List<String>) {
  if (opIds.isEmpty()) return
  val acked = outboxEdits(opIds).sortedBy { it.id }
  deleteOutboxEdits(opIds)
  // Read once the acked edits are gone: an acked order hides nothing.
  val floors = waitingFloors()
  for (edit in acked.distinctBy { it.key }) {
    if (isWaiting(edit.key)) continue
    val server = serverValue(edit.key)
    show(server?.let { Change.parseFrom(it.change) } ?: Change.parseFrom(edit.change).cleared(), floors)
  }
  showDays(acked.mapNotNull { it.clearFrom })
}

/** A Reset: the server's values go, and the outbox stays and shows. */
internal suspend fun SyncDao.resetOwn() {
  deleteServerValues()
  deleteDays()
  deletePatterns()
  deletePatternOrder()
  deleteRepeatOrders()
  deleteCoworkers()
  deleteCoworkerOrder()
  deletePreferences()
  val floors = waitingFloors()
  for (edit in outbox()) show(Change.parseFrom(edit.change), floors)
}

/**
 * Shows again each day value from the earliest of [starts], the latest waiting edit's, else the
 * server's: what a new job's order waiting takes back changes there as it starts or stops waiting,
 * or as its clock moves (restamp).
 */
internal suspend fun SyncDao.showDays(starts: List<String>) {
  val from = starts.minOrNull() ?: return
  val floors = waitingFloors()
  val first = "day/$from"
  val shown = LinkedHashMap<String, ByteArray>()
  for (value in serverDayValues(first)) shown[value.key] = value.change
  for (edit in waitingDayEdits(first)) shown[edit.key] = edit.change
  for (data in shown.values) show(Change.parseFrom(data), floors)
}

/** The new job's orders waiting in the outbox, each taking back the days from its start set before it. */
internal suspend fun SyncDao.waitingFloors(): List<OrderFloor> =
  waitingOrders().mapNotNull { edit ->
    val hlc = Change.parseFrom(edit.change).hlc ?: return@mapNotNull null
    OrderFloor(edit.clearFrom ?: return@mapNotNull null, Clock.of(hlc))
  }

/**
 * Writes a value into the tables that show it; a day's shift or time that gives way to one of
 * [floors] shows cleared until the server settles it.
 */
private suspend fun SyncDao.show(change: Change, floors: List<OrderFloor>) {
  when (change.kindCase) {
    KindCase.DAY -> {
      val value = change.day
      val takenBack =
        value.hasHlc() && floors.any { givesWay(value.date, value.field, Clock.of(value.hlc), it) }
      val field = if (value.hasValue() && !takenBack) value.value else null
      val row = day(value.date) ?: DayRow(value.date)
      val shown =
        when (value.field) {
          DayField.DAY_FIELD_PATTERN -> row.copy(pattern = field)
          DayField.DAY_FIELD_START -> row.copy(start = field)
          DayField.DAY_FIELD_END -> row.copy(end = field)
          DayField.DAY_FIELD_NOTE -> row.copy(note = field)
          DayField.DAY_FIELD_PEOPLE -> row.copy(people = field)
          DayField.DAY_FIELD_UNSPECIFIED,
          DayField.UNRECOGNIZED,
          null -> return
        }
      if (shown == DayRow(value.date)) deleteDay(value.date) else upsert(shown)
    }
    KindCase.PATTERN -> {
      val value = change.pattern
      if (value.hasPattern()) upsert(value.pattern.row(value.id)) else deletePattern(value.id)
    }
    KindCase.PATTERN_ORDER -> {
      deletePatternOrder()
      insertPatternOrder(change.patternOrder.idsList.mapIndexed(::PatternOrderRow))
    }
    KindCase.REPEAT_ORDERS -> {
      deleteRepeatOrders()
      insertRepeatOrders(change.repeatOrders.ordersList.mapIndexed { position, order -> order.row(position) })
    }
    KindCase.COWORKER -> {
      val value = change.coworker
      if (value.hasName()) upsert(CoworkerRow(value.id, value.name)) else deleteCoworker(value.id)
    }
    KindCase.COWORKER_ORDER -> {
      deleteCoworkerOrder()
      insertCoworkerOrder(change.coworkerOrder.idsList.mapIndexed(::CoworkerOrderRow))
    }
    KindCase.PREFERENCE -> {
      val value = change.preference
      if (value.hasValue()) upsert(PreferenceRow(value.key, value.value)) else deletePreference(value.key)
    }
    else -> return
  }
}

/**
 * Which of the user's own values the change is of: one a day's field, a pattern, a coworker or a
 * preference, and one each for the orders. Null for what is not the user's own. Day values' keys run
 * "day/YYYY-MM-DD/field", so a day's range is a range of keys.
 */
internal val Change.valueKey: String?
  get() =
    when (kindCase) {
      KindCase.DAY ->
        when (day.field) {
          DayField.DAY_FIELD_UNSPECIFIED,
          DayField.UNRECOGNIZED,
          null -> null
          else -> "day/${day.date}/${day.field.number}"
        }
      KindCase.PATTERN -> "pattern/${pattern.id}"
      KindCase.PATTERN_ORDER -> "patternOrder"
      KindCase.REPEAT_ORDERS -> "repeatOrders"
      KindCase.COWORKER -> "coworker/${coworker.id}"
      KindCase.COWORKER_ORDER -> "coworkerOrder"
      KindCase.PREFERENCE -> "preference/${preference.key}"
      else -> null
    }

/** The clock of the user's own value the change carries. */
internal val Change.hlc: Hlc?
  get() =
    when (kindCase) {
      KindCase.DAY -> day.takeIf { it.hasHlc() }?.hlc
      KindCase.PATTERN -> pattern.takeIf { it.hasHlc() }?.hlc
      KindCase.PATTERN_ORDER -> patternOrder.takeIf { it.hasHlc() }?.hlc
      KindCase.REPEAT_ORDERS -> repeatOrders.takeIf { it.hasHlc() }?.hlc
      KindCase.COWORKER -> coworker.takeIf { it.hasHlc() }?.hlc
      KindCase.COWORKER_ORDER -> coworkerOrder.takeIf { it.hasHlc() }?.hlc
      KindCase.PREFERENCE -> preference.takeIf { it.hasHlc() }?.hlc
      else -> null
    }

/** The same value under [hlc]. */
internal fun Change.withHlc(hlc: Hlc): Change =
  toBuilder()
    .apply {
      when (kindCase) {
        KindCase.DAY -> setDay(day.toBuilder().setHlc(hlc))
        KindCase.PATTERN -> setPattern(pattern.toBuilder().setHlc(hlc))
        KindCase.PATTERN_ORDER -> setPatternOrder(patternOrder.toBuilder().setHlc(hlc))
        KindCase.REPEAT_ORDERS -> setRepeatOrders(repeatOrders.toBuilder().setHlc(hlc))
        KindCase.COWORKER -> setCoworker(coworker.toBuilder().setHlc(hlc))
        KindCase.COWORKER_ORDER -> setCoworkerOrder(coworkerOrder.toBuilder().setHlc(hlc))
        KindCase.PREFERENCE -> setPreference(preference.toBuilder().setHlc(hlc))
        else -> {}
      }
    }
    .build()

/** The same value, cleared: what shows of it with no server value. */
private fun Change.cleared(): Change =
  when (kindCase) {
    KindCase.DAY -> change { day = this@cleared.day.toBuilder().clearValue().build() }
    KindCase.PATTERN -> change { pattern = this@cleared.pattern.toBuilder().clearPattern().build() }
    KindCase.PATTERN_ORDER -> change { patternOrder = patternOrder {} }
    KindCase.REPEAT_ORDERS -> change { repeatOrders = repeatOrders {} }
    KindCase.COWORKER -> change { coworker = this@cleared.coworker.toBuilder().clearName().build() }
    KindCase.COWORKER_ORDER -> change { coworkerOrder = coworkerOrder {} }
    KindCase.PREFERENCE -> change { preference = this@cleared.preference.toBuilder().clearValue().build() }
    else -> this
  }

internal fun Pattern.row(id: String) =
  PatternRow(
    id = id,
    name = name,
    emoji = emoji,
    symbol = symbol,
    icon = icon,
    color = color,
    start = if (hasStart()) start else null,
    end = if (hasEnd()) end else null,
    countsAsOff = countsAsOff,
    nextDay = if (hasNextDay()) nextDay else null,
    archived = archived,
  )

internal fun RepeatOrder.row(position: Int) =
  RepeatOrderRow(
    position = position,
    start = start,
    anchor = if (hasAnchor()) anchor else null,
    sequence = sequenceList.joinToString(" "),
    holidaysOff = holidaysOff,
    holidayShift = if (hasHolidayShift()) holidayShift else null,
    holidayCountry = holidayCountry,
  )
