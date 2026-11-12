package app.pochical.walk

import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.SearchCondition
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until

// The app walked on a device by the words on its screens, each step waited on by what it shows.

const val PACKAGE = "app.pochical"

const val WAIT = 10_000L

/** What [selector] finds once it shows; failing, what the screen shows instead. */
fun UiDevice.find(selector: BySelector): UiObject2 =
  checkNotNull(wait(Until.findObject(selector), WAIT)) {
    val shown = findObjects(By.pkg(PACKAGE)).mapNotNull { runCatching { it.text ?: it.contentDescription }.getOrNull() }
    "Not on the screen: $selector; shown: $shown"
  }

/**
 * Taps [target] until [done]. A tap is waited on in full before it is made again: the app takes no
 * tap while a page slides in or out, which a person waits for and a test does not.
 */
fun UiDevice.tap(target: BySelector, done: SearchCondition<Boolean>) {
  repeat(3) {
    wait(Until.findObject(target), WAIT)?.click()
    if (wait(done, WAIT)) return
  }
  error("Tapping $target changed nothing")
}

/** Taps [target] until [then] shows. */
fun UiDevice.tap(target: BySelector, then: BySelector) = tap(target, Until.hasObject(then))

/** Goes back from the page [page] shows, until it has gone: the page under it is there all along. */
fun UiDevice.back(page: BySelector) = tap(By.desc("戻る"), Until.gone(page))
