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
  let name: String
  let photoID: String
  /// Whose photos it is among; the open group's when not given.
  var groupID: String?
  let size: CGFloat
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
        LetterAvatar(name: name, size: size)
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

/// A face to change (/design's PhotoEditor): tapping it, or 写真を編集 under
/// it, offers a photo from the library, and going back to the usual one or
/// deleting it when that applies.
struct PhotoEditor: View {
  @Environment(\.themeColors) private var colors
  let name: String
  let photoID: String
  let groupID: String
  /// Told of a picked photo, shrunk as a chat's are.
  let onPhoto: (Data) async -> Void
  var onUsual: (() async -> Void)?
  var onRemove: (() async -> Void)?
  @State private var picking = false
  @State private var item: PhotosPickerItem?
  @State private var busy = false

  var body: some View {
    let removable = onRemove != nil && !photoID.isEmpty
    Group {
      // With nothing but a photo to pick, a tap picks one.
      if onUsual == nil && !removable {
        Button { picking = true } label: { face }
          .buttonStyle(.plain)
      } else {
        Menu {
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
      }
    }
    .disabled(busy)
    .frame(maxWidth: .infinity)
    .photosPicker(isPresented: $picking, selection: $item, matching: .images)
    .onChange(of: item) { _, picked in
      guard let picked else { return }
      item = nil
      busy = true
      Task {
        defer { busy = false }
        guard let data = try? await picked.loadTransferable(type: Data.self),
          let shrunk = await Task.detached(operation: { ChatPhotos.shrink(data) }).value
        else { return }
        await onPhoto(shrunk.jpeg)
      }
    }
  }

  /// The face, and 写真を編集 under it.
  private var face: some View {
    VStack(spacing: 8) {
      MemberAvatar(name: name, photoID: photoID, groupID: groupID, size: 88)
        .overlay {
          if busy { ProgressView() }
        }
      Text("写真を編集")
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
