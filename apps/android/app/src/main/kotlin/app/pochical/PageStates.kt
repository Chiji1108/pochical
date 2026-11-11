package app.pochical

import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.navigation3.runtime.NavEntryDecorator
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator

/**
 * Keeps what each of NavDisplay's pages saves (rememberSaveable) while it is on the stack, as
 * Navigation 3's own decorator does, and nothing for a page that is not: [onStack] are the content
 * keys of the pages on the stack now.
 *
 * Navigation 3 lets go of a page's state as the page it drew leaves the screen, having seen it
 * taken off the stack. A window made anew (the screen turned) in the moment a page is taken off,
 * before the screen is drawn again without it, saves the page's state with the rest and never
 * draws its going: the stack that comes back has no such page, nothing lets go of what it saved,
 * and the next page of the same key opens with it, as グループを作る did with the name of the group
 * just made (#1177). So the keys held are saved beside the states, and those no longer on the
 * stack are let go of here, the one place, until Navigation 3 does it itself (#1184).
 */
@Composable
fun <T : Any> rememberPageStatesDecorator(onStack: Set<String>): NavEntryDecorator<T> {
  val states = rememberSaveableStateHolder()
  val held = rememberSaveable { ArrayList<String>() }
  SideEffect {
    for (key in held) if (key !in onStack) states.removeState(key)
    held.clear()
    held.addAll(onStack)
  }
  return rememberSaveableStateHolderNavEntryDecorator(states)
}
