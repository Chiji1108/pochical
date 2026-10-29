package app.pochical.baselineprofile

import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.SearchCondition
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until

// What a person does most in the app, walked through the release build by its words on the screen,
// for the profile and the benchmarks alike: the calendar, a month scrolled, a group, its chat.

const val PACKAGE = "app.pochical"

private const val WAIT = 10_000L

/** What [selector] finds once it shows; failing, what the screen shows instead. */
private fun MacrobenchmarkScope.find(selector: BySelector): UiObject2 =
  checkNotNull(device.wait(Until.findObject(selector), WAIT)) {
    val shown = device.findObjects(By.pkg(PACKAGE)).mapNotNull { runCatching { it.text ?: it.contentDescription }.getOrNull() }
    "Not on the screen: $selector; shown: $shown"
  }

/**
 * Taps [target] until [done]: the app takes no tap while a page slides in or out, which a person
 * waits for and a test does not.
 */
private fun MacrobenchmarkScope.tap(target: BySelector, done: SearchCondition<Boolean>) {
  repeat(3) {
    device.wait(Until.findObject(target), WAIT)?.click()
    if (device.wait(done, WAIT / 3)) return
  }
  error("Tapping $target changed nothing")
}

/** Taps [target] until [then] shows. */
private fun MacrobenchmarkScope.tap(target: BySelector, then: BySelector) = tap(target, Until.hasObject(then))

/** Goes back from the page [page] shows, until it has gone: the page under it is there all along. */
private fun MacrobenchmarkScope.back(page: BySelector) = tap(By.desc("戻る"), Until.gone(page))

private val calendarShown = By.descContains("のお休み")
private val groupShown = By.text("全体チャット")

/**
 * Leaves the app ready for the journeys, once on a fresh install: the first run's questions
 * answered, and a group made on the server the build talks to (`mise run server`), which reaches
 * the emulator's host as the local network Android 17 asks the person to allow.
 */
fun MacrobenchmarkScope.prepare() {
  // From the start, not the page the last run left open.
  killProcess()
  device.executeShellCommand("pm grant $PACKAGE android.permission.ACCESS_LOCAL_NETWORK")
  startActivityAndWait()
  if (device.wait(Until.hasObject(By.text("はじめる")), 3_000)) {
    val answers = listOf("はじめる", "繰り返しはない", "二交代制", "次へ", "毎月1日から末日まで")
    for ((answer, next) in answers.zip(answers.drop(1))) tap(By.text(answer), By.text(next))
    tap(By.text(answers.last()), calendarShown)
  }
  find(By.text("グループ")).click()
  if (device.wait(Until.hasObject(groupShown), WAIT / 2)) return
  // No group yet: グループ shows only how to make or join one.
  tap(By.text("グループ"), By.text("グループを作る"))
  tap(By.text("グループを作る"), By.clazz("android.widget.EditText"))
  val (group, me) = device.findObjects(By.clazz("android.widget.EditText"))
  group.text = "Perf"
  me.text = "Bench"
  // The keyboard the names were typed with stays up over the tabs until it is put away.
  if (device.executeShellCommand("dumpsys input_method").contains("mInputShown=true")) device.pressBack()
  tap(By.text("作る"), By.desc("招待のQRコード"))
  back(By.desc("招待のQRコード"))
  find(groupShown)
}

/** The calendar's tab, with this month's days. */
fun MacrobenchmarkScope.openCalendar() = tap(By.text("カレンダー"), calendarShown)

/** The month turned forward and back, as a person looks at the next one. */
fun MacrobenchmarkScope.scrollMonth() {
  val (left, right, y) = Triple(device.displayWidth / 10, device.displayWidth * 9 / 10, device.displayHeight / 3)
  for ((from, to) in listOf(right to left, right to left, left to right, left to right)) {
    device.swipe(from, y, to, y, 40)
    device.waitForIdle()
  }
  find(calendarShown)
}

/** The group tab, on the person's first group. */
fun MacrobenchmarkScope.openGroups() = tap(By.text("グループ"), groupShown)

/** The group's whole chat, opened from its page, its lines scrolled, and closed again. */
fun MacrobenchmarkScope.openChat() {
  val composer = By.text("メッセージ")
  tap(groupShown, composer)
  device.findObject(By.scrollable(true))?.fling(Direction.UP)
  back(composer)
  find(groupShown)
}
