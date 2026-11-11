import PochicalDesign
import PochicalKit
import SwiftUI

/// The face of the person joining a group or making one, as picked on
/// that screen and sent once they are in it: the usual photo, another
/// picked here, or none on purpose.
enum JoinFace: Equatable {
  case usual
  case picked(Data)
  case none
}

/// A `JoinFace` drawn: the photo picked, else the usual one, else the
/// name's first letter.
struct JoinFacePicture: View {
  let face: JoinFace
  let name: String
  let usualPhotoID: String
  let size: CGFloat

  var body: some View {
    switch face {
    case .picked(let jpeg):
      if let image = UIImage(data: jpeg) {
        Image(uiImage: image).resizable().scaledToFill()
          .frame(width: size, height: size).clipShape(Circle())
      }
    case .usual:
      MemberAvatar(name: name, photoID: usualPhotoID, shelf: .mine, size: size, me: true)
    case .none:
      MemberAvatar(name: name, photoID: "", size: size, me: true)
    }
  }
}

extension View {
  /// Someone first asked for their name and photo (`firstAsked`: no usual
  /// name and no usual photo yet) starts with one of the drawings in
  /// place, picked at random once as the screen opens (spec/sync-protocol.md,
  /// Profile): theirs as they go on, as if they had picked it, and theirs
  /// to change or take off before that, which never brings one back.
  func startsWithADrawing(_ face: Binding<JoinFace>, firstAsked: Bool) -> some View {
    task(id: firstAsked) {
      guard firstAsked, face.wrappedValue == .usual, let jpeg = await FaceDrawing.randomPhoto(),
        face.wrappedValue == .usual
      else { return }
      face.wrappedValue = .picked(jpeg)
    }
  }
}

extension GroupCalls {
  /// The face as the usual one (設定 › プロフィール), for someone who had
  /// no usual name, whose name joining or making the group made their
  /// usual one; the usual photo, if there is one, stays as it is. False
  /// when it could not be kept.
  func keepAsUsual(_ face: JoinFace) async -> Bool {
    do {
      switch face {
      case .usual: break
      case .picked(let jpeg):
        let photoID = try await sendPhoto(jpeg, to: .mine)
        try await setProfile(name: nil, photoID: photoID)
      case .none:
        try await setProfile(name: nil, photoID: "")
      }
      return true
    } catch {
      return false
    }
  }
}
