package app.pochical.chat

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.content.MediaType
import androidx.compose.foundation.content.ReceiveContentListener
import androidx.compose.foundation.content.TransferableContent
import androidx.compose.foundation.content.contentReceiver
import androidx.compose.foundation.content.hasMediaType
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.ui.Modifier
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

  @Test
  fun anImagePastedInTheFieldComesToTheIntakeOverTheChat() {
    val taken = mutableListOf<Uri>()
    val intake =
      object : ReceiveContentListener {
        override fun onReceive(transferableContent: TransferableContent): TransferableContent? {
          if (!transferableContent.hasMediaType(MediaType.Image)) return transferableContent
          val clip = transferableContent.clipEntry.clipData
          taken += (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
          return null
        }
      }
    val image = Uri.parse("content://app.pochical.test/photo.jpg")
    val context = RuntimeEnvironment.getApplication()
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData(ClipDescription("photo", arrayOf("image/jpeg")), ClipData.Item(image)))
    compose.setContent {
      Box(Modifier.contentReceiver(intake)) { BasicTextField(rememberTextFieldState(), Modifier.testTag("field")) }
    }
    compose.onNodeWithTag("field").performClick()
    compose.onNodeWithTag("field").performSemanticsAction(SemanticsActions.PasteText)
    compose.waitForIdle()
    assertEquals(listOf(image), taken)
  }
}
