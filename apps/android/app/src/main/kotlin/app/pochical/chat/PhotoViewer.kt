package app.pochical.chat

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import coil3.compose.AsyncImagePainter
import coil3.size.Size as CoilSize
import me.saket.telephoto.zoomable.ZoomableContentLocation
import me.saket.telephoto.zoomable.zoomable
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBarsIgnoringVisibility
import androidx.compose.foundation.layout.statusBarsIgnoringVisibility
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.ui.graphics.luminance
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import kotlinx.coroutines.flow.filterNotNull
import androidx.compose.runtime.mutableLongStateOf
import kotlinx.coroutines.flow.drop
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.runtime.key
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
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
import coil3.memory.MemoryCache
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

  /** The id of the photo shown, read as the page draws, for its place to stand empty. */
  fun shownPhoto(): String? {
    changes
    return run.photos.firstOrNull { it.key == run.shown }?.photo?.id
  }

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
// The buttons keep their place as the system bars hide and show (statusBarsIgnoringVisibility).
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PhotoViewer(
  groupId: String,
  threadId: String,
  open: OpenPhotos,
  nameOf: (String) -> String,
  onClose: () -> Unit,
  onShown: (ChatPhotoItem) -> Unit = {},
  /** The viewer's coming and going, for the photo shown to come out of its place and go back into it; null to fade alone. */
  zoom: AnimatedVisibilityScope? = null,
  /** Going: it fades with nothing more to do, back is the page's again. */
  closing: Boolean = false,
) {
  val calls = LocalGroupCalls.current
  val files = LocalPhotoFiles.current
  val context = LocalContext.current
  val colors = LocalThemeColors.current
  val scope = rememberCoroutineScope()
  val close by rememberUpdatedState(onClose)
  val shown by rememberUpdatedState(onShown)
  val haptics = LocalHapticFeedback.current
  // With a screen reader on, a tap never takes the buttons out of reach.
  val reading = rememberScreenReaderOn()
  BackHandler(enabled = !closing) { close() }

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
      photos.getOrNull(page)?.let(shown)
      // The two on each side fetched ahead onto the disk, drawn only as they show.
      val loader = SingletonImageLoader.get(context)
      for (near in (page - 2..page + 2) - page) {
        photos.getOrNull(near)?.let {
          loader.enqueue(ImageRequest.Builder(context).data(ChatPhotoData(it.photo.id, groupId, small = false)).memoryCachePolicy(CachePolicy.DISABLED).build())
        }
      }
    }
  }

  // Swiped to another, a screen reader says the one come to and its place (spec/chat.md, Screen readers).
  // By the photo come to, not its page: pages of earlier photos coming before it move no photo.
  var swipes by remember { mutableLongStateOf(0L) }
  val settled = photos.getOrNull(pager.settledPage)
  LaunchedEffect(pager) { snapshotFlow { photos.getOrNull(pager.settledPage)?.key }.filterNotNull().distinctUntilChanged().drop(1).collect { swipes++ } }
  if (reading && settled != null) {
    val place = remember(version) { open.run.place }?.takeIf { it.second > 1 }
    Spoken(swipes, photoSaid(settled, place, nameOf))
  }
  var controls by remember { mutableStateOf(true) }
  val snackbar = remember { SnackbarHostState() }
  var pulled by remember { mutableFloatStateOf(0f) }
  // The system bars go with the buttons; they come back as it is pulled or goes, while the photo
  // still covers the page, which takes their room back under it.
  if (!closing) MediaBars(shown = controls || reading || pulled > 0f)
  Box(Modifier.fillMaxSize().background(colors.mediaBackground.copy(alpha = 1f - pulled))) {
    HorizontalPager(pager, Modifier.fillMaxSize(), key = { photos.getOrNull(it)?.layoutKey ?: it }, beyondViewportPageCount = 1) { page ->
      val photo = photos.getOrNull(page) ?: return@HorizontalPager
      // Read as whose it is, its shape and when it was sent, and its place among the chat's.
      val place = remember(version) { open.run.place }?.takeIf { page == pager.currentPage && it.second > 1 }
      val said = photoSaid(photo, place, nameOf)
      LargePhoto(
        photo,
        groupId,
        said,
        onTap = { if (!reading) controls = !controls },
        onPulled = { if (page == pager.currentPage) pulled = it },
        onDismissed = { close() },
        // Only the photo shown goes back into its place.
        if (page == pager.settledPage) Modifier.largePhoto(photo.photo.id, zoom) else Modifier,
      )
    }
    // Always in reach with a screen reader on, hidden before or not.
    AnimatedVisibility((controls || reading) && pulled == 0f, enter = fadeIn(), exit = fadeOut()) {
      Box(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBarsIgnoringVisibility).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
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
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBarsIgnoringVisibility).padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
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
          IconButton(onClick = { photo?.let { scope.launch { snackbar.saying(savePhotos(context, calls, files, groupId, listOf(it.photo)), haptics) } } }) {
            Icon(painterResource(R.drawable.ic_download), stringResource(R.string.chat_save), tint = colors.mediaText)
          }
        }
      }
    }
    // What saving and sharing came to, over the foot's buttons.
    SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.navigationBarsIgnoringVisibility).padding(bottom = 64.dp))
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
  val socket by remember(account, groupId) { account.chatSocket(groupId) }.collectAsStateWithLifecycle(null)
  LaunchedEffect(chats, groupId, threadId) { chats.photoLines(groupId, threadId).collect { lines -> open.change { follow(lines) } } }
  LaunchedEffect(socket, threadId) {
    socket?.photoPages?.filter { it.threadId == threadId }?.collect { page -> open.change { take(page) } }
  }
  val current = socket?.state?.collectAsStateWithLifecycle()?.value == SocketState.Current
  LaunchedEffect(current) { if (current) open.reconnected() }
  LaunchedEffect(open.changes, socket, current) {
    val socket = socket ?: return@LaunchedEffect
    for (ask in open.run.asks()) if (!current || !socket.requestPhotos(threadId, ask.seq, ask.after)) open.run.unasked(ask)
  }
}

