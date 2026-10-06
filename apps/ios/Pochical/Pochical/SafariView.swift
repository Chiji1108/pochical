import SafariServices
import SwiftUI

/// A page opened from a chat, in the system's browser sheet over it
/// (spec/chat.md, In a message).
struct SafariView: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    SFSafariViewController(url: url)
  }

  func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// A link to open in SafariView, as a sheet's item.
struct OpenedLink: Identifiable {
  let url: URL
  var id: URL { url }
}
