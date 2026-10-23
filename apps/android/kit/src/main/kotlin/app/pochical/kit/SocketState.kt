package app.pochical.kit

/** Why a socket stopped trying (spec/sync-protocol.md, Reconnecting). */
enum class Stop {
  /**
   * The server does not know the session (401): signed out or deleted elsewhere. Nothing is
   * cleared and no new user is made; the account says so and lets the person choose.
   */
  SignedOut,

  /** The server needs a newer app. */
  ProtocolTooOld,

  /** The database is not the user's the socket was started as. */
  NotTheOwner,

  /**
   * The user is not in the group (403, or closed with `notMemberCloseCode`): opening the group again
   * tries once more, as after joining it again.
   */
  NotMember,
}

/**
 * Where a sync socket is (spec/sync-protocol.md, Sockets; Reconnecting). `tries` counts the tries
 * since a socket last caught up, the one under way or waited for included, which is what the wait
 * before it grows by (spec/vectors/reconnect.json).
 */
sealed interface SocketState {
  /** Not asked to be open: the app is in the background, or the group is not open. */
  data object Closed : SocketState

  /** Waiting a while before try [tries]. */
  data class Waiting(val tries: Int) : SocketState

  /** Try [tries] under way: opening, or open before its Welcome. */
  data class Opening(val tries: Int) : SocketState

  /** Welcome came; what the DO had then is still coming, until the Pong to the Ping after it. */
  data class CatchingUp(val tries: Int) : SocketState

  /** Open and caught up. */
  data object Current : SocketState

  /** Not trying again, for [why]. */
  data class Stopped(val why: Stop) : SocketState

  /** What the screens say: whether to show 接続中… and the like. */
  val isOpen: Boolean
    get() = this is CatchingUp || this is Current
}

/** What happens to a socket. */
sealed interface SocketEvent {
  /** Asked to be open (the app came to the front, the group was opened): try at once, the count started again. */
  data object Start : SocketEvent

  /** The network came back after it went: try at once, the count started again. */
  data object NetworkBack : SocketEvent

  /** The wait before a try is over. */
  data object WaitOver : SocketEvent

  data object Welcomed : SocketEvent

  data object CaughtUp : SocketEvent

  /** The socket closed or failed, its keepalive went unanswered, or the network went. */
  data object Dropped : SocketEvent

  /** The server refused the edits' clocks as far ahead (HLC): reconnect at once. */
  data object ClockAhead : SocketEvent

  data class Refused(val why: Stop) : SocketEvent

  /** No longer asked to be open. */
  data object Close : SocketEvent
}

/** The socket's state after [event]: the one rule for when it tries, waits and stops. */
fun SocketState.on(event: SocketEvent): SocketState =
  when (event) {
    SocketEvent.Start ->
      when (this) {
        SocketState.Closed,
        is SocketState.Waiting -> SocketState.Opening(1)
        is SocketState.Stopped -> if (why == Stop.NotMember) SocketState.Opening(1) else this
        is SocketState.Opening,
        is SocketState.CatchingUp,
        SocketState.Current -> this
      }
    SocketEvent.NetworkBack -> if (this is SocketState.Waiting) SocketState.Opening(1) else this
    SocketEvent.WaitOver -> if (this is SocketState.Waiting) SocketState.Opening(tries) else this
    SocketEvent.Welcomed -> if (this is SocketState.Opening) SocketState.CatchingUp(tries) else this
    SocketEvent.CaughtUp -> if (this is SocketState.CatchingUp) SocketState.Current else this
    SocketEvent.Dropped ->
      when (this) {
        is SocketState.Opening -> SocketState.Waiting(tries + 1)
        is SocketState.CatchingUp -> SocketState.Waiting(tries + 1)
        SocketState.Current -> SocketState.Waiting(1)
        else -> this
      }
    SocketEvent.ClockAhead -> if (isOpen || this is SocketState.Opening) SocketState.Opening(1) else this
    is SocketEvent.Refused -> if (this == SocketState.Closed) this else SocketState.Stopped(event.why)
    SocketEvent.Close -> if (this is SocketState.Stopped) this else SocketState.Closed
  }
