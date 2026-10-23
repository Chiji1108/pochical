package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
data class VectorClock(val ms: Long, val counter: UInt, val device: String) {
  val clock
    get() = Clock(ms, counter, device)
}

@Serializable
data class VectorTime(val ms: Long, val counter: UInt) {
  val time
    get() = HlcTime(ms, counter)
}

// ahead is the server's to check.
@Serializable
private data class HlcVectors(
  val compare: List<Compare>,
  val tick: List<Tick>,
  val receive: List<Receive>,
  val offset: List<Offset>,
) {
  @Serializable
  data class Compare(override val name: String, val a: VectorClock, val b: VectorClock, val expected: Int) :
    VectorCase

  @Serializable
  data class Tick(override val name: String, val last: VectorTime, val now: Long, val expected: VectorTime) :
    VectorCase

  @Serializable
  data class Receive(
    override val name: String,
    val last: VectorTime,
    val remote: VectorTime,
    val expected: VectorTime,
  ) : VectorCase

  @Serializable
  data class Offset(
    override val name: String,
    val sentMs: Long,
    val receivedMs: Long,
    val serverMs: Long,
    val expected: Long,
  ) : VectorCase
}

class HlcTest {
  private val vectors = vectors<HlcVectors>("hlc")

  @Test
  fun compare() =
    vectors.compare.checkEach({ it.expected }) { Integer.signum(it.a.clock.compareTo(it.b.clock)) }

  @Test
  fun tick() = vectors.tick.checkEach({ it.expected.time }) { it.last.time.tick(it.now) }

  @Test
  fun receive() = vectors.receive.checkEach({ it.expected.time }) { it.last.time.receiving(it.remote.time) }

  @Test
  fun offset() =
    vectors.offset.checkEach({ it.expected }) { clockOffset(it.sentMs, it.receivedMs, it.serverMs) }
}
