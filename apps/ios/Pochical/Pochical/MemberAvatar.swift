import PhotosUI
import PochicalDesign
import PochicalKit
import SwiftUI

/// Someone's face (/design's PhotoAvatar): their photo, one of the group's
/// photos or the user's own (`ChatPhotos.mine`), else the first letter of
/// their name, which also shows while the photo loads.
struct MemberAvatar: View {
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.displayScale) private var displayScale
  @Environment(\.photoGroupID) private var openGroupID
  @Environment(\.meID) private var meID
  let name: String
  let photoID: String
  /// Whose photos it is among; the open group's when not given.
  var groupID: String?
  let size: CGFloat
  /// Whose face it is, for the viewer's own to show as theirs.
  var userID: String?
  /// The viewer's own, known without an id.
  var me = false
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image, !photoID.isEmpty {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
          .frame(width: size, height: size)
          .clipShape(Circle())
      } else {
        LetterAvatar(name: name, size: size, me: me || (userID != nil && userID == meID))
      }
    }
    .task(id: photoID) {
      image = nil
      guard !photoID.isEmpty,
        let data = try? await groupCalls.photo(photoID, in: groupID ?? openGroupID),
        let whole = UIImage(data: data)
      else { return }
      // Decoded at the size it shows, not the photo's own.
      let edge = size * displayScale
      image =
        await whole.byPreparingThumbnail(ofSize: CGSize(width: edge, height: edge)) ?? whole
    }
  }
}

/// A picture to change (/design's PhotoPicker): tapping it, or the label
/// under it, offers taking a photo or picking one, and going back to the
/// usual one or deleting it when that applies.
struct PhotoEditor<Picture: View>: View {
  @Environment(\.themeColors) private var colors
  /// Said under the picture, as what tapping it does.
  let label: String
  /// Whether there is a photo to delete.
  var hasPhoto = false
  @ViewBuilder let picture: () -> Picture
  /// Told of a picked photo, shrunk for how small it shows.
  let onPhoto: (Data) async -> Void
  var onUsual: (() async -> Void)?
  var onRemove: (() async -> Void)?
  @State private var picking = false
  @State private var taking = false
  @State private var item: PhotosPickerItem?
  @State private var busy = false

  var body: some View {
    let removable = onRemove != nil && hasPhoto
    Menu {
      // Taking one first, as /design's sheet has it; not on a device
      // without a camera.
      if UIImagePickerController.isSourceTypeAvailable(.camera) {
        Button("写真を撮る", systemImage: "camera") { taking = true }
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
      face
    }
    .disabled(busy)
    .frame(maxWidth: .infinity)
    .photosPicker(isPresented: $picking, selection: $item, matching: .images)
    .fullScreenCover(isPresented: $taking) {
      CameraPicker { image in
        taking = false
        guard let image else { return }
        take(image)
      }
      .ignoresSafeArea()
    }
    .onChange(of: item) { _, picked in
      guard let picked else { return }
      item = nil
      busy = true
      Task {
        defer { busy = false }
        guard let data = try? await picked.loadTransferable(type: Data.self) else { return }
        await send(data)
      }
    }
  }

  /// A photo just taken, sent as a picked one is, encoded off the main
  /// thread.
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

  /// The picture, and the label under it.
  private var face: some View {
    VStack(spacing: 8) {
      picture()
        .overlay {
          if busy { ProgressView() }
        }
      Text(label)
        .font(.subheadline)
        .foregroundStyle(colors.accentDefault)
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

extension PhotoEditor where Picture == MemberAvatar {
  /// A face to change: the person's own, 写真を編集 under it.
  init(
    name: String, photoID: String, groupID: String, onPhoto: @escaping (Data) async -> Void,
    onUsual: (() async -> Void)? = nil, onRemove: (() async -> Void)? = nil
  ) {
    self.init(
      label: "写真を編集", hasPhoto: !photoID.isEmpty,
      picture: { MemberAvatar(name: name, photoID: photoID, groupID: groupID, size: 88, me: true) },
      onPhoto: onPhoto, onUsual: onUsual, onRemove: onRemove)
  }
}

/// The system's camera, for a photo to use as a face, squared as the system
/// squares one for a profile; nil when cancelled.
private struct CameraPicker: UIViewControllerRepresentable {
  let onDone: (UIImage?) -> Void

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.cameraDevice = .front
    picker.allowsEditing = true
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
      onDone((info[.editedImage] ?? info[.originalImage]) as? UIImage)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      onDone(nil)
    }
  }
}
