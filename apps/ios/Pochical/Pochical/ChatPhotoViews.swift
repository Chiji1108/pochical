import Photos
import PochicalDesign
import PochicalKit
import SwiftUI

// Photos in a chat (spec/chat.md, Photos): a photo's line, the photo
// opened large, and the photos waiting above the composer.

/// The box a photo fits in, and how far from square it may be before its
/// ends are cut, as LINE crops a panorama in the chat (/design's
/// photoSize).
private enum PhotoBox {
  static let width: CGFloat = 220
  static let height: CGFloat = 260
  static let widest: CGFloat = 2
  static let tallest: CGFloat = 0.5

  /// The size a photo takes in the chat.
  static func size(of photo: LinePhoto) -> CGSize {
    let aspect = min(
      max(CGFloat(photo.width) / CGFloat(max(photo.height, 1)), tallest), widest)
    let width = min(Self.width, Self.height * aspect)
    return CGSize(width: width, height: width / aspect)
  }
}

/// One of the group's photos as it loads: from the device, else fetched.
struct ChatPhotoImage: View {
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.themeColors) private var colors
  @Environment(\.displayScale) private var displayScale
  let photo: LinePhoto
  let groupID: String
  var fit = false
  /// The size it is drawn at in the chat, decoded no larger; nil to draw
  /// it whole, opened large.
  var shown: CGSize?
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .aspectRatio(contentMode: fit ? .fit : .fill)
      } else {
        colors.fillTertiary
      }
    }
    .task(id: photo.id) {
      guard let data = try? await groupCalls.photo(photo.id, in: groupID),
        let whole = UIImage(data: data)
      else { return }
      // A line's photo decoded at the size it shows, not 2048 pixels.
      if let shown {
        let scale = max(
          shown.width / whole.size.width, shown.height / whole.size.height) * displayScale
        image =
          await whole.byPreparingThumbnail(
            ofSize: CGSize(width: whole.size.width * scale, height: whole.size.height * scale))
          ?? whole
      } else {
        image = whole
      }
    }
  }
}

/// A photo sent as a line: no bubble, rounded, the size it was sent at
/// within the box; dimmed with 送信中 while it uploads.
struct PhotoLine: View {
  @Environment(\.themeColors) private var colors
  let photo: LinePhoto
  let groupID: String
  let waiting: Bool

  var body: some View {
    let size = PhotoBox.size(of: photo)
    ChatPhotoImage(photo: photo, groupID: groupID, shown: size)
      .frame(width: size.width, height: size.height)
      .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(colors.borderDefault, lineWidth: 1)
      )
      .overlay {
        if waiting {
          // Dimmed as a photo's controls are, 送信中 said to screen
          // readers in the label below.
          ZStack {
            colors.mediaDim
            ProgressView().tint(colors.mediaText).controlSize(.large)
          }
          .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
      }
      .accessibilityElement()
      .accessibilityLabel(waiting ? "送信中の写真" : "写真")
      .accessibilityAddTraits(.isImage)
  }
}

/// A photo opened large (/design's PhotoViewer): whole on black, × to
/// close, pulled down to close too, and 保存 for a chat's.
struct PhotoViewer: View {
  @Environment(\.dismiss) private var dismiss
  let photo: LinePhoto
  let groupID: String
  /// None for someone's face, which is theirs to keep.
  var onSave: (() -> Void)?
  @State private var pull: CGFloat = 0

  /// How far a pull down closes it.
  private static var closeAt: CGFloat { 120 }

  var body: some View {
    ZStack {
      Color.black
        .opacity(1 - min(pull / 400, 0.6))
        .ignoresSafeArea()
      ChatPhotoImage(photo: photo, groupID: groupID, fit: true)
        .offset(y: pull)
        .accessibilityLabel("写真")
    }
    .overlay(alignment: .topTrailing) {
      Button("閉じる", systemImage: "xmark") { dismiss() }
        .labelStyle(.iconOnly)
        .font(.title3.weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: Metrics.touch, height: Metrics.touch)
        .glassEffect(.regular.interactive(), in: .circle)
        .padding(16)
    }
    .overlay(alignment: .bottomTrailing) {
      if let onSave {
        Button("保存", systemImage: "square.and.arrow.down", action: onSave)
          .labelStyle(.iconOnly)
          .font(.title3.weight(.semibold))
          .foregroundStyle(.white)
          .frame(width: Metrics.touch, height: Metrics.touch)
          .glassEffect(.regular.interactive(), in: .circle)
          .padding(16)
      }
    }
    .gesture(
      DragGesture()
        .onChanged { pull = max($0.translation.height, 0) }
        .onEnded { _ in
          if pull > Self.closeAt {
            dismiss()
          } else {
            withAnimation(.spring(duration: 0.3)) { pull = 0 }
          }
        }
    )
    .preferredColorScheme(.dark)
  }
}

/// Saves one of the group's photos to the person's photo library; true
/// once saved.
func savePhoto(_ photo: LinePhoto, in groupID: String, calls: GroupCalls) async -> Bool {
  guard let data = try? await calls.photo(photo.id, in: groupID) else { return false }
  do {
    // Photos runs the change on its own queue, not the main actor's.
    try await PHPhotoLibrary.shared().performChanges { @Sendable in
      PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
    }
    return true
  } catch {
    return false
  }
}

/// A photo picked for the next send, shrunk, waiting above the composer.
struct PickedPhoto: Identifiable {
  let id = UUID().uuidString.lowercased()
  let shrunk: ShrunkPhoto
  let thumbnail: UIImage?
}

/// The photos waiting above the composer (/design's PhotoTray), each with
/// × to take it out.
struct PhotoTray: View {
  @Environment(\.themeColors) private var colors
  @Binding var photos: [PickedPhoto]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
          Group {
            if let thumbnail = photo.thumbnail {
              Image(uiImage: thumbnail).resizable().scaledToFill()
            } else {
              colors.fillTertiary
            }
          }
          .frame(width: 64, height: 64)
          .clipShape(RoundedRectangle(cornerRadius: Radius.md))
          .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(colors.borderDefault))
          .overlay(alignment: .topTrailing) {
            // On a photo's shade, ringed in the page's ground so it stands
            // off the picture.
            Button("\(index + 1)枚目の写真を外す", systemImage: "xmark") {
              withAnimation { photos.removeAll { $0.id == photo.id } }
            }
            .labelStyle(.iconOnly)
            .font(.system(size: 10, weight: .heavy))
            .foregroundStyle(colors.mediaText)
            .frame(width: 22, height: 22)
            .background(colors.mediaShade, in: Circle())
            .overlay(Circle().strokeBorder(colors.backgroundBase, lineWidth: 2))
            .offset(x: 6, y: -6)
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 12)
    }
    .accessibilityLabel("送る写真")
  }
}
