package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class ProfileVectors(val asking: List<Asking>) {
  @Serializable data class Expected(val asUsual: Boolean, val drawing: Boolean)

  @Serializable
  data class Asking(
    override val name: String,
    val caughtUp: Boolean,
    val usualName: String,
    val usualPhoto: String,
    val expected: Expected?,
  ) : VectorCase
}

class ProfileAskingTest {
  private val profile = vectors<ProfileVectors>("profile")

  @Test
  fun asking() =
    profile.asking.checkEach({ it.expected?.let { expected -> ProfileAsking(expected.asUsual, expected.drawing) } }) {
      profileAsking(if (it.caughtUp) SocketState.Current else SocketState.CatchingUp(tries = 1), ProfileRow(name = it.usualName, photoId = it.usualPhoto))
    }
}
