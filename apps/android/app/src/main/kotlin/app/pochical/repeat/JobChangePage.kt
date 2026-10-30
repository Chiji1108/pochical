package app.pochical.repeat

import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.SeekableTransitionState
import androidx.compose.animation.core.rememberTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSerializable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.MID_MONTH_STARTS
import app.pochical.PageNavigation
import app.pochical.PeriodChoices
import app.pochical.R
import app.pochical.RowEnd
import app.pochical.SectionRow
import app.pochical.SettingsPage
import app.pochical.SettingsRow
import app.pochical.SettingsSection
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.pattern
import app.pochical.calendar.rememberReducedMotion
import app.pochical.calendar.slashText
import app.pochical.design.JobTemplate
import app.pochical.design.Metrics
import app.pochical.design.ReadyPatterns
import app.pochical.kit.ShiftPeriod
import app.pochical.kit.firstPick
import app.pochical.kit.readyCopies
import app.pochical.patterns.ReadyPatternChips
import app.pochical.patterns.chosenPatterns
import app.pochical.rowColors
import app.pochical.segmentShapes
import java.time.LocalDate
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/** Where 新しい仕事にする's questions are. */
@Serializable
private sealed interface JobStep {
  @Serializable data object Day : JobStep

  @Serializable data object Kind : JobStep

  /** The ways of working, those that repeat or those of a roster. */
  @Serializable data class Templates(val rotation: Boolean) : JobStep

  /** The patterns to use, the kind of work's to start with. */
  @Serializable data class Patterns(val template: String) : JobStep

  /** The order, typed with the patterns chosen. */
  @Serializable data class Order(val template: String, val patterns: List<String>) : JobStep

  /** A roster's period: by the month, or from a day mid-month. */
  @Serializable data class Period(val patterns: List<String>) : JobStep

  /** The day a period starting mid-month starts on. */
  @Serializable data class PeriodDay(val patterns: List<String>) : JobStep
}

private val templates = ReadyPatterns.rosterTemplates + ReadyPatterns.rotationTemplates

internal fun jobTemplate(id: String): JobTemplate = templates.first { it.id == id }

/** The ready-made patterns by id, as the questions show them. */
internal val readyById = readyCopies(ReadyPatterns.all.map { it.id }).associate { it.id to it.pattern }

/**
 * 設定 › シフトパターン › 新しい仕事にする (/design's JobChangePage; spec/shift-patterns.md, Changing
 * jobs): the day the new job starts, then the questions はじめの設定 asks, ending with its patterns
 * taking over and its order from that day, or for a roster's work, its period as the calendar's page.
 */
