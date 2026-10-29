package app.pochical

import android.util.Log
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSerializable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.serialization.NavBackStackSerializer
import androidx.navigation3.ui.NavDisplay
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.OwnDays
import app.pochical.design.JobTemplate
import app.pochical.design.Metrics
import app.pochical.design.ReadyPatterns
import app.pochical.kit.AccountState
import app.pochical.kit.DeviceSettings
import app.pochical.kit.FirstRun
import app.pochical.kit.ShiftPeriod
import app.pochical.kit.firstPick
import app.pochical.patterns.ReadyPatternChips
import app.pochical.patterns.chosenPatterns
import app.pochical.repeat.JobOrderCalendar
import app.pochical.repeat.KeysPreview
import app.pochical.repeat.OrderCover
import app.pochical.repeat.OrderTyping
import app.pochical.repeat.SequenceTiles
import app.pochical.repeat.asksMore
import app.pochical.repeat.chooseJob
import app.pochical.repeat.jobOrderTitle
import app.pochical.repeat.jobTemplate
import app.pochical.repeat.needed
import app.pochical.repeat.patternsQuestion
import app.pochical.repeat.readyById
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

// はじめの設定 (/design's DesignOnboarding; spec/shift-patterns.md, The first run), as iOS's
// Onboarding.swift: a welcome with a way back in for people who already have an account, then the
// questions 新しい仕事にする asks, as large cards, ending with the kind of work's patterns and its
// order. Android has no シフトの期間 yet, so a roster's work ends with its patterns.

/** はじめの設定 as the screens read it: whether it is done for the user the database holds, and the kit's. */
@Stable class FirstRunState(val done: Boolean, val kit: FirstRun)

/** はじめの設定 for the screens under the app's root. */
val LocalFirstRun = staticCompositionLocalOf<FirstRunState> { error("No first run above this screen") }

/** Where はじめの設定 is, each step pushed as a page, a back going a question back. */
@Serializable
private sealed interface FirstRunStep : NavKey {
  @Serializable data object Welcome : FirstRunStep

  @Serializable data object SignIn : FirstRunStep

  @Serializable data object Kind : FirstRunStep

  /** The ways of working, those that repeat or those of a roster. */
  @Serializable data class Templates(val rotation: Boolean) : FirstRunStep

  /** The patterns to use, the kind of work's to start with. */
  @Serializable data class Patterns(val template: String) : FirstRunStep

  /** The order, typed with the patterns chosen. */
  @Serializable data class Order(val template: String, val patterns: List<String>) : FirstRunStep

  /** A roster's period: by the month, or from a day mid-month. */
  @Serializable data class Period(val patterns: List<String>) : FirstRunStep

  /** The day a period starting mid-month starts on. */
  @Serializable data class PeriodDay(val patterns: List<String>) : FirstRunStep
}

/**
 * はじめの設定, in place of the tabs while it is not done and the device holds no pattern: patterns
 * arriving, from the questions or from an account signed in to, end it (AccountRoot).
 */
