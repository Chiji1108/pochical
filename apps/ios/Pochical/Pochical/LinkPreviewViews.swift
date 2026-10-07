import PochicalDesign
import PochicalKit
import SwiftUI

// A link's page in a chat (spec/chat.md, Previews): the card under a
// message's words, and the bar over the composer while it is written.

/// A link preview's picture, from the device or else the server.
struct PreviewImage: View {
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.themeColors) private var colors
  let imageID: String
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        colors.fillTertiary
      }
    }
    .task(id: imageID) {
      if let data = try? await groupCalls.previewImage(imageID) {
        image = UIImage(data: data)
      }
    }
  }
}

/// The page under a message's words, inside its bubble: the picture cropped
/// to chatRules.linkPreviewAspect, the title on two lines at most, and the
/// site's name. A tap opens the link.
struct LinkPreviewCard: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.openURL) private var openURL
  let preview: LinePreview
  let mine: Bool

  var body: some View {
    // A tap, not a button: a button would take the long press, which is
    // the line's, for its reactions and menu.
    VStack(alignment: .leading, spacing: 0) {
      if !preview.imageID.isEmpty {
        Color.clear
          .aspectRatio(Chat.linkPreviewAspect, contentMode: .fit)
          .overlay { PreviewImage(imageID: preview.imageID) }
          .clipped()
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(preview.title)
          .font(.footnote.weight(.semibold))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        Text(preview.site)
          .font(.caption2)
          .opacity(0.7)
          .lineLimit(1)
      }
      .foregroundStyle(mine ? colors.accentOnFill : colors.textPrimary)
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(mine ? Color.black.opacity(0.12) : colors.backgroundCard)
    .clipShape(RoundedRectangle(cornerRadius: Radius.md))
    .contentShape(.rect)
    .onTapGesture {
      if let url = URL(string: preview.url) {
        openURL(url)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isLink)
    .accessibilityHint("押すとリンクを開く")
  }
}

/// What the composer holds of its words' first link: asked for, read, or
/// taken off with ×.
struct ComposerPreview: Equatable {
  let url: String
  /// The page once read; nil while it is asked for.
  var preview: LinePreview?
  /// Read and none found: nothing shows.
  var none = false
}

/// The page over the composer while a message with a link is written: the
/// site, the title (読み込み中… until it comes) and the picture small at the
/// end, with × to send without it.
struct ComposerPreviewBar: View {
  @Environment(\.themeColors) private var colors
  let state: ComposerPreview
  let onRemove: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      RoundedRectangle(cornerRadius: Radius.xxs)
        .fill(colors.accentDefault)
        .frame(width: 3)
      VStack(alignment: .leading, spacing: 2) {
        Text(state.preview?.site ?? URL(string: state.url)?.host() ?? state.url)
          .font(.caption.weight(.semibold))
          .foregroundStyle(colors.accentDefault)
          .lineLimit(1)
        Text(state.preview?.title ?? "読み込み中…")
          .font(.footnote)
          .foregroundStyle(state.preview == nil ? colors.textTertiary : colors.textSecondary)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let imageID = state.preview?.imageID, !imageID.isEmpty {
        PreviewImage(imageID: imageID)
          .frame(width: 40, height: 40)
          .clipShape(RoundedRectangle(cornerRadius: Radius.xs))
      }
      Button("リンクのプレビューを外す", systemImage: "xmark", action: onRemove)
        .labelStyle(.iconOnly)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(colors.textSecondary)
        .frame(width: Metrics.touch, height: Metrics.touch)
    }
    .frame(height: 48)
    .padding(.leading, 16)
    .padding(.trailing, 4)
    .padding(.top, 4)
  }
}
