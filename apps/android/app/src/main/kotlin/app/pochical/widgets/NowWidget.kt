package app.pochical.widgets

import android.os.SystemClock
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.layout.wrapContentSize
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import app.pochical.R
import app.pochical.calendar.slashText
import app.pochical.calendar.weekday
import app.pochical.calendar.weekdayName
import app.pochical.kit.OwnCalendar
import app.pochical.kit.WidgetNow
import app.pochical.kit.WidgetSpan
import java.time.Duration
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

// いまのシフト (iOS's NowWidget.swift; /design's NowSmall; spec/widgets.md, Views): how long the
// shift on now runs, else how soon the next one with hours starts, for long shifts like 当番. The
// counts go on as the launcher's chronometer keeps them; the ring, which no RemoteViews drains by
// itself, is drawn again a step at a time (RING_STEP), and the entry at its turns.

/** いまのシフト: small, as on the iPhone. */
class NowWidget : PochicalWidget(previews = setOf(SMALL)) {
  override fun turn(calendar: OwnCalendar, at: ZonedDateTime): ZonedDateTime = calendar.widgetNow(at).redrawn

  @Composable
  override fun Content(drawn: Drawn) {
    val entry = drawn.entry
    if (entry.nothingEntered) return FirstRun(drawn)
    val now = entry.now
    val words = NowWords(drawn.english, now.at)
    val span = now.on ?: now.next
    Box(
      GlanceModifier.fillMaxSize().opening(dayLink(span?.day?.date ?: entry.date)).semantics { contentDescription = words.spoken(now) },
      contentAlignment = Alignment.Center,
    ) {
      when {
        now.on != null -> On(now.on!!, now, drawn, words)
        now.next != null -> Next(now.next!!, now, drawn, words)
        else -> Words(words.none, drawn.colors.secondary, 13.sp, center = true, maxLines = 2)
      }
    }
  }
}

class NowWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget = NowWidget()
}

/** How often the ring is drawn again while a shift is on: the steps it drains in. */
val RING_STEP: Duration = Duration.ofMinutes(15)

/**
 * When いまのシフト is next drawn again: at the entry's turn, or sooner at the ring's next step while
 * a shift is on, counted from its start.
 */
val WidgetNow.redrawn: ZonedDateTime
  get() {
    val on = on ?: return refresh
    val steps = Duration.between(on.start, at).toMillis() / RING_STEP.toMillis() + 1
    return minOf(refresh, on.start.plus(RING_STEP.multipliedBy(steps)))
  }

/** What is left of [span] at [at], 1 as it starts and 0 as it ends, to the hundredth, so its pictures are a few. */
private fun ringShare(span: WidgetSpan, at: ZonedDateTime): Float {
  val left = Duration.between(at, span.end).toMillis().toFloat() / Duration.between(span.start, span.end).toMillis()
  return (left.coerceIn(0f, 1f) * 100).roundToInt() / 100f
}

/** On a shift: what is left of it as a ring round its mark, and centered under it the time left and when it ends. */
@Composable
private fun On(span: WidgetSpan, now: WidgetNow, drawn: Drawn, words: NowWords) {
  val context = LocalContext.current
  // Smaller where a launcher's 2×2 is short, so the words under it keep their room.
  val side = (innerSize.height - 46.dp).coerceIn(48.dp, 76.dp)
  Column(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally) {
    // The ring says 勤務中 and its mark which shift, so no heading says them again.
    Box(GlanceModifier.size(side), contentAlignment = Alignment.Center) {
      Image(ImageProvider(ringPicture(context, side, 1f)), null, GlanceModifier.size(side), colorFilter = ColorFilter.tint(drawn.colors.line))
      Image(ImageProvider(ringPicture(context, side, ringShare(span, now.at))), null, GlanceModifier.size(side), colorFilter = ColorFilter.tint(drawn.colors.mark(drawn.slot(span.day))))
      DayMark(span.day, drawn, if (drawn.named) 34.dp - NAME_ROOM else 34.dp, named = drawn.named)
    }
    Spacer(GlanceModifier.height(8.dp))
    // The words centered under it, one group with it.
    Countdown(now.at, span.end, words.left, 15.sp)
    Words(words.until(span), drawn.colors.secondary, 13.sp, center = true)
  }
}

