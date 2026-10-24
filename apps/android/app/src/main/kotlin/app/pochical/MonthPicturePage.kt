package app.pochical

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.calendar.DayCell
import app.pochical.calendar.DayLook
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.OwnCalendar
import app.pochical.calendar.Pattern
import app.pochical.calendar.SchemeSwitch
import app.pochical.calendar.WeekdayRow
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.holidayName
import app.pochical.calendar.monthWeeks
import app.pochical.calendar.monthWithYear
import app.pochical.calendar.yearMonthText
import app.pochical.design.Metrics
import app.pochical.design.Radius
import app.pochical.kit.DeviceSettings
import app.pochical.kit.MarkOptions
import app.pochical.kit.OffLook
import java.time.YearMonth
import kotlinx.coroutines.launch

/**
 * 画像で保存 (spec/calendar.md, Saving a month as a picture; iOS's MonthPicturePage): [month] as a
 * picture in the calendar's own ground, with the look it goes out in, shared through Android's share
 * sheet or saved to the phone's pictures. Light or dark is the picture's alone, kept on the device;
 * シフト名 and 休みの見せ方 are the picture's own, kept with the account; the app's スタイル stays.
 */
@Composable
fun MonthPicturePage(month: YearMonth, onBack: () -> Unit) {
  val settings = LocalDeviceSettings.current
  val device = settings.device
  val calendar by LocalOwnDays.current.calendar.collectAsState()
  val context = LocalContext.current
  val resources = LocalResources.current
  val haptics = LocalHapticFeedback.current
  val scope = rememberCoroutineScope()
  val snackbar = remember { SnackbarHostState() }
  val layer = rememberGraphicsLayer()
  // Until picked, the screen's light or dark; an always-dark テーマ saves its dark.
  val dark = device.theme.isAlwaysDark || (device.picture.dark ?: isDark(device, isSystemInDarkTheme()))
  val title = stringResource(R.string.picture_title, month.yearMonthText)
  val offs = calendar.patterns.filter { it.countsAsOff }

  fun say(words: Int) = scope.launch { snackbar.showSnackbar(resources.getString(words)) }

  SettingsPage(stringResource(R.string.picture), onBack) { padding ->
    Box(Modifier.padding(padding)) {
      LazyColumn(Modifier.fillMaxWidth()) {
        item {
          Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 22.dp)) {
            val shape = RoundedCornerShape(Radius.xxl)
            MonthPicture(
              month,
              calendar,
              device,
              dark,
              Modifier.clip(shape)
                .border(1.dp, LocalThemeColors.current.separator, shape)
                .drawWithContent {
                  layer.record { this@drawWithContent.drawContent() }
                  drawLayer(layer)
                }
                .clearAndSetSemantics { contentDescription = resources.getString(R.string.picture_label, month.yearMonthText) },
            )
            SchemeSwitch(
              dark = dark,
              enabled = !device.theme.isAlwaysDark,
              onChange = { picked -> settings.change { it.copy(picture = it.picture.copy(dark = picked)) } },
              modifier = Modifier.offset(x = 12.dp, y = -Metrics.touch / 2),
            )
          }
        }
        // The style page's choices in its order, with the picture's own values: it goes to people
        // who do not know the marks, so names start on.
        item {
          SectionHeader(stringResource(R.string.style_names))
          Box(Modifier.padding(horizontal = 16.dp)) {
            Choices(
              listOf(false, true),
              device.picture.options.names,
              { stringResource(if (it) R.string.style_names_on else R.string.style_names_off) },
              { names -> changeOptions(settings) { it.copy(names = names) } },
            ) {}
          }
          if (offs.isEmpty()) Footnote(stringResource(R.string.picture_only))
        }
        // Each day off its own, those of a job left too, as an older month holds them: 有休 may be
        // worth showing while 休み is left blank.
        if (offs.isNotEmpty()) {
          item {
            SectionHeader(stringResource(R.string.style_off_look))
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
              for (off in offs) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                  if (offs.size > 1) Text(off.name, fontWeight = FontWeight.SemiBold)
                  Choices(
                    OffLook.entries,
                    device.picture.options.offLook(off.id),
                    { stringResource(it.title) },
                    { look -> changeOptions(settings) { it.withOffLook(look, off.id, offs.map(Pattern::id)) } },
                  ) {}
                }
              }
            }
            Footnote(stringResource(R.string.picture_only))
          }
        }
        item { Spacer(Modifier.heightIn(min = Metrics.control * 2)) }
      }
      Row(
        Modifier.align(Alignment.BottomCenter)
          .fillMaxWidth()
          .background(LocalThemeColors.current.backgroundBase)
          .navigationBarsPadding()
          .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        OutlinedButton(
          onClick = {
            scope.launch {
              if (!sharePicture(context, picture(layer), "month-$month", title)) say(R.string.picture_not_shared)
            }
          },
          modifier = Modifier.weight(1f).heightIn(min = Metrics.control),
        ) {
          Icon(painterResource(R.drawable.ic_share), null, Modifier.size(18.dp))
          Spacer(Modifier.width(8.dp))
          Text(stringResource(R.string.picture_share))
        }
        Button(
          onClick = {
            scope.launch {
              if (savePicture(context, picture(layer), "pochical-$month.png")) {
                // Saved out of sight, in the phone's pictures: felt as well as said (spec/haptics.md).
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                say(R.string.picture_saved)
              } else {
                say(R.string.picture_not_saved)
              }
            }
          },
          modifier = Modifier.weight(1f).heightIn(min = Metrics.control),
        ) {
          Icon(painterResource(R.drawable.ic_download), null, Modifier.size(18.dp))
          Spacer(Modifier.width(8.dp))
          Text(stringResource(R.string.picture_save))
        }
      }
      SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = Metrics.control + 24.dp))
    }
  }
}

