import PochicalDesign
import PochicalKit
import SwiftUI

/// In place of the app while the device is still erasing after ログアウト
/// or アカウントを削除 (spec/sync-protocol.md, Sockets): the account is
/// already signed out or deleted on the server, so it says that, and that
/// this device's data is still being cleared; nothing of the user shows.
/// The session tries again by itself; 再試行 tries at once.
struct ErasingScreen: View {
  @Environment(\.themeColors) private var colors
  let erasing: AccountSession.Erasing
  let retry: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      Spacer()
      if !erasing.failed {
        ProgressView()
      }
      Text(title)
        .font(.title3.bold())
        .foregroundStyle(colors.textPrimary)
      Text(erasing.failed ? "まだ消せていません。しばらくすると自動でもう一度試します。" : "この端末のデータを消しています。")
        .font(.subheadline)
        .foregroundStyle(colors.textTertiary)
      Spacer()
      if erasing.failed {
        Button(action: retry) {
          Text("再試行")
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: Metrics.control)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(colors.accentFill)
        .foregroundStyle(colors.accentOnFill)
      }
    }
    .multilineTextAlignment(.center)
    .padding(.horizontal, 20)
    .padding(.bottom, 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(colors.backgroundBase)
  }

  private var title: String {
    switch erasing.why {
    case .signedOut: "ログアウトしました"
    case .deleted: "アカウントを削除しました"
    }
  }
}
