package app.pochical.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.pochical.R
import app.pochical.calendar.weekday
import app.pochical.calendar.weekdayName

/**
 * 次の休み (/design's NextOffSmall; spec/widgets.md, Views): how soon the next day off comes, in
 * the 2×2 alone.
 */
class NextOffWidget : PochicalWidget() {
  @Composable
  override fun Content(drawn: Drawn) {
    val entry = drawn.entry
    val soonest = if (entry.offs.today) NextOff(entry.today, 0) else entry.offs.next
    // The day off it counts, else today; set to someone or a group, in the group's table.
    val modifier =
      GlanceModifier.fillMaxSize()
        .opening(drawn.link(soonest?.day?.date ?: entry.date))
        .semantics { contentDescription = spokenOff(soonest, drawn) }
    Box(modifier) {
      when {
        entry.nothingEntered -> FirstRun(drawn)
        entry.offs.today -> RestToday(drawn)
        else -> NextOffSmall(soonest, drawn)
      }
    }
  }
}

/** 次の休み, 一緒に休める日 with someone, or みんな休み with a group. */
private fun offTitle(with: WidgetWith?, english: Boolean): String =
  when (with?.kind) {
    null -> if (english) "Next day off" else "次の休み"
    WidgetWith.Kind.Person -> if (english) "Off together" else "一緒に休める日"
    WidgetWith.Kind.Group -> if (english) "Everyone off" else "みんな休み"
  }

/** What is said with no day off ahead. */
private fun noOffWords(none: NoOff?, words: WidgetWords): String =
  when (none) {
    is NoOff.Waiting -> {
      val first = none.names.first()
      val others = none.names.size - 1
      if (words.english) "Waiting on $first" + (if (others > 0) " +$others" else "")
      else "${first}さん" + (if (others > 0) "ほか${others}人" else "") + "の入力待ち"
    }
    NoOff.Apart -> if (words.english) "No days off together yet" else "重なる休みはまだありません"
    NoOff.NotEntered,
    null -> words.nothingYet
  }

/** The whole of it as read aloud. */
private fun spokenOff(off: NextOff?, drawn: Drawn): String {
  val english = drawn.english
  val with = drawn.entry.with
  val title =
    when (with?.kind) {
      null -> offTitle(null, english)
      WidgetWith.Kind.Group -> if (english) "Everyone off, ${with.name}" else "${with.name}のみんな休み"
      WidgetWith.Kind.Person -> if (english) "Off together with ${with.name}" else "${with.name}さんと一緒に休める日"
    }
  off ?: return "$title${if (english) ", " else "、"}${noOffWords(drawn.entry.offs.none, drawn.words)}"
  return listOfNotNull(title, drawn.words.inDays(off.inDays), drawn.words.date(off.day.date), off.day.pattern?.name)
    .joinToString(if (english) ", " else "、")
}

/** The widget's title. */
@Composable
private fun OffsHead(text: String, drawn: Drawn) {
  Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
    Words(text, drawn.colors.secondary, 13.sp, modifier = GlanceModifier.defaultWeight())
  }
}

/** The next day off large: how soon, and its date and mark. */
@Composable
private fun NextOffSmall(soonest: NextOff?, drawn: Drawn) {
  val colors = drawn.colors
  val words = drawn.words
  Column(GlanceModifier.fillMaxSize()) {
    OffsHead(offTitle(drawn.entry.with, drawn.english), drawn)
    Spacer(GlanceModifier.defaultWeight())
    when {
      soonest != null && soonest.inDays > 1 ->
        Row(verticalAlignment = Alignment.Bottom) {
          Text(soonest.inDays.toString(), style = TextStyle(color = colors.words, fontSize = 52.sp, fontWeight = FontWeight.Bold))
          Words(if (drawn.english) " days" else "日後", colors.words, 13.sp, bold = true, modifier = GlanceModifier.padding(bottom = 10.dp))
        }
      else -> {
        val text = soonest?.let { words.inDays(it.inDays) } ?: "–"
        // Glance's text does not shrink by itself: Tomorrow takes a size that fits the widget's width.
        val room = LocalSize.current.width.value - 2 * WIDGET_MARGIN.value
        val size = minOf(36f, room / (text.length * 0.6f).coerceAtLeast(1f))
        Words(text, colors.words, size.sp, bold = true)
      }
    }
    Spacer(GlanceModifier.defaultWeight())
    Row(verticalAlignment = Alignment.CenterVertically) {
      if (soonest != null) {
        Words(words.date(soonest.day.date), colors.secondary, 13.sp)
        Spacer(GlanceModifier.width(4.dp))
        DayMark(soonest.day, drawn, 16.dp)
      } else {
        Words(noOffWords(drawn.entry.offs.none, words), colors.secondary, 13.sp)
      }
    }
  }
}

/**
 * A day off today, said as such rather than counted: おやすみ, with the date over it, tomorrow's
 * mark under it, and the app icon's poodle looking up from the corner. 次の休み's days, about being
 * off, go without a memo's stroke.
 */
@Composable
private fun RestToday(drawn: Drawn) {
  val colors = drawn.colors
  val english = drawn.english
  val entry = drawn.entry
  Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.BottomEnd) {
    Image(ImageProvider(R.drawable.widget_poodle), null, GlanceModifier.size(92.dp))
    Column(GlanceModifier.fillMaxSize()) {
      OffsHead(drawn.words.date(entry.date), drawn)
      Spacer(GlanceModifier.height(8.dp))
      val title =
        when (entry.with?.kind) {
          null -> if (english) "Day off\ntoday" else "今日は\nおやすみ"
          WidgetWith.Kind.Person -> if (english) "Both off\ntoday" else "ふたりとも\nおやすみ"
          WidgetWith.Kind.Group -> if (english) "Everyone off\ntoday" else "みんな\nおやすみ"
        }
      Words(title, colors.words, 20.sp, bold = true, maxLines = 2)
      Spacer(GlanceModifier.defaultWeight())
      val tomorrow = entry.upcoming[1]
      Row(verticalAlignment = Alignment.CenterVertically) {
        // Tomorrow's weekday in English, short enough to keep clear of the poodle.
        Words(if (english) weekdayName(tomorrow.date.weekday, true) else "明日", colors.secondary, 13.sp)
        Spacer(GlanceModifier.width(4.dp))
        DayMark(tomorrow, drawn, 16.dp)
      }
    }
  }
}

class NextOffWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget = NextOffWidget()
}
