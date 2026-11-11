package app.pochical.groups

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.kit.GoingIn
import app.pochical.rememberLeavingForGood
import kotlin.coroutines.cancellation.CancellationException

/**
 * A page waiting on the kit's call into a group ([GoingIn]), グループを作る's or 参加の画面's, while
 * the call is [mine]: whether its button is busy. The call is the kit's, so the page drawn again
 * after the screen turned, or opened again after it was left, finds it under way and waits on
 * (#1178). Once the person is in the group [onIn] gets its id, a face that could not be kept said
 * past the page, which gives way to the group at once; a call that fails goes to [onFailed], the
 * page free to ask again. A page left for good while it waits tells the kit so, which then
 * forgets the call as it ends: the group is in the person's list, and nothing opens by itself.
 */
@Composable
fun <Asked> waitingOn(going: GoingIn<Asked>, mine: (Asked) -> Boolean = { true }, onIn: (String) -> Unit, onFailed: (Exception) -> Unit): Boolean {
  val call by going.underWay.collectAsStateWithLifecycle()
  // In the group, the page giving way to it: busy still, so its button is not there to tap again.
  var gone by remember { mutableStateOf(false) }
  val context = LocalContext.current
  val resources = LocalResources.current
  val leavingForGood = rememberLeavingForGood()
  val entered by rememberUpdatedState(onIn)
  val failed by rememberUpdatedState(onFailed)
  val waited = call?.takeIf { mine(it.asked) }
  LaunchedEffect(waited) {
    val waitedOn = waited ?: return@LaunchedEffect
    going.waitOn(waitedOn)
    try {
      val group = waitedOn.answer.await()
      if (!group.faceKept) {
        ReviewPrompt.troubled = true
        Toast.makeText(context, resources.getString(R.string.join_face_failed), Toast.LENGTH_LONG).show()
      }
      gone = true
      going.took(waitedOn)
      entered(group.groupId)
    } catch (e: CancellationException) {
      // The page going, never the call: the kit's scope ends with the app alone.
      throw e
    } catch (e: Exception) {
      going.took(waitedOn)
      failed(e)
    }
  }
  val isMine by rememberUpdatedState(mine)
  DisposableEffect(going) {
    onDispose {
      // Not as the phone turns: the page drawn again waits on. The call as the kit has it now,
      // which the page may have begun without having been drawn waiting yet.
      if (leavingForGood()) going.underWay.value?.takeIf { isMine(it.asked) }?.let(going::left)
    }
  }
  return call != null || gone
}
