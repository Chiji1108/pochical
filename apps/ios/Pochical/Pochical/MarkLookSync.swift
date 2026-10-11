import PochicalKit
import SQLiteData
import SwiftUI

/// Tells the account the shape the user's marks are drawn in whenever it
/// is not what the account last said, so their groups draw them so
/// (spec/sync-protocol.md, Profile): as they change their スタイル, and
/// again at each start while a send has not gone through.
struct MarkLookSync: ViewModifier {
  @Environment(\.groupCalls) private var groupCalls
  @Fetch(MarkLookToSendRequest()) private var toSend: MarkLook? = nil

  func body(content: Content) -> some View {
    content.task(id: toSend) {
      guard let toSend else { return }
      // Offline, it goes at the next start or change; the account's word
      // coming back clears it.
      try? await groupCalls.setMarkLook(toSend)
    }
  }
}
