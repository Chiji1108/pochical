package app.pochical.kit

import app.pochical.v1.DayField
import kotlinx.serialization.Serializable
import org.junit.Test

// heldBackBy is the server's to check: only it keeps clears.
@Serializable
private data class OrderClearsVectors(val givesWay: List<GivesWay>) {
  @Serializable data class Floor(val from: String, val clock: VectorClock)

  @Serializable
  data class GivesWay(
    override val name: String,
    val floor: Floor,
    val date: String,
    val field: String,
    val set: VectorClock,
    val expected: Boolean,
  ) : VectorCase
}

class OrderClearsTest {
  @Test
  fun givesWay() =
    vectors<OrderClearsVectors>("order-clears").givesWay.checkEach({ it.expected }) {
      givesWay(
        it.date,
        DayField.valueOf("DAY_FIELD_${it.field}"),
        it.set.clock,
        OrderFloor(it.floor.from, it.floor.clock.clock),
      )
    }
}
