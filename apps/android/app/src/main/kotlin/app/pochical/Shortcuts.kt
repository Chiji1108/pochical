package app.pochical

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * The launcher's shortcuts, a long press on the app's icon away (spec/shortcuts.md): 今日のシフト and
 * 次の休み, each opening the app by its own link, which OpenedLinks reads as it reads a widget's.
 * Dynamic rather than declared in the manifest: the system opens a declared one in a new task,
 * clearing the one open with its pages, where a dynamic one comes to the activity open as a
 * widget's link does. Their links name no date, so set once as the app opens they never go stale.
 */
fun publishShortcuts(context: Context) {
  fun shortcut(id: String, label: Int, icon: Int, link: String) =
    ShortcutInfoCompat.Builder(context, id)
      .setShortLabel(context.getString(label))
      .setIcon(IconCompat.createWithResource(context, icon))
      .setIntent(Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java))
      .build()
  ShortcutManagerCompat.setDynamicShortcuts(
    context,
    listOf(
      shortcut("today", R.string.shortcut_today, R.drawable.shortcut_today, "pochical://today"),
      shortcut("next-off", R.string.shortcut_next_off, R.drawable.shortcut_next_off, "pochical://next-off"),
    ),
  )
}
