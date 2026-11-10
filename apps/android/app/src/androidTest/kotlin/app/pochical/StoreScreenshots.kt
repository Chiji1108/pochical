package app.pochical

import android.content.Intent
import android.net.Uri
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import app.pochical.kit.AccountState
import app.pochical.kit.PochicalKit
import app.pochical.walk.PACKAGE
import app.pochical.walk.back
import app.pochical.walk.find
import app.pochical.walk.tap
import java.io.File
import java.time.LocalDate
import java.util.regex.Pattern
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The screens the stores' screenshots are made of (#806), photographed as they are on an emulator:
 * the sample month as a new user's, who joins the group tools/store-screenshots/seed.ts made as
 * 佐藤, each kept under the name packages/prototype/src/lib/store-shots.ts gives it. The last is the
 * month in 墨 with シフトの色 at ワントーン, in black and white, so every screen before it is in the
 * テーマ and the colors the app starts with. Run by `mise run store:shots:android` (tools/store-screenshots/android.sh), which sets the
 * emulator up, names the invitation (the argument `invite`) and takes the PNGs from where Gradle
 * pulls them (`additionalTestOutputDir`); skipped in any other run.
 */
@RunWith(AndroidJUnit4::class)
class StoreScreenshots {
  private val arguments = InstrumentationRegistry.getArguments()
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val device = UiDevice.getInstance(instrumentation)
  private val app = instrumentation.targetContext.applicationContext
  private val account = (app as PochicalKit.Holder).pochicalKit.account

  @Test
  fun photographsTheScreens() {
    val invite = arguments.getString("invite")
    assumeTrue("Only when asked for, by mise run store:shots:android", invite != null)
    // The server on the emulator's host, and the device's calendars, as the person would allow them.
    for (permission in listOf("ACCESS_LOCAL_NETWORK", "READ_CALENDAR", "WRITE_CALENDAR")) {
      device.executeShellCommand("pm grant $PACKAGE android.permission.$permission")
    }
    launch()
    runBlocking { becomeNewUser() }
    launch("sample", "firstRunDone")
    val calendar = By.descContains("、夜勤")
    device.find(calendar)
    photograph("02-calendar")

    // ポチポチ入力, on today rather than the month's first day.
    val today = LocalDate.now().let { "${it.monthValue}月${it.dayOfMonth}日" }
    device.tap(By.text("ポチポチ入力"), By.text("完了"))
    device.tap(By.desc(Pattern.compile("$today、.*")), By.desc("入力する日付：$today"))
    photograph("01-entry")
    device.tap(By.text("完了"), By.text("ポチポチ入力"))

    device.tap(By.desc("この月のシフトを保存"), By.text("端末カレンダーに追加"))
    device.tap(By.text("端末カレンダーに追加"), By.text("追加先"))
    device.tap(By.text("自動で反映"), By.textStartsWith("アプリを開いたときに反映します"))
    photograph("03-device-calendar")
    device.back(By.text("追加先"))

    app.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("pochical://invite/$invite")).setPackage(PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    val name = By.clazz("android.widget.EditText")
    device.tap(By.text("名前を入れてください"), name)
    device.find(name).text = "佐藤"
    device.tap(By.desc("閉じる"), By.text("参加する"))
    device.tap(By.text("参加する"), By.text("全体チャット"))
    // The table once the group shows 佐藤's shifts too, sent from this device.
    device.tap(By.text("月で見る"), By.desc(Pattern.compile(".*佐藤：(日勤|夜勤|明け|休み).*")))
    photograph("05-group-shifts")
    device.back(By.text("一覧"))

    // The chat from its first line, the words about the mobile battery in the middle.
    device.tap(By.text("全体チャット"), By.text("メッセージ"))
    // A page up, scrolled as a screen reader does, shows the seeded chat's first line: a finger's drag
    // would leave the day floating over the lines for a while after.
    val lines = checkNotNull(scrollable(instrumentation.uiAutomation.rootInActiveWindow)) { "No lines to scroll" }
    check(lines.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_UP.id)) { "The lines did not scroll" }
    device.find(By.text("小林がグループに参加しました"))
    photograph("06-chat")
    device.back(By.text("メッセージ"))

    device.tap(By.text("設定"), By.text("スタイル"))
    device.tap(By.text("スタイル"), By.text("テーマ"))
    for (choice in listOf("墨", "ワントーン")) device.tap(By.text(choice), By.checked(true).hasChild(By.text(choice)))
    launch()
    device.find(calendar)
    photograph("07-calendar-sumi")
  }

  /** The app opened anew on its calendar, with a debug build's [options] (LaunchOptions). */
  private fun launch(vararg options: String) {
    val intent = Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    for (option in options) intent.putExtra(option, true)
    app.startActivity(intent)
  }

  /**
   * Leaves the device a user with nothing yet. An install is not one by itself: the session comes
   * back from Block Store (spec/sync-protocol.md, Signing in), a run before's, with its group, or
   * one the server no longer knows. It is let go of as the person would, by ログアウト or はじめから使う.
   */
  private suspend fun becomeNewUser() {
    val before = account.state.first { it is AccountState.SignedIn || it == AccountState.SessionEnded }
    if (before is AccountState.SignedIn) account.signOut() else account.startAfresh()
    account.state.first { it is AccountState.SignedIn && it.userId != before.userId }
  }

  /** What scrolls first under [node], itself included. */
  private fun scrollable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? =
    if (node.isScrollable) node else (0 until node.childCount).firstNotNullOfOrNull { index -> node.getChild(index)?.let(::scrollable) }

  /** The screen as it is, kept as [name], once nothing on it moves. */
  private fun photograph(name: String) {
    device.waitForIdle()
    val file = File(checkNotNull(arguments.getString("additionalTestOutputDir")) { "No additionalTestOutputDir" }, "$name.png")
    check(device.takeScreenshot(file)) { "Could not photograph $name" }
  }
}
