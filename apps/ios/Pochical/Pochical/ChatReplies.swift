import PochicalDesign
import PochicalKit
import SwiftUI

// Replies (返信; /design's BubbleQuote and the composer's reply bar): a
// line answering another shows that line inside its bubble, and a tap
// there goes to it.

/// The line a reply answers, as its quote shows it.
struct LineQuote: Hashable {
  let seq: Int64
  /// Who wrote it; none while the device does not hold it.
  var writer: String?
  /// It in one line of words (spec/chat.md, quotes).
  let words: String
  /// Its photo, shown small beside the words.
  var photo: LinePhoto?
}

/// The quote over a reply's words, in the bubble's own color, over a thin
/// rule across the bubble.
struct BubbleQuote: View {
  let quote: LineQuote
  let groupID: String
  let onOpen: () -> Void

  var body: some View {
    Button(action: onOpen) {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 8) {
          VStack(alignment: .leading, spacing: 2) {
            if let writer = quote.writer {
              Text(writer)
                .font(.caption.weight(.semibold))
                .opacity(0.85)
            }
            Text(quote.words)
              .font(.footnote)
              .opacity(0.8)
              .lineLimit(1)
          }
          if let photo = quote.photo {
            QuoteThumbnail(photo: photo, groupID: groupID)
          }
        }
        Rectangle()
          .frame(height: 1)
          .opacity(0.25)
          // Across the bubble, past its padding.
          .padding(.horizontal, -12)
      }
      .multilineTextAlignment(.leading)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(quote.writer ?? "")「\(quote.words)」への返信")
    .accessibilityHint("返信元を表示")
  }
}

/// A quoted photo, small and square.
private struct QuoteThumbnail: View {
  let photo: LinePhoto
  let groupID: String

  var body: some View {
    ChatPhotoImage(photo: photo, groupID: groupID, shown: CGSize(width: 32, height: 32))
      .frame(width: 32, height: 32)
      .clipShape(RoundedRectangle(cornerRadius: Radius.xs))
      .accessibilityHidden(true)
  }
}

/// A bar over the composer, as /design's quote: a rule in the accent, what
/// it is quiet over what it holds, a picture small at the end when there
/// is one, and × to stop. Answering a line, editing one's own, and a
/// link's page all take it.
struct ComposerBar<Picture: View>: View {
  @Environment(\.themeColors) private var colors
  let title: String
  let words: String
  let stop: String
  let onStop: () -> Void
  @ViewBuilder let picture: () -> Picture

  var body: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.caption2.weight(.semibold))
          .foregroundStyle(colors.textTertiary)
          .lineLimit(1)
        Text(words)
          .font(.caption)
          .foregroundStyle(colors.textQuaternary)
          .lineLimit(1)
      }
      .padding(.leading, 12)
      .overlay(alignment: .leading) {
        RoundedRectangle(cornerRadius: Radius.xxs)
          .fill(colors.accentDefault)
          .frame(width: 3)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      picture()
      Button(stop, systemImage: "xmark", action: onStop)
        .labelStyle(.iconOnly)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(colors.textSecondary)
        .frame(width: Metrics.touch, height: Metrics.touch)
    }
    .padding(.leading, 16)
    .padding(.trailing, 4)
    .padding(.top, 4)
  }
}

extension ComposerBar where Picture == EmptyView {
  init(title: String, words: String, stop: String, onStop: @escaping () -> Void) {
    self.init(title: title, words: words, stop: stop, onStop: onStop) { EmptyView() }
  }
}

/// Over the composer while answering a line: whom, what, and × to stop.
struct ReplyBar: View {
  let quote: LineQuote
  let groupID: String
  let onStop: () -> Void

  var body: some View {
    ComposerBar(
      title: "\(quote.writer ?? "メンバー")に返信", words: quote.words, stop: "返信をやめる",
      onStop: onStop
    ) {
      if let photo = quote.photo {
        QuoteThumbnail(photo: photo, groupID: groupID)
      }
    }
  }
}
