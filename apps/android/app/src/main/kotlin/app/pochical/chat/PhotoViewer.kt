package app.pochical.chat

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.pochical.kit.PhotoShelf
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.LocalAccount
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.groups.HoldSocket
import app.pochical.groups.LocalGroupCalls
import app.pochical.kit.ChatPhotoItem
import app.pochical.kit.PhotoKey
import app.pochical.kit.PhotoRun
import app.pochical.kit.SocketState
import app.pochical.sharePhoto
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.request.CachePolicy
import coil3.request.ImageRequest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import me.saket.telephoto.ExperimentalTelephotoApi
import me.saket.telephoto.flick.FlickToDismiss
import me.saket.telephoto.flick.FlickToDismissState
import me.saket.telephoto.flick.rememberFlickToDismissState
import me.saket.telephoto.zoomable.DoubleClickToZoomListener
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.coil3.ZoomableAsyncImage
import me.saket.telephoto.zoomable.rememberZoomableImageState
import me.saket.telephoto.zoomable.rememberZoomableState

// A photo opened large (spec/chat.md, Photos), as iOS's PhotoViewer.swift shows one: whole on black,
// swiped through the chat's photos one by one as `PhotoRun` holds them, zoomed with a pinch or two
// taps, pulled down to close. Zooming and pulling are Telephoto's (Apache-2.0).

/**
 * The chat's photos open large or listed, as [run] follows them; [version] tells the screen each
 * change of what it shows, and [changes] each change of the run, which may change what it asks of
 * the group (the first photos followed, the socket opened again) though it shows the same.
 * [follows] false for photos of the member's own line still on its way, which open alone, the
 * group holding none of them yet.
 */
@Stable
class OpenPhotos(val run: PhotoRun, val follows: Boolean = true) {
  var version by mutableIntStateOf(0)
    private set

  var changes by mutableIntStateOf(0)
    private set

  /** Changes the run, the screen following only when what it shows changed. */
  fun change(step: PhotoRun.() -> Unit) {
    val before = shows()
    run.step()
    changes++
    if (shows() != before) version++
  }

  /** The socket opened again: the pages not yet answered are asked again. */
  fun reconnected() {
    run.reconnected()
    changes++
  }

  private fun shows() = listOf(run.photos, run.shown, run.total, run.place)
}

/** The key a photo is laid out under, unique among the chat's and kept in a Bundle. */
internal val ChatPhotoItem.layoutKey: String
  get() = "${key.seq}/${key.index}"

/**
 * The photos of [threadId] open large over the chat or its list: × and the photo's place among all
 * the chat's (2 / 5, once the group has said, while there are more than one) at the top, 共有 and
 * 保存 at the foot, a single tap hiding or showing them. Swiping goes to the photos before and
 * after, pages of them asked of the group as an end nears; a double tap zooms to twice its size
 * about the point tapped and a pinch up to four times; pulled down (the chat showing through as it
 * goes) or with ×, it closes ([onClose]), as it does once no photo is left. [onShown] is told of
 * the photo shown, for a list to keep its square in sight.
 */
