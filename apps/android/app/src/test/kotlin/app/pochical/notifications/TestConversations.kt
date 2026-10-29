package app.pochical.notifications

import android.content.Context
import android.content.Intent
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.graphics.createBitmap
import androidx.core.graphics.drawable.IconCompat
import app.pochical.kit.GroupMarkValue

/** [Conversations] that draw a dot for every face and mark, and note what they publish. */
class TestConversations(private val context: Context) : Conversations {
  /** Each conversation published, as its id and title. */
  val published = mutableListOf<Pair<String, String>>()
  var forgotten = false

  override suspend fun face(name: String, photoId: String, groupId: String): IconCompat = IconCompat.createWithBitmap(createBitmap(1, 1))

  override fun appFace(): IconCompat = IconCompat.createWithBitmap(createBitmap(1, 1))

  override suspend fun mark(mark: GroupMarkValue, name: String, groupId: String): IconCompat = IconCompat.createWithBitmap(createBitmap(1, 1))

  override fun publish(id: String, title: String, icon: IconCompat, persons: List<Person>, opening: Intent): ShortcutInfoCompat {
    published += id to title
    return ShortcutInfoCompat.Builder(context, id).setShortLabel(title).setIcon(icon).setIntent(opening).setLongLived(true).build()
  }

  override fun forgetAll() {
    forgotten = true
  }

  override fun forget(gone: (id: String) -> Boolean) {
    published.removeAll { (id, _) -> gone(id) }
  }
}
