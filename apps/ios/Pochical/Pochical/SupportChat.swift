import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// 設定's way into the chat with the people who make Pochical (/design's
/// SupportRow): a chat's row as the hub's list draws one, with the app's
/// icon, the latest line or the draft left in it, and the answers not read
/// yet. The chat's socket is open while 設定 shows, as a group's while it
/// does, so its latest line is current.
struct SupportRow: View {
  @State private var meID = GroupCalls.knownUserID

  var body: some View {
    ChatRow(
      placeID: ChatPlace.supportID, threadID: groupThread, me: meID ?? "",
      label: "作っている人とチャット"
    ) {
      AppIconChoice.current.image(size: 28)
    } onOpen: {
      // Over the tabs, as a tapped answer's notification opens it.
      Notifications.shared.openingSupport = true
    }
    .listRowInsets(EdgeInsets())
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
