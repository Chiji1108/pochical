package app.pochical.chat

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.content.contentReceiver
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import app.pochical.kit.Writing
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * The chat's intake stands over the whole chat, the composer's field inside it: an image pasted in
 * the field comes to it as one dropped on the chat would (spec/chat.md, Photos).
 */
@OptIn(ExperimentalFoundationApi::class)
@RunWith(RobolectricTestRunner::class)
class ChatIntakeTest {
  @get:Rule val compose = createComposeRule()

  private val image = Uri.parse("content://app.pochical.test/photo.jpg")
  private val taken = mutableListOf<Uri>()
  private val stickers = mutableListOf<Uri>()

  /** Pastes an image in the field of a chat whose intake stands over it, its composer holding [writing]. */
  private fun pasteAnImage(writing: Writing<PickedPhoto> = Writing()) {
    val state = ComposerState(writing, tookDraft = true)
    val intake = ChatIntake(state, mutableStateOf({ uris: List<Uri> -> taken += uris }), mutableStateOf({ uri: Uri -> stickers += uri }))
    val clipboard = RuntimeEnvironment.getApplication().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData(ClipDescription("photo", arrayOf("image/jpeg")), ClipData.Item(image)))
    compose.setContent {
      Box(Modifier.contentReceiver(intake)) { BasicTextField(state.words, Modifier.testTag("field")) }
    }
    compose.onNodeWithTag("field").performClick()
    compose.onNodeWithTag("field").performSemanticsAction(SemanticsActions.PasteText)
    compose.waitForIdle()
  }

  @Test
  fun anImagePastedInTheFieldJoinsThePhotosWaiting() {
    pasteAnImage()
    assertEquals(listOf(image), taken)
    assertEquals(emptyList<Uri>(), stickers)
  }

  @Test
  fun anImagePastesNothingWhileALineIsChanged() {
    pasteAnImage(Writing(text = "words", editing = 5L))
    assertEquals(emptyList<Uri>(), taken)
  }
}
