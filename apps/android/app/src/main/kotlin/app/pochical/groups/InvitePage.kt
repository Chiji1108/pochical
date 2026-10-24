package app.pochical.groups

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Environment
import android.provider.MediaStore
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
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import androidx.core.content.FileProvider
import app.pochical.R
import app.pochical.design.Metrics
import app.pochical.design.Radius
import app.pochical.kit.inviteLink
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.io.File
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
  HoldSocket(groupId)
  val calls = LocalGroupCalls.current
  val values = LocalValues.current
  val group by remember(values) { values.groups() }.collectAsState(emptyList())
  val name = group.firstOrNull { it.id == groupId }?.name.orEmpty()
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
  val qr = remember(link) { link?.let(::qrCode) }

  suspend fun load(remaking: Boolean) {
    failed = false
    copied = false
    try {
      link = inviteLink(if (remaking) calls.remakeInviteCode(groupId) else calls.inviteCode(groupId))
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      failed = link == null
      remakeFailed = remaking
    }
  }
  LaunchedEffect(groupId) { load(remaking = false) }

  fun say(words: Int) {
    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
    scope.launch { snackbar.showSnackbar(resources.getString(words)) }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text(stringResource(R.string.invite)) },
        navigationIcon = {
          IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back)) }
        },
      )
    },
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
          when {
            qr != null -> {
              Image(
                qr.asImageBitmap(),
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
                    scope.launch { shareQr(context, qr, name) }
                  },
                )
                DropdownMenuItem(
                  text = { Text(stringResource(R.string.save_to_photos)) },
                  leadingIcon = { Icon(painterResource(R.drawable.ic_download), contentDescription = null) },
                  onClick = {
                    qrMenu = false
                    scope.launch { say(if (saveQr(context, qr)) R.string.saved_to_photos else R.string.not_saved) }
                  },
                )
              }
            }
            failed -> Text(stringResource(R.string.invite_offline), color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> CircularProgressIndicator()
          }
        }
        Text(
          stringResource(if (failed) R.string.invite_link_failed else R.string.invite_qr_note),
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      link?.let { shown ->
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
        TextButton(onClick = { confirmingRemake = true }) { Text(stringResource(R.string.invite_remake)) }
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
            scope.launch { load(remaking = true) }
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

/** Shares the QR code as a picture, through the app's own files. */
private suspend fun shareQr(context: Context, qr: Bitmap, groupName: String) {
  val file =
    withContext(Dispatchers.IO) {
      File(context.cacheDir, "shared").apply { mkdirs() }.let { File(it, "invite.png") }.also { file ->
        file.outputStream().use { qr.compress(Bitmap.CompressFormat.PNG, 100, it) }
      }
    }
  val uri = FileProvider.getUriForFile(context, "${context.packageName}.photos", file)
  val send =
    Intent(Intent.ACTION_SEND)
      .setType("image/png")
      .putExtra(Intent.EXTRA_STREAM, uri)
      .putExtra(Intent.EXTRA_TITLE, context.getString(R.string.invite_to, groupName))
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
  context.startActivity(Intent.createChooser(send, null))
}

/** Saves the QR code to the phone's pictures (MediaStore, no permission needed); whether it was. */
private suspend fun saveQr(context: Context, qr: Bitmap): Boolean =
  withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val details =
      ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "pochical-invite.png")
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES)
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, details) ?: return@withContext false
    val written = resolver.openOutputStream(uri)?.use { qr.compress(Bitmap.CompressFormat.PNG, 100, it) } ?: false
    if (written) {
      resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
    } else {
      resolver.delete(uri, null, null)
    }
    written
  }

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
