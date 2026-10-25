package app.pochical.chat

import app.pochical.v1.linkPreview
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LinkPagesTest {
  private val page = linkPreview { url = "https://a.example"; title = "A" }

  @Test
  fun aRequestCutShortLeavesNothingAndIsAskedAgain() = runTest {
    val pages = LinkPages()
    val never = CompletableDeferred<Nothing>()
    val asking = launch { pages.ask("https://a.example") { never.await() } }
    testScheduler.runCurrent()
    assertEquals("https://a.example", pages.asking)
    asking.cancel()
    testScheduler.runCurrent()
    assertNull(pages.asking)
    assertFalse(pages.answered("https://a.example"))

    pages.ask("https://a.example") { page }
    assertTrue(pages.answered("https://a.example"))
    assertEquals(page, pages.page("https://a.example"))
  }

  @Test
  fun aFailureIsAnAnswerOfNone() = runTest {
    val pages = LinkPages()
    pages.ask("https://a.example") { error("offline") }
    assertTrue(pages.answered("https://a.example"))
    assertNull(pages.page("https://a.example"))
    assertNull(pages.asking)
  }
}
