package app.pochical.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.pochical.calendar.weekday
import androidx.compose.ui.graphics.Color
import androidx.glance.unit.ColorProvider
import app.pochical.groups.drawing
import app.pochical.kit.Look
import app.pochical.kit.dayName
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import app.pochical.calendar.weekdayHead

/**
 * これから (/design's UpcomingSmall and UpcomingMedium; spec/widgets.md, Views): today's mark over
 * the next three days in the 2×2, and five days from today a column each in the 4×2.
 */
class UpcomingWidget : PochicalWidget(Choosing.People, setOf(SMALL, MEDIUM)) {
  @Composable
  override fun Content(drawn: Drawn) {
    val entry = drawn.entry
    val medium = LocalSize.current.width >= MEDIUM_WIDTH
    val pair = entry.pair
    when {
      entry.pickAgain != null -> PickAgain("一緒に見る人", entry.pickAgain, drawn)
      entry.nothingEntered -> FirstRun(drawn)
      // Set to someone: today and tomorrow in the small one, five days in the medium, theirs
      // under the person's.
      pair != null -> PairColumns(drawn, pair, if (medium) 5 else 2)
      medium -> DayColumns(drawn)
      else -> UpcomingSmall(drawn)
    }
  }
}

/** Where the widget is taller, as on most launchers, the marks grow. */
private val COLUMNS_ROOMY = 150.dp

/** Today's line, and the next three days' marks under it, as one group in the middle. */
@Composable
private fun UpcomingSmall(drawn: Drawn) {
  val entry = drawn.entry
  val colors = drawn.colors
  Column(
    GlanceModifier.fillMaxSize().opening(dayLink(entry.date)),
    verticalAlignment = Alignment.CenterVertically,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    UpcomingHead(entry.today, drawn)
    Spacer(GlanceModifier.height(12.dp))
    Box(GlanceModifier.fillMaxWidth().height(1.dp).background(colors.line)) {}
    Spacer(GlanceModifier.height(8.dp))
    Row(GlanceModifier.fillMaxWidth()) {
      for (day in entry.upcoming.subList(1, 4)) {
        Column(GlanceModifier.defaultWeight().spoken(day, drawn.words), horizontalAlignment = Alignment.CenterHorizontally) {
          NoteStroke(day.noted, colors.noteMarker) { Words(weekdayHead(day.date.weekday, drawn.english), colors.weekday(day.tone), 11.sp) }
          Spacer(GlanceModifier.height(2.dp))
          DayMark(day, drawn, if (drawn.named) 24.dp - NAME_ROOM else 24.dp, named = drawn.named, reserve = true)
        }
      }
    }
  }
}

/** Today's mark large beside its date and what changed, the two together. Today goes without its weekday: it is today. */
@Composable
private fun UpcomingHead(day: WidgetDay, drawn: Drawn) {
  val colors = drawn.colors
  val said = day.news
  val size = (if (said != null) 34.dp else 40.dp) - (if (drawn.named) NAME_ROOM else 0.dp)
  Row(GlanceModifier.spoken(day, drawn.words), verticalAlignment = Alignment.CenterVertically) {
    DayMark(day, drawn, size, named = drawn.named, large = true)
    Spacer(GlanceModifier.width(8.dp))
    Column {
      NoteStroke(day.noted, colors.noteMarker) { Words(drawn.words.shortDate(day.date), colors.words, 17.sp, bold = true) }
      if (said != null) Words(said, colors.secondary, 13.sp)
    }
  }
}

/**
 * Five days from today in columns, as a week reads across: each date under its weekday, the mark
 * large under it, and only what changed under the mark. A day off is its pattern's tile down the
 * whole column, date and all.
 */
@Composable
private fun DayColumns(drawn: Drawn) {
  val roomy = LocalSize.current.height >= COLUMNS_ROOMY
  // No wider than a column leaves room for, its tile's inset and a little air.
  val column = innerSize.width / 5 - 14.dp
  val size = minOf(if (roomy) 44.dp else 36.dp, column) - (if (drawn.named) NAME_ROOM else 0.dp)
  Row(GlanceModifier.fillMaxSize()) {
    drawn.entry.upcoming.take(5).forEachIndexed { index, day -> ColumnDay(day, drawn, first = index == 0, size = size) }
  }
}

@Composable
private fun RowScope.ColumnDay(day: WidgetDay, drawn: Drawn, first: Boolean, size: Dp) {
  // A day off left empty stays empty: a day with nothing entered has its dash here, so the two
  // still read apart.
  val off = OffDrawing(day, drawn, inWeek = false)
  var column = GlanceModifier.defaultWeight().fillMaxHeight().padding(horizontal = 3.dp)
  column = column.opening(drawn.link(day.date)).spoken(day, drawn.words)
  Box(column) {
    var inner = GlanceModifier.fillMaxSize()
    if (off.tile) inner = inner.background(drawn.tileColor(day)).cornerRadius(8.dp)
    Column(inner, horizontalAlignment = Alignment.CenterHorizontally) {
      ColumnHead(day, drawn, first, onTile = off.tile)
      Box(GlanceModifier.fillMaxWidth().defaultWeight(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          if (!off.hidden || day.pattern == null) DayMark(day, drawn, size, faint = off.faint, named = drawn.named, reserve = true)
          ColumnLine(day.columnHours(), drawn, columns = 5)
        }
      }
    }
  }
}

/**
 * A column's weekday over its date, as the calendar heads its columns, so the date sits right over
 * its mark; today's, always the first, with its month small before it. A memo is the calendar's
 * stroke under the date.
 */
