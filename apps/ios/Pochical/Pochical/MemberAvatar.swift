import PhotosUI
import PochicalDesign
import PochicalKit
import SwiftUI

/// Someone's face (/design's PhotoAvatar): their photo, one of the group's
/// photos or the user's own (`PhotoShelf.mine`), else the first letter of
/// their name, which also shows while the photo first loads.
struct MemberAvatar: View {
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.displayScale) private var displayScale
  @Environment(\.photoShelf) private var openShelf
  @Environment(\.meID) private var meID
  let name: String
  let photoID: String
  /// Whose photos it is among; the open group's when not given.
  var shelf: PhotoShelf?
  let size: CGFloat
  /// Whose face it is, for the viewer's own to show as theirs.
  var userID: String?
  /// The viewer's own, known without an id.
  var me = false

  var body: some View {
    let letter = LetterAvatar(name: name, size: size, me: me || (userID != nil && userID == meID))
    Group {
      if photoID.hasPrefix(samplePhoto) {
        Image(String(photoID.dropFirst(samplePhoto.count))).resizable().scaledToFill()
      } else {
        PipelinePicture(
          request: photoID.isEmpty
            ? nil
            : ChatPhotoLoading.picture(
              photoID, in: shelf ?? openShelf, size: CGSize(width: size, height: size),
              scale: displayScale, calls: groupCalls)
        ) {
          letter
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
  }
}

/// Starts a sample's face: the rest is the name of one of the app's own
/// pictures, as made-up people have no photos anywhere.
let samplePhoto = "sample:"

/// A picture to change (/design's PhotoPicker): tapping it, or the label
/// under it, offers taking a photo or picking one, and going back to the
/// usual one or deleting it when that applies. A photo taken or picked is
/// moved and zoomed in its frame (`PhotoCrop`) before it is used.
struct PhotoEditor<Picture: View>: View {
  @Environment(\.themeColors) private var colors
  /// Said under the picture, as what tapping it does.
  let label: String
  /// Whether there is a photo to delete.
  var hasPhoto = false
  /// The frame a photo is cut to before it is used.
  var shape: PhotoCropShape = .round
  @ViewBuilder let picture: () -> Picture
  /// Told of a picked photo, cut and shrunk for how small it shows.
  let onPhoto: (Data) async -> Void
  var onUsual: (() async -> Void)?
  var onRemove: (() async -> Void)?
  @State private var picking = false
  @State private var picked: PhotosPickerItem?
  @State private var taking = false
  /// A photo taken, kept until the camera has gone: a cover opened while
  /// another is still closing shows outside the safe area, or not at all.
  @State private var pending: UIImage?
  /// A photo taken or picked, being cut.
  @State private var cropping: CroppingPhoto?
  @State private var busy = false

  var body: some View {
    let removable = onRemove != nil && hasPhoto
    Menu {
      // Taking one first, as /design's sheet has it; not on a device
      // without a camera.
      if UIImagePickerController.isSourceTypeAvailable(.camera) {
        Button("写真を撮る", systemImage: "camera") {
          taking = true
        }
      }
      Button("写真を選ぶ", systemImage: "photo.on.rectangle") { picking = true }
      if let onUsual {
        Button("いつもの写真に戻す", systemImage: "arrow.uturn.backward") {
          run(onUsual)
        }
      }
      if let onRemove, removable {
        Button("写真を削除", systemImage: "trash", role: .destructive) { run(onRemove) }
      }
    } label: {
      PictureHeader(label: label) {
        picture()
          .overlay {
            if busy { ProgressView() }
          }
          // /design's corner: a camera saying tapping the picture picks a
          // photo, as the system's contact cards have it, 2pt past the
          // picture's corner.
          .overlay(alignment: .bottomTrailing) {
            Image(systemName: "camera.fill")
              .font(.system(size: 14))
              .foregroundStyle(colors.accentDefault)
              .frame(width: 26, height: 26)
              .background(colors.backgroundCard, in: .circle)
              .shadow(Shadow.sm)
              .alignmentGuide(.trailing) { $0[.trailing] - 2 }
              .alignmentGuide(.bottom) { $0[.bottom] - 2 }
              .accessibilityHidden(true)
          }
      }
    }
    .disabled(busy)
    .frame(maxWidth: .infinity)
    .photosPicker(
      isPresented: $picking, selection: $picked, matching: .images,
      preferredItemEncoding: .compatible
    )
    // The cut opens as the photos close, in the same update, and reads the
    // photo there: SwiftUI says nothing of when the photos have gone, and
    // a cover opened while they are still closing shows outside the safe
    // area.
    .onChange(of: picked) { _, item in
      guard let item else { return }
      picked = nil
      cropping = CroppingPhoto(source: .picked(item))
    }
    // The camera in a cover of the app's own, for onDismiss to say when it
    // has gone.
    .fullScreenCover(isPresented: $taking, onDismiss: cutTaken) {
      CameraPicker { image in
        pending = image
        taking = false
      }
      .ignoresSafeArea()
    }
    .fullScreenCover(item: $cropping) { photo in
      CroppingCover(source: photo.source, shape: shape) { cut in
        cropping = nil
        guard let cut else { return }
        take(cut)
      }
    }
  }

  /// The camera has gone: a photo taken is cut.
  private func cutTaken() {
    guard let pending else { return }
    cropping = CroppingPhoto(source: .taken(pending))
    self.pending = nil
  }

  /// A photo just cut, shrunk for how small it shows, then told.
  private func take(_ image: UIImage) {
    busy = true
    Task {
      defer { busy = false }
      guard let shrunk = await shrunkPicture(image) else { return }
      await onPhoto(shrunk.jpeg)
    }
  }

  private func run(_ action: @escaping () async -> Void) {
    busy = true
    Task {
      defer { busy = false }
      await action()
    }
  }
}

/// A photo taken or picked, cut (`PhotoCrop`) once a picked one is read,
/// a spinner on the cut's own dark meanwhile, with キャンセル where the cut
/// has it, as one kept in iCloud may take long to come.
private struct CroppingCover: View {
  @Environment(\.themeColors) private var colors
  let source: CroppingPhoto.Source
  let shape: PhotoCropShape
  let onDone: (UIImage?) -> Void
  @State private var read: UIImage?

  var body: some View {
    switch (source, read) {
    case (.taken(let image), _), (.picked, .some(let image)):
      PhotoCrop(image: image, shape: shape, onDone: onDone)
    case (.picked(let item), nil):
      ProgressView()
        .tint(colors.mediaText)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(colors.mediaBackground)
        .overlay(alignment: .bottomLeading) {
          Button("キャンセル") { onDone(nil) }
            .foregroundStyle(colors.mediaText)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
        .statusBarHidden()
        .task {
          guard let data = try? await item.loadTransferable(type: Data.self),
            let image = await uprightToCut(data)
          else { return onDone(nil) }
          read = image
        }
    }
  }
}

/// A photo's bytes read upright at the size `PhotoEditor` cuts it at, off
/// the main actor.
@concurrent
private func uprightToCut(_ data: Data) async -> UIImage? {
  ChatPhotos.upright(data, maxEdge: Chat.photoMaxEdge).map(UIImage.init(cgImage:))
}

/// A photo `PhotoEditor` just cut, encoded and shrunk for how small it
/// shows, off the main actor.
@concurrent
private func shrunkPicture(_ image: UIImage) async -> ShrunkPhoto? {
  guard let data = image.jpegData(compressionQuality: 0.9) else { return nil }
  return await ChatPhotos.shrink(data, maxEdge: Chat.pictureMaxEdge)
}

/// A picture at the top of a page that changes it, what tapping it does
/// under it in the accent (/design's PictureHeader): a face, a group's mark
/// or a pattern's.
struct PictureHeader<Picture: View>: View {
  @Environment(\.themeColors) private var colors
  let label: String
  @ViewBuilder let picture: () -> Picture

  var body: some View {
    VStack(spacing: 8) {
      picture()
      Text(label)
        .font(.subheadline)
        .foregroundStyle(colors.accentDefault)
    }
  }
}

extension PhotoEditor where Picture == MemberAvatar {
  /// A face to change: the person's own, 写真を編集 under it.
  init(
    name: String, photoID: String, shelf: PhotoShelf, onPhoto: @escaping (Data) async -> Void,
    onUsual: (() async -> Void)? = nil, onRemove: (() async -> Void)? = nil
  ) {
    self.init(
      label: "写真を編集", hasPhoto: !photoID.isEmpty,
      picture: { MemberAvatar(name: name, photoID: photoID, shelf: shelf, size: 88, me: true) },
      onPhoto: onPhoto, onUsual: onUsual, onRemove: onRemove)
  }
}

/// The system's camera, for a photo to use as a face or a group's mark,
/// cut afterwards as a picked one is; nil when cancelled.
private struct CameraPicker: UIViewControllerRepresentable {
  let onDone: (UIImage?) -> Void

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.cameraDevice = .front
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

  func makeCoordinator() -> Coordinator {
    Coordinator(onDone: onDone)
  }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate,
    UINavigationControllerDelegate
  {
    let onDone: (UIImage?) -> Void

    init(onDone: @escaping (UIImage?) -> Void) {
      self.onDone = onDone
    }

    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      onDone(info[.originalImage] as? UIImage)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      onDone(nil)
    }
  }
}
