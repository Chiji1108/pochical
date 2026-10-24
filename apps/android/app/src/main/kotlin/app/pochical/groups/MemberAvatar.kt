package app.pochical.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import app.pochical.kit.PhotoShelf
import app.pochical.limitText

/**
 * A face (/design's PhotoAvatar): the photo, read from [shelf], else the name's first letter on a
 * circle, the viewer's own ([me]) in the accent, so it stands out among the others' gray.
 */
@Composable
fun MemberAvatar(name: String, photoId: String, shelf: PhotoShelf?, size: Dp, modifier: Modifier = Modifier, me: Boolean = false) {
  if (photoId.isNotEmpty()) {
    PhotoPicture(photoId, shelf, modifier.size(size).clip(CircleShape))
    return
  }
  val colors = MaterialTheme.colorScheme
  Box(
    modifier.size(size).background(if (me) colors.primary else colors.surfaceContainerHighest, CircleShape),
    contentAlignment = Alignment.Center,
  ) {
    Text(
      limitText(name.trim(), 1),
      color = if (me) colors.onPrimary else colors.onSurfaceVariant,
      fontSize = with(LocalDensity.current) { (size * 0.45f).toSp() },
      fontWeight = FontWeight.SemiBold,
    )
  }
}
