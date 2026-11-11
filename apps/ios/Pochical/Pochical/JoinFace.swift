import PochicalDesign
import PochicalKit
import SQLiteData
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

/// あなたの名前と写真, or このグループでのあなた for someone with a usual
/// name: how the person will appear in the group they are joining or
/// making (/design's GroupProfileRow), a row of the face and the name the
/// group will show, saying for someone with a usual name whether they are
/// the usual ones, that opens the
/// page changing them (/design's GroupProfilePage). The screen keeps
/// `ownName` and `face` and sends them as the person goes on.
///
/// Someone first asked for their name and photo, with no usual name and no
/// usual photo yet, starts with one of the drawings in place, picked at
/// random once as the screen opens (spec/sync-protocol.md, Profile): theirs
/// as they go on, as if they had picked it, and theirs to change or take
/// off before that, which never brings one back.
struct JoinProfileSection: View {
  @Environment(\.themeColors) private var colors
  /// A name of its own for this group; empty follows the usual one.
  @Binding var ownName: String
  @Binding var face: JoinFace
  /// The group's name, for the page to say who sees these; empty while a
  /// group being made has none.
  let groupName: String
  /// What going on is, as the page's note starts: 参加すると、 or 作ると、.
  let going: String
  /// Whether the screen is one of the navigator's pages (`PageLink`),
  /// rather than a stack of its own.
  var onNavigator = false
  @Fetch(ProfileNameRequest()) private var usualName = ""
  @Fetch(UsualProfileRequest()) private var usual = UsualProfile()

  var body: some View {
    Section {
      if onNavigator {
        PageLink(destination: page, label: row)
      } else {
        NavigationLink(destination: page, label: row)
      }
    } header: {
      Text(title)
    } footer: {
      // With no usual name yet there is no usual one to be the same as:
      // the row says nothing there, and what going on does with these is
      // said under it, as its page says it.
      if usualName.isEmpty { Text(note) }
    }
    .settingsRows()
  }

  /// With no usual name yet, the name and face are asked as the usual
  /// ones, not this group's alone.
  private var title: String {
    usualName.isEmpty ? "あなたの名前と写真" : "このグループでのあなた"
  }

  private var name: String { JoinFace.name(own: ownName, usual: usualName) }

  private func row() -> some View {
    LabeledContent {
      // The usual name typed again is still the usual one, as the group
      // takes it.
      if !usualName.isEmpty {
        Text(name == usualName && face == .usual ? "いつもと同じ" : "このグループだけ")
      }
    } label: {
      Label {
        Text(name.isEmpty ? "名前を入れてください" : name)
          .foregroundStyle(name.isEmpty ? colors.textTertiary : colors.textPrimary)
          .lineLimit(1)
      } icon: {
        JoinFacePicture(face: face, name: name, usualPhotoID: usual.photoID, size: 28)
      }
    }
    .task(id: firstAsked) {
      guard firstAsked, face == .usual, let jpeg = await FaceDrawing.randomPhoto(),
        face == .usual
      else { return }
      face = .picked(jpeg)
    }
  }

  /// What going on does with the name and face: with no usual name yet
  /// they become the usual ones, else they are this group's alone.
  private var note: String {
    usualName.isEmpty
      ? "\(going)この名前と写真がいつもの名前と写真になり、ほかのグループでも使われます。設定 › プロフィールで変えられます。"
      : "\(going)\(groupName.isEmpty ? "このグループ" : groupName)の人にだけ、この名前と写真で表示されます。名前が空欄なら「\(usualName)」、写真を入れなければいつもの写真のままです。"
  }

  /// No usual name and no usual photo yet, once both are read.
  private var firstAsked: Bool {
    !$usualName.isLoading && !$usual.isLoading && usualName.isEmpty && usual.photoID.isEmpty
  }

  private func page() -> some View {
    List {
      Section {
        PhotoEditor(
          label: "写真を編集",
          hasPhoto: face != .none && (face != .usual || !usual.photoID.isEmpty),
          picture: {
            JoinFacePicture(face: face, name: name, usualPhotoID: usual.photoID, size: 88)
          },
          onPhoto: { jpeg in face = .picked(jpeg) },
          onUsual: face == .usual || usual.photoID.isEmpty ? nil : { face = .usual },
          onRemove: { face = .none })
        .settingsOnPage()
      }
      Section {
        LabeledContent("名前") {
          LimitedTextField(
            placeholder: usualName.isEmpty ? "例：さくら" : usualName, text: $ownName,
            limit: TextLimits.personName)
        }
      } footer: {
        Text(note)
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
  }
}

extension JoinFace {
  /// The name the group will show: its own, else the usual one.
  static func name(own: String, usual: String) -> String {
    let own = own.trimmingCharacters(in: .whitespacesAndNewlines)
    return own.isEmpty ? usual : own
  }
}

/// Said when the person is in the group but the face picked could not be
/// kept; the group opens anyway.
let joinFaceNotKept = "写真を設定できませんでした。グループの設定から変えられます"

extension GroupCalls {
  /// The face as the usual one (設定 › プロフィール), for someone who had
  /// no usual name, whose name joining or making the group made their
  /// usual one; the usual photo, if there is one, stays as it is. False
  /// when it could not be kept.
  fileprivate func keepAsUsual(_ face: JoinFace) async -> Bool {
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

  /// The face picked on the screen, kept now the person is in the group:
  /// someone who had no usual name (`asUsual`), whose name joining or
  /// making the group made the usual one, keeps the face as theirs
  /// everywhere too, which the group then shows as it shows anyone's usual
  /// ones; anyone else's face, or one not kept as usual, is the group's
  /// own. False when it could not be kept.
  func keep(_ face: JoinFace, asUsual: Bool, in groupID: String) async -> Bool {
    if asUsual, await keepAsUsual(face) { return true }
    do {
      switch face {
      case .usual: break
      case .picked(let jpeg):
        let photoID = try await sendPhoto(jpeg, to: .group(groupID))
        try await setGroupPhoto(usual: false, photoID: photoID, in: groupID)
      case .none:
        try await setGroupPhoto(usual: false, in: groupID)
      }
      return true
    } catch {
      return false
    }
  }
}