/** A photo opened large as a screen reader says it: whose it is, its shape, when it was sent, and its [place] among the chat's. */
@Composable
private fun photoSaid(photo: ChatPhotoItem, place: Pair<Int, Int>?, nameOf: (String) -> String): String =
  listOfNotNull(
      stringResource(R.string.chat_photo_whose, nameOf(photo.authorId), photoWords(photo.photo)),
      "${monthDay(photo.sentAtMs)} ${clock(photo.sentAtMs)}",
      place?.let { stringResource(R.string.chat_photo_place_said, it.first, it.second) },
    )
    .joinToString("、")

/**
 * One of the chat's photos large: what the chat drew of it at once (its small version over its blur,
 * else the system's spinner) under the photo itself as it comes, in the photo's own box as it is fit
 * to the screen, which [place] takes, so it goes back into its line from where it is.
 */
@Composable
private fun LargePhoto(item: ChatPhotoItem, groupId: String, said: String, onTap: () -> Unit, onPulled: (Float) -> Unit, onDismissed: () -> Unit, place: Modifier) {
  val context = LocalContext.current
  val photo = item.photo
  val size = Size(photo.width.toFloat(), photo.height.toFloat()).takeIf { it.width > 0f && it.height > 0f }
  LargeImage(
    { attempt -> ImageRequest.Builder(context).data(ChatPhotoData(photo.id, groupId, small = false, attempt = attempt)).large().build() },
    said,
    size,
    onTap,
    onPulled,
    onDismissed,
    place,
  ) { failed ->
    val blur = remember(photo.id) { blurOf(photo)?.asImageBitmap() }
    // What the chat drew of it, read from memory or the disk cache at once.
    if (blur != null) Image(blur, contentDescription = null, Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
    else if (!failed) CircularProgressIndicator(Modifier.align(Alignment.Center).size(40.dp), color = LocalThemeColors.current.mediaText)
    AsyncImage(ChatPhotoData(photo.id, groupId, small = true), contentDescription = null, Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
  }
}

/**
 * Someone's face opened large from their profile (spec/chat.md, The chat's page; Photos): whole on
 * black with × alone, zoomed and pulled down to close as a chat's photo is, over the profile's sheet
 * as a dialog of the whole screen, the sheet still under it as it closes.
 */
// The buttons keep their place as the system bars hide and show (statusBarsIgnoringVisibility).
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FaceViewer(photoId: String, shelf: PhotoShelf, name: String, onClose: () -> Unit) {
  val colors = LocalThemeColors.current
  Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
    var pulled by remember { mutableFloatStateOf(0f) }
    val reading = rememberScreenReaderOn()
    var controls by remember { mutableStateOf(true) }
    MediaBars(shown = controls || reading || pulled > 0f)
    Box(Modifier.fillMaxSize().background(colors.mediaBackground.copy(alpha = 1f - pulled))) {
      // A face has no small version: the one the profile drew, from memory, shows until it is drawn
      // whole, which the disk keeps (a face is fetched once).
      val picture = Picture(photoId, shelf)
      val context = LocalContext.current
      LargeImage(
        { ImageRequest.Builder(context).data(picture).placeholderMemoryCacheKey(MemoryCache.Key(picture.key)).large().build() },
        stringResource(R.string.profile_photo_of, name),
        size = null,
        onTap = { if (!reading) controls = !controls },
        onPulled = { pulled = it },
        onDismissed = onClose,
      ) { failed ->
        if (!failed) CircularProgressIndicator(Modifier.align(Alignment.Center).size(40.dp), color = colors.mediaText)
      }
      AnimatedVisibility((controls || reading) && pulled == 0f, enter = fadeIn(), exit = fadeOut()) {
        IconButton(onClick = onClose, Modifier.windowInsetsPadding(WindowInsets.statusBarsIgnoringVisibility).padding(8.dp)) {
          Icon(painterResource(R.drawable.ic_close), stringResource(R.string.chat_photo_close), tint = colors.mediaText)
        }
      }
    }
  }
}

/**
 * An image large, whole and fit to the screen in a box of its own ([place] on it, as it is drawn
 * there), [coming] in that box until it is drawn. Its [size] places the box at once; without one the
 * box is the screen until the image tells its own. Zoomed with a double tap (twice its size about
 * the point tapped, and back) or a pinch (up to four times), moved about while zoomed, and pulled
 * down to close while it is not: let go to close, it closes from where it is ([onDismissed]) rather
 * than after flying off the screen. One that cannot be fetched shows ↻ in the middle, which fetches
 * it again, as iOS's viewer does (spec/chat.md, Photos).
 */
@Composable
@OptIn(ExperimentalTelephotoApi::class)
private fun LargeImage(
  request: (attempt: Int) -> ImageRequest,
  said: String,
  size: Size?,
  onTap: () -> Unit,
  onPulled: (Float) -> Unit,
  onDismissed: () -> Unit,
  place: Modifier = Modifier,
  coming: @Composable BoxScope.(failed: Boolean) -> Unit,
) {
  val zoom = rememberZoomableState(ZoomSpec(maxZoomFactor = MOST_ZOOM))
  val flick = rememberFlickToDismissState(rotateOnDrag = false)
  var attempt by remember { mutableIntStateOf(0) }
  var failed by remember { mutableStateOf(false) }
  var drawn by remember { mutableStateOf<Size?>(null) }
  val box = size ?: drawn
  LaunchedEffect(zoom, box) { if (box != null) zoom.setContentLocation(ZoomableContentLocation.scaledToFitAndCenterAligned(box)) }
  val pulled by rememberUpdatedState(onPulled)
  val dismissed by rememberUpdatedState(onDismissed)
  LaunchedEffect(flick) {
    snapshotFlow { flick.offsetFraction }.collect { pulled(it) }
  }
  // As the finger lets it go to close, not once it has flown off the screen, so it goes back from there.
  LaunchedEffect(flick) {
    snapshotFlow { flick.gestureState }.filter { it is FlickToDismissState.GestureState.Dismissing }.collect { dismissed() }
  }
  val zoomed = (zoom.zoomFraction ?: 0f) > 0.01f
  val scope = rememberCoroutineScope()
  val zoomIn = stringResource(R.string.chat_photo_zoom_in)
  val zoomOut = stringResource(R.string.chat_photo_zoom_out)
  Box(Modifier.fillMaxSize()) {
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
      Box(
        Modifier.fillMaxSize().zoomable(zoom, onClick = { onTap() }, onDoubleClick = DoubleClickToZoomListener.cycle(maxZoomFactor = DOUBLE_TAP_ZOOM)),
        contentAlignment = Alignment.Center,
      ) {
        Box((if (box != null) Modifier.aspectRatio(box.width / box.height) else Modifier.fillMaxSize()).then(place)) {
          if (drawn == null) coming(failed)
          key(attempt) {
            AsyncImage(
              remember { request(attempt) },
              contentDescription = null,
              Modifier.fillMaxSize(),
              contentScale = ContentScale.Fit,
              onState = { state ->
                failed = state is AsyncImagePainter.State.Error
                if (state is AsyncImagePainter.State.Success) drawn = state.painter.intrinsicSize
              },
            )
          }
        }
      }
    }
    if (failed) {
      PhotoRetry(Modifier.align(Alignment.Center)) {
        failed = false
        attempt++
      }
    }
  }
}

