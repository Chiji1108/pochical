package app.pochical.kit

import android.Manifest
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pochical.v1.DayField
import app.pochical.v1.pattern
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Sync end to end against the server `mise run server` runs on this computer, which the emulator
 * reaches at 10.0.2.2 (the `server` instrumentation argument): two devices of one anonymous user,
 * each with its own database and session in Block Store, the second given the first's session as a
 * new phone restored from it would be.
 */
@RunWith(AndroidJUnit4::class)
class LocalServerTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private val server = InstrumentationRegistry.getArguments().getString("server")!!.toHttpUrl()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val http = OkHttpClient()

  private inner class Device(name: String) {
    val database = AppDatabase.open(context, inMemory = true)
    val sessions = SessionStore(BlockStoreBytes(context, "e2e-$name").apply { runBlocking { forget() } })
    val edits = OwnEdits(database)
    val account = SyncAccount(database, sessions, server, http, scope, linePhotos = linePhotos(context, http, server, name))

    suspend fun note(date: String) = database.values().days(date, date).first().singleOrNull()?.note
  }

  init {
    // The computer the emulator runs on is the local network (kit/src/debug/AndroidManifest.xml).
    InstrumentationRegistry.getInstrumentation()
      .uiAutomation
      .grantRuntimePermission(context.packageName, Manifest.permission.ACCESS_LOCAL_NETWORK)
  }

  /** The devices' settings files, gone with the test. */
  private val settingsFiles = java.io.File(context.cacheDir, "e2e-settings")

  @After
  fun end() {
    scope.cancel()
    settingsFiles.deleteRecursively()
  }

  @Test
  fun anEditGoesThroughTheServerToTheUsersOtherDevice() = runBlocking<Unit> {
    val date = "2026-10-23"
    val phone = Device("phone")
    phone.account.foreground()
    withTimeout(20_000) { phone.account.userSocket.first { it == SocketState.Current } }
    val session = phone.sessions.read()!!
    Log.i(TAG, "Phone signed in as ${session.userId}, socket current")

    phone.edits.setDay(date, DayField.DAY_FIELD_NOTE, "電話から")
    withTimeout(20_000) { phone.database.sync().lastWaiting().first { it == null } }
    val cursor = phone.database.write { state().cursor }
    Log.i(TAG, "Phone's edit acknowledged; shown as the server's at cursor $cursor")
    assertEquals("電話から", phone.note(date))

    val tablet = Device("tablet")
    tablet.sessions.write(session)
    tablet.account.foreground()
    withTimeout(20_000) { while (tablet.note(date) != "電話から") delay(50) }
    Log.i(TAG, "Tablet caught up with the phone's edit")

    tablet.edits.setDay(date, DayField.DAY_FIELD_NOTE, "タブレットから")
    withTimeout(20_000) { while (phone.note(date) != "タブレットから") delay(50) }
    Log.i(TAG, "Phone took the tablet's edit while open")
  }

  @Test
  fun aShiftEnteredWithItsNextDayReachesTheUsersOtherDevice() = runBlocking<Unit> {
    val night = LocalDate.parse("2026-11-02")
    val after = night.plusDays(1)
    val phone = Device("entering")
    phone.account.foreground()
    withTimeout(20_000) { phone.account.userSocket.first { it == SocketState.Current } }
    phone.edits.savePattern("night", pattern {
      name = "夜勤"
      emoji = "🌙"
      symbol = "夜"
      icon = "moon"
      nextDay = "after"
    })
    phone.edits.savePattern("after", pattern {
      name = "明け"
      emoji = "🌅"
      symbol = "明"
      icon = "sunHorizon"
    })
    phone.edits.enter("night", night)
    withTimeout(20_000) { phone.database.sync().lastWaiting().first { it == null } }
    Log.i(TAG, "Phone entered 夜勤 on $night, its 明け with it, acknowledged")

    val tablet = Device("entering-tablet")
    tablet.sessions.write(phone.sessions.read()!!)
    tablet.account.foreground()
    val shown =
      withTimeout(20_000) {
        tablet.database.values().ownCalendar().first { it.shown(night, after).size == 2 }.shown(night, after)
      }
    assertEquals(mapOf(night to ShownDay("night"), after to ShownDay("after")), shown)
    Log.i(TAG, "Tablet shows 夜勤 and 明け")
  }

  @Test
  fun patternsReorderedAndArchivedReachTheUsersOtherDevice() = runBlocking<Unit> {
    val phone = Device("patterns")
    phone.account.foreground()
    withTimeout(20_000) { phone.account.userSocket.first { it == SocketState.Current } }
    for (ready in readyCopies(listOf("day", "night", "after", "off"))) {
      phone.edits.savePattern(ready.id, pattern {
        name = ready.name
        emoji = ready.emoji
        symbol = ready.symbol
        icon = ready.icon
        color = ready.color
        ready.nextDay?.let { nextDay = it }
      })
    }
    phone.edits.orderPatterns(listOf("off", "day", "night", "after"))
    phone.edits.savePattern("after", pattern {
      name = "明け"
      emoji = "🌅"
      symbol = "明"
      icon = "sunHorizon"
      archived = true
    })
    withTimeout(20_000) { phone.database.sync().lastWaiting().first { it == null } }
    Log.i(TAG, "Phone reordered its patterns and archived 明け, acknowledged")

    val tablet = Device("patterns-tablet")
    tablet.sessions.write(phone.sessions.read()!!)
    tablet.account.foreground()
    val patterns = withTimeout(20_000) { tablet.database.values().patterns().first { it.size == 4 } }
    assertEquals(listOf("off" to false, "day" to false, "night" to false, "after" to true), patterns.map { it.id to it.archived })
    Log.i(TAG, "Tablet lists them in the phone's order, 明け archived")
  }

  @Test
  fun aRepeatingOrderFillsTheOtherDevicesDays() = runBlocking<Unit> {
    val phone = Device("orders")
    phone.account.foreground()
    withTimeout(20_000) { phone.account.userSocket.first { it == SocketState.Current } }
    val ids = listOf("duty", "offDuty", "off")
    val start = LocalDate.parse("2026-11-01")
    phone.edits.changeJob(readyCopies(ids), ids, start, start, "JP")
    phone.edits.setHolidaysOff(true, start = start)
    withTimeout(20_000) { phone.database.sync().lastWaiting().first { it == null } }
    Log.i(TAG, "Phone changed jobs to 当番・非番・休み from $start, holidays off, acknowledged")

    val tablet = Device("orders-tablet")
    tablet.sessions.write(phone.sessions.read()!!)
    tablet.account.foreground()
    val calendar = withTimeout(20_000) { tablet.database.values().ownCalendar().first { it.orders.isNotEmpty() && it.patterns.size == 3 } }
    val shown = calendar.shown(start, start.plusDays(3))
    assertEquals(listOf("duty", "offDuty", "off", "duty"), (0L..3L).map { shown.getValue(start.plusDays(it)).shift })
    assertEquals(listOf(true to "off"), calendar.orders.map { it.holidaysOff to it.holidayShift })
    Log.i(TAG, "Tablet shows the order's days")
  }

  @Test
  fun preferencesReachTheUsersOtherDeviceAndItsOwnStayHome() = runBlocking<Unit> {
    fun Device.settings() =
      SyncedSettings(
        deviceSettingsStore(java.io.File(settingsFiles, "${java.util.UUID.randomUUID()}.json"), scope),
        database,
        edits,
        scope,
      )
    val phone = Device("preferences")
    val phoneSettings = phone.settings()
    phone.account.foreground()
    withTimeout(20_000) { phone.account.userSocket.first { it == SocketState.Current } }
    phoneSettings.change {
      it.copy(
        themeId = "zen",
        appearance = Appearance.Dark,
        week = it.week.copy(start = 1, saturday = false),
        heading = it.heading.copy(english = true),
        look = it.look.copy(style = MarkStyle.Emoji).withOffLook(OffLook.Blank, "off", listOf("off")),
      )
    }
    val sent = setOf("heading", "look", "theme", "week")
    withTimeout(20_000) { phone.database.values().preferences().first { rows -> rows.map { it.key }.toSet() == sent } }
    withTimeout(20_000) { phone.database.sync().lastWaiting().first { it == null } }
    Log.i(TAG, "Phone set 禅, Monday weeks, English headings and emoji with 休み blank, acknowledged")

    val tablet = Device("preferences-tablet")
    val tabletSettings = tablet.settings()
    tablet.sessions.write(phone.sessions.read()!!)
    tablet.account.foreground()
    val taken = withTimeout(20_000) { tabletSettings.settings.first { it.themeId == "zen" } }
    assertEquals(Week(start = 1, saturday = false), taken.week)
    assertEquals(true, taken.heading.english)
    assertEquals(OffLook.Blank, taken.look.options.offLook("off"))
    assertEquals(Appearance.System, taken.appearance)
    Log.i(TAG, "Tablet took the phone's preferences and kept its own 外観")
  }

  @Test
  fun aGroupsMembersAndTheirSharedDaysComeOnItsSocket() = runBlocking<Unit> {
    val date = "2026-10-24"
    val phone = Device("group")
    phone.account.foreground()
    withTimeout(20_000) { phone.account.userSocket.first { it == SocketState.Current } }
    val session = phone.sessions.read()!!
    phone.edits.setDay(date, DayField.DAY_FIELD_PATTERN, "night")

    // GroupService's calls come with the screens that make groups (POC-209); Connect takes JSON too.
    val created =
      http
        .newCall(
          Request.Builder()
            .url(server.resolve("/pochical.v1.GroupService/CreateGroup")!!)
            .header("Authorization", "Bearer ${session.token}")
            .post(
              """{"name":"家族","mark":{"emoji":"🏠"},"displayName":"母","requestId":"${java.util.UUID.randomUUID()}"}"""
                .toRequestBody("application/json".toMediaType())
            )
            .build()
        )
        .execute()
        .use { it.body.string() }
    val groupId = Regex(""""groupId"\s*:\s*"([^"]+)"""").find(created)!!.groupValues[1]
    Log.i(TAG, "Made group $groupId")

    withTimeout(20_000) { phone.database.values().groups().first { groups -> groups.any { it.id == groupId } } }
    Log.i(TAG, "The user's socket listed the group")
    val hold = phone.account.hold(groupId)
    val members = withTimeout(20_000) { phone.database.values().members(groupId).first { it.isNotEmpty() } }
    assertEquals(listOf(session.userId to "母"), members.map { it.userId to it.displayName })
    val days =
      withTimeout(20_000) { phone.database.values().memberDays(groupId, date, date).first { it.isNotEmpty() } }
    assertEquals("night", days.single().pattern)
    Log.i(TAG, "The group's socket brought its member and their shared day")
    hold.release()
  }

  private companion object {
    const val TAG = "PochicalE2E"
  }
}
