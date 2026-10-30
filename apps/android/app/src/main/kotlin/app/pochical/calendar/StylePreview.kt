package app.pochical.calendar

import android.annotation.SuppressLint
import android.content.res.Configuration
import android.view.MotionEvent
import android.widget.FrameLayout
import android.widget.RemoteViews
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Metrics
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Radius
import app.pochical.isDark
import app.pochical.kit.OwnCalendar
import app.pochical.kit.OwnDay
import app.pochical.kit.Week
import app.pochical.kit.monthHolding
import app.pochical.kit.stylePreviewDays
import app.pochical.kit.styleSamples as sampleIds
import app.pochical.widgets.CalendarWidget
import app.pochical.widgets.Drawn
import app.pochical.widgets.MEDIUM
import app.pochical.widgets.WidgetEntry
import app.pochical.widgets.widgetEntry
import java.time.LocalDate
import java.time.ZoneId

/**
 * The light or dark a style page's preview, and its テーマ cards, are seen in: ☀︎ / ☾'s pick, kept
 * as the page is made again, else the screen's, without touching 外観.
 */
@Stable
class PreviewScheme(private val picked: MutableState<Boolean?>, private val screenDark: Boolean) {
  val dark: Boolean
    get() = picked.value ?: screenDark

  fun pick(dark: Boolean) {
    picked.value = dark
  }
}

@Composable
fun rememberPreviewScheme(): PreviewScheme {
  val picked = rememberSaveable { mutableStateOf<Boolean?>(null) }
  val screenDark = isDark(LocalDeviceSettings.current.device, isSystemInDarkTheme())
  return remember(screenDark) { PreviewScheme(picked, screenDark) }
}

/** The marks the テーマ and シフトの色 choices show side by side (spec/vectors/style-preview.json, samples). */
fun styleSamples(patterns: List<Pattern>): List<Pattern> {
  val byId = patterns.associateBy { it.id }
  return sampleIds(patterns.map { it.row }).mapNotNull(byId::get)
}

/**
 * What both of a preview's pages are drawn from, as plain data: the fortnight from the week of
 * [today], the made-up run of the person's [patterns] in use on it ([shown], a pattern's id by
 * day). Each page derives what it draws from this one value, so they show the same days and change
 * together, a pattern's look among what changes them.
 */
data class StylePreviewInput(val today: LocalDate, val patterns: List<Pattern>, val fortnight: List<LocalDate>, val shown: Map<LocalDate, String>) {
  /** The widgets' entry for the fortnight, as the calendar's page shows it, with or without the person's days entered. */
  fun widgetEntry(week: Week): WidgetEntry =
    OwnCalendar(patterns.map { it.row }, shown.mapValues { OwnDay(it.value) }, emptyList())
      .widgetEntry(today.atStartOfDay(ZoneId.systemDefault()), week, { false })
      .copy(nothingEntered = false)

  companion object {
    /** The preview of [patterns] in use from the week of [today], the week starting on [weekStart]. */
    fun of(today: LocalDate, patterns: List<Pattern>, weekStart: Int): StylePreviewInput {
      val first = today.weekStartingOn(weekStart)
      val fortnight = (0 until 14).map { first.plusDays(it.toLong()) }
      return StylePreviewInput(today, patterns, fortnight, stylePreviewDays(fortnight, patterns.map { it.row }))
    }
  }
}

/**
 * The preview at the top of スタイル and カレンダー (/design's StylePreview): this week and the next
 * as a made-up run of the person's own patterns in use, drawn in the settings being chosen, on a
 * card in the テーマ's colors, light or dark as [scheme] says, with ☀︎ / ☾ on its edge; swiped
 * aside, the home screen with the カレンダー widget drawn from the same fortnight, its page named at
 * the card's top end and its dots under it. Under the month's heading, as カレンダー shows it
 * [withHeading], one week is enough on the calendar's page.
 */
