package app.pochical.kit

import app.pochical.v1.change
import app.pochical.v1.profile
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@Serializable
private data class GroupsVectors(
  val guessMark: List<GuessMark>,
  val nextGroupColor: List<NextGroupColor>,
  val openedInviteCode: List<Opened>,
) {
  @Serializable data class Mark(val emoji: String = "", val letter: String = "", val color: Int = 0)

  /** A mark as the vectors name it: its kind, and the color of an icon's or letters'. */
  @Serializable data class KindMark(val kind: String, val color: Int = 0)

  @Serializable
  data class NextGroupColor(override val name: String, val marks: List<KindMark>, val expected: Int) : VectorCase

  @Serializable
  data class GuessMark(override val name: String, val text: String, val color: Int, val expected: Mark) : VectorCase

  @Serializable
  data class Opened(val url: String, val expected: String?) : VectorCase {
    override val name
      get() = url
  }
}

@Serializable
private data class ChatTextVectors(val inviteCode: List<GroupsVectors.Opened>)

class GroupsVectorsTest {
  private val groups = vectors<GroupsVectors>("groups")

  @Test
  fun guessMark() =
    groups.guessMark.checkEach({ GroupMarkValue(emoji = it.expected.emoji, letter = it.expected.letter, color = it.expected.color) }) {
      guessGroupMark(it.text, it.color)
    }

  @Test
  fun nextGroupColor() =
    groups.nextGroupColor.checkEach({ it.expected }) { case ->
      val marks =
        case.marks.map { mark ->
          when (mark.kind) {
            "emoji" -> GroupMarkValue(emoji = "🏠")
            "photo" -> GroupMarkValue(photoId = "photo")
            "icon" -> GroupMarkValue(icon = "moon", color = mark.color)
            else -> GroupMarkValue(letter = "A", color = mark.color)
          }
        }
      nextGroupColor(marks, MARK_SLOTS)
    }

  @Test fun openedInviteCode() = groups.openedInviteCode.checkEach({ it.expected }) { openedInviteCode(it.url) }

  @Test
  fun inviteCode() = vectors<ChatTextVectors>("chat-text").inviteCode.checkEach({ it.expected }) { inviteCode(it.url) }

  @Test
  fun anInviteLinkOpensItsOwnCode() {
    assertEquals("Toko2345", openedInviteCode(inviteLink("Toko2345")))
  }
}

class MarkIconSearchTest {
  private fun found(query: String) = markIconSections(query).flatMap { it.icons }

  @Test
  fun katakanaHiraganaAndWidthFindTheSame() {
    assertEquals(listOf("handHeart"), found("ケア"))
    assertEquals(found("ケア"), found("けあ"))
    assertEquals(found("ケア"), found("ｹｱ"))
  }

  @Test
  fun everyWordTypedMustBeThere() {
    assertEquals(listOf("moon"), found("夜勤 夜"))
    assertEquals(emptyList<String>(), found("夜勤 ケア"))
  }

  @Test
  fun nothingTypedShowsEveryKind() {
    assertEquals(app.pochical.design.MarkIconNames.sections, markIconSections("  "))
  }
}

class NewGroupRequestTest {
  private val mark = GroupMarkValue(emoji = "🏠")
  private var ids = 0
  private val newId = { "request-${++ids}" }

  @Test
  fun aRetryOfTheSameAskKeepsItsId() {
    val first = NewGroupRequest.asking("家族", mark, "さくら", last = null, newId = newId)
    assertSame(first, NewGroupRequest.asking("家族", mark, "さくら", last = first, newId = newId))
  }

  @Test
  fun anyChangeIsANewRequest() {
    val first = NewGroupRequest.asking("家族", mark, "さくら", last = null, newId = newId)
    val renamed = NewGroupRequest.asking("家族2", mark, "さくら", last = first, newId = newId)
    val remarked = NewGroupRequest.asking("家族", GroupMarkValue(icon = "house"), "さくら", last = first, newId = newId)
    val named = NewGroupRequest.asking("家族", mark, "ゆき", last = first, newId = newId)
    assertEquals(setOf(first.id, renamed.id, remarked.id, named.id).size, 4)
    assertNotEquals(first.id, renamed.id)
  }
}

@RunWith(RobolectricTestRunner::class)
class ProfileTest {
  private val database = testDatabase()

  @After fun close() = database.close()

  @Test
  fun theUsualNameAndPhotoComeFromTheUsersSocketAndGoWithAReset() = runTest {
    assertNull(database.values().profile().first())
    database.write {
      take(listOf(change { profile = profile { name = "さくら"; photoId = "p1" } }))
    }
    assertEquals(ProfileRow(name = "さくら", photoId = "p1"), database.values().profile().first())

    database.write { reset() }
    assertNull(database.values().profile().first())
  }

  @Test
  fun erasingTheUserTakesTheirProfile() = runTest {
    database.write {
      take(listOf(change { profile = profile { name = "さくら" } }))
      eraseUserData()
    }
    assertNull(database.values().profile().first())
  }
}
