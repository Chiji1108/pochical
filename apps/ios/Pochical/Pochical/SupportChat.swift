import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// 設定's way into the chat with the people who make Pochical (/design's
/// SupportRow): a chat's row as the hub's list draws one, with the app's
/// icon, the latest line or the draft left in it, and the answers not read
/// yet. The chat's socket is open while the row is on screen, as a group's
/// while it is, so its latest line is current.
struct SupportRow: View {
  @State private var meID = GroupCalls.knownUserID
  @State private var open = false

  var body: some View {
    ChatRow(
      placeID: ChatPlace.supportID, threadID: groupThread, me: meID ?? "",
      label: "作っている人とチャット"
    ) {
      AppIconChoice.current.image(size: 28)
    } onOpen: {
      open = true
    }
    .listRowInsets(EdgeInsets())
    .placeSocket(ChatPlace.supportID)
    .navigationDestination(isPresented: $open) { SupportChatScreen() }
  }
}

/// The chat with Pochical's people (/design's SupportChatPage): a chat of
/// its place like any other (spec/chat.md, Where a chat is kept), headed by
/// who it reaches and what does.
struct SupportChatScreen: View {
  var body: some View {
    ChatScreen(
      place: .support, threadID: groupThread, otherID: nil, head: AnyView(SupportHead())
    )
    .placeSocket(ChatPlace.supportID)
  }
}

/// Who the chat with Pochical's people reaches, and everything that does:
/// what is written, its photos, and the app and the device.
private struct SupportHead: View {
  @Environment(\.themeColors) private var colors

  var body: some View {
    VStack(spacing: 8) {
      AppIconChoice.current.image(size: 56)
      Text("ポチカルを作っている人に届きます")
        .font(.headline)
        .foregroundStyle(colors.textPrimary)
      Text("使いにくいところ、ほしい機能、不具合のこと。ちょっとしたことでも、気軽に書いてください。返事は数日のうちに、ここに届きます。")
        .font(.subheadline)
        .foregroundStyle(colors.textSecondary)
      Text("書いたことや写真と一緒に、アプリと端末の情報が届きます。\n\(AppDevice.words)")
        .font(.caption)
        .foregroundStyle(colors.textTertiary)
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: 300)
    .frame(maxWidth: .infinity)
    .padding(.vertical, 16)
  }
}

extension View {
  /// Holds the socket of the chats' place `placeID` open while the view is
  /// on screen and the app in front, for the chat's lines, outbox and
  /// someone writing, as a group's page holds its group's
  /// (spec/sync-protocol.md, Sockets).
  func placeSocket(_ placeID: String) -> some View {
    modifier(PlaceSocket(placeID: placeID))
  }
}

private struct PlaceSocket: ViewModifier {
  @Environment(\.groupSockets) private var groupSockets
  @Environment(\.account) private var account
  @Environment(\.scenePhase) private var scenePhase
  @Dependency(\.defaultDatabase) private var database
  @State private var socket: SyncClient?
  let placeID: String

  func body(content: Content) -> some View {
    content
      .environment(\.groupSocket, socket)
      .task(id: scenePhase == .active) {
        guard scenePhase == .active else { return }
        let (client, hold) = await groupSockets.open(placeID, account: account, database: database)
        socket = client
        while !Task.isCancelled {
          try? await Task.sleep(for: .seconds(3600))
        }
        await groupSockets.close(hold, of: placeID)
      }
  }
}
