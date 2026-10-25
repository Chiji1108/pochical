package app.pochical.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.width

/**
 * シンプル (/design's SimpleSmallView and SimpleMediumView; spec/widgets.md, Views): today alone,
 * large, and beside tomorrow in the 4×2.
 */
class SimpleWidget : PochicalWidget(previews = setOf(SMALL, MEDIUM)) {
  @Composable
  override fun Content(drawn: Drawn) {
    val entry = drawn.entry
    when {
      entry.nothingEntered -> FirstRun(drawn)
      // Two cells across or more is the medium one.
      LocalSize.current.width >= MEDIUM_WIDTH ->
        Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
          SimpleDay(entry.today, drawn, GlanceModifier.defaultWeight().fillMaxHeight().opening(dayLink(entry.today.date)))
          Spacer(GlanceModifier.width(16.dp))
          Box(GlanceModifier.width(1.dp).fillMaxHeight().background(drawn.colors.line)) {}
          Spacer(GlanceModifier.width(16.dp))
          val tomorrow = entry.upcoming[1]
          SimpleDay(tomorrow, drawn, GlanceModifier.defaultWeight().fillMaxHeight().opening(dayLink(tomorrow.date)), label = drawn.words.tomorrow)
        }
      else -> SimpleDay(entry.today, drawn, GlanceModifier.fillMaxSize().opening(dayLink(entry.today.date)))
    }
  }
}

/** Where a widget is two cells across or more: a medium one's room. */
val MEDIUM_WIDTH = 250.dp

/** Where a widget is taller, as on most launchers, its marks grow. */
private val ROOMY = 150.dp

/**
 * A day plainly: its date (or a word over tomorrow), its mark large, and only what changed under
 * it, one group in the middle of its room. A day with nothing changed closes up round a larger mark.
 */
@Composable
private fun SimpleDay(day: WidgetDay, drawn: Drawn, modifier: GlanceModifier, label: String? = null) {
  val colors = drawn.colors
  val said = day.news
  val named = drawn.named && day.pattern != null
  val base = if (LocalSize.current.height >= ROOMY) 64.dp else 48.dp
  val size = (if (said != null) base else base + 12.dp) - (if (named) NAME_ROOM + 2.dp else 0.dp)
  Column(modifier.spoken(day, drawn.words), verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally) {
    NoteStroke(day.noted, colors.noteMarker) {
      if (label != null) {
        Words(if (drawn.english) label.uppercase() else label, colors.secondary, if (drawn.english) 11.sp else 13.sp, bold = !drawn.english)
      } else {
        Words(drawn.words.shortDate(day.date), colors.words, 17.sp, bold = true)
      }
    }
    Spacer(GlanceModifier.height(12.dp))
    DayMark(day, drawn, size, named = named, large = true)
    if (said != null) {
      Spacer(GlanceModifier.height(12.dp))
      Words(said, colors.secondary, 15.sp)
    }
  }
}

class SimpleWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget = SimpleWidget()
}
