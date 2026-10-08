import Foundation
import PochicalProto

/// A line of the chat with Pochical's people (proto/pochical/v1/support.proto).
public struct SupportLine: Hashable, Sendable, Identifiable {
  public let id: String
  /// Written by Pochical's people, not the user.
  public let fromSupport: Bool
  public let text: String
  public let sentAt: Date

  public init(id: String, fromSupport: Bool, text: String, sentAt: Date) {
    self.id = id
    self.fromSupport = fromSupport
    self.text = text
    self.sentAt = sentAt
  }

  /// Posted as Pochical's people answer, told on the user's socket: what
  /// shows the chat reads it again.
  public static let answered = Notification.Name("SupportLine.answered")

  init(_ wire: Pochical_V1_SupportMessage) {
    self.init(
      id: wire.id, fromSupport: wire.fromSupport, text: wire.text,
      sentAt: Date(timeIntervalSince1970: TimeInterval(wire.sentAtMs) / 1000))
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
  /// is kept once, with the app's version and the device it came from.
  public func sendSupport(_ text: String, id: String, device: String) async throws -> SupportLine {
    var request = Pochical_V1_SendSupportMessageRequest()
    request.id = id
    request.text = text
    request.device = device
    let answer = try await support.sendSupportMessage(request: request, headers: account.headers())
      .result.get()
    return SupportLine(answer.message)
  }

  /// The answers so far are read.
  public func markSupportRead() async throws {
    _ = try await support.markSupportRead(
      request: Pochical_V1_MarkSupportReadRequest(), headers: account.headers()
    ).result.get()
  }
}
