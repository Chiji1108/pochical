package app.pochical.repeat

import androidx.activity.compose.BackHandler
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
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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
import app.pochical.Footnote
import app.pochical.LocalThemeColors
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.SettingsPage
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.holidayCountry
import app.pochical.calendar.pattern
import app.pochical.calendar.slashText
import app.pochical.calendar.weekday
import app.pochical.design.JobTemplate
import app.pochical.design.Metrics
import app.pochical.design.ReadyPatterns
import app.pochical.kit.readyCopies
import app.pochical.patterns.ReadyPatternChips
import app.pochical.patterns.chosenPatterns
import java.time.LocalDate
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
}

private val templates = ReadyPatterns.rosterTemplates + ReadyPatterns.rotationTemplates

private fun template(id: String): JobTemplate = templates.first { it.id == id }

/** The ready-made patterns by id, as the questions show them. */
private val readyById = readyCopies(ReadyPatterns.all.map { it.id }).associate { it.id to it.pattern }

/**
 * 設定 › シフトパターン › 新しい仕事にする (/design's JobChangePage; spec/shift-patterns.md, Changing
 * jobs): the day the new job starts, then the questions はじめの設定 asks, ending with its patterns
 * taking over and its order from that day. Android has no シフトの期間 yet, so a roster's work ends
 * with its patterns rather than asking for its period.
 */
@Composable
fun JobChangePage(navigation: PageNavigation) {
  val days = LocalOwnDays.current
  var start by rememberSaveable { mutableStateOf(nextMonthStart().toString()) }
  val first = LocalDate.parse(start)
  var steps by rememberSerializable { mutableStateOf(listOf<JobStep>(JobStep.Day)) }
  var picked by rememberSerializable { mutableStateOf(emptySet<String>()) }
  var typing by rememberSaveable(stateSaver = OrderTyping.saver) { mutableStateOf(OrderTyping(emptyList(), first)) }
  var pickingDay by rememberSaveable { mutableStateOf(false) }
  var confirming by rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  val step = steps.last()
  fun go(next: JobStep) {
    steps = steps + next
  }
  // A step back is a question back, the first one leaving.
  val back = { if (steps.size > 1) steps = steps.dropLast(1) else navigation.back() }
  BackHandler(enabled = steps.size > 1) { back() }

  fun finish(ids: List<String>, sequence: List<String>, anchor: LocalDate) {
    scope.launch {
      days.changeJob(ids, sequence, first, anchor)
      navigation.back()
    }
  }

  // The patterns chosen: a weekly order ends the questions, an order goes on to typing it, and a
  // roster's work ends with its patterns.
  fun choose(template: JobTemplate, ids: List<String>) {
    val sequence = template.sequence
    when {
      sequence != null && template.weekly -> finish(ids, sequence, first.minusDays(first.weekday.toLong()))
      sequence != null -> {
        typing = OrderTyping(sequence, first)
        go(JobStep.Order(template.id, ids))
      }
      else -> finish(ids, emptyList(), first)
    }
  }

  if (step is JobStep.Order) {
    val template = template(step.template)
    val firstName = template.sequence?.firstOrNull()?.let { readyById[it]?.name }
    SettingsPage(
      if (template.custom || firstName == null) stringResource(R.string.job_order_title) else stringResource(R.string.job_order_title_first, firstName),
      onBack = back,
      actions = { TextButton(onClick = { confirming = true }, enabled = typing.sequence.isNotEmpty()) { Text(stringResource(R.string.entering_done)) } },
    ) { padding ->
      RepeatCalendar(
        typing,
        { typing = it },
        cover = OrderCover.From(first),
        patterns = step.patterns.mapNotNull(readyById::get),
        modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
        holidayCountry = holidayCountry(),
      )
    }
    if (confirming) {
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
    return
  }

  SettingsPage(if (steps.size == 1) stringResource(R.string.job_change) else "", onBack = back) { padding ->
    LazyColumn(contentPadding = padding) {
      when (step) {
        JobStep.Day -> {
          item { Footnote(stringResource(R.string.job_day_header)) }
          item {
            ListItem(
              headlineContent = { Text(stringResource(R.string.job_first_day)) },
              trailingContent = { Text(first.slashText) },
              modifier = Modifier.clickable { pickingDay = true },
            )
          }
          item { Footnote(stringResource(R.string.job_day_note)) }
          item { Next(stringResource(R.string.job_next)) { go(JobStep.Kind) } }
        }
        JobStep.Kind -> {
          item { Question(stringResource(R.string.job_repeats_title), stringResource(R.string.job_repeats_note)) }
          item { Option("🔁", stringResource(R.string.job_repeats_yes), stringResource(R.string.job_repeats_yes_note)) { go(JobStep.Templates(rotation = true)) } }
          item { Option("📋", stringResource(R.string.job_repeats_no), stringResource(R.string.job_repeats_no_note)) { go(JobStep.Templates(rotation = false)) } }
        }
        is JobStep.Templates -> {
          item { Question(stringResource(R.string.job_kind_title), stringResource(R.string.job_kind_note)) }
          for (template in if (step.rotation) ReadyPatterns.rotationTemplates else ReadyPatterns.rosterTemplates) {
            item(key = template.id) {
              TemplateRow(template) {
                picked = template.patternIds.toSet()
                go(JobStep.Patterns(template.id))
              }
            }
          }
        }
        is JobStep.Patterns -> {
          val template = template(step.template)
          // Those in the kind of work's order stay picked, as the order needs them.
          val needed = if (template.custom) emptySet() else template.sequence.orEmpty().toSet()
          item {
            Question(
              stringResource(if (template.custom) R.string.job_patterns_custom_title else R.string.job_patterns_title),
              stringResource(if (template.custom) R.string.job_patterns_custom_note else R.string.job_patterns_note),
            )
          }
          item { ReadyPatternChips(picked, { picked = it }, Modifier.fillMaxWidth().padding(16.dp), needed = needed) }
          if (needed.isNotEmpty()) item { Footnote(stringResource(R.string.job_patterns_needed)) }
          item {
            // Only a weekly order or a roster's work has nothing more to ask.
            val asksMore = template.sequence != null && !template.weekly
            Next(stringResource(if (asksMore) R.string.job_next else R.string.job_done), enabled = picked.isNotEmpty()) {
              choose(template, chosenPatterns(picked))
            }
          }
        }
        is JobStep.Order -> Unit
      }
    }
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
  ListItem(
    headlineContent = { Text(title) },
    supportingContent = { Text(note) },
    leadingContent = { Text(emoji, style = MaterialTheme.typography.titleLarge) },
    modifier = Modifier.clickable(onClick = onClick),
  )
}

/** A way of working: its name and note, with its order's days or the keys a roster's work gives. */
@Composable
private fun TemplateRow(template: JobTemplate, onClick: () -> Unit) {
  ListItem(
    headlineContent = { Text(template.title) },
    supportingContent = {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(template.note)
        val sequence = template.sequence
        if (!template.custom && sequence != null) SequenceTiles(sequence, readyById, weekly = template.weekly)
        else if (!template.custom) KeysPreview(template.patternIds, readyById)
      }
    },
    modifier = Modifier.clickable(onClick = onClick),
  )
}

/** On to the next question. */
@Composable
private fun Next(title: String, enabled: Boolean = true, onClick: () -> Unit) {
  Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) { Text(title) }
  }
}