@Composable
private fun ColumnHead(day: WidgetDay, drawn: Drawn, first: Boolean, onTile: Boolean, compact: Boolean = false, hidden: Boolean = false) {
  val colors = drawn.colors
  // Hidden, it keeps a head's room by the faces, so they sit by their rows.
  val clear = ColorProvider(Color.Transparent)
  Column(GlanceModifier.padding(top = 4.dp, bottom = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Words(weekdayHead(day.date.weekday, drawn.english), if (hidden) clear else colors.weekday(day.tone), 11.sp)
    NoteStroke(day.noted && !hidden, drawn.strokeColor(day, onTile)) {
      Row(verticalAlignment = Alignment.Bottom) {
        val color = if (hidden) clear else if (day.holiday) colors.holiday else colors.words
        if (first) {
          Words(drawn.words.columnMonth(day.date), color, 10.sp)
        }
        Text(day.date.dayOfMonth.toString(), style = TextStyle(color = color, fontSize = if (compact) 13.sp else 15.sp, fontWeight = FontWeight.Medium))
      }
    }
  }
}

/**
 * A column's one line of words: at 10sp where it fits the column's width, else shrunk to 8sp, else
 * without its :00 (7〜20). Glance's text does not shrink by itself, so the fit is worked out from the
 * column's width (LocalSize).
 */
@Composable
private fun ColumnLine(words: String?, drawn: Drawn, columns: Int) {
  if (words == null) {
    Words(" ", drawn.colors.secondary, 10.sp)
    return
  }
  // A column's room, the widget's inside shared by its columns, less its padding.
  val room = innerSize.width.value / columns - 6
  // About how wide a digit or 〜 is at a size, digits half an em and 〜 a whole one.
  fun width(text: String, size: Float) = text.sumOf { if (it.isDigit() || it == ':') 0.55 else 1.0 } * size
  val (text, size) =
    listOf(10f, 9f, 8f).firstOrNull { width(words, it) <= room }?.let { words to it } ?: (withoutWholeHours(words) to 8f)
  Words(text, drawn.colors.secondary, size.sp)
}

/**
 * The group's 週ごと in small: the person's row and theirs, each with their face in a first column
 * as wide as a day's, a day off on the group tables' tile, and a day both are off one band down its
 * column. Their marks are drawn in their own shape, as the group's tables draw them; two rows leave
 * room for one line under a mark, changed hours else the name.
 */
@Composable
private fun PairColumns(drawn: Drawn, pair: WidgetPair, count: Int) {
  val days = drawn.entry.upcoming.zip(pair.days).take(count)
  val worded = days.any { (mine, shown) -> mine.columnHours() != null || shown.theirs?.columnHours() != null }
  val size = if (drawn.named || worded) 20.dp else 26.dp
  val theirLook = drawn.look.drawing(pair.theirMarkStyle, pair.theirMarkFill)
  Row(GlanceModifier.fillMaxSize().opening(drawn.link(drawn.entry.date))) {
    Column(GlanceModifier.defaultWeight().fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
      // As tall as a column's head, so the faces sit by their rows.
      ColumnHead(days.first().first, drawn, first = true, onTile = false, compact = true, hidden = true)
      Box(GlanceModifier.defaultWeight(), contentAlignment = Alignment.Center) { WidgetFace(pair.me.name, 24.dp, me = true, photo = drawn.faces.me) }
      Box(GlanceModifier.defaultWeight(), contentAlignment = Alignment.Center) { WidgetFace(pair.with.name, 24.dp, photo = drawn.faces.with) }
    }
    days.forEachIndexed { index, (mine, shown) ->
      var column = GlanceModifier.defaultWeight().fillMaxHeight().padding(horizontal = 3.dp).opening(drawn.link(mine.date))
      // A day both are off: one band down the column.
      if (shown.together) column = column.background(drawn.colors.groupTint).cornerRadius(8.dp)
      Column(column, horizontalAlignment = Alignment.CenterHorizontally) {
        ColumnHead(mine, drawn, first = index == 0, onTile = false, compact = true)
        PairCell(mine, shown.together, drawn, drawn.look, size, count + 1, GlanceModifier.defaultWeight().spoken(mine, drawn.words))
        val theirName = shown.theirs?.pattern?.name ?: if (drawn.english) "not entered" else "未入力"
        val spoken = if (drawn.english) "${pair.with.name}, $theirName" else "${pair.with.name}さん、$theirName"
        PairCell(shown.theirs, shown.together, drawn, theirLook, size, count + 1, GlanceModifier.defaultWeight().semantics { contentDescription = spoken })
      }
    }
  }
}

/** A day's mark and its one line in the middle of its cell, on the group tables' tile when it is off; a dash where not entered. */
@Composable
private fun PairCell(day: WidgetDay?, together: Boolean, drawn: Drawn, look: Look, size: Dp, columns: Int, modifier: GlanceModifier) {
  var cell = modifier.fillMaxWidth()
  if (day != null && day.off && !together) cell = cell.padding(vertical = 3.dp).background(drawn.colors.groupTint).cornerRadius(8.dp)
  Box(cell, contentAlignment = Alignment.Center) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      val pattern = day?.pattern
      if (pattern == null) {
        NothingMark(size, drawn.colors)
      } else {
        WidgetShiftMark(pattern, size, day.timeChange, look, drawn.colors)
        val line = day.columnHours() ?: pattern.name.takeIf { drawn.named }?.let(::dayName)
        if (line != null) ColumnLine(line, drawn, columns)
      }
    }
  }
}

class UpcomingWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget = UpcomingWidget()
}
