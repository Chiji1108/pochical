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
import androidx.compose.ui.semantics.contentDescription
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

/** The chat's photos open large, as [run] follows them; [version] tells the screen each change. */
@Stable
class OpenPhotos(val run: PhotoRun) {
  var version by mutableIntStateOf(0)
    private set

  /** Changes the run, the screen following. */
  fun change(step: PhotoRun.() -> Unit) {
    run.step()
    version++
  }
}

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
fun PhotoViewer(groupId: String, threadId: String, open: OpenPhotos, onClose: () -> Unit, onShown: (PhotoKey) -> Unit = {}) {
  val chats = LocalChats.current
  val account = LocalAccount.current
  val calls = LocalGroupCalls.current
  val files = LocalPhotoFiles.current
  val context = LocalContext.current
  val colors = LocalThemeColors.current
  val scope = rememberCoroutineScope()
  val close by rememberUpdatedState(onClose)
  val shown by rememberUpdatedState(onShown)
  BackHandler { close() }

  FollowPhotos(groupId, threadId, open)

  val version = open.version
  val photos = remember(version) { open.run.photos }
  val showing = remember(version) { open.run.shown }
  LaunchedEffect(showing == null) { if (showing == null) close() }
  if (photos.isEmpty() || showing == null) return

  val pager = rememberPagerState(initialPage = open.run.index ?: 0) { photos.size }
  // The photo shown kept on the screen as the photos around it change (a page coming before it).
  LaunchedEffect(version) {
    val index = open.run.index ?: return@LaunchedEffect
    if (pager.currentPage != index) pager.scrollToPage(index)
  }
  LaunchedEffect(pager, photos) {
    snapshotFlow { pager.settledPage }.distinctUntilChanged().collect { page ->
      val key = photos.getOrNull(page)?.key ?: return@collect
      if (key != open.run.shown) open.change { show(key) }
      shown(key)
      // The two on each side fetched ahead, as they will show.
      val loader = SingletonImageLoader.get(context)
      for (near in (page - 2..page + 2) - page) {
        photos.getOrNull(near)?.let { loader.enqueue(ImageRequest.Builder(context).data(ChatPhotoData(it.photo.id, groupId, small = false)).build()) }
      }
    }
  }

  var controls by remember { mutableStateOf(true) }
  val snackbar = remember { SnackbarHostState() }
  var pulled by remember { mutableFloatStateOf(0f) }
  Box(Modifier.fillMaxSize().background(colors.mediaBackground.copy(alpha = 1f - pulled))) {
    HorizontalPager(pager, Modifier.fillMaxSize(), key = { photos.getOrNull(it)?.photo?.id ?: it }, beyondViewportPageCount = 1) { page ->
      val photo = photos.getOrNull(page) ?: return@HorizontalPager
      LargePhoto(photo, groupId, onTap = { controls = !controls }, onPulled = { if (page == pager.currentPage) pulled = it }, onDismissed = { close() })
    }
    AnimatedVisibility(controls && pulled == 0f, enter = fadeIn(), exit = fadeOut()) {
      Box(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
          IconButton(onClick = { close() }) {
            Icon(painterResource(R.drawable.ic_close), stringResource(R.string.chat_photo_close), tint = colors.mediaText)
          }
          val place = remember(version) { open.run.place }
          if (place != null && place.second > 1) {
            val said = stringResource(R.string.chat_photo_place_said, place.first, place.second)
            Text(
              stringResource(R.string.chat_photo_place, place.first, place.second),
              Modifier.weight(1f).padding(end = 48.dp).semantics { contentDescription = said },
              color = colors.mediaText,
              style = MaterialTheme.typography.titleMedium,
              textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
          }
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
          val photo = photos.getOrNull(pager.currentPage)
          IconButton(onClick = { photo?.let { scope.launch { runCatchingSafely { sharePhoto(context, wholePhoto(context, calls, files, groupId, it.photo.id)) } } } }) {
            Icon(painterResource(R.drawable.ic_share), stringResource(R.string.chat_photo_share), tint = colors.mediaText)
          }
          IconButton(onClick = { photo?.let { scope.launch { snackbar.showSnackbar(savePhotos(context, calls, files, groupId, listOf(it.photo))) } } }) {
            Icon(painterResource(R.drawable.ic_download), stringResource(R.string.chat_save), tint = colors.mediaText)
          }
        }
      }
    }
    // What saving came to, over the foot's buttons.
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
  LaunchedEffect(current) { if (current) open.change { reconnected() } }
  LaunchedEffect(open.version, socket, current) {
    val socket = socket ?: return@LaunchedEffect
    for (ask in open.run.asks()) if (!current || !socket.requestPhotos(threadId, ask.seq, ask.after)) open.run.unasked(ask)
  }
}

/**
 * One photo large, whole and fit to the screen: what the chat drew of it at once (its small version,
 * else its blur, else the system's spinner) under the photo itself as it comes. Zoomed with a double
 * tap (twice its size about the point tapped, and back) or a pinch (up to four times), moved about
 * while zoomed, and pulled down to close while it is not.
 */
@Composable
@OptIn(ExperimentalTelephotoApi::class)
private fun LargePhoto(item: ChatPhotoItem, groupId: String, onTap: () -> Unit, onPulled: (Float) -> Unit, onDismissed: () -> Unit) {
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
  FlickToDismiss(flick, Modifier.fillMaxSize(), enabled = !zoomed) {
    if (!image.isImageDisplayed) {
      val blur = remember(item.photo.id) { blurOf(item.photo)?.asImageBitmap() }
      Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        // What the chat drew of it, read from memory or the disk cache at once.
        if (blur != null) Image(blur, contentDescription = null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
        else CircularProgressIndicator(Modifier.size(40.dp), color = LocalThemeColors.current.mediaText)
        AsyncImage(ChatPhotoData(item.photo.id, groupId, small = true), contentDescription = null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
      }
    }
    ZoomableAsyncImage(
      ChatPhotoData(item.photo.id, groupId, small = false),
      contentDescription = null,
      Modifier.fillMaxSize(),
      state = image,
      onClick = { onTap() },
      onDoubleClick = DoubleClickToZoomListener.cycle(maxZoomFactor = DOUBLE_TAP_ZOOM),
    )
  }
}

/** Runs [block], a failure nothing more than not done. */
private suspend fun runCatchingSafely(block: suspend () -> Unit) {
  try {
    block()
  } catch (e: CancellationException) {
    throw e
  } catch (_: Exception) {}
}

/** A pinch zooms up to this many times, as Signal's; a double tap to twice. */
private const val MOST_ZOOM = 4f
private const val DOUBLE_TAP_ZOOM = 2f
