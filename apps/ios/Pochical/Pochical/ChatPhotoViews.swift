import Nuke
import Photos
import PochicalDesign
import PochicalKit
import SwiftUI

// Photos in a chat (spec/chat.md, Photos): a photo's line, the photo
// opened large, and the photos waiting above the composer.

/// One of the group's photos as it loads (ChatPhotoLoading), shrunk to
/// the size it shows (`shown`), over the blur its ThumbHash draws, or else
/// its grey, while it comes; drawn at once when held drawn already, as a
/// line scrolled back into sight is. One that could not be fetched keeps
/// its blur and, with `retries`, is fetched again at a tap.
struct ChatPhotoImage: View {
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.displayScale) private var displayScale
  @Environment(\.measuringLine) private var measuring
  let photo: LinePhoto
  let groupID: String
  /// The size it is drawn at, read no larger.
  let shown: CGSize
  /// Read only while on the screen, and let go once out of it: a line's
  /// photo, as the chat lays out all its lines at once.
  var whileInSight = false
  /// A tap on it, could it not be fetched, fetches it again: a line's
  /// photo, not a quote's.
  var retries = false
  @State private var image: UIImage?
  @State private var inSight = false
  /// It could not be fetched, so nothing is said to be on its way.
  @State private var failed = false
  /// Fetched again at a tap.
  @State private var tries = 0
  /// The member's own, held on the device as sent: looked for once.
  @State private var held: Bool?

  var body: some View {
    let request = ChatPhotoLoading.request(
      photo, in: groupID, pixels: pixels, calls: groupCalls, held: held ?? false)
    let wanted = !measuring && (!whileInSight || inSight)
    // Out of sight, nothing is held, not even what memory keeps.
    let kept = wanted ? image ?? ChatPhotoLoading.pipeline.cache[request]?.image : nil
    let blur = ChatPhotoLoading.blur(of: photo)
    ZStack {
      if let blur {
        // Under the photo, in the photo's own shape, so the photo comes in
        // over it.
        Image(uiImage: blur)
          .resizable()
          .aspectRatio(aspect, contentMode: .fill)
      } else if kept == nil {
        // Only in sight: the chat lays out all its lines at once.
        PhotoComing(breathing: !failed && wanted)
      }
      if let kept {
        Image(uiImage: kept)
          .resizable()
          .aspectRatio(contentMode: .fill)
          .transition(.opacity)
      } else if failed, retries {
        PhotoRetry { tries += 1 }
      }
    }
    .onScrollVisibilityChange(threshold: 0) { inSight = $0 }
    .task(id: PhotoLoad(id: photo.id, pixels: pixels, wanted: wanted, tries: tries)) {
      guard wanted else {
        image = nil
        return
      }
      let held = held ?? (ChatPhotos.heldFile(photo.id, in: groupID) != nil)
      self.held = held
      let request = ChatPhotoLoading.request(
        photo, in: groupID, pixels: pixels, calls: groupCalls, held: held)
      // Held here too, so a photo the memory lets go while the line shows
      // is not lost from it.
      if let kept = ChatPhotoLoading.pipeline.cache[request]?.image {
        image = kept
        return
      }
      // Fetched again, it is on its way again.
      failed = false
      do {
        let fetched = try await ChatPhotoLoading.pipeline.image(for: request)
        // Over its blur it comes in, as the chat apps fade a photo in over
        // its placeholder; over grey it shows at once.
        withAnimation(
          photo.thumbHash == nil ? nil : .easeOut(duration: Double(Chat.photoFadeMs) / 1000)
        ) {
          image = fetched
        }
      } catch {
        failed = !Task.isCancelled
      }
    }
  }

  /// The photo's width over its height, as it was sent.
  private var aspect: CGFloat? {
    guard photo.width > 0, photo.height > 0 else { return nil }
    return CGFloat(photo.width) / CGFloat(photo.height)
  }

  /// The longer side, in pixels, the photo is read at to fill the size it
  /// shows; nil for a photo sent without its size, fetched whole.
  private var pixels: Int? {
    ChatPhotoLoading.pixels(of: photo, shown: shown, scale: displayScale)
  }
}

/// A photo that could not be fetched: ↻ on its blur, as Signal and
/// Telegram mark one, the whole photo a button fetching it again
/// (/design's photoRetry).
private struct PhotoRetry: View {
  @Environment(\.themeColors) private var colors
  let retry: () -> Void

  var body: some View {
    Button(action: retry) {
      Image(systemName: "arrow.clockwise")
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(colors.mediaText)
        .frame(width: 48, height: 48)
        .background(colors.mediaShade, in: Circle())
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("写真をもう一度読み込む")
  }
}

/// Where a photo will be while it comes: its grey breathing, as a
/// skeleton does (/design's photoLoading), so it reads as on its way rather
/// than as a photo that is grey; still when motion is reduced or it cannot
/// come.
private struct PhotoComing: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let breathing: Bool
  @State private var faded = false

  var body: some View {
    colors.fillTertiary
      .opacity(faded ? 0.4 : 1)
      .onAppear(perform: breathe)
      .onChange(of: breathing, breathe)
  }