/**
 * The system bars over a photo opened large: their icons light on its black, and hidden with its
 * buttons, a swipe from the edge showing them for a moment, as Photos hides them. Once it goes they
 * show again, their icons as the theme draws them then and their behavior as it was.
 */
@Composable
private fun MediaBars(shown: Boolean) {
  val view = LocalView.current
  val window = (view.parent as? DialogWindowProvider)?.window ?: LocalActivity.current?.window ?: return
  val controller = remember(window, view) { WindowCompat.getInsetsController(window, view) }
  val lightTheme by rememberUpdatedState(MaterialTheme.colorScheme.background.luminance() > 0.5f)
  DisposableEffect(controller) {
    val behavior = controller.systemBarsBehavior
    controller.isAppearanceLightStatusBars = false
    controller.isAppearanceLightNavigationBars = false
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    onDispose {
      controller.show(WindowInsetsCompat.Type.systemBars())
      controller.systemBarsBehavior = behavior
      controller.isAppearanceLightStatusBars = lightTheme
      controller.isAppearanceLightNavigationBars = lightTheme
    }
  }
  LaunchedEffect(controller, shown) {
    if (shown) controller.show(WindowInsetsCompat.Type.systemBars()) else controller.hide(WindowInsetsCompat.Type.systemBars())
  }
}

/**
 * An image opened large, read whole for the zoom (at most `chatRules.photoMaxEdge` on a side), from
 * memory when the lines' memory holds it but never kept there, so it lets go of no line's photo.
 */
private fun ImageRequest.Builder.large(): ImageRequest.Builder = size(CoilSize.ORIGINAL).memoryCachePolicy(CachePolicy.READ_ONLY)

/** A pinch zooms up to this many times, as Signal's; a double tap to twice. */
private const val MOST_ZOOM = 4f
private const val DOUBLE_TAP_ZOOM = 2f
