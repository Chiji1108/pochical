package app.pochical.groups

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.kit.PhotoShelf
import app.pochical.kit.limitText

/**
 * A face (/design's PhotoAvatar): the photo, read from [shelf], else the name's first letter on a
 * circle, the viewer's own ([me]) in the accent, so it stands out among the others' gray.
 */
@Composable
fun MemberAvatar(name: String, photoId: String, shelf: PhotoShelf?, size: Dp, modifier: Modifier = Modifier, me: Boolean = false) {
  val sample = SAMPLE_FACES[photoId]
  if (sample != null) {
    Image(painterResource(sample), contentDescription = null, modifier.size(size).clip(CircleShape), contentScale = ContentScale.Crop)
    return
  }
  val colors = LocalThemeColors.current
  // The name's letter, under the photo while it loads or when it cannot be read, as iOS's.
  Box(
    modifier.size(size).background(if (me) colors.accentFill else colors.fillSecondary, CircleShape),
    contentAlignment = Alignment.Center,
  ) {
    Text(
      limitText(name.trim(), 1),
      // Under a photo, not read: the photo is the face.
      Modifier.then(if (photoId.isNotEmpty()) Modifier.clearAndSetSemantics {} else Modifier),
      color = if (me) colors.accentOnFill else colors.textSecondary,
      fontSize = with(LocalDensity.current) { (size * 0.45f).toSp() },
      fontWeight = FontWeight.SemiBold,
    )
    if (photoId.isNotEmpty()) PhotoPicture(photoId, shelf, Modifier.matchParentSize().clip(CircleShape), ground = null)
  }
}

/**
 * Starts a sample's face, as iOS's samplePhoto: the rest names one of the app's own pictures, as
 * made-up people have no photos anywhere.
 */
const val SAMPLE_PHOTO = "sample:"

/** /design's sample photos, by the id after [SAMPLE_PHOTO]. */
private val SAMPLE_FACES =
  mapOf(
    "${SAMPLE_PHOTO}1005" to R.drawable.sample_face_1005,
    "${SAMPLE_PHOTO}429" to R.drawable.sample_face_429,
    "${SAMPLE_PHOTO}823" to R.drawable.sample_face_823,
  )