/** No shift on: the next with hours, how soon (counting down within countdownHours, else the day), and when it starts. */
@Composable
private fun Next(span: WidgetSpan, now: WidgetNow, drawn: Drawn, words: NowWords) {
  val inDays = now.nextInDays
  val colors = drawn.colors
  Column(GlanceModifier.fillMaxSize()) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      DayMark(span.day, drawn, 18.dp)
      Spacer(GlanceModifier.width(4.dp))
      Words(words.next(span.day.pattern?.name.orEmpty()), colors.secondary, 13.sp)
    }
    Spacer(GlanceModifier.defaultWeight())
    if (inDays != null) {
      Words(drawn.words.inDays(inDays), colors.words, 36.sp, bold = true)
    } else {
      // The countdown large, with あと over it (left after it in English).
      if (!words.english) Words("あと", colors.secondary, 13.sp, bold = true)
      Countdown(now.at, span.start, "%s", 30.sp)
      if (words.english) Words("left", colors.secondary, 13.sp, bold = true)
    }
    Spacer(GlanceModifier.defaultWeight())
    Words(words.from(span), colors.secondary, 13.sp)
  }
}

/**
 * The time from [at], the entry's moment, until [end], counting down by itself as the launcher's
 * chronometer keeps it (Glance has none of its own), in [format] round it, bold in the words' color.
 * The entry is made as it is drawn, so its moment is the clock's as the chronometer is set; kept
 * for that moment, so drawing the same entry again later does not count the time since twice.
 */
@Composable
private fun Countdown(at: ZonedDateTime, end: ZonedDateTime, format: String, size: TextUnit) {
  val context = LocalContext.current
  val base = remember(at, end) { SystemClock.elapsedRealtime() + Duration.between(at, end).toMillis() }
  val views =
    RemoteViews(context.packageName, R.layout.widget_countdown).apply {
      setChronometer(R.id.countdown, base, format, true)
      setChronometerCountDown(R.id.countdown, true)
      setTextViewTextSize(R.id.countdown, TypedValue.COMPLEX_UNIT_SP, size.value)
    }
  // Its own height: Glance would otherwise give the views all a column has.
  AndroidRemoteViews(views, GlanceModifier.wrapContentSize())
}

/** The words of いまのシフト, in Japanese or English, the days counted from [at]'s. */
private class NowWords(val english: Boolean, private val at: ZonedDateTime) {
  private val words = WidgetWords(english)

  /** Round the chronometer's time left: あと3:12:05, 3:12:05 left. */
  val left = if (english) "%s left" else "あと%s"

  fun on(name: String) = if (english) "$name now" else "${name}中"

  fun next(name: String) = if (english) "Next: $name" else "次は$name"

  val none = if (english) "No shifts with\nhours ahead" else "これからの勤務は\nまだ入っていません"

  /** When a shift ends: 18:00まで, 翌8:30まで past midnight. */
  fun until(span: WidgetSpan): String {
    val later = days(span.end) > 0
    val clock = clock(span.end)
    return if (english) "Until $clock${if (later) " tomorrow" else ""}" else "${if (later) "翌" else ""}${clock}まで"
  }

  /** When the next one starts: 8:30から today, 明日 8:30から, else its date short, 9/26(土), to keep to one line. */
  fun from(span: WidgetSpan): String {
    val inDays = days(span.start)
    val clock = clock(span.start)
    val date = span.day.date
    if (english) return if (inDays == 0) "From $clock" else "${if (inDays == 1) "Tomorrow" else words.date(date)} $clock"
    if (inDays == 0) return "${clock}から"
    val day = if (inDays == 1) "明日" else "${date.slashText}(${weekdayName(date.weekday, false)})"
    return "$day ${clock}から"
  }

  /** The whole of it as read aloud, the times as at the entry's moment. */
  fun spoken(now: WidgetNow): String {
    val separator = if (english) ", " else "、"
    now.on?.let { return listOf(on(it.day.pattern?.name.orEmpty()), until(it)).joinToString(separator) }
    val next = now.next ?: return none.replace("\n", if (english) " " else "")
    return listOfNotNull(next(next.day.pattern?.name.orEmpty()), now.nextInDays?.let(words::inDays), from(next)).joinToString(separator)
  }

  private fun days(moment: ZonedDateTime) = ChronoUnit.DAYS.between(at.toLocalDate(), moment.toLocalDate()).toInt()

  /** A time as the widgets write one: 8:30, 18:00. */
  private fun clock(moment: ZonedDateTime) = "${moment.hour}:${"%02d".format(moment.minute)}"
}
