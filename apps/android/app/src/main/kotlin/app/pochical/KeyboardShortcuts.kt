package app.pochical

import android.content.Context
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.KeyboardShortcutInfo

/**
 * The app's own keys, which the system's Keyboard Shortcuts Helper lists under the app's name
 * (Activity.onProvideKeyboardShortcuts): the chat composer's Enter and Shift+Enter (spec/chat.md, A
 * keyboard and a mouse). What every field does (copy, paste, undo) the system lists itself.
 */
fun keyboardShortcuts(context: Context): KeyboardShortcutGroup =
  KeyboardShortcutGroup(
    context.getString(R.string.chat_heading),
    listOf(
      KeyboardShortcutInfo(context.getString(R.string.chat_send), KeyEvent.KEYCODE_ENTER, 0),
      KeyboardShortcutInfo(context.getString(R.string.chat_new_line), KeyEvent.KEYCODE_ENTER, KeyEvent.META_SHIFT_ON),
    ),
  )
