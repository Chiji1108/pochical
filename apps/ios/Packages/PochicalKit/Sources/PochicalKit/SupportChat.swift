import Foundation
import PochicalProto

/// A line of the chat with Pochical's people (proto/pochical/v1/support.proto).
public struct SupportLine: Hashable, Sendable, Identifiable {
  /// Who put an emoji on a line, as a reaction's ids say it: the user, or
  /// Pochical's people.
  public static let me = "me"
  public static let support = "support"

  public let id: String
  /// Written by Pochical's people, not the user.
  public let fromSupport: Bool
  /// Empty once taken back.
  public let text: String
  public let sentAt: Date
  /// The line it is a reply to, by id.
  public let replyTo: String?
  /// Taken back by its writer.
  public let unsent: Bool
  /// Each emoji on it, by `SupportLine.me` or `SupportLine.support`.
  public let reactions: [LineReaction]

  public init(
    id: String, fromSupport: Bool, text: String, sentAt: Date, replyTo: String? = nil,
    unsent: Bool = false, reactions: [LineReaction] = []
  ) {
    self.id = id
    self.fromSupport = fromSupport
    self.text = text
    self.sentAt = sentAt
    self.replyTo = replyTo
    self.unsent = unsent
    self.reactions = reactions
  }

  /// Posted as Pochical's people answer, react or take a line back, told
  /// on the user's socket: what shows the chat reads it again.
  public static let answered = Notification.Name("SupportLine.answered")

  init(_ wire: Pochical_V1_SupportMessage) {
    self.init(
      id: wire.id, fromSupport: wire.fromSupport, text: wire.text,
      sentAt: Date(timeIntervalSince1970: TimeInterval(wire.sentAtMs) / 1000),
      replyTo: wire.replyTo.isEmpty ? nil : wire.replyTo, unsent: wire.unsent,
      reactions: wire.reactions.map { reaction in
        LineReaction(
          emoji: reaction.emoji,
          userIDs: (reaction.mine ? [Self.me] : []) + (reaction.support ? [Self.support] : []))
      })
  }
}

extension GroupCalls {
  /// The user's chat with Pochical's people, oldest first, and how many of
  /// the answers are not read yet.
  public func supportChat() async throws -> (lines: [SupportLine], unread: Int) {
    let answer = try await support.getSupportChat(
      request: Pochical_V1_GetSupportChatRequest(), headers: account.headers()
    ).result.get()
    return (answer.messages.map(SupportLine.init), Int(answer.unread))
  }

  /// A line to Pochical's people, its id the app's so a send tried again
  /// is kept once, with the app's version and the device it came from,
  /// and the line it is a reply to.
  public func sendSupport(
    _ text: String, id: String, device: String, replyTo: String? = nil
  ) async throws -> SupportLine {
    var request = Pochical_V1_SendSupportMessageRequest()
    request.id = id
    request.text = text
    request.device = device
    request.replyTo = replyTo ?? ""
    let answer = try await support.sendSupportMessage(request: request, headers: account.headers())
      .result.get()
    return SupportLine(answer.message)
  }

  /// The user's `emoji` put on a line or taken off; the line as it is now.
  public func reactSupport(_ emoji: String, on: Bool, line id: String) async throws -> SupportLine {
    var request = Pochical_V1_ReactSupportRequest()
    request.id = id
    request.emoji = emoji
    request.on = on
    let answer = try await support.reactSupport(request: request, headers: account.headers())
      .result.get()
    return SupportLine(answer.message)
  }

  /// One of the user's own lines taken back; the line as it is now.
  public func unsendSupport(_ id: String) async throws -> SupportLine {
    var request = Pochical_V1_UnsendSupportMessageRequest()
    request.id = id
    let answer = try await support.unsendSupportMessage(
      request: request, headers: account.headers()
    ).result.get()
    return SupportLine(answer.message)
  }

  /// The answers so far are read.
  public func markSupportRead() async throws {
    _ = try await support.markSupportRead(
      request: Pochical_V1_MarkSupportReadRequest(), headers: account.headers()
    ).result.get()
  }
}