@Composable
fun PhotoViewer(groupId: String, threadId: String, open: OpenPhotos, nameOf: (String) -> String, onClose: () -> Unit, onShown: (PhotoKey) -> Unit = {}) {
  val calls = LocalGroupCalls.current
  val files = LocalPhotoFiles.current
  val context = LocalContext.current
  val colors = LocalThemeColors.current
  val scope = rememberCoroutineScope()
  val close by rememberUpdatedState(onClose)
  val shown by rememberUpdatedState(onShown)
  BackHandler { close() }

  val version = open.version
  val photos = remember(version) { open.run.photos }
  val showing = remember(version) { open.run.shown }
  LaunchedEffect(showing == null) { if (showing == null) close() }
  if (photos.isEmpty() || showing == null) return

  val pager = rememberPagerState(initialPage = open.run.index ?: 0) { photos.size }
  // The photo shown kept on the screen as the photos around it change (a page coming before it), not
  // while a swipe goes to another, which tells the run once it settles.
  LaunchedEffect(version) {
    val index = open.run.index ?: return@LaunchedEffect
    if (!pager.isScrollInProgress && pager.currentPage != index) pager.scrollToPage(index)
  }
  LaunchedEffect(pager, photos) {
    snapshotFlow { pager.settledPage }.distinctUntilChanged().collect { page ->
      val key = photos.getOrNull(page)?.key ?: return@collect
      if (key != open.run.shown) open.change { show(key) }
      shown(key)
      // The two on each side fetched ahead onto the disk, drawn only as they show.
      val loader = SingletonImageLoader.get(context)
      for (near in (page - 2..page + 2) - page) {
        photos.getOrNull(near)?.let {
          loader.enqueue(ImageRequest.Builder(context).data(ChatPhotoData(it.photo.id, groupId, small = false)).memoryCachePolicy(CachePolicy.DISABLED).build())
        }
      }
    }
  }

  var controls by remember { mutableStateOf(true) }
  val snackbar = remember { SnackbarHostState() }
  var pulled by remember { mutableFloatStateOf(0f) }
  Box(Modifier.fillMaxSize().background(colors.mediaBackground.copy(alpha = 1f - pulled))) {
    HorizontalPager(pager, Modifier.fillMaxSize(), key = { photos.getOrNull(it)?.layoutKey ?: it }, beyondViewportPageCount = 1) { page ->
      val photo = photos.getOrNull(page) ?: return@HorizontalPager
      // Read as whose it is, its shape and when it was sent, and its place among the chat's.
      val place = remember(version) { open.run.place }?.takeIf { page == pager.currentPage && it.second > 1 }
      val said =
        listOfNotNull(
            stringResource(R.string.chat_photo_whose, nameOf(photo.authorId), photoWords(photo.photo)),
            "${monthDay(photo.sentAtMs)} ${clock(photo.sentAtMs)}",
            place?.let { stringResource(R.string.chat_photo_place_said, it.first, it.second) },
          )
          .joinToString("、")
      LargePhoto(photo, groupId, said, onTap = { controls = !controls }, onPulled = { if (page == pager.currentPage) pulled = it }, onDismissed = { close() })
    }
    AnimatedVisibility(controls && pulled == 0f, enter = fadeIn(), exit = fadeOut()) {
      Box(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
          IconButton(onClick = { close() }) {
            Icon(painterResource(R.drawable.ic_close), stringResource(R.string.chat_photo_close), tint = colors.mediaText)
          }
          // The count stays as it was while the group is asked again where the photo is.
          var said by remember { mutableStateOf<Pair<Int, Int>?>(null) }
          remember(version) { open.run.place }?.let { said = it }
          val place = said
          if (place != null && place.second > 1) {
            val read = stringResource(R.string.chat_photo_place_said, place.first, place.second)
            Text(
              stringResource(R.string.chat_photo_place, place.first, place.second),
              Modifier.weight(1f).padding(end = 48.dp).semantics { contentDescription = read },
              color = colors.mediaText,
              style = MaterialTheme.typography.titleMedium,
              textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
          }
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
          val photo = photos.getOrNull(pager.currentPage)
          val notShared = stringResource(R.string.chat_photo_not_shared)
          IconButton(
            onClick = {
              photo?.let {
                scope.launch {
                  val opened =
                    try {
                      sharePhoto(context, wholePhoto(context, calls, files, groupId, it.photo.id))
                    } catch (e: CancellationException) {
                      throw e
                    } catch (_: Exception) {
                      false
                    }
                  if (!opened) snackbar.showSnackbar(notShared)
                }
              }
            }
          ) {
            Icon(painterResource(R.drawable.ic_share), stringResource(R.string.chat_photo_share), tint = colors.mediaText)
          }
          IconButton(onClick = { photo?.let { scope.launch { snackbar.showSnackbar(savePhotos(context, calls, files, groupId, listOf(it.photo))) } } }) {
            Icon(painterResource(R.drawable.ic_download), stringResource(R.string.chat_save), tint = colors.mediaText)
          }
        }
      }
    }
    // What saving and sharing came to, over the foot's buttons.
    SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 64.dp))
  }
}

/**
 * Keeps [open] following the chat's photos (`PhotoRun`), as long as it is drawn: the photos on the
 * device as they change, the group's pages as they come, and the socket opening again; and asks the
 * group for the pages it wants, as each change brings them, while its socket is open.
 */
@Composable
fun FollowPhotos(groupId: String, threadId: String, open: OpenPhotos) {
  if (!open.follows) return
  // The group's socket open for its pages while they are followed, the chat behind or not.
  HoldSocket(groupId)
  val chats = LocalChats.current
  val account = LocalAccount.current
  val socket by remember(account, groupId) { account.chatSocket(groupId) }.collectAsState(null)
  LaunchedEffect(chats, groupId, threadId) { chats.photoLines(groupId, threadId).collect { lines -> open.change { follow(lines) } } }
  LaunchedEffect(socket, threadId) {
    socket?.photoPages?.filter { it.threadId == threadId }?.collect { page -> open.change { take(page) } }
  }
  val current = socket?.state?.collectAsState()?.value == SocketState.Current
  LaunchedEffect(current) { if (current) open.reconnected() }
  LaunchedEffect(open.changes, socket, current) {
    val socket = socket ?: return@LaunchedEffect
    for (ask in open.run.asks()) if (!current || !socket.requestPhotos(threadId, ask.seq, ask.after)) open.run.unasked(ask)
  }
}

