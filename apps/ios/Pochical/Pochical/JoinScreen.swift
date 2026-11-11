import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import SwiftUINavigation

/// An invitation code opened in the app, to show over the screens.
struct OpenedInvite: Identifiable, Hashable {
  let code: String
  var id: String { code }
}

/// 参加の画面 (/design's JoinScreen), opened by an invitation link: the
/// group, its mark and name with room around them, and who is in it; then
/// how the person will appear in it, and at the foot what joining shares
/// over 参加する. A screen of its own rather than a sheet, as LINE's
/// invitations are; only × turns it down. The link carries no sender, so
/// /design's 〜からの招待 waits for invitations that say who sent them.
struct JoinScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.dismiss) private var dismiss
  let invite: OpenedInvite
  /// Called with the group's id once the person is in it.
  let onJoined: (String) -> Void
  /// Called instead of showing the invitation when the person is in its
  /// group already (/design's 「…」にはもう参加しています).
  let onAlreadyIn: (InviteDetails) -> Void
  @State private var details: InviteDetails?
  @State private var loadError: InviteError?
  /// How the person will appear in the group, sent as they join.
  @State private var profile = JoinProfile()
  /// The usual name, which the group shows unless another is given.
  @Fetch(ProfileNameRequest()) private var usualName = ""
  /// Joined, but the photo picked could not be set: said, and the group
  /// opens anyway.
  @Environment(\.say) private var say
  /// Joined, the screen giving way to the group: busy still.
  @State private var gone = false
  @State private var joinError: InviteError?
  @State private var showingMembers = false

  var body: some View {
    NavigationStack {
      Group {
        if let details {
          invitation(details)
        } else if let loadError {
          unusable(loadError)
        } else {
          ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .background(colors.backgroundBase)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
    .task { await load() }
    .waiting(on: groupCalls.joining, mine: { $0.code == invite.code }) { joined in
      switch joined {
      case .success(let group):
        if !group.faceKept { say(joinFaceNotKept) }
        gone = true
        onJoined(group.groupID)
      case .failure(let error):
        ReviewPrompt.troubled = true
        joinError = error as? InviteError ?? .failed
      }
    }
    .alert(
      joinError == .full ? "このグループには参加できません" : "参加できませんでした",
      isPresented: Binding($joinError),
      presenting: joinError
    ) { _ in
      Button("OK", role: .cancel) {}
    } message: { error in
      Text(message(for: error))
    }
  }

  private func invitation(_ details: InviteDetails) -> some View {
    let canJoin =
      !details.full && !myName.isEmpty && fitsPersonName(myName)
    return VStack(spacing: 0) {
      List {
        Section {
          VStack(spacing: 12) {
            GroupMarkView(mark: details.mark, size: MarkFrame.size, shelf: .invitation(code: invite.code))
              .markFrame()
              .accessibilityHidden(true)
            Text(details.name)
              .font(.title.bold())
              .multilineTextAlignment(.center)
              .lineLimit(3)
              .accessibilityAddTraits(.isHeader)
              .padding(.bottom, 12)
            Button {
              showingMembers = true
            } label: {
              VStack(spacing: 8) {
                Faces(
                  names: Array(details.members.prefix(5)),
                  photos: Array(details.memberPhotos.prefix(5)),
                  shelf: .invitation(code: invite.code))
                HStack(spacing: 2) {
                  Text(memberLine(details.members)).lineLimit(1)
                  Image(systemName: "chevron.right").imageScale(.small)
                }
                .font(.footnote)
                .foregroundStyle(colors.textTertiary)
              }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(details.members.count)人のメンバー")
          }
          .frame(maxWidth: .infinity)
          .padding(.top, 32)
          .padding(.bottom, 12)
        }
        .settingsOnPage()
        JoinProfileSection(
          profile: $profile, groupName: details.name, going: "参加すると、")
      }
      .settingsList()
      VStack(spacing: 12) {
        // A group that ends says so before joining (spec/sync-protocol.md,
        // A group's end).
        if details.endsAtMs != 0 {
          Text(GroupEnd.coming(details.endsAtMs, in: .current, today: .today))
            .font(.footnote)
            .foregroundStyle(colors.textSecondary)
            .multilineTextAlignment(.center)
        }
        Text(foot(details))
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
          .multilineTextAlignment(.center)
        Button {
          join()
        } label: {
          Group {
            if joining {
              ProgressView().tint(colors.accentOnFill)
            } else {
              Text("参加する")
            }
          }
          .font(.headline)
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(colors.accentFill)
        .foregroundStyle(colors.accentOnFill)
        .disabled(!canJoin || joining)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
    }
    .sheet(isPresented: $showingMembers) {
      MembersSheet(
        group: details.name, members: details.members, photos: details.memberPhotos,
        shelf: .invitation(code: invite.code))
    }
  }

  /// What the foot says over its button: what joining shares, or why it
  /// cannot.
  private func foot(_ details: InviteDetails) -> String {
    if details.full {
      return message(for: .full)
    }
    return "参加すると、あなたのシフトもメンバーに見えるようになります。"
  }

  /// The invitation could not be read: a link that no longer works, as the
  /// site says it, or no connection, to try again.
  private func unusable(_ error: InviteError) -> some View {
    VStack(spacing: 12) {
      Text(error == .unusable ? "この招待リンクは使えません" : "招待を確認できませんでした")
        .font(.title2.bold())
        .multilineTextAlignment(.center)
      Text(message(for: error))
        .font(.subheadline)
        .foregroundStyle(colors.textSecondary)
        .multilineTextAlignment(.center)
      if error != .unusable {
        Button("もう一度確認する", systemImage: "arrow.clockwise") {
          loadError = nil
          Task { await load() }
        }
        .quietButton()
        .padding(.top, 8)
      }
    }
    .padding(.horizontal, 32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func message(for error: InviteError) -> String {
    switch error {
    case .unusable:
      "招待リンクが変更されたか、グループが削除された可能性があります。送り主に新しいリンクを確認してください。"
    case .full:
      "メンバーが上限の\(groupMaxMembers)人に達しています。"
    case .failed:
      "一時的に接続できない可能性があります。少し時間をおいて、もう一度お試しください。"
    }
  }

  private func load() async {
    do {
      let read = try await groupCalls.invite(code: invite.code)
      if read.alreadyMember {
        onAlreadyIn(read)
        return
      }
      details = read
    } catch {
      loadError = error
    }
  }

  private var myName: String { profile.name(usual: usualName) }

  /// Whether 参加する is under way, the app's one call (`GoingIn`), or
  /// done: another invitation's leaves the button busy alone.
  private var joining: Bool { groupCalls.joining.underWay != nil || gone }

  private func join() {
    // As the button is off for.
    guard details?.full == false, !myName.isEmpty, fitsPersonName(myName) else { return }
    let asUsual = profile.goingOn(usualName: usualName)
    let face = profile.face
    let calls = groupCalls
    let ask = JoinAsk(code: invite.code, displayName: myName)
    // The app's from here, whether this screen still waits or not; tapped
    // again before the screen is drawn busy, the same call.
    groupCalls.joining.begin(ask) {
      let groupID = try await calls.join(code: ask.code, displayName: ask.displayName)
      // Once in the group, so a join that fails changes nothing: someone
      // with no usual name yet has the join make theirs the usual one,
      // and keeps the face as theirs everywhere too, which the group
      // then shows as it shows anyone's usual ones; anyone else's face,
      // or one not kept as usual, is the group's own.
      let faceKept = await calls.keep(face, asUsual: asUsual, in: groupID)
      return InGroup(groupID: groupID, faceKept: faceKept)
    }
  }
}

private func trimmed(_ text: String) -> String {
  text.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Faces side by side, overlapping, each ringed in the screen's color.
private struct Faces: View {
  @Environment(\.themeColors) private var colors
  let names: [String]
  let photos: [String]
  /// Where the invitation's faces are read from.
  let shelf: PhotoShelf

  var body: some View {
    HStack(spacing: -8) {
      ForEach(Array(names.enumerated()), id: \.offset) { index, name in
        MemberAvatar(
          name: name, photoID: photos.indices.contains(index) ? photos[index] : "",
          shelf: shelf, size: 32)
          .overlay(Circle().strokeBorder(colors.backgroundBase, lineWidth: 2).padding(-2))
      }
    }
    .accessibilityHidden(true)
  }
}

/// A person without a photo: the first letter of their name on a circle
/// (/design's PhotoAvatar without one).
struct LetterAvatar: View {
  @Environment(\.themeColors) private var colors
  let name: String
  let size: CGFloat
  /// The viewer's own: in the テーマ's accent, as /design marks yours, so it
  /// stands out among the others' gray.
  var me = false

  var body: some View {
    Text(name.first.map(String.init) ?? "")
      .font(.system(size: max(9, (size * 0.45).rounded()), weight: .semibold))
      .foregroundStyle(me ? colors.accentOnFill : colors.textSecondary)
      .frame(width: size, height: size)
      .background(me ? colors.accentFill : colors.fillSecondary, in: Circle())
  }
}

/// Everyone in the group before joining: names and faces only, as shifts
/// are seen once both are in it.
private struct MembersSheet: View {
  @Environment(\.dismiss) private var dismiss
  let group: String
  let members: [String]
  let photos: [String]
  let shelf: PhotoShelf

  var body: some View {
    NavigationStack {
      List(Array(members.enumerated()), id: \.offset) { index, name in
        Label {
          Text(name).lineLimit(1)
        } icon: {
          MemberAvatar(
            name: name, photoID: photos.indices.contains(index) ? photos[index] : "",
            shelf: shelf, size: 28)
        }
      }
      .navigationTitle("\(members.count)人のメンバー")
      .navigationSubtitle(group)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }
}
