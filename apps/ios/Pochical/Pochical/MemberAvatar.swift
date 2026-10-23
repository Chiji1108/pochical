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
  @State private var taking = false
  /// A photo taken or picked, kept until the camera or the photos have
  /// gone: a cover opened while another is still closing shows outside
  /// the safe area, or not at all.
  @State private var pending: UIImage?
  /// The camera or the photos are on screen, or still closing.
  @State private var covered = false
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
          covered = true
          taking = true
        }
      }
      Button("写真を選ぶ", systemImage: "photo.on.rectangle") {
        covered = true
        picking = true
      }
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
      }
    }
    .disabled(busy)
    .frame(maxWidth: .infinity)
    // The system's photos in a sheet of the app's own, as the camera is
    // in a cover of its own, for onDismiss to say when they have gone.
    .sheet(isPresented: $picking, onDismiss: uncover) {
      LibraryPicker { provider in
        picking = false
        if let provider { load(provider) }
      }
      .ignoresSafeArea()
    }
    .fullScreenCover(isPresented: $taking, onDismiss: uncover) {
      CameraPicker { image in
        pending = image
        taking = false
      }
      .ignoresSafeArea()
    }
    .fullScreenCover(item: $cropping) { picked in
      PhotoCrop(image: picked.image, shape: shape) { cut in
        cropping = nil
        guard let cut else { return }
        take(cut)
      }
    }
  }

  /// A photo picked, read and turned upright off the main thread, to be
  /// cut once the photos have gone.
  private func load(_ provider: NSItemProvider) {
    busy = true
    _ = provider.loadDataRepresentation(for: .image) { data, _ in
      Task { @MainActor in
        defer { busy = false }
        guard let data,
          let image = await Task.detached(operation: {
            ChatPhotos.upright(data, maxEdge: Chat.photoMaxEdge)
          }).value
        else { return }
        pending = UIImage(cgImage: image)
        cutPending()
      }
    }
  }

  /// The camera or the photos have gone: a photo already there is cut.
  private func uncover() {
    covered = false
    cutPending()
  }

  /// Opens the cut for a photo taken or picked, once nothing covers the
  /// screen.
  private func cutPending() {
    guard !covered, let pending else { return }
    cropping = CroppingPhoto(image: pending)
    self.pending = nil
  }

  /// A photo just cut, encoded off the main thread and sent.
  private func take(_ image: UIImage) {
    busy = true
    Task {
      defer { busy = false }
      guard
        let data = await Task.detached(operation: { image.jpegData(compressionQuality: 0.9) })
          .value
      else { return }
      await send(data)
    }
  }

  /// Shrunk for how small it shows, then told.
  private func send(_ data: Data) async {
    guard
      let shrunk = await Task.detached(operation: {
        ChatPhotos.shrink(data, maxEdge: Chat.pictureMaxEdge)
      }).value
    else { return }
    await onPhoto(shrunk.jpeg)
  }

  private func run(_ action: @escaping () async -> Void) {
    busy = true
    Task {
      defer { busy = false }
      await action()
    }
  }
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

/// The system's photos, one image to use as a face or a group's mark;
/// nil when closed without one.
private struct LibraryPicker: UIViewControllerRepresentable {
  let onDone: (NSItemProvider?) -> Void

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var configuration = PHPickerConfiguration()
    configuration.filter = .images
    configuration.selectionLimit = 1
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ picker: PHPickerViewController, context: Context) {}

  func makeCoordinator() -> Coordinator {
    Coordinator(onDone: onDone)
  }

  final class Coordinator: NSObject, PHPickerViewControllerDelegate {
    let onDone: (NSItemProvider?) -> Void

    init(onDone: @escaping (NSItemProvider?) -> Void) {
      self.onDone = onDone
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      onDone(results.first?.itemProvider)
    }
  }
}
