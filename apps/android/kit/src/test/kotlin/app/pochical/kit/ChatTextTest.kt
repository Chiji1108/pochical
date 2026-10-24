package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test

// A message's links and mentions (spec/vectors/chat-text.json); inviteCode is checked with the
// groups' links (GroupsVectorsTest).

@Serializable
private data class MessageTextVectors(
  val textParts: List<Parts>,
  val mentions: List<Mentions>,
  val plainText: List<Plain>,
  val site: List<Site>,
) {
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
  data class Site(val url: String, val expected: String) : VectorCase {
    override val name
      get() = url
  }
}

class ChatTextTest {
  private val text = vectors<MessageTextVectors>("chat-text")

  @Test
  fun textParts() =
    text.textParts.checkEach({ case -> case.expected.map { TextPart(it.text, it.url, it.mention) } }) { textParts(it.text) }

  @Test fun mentions() = text.mentions.checkEach({ it.expected }) { mentions(it.text) }

  @Test fun plainText() = text.plainText.checkEach({ it.expected }) { case -> plainText(case.text) { case.names[it].orEmpty() } }

  @Test fun site() = text.site.checkEach({ it.expected }) { site(it.url) }
}
