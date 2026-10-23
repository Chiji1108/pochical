package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Test

/** A default network callback's onAvailable and onLost, as the OS calls them, and what the sockets hear. */
private class Callbacks(now: String?) {
  val heard = mutableListOf<String>()
  private val default = DefaultNetwork(now, lost = { heard += "lost" }, changed = { heard += "changed to $it" })

  fun available(network: String) = apply { default.available(network) }

  fun lost(network: String) = apply { default.lost(network) }
}

@Serializable
private data class DefaultNetworkVectors(val defaultNetwork: List<Case>) {
  @Serializable
  data class Case(
    override val name: String,
    val from: String?,
    val steps: List<String?>,
    val expected: List<String>,
  ) : VectorCase
}

class DefaultNetworkTest {
  @Test
  fun defaultNetwork() =
    vectors<DefaultNetworkVectors>("reconnect").defaultNetwork.checkEach({ it.expected }) { case ->
      val heard = mutableListOf<String>()
      val default = DefaultNetwork(case.from, lost = { heard += "lost" }, changed = { heard += "changed" })
      case.steps.forEach(default::becomes)
      heard
    }

  @Test
  fun anotherNetworkTakingOverIsAChangeThoughTheOneBeforeIsNotLost() {
    val callbacks = Callbacks(now = "wifi").available("wifi").available("cellular").lost("cellular").available("wifi")
    assertEquals(listOf("changed to cellular", "lost", "changed to wifi"), callbacks.heard)
  }

  @Test
  fun theOneBeforeGoingOnceAnotherTookOverIsNotHeard() {
    val callbacks = Callbacks(now = "cellular").available("wifi").lost("cellular")
    assertEquals(listOf("changed to wifi"), callbacks.heard)
  }
}
