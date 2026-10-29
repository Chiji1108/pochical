package app.pochical.widgets

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.size
import app.pochical.kit.limitText
import app.pochical.design.Widgets
import app.pochical.kit.GroupRow
import app.pochical.kit.Values
import app.pochical.kit.groupMembers
import java.time.LocalDate
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf

// Who 次の休み and これから are set to (spec/widgets.md, 次の休み with someone or a group; これから
// with someone), as iOS's WidgetData.swift: a group itself, or someone in it, kept by the group they
// were picked under, in the widget's own Glance state.

/** Who a widget is set to: a group itself, or someone in it, kept by the group they were picked under. */
sealed interface WidgetChoice {
  val groupId: String

  /** As kept in the widget's state: g:{group} or m:{group}:{user}, as iOS keeps it. */
  val id: String

  data class Group(override val groupId: String) : WidgetChoice {
    override val id = "g:$groupId"
  }

  data class Member(override val groupId: String, val userId: String) : WidgetChoice {
    override val id = "m:$groupId:$userId"
  }

  companion object {
    /** Where a widget keeps who it is set to. */
    val KEY = stringPreferencesKey("with")

    fun of(id: String?): WidgetChoice? {
      val parts = id?.split(":") ?: return null
      return when {
        parts.size == 2 && parts[0] == "g" -> Group(parts[1])
        parts.size == 3 && parts[0] == "m" -> Member(parts[1], parts[2])
        else -> null
      }
    }
  }
}

/** Who [choice] is now, with their days around [today]; null once the person or they have left that group. */
@OptIn(ExperimentalCoroutinesApi::class)
fun Values.companion(choice: WidgetChoice, today: LocalDate): Flow<WidgetCompanion?> =
  groups().flatMapLatest { groups ->
    val group = groups.find { it.id == choice.groupId } ?: return@flatMapLatest flowOf(null)
    combine(
      groupMembers(group.id, today.minusDays(1), today.plusDays(Widgets.offLookaheadDays.toLong())),
      members(group.id),
      owner().distinctUntilChanged(),
    ) { all, rows, me ->
      // An account deleted is gone from the group, as one that left is.
      val deleted = rows.filter { it.deleted }.mapTo(HashSet()) { it.userId }
      val members = all.filterNot { it.userId in deleted }
      val mine = members.find { it.userId == me }
      val meShown = WidgetWith(WidgetWith.Kind.Person, mine?.name.orEmpty(), group.id, mine?.photoId.orEmpty())
      when (choice) {
        is WidgetChoice.Group ->
          WidgetCompanion(WidgetWith(WidgetWith.Kind.Group, group.name, group.id, mark = group.mark), members.filter { it.userId != me }, meShown)
        is WidgetChoice.Member ->
          members.find { it.userId == choice.userId }?.let { them ->
            WidgetCompanion(WidgetWith(WidgetWith.Kind.Person, them.name, group.id, them.photoId), listOf(them), meShown)
          }
      }
    }
  }

/** One of the person's groups and who else is in it, as a widget's editing lists them. */
data class ChoiceGroup(val group: GroupRow, val members: List<ChoiceMember>)

data class ChoiceMember(val userId: String, val name: String, val photoId: String)

/**
 * The person's groups in the order the app lists them, each with its members in the order they
 * joined, the person aside and those who left with them.
 */
@OptIn(ExperimentalCoroutinesApi::class)
fun Values.choiceGroups(): Flow<List<ChoiceGroup>> =
  combine(groups(), owner().distinctUntilChanged(), ::Pair).flatMapLatest { (groups, me) ->
    if (groups.isEmpty()) return@flatMapLatest flowOf(emptyList())
    combine(groups.map { group -> members(group.id) }) { members ->
      groups.mapIndexed { index, group ->
        ChoiceGroup(
          group,
          members[index].filter { !it.left && !it.deleted && it.userId != me }.map { ChoiceMember(it.userId, it.displayName, it.photoId) },
        )
      }
    }
  }

/** Who a widget is set to, by their face or the group's mark. */
@Composable
fun CompanionFace(with: WidgetWith, drawn: Drawn, size: Dp = 20.dp) {
  when (with.kind) {
    WidgetWith.Kind.Person -> WidgetFace(with.name, size)
    WidgetWith.Kind.Group -> WidgetGroupMark(with.mark, with.name, size, drawn.colors)
  }
}

/**
 * Someone's face as the group's screens draw one without a photo: the first letter of their name
 * in a circle, the person's own in the accent. Photos stand so until widgets show them.
 */
@Composable
fun WidgetFace(name: String, size: Dp, me: Boolean = false) {
  val colors = GlanceTheme.colors
  Box(
    GlanceModifier.size(size).background(if (me) colors.primary else colors.secondaryContainer).cornerRadius(size / 2),
    contentAlignment = Alignment.Center,
  ) {
    Words(limitText(name.trim(), 1), if (me) colors.onPrimary else colors.onSecondaryContainer, (size.value * 0.45f).sp, bold = true)
  }
}

/**
 * Asking for who the widget is set to to be picked again, once the person or they have left the
 * group they were picked under: in the secondary color in the middle of its room, opening that group.
 */
@Composable
fun PickAgain(whom: String, groupId: String, drawn: Drawn) {
  Box(GlanceModifier.fillMaxSize().opening(groupLink(groupId)), contentAlignment = Alignment.Center) {
    Words(if (drawn.english) "Pick who again" else "${whom}を\n選び直してください", drawn.colors.secondary, 13.sp, center = true, maxLines = 2)
  }
}
