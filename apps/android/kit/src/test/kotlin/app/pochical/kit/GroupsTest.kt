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
  fun anInviteLinkOpensItsOwnCode() {
    assertEquals("Toko2345", openedInviteCode(inviteLink("Toko2345")))
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

class NewGroupDraftTest {
  private val zone = java.time.ZoneId.of("Asia/Tokyo")

  /** What 作る sent: the draft with its request, as the call under way holds it and the page opened again takes it back. */
  private fun NewGroupDraft.asSent() = copy(sent = request(freeColor = 2, displayName = "さくら", zone = zone))

  /**
   * A mark picked by hand is the person's: taken back from the call under way with the rest of the
   * draft, it stays as the name is then changed, as it did before 作る.
   */
  @Test
  fun aPickedMarkTakenBackFromTheCallStaysAsTheNameChanges() {
    val picked = GroupMarkValue(icon = "house", color = 4)
    val begun = NewGroupDraft("忘年会", pickedMark = picked).asSent()
    assertEquals(picked, begun.sent?.mark)

    val renamed = begun.copy(name = "新年会")
    assertEquals(picked, renamed.mark(freeColor = 2))
    assertEquals(picked, renamed.request(freeColor = 2, displayName = "さくら", zone = zone).mark)
  }

  /** A mark the name gave follows the name still, once sent and taken back: as sent while the name is, a new guess once it changes. */
  @Test
  fun aGuessedMarkTakenBackFromTheCallFollowsTheName() {
    val begun = NewGroupDraft("テスト").asSent()
    assertEquals(GroupMarkValue(letter = "テ", color = 2), begun.sent?.mark)
    assertEquals("As sent, though the free color moved on", begun.sent?.mark, begun.mark(freeColor = 3))

    assertEquals(GroupMarkValue(letter = "会", color = 3), begun.copy(name = "会議").mark(freeColor = 3))
  }

  /** Unchanged, the draft taken back asks again under the same request; changed, under a new one. */
  @Test
  fun aDraftTakenBackAsksAgainForTheSameRequestUntilItChanges() {
    val begun = NewGroupDraft("忘年会", end = java.time.LocalDate.of(2026, 12, 31)).asSent()
    assertSame(begun.sent, begun.request(freeColor = 5, displayName = "さくら", zone = zone))
    assertNotEquals(begun.sent?.id, begun.copy(end = null).request(freeColor = 5, displayName = "さくら", zone = zone).id)
  }
}
