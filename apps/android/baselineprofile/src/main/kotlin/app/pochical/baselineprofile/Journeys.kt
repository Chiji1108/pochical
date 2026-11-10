package app.pochical.baselineprofile

import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import app.pochical.walk.PACKAGE
import app.pochical.walk.back
import app.pochical.walk.find
import app.pochical.walk.tap
import java.util.regex.Pattern

// What a person does most in the app, walked through the release build by its words on the screen,
// for the profile and the benchmarks alike: the calendar, a month scrolled, a group, its chat.

private val calendarShown = By.descContains("のお休み")
private val groupShown = By.text("全体チャット")

/**
 * Leaves the app ready for the journeys, once on a fresh install: the first run's questions
 * answered, and a group made on the server the build talks to (`mise run server`), which reaches
 * the emulator's host as the local network Android 17 asks the person to allow.
 */
fun MacrobenchmarkScope.prepare() {
  // Online, though a run cut off left the emulator in airplane mode (Benchmarks' offline starts).
  device.executeShellCommand("cmd connectivity airplane-mode disable")
  device.executeShellCommand("pm grant $PACKAGE android.permission.ACCESS_LOCAL_NETWORK")
  killProcess()
  startActivityAndWait()
  if (device.wait(Until.hasObject(By.text("はじめる")), 3_000)) {
    val answers = listOf("はじめる", "繰り返しはない", "二交代制", "次へ", "毎月1日から末日まで")
    for ((answer, next) in answers.zip(answers.drop(1))) device.tap(By.text(answer), By.text(next))
    device.tap(By.text(answers.last()), calendarShown)
  }
  // グループ shows the person's first group, or with none yet, only how to make or join one.
  device.tap(By.text("グループ"), Until.hasObject(By.text(Pattern.compile("全体チャット|グループを作る"))))
  if (device.hasObject(groupShown)) return
  device.tap(By.text("グループを作る"), By.text("このグループでの名前"))
  val (group, me) = device.findObjects(By.clazz("android.widget.EditText"))
  group.text = "Perf"
  me.text = "Bench"
  device.tap(By.text("作る"), By.desc("招待のQRコード"))
  device.back(By.desc("招待のQRコード"))
  device.find(groupShown)
}

/** The calendar's tab, with this month's days. */
fun MacrobenchmarkScope.openCalendar() = device.tap(By.text("カレンダー"), calendarShown)

/** The month turned forward and back, as a person looks at the next one. */
fun MacrobenchmarkScope.scrollMonth() {
  val (left, right, y) = Triple(device.displayWidth / 10, device.displayWidth * 9 / 10, device.displayHeight / 3)
  for ((from, to) in listOf(right to left, right to left, left to right, left to right)) {
    device.swipe(from, y, to, y, 40)
    device.waitForIdle()
  }
  device.find(calendarShown)
}

/** The group tab, on the person's first group. */
fun MacrobenchmarkScope.openGroups() = device.tap(By.text("グループ"), groupShown)

/** The group's whole chat, opened from its page and closed again. */
fun MacrobenchmarkScope.openChat() {
  val composer = By.text("メッセージ")
  device.tap(groupShown, composer)
  device.back(composer)
  device.find(groupShown)
}
