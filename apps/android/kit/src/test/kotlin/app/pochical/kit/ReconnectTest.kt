package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class ReconnectVectors(val waitMost: List<WaitMost>, val tries: List<Tries>) {
  @Serializable
  data class WaitMost(
    override val name: String,
    val tries: Int,
    val firstMs: Int,
    val mostMs: Int,
    val expected: Int,
  ) : VectorCase

  @Serializable
  data class Tries(override val name: String, val events: List<String>, val expected: List<Int?>) : VectorCase
}

class ReconnectTest {
  @Test
  fun waitMost() =
    vectors<ReconnectVectors>("reconnect").waitMost.checkEach({ it.expected }) {
      reconnectWaitMost(it.tries, it.firstMs, it.mostMs)
    }

  @Test
  fun tries() =
    vectors<ReconnectVectors>("reconnect").tries.checkEach({ it.expected }) { case ->
      var state: SocketState = SocketState.Closed
      val waits = mutableListOf<Int?>()
      for (event in case.events) {
        state =
          when (event) {
            "start" -> state.on(SocketEvent.Start)
            "networkChanged" -> state.on(SocketEvent.NetworkChanged)
            "clockAhead" -> state.on(SocketEvent.ClockAhead)
            "welcomed" -> state.on(SocketEvent.Welcomed)
            "caughtUp" -> state.on(SocketEvent.CaughtUp)
            "dropped" -> state.on(SocketEvent.Dropped)
            else -> error("unknown event $event")
          }
        when (event) {
          "start", "networkChanged", "clockAhead" -> waits.add(null)
          "dropped" -> {
            waits.add((state as SocketState.Waiting).tries)
            state = state.on(SocketEvent.WaitOver)
          }
        }
      }
      waits
    }
}
