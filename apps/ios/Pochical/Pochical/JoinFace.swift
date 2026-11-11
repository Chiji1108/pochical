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

/// How the person will appear in the group they are joining or making, as
/// that screen keeps it until they go on.
struct JoinProfile: Equatable {
  /// A name of its own for this group; empty follows the usual one.
  var ownName = ""
  var face = JoinFace.usual
  /// Whether the name and face asked become the usual ones, the person
  /// having no usual name: decided once, when the device knows the
  /// account's (`profileAsking`), else as they first go on, and kept
  /// through every retry, so neither the screen's words nor what a retry
  /// keeps changes as the name going on made usual comes back. Nil until
  /// then.
  var asUsual: Bool?

  /// The name the group will show: its own, else the usual one.
  func name(usual: String) -> String {
    let own = ownName.trimmingCharacters(in: .whitespacesAndNewlines)
    return own.isEmpty ? usual : own
  }

  /// Going on: whether the name and face become the usual ones, decided
  /// now by what the screen shows if it was not yet.
  mutating func goingOn(usualName: String) -> Bool {
    let decided = asUsual ?? usualName.isEmpty
    asUsual = decided
    return decided
  }
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
/// `profile` and sends it as the person goes on.
///
/// Someone first asked for their name and photo, with no usual name and no
/// usual photo yet, starts with one of the drawings in place, picked at
/// random once (spec/sync-protocol.md, Profile): theirs as they go on, as
/// if they had picked it, and theirs to change or take off before that,
/// which never brings one back. That they have none is known only once the
/// user's socket has caught up, never from a database that holds no
/// profile yet, as a device just signed in to an account in use holds none
/// until then; before that the row shows the usual ones as it reads them
/// and puts nothing in place.
struct JoinProfileSection: View {
  @Environment(\.themeColors) private var colors
  @Environment(AccountSession.self) private var session
  @Binding var profile: JoinProfile
  /// The group's name, for the page to say who sees these; empty while a
  /// group being made has none.
  let groupName: String
  /// What going on is, as the page's note starts: 参加すると、 or 作ると、.
  let going: String
  /// Whether the screen is one of the navigator's pages (`PageLink`),
  /// rather than a stack of its own.
  var onNavigator = false
  @Fetch(UsualProfileRequest()) private var usual = UsualProfile()
  /// Whether the user's socket has caught up since the screen opened, or
  /// was when it did.
  @State private var caughtUp = false

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
      if asUsual { Text(note) }
    }
    .settingsRows()
  }

  /// With no usual name yet, the name and face are asked as the usual
  /// ones, not this group's alone: as decided, else as the usual name read
  /// so far has it.
  private var asUsual: Bool { profile.asUsual ?? usual.name.isEmpty }

  private var title: String {
    asUsual ? "あなたの名前と写真" : "このグループでのあなた"
  }

  private var name: String { profile.name(usual: usual.name) }

  private func row() -> some View {
    LabeledContent {
      // The usual name typed again is still the usual one, as the group
      // takes it.
      if !asUsual {
        Text(name == usual.name && profile.face == .usual ? "いつもと同じ" : "このグループだけ")
      }
    } label: {
      Label {
        Text(name.isEmpty ? "名前を入れてください" : name)
          .foregroundStyle(name.isEmpty ? colors.textTertiary : colors.textPrimary)
          .lineLimit(1)
      } icon: {
        JoinFacePicture(face: profile.face, name: name, usualPhotoID: usual.photoID, size: 28)
      }
    }
    .task {
      for await status in await session.userSocket.statuses() where status == .current {
        caughtUp = true
      }
    }
    .task(id: asking) {
      guard let asking, profile.asUsual == nil else { return }
      let drawing = asking.drawing ? await FaceDrawing.randomPhoto() : nil
      guard !Task.isCancelled, profile.asUsual == nil else { return }
      profile.asUsual = asking.asUsual
      if let drawing, profile.face == .usual { profile.face = .picked(drawing) }
    }
  }

  /// What going on does with the name and face: with no usual name yet
  /// they become the usual ones, else they are this group's alone.
  private var note: String {
    asUsual
      ? "\(going)この名前と写真がいつもの名前と写真になり、ほかのグループでも使われます。設定 › プロフィールで変えられます。"
      : "\(going)\(groupName.isEmpty ? "このグループ" : groupName)の人にだけ、この名前と写真で表示されます。名前が空欄なら「\(usual.name)」、写真を入れなければいつもの写真のままです。"
  }

  /// How the person is asked, once the device knows the account's usual
  /// name and photo.
  private var asking: ProfileAsking? {
    $usual.isLoading ? nil : profileAsking(caughtUp: caughtUp, usual: usual)
  }

  private func page() -> some View {
    List {
      Section {
        PhotoEditor(
          label: "写真を編集",
          hasPhoto: profile.face != .none && (profile.face != .usual || !usual.photoID.isEmpty),
          picture: {
            JoinFacePicture(
              face: profile.face, name: name, usualPhotoID: usual.photoID, size: 88)
          },
          onPhoto: { jpeg in profile.face = .picked(jpeg) },
          onUsual: profile.face == .usual || usual.photoID.isEmpty
            ? nil : { profile.face = .usual },
          onRemove: { profile.face = .none })
        .settingsOnPage()
      }
      Section {
        LabeledContent("名前") {
          LimitedTextField(
            placeholder: usual.name.isEmpty ? "例：さくら" : usual.name, text: $profile.ownName,
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
