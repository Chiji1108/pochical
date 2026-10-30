package app.pochical.widgets

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.view.ViewStub
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import androidx.test.core.app.ApplicationProvider
import app.pochical.kit.DeviceSettings
import app.pochical.kit.Look
import app.pochical.kit.MarkOptions
import app.pochical.kit.MarkStyle
import app.pochical.kit.OffLook
import app.pochical.kit.TimeChange
import app.pochical.kit.Week
import app.pochical.kit.WidgetDay
import app.pochical.kit.readyCopies
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Glance draws a widget in at most 500 views (its TotalViewCount) and fails to draw one past them,
 * leaving the launcher's widget unable to load (#1059). Every kind is drawn here at every size, in
 * every mark style, names on and off, alone and set to someone, at its fullest: every day noted,
 * off on its tile, its hours moved at both ends, in a month of six weeks with today in it. Each
 * must stay under [MOST], leaving room for what a day may show later. Before Android 12 Glance
 * spends more views on a view of a set size, so the views are counted there too.
 *
 * Each kind at each size is a case of its own, so each draws its 18 widgets well inside runTest's
 * minute, on a slow runner as on a computer (#1078).
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@Config(sdk = [30, 36])
class WidgetViewCountTest(@Suppress("unused") private val case: String, kind: Pair<PochicalWidget, DpSize>) {
  // A Pair, as DpSize alone is a value class, which the runner cannot hand a constructor.
  private val widget = kind.first
  private val size = kind.second
  private val context = ApplicationProvider.getApplicationContext<Context>()

  @Test
  fun staysWellUnderGlancesViews() = runTest {
    for (settings in settings()) for (entry in entries()) {
      val count = widget.preview(context, Drawn(entry, settings), size).apply(context, FrameLayout(context)).views()
      val drawn = "${widget.javaClass.simpleName} at $size in ${settings.look.style}, names ${settings.look.options.names}, with ${entry.with?.kind}"
      assertTrue("$drawn draws $count views, past $MOST of Glance's $GLANCE_VIEWS", count <= MOST)
    }
  }

  /** Every mark style, names on and off, days off on their tiles. */
  private fun settings(): List<DeviceSettings> =
    MarkStyle.entries.flatMap { style ->
      listOf(false, true).map { names ->
        val options = MarkOptions(names = names, off = OffLook.Highlight)
        DeviceSettings(look = Look(style = style, icon = options, emoji = options, badge = options))
      }
    }

  /** The sample's entry with every day at its fullest: alone, beside someone, and set to a group. */
  private fun entries(): List<WidgetEntry> {
    val sample = sampleWidgetEntry(TODAY.atTime(13, 0).atZone(ZoneId.systemDefault()), Week())
    val off = readyCopies(listOf("off")).single()
    fun WidgetDay.fullest() = copy(pattern = off, off = true, holiday = true, noted = true, timeChange = TimeChange(early = true, late = true), change = "7:00 – 20:00")
    val full =
      sample.copy(
        today = sample.today.fullest(),
        upcoming = sample.upcoming.map { it.fullest() },
        twoWeeks = sample.twoWeeks.map { it.fullest() },
        month = sample.month.map { week -> week.map { it.fullest() } },
      )
    val them = WidgetWith(WidgetWith.Kind.Person, "Sato", "group")
    val me = WidgetWith(WidgetWith.Kind.Person, "Me", "group")
    val paired = full.copy(with = them, pair = WidgetPair(them, me, full.upcoming.map { WidgetPairDay(it, together = true) }, "badge", true))
    return listOf(full, paired, full.copy(with = WidgetWith(WidgetWith.Kind.Group, "Ward", "group")))
  }

  /** The views drawn, without the stubs Glance leaves empty before Android 12. */
  private fun View.views(): Int =
    (if (this is ViewStub) 0 else 1) + ((this as? ViewGroup)?.let { group -> (0 until group.childCount).sumOf { group.getChildAt(it).views() } } ?: 0)

  companion object {
    /** Every kind at the 2×2, 4×2 and 4×4. */
    @JvmStatic
    @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
    fun cases(): List<Array<Any>> =
      listOf(SimpleWidget(), NextOffWidget(), UpcomingWidget(), CalendarWidget(), NowWidget()).flatMap { widget ->
        listOf(SMALL, MEDIUM, LARGE).map { arrayOf<Any>("${widget.javaClass.simpleName} ${it.width.value.toInt()}x${it.height.value.toInt()}", widget to it) }
      }

    /** A month of six weeks: August 2026, from Sunday. */
    val TODAY: LocalDate = LocalDate.of(2026, 8, 14)

    const val GLANCE_VIEWS = 500

    /** The most a widget may draw, a tenth under Glance's. */
    const val MOST = 450
  }
}
