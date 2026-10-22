import PochicalDesign
import SwiftUI

/// In place of the app while the server does not know the session
/// (spec/sync-protocol.md, Reconnecting): signed out or deleted on another
/// device or by request, or the server set wrong for a while. Nothing more
/// syncs, and nothing on the device is cleared but by the person:
/// もう一度つなぐ tries the session again, and はじめから使う, asked first,
/// erases what the device holds and starts as a new install does, where
/// signing in with Apple again brings back an account's data.
struct SessionEndedScreen: View {
  @Environment(\.themeColors) private var colors
  let tryAgain: () -> Void
  let startAfresh: () -> Void
  @State private var confirming = false

  var body: some View {
    VStack(spacing: 16) {
      Spacer()
      Text("ログアウトされています")
        .font(.title3.bold())
        .foregroundStyle(colors.textPrimary)
      Text(
        "ほかの端末でログアウトしたか、アカウントが削除されたため、同期できません。この端末のデータは、はじめから使うまで消しません。"
      )
      .font(.subheadline)
      .foregroundStyle(colors.textTertiary)
      Spacer()
      Button { confirming = true } label: {
        Text("はじめから使う")
          .font(.headline)
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
      Button("もう一度つなぐ", action: tryAgain)
        .font(.subheadline)
    }
    .multilineTextAlignment(.center)
    .padding(.horizontal, 20)
    .padding(.bottom, 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(colors.backgroundBase)
    .alert("はじめから使いますか？", isPresented: $confirming) {
      Button("キャンセル", role: .cancel) {}
      Button("データを消してはじめる", role: .destructive, action: startAfresh)
    } message: {
      Text("この端末のデータが消えます。アカウントが残っていれば、Apple でもう一度ログインすると同じデータを使えます。")
    }
  }
}
