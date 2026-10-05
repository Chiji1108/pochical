import OSLog
import PochicalDesign
import SwiftUI
import UIKit

/// The app's icons on the home screen, as /design's アプリアイコン has them
/// (apps/web/src/components/design-app-icon.tsx, written out by `bun run
/// icon:ios`): each set in the asset catalog, モス the app's own, and each
/// with its dark twin for a home screen set to dark icons.
enum AppIconChoice: String, CaseIterable, Identifiable {
  case moss
  case paper
  case white
  case dark

  var id: String { rawValue }

  var name: String {
    switch self {
    case .moss: "モス"
    case .paper: "紙"
    case .white: "白"
    case .dark: "ダーク"
    }
  }

  /// The icon set's name for iOS; the app's own has none.
  var alternateName: String? {
    self == .moss ? nil : "AppIcon-\(rawValue)"
  }

  /// The icon on the home screen now: iOS keeps which.
  @MainActor static var current: AppIconChoice {
    allCases.first { $0.alternateName == UIApplication.shared.alternateIconName } ?? .moss
  }

  /// The icon drawn at `size`, cut as the system cuts icons.
  func image(size: CGFloat) -> some View {
    Image("AppIconPreview-\(rawValue)")
      .resizable()
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.225, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: size * 0.225, style: .continuous)
          .strokeBorder(.black.opacity(0.12), lineWidth: 0.5)
      }
      .accessibilityHidden(true)
  }
}

/// アプリアイコン: the icons two across, the one in use outlined. iOS says
/// in its own alert that the icon changed.
struct AppIconSettings: View {
  @Environment(\.themeColors) private var colors
  @State private var current = AppIconChoice.current

  var body: some View {
    ScrollView {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
        ForEach(AppIconChoice.allCases) { icon in
          let isPicked = icon == current
          Button {
            Task { await pick(icon) }
          } label: {
            VStack(spacing: 8) {
              icon.image(size: 104)
              Text(icon.name)
                .font(.subheadline)
                .foregroundStyle(isPicked ? colors.accentDefault : colors.textPrimary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.lg))
            .overlay {
              RoundedRectangle(cornerRadius: Radius.lg)
                .strokeBorder(isPicked ? colors.accentDefault : colors.separator, lineWidth: isPicked ? 2 : 1)
            }
          }
          .buttonStyle(.plain)
          .accessibilityLabel(icon.name)
          .accessibilityAddTraits(isPicked ? .isSelected : [])
        }
      }
      .padding(16)
    }
    .background(colors.backgroundBase)
    .navigationTitle("アプリアイコン")
  }

  private func pick(_ icon: AppIconChoice) async {
    guard icon != current else { return }
    do {
      try await UIApplication.shared.setAlternateIconName(icon.alternateName)
      current = icon
    } catch {
      // iOS refused (as when it is busy); the one in use stays shown.
      Logger(subsystem: "app.pochical", category: "settings")
        .error("Could not change the app icon: \(error)")
    }
  }
}
