import ImageIO
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
/// In the chat it is shrunk to the size it shows and kept so (Thumbnails),
/// so a line scrolled back into sight draws at once rather than reading and
/// shrinking its 2048 pixels again.
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
    let kept = image ?? pixels.flatMap { Thumbnails.kept(photo.id, pixels: $0) }
    Group {
      if let kept {
        Image(uiImage: kept)
          .resizable()
          .aspectRatio(contentMode: fit ? .fit : .fill)
      } else {
        colors.fillTertiary
      }
    }
    .task(id: photo.id) {
      // Held here too, so a thumbnail the system lets go while the line
      // shows is not lost from it.
      if let pixels, let kept = Thumbnails.kept(photo.id, pixels: pixels) {
        image = kept
        return
      }
      guard let data = try? await groupCalls.photo(photo.id, in: groupID) else { return }
      if let pixels {
        let id = photo.id
        image = await Task.detached(priority: .userInitiated) {
          Thumbnails.make(data, id: id, pixels: pixels)
        }.value
      } else {
        image = UIImage(data: data)
      }
    }
  }

  /// The longer side, in pixels, the photo is decoded at to fill the size
  /// it shows; nil opened large.
  private var pixels: Int? {
    guard let shown, photo.width > 0, photo.height > 0 else { return nil }
    let width = CGFloat(photo.width)
    let height = CGFloat(photo.height)
    let scale = min(max(shown.width / width, shown.height / height) * displayScale, 1)
    return Int((max(width, height) * scale).rounded(.up))
  }
}

/// The chat's photos shrunk to the size they show, kept while the app runs
/// (the system lets them go when memory runs short).
enum Thumbnails {
  nonisolated(unsafe) private static let cache: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.totalCostLimit = 48 * 1024 * 1024
    return cache
  }()

  nonisolated private static func key(_ id: String, _ pixels: Int) -> NSString {
    "\(id)@\(pixels)" as NSString
  }

  nonisolated static func kept(_ id: String, pixels: Int) -> UIImage? {
    cache.object(forKey: key(id, pixels))
  }

  /// The photo at most `pixels` on its longer side, read straight from its
  /// bytes at that size rather than decoded whole and shrunk, and kept.
  nonisolated static func make(_ data: Data, id: String, pixels: Int) -> UIImage? {
    let options = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: pixels,
    ] as CFDictionary
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let shrunk = CGImageSourceCreateThumbnailAtIndex(source, 0, options)
    else { return nil }
    let image = UIImage(cgImage: shrunk)
    cache.setObject(image, forKey: key(id, pixels), cost: shrunk.bytesPerRow * shrunk.height)
    return image
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
/// close, pulled down to close too, and 保存 for a chat's, which says here
/// whether it was saved, as the screen under it is covered.
struct PhotoViewer: View {
  @Environment(\.dismiss) private var dismiss
  let photo: LinePhoto
  let groupID: String
  /// Saves it, true once saved; none for someone's face, which is theirs
  /// to keep.
  var onSave: (() async -> Bool)?
  @State private var pull: CGFloat = 0
  @State private var notice: String?

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
        Button("保存", systemImage: "square.and.arrow.down") {
          Task { say(await onSave() ? "写真を保存しました" : "保存できませんでした") }
        }
          .labelStyle(.iconOnly)
          .font(.title3.weight(.semibold))
          .foregroundStyle(.white)
          .frame(width: Metrics.touch, height: Metrics.touch)
          .glassEffect(.regular.interactive(), in: .circle)
          .padding(16)
      }
    }
    .overlay(alignment: .top) {
      if let notice {
        NoticeCapsule(words: notice)
          .transition(.opacity.combined(with: .move(edge: .top)))
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

  private func say(_ words: String) {
    withAnimation { notice = words }
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2.5))
      if notice == words {
        withAnimation { notice = nil }
      }
    }
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
