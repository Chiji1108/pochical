import Intents
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import Synchronization
import UserNotifications

/// Puts a chat line's notification as a message from its writer
/// (spec/chat.md, Notifications): their face and name, and for the group's
/// chat the group's name and mark, as the system shows a conversation, and
/// words the notification that a group ends soon. What it cannot read yet,
/// before the app has the group, shows as it came.
final class NotificationService: UNNotificationServiceExtension {
  /// What to show should iOS end the extension first: as it came, in the
  /// app's words.
  private var cut: (() -> Void)?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    // Not for the user signed in: the device went on as someone else after
    // its token was sent. Nothing of it is shown, neither who wrote nor
    // what: only that something came. Delivering no notification at all
    // takes the filtering entitlement Apple grants on request.
    guard isForSignedIn(request.content.userInfo, me: widgetMeID()) else {
      let blank = UNMutableNotificationContent()
      blank.body = "別のアカウントへの通知です"
      contentHandler(blank)
      return
    }
    nonisolated(unsafe) let show = contentHandler
    // Worded before anything is waited for, so it is worded however the
    // extension ends.
    nonisolated(unsafe) let content = Self.withWords(request.content)
    let id = request.identifier
    let once = Once()
    cut = { once.run { show(content) } }
    Task { @MainActor in
      let message = await Self.message(from: content, id: id)
      once.run { show(message) }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    cut?()
  }

  /// The notification as a message from its writer, or as it came.
  @MainActor private static func message(
    from content: UNNotificationContent, id: String
  ) async -> UNNotificationContent {
    let payload = content.userInfo
    // The chat with Pochical's people stays a plain notification: only
    // they write there, so it has no writer of its own to show. So does
    // the one that a group ends soon (spec/sync-protocol.md, A group's
    // end), worded already: the group's own, of no line and no writer.
    guard let line = NotifiedLine(id: id, payload: payload),
      line.groupID != ChatPlace.supportID,
      let authorID = payload["authorId"] as? String,
      let from = from(line, authorID: authorID)
    else { return content }
    // The system shows a group's conversation with its writer's name
    // already, so its words go alone, as a one-to-one chat's.
    guard let worded = content.mutableCopy() as? UNMutableNotificationContent else {
      return content
    }
    if from.group != nil, let sent = sentBody(content), sent.key.hasPrefix(PushWords.groupKey) {
      let alone = PushWords(
        key: PushWords.chatKey + sent.key.dropFirst(PushWords.groupKey.count),
        args: Array(sent.args.dropFirst()))
      worded.body = words(alone)
    }
    let intent = intent(for: line, from: from, authorID: authorID, content: worded)
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    try? await interaction.donate()
    return (try? worded.updating(from: intent)) ?? worded
  }

  /// The alert as the server sent it (spec/sync-protocol.md, Push).
  private static func sentAlert(_ content: UNNotificationContent) -> [String: Any]? {
    (content.userInfo["aps"] as? [String: Any])?["alert"] as? [String: Any]
  }

  /// The body's key and arguments as the server sent them.
  private static func sentBody(_ content: UNNotificationContent) -> PushWords? {
    guard let alert = sentAlert(content), let key = alert["loc-key"] as? String,
      let args = alert["loc-args"] as? [String]
    else { return nil }
    return PushWords(key: key, args: args)
  }

  /// Whether the app has words for `key`: the bundle answers the key
  /// itself for one it has none for.
  private static func hasWords(for key: String) -> Bool {
    Bundle.main.localizedString(forKey: key, value: nil, table: nil) != key
  }

  /// `sent` as the device says it now (`PushWords.words`), in the app's
  /// strings.
  private static func words(_ sent: PushWords) -> String {
    sent.words(
      known: hasWords,
      format: { Bundle.main.localizedString(forKey: $0, value: nil, table: nil) },
      in: .current, today: .today)
  }

  /// The notification as the system worded it, but where its wording is
  /// not the device's (spec/sync-protocol.md, Push): a body whose key the
  /// app has no words for, which the system has none for either, is what
  /// stands in for it, and that a group ends soon says its day
  /// (`PushWords.words`); a title the app has no words for is none, the
  /// system heading the notification with the app's name.
  private static func withWords(_ content: UNNotificationContent) -> UNNotificationContent {
    guard let alert = sentAlert(content),
      let worded = content.mutableCopy() as? UNMutableNotificationContent
    else { return content }
    if let sent = sentBody(content), !sent.saysItsFormat(known: hasWords) {
      worded.body = words(sent)
    }
    if let title = alert["title-loc-key"] as? String, !hasWords(for: title) {
      worded.title = ""
    }
    return worded
  }

  /// Who the line is from, as the app keeps them in the App Group.
  private static func from(_ line: NotifiedLine, authorID: String) -> NotifiedFrom? {
    try? readWidgetDatabase { db in
      try notifiedFrom(
        groupID: line.groupID, threadID: line.threadID, authorID: authorID,
        me: widgetMeID(), in: db)
    }
  }

  @MainActor private static func intent(
    for line: NotifiedLine, from: NotifiedFrom, authorID: String,
    content: UNNotificationContent
  ) -> INSendMessageIntent {
    let writer = person(from.writer, id: authorID)
    let group = from.group
    // A group's conversation is one of more than two: the user and the
    // writer among them, as the system counts the people in it.
    let recipients = group.flatMap { _ in
      from.me.map { [person($0, id: "me", isMe: true), writer] }
    }
    let intent = INSendMessageIntent(
      recipients: recipients,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: group.map { INSpeakableString(spokenPhrase: $0.name) },
      conversationIdentifier: "\(line.groupID)/\(line.threadID)",
      serviceName: nil,
      sender: writer,
      attachments: nil)
    if let group, let mark = picture(of: WidgetGroupMark(group: group, size: pictureSize)) {
      intent.setImage(mark, forParameterNamed: \.speakableGroupName)
    }
    return intent
  }

  @MainActor private static func person(
    _ shown: WidgetWith, id: String, isMe: Bool = false
  ) -> INPerson {
    INPerson(
      personHandle: INPersonHandle(value: id, type: .unknown),
      nameComponents: nil,
      displayName: shown.name,
      image: picture(of: WidgetFace(person: shown, size: pictureSize, me: isMe)),
      contactIdentifier: nil,
      customIdentifier: id,
      isMe: isMe)
  }

  /// The edge a face or mark is drawn at, in points, for the system to
  /// shrink: larger than any spot it shows one.
  private static let pictureSize: CGFloat = 60

  /// A face or mark as the widgets draw it, in the テーマ's light colors.
  @MainActor private static func picture(of view: some View) -> INImage? {
    let renderer = ImageRenderer(
      content: view.environment(\.themeColors, Theme.pochical.colors(.light)))
    renderer.scale = 3
    return renderer.uiImage?.pngData().map { INImage(imageData: $0) }
  }
}

/// Runs the first closure given it, whichever thread comes first.
private final class Once: Sendable {
  private let done = Mutex(false)

  func run(_ body: () -> Void) {
    let first = done.withLock { done in
      defer { done = true }
      return !done
    }
    if first { body() }
  }
}
