package app.pochical.repeat

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.pochical.R
import app.pochical.calendar.OwnCalendar
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.weekday
import app.pochical.design.JobTemplate
import app.pochical.kit.holidayShift
import app.pochical.kit.holidaysOffByDefault
import java.time.LocalDate

// The questions はじめの設定 and 新しい仕事にする both ask (spec/shift-patterns.md, Changing jobs),
// one piece for both: each draws them its own way, as large cards or as rows of a list.

/** Whether more is asked after the patterns: an order to type, or a roster's period; only a weekly order ends there. */
val JobTemplate.asksMore: Boolean
  get() = !weekly

/** The patterns that stay picked, as the kind of work's order needs them. */
val JobTemplate.needed: Set<String>
  get() = if (custom) emptySet() else sequence.orEmpty().toSet()

/** The patterns question's heading and words, 自分で作る asking for them all. */
@Composable
fun patternsQuestion(template: JobTemplate): Pair<String, String> =
  if (template.custom) {
    stringResource(R.string.job_patterns_custom_title) to stringResource(R.string.job_patterns_custom_note)
  } else {
    stringResource(R.string.job_patterns_title) to stringResource(R.string.job_patterns_note)
  }

/**
 * The patterns chosen: a weekly order ends the questions from the Sunday of the week [first] is in,
 * any other order goes on to be typed ([onOrder]), and a roster's work to the period its shifts are
 * handed out for ([onPeriod]), which becomes the calendar's page.
 */
fun chooseJob(
  template: JobTemplate,
  ids: List<String>,
  first: LocalDate,
  onFinish: (ids: List<String>, sequence: List<String>, anchor: LocalDate) -> Unit,
  onOrder: (sequence: List<String>) -> Unit,
  onPeriod: () -> Unit,
) {
  val sequence = template.sequence
  when {
    sequence != null && template.weekly -> onFinish(ids, sequence, first.minusDays(first.weekday.toLong()))
    sequence != null -> onOrder(sequence)
    else -> onPeriod()
  }
}

/** The order's page title: the day of its first pattern to press, or 並びを入れる for one typed from nothing. */
@Composable
fun jobOrderTitle(template: JobTemplate): String {
  val first = template.sequence?.firstOrNull()?.let { readyById[it]?.name }
  return if (template.custom || first == null) stringResource(R.string.job_order_title) else stringResource(R.string.job_order_title_first, first)
}

/**
 * The order typed on the calendar with the ready-made patterns [ids] as its keys, holidays shown as
 * the order will set them: off when it reads as office hours.
 */
@Composable
fun JobOrderCalendar(
  typing: OrderTyping,
  onTyping: (OrderTyping) -> Unit,
  ids: List<String>,
  cover: OrderCover,
  before: OwnCalendar,
  modifier: Modifier = Modifier,
) {
  val keys = ids.mapNotNull(readyById::get)
  val offShift = holidayShift(keys.filter { it.countsAsOff }.map { it.id })
  val holidaysOff = offShift != null && holidaysOffByDefault(typing.sequence, typing.anchor) { readyById[it]?.countsAsOff == true }
  RepeatCalendar(
    typing,
    onTyping,
    cover = cover,
    patterns = keys,
    modifier = modifier,
    before = before,
    holidayShift = offShift.takeIf { holidaysOff },
    holidayCountry = holidayCountry(),
  )
}