@Composable
fun StylePreview(scheme: PreviewScheme, today: LocalDate, modifier: Modifier = Modifier, withHeading: Boolean = false) {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val patterns = calendar.patterns.filterNot { it.archived }
  val device = LocalDeviceSettings.current.device
  val theme = device.theme
  // A テーマ drawn dark has no light to show.
  val dark = scheme.dark || theme.isAlwaysDark
  val input = remember(today, patterns, device.week.start) { StylePreviewInput.of(today, patterns, device.week.start) }
  val pages = rememberPagerState { 2 }
  val names = listOf(stringResource(R.string.preview_page_calendar), stringResource(R.string.preview_page_widget))
  // The calendar's page sets the height; the home screen's keeps it, after the page is made again too.
  var calendarHeight by rememberSaveable { mutableIntStateOf(0) }
  val density = LocalDensity.current
  // Room for the switch over the card's top edge.
  Column(modifier.padding(top = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Box {
      CompositionLocalProvider(LocalThemeColors provides theme.colors(dark)) {
        val colors = LocalThemeColors.current
        HorizontalPager(pages, Modifier.fillMaxWidth(), pageSpacing = 12.dp, verticalAlignment = Alignment.Top) { page ->
          if (page == 0) {
            CalendarPage(input, withHeading, Modifier.onSizeChanged { calendarHeight = it.height })
          } else {
            HomePreview(input, dark, with(density) { calendarHeight.toDp() })
          }
        }
        // Which page is shown, on the card's top end, kept still while the pages move.
        Text(
          names[pages.currentPage],
          Modifier.align(Alignment.TopEnd)
            .offset(x = (-12).dp, y = (-10).dp)
            .background(colors.backgroundCard, RoundedCornerShape(Radius.sm))
            .border(1.dp, colors.separator, RoundedCornerShape(Radius.sm))
            .padding(horizontal = 8.dp, vertical = 2.dp)
            .clearAndSetSemantics {},
          style = PochicalTextStyles.caption2,
          color = colors.textSecondary,
        )
        SchemeSwitch(
          dark = dark,
          // A テーマ drawn dark has no light to switch to: its ☾ stays on.
          enabled = !theme.isAlwaysDark,
          onChange = scheme::pick,
          modifier = Modifier.offset(x = 12.dp, y = -Metrics.touch / 2),
        )
      }
    }
    PageDots(pages, { stringResource(R.string.preview_page, names[it], it + 1, names.size) })
  }
}

/** The calendar's page of the preview: [input]'s fortnight, or its first week under the month's heading [withHeading]. */
@Composable
private fun CalendarPage(input: StylePreviewInput, withHeading: Boolean, modifier: Modifier) {
  val colors = LocalThemeColors.current
  val device = LocalDeviceSettings.current.device
  val today = input.today
  val shown = input.shown
  val days = if (withHeading) input.fortnight.take(7) else input.fortnight
  val byId = input.patterns.associateBy { it.id }
  val shape = RoundedCornerShape(Radius.xl)
  val label = stringResource(if (withHeading) R.string.preview_this_week else R.string.preview_week)
  Column(
    modifier
      .background(colors.backgroundCard, shape)
      .border(1.dp, colors.separator, shape)
      .padding(12.dp)
      .clearAndSetSemantics { contentDescription = label },
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    if (withHeading) {
      // The page holding today, as the calendar heads it: by its days with a シフトの期間.
      val month = device.period.monthHolding(today)
      MonthName(0f, { month }, reduceMotion = true, Modifier.padding(start = 8.dp, bottom = 8.dp))
    }
    WeekdayRow(device.week, Modifier.padding(bottom = 8.dp))
    for (row in days.chunked(7)) {
      Row(horizontalArrangement = Arrangement.spacedBy(Metrics.spacingStep)) {
        for (day in row) {
          val shift = shown[day]
          DayCell(
            DayLook(
              day = day,
              entry = shift?.let(::DayEntry),
              pattern = shift?.let(byId::get),
              note = null,
              holiday = null,
              outside = false,
              isToday = day == today,
            ),
            height = DAY_FULL_HEIGHT,
            colorsHoliday = device.week.holiday,
            onClick = {},
            enabled = false,
            modifier = Modifier.weight(1f),
          )
        }
      }
    }
  }
}

/**
 * The home screen's page of the preview (/design's HomePreview): the カレンダー widget at a phone's
 * 4×2, drawn by Glance from the same [input] as the calendar's page, in the settings being chosen
 * and in light or [dark], on a ground of the テーマ's own and fitted to [height], the calendar page's.
 * It is a picture: a touch on it does nothing a widget's would.
 */
@Composable
private fun HomePreview(input: StylePreviewInput, dark: Boolean, height: Dp) {
  val context = LocalContext.current
  val screen = LocalConfiguration.current
  val settings = LocalDeviceSettings.current.device
  val colors = LocalThemeColors.current
  val label = stringResource(R.string.preview_widget)
  val widget = remember { CalendarWidget() }
  // In light or dark as picked: Glance reads a color's day or night from the context it composes in
  // before Android 12, and the views read theirs from the one they are put in after.
  val themed =
    remember(context, screen, dark) {
      val configuration = Configuration(screen)
      configuration.uiMode = (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
        (if (dark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
      context.createConfigurationContext(configuration)
    }
  // What it shows, worked out in composition from the one input; Glance draws it apart, again for each.
  val drawing = remember(input, settings) { Drawn(input.widgetEntry(settings.week), settings) }
  val views by produceState<RemoteViews?>(null, drawing, themed) { value = widget.preview(themed, drawing, MEDIUM) }
  val shape = RoundedCornerShape(Radius.xl)
  BoxWithConstraints(
    Modifier.fillMaxWidth()
      .height(height.coerceAtLeast(MEDIUM.height / 2))
      .clip(shape)
      .background(Brush.linearGradient(listOf(colors.accentContainer, colors.backgroundElevated)))
      .border(1.dp, colors.separator, shape)
      .clearAndSetSemantics { contentDescription = label },
    contentAlignment = Alignment.Center,
  ) {
    val scale = minOf(1f, (maxWidth - 24.dp) / MEDIUM.width, (maxHeight - 24.dp) / MEDIUM.height)
    val drawn = views ?: return@BoxWithConstraints
    // Put in once for each drawing; its touches never reach the views, so the pages still swipe.
    key(drawn, themed) {
      AndroidView(
        factory = {
          object : FrameLayout(it) {
            override fun onInterceptTouchEvent(event: MotionEvent) = true

            @SuppressLint("ClickableViewAccessibility")
            override fun onTouchEvent(event: MotionEvent) = false
          }
            .apply { addView(drawn.apply(themed, this)) }
        },
        // In the corners a launcher rounds a widget's to.
        modifier =
          Modifier.requiredSize(MEDIUM.width, MEDIUM.height).graphicsLayer {
            scaleX = scale
            scaleY = scale
            this.shape = RoundedCornerShape(Radius.xxl)
            clip = true
          },
      )
    }
  }
}

/**
 * ☀︎ / ☾ to see a preview in the other of light and dark without changing 外観 (/design's
 * PreviewSchemeSwitch): drawn small, each side a touch target of its own.
 */
@Composable
fun SchemeSwitch(dark: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val label = stringResource(R.string.preview_scheme)
  Row(
    modifier
      // The frame drawn around the small sides alone, though each reaches a full touch target.
      .drawBehind {
        val height = SIDE_HEIGHT.toPx() + 6.dp.toPx()
        val top = (size.height - height) / 2
        val corner = CornerRadius(Radius.md.toPx())
        drawRoundRect(colors.backgroundCard, Offset(0f, top), Size(size.width, height), corner)
        drawRoundRect(colors.separator, Offset(0f, top), Size(size.width, height), corner, style = Stroke(1.dp.toPx()))
      }
      .padding(horizontal = 1.dp)
      .selectableGroup()
      .semantics { contentDescription = label },
  ) {
    for ((side, icon, name) in listOf(Triple(false, R.drawable.ic_light_mode, R.string.preview_light), Triple(true, R.drawable.ic_dark_mode, R.string.preview_dark))) {
      val picked = side == dark
      Box(
        Modifier.selectable(selected = picked, enabled = enabled, role = Role.RadioButton) { onChange(side) }
          .size(width = 30.dp, height = Metrics.touch),
        contentAlignment = Alignment.Center,
      ) {
        Box(
          Modifier.size(width = 28.dp, height = SIDE_HEIGHT).background(if (picked) colors.fillTertiary else Color.Transparent, RoundedCornerShape(Radius.sm)),
          contentAlignment = Alignment.Center,
        ) {
          Icon(
            painterResource(icon),
            stringResource(name),
            Modifier.size(14.dp),
            tint = if (picked) colors.textPrimary else if (enabled) colors.textQuaternary else colors.textDisabled,
          )
        }
      }
    }
  }
}

private val SIDE_HEIGHT = 22.dp
