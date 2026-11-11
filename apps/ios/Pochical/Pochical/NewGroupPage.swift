import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// グループを作る (/design's NewGroupPage): its name, its mark and, for one
/// made for an occasion, its end date (spec/sync-protocol.md, A group's
/// end), then how the person will appear in it, as the join screen asks
/// (`JoinProfileSection`). The mark follows the name until one is picked:
/// a fitting emoji, else its first letter in a color the user's other
/// groups do not use yet.
struct NewGroupPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.makingGroup) private var making
  @FetchAll private var groups: [GroupRow]
  /// Called with the new group's id once it is made.
  let onMade: (String) -> Void
  /// The group and how the person will appear in it, as the page has them.
  @State private var draft = NewGroupDraft()
  /// The usual name, which the group shows unless another is given.
  @Fetch(ProfileNameRequest()) private var usualName = ""
  @Environment(\.say) private var say
  /// Made, the page giving way to the group: busy still, so 作る is not
  /// there to tap again.
  @State private var gone = false
  /// Whether the page has shown once: what is under way is taken as it
  /// opens, not as it shows again from under a page it pushed.
  @State private var opened = false
  @State private var failed = false
  @State private var photoGone = false

  var body: some View {
    let mark = draft.mark(freeColor: freeColor)
    List {
      Section {
        LabeledContent("グループ名") {
          LimitedTextField(placeholder: "例：家族", text: $draft.name, limit: TextLimits.groupName)
        }
        PageLink {
          GroupMarkPage(name: draft.name, mark: $draft.pickedMark[or: mark], freeColor: freeColor)
        } label: {
          LabeledContent("アイコン") {
            GroupMarkBadge(mark: mark)
          }
        }
        GroupEndLink(end: draft.end) { draft.end = $0 }
      } footer: {
        Text("アイコンはグループ名から自動で入ります。\(draft.end == nil ? "" : groupEndNote)")
      }
      .settingsRows()
      JoinProfileSection(
        profile: $draft.profile, groupName: trimmed(draft.name), going: "作ると、",
        onNavigator: true)
    }
    .settingsList()
    .navigationTitle("グループを作る")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if busy {
          ProgressView()
        } else {
          Button("作る", role: .confirm) { make() }
            .disabled(!draft.canMake(freeColor: freeColor, usualName: usualName))
        }
      }
    }
    .onAppear { showUnderWay() }
    .waiting(on: making) { made in
      switch made {
      case .success(let group):
        if !group.faceKept { say(joinFaceNotKept) }
        // Still busy until the group has come and the page has turned
        // into メンバーを招待 (GroupsScreen).
        gone = true
        onMade(group.groupID)
      case .failure(is MarkPhotoGone):
        // Back to following the name, as before a photo was picked.
        draft.pickedMark = nil
        draft.sent = nil
        photoGone = true
      case .failure:
        ReviewPrompt.troubled = true
        failed = true
      }
    }
    .alert("グループを作れませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
    .alert(markPhotoGoneTitle, isPresented: $photoGone) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(markPhotoGoneMessage)
    }
  }

  /// The first color the user's groups do not use yet, for the guess and
  /// for a mark picked from an emoji or a photo into an icon or letters.
  private var freeColor: Int { nextGroupColor(groups.map(\.mark), slots: colors.marks.count) }

  /// Whether 作る is under way, the app's one call (`GoingIn`), or done.
  private var busy: Bool { making.underWay != nil || gone }

  /// The group being made as the page opens, the page having been left
  /// while it was: the page takes the draft the call was begun with, whole,
  /// so it shows what was asked rather than an empty form, and 作る tapped
  /// again after a failure asks for the same group under the same request.
  private func showUnderWay() {
    guard !opened else { return }
    opened = true
    if let begun = making.underWay?.asked { draft = begun }
  }

  private func make() {
    // As the button is off for.
    guard draft.canMake(freeColor: freeColor, usualName: usualName) else { return }
    let request = draft.request(freeColor: freeColor, usualName: usualName)
    draft.sent = request
    let asUsual = draft.profile.goingOn(usualName: usualName)
    let face = draft.profile.face
    let calls = groupCalls
    // The app's from here, whether this page still waits or not; tapped
    // again before the page is drawn busy, the same call.
    making.begin(draft) {
      // A picked photo goes up first, for the group to take.
      if !request.mark.photoID.isEmpty {
        try await calls.sendMarkPhoto(request.mark.photoID)
      }
      let made = try await calls.create(request)
      // Once the group is made, so one that fails changes nothing.
      let faceKept = await calls.keep(face, asUsual: asUsual, in: made)
      return InGroup(groupID: made, faceKept: faceKept)
    }
  }
}

/// グループを作る's draft, whole: the group's name, the mark picked, its end,
/// how the person will appear in it, and what 作る sent last. It is what a
/// call into the group is begun with (`GoingIn`), and what the page opened
/// again while that call is under way takes back, whole, so nothing of
/// what was asked can be left out of what it shows or sends again.
struct NewGroupDraft: Equatable, Sendable {
  var name = ""
  /// The mark picked by hand, which then stays as the name changes; none
  /// while the mark follows the name.
  var pickedMark: GroupMarkValue?
  /// The end date picked on 終了日, none for a group with no end.
  var end: Day?
  /// How the person will appear in the group, sent once it is made.
  var profile = JoinProfile()
  /// What 作る sent last, kept until the group is made: sent again as it
  /// was while nothing of the draft has changed, so a retry after a lost
  /// answer makes no second group.
  var sent: NewGroupRequest?

  /// The mark picked, else the one the name and the user's groups give:
  /// in the first color those groups do not use yet (`freeColor`), as
  /// /design picks a new group's. Once sent, the guess stays as sent while
  /// the name does: the group made from it takes its color, which a new
  /// guess would skip.
  func mark(freeColor: Int) -> GroupMarkValue {
    if let pickedMark { return pickedMark }
    if let sent, sent.name == trimmed(name) { return sent.mark }
    return guessedMark(for: name, color: freeColor)
  }

  /// The request for the draft: the one sent last again while nothing it
  /// asks for has changed, else a new one, as one request id stands for
  /// one request.
  func request(freeColor: Int, usualName: String) -> NewGroupRequest {
    NewGroupRequest.asking(
      name: trimmed(name), mark: mark(freeColor: freeColor),
      displayName: profile.name(usual: usualName), endsAtMs: groupEndsAt(end), after: sent)
  }

  /// Only what the server takes (spec/vectors/fits.json), with a name for
  /// the person, so the call is never refused for it.
  func canMake(freeColor: Int, usualName: String) -> Bool {
    let myName = profile.name(usual: usualName)
    return fitsGroupName(trimmed(name)) && fitsGroupMark(mark(freeColor: freeColor))
      && !myName.isEmpty && fitsPersonName(myName)
  }
}

private func trimmed(_ text: String) -> String {
  text.trimmingCharacters(in: .whitespacesAndNewlines)
}

extension Optional where Wrapped: Hashable {
  /// The value, else `fallback`; set, the value. A binding through it is
  /// still one to the optional's place, which keeps a page pushed with it
  /// drawing what it picks (PageLink).
  fileprivate subscript(or fallback: Wrapped) -> Wrapped {
    get { self ?? fallback }
    set { self = newValue }
  }
}
