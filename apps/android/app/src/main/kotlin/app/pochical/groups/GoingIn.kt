package app.pochical.groups

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.retain.retain
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import app.pochical.R
import app.pochical.ReviewPrompt
import app.pochical.kit.InGroup
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Deferred

/**
 * The person going into a group from a page, made (グループを作る) or joined (参加の画面): the kit's
 * call ([app.pochical.kit.GroupCalls.make], `joining`), which the page [begin]s and then waits on.
 * The call is the kit's and is held here over the window made anew, so the screen turned while it
 * is under way neither stops it nor leaves the page behind once the person is in the group: the
 * page there awaits the same call (#1178).
 */
@Stable
class GoingIn internal constructor(private val held: Held) {
  /** The call under way, kept while the window is made anew; none once its answer is taken. */
  internal class Held {
    var call by mutableStateOf<Deferred<InGroup>?>(null)
  }

  /** In the group, the page giving way to it. */
  internal var gone by mutableStateOf(false)

  /** Under way, and still as the page gives way to the group, so its button is not there to tap again. */
  val busy: Boolean
    get() = held.call != null || gone

  fun begin(call: Deferred<InGroup>) {
    held.call = call
  }
}

/**
 * A page's [GoingIn]: once the person is in the group [onIn] gets its id, a face that could not be
 * kept said past the page, which gives way to the group at once; a call that fails goes to
 * [onFailed], the page free to ask again.
 */
@Composable
fun rememberGoingIn(onIn: (String) -> Unit, onFailed: (Exception) -> Unit): GoingIn {
  val held = retain { GoingIn.Held() }
  val going = remember(held) { GoingIn(held) }
  val context = LocalContext.current
  val resources = LocalResources.current
  val entered by rememberUpdatedState(onIn)
  val failed by rememberUpdatedState(onFailed)
  LaunchedEffect(held.call) {
    val call = held.call ?: return@LaunchedEffect
    try {
      val group = call.await()
      if (!group.faceKept) {
        ReviewPrompt.troubled = true
        Toast.makeText(context, resources.getString(R.string.join_face_failed), Toast.LENGTH_LONG).show()
      }
      // Taken once: nothing is held for a page opened after this one.
      going.gone = true
      held.call = null
      entered(group.groupId)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      held.call = null
      failed(e)
    }
  }
  return going
}
