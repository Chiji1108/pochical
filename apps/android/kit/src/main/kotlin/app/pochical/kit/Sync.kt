package app.pochical.kit

import app.pochical.design.SyncLimits
import app.pochical.v1.Change
import app.pochical.v1.Change.KindCase
import app.pochical.v1.ClientFrame
import app.pochical.v1.CoworkerEdit
import app.pochical.v1.CoworkerEdits
import app.pochical.v1.DayEdit
import app.pochical.v1.DayEdits
import app.pochical.v1.Hlc
import app.pochical.v1.PatternEdit
import app.pochical.v1.PatternEdits
import app.pochical.v1.PreferenceEdit
import app.pochical.v1.PreferenceEdits
import app.pochical.v1.RepeatOrdersEdit
import app.pochical.v1.RepeatOrdersEdits
import java.util.UUID

/**
 * The sync schema the app reads Changes by. Raise it whenever the app starts reading a Change, or a
 * field of one, it did not read before: a device moves its cursor past Changes it cannot read, so
 * after the update it takes everything again (`TakeAllAgainIfOlder`). 1: the user's own values,
 * their preferences and memberships, and the groups' members and their shared values. `mise run
 * sync:check` fails when `Change`'s messages in proto/ change while this stays.
 */
const val SYNC_SCHEMA = 1

// What the user's socket brings into the device's database (spec/sync-protocol.md, Sockets; Change
// log and cursor), each in one transaction with the cursor it moves.

/** The row, or a new device's: a new id, no clock, no offset, no cursor. */
internal suspend fun SyncDao.state(): SyncState =
  syncState() ?: SyncState(deviceId = UUID.randomUUID().toString().lowercase())

/**
 * Takes the database for [userId]'s: one that is no one's becomes theirs, with what was entered
 * before signing in. True when it is theirs now; false when it is another user's, which a socket as
 * [userId] neither sends from nor takes into (spec/sync-protocol.md, Sockets).
 */
internal suspend fun SyncDao.claim(userId: String): Boolean {
  val state = state()
  if (state.owner.isEmpty()) upsert(state.copy(owner = userId))
  return state.owner.isEmpty() || state.owner == userId
}

/** Welcome: the device's time is corrected by the server's from now on (HLC). */
internal suspend fun SyncDao.welcome(sentMs: Long, receivedMs: Long, serverMs: Long) {
  upsert(state().copy(offsetMs = clockOffset(sentMs, receivedMs, serverMs)))
}

/**
 * Changes, in cursor order: each is the server's value from now on, the device's clock goes past
 * each, so its next edit orders after them, and the cursor moves to the last.
 */
internal suspend fun SyncDao.take(changes: List<Change>) {
  val state = state()
  var last = state.last
  var cursor = state.cursor
  val floors = waitingFloors()
  for (change in changes) {
    takeOwn(change, floors)
    takeMembership(change)
    change.hlc?.let { last = last.receiving(HlcTime.of(it)) }
    cursor = maxOf(cursor, change.cursor)
  }
  upsert(state.withLast(last).copy(cursor = cursor))
}

/** Reset: the server's values go, the outbox stays, and the cursor goes back for what follows. */
internal suspend fun SyncDao.reset() {
  resetOwn()
  resetMemberships()
  upsert(state().copy(cursor = 0))
}

/** The clock of a local edit, from the device's last one at its corrected [now], kept as its new last one. */
internal suspend fun SyncDao.nextClock(now: Long): Hlc {
  val state = state()
  val clock = state.last.tick(state.corrected(now))
  upsert(state.withLast(clock))
  return clock.stamped(state.deviceId)
}

/** The outbox's edits after [id], in order, as frames, and the last edit's id. */
internal suspend fun SyncDao.frames(after: Long): Pair<List<ClientFrame>, Long> {
  val edits = outboxAfter(after)
  return framesOf(edits) to (edits.lastOrNull()?.id ?: after)
}

/**
 * After CODE_CLOCK_AHEAD, once Welcome has corrected the device's time (HLC): the clock starts
 * again from the latest among the changes taken, dropping the device's own far-ahead one, and every
 * waiting edit takes a new clock from it, in outbox order, so they keep their order and come after
 * everything taken.
 */
