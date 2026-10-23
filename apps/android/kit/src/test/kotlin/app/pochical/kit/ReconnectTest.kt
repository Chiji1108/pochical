package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class ReconnectVectors(val waitMost: List<WaitMost>) {
  @Serializable
  data class WaitMost(
    override val name: String,
    val tries: Int,
    val firstMs: Int,
    val mostMs: Int,
    val expected: Int,
  ) : VectorCase
}

class ReconnectTest {
  @Test
  fun waitMost() =
    vectors<ReconnectVectors>("reconnect").waitMost.checkEach({ it.expected }) {
      reconnectWaitMost(it.tries, it.firstMs, it.mostMs)
    }
}