@Composable
fun JobChangePage(navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val settings = LocalDeviceSettings.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  var start by rememberSaveable { mutableStateOf(nextMonthStart().toString()) }
  val first = LocalDate.parse(start)
  var steps by rememberSerializable { mutableStateOf(listOf<JobStep>(JobStep.Day)) }
  var picked by rememberSerializable { mutableStateOf(emptySet<String>()) }
  var typing by rememberSaveable(stateSaver = OrderTyping.saver) { mutableStateOf(OrderTyping(emptyList(), first)) }
  var pickingDay by rememberSaveable { mutableStateOf(false) }
  var periodStart by rememberSaveable { mutableIntStateOf(settings.device.period.firstPick) }
  // While the new job is kept, once: a second tap waits.
  var finishing by remember { mutableStateOf(false) }
  var confirming by rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  val step = steps.last()
  fun go(next: JobStep) {
    steps = steps + next
  }
  // A step back is a question back, the first one leaving.
  val back = { if (steps.size > 1) steps = steps.dropLast(1) else navigation.back() }
  // The questions move in and out as iOS's do, a step back following the back gesture.
  val reduceMotion = rememberReducedMotion()
  val shownSteps = remember { SeekableTransitionState(steps) }
  val moving = rememberTransition(shownSteps, label = "steps")
  LaunchedEffect(steps) { if (reduceMotion) shownSteps.snapTo(steps) else shownSteps.animateTo(steps) }
  PredictiveBackHandler(enabled = steps.size > 1) { gesture ->
    val before = steps.dropLast(1)
    try {
      gesture.collect { if (!reduceMotion) shownSteps.seekTo(it.progress, before) }
      steps = before
    } catch (e: CancellationException) {
      shownSteps.snapTo(steps)
      throw e
    }
  }

  fun finish(ids: List<String>, sequence: List<String>, anchor: LocalDate, period: ShiftPeriod? = null) {
    if (finishing) return
    finishing = true
    scope.launch {
      days.changeJob(ids, sequence, first, anchor)
      // A roster's pages become the period its shifts come for, once its patterns are kept.
      period?.let { picked -> settings.change { it.copy(period = picked) } }
      // The order fills the days without ポチポチ入力: the calendar offers the reminders as it shows.
      if (sequence.isNotEmpty()) settings.change { it.copy(reminderOfferWaiting = true) }
      navigation.back()
    }
  }

  fun choose(template: JobTemplate, ids: List<String>) =
    chooseJob(
      template,
      ids,
      first,
      onFinish = { patterns, sequence, anchor -> finish(patterns, sequence, anchor) },
      onOrder = { sequence ->
        typing = OrderTyping(sequence, first)
        go(JobStep.Order(template.id, ids))
      },
      onPeriod = { go(JobStep.Period(ids)) },
    )

  moving.AnimatedContent(
    transitionSpec = {
      val on = if (targetState.size > initialState.size) 1 else -1
      if (reduceMotion) {
        EnterTransition.None togetherWith ExitTransition.None
      } else {
        (slideInHorizontally { it * on } + fadeIn()) togetherWith (slideOutHorizontally { -it * on / 4 } + fadeOut())
      }
    },
    contentKey = { it.size },
  ) { shown ->
    val step = shown.last()
    if (step is JobStep.Order) {
      SettingsPage(
        jobOrderTitle(jobTemplate(step.template)),
        onBack = back,
        collapsing = false,
        actions = { TextButton(onClick = { confirming = true }, enabled = typing.sequence.isNotEmpty()) { Text(stringResource(R.string.entering_done)) } },
      ) { padding ->
        JobOrderCalendar(
          typing,
          { typing = it },
          step.patterns,
          cover = OrderCover.From(first),
          before = calendar,
          modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
        )
      }
    } else {
      SettingsPage(if (shown.size == 1) stringResource(R.string.job_change) else "", onBack = back, collapsing = false) { padding ->
        LazyColumn(contentPadding = padding) {
          when (step) {
            JobStep.Day -> {
              item { Footnote(stringResource(R.string.job_day_header)) }
              item {
                SettingsSection(footnote = stringResource(R.string.job_day_note)) {
                  row { SettingsRow(stringResource(R.string.job_first_day), R.drawable.ic_event, onClick = { pickingDay = true }, value = first.slashText, end = RowEnd.None) }
                }
              }
              item { Next(stringResource(R.string.job_next)) { go(JobStep.Kind) } }
            }
            JobStep.Kind -> {
              item { Question(stringResource(R.string.job_repeats_title), stringResource(R.string.job_repeats_note)) }
              item { SectionRow(0, 2) { Option("🔁", stringResource(R.string.job_repeats_yes), stringResource(R.string.job_repeats_yes_note)) { go(JobStep.Templates(rotation = true)) } } }
              item { SectionRow(1, 2) { Option("📋", stringResource(R.string.job_repeats_no), stringResource(R.string.job_repeats_no_note)) { go(JobStep.Templates(rotation = false)) } } }
            }
            is JobStep.Templates -> {
              item { Question(stringResource(R.string.job_kind_title), stringResource(R.string.job_kind_note)) }
              val templates = if (step.rotation) ReadyPatterns.rotationTemplates else ReadyPatterns.rosterTemplates
              templates.forEachIndexed { index, template ->
                item(key = template.id) {
                  SectionRow(index, templates.size) {
                    TemplateRow(template) {
                      picked = template.patternIds.toSet()
                      go(JobStep.Patterns(template.id))
                    }
                  }
                }
              }
            }
            is JobStep.Patterns -> {
              val template = jobTemplate(step.template)
              item {
                val (title, note) = patternsQuestion(template)
                Question(title, note)
              }
              item { ReadyPatternChips(picked, { picked = it }, Modifier.fillMaxWidth().padding(16.dp), needed = template.needed) }
              if (template.needed.isNotEmpty()) item { Footnote(stringResource(R.string.job_patterns_needed)) }
              item {
                Next(stringResource(if (template.asksMore) R.string.job_next else R.string.job_done), enabled = picked.isNotEmpty()) {
                  choose(template, chosenPatterns(picked))
                }
              }
            }
            // By the month first, ending the questions in one tap.
            is JobStep.Period -> {
              item { Question(stringResource(R.string.period_question_title), stringResource(R.string.period_question_note)) }
              item {
                SectionRow(0, 2) {
                  Option("🗓️", stringResource(R.string.period_question_month), stringResource(R.string.period_question_month_note)) {
                    finish(step.patterns, emptyList(), first, ShiftPeriod())
                  }
                }
              }
              item {
                SectionRow(1, 2) {
                  Option("📌", stringResource(R.string.period_question_mid_month), stringResource(R.string.period_question_mid_month_note)) {
                    go(JobStep.PeriodDay(step.patterns))
                  }
                }
              }
            }
            is JobStep.PeriodDay -> {
              item { Question(stringResource(R.string.period_question_day_title), stringResource(R.string.period_question_day_note)) }
              item { PeriodChoices(periodStart, { periodStart = it }, starts = MID_MONTH_STARTS) }
              item { Next(stringResource(R.string.job_done)) { finish(step.patterns, emptyList(), first, ShiftPeriod(periodStart)) } }
            }
            is JobStep.Order -> Unit
          }
        }
      }
    }
  }
  if (confirming && step is JobStep.Order) {
    AlertDialog(
      onDismissRequest = { confirming = false },
      title = { Text(stringResource(R.string.job_confirm_title, first.slashText)) },
      text = { Text(stringResource(R.string.job_day_note)) },
      confirmButton = {
        TextButton(
          onClick = {
            confirming = false
            finish(step.patterns, typing.sequence, typing.anchor)
          }
        ) {
          Text(stringResource(R.string.job_confirm))
        }
      },
      dismissButton = { TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
  if (pickingDay) DayPickerDialog(first, onPick = { start = it.toString() }, onDismiss = { pickingDay = false })
}

@Composable
private fun Question(title: String, note: String) {
  Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
    Text(note, style = MaterialTheme.typography.bodyMedium, color = LocalThemeColors.current.textTertiary)
  }
}

@Composable
private fun Option(emoji: String, title: String, note: String, onClick: () -> Unit) {
  SettingsRow(title, icon = null, onClick = onClick, supporting = note, leading = { Text(emoji, style = MaterialTheme.typography.titleLarge) })
}

/** A way of working: its name and note, with its order's days or the keys a roster's work gives. */
@Composable
private fun TemplateRow(template: JobTemplate, onClick: () -> Unit) {
  SettingsRow(
    template.title,
    icon = null,
    onClick = onClick,
    supportingContent = {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(template.note)
        val sequence = template.sequence
        if (!template.custom && sequence != null) SequenceTiles(sequence, readyById, weekly = template.weekly)
        else if (!template.custom) KeysPreview(template.patternIds, readyById)
      }
    },
  )
}

/** On to the next question. */
@Composable
private fun Next(title: String, enabled: Boolean = true, onClick: () -> Unit) {
  Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
    Button(onClick = onClick, shapes = ButtonDefaults.shapes(), enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) { Text(title) }
  }
}
