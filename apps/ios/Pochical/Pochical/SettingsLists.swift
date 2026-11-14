import PochicalDesign
import SwiftUI
import UIKit

extension View {
  /// A list of 設定 on the テーマ's own page, as /design's are, rather than
  /// the system's grouped gray.
  func settingsList() -> some View {
    modifier(SettingsList())
  }

  /// A section's rows on the quiet ground of /design's lists.
  func settingsRows() -> some View {
    modifier(SettingsRows())
  }

  /// The page's main button, as the system draws a prominent one (/design's
  /// primary): the accent's fill, a capsule, its height the system's own.
  /// Its label takes the width it is given.
  func mainButton(_ size: ControlSize = .large) -> some View {
    modifier(MainButton(size: size))
  }

  /// A button beside the main one or standing for a lesser step, as the
  /// system draws a bordered one (/design's quiet): the accent's words on
  /// its light fill, a capsule.
  func quietButton() -> some View {
    modifier(QuietButton())
  }

  /// A row standing on the page itself, as /design's segments and cards
  /// do, between the same margins as the cards of rows.
  func settingsOnPage() -> some View {
    listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets())
  }

  /// Words standing on the page, as a question over its answers: kept
  /// clear of the row's rounded corners, which would cut a first or last
  /// line's letters at the edge.
  func settingsTextOnPage() -> some View {
    padding(.vertical, 12)
      .settingsOnPage()
  }
}

private struct SettingsList: ViewModifier {
  @Environment(\.themeColors) private var colors

  func body(content: Content) -> some View {
    content
      .scrollContentBackground(.hidden)
      .readableWidth()
      .background(colors.backgroundBase)
  }
}

extension View {
  /// A page's scrolling content kept within the readable width UIKit's
  /// readable content guide gives it, as the system's Settings keeps its
  /// lists on an iPad, rather than stretched across a wide page: its rows,
  /// fields and buttons. Nothing changes where the page is no wider than
  /// that, as on a phone.
  func readableWidth() -> some View {
    modifier(ReadableWidth())
  }
}

private struct ReadableWidth: ViewModifier {
  /// How much further in than the page's margins the readable width is,
  /// on each side.
  @State private var inset: CGFloat = 0

  func body(content: Content) -> some View {
    // Further in than the safe area, as a list's own margins stay its
    // own; the guide read outside it, which is not further in.
    content
      .safeAreaPadding(.horizontal, inset)
      .background(ReadableGuide { inset = $0 })
  }
}

/// Says how much further in than its margins its readable content guide
/// is, as UIKit sizes the guide for the width and the text size.
private struct ReadableGuide: UIViewRepresentable {
  let onInset: (CGFloat) -> Void

  func makeUIView(context: Context) -> Guide {
    let view = Guide()
    view.isUserInteractionEnabled = false
    return view
  }

  func updateUIView(_ view: Guide, context: Context) {
    view.onInset = onInset
  }

  final class Guide: UIView {
    var onInset: (CGFloat) -> Void = { _ in }
    private var inset: CGFloat = 0

    override init(frame: CGRect) {
      super.init(frame: frame)
      // The guide follows the text size too.
      registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (view: Self, _) in
        view.setNeedsLayout()
      }
    }

    @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

    /// Told on the next turn of the main loop, not while SwiftUI lays the
    /// page out, which may not change the state it is laying out by.
    override func layoutSubviews() {
      super.layoutSubviews()
      let inset = max(0, readableContentGuide.layoutFrame.minX - layoutMarginsGuide.layoutFrame.minX)
      guard inset != self.inset else { return }
      self.inset = inset
      let onInset = onInset
      Task { @MainActor in onInset(inset) }
    }
  }
}

private struct SettingsRows: ViewModifier {
  @Environment(\.themeColors) private var colors

  func body(content: Content) -> some View {
    content.listRowBackground(colors.fillQuaternary)
  }
}

private struct MainButton: ViewModifier {
  @Environment(\.themeColors) private var colors
  let size: ControlSize

  func body(content: Content) -> some View {
    content
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .controlSize(size)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
  }
}

private struct QuietButton: ViewModifier {
  @Environment(\.themeColors) private var colors

  func body(content: Content) -> some View {
    content
      .buttonStyle(.bordered)
      .buttonBorderShape(.capsule)
      .tint(colors.accentDefault)
  }
}

/// 並び替え in a list's bar, and 完了 while sorting, which confirms and so
/// is prominent, as /design's and iOS 26's 完了 are.
struct SortButton: View {
  @Binding var editMode: EditMode

  var body: some View {
    let sorting = editMode.isEditing
    Button(
      sorting ? "完了" : "並び替え", systemImage: sorting ? "checkmark" : "arrow.up.arrow.down",
      role: sorting ? .confirm : nil
    ) {
      withAnimation { editMode = sorting ? .inactive : .active }
    }
  }
}
