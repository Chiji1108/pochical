package app.pochical.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.IconLayers
import app.pochical.LocalThemeColors
import app.pochical.chat.Picture
import app.pochical.design.Radius
import app.pochical.kit.GroupCalls
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.NewGroupRequest
import app.pochical.kit.PhotoShelf
import app.pochical.kit.Values
import app.pochical.mark
import app.pochical.markLayers
import app.pochical.markShape
import coil3.compose.AsyncImage

/** GroupService, the profile and the photos, as the user the device is signed in as. */
val LocalGroupCalls = staticCompositionLocalOf<GroupCalls> { error("No group calls provided") }

/** What the screens read of the database, as it changes. */
val LocalValues = staticCompositionLocalOf<Values> { error("No values provided") }

private fun GroupMarkValue.saved() = listOf(emoji, icon, letter, color, photoId)

private fun markOf(saved: List<Any?>) =
  GroupMarkValue(saved[0] as String, saved[1] as String, saved[2] as String, saved[3] as Int, saved[4] as String)

/** A mark kept across the activity made anew and the process's death. */
val MarkSaver: Saver<GroupMarkValue?, Any> =
  Saver(save = { it?.saved() ?: emptyList<Any>() }, restore = { saved -> (saved as List<*>).takeIf { it.isNotEmpty() }?.let(::markOf) })

/** A request to make a group kept so, so a retry after the activity is made anew sends the same id. */
val RequestSaver: Saver<NewGroupRequest?, Any> =
  Saver(
    save = { request -> request?.let { listOf(it.name, it.displayName, it.id) + it.mark.saved() } ?: emptyList<Any>() },
    restore = { saved ->
      (saved as List<*>).takeIf { it.isNotEmpty() }?.let { NewGroupRequest(it[0] as String, markOf(it.drop(3)), it[1] as String, it[2] as String) }
    },
  )

/** How much of the square an icon's glyph and an emoji take; letters take most of that across. */
private const val INNER = 0.62f

/**
 * A group's mark filling [size] (/design's GroupIcon): a photo filling its rounded square, read from
 * [shelf] unless the device holds it; an emoji as it is; an icon or letters in its color on that
 * color's tint. [bare] draws an icon's glyph alone, [size] across, as the choices of one show it.
 */
@Composable
fun GroupMarkView(mark: GroupMarkValue, size: Dp, modifier: Modifier = Modifier, shelf: PhotoShelf? = null, bare: Boolean = false) {
  val color = LocalThemeColors.current.mark(mark.color)
  val shape = markShape(size)
  val glyph = if (bare) size else size * INNER
  val fontSize = with(LocalDensity.current) { (size * INNER).toSp() }
  when {
    mark.photoId.isNotEmpty() -> PhotoPicture(mark.photoId, shelf, modifier.size(size).clip(shape))
    mark.icon.isNotEmpty() && markLayers(mark.icon, filled = true) != null ->
      Box(
        modifier.size(size).then(if (bare) Modifier else Modifier.background(color.tint, shape)),
        contentAlignment = Alignment.Center,
      ) {
        IconLayers(markLayers(mark.icon, filled = true).orEmpty(), color, glyph, Modifier)
      }
    mark.letter.isNotEmpty() ->
      Box(modifier.size(size).background(color.tint, shape), contentAlignment = Alignment.Center) {
        Text(
          mark.letter,
          color = color.color,
          fontSize = fontSize * 0.6f,
          fontWeight = FontWeight.Bold,
          maxLines = 1,
          overflow = TextOverflow.Clip,
        )
      }
    else -> Box(modifier.size(size), contentAlignment = Alignment.Center) { Text(mark.emoji, fontSize = fontSize * 0.85f) }
  }
}

/**
 * A group's mark on its small rounded square, as rows show it: on the card's ground in a list's card,
 * on [ground] elsewhere, as the hub's heading puts it on the quaternary fill.
 */
@Composable
fun GroupMarkBadge(
  mark: GroupMarkValue,
  modifier: Modifier = Modifier,
  size: Dp = 28.dp,
  shelf: PhotoShelf? = null,
  ground: Color = LocalThemeColors.current.backgroundCard,
) {
  val shape = RoundedCornerShape(Radius.sm)
  GroupMarkView(mark, size, modifier.clip(shape).background(ground, shape), shelf)
}

/**
 * A photo the screens show, a face or a mark, filling [modifier]'s bounds: from the device or else
 * [shelf] (none: the device's alone); [ground] while it loads or when it cannot be read.
 */
@Composable
fun PhotoPicture(photoId: String, shelf: PhotoShelf?, modifier: Modifier = Modifier, ground: Color? = MaterialTheme.colorScheme.surfaceContainerHighest) {
  // Through the app's one image loader, read at the size it shows and kept drawn in memory, so a
  // face drawn again (a line scrolled back) shows at once (spec/chat.md, Photos). With no [ground],
  // what is under it shows until it comes.
  val painter = ground?.let(::ColorPainter)
  AsyncImage(Picture(photoId, shelf), contentDescription = null, modifier, placeholder = painter, error = painter, contentScale = ContentScale.Crop)
}