@Composable
fun Onboarding() {
  val days = LocalOwnDays.current
  val settings = LocalDeviceSettings.current
  val scope = rememberCoroutineScope()
  val steps =
    rememberSerializable(serializer = NavBackStackSerializer(FirstRunStep.serializer())) {
      NavBackStack<FirstRunStep>(FirstRunStep.Welcome)
    }

  // While the patterns chosen are kept, once: the questions' last button waits.
  var beginning by remember { mutableStateOf(false) }

  fun begin(ids: List<String>, sequence: List<String>, anchor: LocalDate, period: ShiftPeriod? = null) {
    if (beginning) return
    beginning = true
    val before = settings.device.period
    scope.launch {
      try {
        beginFirstRun(days, settings.change, ids, sequence, anchor, period?.let { before to it })
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        // Not kept: said to the review prompt (SyncedDays), and the questions stay to answer again.
        Log.w("PochicalFirstRun", "The first run's patterns were not kept: $e")
      } finally {
        beginning = false
      }
    }
  }

  // From this month's 1st, a weekly order from the Sunday of its week.
  fun first() = LocalDate.now().withDayOfMonth(1)

  fun choose(template: JobTemplate, ids: List<String>) =
    chooseJob(
      template,
      ids,
      first(),
      onFinish = { patterns, sequence, anchor -> begin(patterns, sequence, anchor) },
      onOrder = { steps.add(FirstRunStep.Order(template.id, ids)) },
      onPeriod = { steps.add(FirstRunStep.Period(ids)) },
    )

  // A roster's work begins, its pages the period its shifts come for.
  fun startRoster(ids: List<String>, period: ShiftPeriod) = begin(ids, emptyList(), first(), period)

  NavDisplay(
    backStack = steps,
    onBack = { steps.removeAt(steps.lastIndex) },
    transitionSpec = { slideInHorizontally { it } togetherWith slideOutHorizontally { -it / 4 } },
    popTransitionSpec = { slideInHorizontally { -it / 4 } togetherWith slideOutHorizontally { it } },
  ) { step ->
    NavEntry(step) {
      val back: () -> Unit = { steps.removeAt(steps.lastIndex) }
      when (step) {
        FirstRunStep.Welcome -> Welcome(onStart = { steps.add(FirstRunStep.Kind) }, onSignIn = { steps.add(FirstRunStep.SignIn) })
        // An account with nothing in it yet goes on with the questions.
        FirstRunStep.SignIn -> SignInStep(back, onEmpty = { steps.add(FirstRunStep.Kind) })
        FirstRunStep.Kind ->
          StepPage(
            stringResource(R.string.first_run_repeats_title),
            stringResource(R.string.first_run_repeats_note),
            back,
            footnote = stringResource(R.string.first_run_later),
          ) {
            OptionCard(stringResource(R.string.job_repeats_yes), stringResource(R.string.job_repeats_yes_note), icon = "🔁", onClick = {
              steps.add(FirstRunStep.Templates(rotation = true))
            })
            OptionCard(stringResource(R.string.job_repeats_no), stringResource(R.string.job_repeats_no_note), icon = "📋", onClick = {
              steps.add(FirstRunStep.Templates(rotation = false))
            })
          }
        is FirstRunStep.Templates ->
          StepPage(stringResource(R.string.job_kind_title), stringResource(R.string.job_kind_note), back) {
            for (template in if (step.rotation) ReadyPatterns.rotationTemplates else ReadyPatterns.rosterTemplates) {
              OptionCard(template.title, template.note, onClick = { steps.add(FirstRunStep.Patterns(template.id)) }) {
                // An order's days, or the keys a roster's work gives.
                val sequence = template.sequence
                if (!template.custom && sequence != null) SequenceTiles(sequence, readyById, weekly = template.weekly)
                else if (!template.custom) KeysPreview(template.patternIds, readyById)
              }
            }
          }
        is FirstRunStep.Patterns -> PatternsStep(jobTemplate(step.template), back, waiting = beginning, onNext = ::choose)
        is FirstRunStep.Order ->
          OrderStep(jobTemplate(step.template), step.patterns, back, waiting = beginning) { ids, sequence, anchor -> begin(ids, sequence, anchor) }
        // By the month first, as most people's come, starting in one tap.
        is FirstRunStep.Period ->
          StepPage(stringResource(R.string.period_question_title), stringResource(R.string.period_question_note), back) {
            OptionCard(
              stringResource(R.string.period_question_month),
              stringResource(R.string.period_question_month_note),
              icon = "🗓️",
              onClick = { startRoster(step.patterns, ShiftPeriod()) },
            )
            OptionCard(
              stringResource(R.string.period_question_mid_month),
              stringResource(R.string.period_question_mid_month_note),
              icon = "📌",
              onClick = { steps.add(FirstRunStep.PeriodDay(step.patterns)) },
            )
          }
        is FirstRunStep.PeriodDay -> PeriodDayStep(back, waiting = beginning) { startRoster(step.patterns, ShiftPeriod(it)) }
      }
    }
  }
}

/**
 * The app icon's poodle, just the drawing, over the name it gives and what the app is for; はじめる
 * at the foot, in reach of the thumb.
 */
