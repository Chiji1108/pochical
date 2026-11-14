package app.pochical.chat

import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.ui.input.key.KeyEvent
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ComposerKeysTest {
  private fun key(code: Int, meta: Int = 0, flags: Int = 0) =
    KeyEvent(AndroidKeyEvent(0, 0, AndroidKeyEvent.ACTION_DOWN, code, 0, meta, 1, 0, flags))

  @Test
  fun aKeyboardsEnterSends() {
    assertTrue(key(AndroidKeyEvent.KEYCODE_ENTER).sends())
    assertTrue(key(AndroidKeyEvent.KEYCODE_NUMPAD_ENTER).sends())
  }

  @Test
  fun shiftEnterStartsALine() {
    assertFalse(key(AndroidKeyEvent.KEYCODE_ENTER, meta = AndroidKeyEvent.META_SHIFT_ON or AndroidKeyEvent.META_SHIFT_LEFT_ON).sends())
  }

  @Test
  fun theScreenKeyboardsReturnStartsALine() {
    assertFalse(key(AndroidKeyEvent.KEYCODE_ENTER, flags = AndroidKeyEvent.FLAG_SOFT_KEYBOARD).sends())
  }

  @Test
  fun otherKeysType() {
    assertFalse(key(AndroidKeyEvent.KEYCODE_A).sends())
  }
}
