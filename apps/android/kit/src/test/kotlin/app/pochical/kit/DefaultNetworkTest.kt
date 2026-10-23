package app.pochical.kit

import org.junit.Assert.assertEquals
import org.junit.Test

/** A default network callback's onAvailable and onLost, as the OS calls them, and what the sockets hear. */
private class Callbacks(now: String?) {
  val heard = mutableListOf<String>()
  private val default = DefaultNetwork(now, lost = { heard += "lost" }, changed = { heard += "changed to $it" })

  fun available(network: String) = apply { default.available(network) }

  fun lost(network: String) = apply { default.lost(network) }
}

class DefaultNetworkTest {
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

  @Test
  fun aNetworkAfterNoneIsAChange() {
    val callbacks = Callbacks(now = null).available("wifi")
    assertEquals(listOf("changed to wifi"), callbacks.heard)
  }
}