@Composable
private fun Welcome(onStart: () -> Unit, onSignIn: () -> Unit) {
  val dark = isDark(LocalDeviceSettings.current.device, isSystemInDarkTheme())
  val colors = LocalThemeColors.current
  Column(
    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).safeDrawingPadding().padding(horizontal = 20.dp).padding(bottom = 12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Column(
      Modifier.weight(1f).padding(horizontal = 12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center,
    ) {
      Image(
        painterResource(if (dark) R.drawable.welcome_poodle_dark else R.drawable.welcome_poodle),
        contentDescription = null,
        Modifier.size(200.dp),
      )
      Text(
        stringResource(R.string.app_name),
        style = MaterialTheme.typography.headlineMedium,
        color = colors.textPrimary,
        modifier = Modifier.padding(top = 8.dp).semantics { heading() },
      )
      Text(
        stringResource(R.string.welcome_about),
        style = MaterialTheme.typography.bodyLarge,
        color = colors.textTertiary,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = 12.dp),
      )
    }
    Button(onClick = onStart, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
      Text(stringResource(R.string.welcome_start), style = MaterialTheme.typography.titleMedium)
    }
    TextButton(onClick = onSignIn, modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.touch).padding(top = 4.dp)) {
      Text(stringResource(R.string.welcome_sign_in))
    }
  }
}

/**
 * For someone moving to a new phone: signing in brings their data back instead of answering the
 * questions again. The account's patterns end the first run once the device has caught up with it;
 * one that brought none goes on with the questions ([onEmpty]).
 */
@Composable
private fun SignInStep(onBack: () -> Unit, onEmpty: () -> Unit) {
  val account = LocalAccount.current
  val state by account.state.collectAsState()
  StepPage(
    stringResource(R.string.first_run_sign_in_title),
    stringResource(R.string.first_run_sign_in_note),
    onBack,
    footnote = stringResource(R.string.first_run_sign_in_footnote),
  ) {
    // One that brought no patterns goes on with the questions; patterns coming later end them.
    SignInButtons(state) { if (!it.holdsPatterns) onEmpty() }
    // Before the device has its session, as offline at a first launch, the buttons wait.
    if (state !is AccountState.SignedIn) {
      Text(stringResource(R.string.account_sign_in_offline), style = MaterialTheme.typography.bodySmall, color = LocalThemeColors.current.textTertiary)
    }
  }
}

/**
 * The patterns to use, the kind of work's own already picked, with the button on kept at the foot
 * over the chips, in reach however many: 次へ when an order is asked next, else はじめる.
 */
@Composable
private fun PatternsStep(template: JobTemplate, onBack: () -> Unit, waiting: Boolean, onNext: (JobTemplate, List<String>) -> Unit) {
  var picked by rememberSerializable(template.id) { mutableStateOf(template.patternIds.toSet()) }
  val (title, note) = patternsQuestion(template)
  StepPage(
    title,
    note,
    onBack,
    foot = {
      Button(
        onClick = { onNext(template, chosenPatterns(picked)) },
        shapes = ButtonDefaults.shapes(),
        enabled = picked.isNotEmpty() && !waiting,
        modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control),
      ) {
        Text(stringResource(if (template.asksMore) R.string.job_next else R.string.welcome_start))
      }
    },
  ) {
    ReadyPatternChips(picked, { picked = it }, Modifier.fillMaxWidth(), needed = template.needed)
    if (template.needed.isNotEmpty()) {
      Text(stringResource(R.string.job_patterns_needed), style = MaterialTheme.typography.bodySmall, color = LocalThemeColors.current.textTertiary)
    }
  }
}

/**
 * The order on the calendar, filling the screen: a kind of work's own, from this month's 1st, or one
 * typed from nothing; either typed over, and the day pressed moves where it starts. A first run's
 * covers every day, and 完了 asks nothing, as no day is there yet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OrderStep(template: JobTemplate, ids: List<String>, onBack: () -> Unit, waiting: Boolean, onDone: (List<String>, List<String>, LocalDate) -> Unit) {
  val calendar by LocalOwnDays.current.calendar.collectAsStateWithLifecycle()
  var typing by
    rememberSaveable(template.id, stateSaver = OrderTyping.saver) {
      mutableStateOf(OrderTyping(template.sequence.orEmpty(), LocalDate.now().withDayOfMonth(1)))
    }
  SettingsPage(
    jobOrderTitle(template),
    onBack = onBack,
    collapsing = false,
    actions = {
      TextButton(onClick = { onDone(ids, typing.sequence, typing.anchor) }, enabled = typing.sequence.isNotEmpty() && !waiting) {
        Text(stringResource(R.string.job_done))
      }
    },
  ) { padding ->
    JobOrderCalendar(
      typing,
      { typing = it },
      ids,
      cover = OrderCover.Always,
      before = calendar,
      modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
    )
  }
}

/** The day a period starting mid-month starts on, 2日 to 28日 (15日 at first), with はじめる at the foot. */
@Composable
private fun PeriodDayStep(onBack: () -> Unit, waiting: Boolean, onStart: (Int) -> Unit) {
  val period = LocalDeviceSettings.current.device.period
  var start by rememberSaveable { mutableIntStateOf(period.firstPick) }
  StepPage(
    stringResource(R.string.period_question_day_title),
    stringResource(R.string.period_question_day_note),
    onBack,
    foot = {
      Button(onClick = { onStart(start) }, shapes = ButtonDefaults.shapes(), enabled = !waiting, modifier = Modifier.fillMaxWidth().heightIn(min = Metrics.control)) {
        Text(stringResource(R.string.welcome_start))
      }
    },
  ) {
    PeriodChoices(start, { start = it }, starts = MID_MONTH_STARTS)
  }
}

