import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

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
  @State private var details: InviteDetails?
  @State private var loadError: InviteError?
  @State private var myName = ""
  /// The usual name, which the field starts with (設定 › プロフィール).
  @Fetch(ProfileNameRequest()) private var usualName = ""
  @State private var joining = false
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
    .onChange(of: usualName, initial: true) { _, usual in
      if myName.isEmpty { myName = usual }
    }
    .alert(
      joinError == .full ? "このグループには参加できません" : "参加できませんでした",
      isPresented: Binding { joinError != nil } set: { if !$0 { joinError = nil } }
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(joinError.map { message(for: $0) } ?? "")
    }
  }

  private func invitation(_ details: InviteDetails) -> some View {
    let canJoin =
      !details.full && !trimmed(myName).isEmpty && myName.count <= TextLimits.personName
    return VStack(spacing: 0) {
      List {
        Section {
          VStack(spacing: 12) {
            GroupMarkView(mark: details.mark, size: 76)
              .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
              .clipShape(RoundedRectangle(cornerRadius: Radius.xxl))
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
                  shelf: ChatPhotos.invitation(invite.code))
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
        if !details.alreadyMember {
          Section("このグループでのあなた") {
            LabeledContent("名前") {
              LimitedTextField(placeholder: "例：さくら", text: $myName, limit: TextLimits.personName)
            }
          }
          .settingsRows()
        }
      }
      .settingsList()
      VStack(spacing: 12) {
        Text(foot(details))
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
          .multilineTextAlignment(.center)
        Button {
          if details.alreadyMember {
            onJoined(details.groupID)
          } else {
            join()
          }
        } label: {
          Group {
            if joining {
              ProgressView().tint(colors.accentOnFill)
            } else {
              Text(details.alreadyMember ? "グループを開く" : "参加する")
            }
          }
          .font(.headline)
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(colors.accentFill)
        .foregroundStyle(colors.accentOnFill)
        .disabled(!details.alreadyMember && (!canJoin || joining))
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
    }
    .sheet(isPresented: $showingMembers) {
      MembersSheet(
        group: details.name, members: details.members, photos: details.memberPhotos,
        shelf: ChatPhotos.invitation(invite.code))
    }
  }

  /// What the foot says over its button: what joining shares, or why it
  /// cannot or need not.
  private func foot(_ details: InviteDetails) -> String {
    if details.alreadyMember {
      return "このグループにはもう参加しています。"
    }
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
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .tint(colors.accentDefault)
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
      details = try await groupCalls.invite(code: invite.code)
    } catch {
      loadError = error
    }
  }

  private func join() {
    joining = true
    Task {
      defer { joining = false }
      do throws(InviteError) {
        let groupID = try await groupCalls.join(code: invite.code, displayName: trimmed(myName))
        onJoined(groupID)
      } catch {
        ReviewPrompt.troubled = true
        joinError = error
      }
    }
  }
}

private func trimmed(_ text: String) -> String {
  text.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Who is in a group, by name while that stays short (/design's
/// memberLine): with every name there it gives the count too, so nobody
/// wonders whether the list holds more.
private func memberLine(_ names: [String]) -> String {
  let named = 3
  switch names.count {
  case 1: return "\(names[0])が参加中"
  case ...named: return "\(names.joined(separator: "、"))の\(names.count)人が参加中"
  default:
    return "\(names.prefix(named - 1).joined(separator: "、"))ほか\(names.count - (named - 1))人が参加中"
  }
}

/// Faces side by side, overlapping, each ringed in the screen's color.
private struct Faces: View {
  @Environment(\.themeColors) private var colors
  let names: [String]
  let photos: [String]
  /// Where the invitation's faces are read from.
  let shelf: String

  var body: some View {
    HStack(spacing: -8) {
      ForEach(Array(names.enumerated()), id: \.offset) { index, name in
        MemberAvatar(
          name: name, photoID: photos.indices.contains(index) ? photos[index] : "",
          groupID: shelf, size: 32)
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
  let shelf: String

  var body: some View {
    NavigationStack {
      List(Array(members.enumerated()), id: \.offset) { index, name in
        Label {
          Text(name).lineLimit(1)
        } icon: {
          MemberAvatar(
            name: name, photoID: photos.indices.contains(index) ? photos[index] : "",
            groupID: shelf, size: 28)
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
