package app.pochical.chat

import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import app.pochical.kit.ChatLine
import app.pochical.kit.LineContent
import app.pochical.v1.chatPhoto
import org.junit.Assert.assertEquals
import org.junit.Test

/** Which photos the chat fetches ahead, and at what size. */
class ChatPhotoPrefetchTest {
  private fun photo(id: String, width: Int = 400, height: Int = 300) = chatPhoto {
    this.id = id
    this.width = width
    this.height = height
  }

  private fun line(seq: Long, content: LineContent, author: String = "u2") = ChatItem.Line(ChatLine("group", seq, author, seq, "op$seq", content), startsRun = true)

  @Test
  fun aLineTakenBackOrFoldedHasNoPhotosToFetch() {
    val items =
      listOf(
        line(1, LineContent.Photos(listOf(photo("a")))),
        line(2, LineContent.Unsent),
        line(3, LineContent.Photos(listOf(photo("blocked"))), author = "u3"),
      )
    // The line at 1 taken back meanwhile: what the lines are now is what counts.
    val now = items.toMutableList().also { it[0] = line(1, LineContent.Unsent) }
    val folded = { line: ChatLine -> line.authorId == "u3" }
    assertEquals(setOf("a"), photosAt(items, listOf(0, 1, 2), folded).keys)
    assertEquals(emptySet<String>(), photosAt(now, listOf(0, 1, 2), folded).keys)
  }

  @Test
  fun eachPhotoIsFetchedAtTheSizeItsLineShowsIt() {
    // One alone in its box; three as one over two, the one half the album's width tall.
    assertEquals(mapOf("a" to DpSize(220.dp, 165.dp)), photosAt(listOf(line(1, LineContent.Photos(listOf(photo("a"))))), listOf(0)) { false })
    val album = photosAt(listOf(line(1, LineContent.Photos(listOf(photo("a"), photo("b"), photo("c"))))), listOf(0)) { false }
    assertEquals(DpSize(240.dp, 120.dp), album["a"])
    assertEquals(DpSize(119.dp, 119.dp), album["b"])
  }
}
