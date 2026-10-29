package app.pochical.notifications

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.createBitmap
import androidx.core.graphics.drawable.IconCompat
import app.pochical.MainActivity
import app.pochical.R
import app.pochical.design.Theme
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.PhotoShelf
import app.pochical.kit.limitText
import app.pochical.mark
import app.pochical.photoBitmap
import app.pochical.widgets.groupMarkPicture
import coil3.ImageLoader

/**
 * How a chat shows among Android's conversations (spec/chat.md, Notifications): the faces of who
 * writes and the group's mark as icons, and each chat a long-lived conversation shortcut, which the
 * system lists under Conversations, lets the person mark important or bubble, and ranks.
 */
interface Conversations {
  /** Someone's face: their photo once the device has it in time, else their first letter, as everywhere. */
  suspend fun face(name: String, photoId: String, groupId: String): IconCompat

  /** The app's icon, Pochical's people's face, as the app draws it (AppIcon). */
  fun appFace(): IconCompat

  /** A group's mark, as its screens draw it. */
  suspend fun mark(mark: GroupMarkValue, name: String, groupId: String): IconCompat

  /** Makes the chat [id] a conversation shortcut, titled [title] with [icon], opened by [opening]. */
  fun publish(id: String, title: String, icon: IconCompat, persons: List<Person>, opening: Intent): ShortcutInfoCompat

  /** Takes away every conversation, as the device lets go of the user they were for. */
  fun forgetAll()
}

/**
 * [Conversations] drawn on the device: faces and marks as the screens draw them, photos through the
 * app's one image loader ([loader]), in the テーマ ([theme]) the person picked.
 */
class DrawnConversations(
  private val context: Context,
  private val theme: suspend () -> Theme,
  private val loader: () -> ImageLoader,
) : Conversations {
  private val side = (ICON_DP * context.resources.displayMetrics.density).toInt()

  override suspend fun face(name: String, photoId: String, groupId: String): IconCompat =
    photo(photoId, PhotoShelf.place(groupId))?.let(IconCompat::createWithAdaptiveBitmap) ?: letter(name)

  override fun appFace(): IconCompat = IconCompat.createWithResource(context, R.mipmap.ic_launcher)

  override suspend fun mark(mark: GroupMarkValue, name: String, groupId: String): IconCompat {
    if (mark.photoId.isNotEmpty()) photo(mark.photoId, PhotoShelf.place(groupId))?.let { return IconCompat.createWithAdaptiveBitmap(it) }
    val color = theme().colors(dark = false).mark(mark.color)
    return IconCompat.createWithAdaptiveBitmap(groupMarkPicture(context, mark, name, side, color.color.toArgb(), color.tint.toArgb()))
  }

  override fun publish(id: String, title: String, icon: IconCompat, persons: List<Person>, opening: Intent): ShortcutInfoCompat {
    val shortcut =
      ShortcutInfoCompat.Builder(context, id)
        .setShortLabel(title)
        .setIcon(icon)
        .setIntent(opening)
        .setLongLived(true)
        .setLocusId(LocusIdCompat(id))
        .setPersons(persons.toTypedArray())
        .setIsConversation()
        .build()
    ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
    return shortcut
  }

  override fun forgetAll() {
    val kept = ShortcutManagerCompat.getShortcuts(context, ShortcutManagerCompat.FLAG_MATCH_DYNAMIC or ShortcutManagerCompat.FLAG_MATCH_CACHED)
    ShortcutManagerCompat.removeLongLivedShortcuts(context, kept.map { it.id })
    ShortcutManagerCompat.removeAllDynamicShortcuts(context)
  }

  /**
   * A photo as the app's image loader has it, or fetches it, within the time a push leaves for it
   * ([PHOTO_WAIT_MS]): a notification is not held back for a face.
   */
  private suspend fun photo(photoId: String, shelf: PhotoShelf): Bitmap? = photoBitmap(context, loader(), photoId, shelf, side, PHOTO_WAIT_MS)

  /** Someone's first letter on the quiet ground faces without a photo take (MemberAvatar). */
  private suspend fun letter(name: String): IconCompat {
    val colors = theme().colors(dark = false)
    val picture = createBitmap(side, side)
    val canvas = Canvas(picture)
    canvas.drawColor(colors.fillTertiary.toArgb())
    val paint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colors.textSecondary.toArgb()
        textSize = side * 0.3f
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      }
    canvas.drawText(limitText(name.trim(), 1), side / 2f, side / 2f - (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2, paint)
    return IconCompat.createWithAdaptiveBitmap(picture)
  }

  private companion object {
    /** An adaptive icon's side, of which the middle 72 show. */
    const val ICON_DP = 108

    /** How long a face's photo may take to come, of the time FCM leaves a message to be handled. */
    const val PHOTO_WAIT_MS = 3_000L
  }
}
