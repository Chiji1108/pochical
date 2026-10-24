package app.pochical.groups

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Radius
import app.pochical.kit.openedInviteCode
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/** How long what a code said shows before the camera's picture is clear again, as a toast's. */
private const val PROBLEM_MS = 2_500L

/**
 * QRコードで参加 (/design's ScanPage): the camera reads a group's QR code in the frame (CameraX and
 * ML Kit's barcode scanning), or 写真から読み取る reads one from a picture through the Photo
 * Picker, and an invitation's opens its join screen ([onInvite]). Anything else says what it was
 * for a moment, as a toast does, and the camera keeps looking, as camera apps do.
 */
@Composable
fun ScanScreen(onClose: () -> Unit, onInvite: (String) -> Unit) {
  val context = LocalContext.current
  val resources = LocalResources.current
  val colors = LocalThemeColors.current
  val scope = rememberCoroutineScope()
  val scanner = remember { BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()) }
  DisposableEffect(scanner) { onDispose { scanner.close() } }
  var camera by remember {
    mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
  }
  var asked by remember { mutableStateOf(false) }
  var problem by remember { mutableStateOf<String?>(null) }
  // Problems told so far, so only the last one's goes once its moment has passed.
  var problems by remember { mutableIntStateOf(0) }
  val invite by rememberUpdatedState(onInvite)

  fun show(words: Int) {
    problems += 1
    problem = resources.getString(words)
  }
  LaunchedEffect(problems) {
    delay(PROBLEM_MS)
    problem = null
  }

  /** What a code said: an invitation opens, anything else is told. */
  fun read(message: String) {
    val code = openedInviteCode(message)
    if (code != null) invite(code) else show(R.string.scan_not_invite)
  }

  val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    camera = granted
    asked = true
  }
  LaunchedEffect(Unit) { if (!camera) permission.launch(Manifest.permission.CAMERA) }
  // Allowed in the system's settings meanwhile, the camera starts as the screen comes back.
  LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) camera = true
  }
  val pick =
    rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
      if (uri == null) return@rememberLauncherForActivityResult
      scope.launch {
        val found =
          try {
            scanner.process(InputImage.fromFilePath(context, uri)).await().firstNotNullOfOrNull { it.rawValue }
          } catch (e: CancellationException) {
            throw e
          } catch (_: Exception) {
            null
          }
        if (found == null) show(R.string.scan_none_in_photo) else read(found)
      }
    }

  Box(Modifier.fillMaxSize().background(colors.mediaBackground)) {
    if (camera) {
      QrCamera(scanner, onRead = ::read)
      Box(Modifier.fillMaxSize().background(colors.mediaDim))
    }
    Column(
      Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClose, Modifier.background(colors.mediaFill, CircleShape)) {
          Icon(painterResource(R.drawable.ic_close), stringResource(R.string.close), tint = colors.mediaText)
        }
        Text(stringResource(R.string.scan), Modifier.padding(start = 12.dp), color = colors.mediaText, style = MaterialTheme.typography.titleMedium)
      }
      Spacer(Modifier.weight(1f))
      ScanFrame()
      Text(
        stringResource(if (!camera && asked) R.string.scan_camera_denied else R.string.scan_hint),
        color = colors.mediaText,
        textAlign = TextAlign.Center,
      )
      Spacer(Modifier.weight(1f))
      TextButton(
        onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        Modifier.background(colors.mediaFill, CircleShape),
      ) {
        Icon(painterResource(R.drawable.ic_image), contentDescription = null, tint = colors.mediaText)
        Text(stringResource(R.string.scan_from_photo), Modifier.padding(start = 8.dp), color = colors.mediaText)
      }
    }
    // Over the picture under the bar, as a toast is, so the frame stays where the code is held.
    problem?.let {
      Text(
        it,
        Modifier.safeDrawingPadding()
          .padding(start = 16.dp, end = 16.dp, top = 76.dp)
          .fillMaxWidth()
          .background(colors.mediaFill, RoundedCornerShape(Radius.lg))
          .padding(horizontal = 16.dp, vertical = 12.dp)
          .semantics { liveRegion = LiveRegionMode.Polite },
        color = colors.mediaText,
      )
    }
  }
}

/**
 * The back camera's picture, reporting each QR code ML Kit reads in it, through CameraX's own
 * controller bound to the screen's lifecycle; one code held in view is reported once.
 */
@Composable
private fun QrCamera(scanner: com.google.mlkit.vision.barcode.BarcodeScanner, onRead: (String) -> Unit) {
  val context = LocalContext.current
  val lifecycle = LocalLifecycleOwner.current
  val read by rememberUpdatedState(onRead)
  val controller =
    remember {
      LifecycleCameraController(context).apply {
        setEnabledUseCases(CameraController.IMAGE_ANALYSIS)
        var last: String? = null
        val main = ContextCompat.getMainExecutor(context)
        setImageAnalysisAnalyzer(
          main,
          MlKitAnalyzer(listOf(scanner), CameraController.COORDINATE_SYSTEM_VIEW_REFERENCED, main) { result ->
            val message = result.getValue(scanner)?.firstNotNullOfOrNull { it.rawValue }
            if (message != null && message != last) {
              last = message
              read(message)
            }
          },
        )
      }
    }
  DisposableEffect(controller, lifecycle) {
    controller.bindToLifecycle(lifecycle)
    onDispose { controller.unbind() }
  }
  AndroidView(
    factory = { PreviewView(it).apply { this.controller = controller } },
    modifier = Modifier.fillMaxSize(),
  )
}

/** Four corner marks, where the code goes. */
@Composable
private fun ScanFrame() {
  val colors = LocalThemeColors.current
  Box(Modifier.size(220.dp).background(colors.mediaFillFaint, RoundedCornerShape(Radius.md))) {
    Canvas(Modifier.fillMaxSize()) {
      val arm = 32.dp.toPx()
      val width = 3.dp.toPx()
      // Each corner the top-left's turned a quarter more, about the frame's middle.
      repeat(4) { turns ->
        rotate(90f * turns) {
          drawLine(colors.mediaText, Offset(width / 2, arm), Offset(width / 2, width / 2), width, StrokeCap.Round)
          drawLine(colors.mediaText, Offset(width / 2, width / 2), Offset(arm, width / 2), width, StrokeCap.Round)
        }
      }
    }
  }
}