  private func breathe() {
    guard breathing, !reduceMotion else {
      withAnimation(.default) { faded = false }
      return
    }
    withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
      faded = true
    }
  }
}

private struct PhotoLoad: Equatable {
  let id: String
  let pixels: Int?
  let wanted: Bool
  let tries: Int
}

/// A photo sent as a line: no bubble, rounded, the size it was sent at
/// within the box, or filling its cell in an album; dimmed while it
/// uploads, ringed with how far it has gone, × in the ring stopping it.
struct PhotoLine: View {
  @Environment(\.themeColors) private var colors
  /// The chat line's cell it is drawn in, there only while near the
  /// screen: no more held than that, where a scroll view's sight told of
  /// in a cell came and went over and over, the photo with it.
  @Environment(\.lineSpace) private var lineSpace
  let photo: LinePhoto
  let groupID: String
  let waiting: Bool
  /// Stops it going up, leaving its line not sent; none where it cannot
  /// be stopped.
  var onStop: (() -> Void)?
  /// Its cell in an album, cropped to fill it, the album rounding and
  /// edging them all; none for a photo alone.
  var cell: CGSize?

  var body: some View {
    let size = cell ?? PhotoBox.size(of: photo)
    let corner = cell == nil ? Radius.lg : 0
    // Read as a photo alone would be, so a photo is fetched and kept once
    // for its line, its cell, its quote and the photo opened large.
    ChatPhotoImage(
      photo: photo, groupID: groupID, shown: PhotoBox.size(of: photo),
      whileInSight: lineSpace == nil, retries: !waiting)
      .frame(width: size.width, height: size.height)
      .clipShape(RoundedRectangle(cornerRadius: corner))
      .overlay {
        if cell == nil {
          RoundedRectangle(cornerRadius: corner).strokeBorder(colors.borderDefault, lineWidth: 1)
        }
      }
      .overlay {
        if waiting {
          PhotoGoingUp(photoID: photo.id, onStop: onStop)
            .clipShape(RoundedRectangle(cornerRadius: corner))
        }
      }
      .photoSpot(photo.id)
      .accessibilityElement(children: waiting ? .contain : .ignore)
      .accessibilityLabel(waiting ? "送信中の写真" : "写真")
      .accessibilityAddTraits(.isImage)
  }
}

/// A photo going up, dimmed as a photo's controls are: how far it has
/// gone as a ring filling, turning while it waits its turn or for the
/// network, × in it stopping it, as Signal and Telegram ring one
/// (/design's uploading). Once it is up and its line is being sent, the
/// ring stays full without ×, as stopping it can no longer work; the
/// line's clock tells it is on its way, as a line of words being sent.
private struct PhotoGoingUp: View {
  @Environment(\.themeColors) private var colors
  let photoID: String
  let onStop: (() -> Void)?

  var body: some View {
    let uploads = PhotoUploads.shared
    let sent = uploads.sent[photoID]
    let onStop = uploads.stoppable(photoID) ? onStop : nil
    ZStack {
      colors.mediaDim
      ZStack {
        Circle().fill(colors.mediaShade)
        UploadRing(sent: sent)
          .padding(4)
        if let onStop {
          Button("送信をやめる", systemImage: "xmark", action: onStop)
            .labelStyle(.iconOnly)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(colors.mediaText)
            .frame(width: 48, height: 48)
            .contentShape(Circle())
            .buttonStyle(.plain)
        }
      }
      .frame(width: 48, height: 48)
    }
    .accessibilityElement(children: .contain)
    .accessibilityValue(sent.map { "\(Int($0 * 100))%" } ?? "")
  }
}

/// How far a photo has gone up, as a ring filling from the top; a quarter
/// of it turning while it has not begun to go.
private struct UploadRing: View {
  @Environment(\.themeColors) private var colors
  let sent: Double?

  var body: some View {
    ZStack {
      Circle().stroke(colors.mediaText.opacity(0.3), style: Self.line)
      if let sent {
        Circle()
          .trim(from: 0, to: max(sent, 0.02))
          .stroke(colors.mediaText, style: Self.line)
          .rotationEffect(.degrees(-90))
          .animation(.easeOut(duration: 0.2), value: sent)
      } else {
        TurningArc()
      }
    }
  }

  fileprivate static let line = StrokeStyle(lineWidth: 3, lineCap: .round)
}

/// A quarter of the ring turning, still when motion is reduced.
private struct TurningArc: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var turned = false

  var body: some View {
    Circle()
      .trim(from: 0, to: 0.25)
      .stroke(colors.mediaText, style: UploadRing.line)
      .rotationEffect(.degrees(turned ? 270 : -90))
      .onAppear {
        guard !reduceMotion else { return }
        withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { turned = true }
      }
  }
}

/// Saves one of the group's photos to the person's photo library; true
/// once saved.
func savePhoto(_ photo: LinePhoto, in groupID: String, calls: GroupCalls) async -> Bool {
  guard let data = await ChatPhotoLoading.whole(photo, in: groupID, calls: calls) else {
    return false
  }
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
