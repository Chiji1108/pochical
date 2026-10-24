package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

// A message's links, mentions and Pochical's invitation links (spec/vectors/chat-text.json).

@Serializable
private data class ChatTextVectors(
  val textParts: List<Parts>,
  val mentions: List<Mentions>,
  val plainText: List<Plain>,
  val inviteCode: List<InviteCode>,
  val withMentions: List<WithMentions>,
) {
  @Serializable data class Picked(val id: String, val name: String)

  @Serializable
  data class WithMentions(override val name: String, val text: String, val picked: List<Picked>, val expected: String) : VectorCase

  @Serializable data class Part(val text: String, val url: String? = null, val mention: String? = null)

  @Serializable data class Parts(override val name: String, val text: String, val expected: List<Part>) : VectorCase

  @Serializable
  data class Mentions(val text: String, val expected: List<String>) : VectorCase {
    override val name
      get() = text
  }

  @Serializable
  data class Plain(val text: String, val names: Map<String, String>, val expected: String) : VectorCase {
    override val name
      get() = text
  }

  @Serializable
  data class InviteCode(val url: String, val expected: String?) : VectorCase {
    override val name
      get() = url
  }
}

class ChatTextTest {
  private val text = vectors<ChatTextVectors>("chat-text")

  @Test
  fun textParts() =
    text.textParts.checkEach({ case -> case.expected.map { TextPart(it.text, it.url, it.mention) } }) { textParts(it.text) }

  @Test fun mentions() = text.mentions.checkEach({ it.expected }) { mentions(it.text) }

  @Test fun plainText() = text.plainText.checkEach({ it.expected }) { case -> plainText(case.text) { case.names[it].orEmpty() } }

  @Test
  fun withMentions() =
    text.withMentions.checkEach({ it.expected }) { case -> withMentions(case.text, case.picked.map { PickedMember(it.id, it.name) }) }

  @Test fun inviteCode() = text.inviteCode.checkEach({ it.expected }) { inviteCode(it.url) }
}