internal suspend fun SyncDao.restamp(now: Long) {
  val state = state()
  var last = HlcTime.start
  for (value in serverValues()) Change.parseFrom(value.change).hlc?.let { last = last.receiving(HlcTime.of(it)) }
  val edits = outbox()
  for (edit in edits) {
    last = last.tick(state.corrected(now))
    restamp(edit.id, Change.parseFrom(edit.change).withHlc(last.stamped(state.deviceId)).toByteArray())
  }
  upsert(state.withLast(last))
  // A waiting new job's order with its new clock may take back more.
  showDays(edits.mapNotNull { it.clearFrom })
}

/**
 * The edits as frames: a run of edits of one kind goes in one frame, up to `editsPerFrame`, each
 * with its `op_id` and its clock (spec/sync-protocol.md, Outbox).
 */
internal fun framesOf(edits: List<OutboxEdit>): List<ClientFrame> {
  val runs = mutableListOf<Pair<ClientFrame.KindCase, MutableList<Pair<OutboxEdit, Change>>>>()
  for (edit in edits) {
    val change = Change.parseFrom(edit.change)
    val kind = change.frameKind ?: continue
    val run = runs.lastOrNull()
    if (run != null && run.first == kind && run.second.size < SyncLimits.editsPerFrame) {
      run.second += edit to change
    } else {
      runs += kind to mutableListOf(edit to change)
    }
  }
  return runs.map { (kind, run) -> frameOf(kind, run) }
}

/** The frame kind that carries an edit of the change's value, null for what the device never edits. */
private val Change.frameKind: ClientFrame.KindCase?
  get() =
    when (kindCase) {
      KindCase.DAY -> ClientFrame.KindCase.DAY_EDITS
      KindCase.PATTERN,
      KindCase.PATTERN_ORDER -> ClientFrame.KindCase.PATTERN_EDITS
      KindCase.REPEAT_ORDERS -> ClientFrame.KindCase.REPEAT_ORDERS_EDITS
      KindCase.COWORKER,
      KindCase.COWORKER_ORDER -> ClientFrame.KindCase.COWORKER_EDITS
      KindCase.PREFERENCE -> ClientFrame.KindCase.PREFERENCE_EDITS
      else -> null
    }

private fun frameOf(kind: ClientFrame.KindCase, changes: List<Pair<OutboxEdit, Change>>): ClientFrame {
  val frame = ClientFrame.newBuilder()
  when (kind) {
    ClientFrame.KindCase.DAY_EDITS ->
      frame.setDayEdits(
        DayEdits.newBuilder().addAllEdits(changes.map { (edit, change) ->
          DayEdit.newBuilder().setOpId(edit.opId).setValue(change.day).build()
        })
      )
    ClientFrame.KindCase.PATTERN_EDITS ->
      frame.setPatternEdits(
        PatternEdits.newBuilder().addAllEdits(changes.map { (edit, change) ->
          PatternEdit.newBuilder().setOpId(edit.opId).apply {
            if (change.kindCase == KindCase.PATTERN) setPattern(change.pattern) else setOrder(change.patternOrder)
          }.build()
        })
      )
    ClientFrame.KindCase.REPEAT_ORDERS_EDITS ->
      frame.setRepeatOrdersEdits(
        RepeatOrdersEdits.newBuilder().addAllEdits(changes.map { (edit, change) ->
          RepeatOrdersEdit.newBuilder().setOpId(edit.opId).setOrders(change.repeatOrders).apply {
            edit.clearFrom?.let(::setClearFrom)
          }.build()
        })
      )
    ClientFrame.KindCase.COWORKER_EDITS ->
      frame.setCoworkerEdits(
        CoworkerEdits.newBuilder().addAllEdits(changes.map { (edit, change) ->
          CoworkerEdit.newBuilder().setOpId(edit.opId).apply {
            if (change.kindCase == KindCase.COWORKER) setCoworker(change.coworker) else setOrder(change.coworkerOrder)
          }.build()
        })
      )
    ClientFrame.KindCase.PREFERENCE_EDITS ->
      frame.setPreferenceEdits(
        PreferenceEdits.newBuilder().addAllEdits(changes.map { (edit, change) ->
          PreferenceEdit.newBuilder().setOpId(edit.opId).setValue(change.preference).build()
        })
      )
    else -> error("No edits go in a $kind frame")
  }
  return frame.build()
}
