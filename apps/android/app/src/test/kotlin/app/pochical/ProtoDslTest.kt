package app.pochical

import app.pochical.v1.hlc
import org.junit.Assert.assertEquals
import org.junit.Test

// :proto's Kotlin DSL builders are inline, so they compile into :app only
// when both modules target the same JVM.
class ProtoDslTest {
  @Test
  fun appBuildsMessagesWithTheGeneratedDsl() {
    val clock = hlc {
      physicalMs = 1_700_000_000_000
      counter = 2
      deviceId = "device"
    }
    assertEquals(2, clock.counter)
    assertEquals("device", clock.deviceId)
  }
}
