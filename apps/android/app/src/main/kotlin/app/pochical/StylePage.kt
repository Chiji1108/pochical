package app.pochical

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.calendar.DayCell
import app.pochical.calendar.DayEntry
import app.pochical.calendar.DayLook
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.PageDots
import app.pochical.calendar.Pattern
import app.pochical.calendar.StylePreview
import app.pochical.calendar.rememberPreviewScheme
import app.pochical.calendar.rememberToday
import app.pochical.calendar.styleSamples
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Radius
import app.pochical.design.Theme
import app.pochical.kit.Look
import app.pochical.kit.MarkStyle
import app.pochical.kit.OffLook
import java.time.LocalDate

/** The four shapes members see: icons filled (塗り) or outlined (線), emoji, and letters on their tile. */
private enum class Shape(val title: Int) {
  Filled(R.string.style_filled),
  Outlined(R.string.style_outlined),
  Emoji(R.string.style_emoji),
  Badge(R.string.style_badge);

  /** The look in this shape; only icons carry their fill, so the others leave it as it was. */
  fun look(from: Look): Look =
    when (this) {
      Filled -> from.copy(style = MarkStyle.Icon, fill = true)
      Outlined -> from.copy(style = MarkStyle.Icon, fill = false)
      Emoji -> from.copy(style = MarkStyle.Emoji)
      Badge -> from.copy(style = MarkStyle.Badge)
    }

  companion object {
    fun of(look: Look): Shape =
      when (look.style) {
        MarkStyle.Icon -> if (look.fill) Filled else Outlined
        MarkStyle.Emoji -> Emoji
        MarkStyle.Badge -> Badge
      }
  }
}

val OffLook.title: Int
  get() =
    when (this) {
      OffLook.Highlight -> R.string.off_look_highlight
      OffLook.Mark -> R.string.off_look_mark
      OffLook.Blank -> R.string.off_look_blank
    }

/** A day the samples are drawn on, a weekday that is no holiday. */
private val SAMPLE_DAY = LocalDate.of(2026, 10, 5)

/**
 * スタイル (/design's MarkPage, iOS's StyleSettings): how shifts are marked and the テーマ, each choice
 * drawn on the person's own patterns, and this week and the next in the look over them, so there is
 * nothing to confirm. Each change is kept as it is picked.
 */
