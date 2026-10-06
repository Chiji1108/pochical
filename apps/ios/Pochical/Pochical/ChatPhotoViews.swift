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
  let photo: LinePhoto
  let groupID: String
  var fit = false
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
      if let data = try? await groupCalls.photo(photo.id, in: groupID) {
        image = UIImage(data: data)
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
    ChatPhotoImage(photo: photo, groupID: groupID)
      .frame(width: size.width, height: size.height)
      .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(colors.borderDefault, lineWidth: 1)
      )
      .overlay {
        if waiting {
          ZStack {
            Color.black.opacity(0.35)
            VStack(spacing: 6) {
              ProgressView().tint(.white)
              Text("送信中").font(.caption).foregroundStyle(.white)
            }
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
/// close, pulled down to close too, and 保存.
struct PhotoViewer: View {
  @Environment(\.dismiss) private var dismiss
  let photo: LinePhoto
  let groupID: String
  let onSave: () -> Void
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
      Button("保存", systemImage: "square.and.arrow.down", action: onSave)
        .labelStyle(.iconOnly)
        .font(.title3.weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: Metrics.touch, height: Metrics.touch)
        .glassEffect(.regular.interactive(), in: .circle)
        .padding(16)
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
      HStack(spacing: 12) {
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
          .overlay(alignment: .topTrailing) {
            Button("\(index + 1)枚目の写真を外す", systemImage: "xmark") {
              withAnimation { photos.removeAll { $0.id == photo.id } }
            }
            .labelStyle(.iconOnly)
            .font(.caption2.weight(.bold))
            .foregroundStyle(colors.inverseText)
            .frame(width: 24, height: 24)
            .background(colors.inverseBackground, in: Circle())
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
