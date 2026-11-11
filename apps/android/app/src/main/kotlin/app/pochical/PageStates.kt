package app.pochical

import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.retain.retainRetainedValuesStoreRegistry
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.staticCompositionLocalOf
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

/** Whether the page this is in is on the stack still, as [RootScreen] has it; a page of no stack is. */
val LocalOnStack = staticCompositionLocalOf<() -> Boolean> { { true } }

/**
 * Whether the page this is in is leaving for good, asked as it leaves the screen (a
 * DisposableEffect's onDispose): not when the window is only being made anew (the screen turned)
 * with the page still on the stack, which draws it again. A page taken off the stack in the
 * moment the window is made anew is leaving for good too, though its going is never drawn.
 */
@Composable
fun rememberLeavingForGood(): () -> Boolean {
  val activity = LocalActivity.current
  val onStack = LocalOnStack.current
  return remember(activity, onStack) { { activity?.isChangingConfigurations != true || !onStack() } }
}
