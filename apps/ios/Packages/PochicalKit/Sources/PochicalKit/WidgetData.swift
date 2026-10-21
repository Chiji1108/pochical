import Foundation
import PochicalDesign
import SQLiteData

// What a widget reads (spec/widgets.md): the database the app keeps in the
// App Group, opened read-only, as only the app writes, and the device's
// settings the app keeps there too.

/// Reads the app's database, read-only, as the widgets do; nil until the
/// app has made it. The read waits while the app opens it, as opening may
/// erase it and set it up again (appDatabase).
public func readWidgetDatabase<T>(_ read: (Database) throws -> T?) throws -> T? {
  try coordinated(writing: false, at: sharedDatabaseURL()) { url in
    guard FileManager.default.fileExists(atPath: url.path()) else { return nil }
    var configuration = Configuration()
    configuration.readonly = true
    return try DatabasePool(path: url.path(), configuration: configuration).read(read)
  }
}

extension OwnCalendar {
  /// The person's own calendar as the database holds it.
  public init(_ db: Database) throws {
    self.init(
      days: try DayRow.fetchAll(db), patterns: try PatternRow.fetchAll(db),
      patternOrder: try PatternOrderRow.fetchAll(db), orders: try RepeatOrderRow.fetchAll(db))
  }
}

extension DeviceSettings {
  /// The settings as the app last kept them, its defaults before then.
  public static func kept(
    store: UserDefaults = UserDefaults(suiteName: appGroup) ?? .standard
  ) -> DeviceSettings {
    store.data(forKey: Settings.storeKey).flatMap {
      try? JSONDecoder().decode(DeviceSettings.self, from: $0)
    } ?? DeviceSettings()
  }
}

/// The signed-in user's id as their groups know them, for the widgets and
/// the notification service, which have no session of their own:
/// AccountSession's, kept in the App Group by it alone as it changes.
public func widgetMeID(
  store: UserDefaults = UserDefaults(suiteName: appGroup) ?? .standard
) -> String? {
  store.string(forKey: SignedInUser.key)
}

/// Where AccountSession keeps the signed-in user's id for the widgets.
enum SignedInUser {
  static let key = "userID"
}

/// Who a widget can be set to (spec/widgets.md, 次の休み with someone or a
/// group): a group itself, or someone in it, kept by the group they were
/// picked under.
public enum WidgetChoice: Hashable, Sendable {
  case group(String)
  case member(groupID: String, userID: String)

  /// As kept in a widget's configuration: g:{group} or m:{group}:{user}.
  public var id: String {
    switch self {
    case .group(let group): "g:\(group)"
    case .member(let group, let user): "m:\(group):\(user)"
    }
  }

  public init?(id: String) {
    let parts = id.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
    switch (parts.first, parts.count) {
    case ("g", 2): self = .group(parts[1])
    case ("m", 3): self = .member(groupID: parts[1], userID: parts[2])
    default: return nil
    }
  }

  public var groupID: String {
    switch self {
    case .group(let group), .member(let group, _): group
    }
  }
}

/// One of the person's groups and who else is in it, as a widget's
/// editing lists them: in the order the app lists groups, each group's
/// members in the order they joined, the person aside.
public struct WidgetChoiceGroup: Sendable {
  public var group: GroupRow
  public var members: [GroupMemberRow]
}

/// The person's groups and who is in each, for picking.
public func widgetChoices(me: String?, in db: Database) throws -> [WidgetChoiceGroup] {
  let groups = try GroupRow.order(by: \.joinedAtMs).fetchAll(db)
  let members = try GroupMemberRow.where { !$0.left && !$0.deleted }.order(by: \.joinedAtMs)
    .fetchAll(db)
  return groups.map { group in
    WidgetChoiceGroup(
      group: group,
      members: members.filter { $0.groupID == group.id && $0.userID != me })
  }
}

/// Who `choice` is now, with their days around `today`; nil once the
/// person or they have left that group.
public func widgetCompanion(
  _ choice: WidgetChoice, me: String?, around today: Day, in db: Database
) throws -> WidgetCompanion? {
  guard let group = try GroupRow.where({ $0.id.eq(choice.groupID) }).fetchOne(db) else {
    return nil
  }
  let members = try GroupSync.members(
    of: group.id, from: today.adding(days: -1),
    through: today.adding(days: Widgets.offLookaheadDays), in: db)
  let mine = members.first { $0.userID == me }
  let meShown = WidgetWith(
    kind: .person, name: mine?.name ?? "", groupID: group.id, photoID: mine?.photoID ?? "")
  switch choice {
  case .group:
    return WidgetCompanion(
      with: WidgetWith(kind: .group, name: group.name, groupID: group.id, mark: group.mark),
      people: members.filter { $0.userID != me }, me: meShown)
  case .member(_, let userID):
    guard let them = members.first(where: { $0.userID == userID }) else { return nil }
    return WidgetCompanion(
      with: WidgetWith(
        kind: .person, name: them.name, groupID: group.id, photoID: them.photoID),
      people: [them], me: meShown)
  }
}