/**
 * One of the chat's photos large: what the chat drew of it at once (its small version, else its
 * blur, else the system's spinner) under the photo itself as it comes.
 */
@Composable
private fun LargePhoto(item: ChatPhotoItem, groupId: String, said: String, onTap: () -> Unit, onPulled: (Float) -> Unit, onDismissed: () -> Unit) {
  LargeImage(ChatPhotoData(item.photo.id, groupId, small = false), said, onTap, onPulled, onDismissed) {
    val blur = remember(item.photo.id) { blurOf(item.photo)?.asImageBitmap() }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
      // What the chat drew of it, read from memory or the disk cache at once.
      if (blur != null) Image(blur, contentDescription = null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
      else CircularProgressIndicator(Modifier.size(40.dp), color = LocalThemeColors.current.mediaText)
      AsyncImage(ChatPhotoData(item.photo.id, groupId, small = true), contentDescription = null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
    }
  }
}

/**
 * Someone's face opened large from their profile (spec/chat.md, The chat's page; Photos): whole on
 * black with × alone, zoomed and pulled down to close as a chat's photo is, over the profile's sheet
 * as a dialog of the whole screen, the sheet still under it as it closes.
 */
@Composable
fun FaceViewer(photoId: String, shelf: PhotoShelf, name: String, onClose: () -> Unit) {
  val colors = LocalThemeColors.current
  Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
    var pulled by remember { mutableFloatStateOf(0f) }
    var controls by remember { mutableStateOf(true) }
    Box(Modifier.fillMaxSize().background(colors.mediaBackground.copy(alpha = 1f - pulled))) {
      // A face has no small version: the one the profile drew is the same picture, shown at once.
      LargeImage(Picture(photoId, shelf), stringResource(R.string.profile_photo_of, name), onTap = { controls = !controls }, onPulled = { pulled = it }, onDismissed = onClose) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          CircularProgressIndicator(Modifier.size(40.dp), color = colors.mediaText)
        }
      }
      AnimatedVisibility(controls && pulled == 0f, enter = fadeIn(), exit = fadeOut()) {
        IconButton(onClick = onClose, Modifier.statusBarsPadding().padding(8.dp)) {
          Icon(painterResource(R.drawable.ic_close), stringResource(R.string.chat_photo_close), tint = colors.mediaText)
        }
      }
    }
  }
}

/**
 * An image large, whole and fit to the screen, [coming] under it until it is drawn. Zoomed with a
 * double tap (twice its size about the point tapped, and back) or a pinch (up to four times), moved
 * about while zoomed, and pulled down to close while it is not.
 */
@Composable
@OptIn(ExperimentalTelephotoApi::class)
private fun LargeImage(model: Any, said: String, onTap: () -> Unit, onPulled: (Float) -> Unit, onDismissed: () -> Unit, coming: @Composable () -> Unit) {
  val zoom = rememberZoomableState(ZoomSpec(maxZoomFactor = MOST_ZOOM))
  val image = rememberZoomableImageState(zoom)
  val flick = rememberFlickToDismissState(rotateOnDrag = false)
  val pulled by rememberUpdatedState(onPulled)
  val dismissed by rememberUpdatedState(onDismissed)
  LaunchedEffect(flick) {
    snapshotFlow { flick.offsetFraction }.collect { pulled(it) }
  }
  LaunchedEffect(flick) {
    snapshotFlow { flick.gestureState }.filter { it is FlickToDismissState.GestureState.Dismissed }.collect { dismissed() }
  }
  val zoomed = (zoom.zoomFraction ?: 0f) > 0.01f
  val scope = rememberCoroutineScope()
  val zoomIn = stringResource(R.string.chat_photo_zoom_in)
  val zoomOut = stringResource(R.string.chat_photo_zoom_out)
  FlickToDismiss(
    flick,
    Modifier.fillMaxSize().semantics(mergeDescendants = true) {
      contentDescription = said
      // Zoomed in on its middle a step at a time, as far as it goes, and back.
      customActions =
        listOf(
          CustomAccessibilityAction(zoomIn) { scope.launch { zoom.zoomBy(DOUBLE_TAP_ZOOM) }; true },
          CustomAccessibilityAction(zoomOut) { scope.launch { zoom.resetZoom() }; true },
        )
    },
    enabled = !zoomed,
  ) {
    if (!image.isImageDisplayed) coming()
    ZoomableAsyncImage(
      model,
      contentDescription = null,
      Modifier.fillMaxSize(),
      state = image,
      onClick = { onTap() },
      onDoubleClick = DoubleClickToZoomListener.cycle(maxZoomFactor = DOUBLE_TAP_ZOOM),
    )
  }
}

/** A pinch zooms up to this many times, as Signal's; a double tap to twice. */
private const val MOST_ZOOM = 4f
private const val DOUBLE_TAP_ZOOM = 2f
