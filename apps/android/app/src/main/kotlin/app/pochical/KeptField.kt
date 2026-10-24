package app.pochical

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.TextFieldValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.launch

/** A name field kept as it is left: what is typed, whether the last keep failed, and the keep itself. */
class KeptField(val field: MutableState<TextFieldValue>, private val failedState: MutableState<Boolean>, val keep: () -> Unit) {
  /** The last name kept did not go through; the field holds it for another try. */
  val failed: Boolean
    get() = failedState.value
}

/**
 * A name kept as the field, the page or the app is left (spec/calendar.md, Text fields): the usual
 * name, a group's own name, a coworker's. Only a name typed here is sent, against the one the field
 * started from or last kept, never the one it opened with, so a change from another device meanwhile
 * stands; untouched, the field follows [saved] as it changes. [send] takes the trimmed name, which
 * [fits]; its answer, told while the page is here, says whether it went through.
 */
@Composable
fun rememberKeptField(saved: String, fits: (String) -> Boolean, send: (String) -> Deferred<Unit>): KeptField {
  val field = rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(saved)) }
  var from by rememberSaveable { mutableStateOf(saved) }
  val failed = remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  LaunchedEffect(saved) {
    if (field.value.text == from) {
      field.value = TextFieldValue(saved)
      from = saved
    }
  }
  val keep by rememberUpdatedState {
    val typed = field.value.text.trim()
    if (typed != from && fits(typed)) {
      val before = from
      from = typed
      val sent = send(typed)
      scope.launch {
        failed.value =
          try {
            sent.await()
            false
          } catch (e: CancellationException) {
            throw e
          } catch (_: Exception) {
            from = before
            true
          }
      }
    }
  }
  DisposableEffect(Unit) { onDispose { keep() } }
  LifecycleEventEffect(Lifecycle.Event.ON_STOP) { keep() }
  return remember(field) { KeptField(field, failed) { keep() } }
}