/** The picture as it is drawn now. */
private suspend fun picture(layer: GraphicsLayer) = layer.toImageBitmap().asAndroidBitmap()

private fun changeOptions(settings: DeviceSettingsState, change: (MarkOptions) -> MarkOptions) =
  settings.change { it.copy(picture = it.picture.copy(options = change(it.picture.options))) }

/**
 * A month as it goes out in a picture: its name, the weekdays and its days as the calendar draws
 * them in the picture's look and the テーマ's colors, light or dark as [dark] says, and ポチカル with
 * the app's icon, so whoever gets it can find the app by the same dog. Days of the months around
 * are faded with nothing on them, and there is no today or memo: the picture is for any day.
 */
@Composable
fun MonthPicture(month: YearMonth, calendar: OwnCalendar, device: DeviceSettings, dark: Boolean, modifier: Modifier = Modifier) {
  val week = device.week
  val look = device.look.withOptions { device.picture.options }
  val weeks = remember(month, week.start) { monthWeeks(month, week.start) }
  val shown = remember(calendar, weeks) { calendar.shown(month.atDay(1), month.atEndOfMonth()) }
  val byId = remember(calendar) { calendar.patterns.associateBy { it.id } }
  val country = remember { holidayCountry() }
  CompositionLocalProvider(LocalThemeColors provides device.theme.colors(dark)) {
    val colors = LocalThemeColors.current
    Column(modifier.background(colors.backgroundBase).padding(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 12.dp)) {
      Text(
        month.monthWithYear(device.heading.english),
        Modifier.padding(start = 4.dp, end = 4.dp, bottom = 12.dp),
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        color = colors.textPrimary,
      )
      WeekdayRow(week, Modifier.padding(bottom = 8.dp))
      Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        for (days in weeks) {
          Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (day in days) {
              val inMonth = YearMonth.from(day) == month
              val entry = if (inMonth) shown[day] else null
              DayCell(
                DayLook(
                  day = day,
                  entry = entry,
                  pattern = entry?.let { byId[it.shift] },
                  note = null,
                  holiday = day.holidayName(country),
                  outside = !inMonth,
                  isToday = false,
                ),
                height = 64.dp,
                colorsHoliday = week.holiday,
                onClick = {},
                enabled = false,
                modifier = Modifier.weight(1f),
                style = look,
              )
            }
          }
        }
      }
      Row(
        Modifier.fillMaxWidth().padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        AppIcon(16)
        Text(stringResource(R.string.picture_app), fontSize = 11.sp, color = colors.textQuaternary)
      }
    }
  }
}

/** The app's icon as the store shows it: its dog on its ground, rounded. */
@Composable
private fun AppIcon(size: Int) {
  Box(Modifier.size(size.dp).clip(RoundedCornerShape(size.dp * 0.22f)).background(colorResource(R.color.ic_launcher_background))) {
    // The adaptive icon's foreground spans 108 of which the middle 72 show.
    Image(painterResource(R.mipmap.ic_launcher_foreground), null, Modifier.requiredSize(size.dp * 1.5f), contentScale = ContentScale.Fit)
  }
}