@Composable
fun StylePage(onBack: () -> Unit) {
  val settings = LocalDeviceSettings.current
  val look = settings.device.look
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val patterns = calendar.patterns.filterNot { it.archived }
  val work = patterns.firstOrNull { !it.countsAsOff }
  val offs = patterns.filter { it.countsAsOff }
  val samples = styleSamples(patterns)
  val scheme = rememberPreviewScheme()
  val today = rememberToday()
  SettingsPage(stringResource(R.string.style), onBack) { padding ->
    LazyColumn(contentPadding = padding) {
      item { StylePreview(scheme, today, Modifier.padding(horizontal = 16.dp)) }
      item {
        Section(stringResource(R.string.style_shape), note = stringResource(R.string.style_shape_note)) {
          Choices(Shape.entries, Shape.of(look), { stringResource(it.title) }, { shape -> settings.change { it.copy(look = shape.look(it.look)) } }) {
            shape ->
            if (work != null) PatternMark(work, 20, shape.look(look))
          }
        }
      }
      item {
        Section(stringResource(R.string.style_theme)) { ThemeChoices(samples, scheme.dark, settings.device.theme) { theme -> settings.change { it.copy(themeId = theme.id) } } }
      }
      // Emoji keep their own colors, so シフトの色 would change nothing.
      if (look.style != MarkStyle.Emoji) {
        item {
          Section(stringResource(R.string.style_colors)) {
            Choices(
              listOf(true, false),
              look.colored,
              { stringResource(if (it) R.string.style_colored else R.string.style_one_tone) },
              { colored -> settings.change { it.copy(look = it.look.copy(colored = colored)) } },
              tall = true,
            ) { colored ->
              Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                for (pattern in samples) PatternMark(pattern, 18, look.copy(colored = colored))
              }
            }
          }
        }
      }
      item {
        Section(stringResource(R.string.style_names)) {
          Choices(
            listOf(false, true),
            look.options.names,
            { stringResource(if (it) R.string.style_names_on else R.string.style_names_off) },
            { names -> settings.change { it.copy(look = it.look.withOptions { options -> options.copy(names = names) }) } },
            tall = true,
          ) { names ->
            Sample(work, look.withOptions { it.copy(names = names) })
          }
        }
      }
      // Each day off its own, so 休み can be left blank while 有休 is tinted; named once there is more
      // than one. Last, as it grows with the patterns that count as off, so the rest keep their place.
      if (offs.isNotEmpty()) {
        item {
          Section(stringResource(R.string.style_off_look)) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
              for (off in offs) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                  if (offs.size > 1) Text(off.name, style = PochicalTextStyles.subheadline.copy(fontWeight = FontWeight.SemiBold))
                  Choices(
                    OffLook.entries,
                    look.options.offLook(off.id),
                    { stringResource(it.title) },
                    { offLook -> settings.change { it.copy(look = it.look.withOffLook(offLook, off.id, offs.map(Pattern::id))) } },
                    tall = true,
                  ) { offLook ->
                    Sample(off, look.withOptions { it.copy(offs = it.offs + (off.id to offLook)) })
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

/** 設定's スタイル row: a look shown rather than named, one of the person's own marks, then the テーマ's name. */
@Composable
fun StyleRow(open: (RootPage) -> Unit) {
  val device = LocalDeviceSettings.current.device
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  val patterns = calendar.patterns.filterNot { it.archived }
  val work = patterns.firstOrNull { !it.countsAsOff } ?: patterns.firstOrNull()
  val spoken = "${stringResource(Shape.of(device.look).title)}、${device.theme.displayName}"
  SettingsRow(
    stringResource(R.string.style),
    R.drawable.ic_palette,
    onClick = { open(RootPage.Style) },
    valueContent = {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (work != null) Box(Modifier.clearAndSetSemantics {}) { PatternMark(work, 20, device.look) }
        Text(device.theme.displayName, Modifier.semantics { contentDescription = spoken }, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
      }
    },
  )
}

/** A section of the page: its heading, what it holds, and words under it when it has some. */
@Composable
private fun Section(title: String, note: String? = null, content: @Composable () -> Unit) {
  Column {
    SectionHeader(title)
    Box(Modifier.padding(horizontal = 16.dp)) { content() }
    if (note != null) Footnote(note)
  }
}

/** How far a choice is picked, 0 to 1, on the motion scheme's spring. */
@Composable
private fun pickedFraction(picked: Boolean): Float {
  val fraction by animateFloatAsState(if (picked) 1f else 0f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "picked")
  return fraction.coerceIn(0f, 1f)
}

/** A pattern's mark in [look]. */
@Composable
private fun PatternMark(pattern: Pattern, size: Int, look: Look) =
  ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size.dp, look = look)

/** A day drawn small in [look], with the pattern's mark on it, as the month would show it. */
@Composable
private fun Sample(pattern: Pattern?, look: Look) {
  if (pattern == null) return
  DayCell(
    DayLook(day = SAMPLE_DAY, entry = DayEntry(pattern.id), pattern = pattern, note = null, holiday = null, outside = false, isToday = false),
    height = 64.dp,
    colorsHoliday = false,
    onClick = {},
    enabled = false,
    modifier = Modifier.width(44.dp),
    style = look,
  )
}

/**
 * Choices side by side, each drawing what it does over its name, the one picked outlined in the
 * accent: Material's selection cards rather than iOS's segments, as segmented buttons hold a word
 * and an icon, not a day.
 */
@Composable
fun <T> Choices(
  options: List<T>,
  picked: T,
  label: @Composable (T) -> String,
  onPick: (T) -> Unit,
  tall: Boolean = false,
  sample: @Composable (T) -> Unit,
) {
  val colors = LocalThemeColors.current
  Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    for (option in options) {
      val isPicked = option == picked
      // Picked, its corners round out and its color comes in on the motion scheme's spring, as
      // Material 3 Expressive's selections morph, where iOS slides the raised ground across.
      val shown = pickedFraction(isPicked)
      val shape = RoundedCornerShape(lerp(Radius.lg, Radius.xxl, shown))
      Column(
        Modifier.weight(1f)
          .heightIn(min = if (tall) 108.dp else 72.dp)
          .border(lerp(1.dp, 2.dp, shown), lerp(colors.borderDefault, colors.accentDefault, shown), shape)
          .background(lerp(colors.backgroundCard, colors.accentContainer, shown), shape)
          .clip(shape)
          .selectable(selected = isPicked, role = Role.RadioButton) { onPick(option) }
          .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
      ) {
        Box(Modifier.clearAndSetSemantics {}) { sample(option) }
        Text(
          label(option),
          style = PochicalTextStyles.subheadline.copy(fontWeight = if (isPicked) FontWeight.SemiBold else FontWeight.Normal),
          color = if (isPicked) colors.textPrimary else colors.textSecondary,
          textAlign = TextAlign.Center,
        )
      }
    }
  }
}

/**
 * The テーマ, three to a page swiped sideways with dots under them (/design's, after Telegram's
 * 外観), opening on the page of the one in use: each card the テーマ's own screen in the light or
 * dark the preview shows, with the person's marks on its card and its text and accent side by side.
 */
@Composable
private fun ThemeChoices(samples: List<Pattern>, dark: Boolean, inUse: Theme, onPick: (Theme) -> Unit) {
  val themes = Theme.entries.chunked(3)
  val pages = rememberPagerState(initialPage = themes.indexOfFirst { inUse in it }.coerceAtLeast(0)) { themes.size }
  Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
    HorizontalPager(pages, Modifier.fillMaxWidth().selectableGroup(), pageSpacing = 8.dp, verticalAlignment = Alignment.Top) { page ->
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (theme in themes[page]) ThemeCard(theme, theme == inUse, samples, dark, Modifier.weight(1f)) { onPick(theme) }
        repeat(3 - themes[page].size) { Box(Modifier.weight(1f)) }
      }
    }
    PageDots(pages, stringResource(R.string.style_theme_page, pages.currentPage + 1, pages.pageCount))
  }
}

@Composable
private fun ThemeCard(theme: Theme, picked: Boolean, samples: List<Pattern>, dark: Boolean, modifier: Modifier, onPick: () -> Unit) {
  val colors = LocalThemeColors.current
  val own = theme.colors(dark || theme.isAlwaysDark)
  Column(
    modifier.clip(RoundedCornerShape(Radius.lg)).selectable(selected = picked, role = Role.RadioButton, onClick = onPick).padding(2.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(6.dp),
  ) {
    val shown = pickedFraction(picked)
    val outer = RoundedCornerShape(lerp(Radius.lg, Radius.xxl, shown))
    CompositionLocalProvider(LocalThemeColors provides own) {
      Column(
        Modifier.fillMaxWidth()
          .border(lerp(1.dp, 2.dp, shown), lerp(own.separator, colors.accentDefault, shown), outer)
          .background(own.backgroundBase, outer)
          .padding(8.dp)
          .clearAndSetSemantics {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        val inner = RoundedCornerShape(Radius.sm)
        Row(
          Modifier.fillMaxWidth().background(own.backgroundCard, inner).border(1.dp, own.separator, inner).padding(vertical = 8.dp),
          horizontalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterHorizontally),
        ) {
          for (pattern in samples) ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, 14.dp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(bottom = 4.dp)) {
          Box(Modifier.size(width = 20.dp, height = 4.dp).background(own.textPrimary, CircleShape))
          Box(Modifier.size(width = 28.dp, height = 4.dp).background(own.accentFill, CircleShape))
        }
      }
    }
    Text(
      theme.displayName,
      style = PochicalTextStyles.footnote.copy(fontWeight = if (picked) FontWeight.SemiBold else FontWeight.Normal),
      color = if (picked) colors.textPrimary else colors.textSecondary,
      modifier = Modifier.height(20.dp),
    )
  }
}
