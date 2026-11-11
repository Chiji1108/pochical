package app.pochical

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.retain.RetainObserver
import androidx.compose.runtime.retain.retain
import androidx.compose.runtime.retain.retainRetainedValuesStoreRegistry
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.navigation3.runtime.NavEntryDecorator
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator

/**
 * What is kept for each of NavDisplay's pages while it is on the stack, until it is popped: what
 * it saves (rememberSaveable), as Navigation 3's own decorator keeps it, and what it holds while
 * it is not shown or the window is made anew (retain, as [rememberRead]'s reads). [onStack] are
 * the content keys of the pages on the stack now.
 *
 * Navigation 3 lets go of both as the page it drew leaves the screen, having seen it taken off
 * the stack. A window made anew (the screen turned) in the moment a page is taken off, before
 * the screen is drawn again without it, keeps the page's state and what it held with the rest and
 * never draws its going: the stack that comes back has no such page, nothing lets go of what was
 * kept for it, and the next page of the same key opens with it, as グループを作る did with the name
 * of the group just made (#1177). So the keys on the stack are saved beside what is kept, and as
 * the screen is made again, what was kept for a key no longer on the stack is let go of: here,
 * the one place, until Navigation 3 does it itself (#1184). While the screen stays, letting go
 * is Navigation 3's alone.
 */
@Composable
fun <T : Any> rememberPageDecorators(onStack: Set<String>): List<NavEntryDecorator<T>> {
  val states = rememberSaveableStateHolder()
  val stores = retainRetainedValuesStoreRegistry()
  val kept = rememberSaveable { ArrayList<String>() }
  // Read as the screen is made, before the keys kept are those of this stack.
  val gone = remember { kept.filter { it !in onStack } }
  DisposableEffect(states, stores) {
    for (key in gone) {
      states.removeState(key)
      stores.clearChild(key)
    }
    onDispose {}
  }
  SideEffect {
    kept.clear()
    kept.addAll(onStack)
  }
  val saved = rememberSaveableStateHolderNavEntryDecorator<T>(states)
  return remember(saved, stores) {
    listOf(saved, NavEntryDecorator(onPop = stores::clearChild) { entry -> stores.LocalRetainedValuesStoreProvider(entry.contentKey) { entry.Content() } })
  }
}

/**
 * Calls [left] once the page this is in has left for good: off the stack, the one rule, whether
 * it was showing as it was taken off or covered by a page over it, or taken off in the moment the
 * window was made anew; or its activity finished, the stack gone with it. Not as it leaves the
 * screen: a page covered by another (a link's 参加の画面 over グループを作る) or drawn again as
 * the screen turns is on the stack still, and has left nothing.
 *
 * It is a value the page holds ([retain]) in what is kept for its key ([rememberPageDecorators]),
 * which Navigation 3 lets go of exactly then. A page of no stack holds it in its activity, and
 * has left as it leaves the screen while the window stays.
 */
@Composable
fun OnLeftForGood(left: () -> Unit) {
  val place = retain { PagePlace() }
  // As the page is now, which the page drawn again after the screen turned says anew.
  SideEffect { place.left = left }
}

private class PagePlace : RetainObserver {
  var left: () -> Unit = {}

  override fun onRetired() = left()

  override fun onRetained() {}

  override fun onEnteredComposition() {}

  override fun onExitedComposition() {}

  override fun onUnused() {}
}
