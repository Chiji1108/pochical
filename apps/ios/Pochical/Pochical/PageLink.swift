import SwiftUI
import UIKit

/// A link to a page over the tabs, for a page there or a tab to open
/// another, as NavigationLink does in a stack of SwiftUI's own. Its page is
/// pushed by the navigator (RootNavigator), as every page over the tabs
/// is: one SwiftUI pushed on the stack itself would be its own, popped by
/// SwiftUI as the navigator took it away (a notification's chat over its
/// tab alone), the page just opened with it. The page is drawn by the
/// link, kept current with what the link's page has, as a
/// NavigationLink's destination is.
struct PageLink<Label: View, Destination: View>: View {
  @Environment(\.rootNavigator) private var navigator
  @State private var page = LinkedPage()
  /// The arrow at the end that says the row opens a page, as a list's
  /// NavigationLink draws it; none on a card that draws its own.
  var indicator = true
  @ViewBuilder let destination: () -> Destination
  @ViewBuilder let label: () -> Label

  var body: some View {
    Button {
      navigator?.open(.linked(page))
    } label: {
      HStack(spacing: 8) {
        label()
          .frame(maxWidth: .infinity, alignment: .leading)
        if indicator {
          Image(systemName: "chevron.forward")
            .font(.body.weight(.semibold))
            .imageScale(.small)
            .foregroundStyle(.tertiary)
            .accessibilityHidden(true)
        }
      }
      .contentShape(.rect)
    }
    // Its words in the text's color, as a link's are, not the accent's.
    .tint(.primary)
    .background(LinkedContent(page: page, content: AnyView(destination())))
  }
}

extension PageLink where Label == Text {
  init(_ title: String, @ViewBuilder destination: @escaping () -> Destination) {
    self.init(destination: destination) { Text(title) }
  }
}

/// A page a link opened, identified as itself, drawing what its link last
/// gave it.
@MainActor @Observable final class LinkedPage: Hashable {
  fileprivate(set) var content = AnyView(EmptyView())

  nonisolated static func == (a: LinkedPage, b: LinkedPage) -> Bool { a === b }
  nonisolated func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
}

/// The link's page drawn anew whenever the link's page is: UIKit's update
/// of the link's place, as SwiftUI hands what it draws to UIKit.
private struct LinkedContent: UIViewRepresentable {
  let page: LinkedPage
  let content: AnyView

  func makeUIView(context: Context) -> UIView {
    let view = UIView()
    view.isUserInteractionEnabled = false
    return view
  }

  func updateUIView(_ view: UIView, context: Context) {
    page.content = content
  }
}

/// A linked page over the tabs, as its link draws it.
struct LinkedPageView: View {
  let page: LinkedPage

  var body: some View {
    page.content
  }
}
