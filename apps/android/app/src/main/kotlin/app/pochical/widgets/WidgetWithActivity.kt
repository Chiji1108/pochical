package app.pochical.widgets

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.lifecycle.lifecycleScope
import app.pochical.PochicalTheme
import app.pochical.R
import app.pochical.groups.LocalGroupCalls
import app.pochical.groups.MemberAvatar
import app.pochical.kit.PhotoShelf
import app.pochical.kit.PochicalKit
import app.pochical.kit.SyncedSettings
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesIntoMap
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.binding
import dev.zacsweers.metrox.android.ActivityKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Editing 次の休み and これから (spec/widgets.md, 次の休み with someone or a group; これから with
 * someone): 一緒に休む人 or 一緒に見る人, nobody or someone from each of the person's groups under
 * the group's name, 次の休み offering the group itself (みんな休み) too. Android's widget
 * configuration screen, opened as the widget is placed and from its long-press as it is edited.
 */
@ContributesIntoMap(AppScope::class, binding<Activity>())
@ActivityKey
@Inject
class WidgetWithActivity(private val settings: SyncedSettings, private val kit: PochicalKit) : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return finish()
    // Left with back, the widget stays as it was, or is placed as nobody's: Android 10 and 11 ask
    // this as a widget is placed, which configuration_optional leaves to the person from 12 on.
    setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    val widget =
      when (AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId)?.provider?.className) {
        NextOffWidgetReceiver::class.java.name -> NextOffWidget()
        UpcomingWidgetReceiver::class.java.name -> UpcomingWidget()
        else -> return finish()
      }
    val offs = widget is NextOffWidget
    val glanceId = GlanceAppWidgetManager(this).getGlanceIdBy(widgetId)
    lifecycleScope.launch {
      val device = settings.settings.first()
      val kept = WidgetChoice.of(widget.getAppWidgetState<Preferences>(this@WidgetWithActivity, glanceId)[WidgetChoice.KEY])
      setContent {
        // The members' faces come through the group calls, as the group's screens' do.
        CompositionLocalProvider(LocalGroupCalls provides kit.groups) {
          PochicalTheme(device) {
          WidgetWithPage(offs, kept, onBack = ::finish) { picked ->
            lifecycleScope.launch {
              updateAppWidgetState(this@WidgetWithActivity, PreferencesGlanceStateDefinition, glanceId) { state ->
                state.toMutablePreferences().apply { if (picked == null) remove(WidgetChoice.KEY) else set(WidgetChoice.KEY, picked.id) }
              }
              widget.update(this@WidgetWithActivity, glanceId)
              finish()
            }
          }
          }
        }
      }
    }
  }

  @OptIn(ExperimentalMaterial3Api::class)
  @Composable
  private fun WidgetWithPage(offs: Boolean, kept: WidgetChoice?, onBack: () -> Unit, onPick: (WidgetChoice?) -> Unit) {
    val values = kit.database.values()
    val groups by remember(values) { values.choiceGroups() }.collectAsState(emptyList())
    Scaffold(
      topBar = {
        TopAppBar(
          title = { Text(stringResource(if (offs) R.string.widget_with_off else R.string.widget_with_upcoming)) },
          navigationIcon = {
            IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), contentDescription = stringResource(R.string.back)) }
          },
        )
      },
    ) { padding ->
      LazyColumn(Modifier.selectableGroup(), contentPadding = padding) {
        item { Choice(stringResource(R.string.widget_with_nobody), kept == null) { onPick(null) } }
        for (group in groups) {
          item(key = group.group.id) {
            Text(
              group.group.name,
              style = MaterialTheme.typography.titleSmall,
              color = MaterialTheme.colorScheme.primary,
              modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 8.dp).semantics { heading() },
            )
          }
          if (offs) {
            val whole = WidgetChoice.Group(group.group.id)
            item(key = whole.id) { Choice(stringResource(R.string.widget_with_everyone), kept == whole) { onPick(whole) } }
          }
          items(group.members, key = { "${group.group.id}:${it.userId}" }) { member ->
            val choice = WidgetChoice.Member(group.group.id, member.userId)
            Choice(member.name, kept == choice, face = { MemberAvatar(member.name, member.photoId, PhotoShelf.Group(group.group.id), 32.dp) }) {
              onPick(choice)
            }
          }
        }
      }
    }
  }

  @Composable
  private fun Choice(title: String, picked: Boolean, face: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    ListItem(
      headlineContent = { Text(title) },
      leadingContent = { RadioButton(selected = picked, onClick = null) },
      trailingContent = face,
      modifier = Modifier.selectable(selected = picked, role = Role.RadioButton, onClick = onClick),
    )
  }
}
