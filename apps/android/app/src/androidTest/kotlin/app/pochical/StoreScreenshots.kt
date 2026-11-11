package app.pochical

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import app.pochical.kit.AccountState
import app.pochical.kit.PhotoShelf
import app.pochical.kit.PochicalKit
import app.pochical.walk.PACKAGE
import app.pochical.walk.WAIT
import app.pochical.walk.WAIT
import app.pochical.walk.back
import app.pochical.walk.find
import app.pochical.walk.tap
import app.pochical.widgets.CalendarWidget
import app.pochical.widgets.ChoiceGroup
import app.pochical.widgets.LARGE
import app.pochical.widgets.MEDIUM
import app.pochical.widgets.NextOffWidget
import app.pochical.widgets.NowWidget
import app.pochical.widgets.PochicalWidget
import app.pochical.widgets.SMALL
import app.pochical.widgets.SimpleWidget
import app.pochical.widgets.UpcomingWidget
import app.pochical.widgets.WidgetChoice
import app.pochical.widgets.choiceGroups
import app.pochical.widgets.picture
import coil3.SingletonImageLoader
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.regex.Pattern
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The screens the stores' screenshots are made of (#806), photographed as they are on an emulator
 * in the order the app is walked rather than the stores': the sample month as a new user's, its day of
 * 早出 opened and リマインド's reminder of the evening before, who
 * joins the groups tools/store-screenshots/seed.ts made, the friends' as まい and the coworkers' as 佐藤; a page of a シフトの期間 from the 15th; the widgets, each kind by itself at
 * each size it offers, those that can be set to someone also set to the group's first member and
 * to the group; the month and the widgets in 墨, in black and white ([Style.Sumi]), and the month with its shifts as
 * letters ([Style.Letters]); then, as
 * they change the month's days, ポチポチ入力 halfway through it, as the app starts again, and
 * いまのシフト's widget once more with a shift on; as it changes the job, 繰り返しを直す on a
 * fixed cycle; and last, as it leaves a group, グループの設定 of one made with an end. Each is
 * kept under the name packages/prototype/src/lib/store-shots.ts gives it. Run by
 * `mise run store:shots:android` (tools/store-screenshots/android.sh), which sets the emulator up,
 * names the invitations (the arguments `invite`, the coworkers', and `friends`) and takes the PNGs from where Gradle pulls them
 * (`additionalTestOutputDir`); skipped in any other run.
 */
@RunWith(AndroidJUnit4::class)
class StoreScreenshots {
  private val arguments = InstrumentationRegistry.getArguments()
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val device = UiDevice.getInstance(instrumentation)
  private val app = instrumentation.targetContext.applicationContext
  private val account = (app as PochicalKit.Holder).pochicalKit.account
  private val out by lazy { File(checkNotNull(arguments.getString("additionalTestOutputDir")) { "No additionalTestOutputDir" }) }

  /**
   * A look of the app, by the choices of 設定's スタイル that give it, in the page's order (シフトの見た目,
   * テーマ, シフトの色, 休みの見せ方), and whether カレンダー's 色をつける日 are on.
   */
  private enum class Style(val shape: String, val theme: String, val colors: String, val off: String, val coloredDays: Boolean) {
    /** As the app starts. */
    Started("塗り", "ポチカル", "色分け", "強調", coloredDays = true),

    /** 墨 with nothing colored and nothing filled: black and white. */
    Sumi("線", "墨", "ワントーン", "印だけ", coloredDays = false),

    /** The shifts as letters, each in its color, in ソーダ. */
    Letters("文字", "ソーダ", "色分け", "印だけ", coloredDays = true),
  }

  @Test
  fun photographsTheScreens() {
    val invite = arguments.getString("invite")
    val friends = arguments.getString("friends")
    assumeTrue("Only when asked for, by mise run store:shots:android", invite != null && friends != null)
    // The server on the emulator's host, and the device's calendars, as the person would allow them.
    for (permission in listOf("ACCESS_LOCAL_NETWORK", "READ_CALENDAR", "WRITE_CALENDAR")) {
      device.executeShellCommand("pm grant $PACKAGE android.permission.$permission")
    }
    showTime(LocalTime.now())
    launch()
    runBlocking { becomeNewUser() }
    launch("sample", "firstRunDone")
    val calendar = By.descContains("、夜勤")
    device.find(calendar)

    photographCares()
    launch("sample", "firstRunDone")
    device.find(calendar)

    device.tap(By.desc("この月のシフトを保存"), By.text("端末カレンダーに追加"))
    device.tap(By.text("端末カレンダーに追加"), By.text("追加先"))
    turnOn("自動で反映")
    photograph("06-device-calendar")
    device.back(By.text("追加先"))

    // The friends' group first, as まい with ひよこ for a face, the usual ones from then on.
    join(checkNotNull(friends), "まい", shown = "名前を入れてください", face = "ひよこ")
    awaitFaces(FRIENDS)
    // The table, by its month's name, which the hub has none of, once the group shows まい's shifts
    // too, sent from this device: the hub's week says them as the table does.
    device.find(By.desc(Pattern.compile(".*まい：(日勤|夜勤|明け|休み).*")))
    device.tap(By.text("月で見る"), By.text(Pattern.compile("\\d+年\\d+月")))
    photograph("03-group-shifts")

    // The coworkers' from the calendar again, so the only group in sight after is theirs: as 佐藤 there alone.
    launch("sample", "firstRunDone")
    device.find(calendar)
    join(checkNotNull(invite), "佐藤", shown = "まい")
    awaitFaces(COWORKERS)

    // The chat, which the seed writes once 佐藤 is in, so every joining is said above its lines: read
    // down to the latest, the poll with its votes, a page at a time as a screen reader scrolls (a
    // finger's drag would leave the day floating over the lines for a while after),
    val votes = By.descEndsWith("に行ける人：森、小林")
    device.tap(By.text("全体チャット"), By.text("メッセージ"))
    repeat(CHAT_PAGES) {
      if (device.wait(Until.hasObject(votes), WAIT)) return@repeat
      checkNotNull(scrollable(instrumentation.uiAutomation.rootInActiveWindow)) { "No lines to scroll" }
        .performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_DOWN.id)
    }
    device.find(votes)
    // and opened again, as it is with nothing new in it: on its latest line. The clock, two minutes after the lines.
    device.back(By.text("メッセージ"))
    device.tap(By.text("全体チャット"), votes)
    check(!device.hasObject(By.text("ここから新着"))) { "The chat still has new lines" }
    showTime(LocalTime.now().plusMinutes(2))
    photograph("04-chat")
    device.back(By.text("メッセージ"))

    // A month that runs from the 15th, the page holding today, and the month put back.
    pickPeriod("15日〜翌月14日")
    launch()
    device.find(calendar)
    // The page's heading, with the room over it that it has at its side, and the week its first day is in.
    val first = LocalDate.now().let { if (it.dayOfMonth < 15) it.minusMonths(1) else it }.withDayOfMonth(15)
    val heading = device.find(By.descContains("日〜")).visibleBounds
    photograph("07-details-period", top = heading.top - heading.left, foot = topOf(dayOf(first.plusDays(7))))
    pickPeriod("1日〜末日")

    photographWidgets("02-widgets")
    pick(Style.Sumi)
    launch()
    device.find(calendar)
    photograph("05-calendar-sumi")
    photographWidgets("02-widgets-sumi")

    pick(Style.Letters)
    launch()
    device.find(calendar)
    photograph("05-calendar-letters")

    pick(Style.Started)
    launch()
    device.find(calendar)
    enterHalfTheMonth()
    photograph("01-entry")
    // 夜勤 entered brings the next day's 明け.
    val month = LocalDate.now().monthValue
    device.tap(By.text("夜勤"), By.desc(Pattern.compile("${month}月${HALF + 1}日、明け.*")))
    // The week of the two days.
    val entered = LocalDate.now().withDayOfMonth(HALF)
    photograph("07-details-next-day", top = topOf(dayOf(entered)), foot = topOf(dayOf(entered.plusDays(7))))
    enterShiftOn()
    photographWidgets("02-widgets", only = "now")
    // Out of ポチポチ入力 as the app starts again: its 完了 would ask about the days left blank.
    launch("sample", "firstRunDone")
    device.find(calendar)

    startFixedCycle()
    // The month's name and its first two weeks, the cycle come round in them.
    photograph(
      "07-details-repeat",
      top = topOf(By.desc(Pattern.compile("\\d+年\\d+月"))),
      foot = topOf(dayOf(LocalDate.now().plusMonths(1).withDayOfMonth(1).plusDays(14))),
    )

    // After everything else, as it leaves a group. The calendar, next shown after 新しい仕事にする set
    // up a repeating order, offers the reminders once: あとで.
    launch("sample", "firstRunDone")
    device.tap(By.text("あとで"), Until.gone(By.text("あとで")))
    makeGroupWithEnd()
    // The section グループ's rows and what is said under them, from under its name to the section after it.
    photograph(
      "08-cares-group-end",
      top = between(By.text("グループ"), By.text("忘年会")),
      foot = between(By.textStartsWith("グループ名とアイコンは"), By.text("このグループでのあなた")),
    )
  }

  /**
   * What the cares' shot shows of the app as it starts: the sample's day of 早出 opened, which folds
   * the month to its week, and リマインド's reminder of the evening before, the next notification as
   * its page draws it.
   */
  private fun photographCares() {
    val month = LocalDate.now().monthValue
    val early = By.desc(Pattern.compile("${month}月${EARLY}日、日勤、早出.*"))
    val opened = By.textStartsWith("${month}月${EARLY}日(")
    device.tap(early, opened)
    // From under the month's name, the weekdays and the day's week, down to the day's own name.
    photograph("08-cares-hours", top = device.find(By.desc(Pattern.compile("\\d+年\\d+月"))).visibleBounds.bottom, foot = between(early, opened))
    device.tap(By.desc("閉じる"), By.text("ポチポチ入力"))

    device.tap(By.text("設定"), By.text("リマインド"))
    device.tap(By.text("リマインド"), By.text("リマインドを追加"))
    device.tap(By.textStartsWith("前日"), By.text("リマインドを編集"))
    // The notification under its heading, with the room around them that it has at its sides.
    val banner = device.find(By.descStartsWith("明日は")).visibleBounds
    photograph("08-cares-reminder", top = topOf(By.textStartsWith("次の通知")) - banner.left, foot = banner.bottom + banner.left)
  }

  /**
   * Makes a group with an end, 忘年会, in グループを作る with 終了日をつける on, the day it offers a month
   * from today, and opens グループの設定 on it.
   */
  private fun makeGroupWithEnd() {
    device.tap(By.text("グループ"), By.desc("グループを作る"))
    device.tap(By.desc("グループを作る"), By.text("作る"))
    device.find(By.clazz("android.widget.EditText")).text = "忘年会"
    device.tap(By.text("終了日"), By.text("終了日をつける"))
    device.tap(switch("終了日をつける", on = false), switch("終了日をつける", on = true))
    device.tap(By.text("保存"), Until.gone(By.text("終了日をつける")))
    device.tap(By.text("作る"), By.text("招待リンクを送る"))
    device.back(By.text("招待リンクを送る"))
    device.tap(By.desc("グループの設定"), By.text("このグループでのあなた"))
  }

  /**
   * Opens 繰り返しを直す on a fixed cycle of three days, 当務・非番・週休, in the month after this one:
   * the job changed in 設定 to the ready-made 当番・非番・休み, from next month's 1st as it offers,
   * then 当番 and 休み named as those who work the cycle call them. Last of all, as the days from
   * then on are the new job's.
   */
  private fun startFixedCycle() {
    device.tap(By.text("設定"), By.text("シフトパターン"))
    val steps = listOf(
      "シフトパターン" to "並び替え",
      "新しい仕事にする" to "新しい仕事の初日",
      "次へ" to "繰り返しがある",
      "繰り返しがある" to "当番・非番・休み",
      "当番・非番・休み" to "ほかにも使う勤務や休みはありますか？",
      "次へ" to "「当番」の日を押す",
      "完了" to "切り替える",
      "切り替える" to "使わなくなったパターン",
    )
    for ((step, shows) in steps) {
      reveal(By.text(step))
      device.tap(By.text(step), By.text(shows))
    }
    for ((name, called) in listOf("当番" to "当務", "休み" to "週休")) {
      device.tap(By.text(name), By.text("パターンを編集"))
      device.find(By.clazz("android.widget.EditText")).text = called
      // 保存 keeps the name the page last drew: pressed before the field shows the new one, it keeps the old (#1180).
      device.find(By.clazz("android.widget.EditText").text(called))
      device.tap(By.text("保存"), Until.gone(By.text("パターンを編集")))
      device.find(By.text(called))
    }
    device.back(By.text("並び替え"))
    device.tap(By.text("繰り返し"), By.text("新しい繰り返しを追加"))
    device.tap(By.descEndsWith("からの繰り返し"), By.text("カレンダーで直す"))
    // The page by its tray, which the period's page has none of.
    device.tap(By.text("カレンダーで直す"), By.text("翌日へ"))
  }

  /**
   * Joins the group of the invitation [code] as [name], typed in the row that shows [shown]: that a
   * name is needed, or once one was typed, that usual name. [face] names the drawing to show as
   * their photo, picked in place of the one a new person is given at random.
   */
  private fun join(code: String, name: String, shown: String, face: String? = null) {
    app.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("pochical://invite/$code")).setPackage(PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    val field = By.clazz("android.widget.EditText")
    device.tap(By.text(shown), field)
    if (face != null) {
      device.tap(By.desc("写真を編集"), By.text("イラストを選ぶ"))
      device.tap(By.text("イラストを選ぶ"), By.desc(face))
      device.tap(By.desc(face), Until.gone(By.desc(face)))
    }
    device.find(field).text = name
    device.tap(By.desc("閉じる"), By.text("参加する"))
    device.tap(By.text("参加する"), By.text("全体チャット"))
  }

  /** Picks [style] in 設定, as the person would: スタイル's choices, and カレンダー's 色をつける日. */
  private fun pick(style: Style) {
    device.tap(By.text("設定"), By.text("スタイル"))
    device.tap(By.text("スタイル"), By.text("テーマ"))
    for (choice in listOf(style.shape, style.theme, style.colors, style.off)) {
      if (choice == style.theme) showTheme(choice)
      reveal(By.text(choice))
      device.tap(By.text(choice), By.checked(true).hasChild(By.text(choice)))
    }
    device.back(By.text("テーマ"))
    // カレンダー's row, by what it says of the week: the tab is カレンダー too.
    device.tap(By.textContains("曜はじまり"), By.text("週の始まり"))
    for (day in listOf("土曜", "日曜", "祝日")) {
      reveal(By.text(day))
      device.tap(switch(day, !style.coloredDays), switch(day, style.coloredDays))
    }
    device.back(By.text("週の始まり"))
  }

  /**
   * Picks [period] as 設定 › カレンダー's シフトの期間, in its dialog: a list longer than the dialog,
   * dragged until the row is in sight, on from where it opens and then back.
   */
  private fun pickPeriod(period: String) {
    device.tap(By.text("設定"), By.text("スタイル"))
    device.tap(By.textContains("曜はじまり"), By.text("週の始まり"))
    reveal(By.text("1ページの期間"))
    device.tap(By.text("1ページの期間"), By.text("キャンセル"))
    val row = By.text(period)
    val (across, middle) = device.displayWidth / 2 to device.displayHeight / 2
    val reach = device.displayHeight / 4
    fun inSight() = device.findObject(row)?.visibleBounds?.let { it.height() > 0 && it.top > middle - reach && it.bottom < middle + reach } == true
    for (way in listOf(-1, 1)) {
      repeat(PERIOD_DRAGS) {
        if (inSight()) return@repeat
        device.swipe(across, middle, across, middle + way * reach, 20)
        device.waitForIdle()
      }
    }
    device.tap(row, Until.gone(By.text("キャンセル")))
    device.back(By.text("週の始まり"))
  }

  /**
   * Turns テーマ's pages, a few テーマ each, to the one holding [theme]: back to the first, then on, a
   * page a drag across the テーマ, over the pages' dots.
   */
  private fun showTheme(theme: String) {
    val dots = By.descStartsWith("テーマのページ")
    reveal(dots)
    if (device.hasObject(By.text(theme))) return
    val shown = device.find(dots)
    val turns = shown.contentDescription.substringAfterLast("/").trim().toInt() - 1
    val at = shown.visibleBounds.top - device.displayHeight / 20
    val (start, end) = device.displayWidth / 5 to device.displayWidth * 4 / 5
    // A page's テーマ are on it a moment after the drag that brought it.
    val there = Until.hasObject(By.text(theme))
    repeat(turns) { device.swipe(start, at, end, at, 20) }
    if (device.wait(there, WAIT / 5)) return
    repeat(turns) {
      device.swipe(end, at, start, at, 20)
      if (device.wait(there, WAIT / 5)) return
    }
  }

  /**
   * Turns on the switch named [name] by its own action, as a screen reader does. A finger's press
   * shades the row for a moment after it is let go, and nothing on the screen says when that has
   * gone, so a photograph taken next may hold it.
   */
  private fun turnOn(name: String) {
    val roots = instrumentation.uiAutomation.windows.mapNotNull { it.root }
    val row = checkNotNull(roots.firstNotNullOfOrNull { pressable(it, name) }) { "No switch named $name" }
    check(row.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK.id)) { "$name did not turn" }
    device.find(switch(name, on = true))
  }

  /** What takes a press nearest around the words [name], under [node] or itself. */
  private fun pressable(node: AccessibilityNodeInfo, name: String): AccessibilityNodeInfo? {
    val children = (0 until node.childCount).mapNotNull(node::getChild)
    return children.firstNotNullOfOrNull { pressable(it, name) } ?: node.takeIf { it.isClickable && says(it, name) }
  }

  /** Whether [node] or anything under it says [name]. */
  private fun says(node: AccessibilityNodeInfo, name: String): Boolean =
    node.text?.toString() == name || (0 until node.childCount).any { index -> node.getChild(index)?.let { says(it, name) } == true }

  /** The switch named [name], while it is [on] or off. */
  private fun switch(name: String, on: Boolean): BySelector = By.checked(on).hasDescendant(By.text(name))

  /** Brings [target] onto a settings page, none of them two screens tall: where the page does not show it yet, a page down. */
  private fun reveal(target: BySelector) {
    if (device.hasObject(target)) return
    // Dragged up through the middle of the screen, clear of its edges, where a drag is the system's.
    val (width, height) = device.displayWidth to device.displayHeight
    device.swipe(width / 2, height * 4 / 5, width / 2, height / 5, 40)
    device.find(target)
  }

  /**
   * ポチポチ入力 halfway through the month, as iOS's shot: the sample month's days from the 16th
   * taken out, as they are before they are entered, and the 16th the day to enter.
   */
  private fun enterHalfTheMonth() {
    val today = LocalDate.now()
    val month = today.monthValue
    fun pickDay(day: Int) = device.tap(By.desc(Pattern.compile("${month}月${day}日、.*")), By.desc("入力する日付：${month}月${day}日"))
    device.tap(By.text("ポチポチ入力"), By.text("完了"))
    pickDay(HALF)
    val last = today.lengthOfMonth()
    for (day in HALF..last) {
      // What the tray says once a key moved it on, or at the month's end.
      val moved = if (day < last) By.descEndsWith("${day + 1}日を選択中") else By.descStartsWith("${month}月${day}日、シフトを消しました")
      // 消す takes a tap only on a day with a shift: the sample's days are its repeating order's, each its own.
      if (device.hasObject(By.enabled(true).hasChild(By.text("消す")))) device.tap(By.text("消す"), moved) else if (day < last) device.tap(By.text("翌日へ"), moved)
    }
    pickDay(HALF)
  }

  /**
   * Enters, in ポチポチ入力, one of the sample's shifts that is on now, for いまのシフト's ring, which it
   * draws while a shift is on: 夜勤 (16:30 to 9:30 the next day) on the day before until 9:00, 日勤
   * (9:00 to 18:00) today until 18:00, and 夜勤 today after. After the screens that show the month.
   */
  private fun enterShiftOn() {
    val now = LocalDateTime.now()
    val on = if (now.hour < 9) now.toLocalDate().minusDays(1) else now.toLocalDate()
    val shift = if (now.hour in 9..17) "日勤" else "夜勤"
    val day = "${on.monthValue}月${on.dayOfMonth}日"
    device.tap(By.desc(Pattern.compile("$day、.*")), By.desc("入力する日付：$day"))
    device.tap(By.text(shift), By.desc(Pattern.compile("$day、$shift.*")))
  }

  /** The seed's group named [name], once the app holds its people with the photos they show. */
  private suspend fun seededGroup(name: String): ChoiceGroup =
    (app as PochicalApplication).widgetSources.values.choiceGroups()
      .mapNotNull { groups -> groups.firstOrNull { it.group.name == name && it.members.isNotEmpty() && it.members.all { member -> member.photoId.isNotEmpty() } } }
      .first()

  /**
   * Waits for the photos of the people of the group named [name] to have come to the app's image loader, which the
   * faces on its screens are drawn from: a face is its letter until its photo comes, and says
   * nothing of which it shows.
   */
  private fun awaitFaces(name: String) = runBlocking {
    val group = seededGroup(name)
    val loader = SingletonImageLoader.get(app)
    for (member in group.members) {
      checkNotNull(photoBitmap(app, loader, member.photoId, PhotoShelf.place(group.group.id), FACE_PX, WAIT)) { "${member.name}'s photo did not come" }
    }
  }

  /**
   * Every kind of widget by itself at each size it offers, as [folder]/<kind>-<size>.png, in the
   * look the app is in, from the days and the group the app holds: set to nobody, and those that
   * can be, to the group's first member (-person) and to the group itself (-group). [only] names
   * the one to photograph, when not all.
   */
  private fun photographWidgets(folder: String, only: String? = null) = runBlocking {
    val group = seededGroup(COWORKERS)
    val person = WidgetChoice.Member(group.group.id, group.members.first().userId)
    val widgets: List<Triple<String, PochicalWidget, WidgetChoice?>> =
      listOf(
        Triple("simple", SimpleWidget(), null),
        Triple("next-off", NextOffWidget(), null),
        Triple("next-off-person", NextOffWidget(), person),
        Triple("next-off-group", NextOffWidget(), WidgetChoice.Group(group.group.id)),
        Triple("upcoming", UpcomingWidget(), null),
        Triple("upcoming-person", UpcomingWidget(), person),
        Triple("calendar", CalendarWidget(), null),
        Triple("now", NowWidget(), null),
      )
    val sizes = mapOf(SMALL to "small", MEDIUM to "medium", LARGE to "large")
    for ((name, widget, choice) in widgets.filter { only == null || it.first == only }) {
      val drawn = widget.drawnNow(app, choice)
      // The seed's people each show a photo.
      check(choice !is WidgetChoice.Member || drawn.faces.with != null) { "$name has no photo of whom it is set to" }
      for (size in widget.previews) {
        val picture = withContext(Dispatchers.Main) { widget.picture(app, drawn, size) }
        val file = File(out, "$folder/$name-${sizes.getValue(size)}.png")
        checkNotNull(file.parentFile).mkdirs()
        file.outputStream().use { check(picture.compress(Bitmap.CompressFormat.PNG, 100, it)) { "Could not keep ${file.name}" } }
      }
    }
  }

  private companion object {
    /** The seed's groups, by their names. */
    const val COWORKERS = "職場のみんな"
    const val FRIENDS = "学生時代の友だち"

    /** More pages than the seed's chat is long. */
    const val CHAT_PAGES = 4

    /** How long a notification is put off for: longer than a run. */
    const val SNOOZE_MS = 3_600_000

    /** The drags that take シフトの期間's list from one end to the other, and more. */
    const val PERIOD_DRAGS = 12

    /** The sample's day of 早出 (SampleDays). */
    const val EARLY = 13

    /** The first day ポチポチ入力 has yet to enter. */
    const val HALF = 16

    /** A size to read a face's photo at, any: the loader keeps the file whatever is asked of it. */
    const val FACE_PX = 96
  }

  /**
   * Shows [time] in the status bar, by SystemUI's demo mode, which the script has it in, and waits
   * for the clock there to say its minute: it is drawn a little after it is told.
   */
  private fun showTime(time: LocalTime) {
    device.executeShellCommand("am broadcast -a com.android.systemui.demo -e command clock -e hhmm ${time.format(DateTimeFormatter.ofPattern("HHmm"))}")
    device.find(By.pkg("com.android.systemui").textEndsWith(time.format(DateTimeFormatter.ofPattern(":mm"))))
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

  /** Where what [selector] finds begins on the screen: a row's top, by one of its days. */
  private fun topOf(selector: BySelector): Int = device.find(selector).visibleBounds.top

  /** Midway from the foot of what [over] finds to the top of what [under] finds: where one piece of a page gives way to the next. */
  private fun between(over: BySelector, under: BySelector): Int = (device.find(over).visibleBounds.bottom + topOf(under)) / 2

  /** The calendar's day [date], whatever it holds: a day of the month before or after shows in the month's weeks too. */
  private fun dayOf(date: LocalDate): BySelector = By.desc(Pattern.compile("${date.monthValue}月${date.dayOfMonth}日、.*"))

  /**
   * The screen as it is, kept as [name], once the app's window has drawn what it holds: the words a
   * walk waits for are on a page before the page is on the screen, so a frame is asked of the
   * window and waited for until it is committed. With [top] and [foot], only the part between
   * them, as wide as the screen: whole rows of it, for a tile of a shot of them.
   */
  private fun photograph(name: String, top: Int = 0, foot: Int? = null) {
    // Android 17's status bar keeps the notifications' icons through the demo's
    // `notifications -e visible false`, and one may come at any time of a run: each there is
    // snoozed, and comes back by itself.
    for (key in device.executeShellCommand("cmd notification list").lines().filter { it.isNotBlank() }) {
      device.executeShellCommand("cmd notification snooze --for $SNOOZE_MS $key")
    }
    device.waitForIdle()
    val committed = CountDownLatch(1)
    instrumentation.runOnMainSync {
      val window = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).single().window.decorView
      window.viewTreeObserver.registerFrameCommitCallback { committed.countDown() }
      window.invalidate()
    }
    check(committed.await(WAIT, TimeUnit.MILLISECONDS)) { "No frame drawn for $name" }
    val screen = checkNotNull(instrumentation.uiAutomation.takeScreenshot()) { "Could not photograph $name" }
    val part = Bitmap.createBitmap(screen, 0, top, screen.width, (foot ?: screen.height) - top)
    File(out, "$name.png").outputStream().use { check(part.compress(Bitmap.CompressFormat.PNG, 100, it)) { "Could not keep $name" } }
  }
}
