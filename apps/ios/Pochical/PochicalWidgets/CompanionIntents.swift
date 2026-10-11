import AppIntents
import GRDB
import PochicalKit
import WidgetKit

// Editing 次の休み and これから (spec/widgets.md, 次の休み with someone or a
// group; これから with someone): who the widget is set to, from each of the
// person's groups under the group's name, kept as the group and the member
// in it.

/// Someone, or with 次の休み a whole group, as a widget's editing lists
/// them.
struct CompanionEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "一緒に休む人"
  static let defaultQuery = CompanionQuery()

  /// WidgetChoice's id: g:{group} or m:{group}:{user}.
  let id: String
  let name: String
  /// The group they were picked under, as a second line.
  let groupName: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(groupName)")
  }
}

/// Someone in one of the person's groups, as これから's editing lists them.
struct MemberEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "一緒に見る人"
  static let defaultQuery = MemberQuery()

  let id: String
  let name: String
  let groupName: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(groupName)")
  }
}

/// The person's groups and who is in each, as the database holds them.
private func choiceGroups() -> [WidgetChoiceGroup] {
  guard let database = try? widgetDatabase() else { return [] }
  return (try? database.read { try widgetChoices(me: widgetMeID(), in: $0) }) ?? []
}

struct CompanionQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [CompanionEntity] {
    let all = choiceGroups().flatMap(Self.entities)
    return identifiers.compactMap { id in all.first { $0.id == id } }
  }

  /// Each group under its name: the group itself (みんな休み), then its
  /// members.
  func suggestedEntities() async throws -> IntentItemCollection<CompanionEntity> {
    IntentItemCollection(
      sections: choiceGroups().map { choice in
        IntentItemSection(
          "\(choice.group.name)", items: Self.entities(choice).map { IntentItem($0) })
      })
  }

  private static func entities(_ choice: WidgetChoiceGroup) -> [CompanionEntity] {
    let group = choice.group
    let whole = CompanionEntity(
      id: WidgetChoice.group(group.id).id, name: "みんな休み", groupName: group.name)
    return [whole]
      + choice.members.map {
        CompanionEntity(
          id: WidgetChoice.member(groupID: group.id, userID: $0.userID).id, name: $0.shownName,
          groupName: group.name)
      }
  }
}

struct MemberQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [MemberEntity] {
    let all = choiceGroups().flatMap(Self.entities)
    return identifiers.compactMap { id in all.first { $0.id == id } }
  }

  func suggestedEntities() async throws -> IntentItemCollection<MemberEntity> {
    IntentItemCollection(
      sections: choiceGroups().map { choice in
        IntentItemSection(
          "\(choice.group.name)", items: Self.entities(choice).map { IntentItem($0) })
      })
  }

  private static func entities(_ choice: WidgetChoiceGroup) -> [MemberEntity] {
    choice.members.map {
      MemberEntity(
        id: WidgetChoice.member(groupID: choice.group.id, userID: $0.userID).id,
        name: $0.shownName, groupName: choice.group.name)
    }
  }
}

/// 次の休み's editing: 一緒に休む人, nobody unless picked.
struct NextOffIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "次の休み"
  static let description = IntentDescription("一緒に休む人を選ぶと、その人と一緒に休める日を数えます。")

  @Parameter(title: "一緒に休む人")
  var with: CompanionEntity?
}

/// これから's editing: 一緒に見る人, nobody unless picked.
struct UpcomingIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "これから"
  static let description = IntentDescription("一緒に見る人を選ぶと、その人の日も並べます。")

  @Parameter(title: "一緒に見る人")
  var with: MemberEntity?
}