/**
 * A step: a heading with what it asks, its answers, and a note or the step's button at the foot,
 * the system's back and the bar's ← going a question back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StepPage(
  title: String,
  description: String,
  onBack: () -> Unit,
  footnote: String? = null,
  foot: (@Composable () -> Unit)? = null,
  content: @Composable ColumnScope.() -> Unit,
) {
  val colors = LocalThemeColors.current
  Scaffold(
    topBar = { TopAppBar(title = {}, navigationIcon = { BackButton(onBack) }) },
    bottomBar = {
      if (foot != null || footnote != null) {
        Column(Modifier.fillMaxWidth().safeDrawingPadding().padding(horizontal = 20.dp).padding(bottom = 12.dp)) {
          foot?.invoke()
          if (footnote != null) {
            Text(
              footnote,
              style = MaterialTheme.typography.bodySmall,
              color = colors.textQuaternary,
              textAlign = TextAlign.Center,
              modifier = Modifier.fillMaxWidth(),
            )
          }
        }
      }
    },
  ) { padding ->
    Column(
      Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 20.dp),
      verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, color = colors.textPrimary, modifier = Modifier.semantics { heading() })
        Text(description, style = MaterialTheme.typography.bodyMedium, color = colors.textTertiary)
      }
      Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
  }
}

@Composable
private fun BackButton(onBack: () -> Unit) {
  IconButton(onClick = onBack) {
    Icon(painterResource(R.drawable.ic_back), contentDescription = stringResource(R.string.back))
  }
}

/**
 * An answer as a large card (/design's OptionCard, Material's outlined card): its mark, what it is
 * with a note under it, more under that, and an arrow.
 */
@Composable
private fun OptionCard(title: String, note: String, icon: String? = null, onClick: () -> Unit, more: @Composable () -> Unit = {}) {
  val colors = LocalThemeColors.current
  OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
    Row(Modifier.padding(16.dp).heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
      if (icon != null) {
        Text(icon, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(end = 12.dp))
      }
      Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = colors.textPrimary)
        Text(note, style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
        more()
      }
      Spacer(Modifier.size(8.dp))
      Icon(painterResource(R.drawable.ic_chevron_right), contentDescription = null, tint = colors.textQuaternary)
    }
  }
}

/**
 * はじめの設定 ends: the patterns chosen become the person's, and the order repeats. Keeping them
 * ends the page that asked, its scope with it, so all else is settled before: an order fills the days
 * without ポチポチ入力, so the calendar is to offer the reminders as it shows.
 */
internal suspend fun beginFirstRun(
  days: OwnDays,
  changeSettings: ((DeviceSettings) -> DeviceSettings) -> Unit,
  ids: List<String>,
  sequence: List<String>,
  anchor: LocalDate,
  /** A roster's シフトの期間, the one it takes the place of first. */
  period: Pair<ShiftPeriod, ShiftPeriod>? = null,
) {
  if (sequence.isNotEmpty()) changeSettings { it.copy(reminderOfferWaiting = true) }
  period?.let { (_, picked) -> changeSettings { it.copy(period = picked) } }
  try {
    days.begin(ids, sequence, anchor)
  } catch (e: CancellationException) {
    // The page going as the patterns land: kept all the same, so nothing is taken back.
    throw e
  } catch (e: Exception) {
    // Not kept, so no order to offer the reminders for, and the period as it was.
    if (sequence.isNotEmpty()) changeSettings { it.copy(reminderOfferWaiting = false) }
    period?.let { (before, _) -> changeSettings { it.copy(period = before) } }
    throw e
  }
}
