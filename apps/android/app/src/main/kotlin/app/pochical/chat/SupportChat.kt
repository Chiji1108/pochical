package app.pochical.chat

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.RootPage
import app.pochical.SettingsSection
import app.pochical.design.Chat
import app.pochical.groups.HoldSocket
import app.pochical.groups.LocalValues
import app.pochical.groups.MemberAvatar
import app.pochical.groups.rememberMeId
import app.pochical.kit.GROUP_THREAD
import app.pochical.kit.PhotoShelf

// The chat with the people who make Pochical (spec/chat.md, The chat with Pochical's people; /design's
// SupportRow and SupportChatPage): a chat of its own place, opened from 設定 as a chat's row, and the
// chat's own screen with its head.

/**
 * 設定's way into the chat with Pochical's people (/design's SupportRow): a chat's row as the hub's
 * list draws one, with the app's icon, the latest line or the draft left in it, and the answers not
 * read yet. The chat's socket is open while 設定 shows, as a group's while its page does, so its
 * latest line is current.
 */
@Composable
fun SupportRow(open: (RootPage) -> Unit) {
  val me = rememberMeId() ?: return
  HoldSocket(Chat.supportPlace)
  // The place's members as it names them: the user, and ポチカル for Pochical's people.
  val values = LocalValues.current
  val members by remember(values) { values.members(Chat.supportPlace) }.collectAsStateWithLifecycle(emptyList())
  // A section of its own, apart from the rows of settings above it.
  SettingsSection(modifier = Modifier.padding(top = 20.dp)) {
    row {
    ChatRow(
      Chat.supportPlace,
      GROUP_THREAD,
      me,
      stringResource(R.string.support_title),
      names = members.associate { it.userId to it.shownName() },
      blocked = emptySet(),
      empty = stringResource(R.string.support_empty),
      onOpen = { open(RootPage.Chat(Chat.supportPlace, GROUP_THREAD)) },
      onCard = true,
      modifier = Modifier.clip(MaterialTheme.shapes.large),
    ) {
      AppIcon(28.dp)
    }
    }
  }
}

/**
 * Who the chat with Pochical's people reaches, and everything that does (/design's Intro): over its
 * first line once the lines reach it, and alone while there is none.
 */
@Composable
fun SupportHead(modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  // What each line takes with it, as the chats send it.
  val device = LocalChats.current.device
  Box(modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
    Column(Modifier.widthIn(max = 300.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
      AppIcon(56.dp)
      Text(
        stringResource(R.string.support_head_title),
        Modifier.semantics { heading() },
        style = MaterialTheme.typography.titleMedium,
        color = colors.textPrimary,
        textAlign = TextAlign.Center,
      )
      Text(stringResource(R.string.support_head_body), style = MaterialTheme.typography.bodyMedium, color = colors.textSecondary, textAlign = TextAlign.Center)
      Text(
        stringResource(R.string.support_head_note, device),
        style = MaterialTheme.typography.bodySmall,
        color = colors.textTertiary,
        textAlign = TextAlign.Center,
      )
    }
  }
}

/**
 * Someone's face in a chat ([userId] and their [name] and photo as the place shows them): the app's
 * icon for Pochical's people, who answer under it, else their face as a group's member.
 */
@Composable
fun Face(userId: String, name: String, photoId: String, shelf: PhotoShelf?, size: Dp, modifier: Modifier = Modifier) {
  if (userId == Chat.pochicalMember) AppIcon(size, modifier) else MemberAvatar(name, photoId, shelf, size, modifier)
}

/**
 * The app's icon, as Pochical's people's face and the chat's mark: the launcher icon's own layers,
 * its foreground over its background, cut round as a face is.
 */
@Composable
fun AppIcon(size: Dp, modifier: Modifier = Modifier) {
  Box(
    modifier.size(size).clip(CircleShape).background(colorResource(R.color.ic_launcher_background)).clearAndSetSemantics {},
    contentAlignment = Alignment.Center,
  ) {
    // An adaptive icon's foreground is drawn on 108dp, its 72dp middle the part a launcher shows.
    Image(painterResource(R.mipmap.ic_launcher_foreground), contentDescription = null, Modifier.requiredSize(size * ADAPTIVE_SCALE))
  }
}

/** How much larger an adaptive icon's whole foreground is than the part a launcher shows of it. */
private const val ADAPTIVE_SCALE = 108f / 72f
