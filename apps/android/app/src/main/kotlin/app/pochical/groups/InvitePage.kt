package app.pochical.groups

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.R
import app.pochical.savePicture
import app.pochical.sharePicture
import app.pochical.design.Metrics
import app.pochical.design.Radius
import app.pochical.kit.inviteLink
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * メンバーを招待 (/design's InvitePage): the group's link as a QR code to be read off the screen,
 * shared or saved with a long press; the link to send through Android's share sheet or to copy;
 * and a way to remake it, which stops the old link and QR code at once.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun InvitePage(groupId: String, onBack: () -> Unit) {
  // A group just made opens here before it has reached the device: its code is read all the same.
  val name = pageGroup(groupId, onBack)?.name.orEmpty()
  val calls = LocalGroupCalls.current
  val context = LocalContext.current
  val resources = LocalResources.current
  val clipboard = LocalClipboard.current
  val haptics = LocalHapticFeedback.current
  val scope = rememberCoroutineScope()
  val snackbar = remember { SnackbarHostState() }
  var link by remember { mutableStateOf<String?>(null) }
  var failed by remember { mutableStateOf(false) }
  var copied by remember { mutableStateOf(false) }
  var confirmingRemake by remember { mutableStateOf(false) }
  var remakeFailed by remember { mutableStateOf(false) }
  var qrMenu by remember { mutableStateOf(false) }
  // Remaking, the link shown is stopping: it is not offered until the new one comes.
  var remaking by remember { mutableStateOf(false) }
  val qr by produceState<Bitmap?>(null, link) { value = link?.let { withContext(Dispatchers.Default) { qrCode(it) } } }

  suspend fun load(remake: Boolean) {
    failed = false
    copied = false
    remaking = remake
    try {
      link = inviteLink(if (remake) calls.remakeInviteCode(groupId) else calls.inviteCode(groupId))
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      failed = link == null
      remakeFailed = remake
    }
    remaking = false
  }
  LaunchedEffect(groupId) { load(remake = false) }

  fun say(words: Int) {
    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
    scope.launch { snackbar.showSnackbar(resources.getString(words)) }
  }

  Scaffold(
    topBar = { PageBar(stringResource(R.string.invite), onBack) },
    snackbarHost = { SnackbarHost(snackbar) },
  ) { padding ->
    Column(
      Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      val card = RoundedCornerShape(Radius.xxl)
      Column(
        Modifier.fillMaxWidth()
          .background(MaterialTheme.colorScheme.surfaceContainerHigh, card)
          .border(1.dp, MaterialTheme.colorScheme.outlineVariant, card)
          .padding(top = 24.dp, bottom = 20.dp, start = 16.dp, end = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Box(Modifier.size(200.dp), contentAlignment = Alignment.Center) {
          val shownQr = qr.takeUnless { remaking }
          when {
            shownQr != null -> {
              Image(
                shownQr.asImageBitmap(),
                contentDescription = null,
                Modifier.size(200.dp)
                  .semantics { contentDescription = resources.getString(R.string.invite_qr) }
                  .combinedClickable(onClick = {}, onLongClick = { qrMenu = true }),
                filterQuality = FilterQuality.None,
              )
              DropdownMenu(expanded = qrMenu, onDismissRequest = { qrMenu = false }) {
                DropdownMenuItem(
                  text = { Text(stringResource(R.string.share)) },
                  leadingIcon = { Icon(painterResource(R.drawable.ic_share), contentDescription = null) },
                  onClick = {
                    qrMenu = false
                    scope.launch { if (!shareQr(context, shownQr, name)) say(R.string.not_shared) }
                  },
                )
                DropdownMenuItem(
                  text = { Text(stringResource(R.string.save_to_photos)) },
                  leadingIcon = { Icon(painterResource(R.drawable.ic_download), contentDescription = null) },
                  onClick = {
                    qrMenu = false
                    scope.launch { say(if (saveQr(context, shownQr)) R.string.saved_to_photos else R.string.not_saved) }
                  },
                )
              }
            }
            failed ->
              TextButton(onClick = { scope.launch { load(remake = false) } }) {
                Icon(painterResource(R.drawable.ic_refresh), contentDescription = null)
                Text(stringResource(R.string.check_again), Modifier.padding(start = 8.dp))
              }
            else -> CircularProgressIndicator()
          }
        }
        Text(
          stringResource(if (failed) R.string.invite_link_failed else R.string.invite_qr_note),
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      link?.takeUnless { remaking }?.let { shown ->
        Button(onClick = { sendLink(context, shown) }, Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
          Icon(painterResource(R.drawable.ic_share), contentDescription = null)
          Text(stringResource(R.string.invite_send), Modifier.padding(start = 8.dp))
        }
        OutlinedButton(
          onClick = {
            scope.launch {
              clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(name, shown)))
              copied = true
              haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            }
          },
          Modifier.fillMaxWidth().heightIn(min = Metrics.control),
        ) {
          Icon(painterResource(if (copied) R.drawable.ic_check else R.drawable.ic_content_copy), contentDescription = null)
          Text(stringResource(if (copied) R.string.copied else R.string.invite_copy), Modifier.padding(start = 8.dp))
        }
      }
      Text(
        stringResource(R.string.invite_anyone, name),
        Modifier.padding(horizontal = 4.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      if (link != null) {
        TextButton(onClick = { confirmingRemake = true }, enabled = !remaking) { Text(stringResource(R.string.invite_remake)) }
      }
    }
  }
  if (confirmingRemake) {
    AlertDialog(
      onDismissRequest = { confirmingRemake = false },
      title = { Text(stringResource(R.string.invite_remake_title)) },
      text = { Text(stringResource(R.string.invite_remake_body)) },
      confirmButton = {
        TextButton(
          onClick = {
            confirmingRemake = false
            scope.launch { load(remake = true) }
          }
        ) {
          Text(stringResource(R.string.invite_remake_confirm), color = MaterialTheme.colorScheme.error)
        }
      },
      dismissButton = { TextButton(onClick = { confirmingRemake = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
  if (remakeFailed) {
    AlertDialog(
      onDismissRequest = { remakeFailed = false },
      title = { Text(stringResource(R.string.invite_remake_failed)) },
      text = { Text(stringResource(R.string.invite_remake_failed_body)) },
      confirmButton = { TextButton(onClick = { remakeFailed = false }) { Text(stringResource(R.string.ok)) } },
    )
  }
}

/** Sends the link through Android's share sheet. */
private fun sendLink(context: Context, link: String) {
  val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link)
  context.startActivity(Intent.createChooser(send, null))
}

/** Shares the QR code as a picture through Android's share sheet; whether the sheet opened. */
private suspend fun shareQr(context: Context, qr: Bitmap, groupName: String): Boolean =
  sharePicture(context, qr, "invite", context.getString(R.string.invite_to, groupName))

/** Saves the QR code to the phone's pictures; whether it was. */
private suspend fun saveQr(context: Context, qr: Bitmap): Boolean = savePicture(context, qr, "pochical-invite.png")

/**
 * The link as a QR code, black on white with the white margin of four modules readers expect,
 * [MODULE] pixels a module, large enough to share and save sharp; shown scaled unsmoothed.
 */
fun qrCode(link: String): Bitmap {
  val hints = mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 4)
  val matrix = QRCodeWriter().encode(link, BarcodeFormat.QR_CODE, 0, 0, hints)
  val side = matrix.width * MODULE
  val pixels = IntArray(side * side) { at -> if (matrix[at % side / MODULE, at / side / MODULE]) Color.BLACK else Color.WHITE }
  return Bitmap.createBitmap(pixels, side, side, Bitmap.Config.ARGB_8888)
}

private const val MODULE = 16
