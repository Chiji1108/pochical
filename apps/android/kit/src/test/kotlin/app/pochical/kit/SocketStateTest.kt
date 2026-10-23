package app.pochical.kit

import app.pochical.kit.SocketEvent.CaughtUp
import app.pochical.kit.SocketEvent.ClockAhead
import app.pochical.kit.SocketEvent.Close
import app.pochical.kit.SocketEvent.Dropped
import app.pochical.kit.SocketEvent.NetworkChanged
import app.pochical.kit.SocketEvent.Refused
import app.pochical.kit.SocketEvent.Start
import app.pochical.kit.SocketEvent.WaitOver
import app.pochical.kit.SocketEvent.Welcomed
import org.junit.Assert.assertEquals
import org.junit.Test

private fun SocketState.after(vararg events: SocketEvent) = events.fold(this) { state, event -> state.on(event) }

class SocketStateTest {
  @Test
  fun eachFailedTryWaitsLongerUntilASocketCatchesUp() {
    val failing = SocketState.Closed.after(Start, Dropped, WaitOver, Dropped, WaitOver, Welcomed, Dropped)
    assertEquals(SocketState.Waiting(4), failing)

    // Not the Welcome: the Pong after it starts the count again.
    val caughtUp = failing.after(WaitOver, Welcomed, CaughtUp, Dropped)
    assertEquals(SocketState.Waiting(1), caughtUp)
  }

  @Test
  fun theAppComingBackOrTheNetworkTriesAtOnceCountingAgain() {
    val waiting = SocketState.Closed.after(Start, Dropped, WaitOver, Dropped)
    assertEquals(SocketState.Waiting(3), waiting)
    assertEquals(SocketState.Opening(1), waiting.on(Start))
    assertEquals(SocketState.Opening(1), waiting.on(NetworkChanged))
    // An open socket stays as it is when the app comes back.
    assertEquals(SocketState.Current, SocketState.Current.on(Start))
  }

  @Test
  fun anotherDefaultNetworkMovesAnOpenSocketAtOnce() {
    assertEquals(SocketState.Opening(1), SocketState.Current.on(NetworkChanged))
    assertEquals(SocketState.Opening(1), SocketState.CatchingUp(2).on(NetworkChanged))
    assertEquals(SocketState.Opening(1), SocketState.Opening(4).on(NetworkChanged))
  }

  @Test
  fun clocksAheadReconnectAtOnce() {
    assertEquals(SocketState.Opening(1), SocketState.Current.on(ClockAhead))
  }

  @Test
  fun aRefusalStopsTryingUntilTheAccountChanges() {
    for (why in listOf(Stop.SignedOut, Stop.ProtocolTooOld, Stop.NotTheOwner)) {
      val stopped = SocketState.Opening(1).on(Refused(why))
      assertEquals(SocketState.Stopped(why), stopped.after(Start, NetworkChanged, WaitOver, Close, Start))
    }
  }

  @Test
  fun aGroupNotJoinedIsTriedAgainOnlyWhenOpenedAgain() {
    val stopped = SocketState.CatchingUp(1).on(Refused(Stop.NotMember))
    assertEquals(SocketState.Stopped(Stop.NotMember), stopped.after(NetworkChanged, WaitOver))
    assertEquals(SocketState.Opening(1), stopped.on(Start))
  }

  @Test
  fun closingStopsTheWaitAndTheSocket() {
    assertEquals(SocketState.Closed, SocketState.Waiting(5).on(Close))
    assertEquals(SocketState.Closed, SocketState.Current.on(Close))
    assertEquals(SocketState.Closed, SocketState.Closed.after(Dropped, WaitOver, NetworkChanged))
  }
}
