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
  @FetchAll private var groups: [GroupRow]
  /// Called with the new group's id once it is made.
  let onMade: (String) -> Void
  @State private var name = ""
  /// How the person will appear in the group, sent once it is made.
  @State private var profile = JoinProfile()
  /// The usual name, which the group shows unless another is given.
  @Fetch(ProfileNameRequest()) private var usualName = ""
  @Environment(\.say) private var say
  /// The mark picked by hand, which then stays as the name changes; none
  /// while the mark follows the name.
  @State private var pickedMark: GroupMarkValue?
  /// The end date picked on 終了日, none for a group with no end.
  @State private var end: Day?
  /// What 作る sent last, kept until the group is made: sent again as it
  /// was while nothing on the page has changed, so a retry after a lost
  /// answer makes no second group.
  @State private var sent: NewGroupRequest?
  /// Made, the page giving way to the group: busy still, so 作る is not
  /// there to tap again.
  @State private var gone = false
  @State private var failed = false
  @State private var photoGone = false

  var body: some View {
    // Only what the server takes (spec/vectors/fits.json), so the call
    // is never refused for it.
    let canMake =
      fitsGroupName(trimmed(name)) && fitsGroupMark(mark) && !myName.isEmpty
      && fitsPersonName(myName)
    List {
      Section {
        LabeledContent("グループ名") {
          LimitedTextField(placeholder: "例：家族", text: $name, limit: TextLimits.groupName)
        }
        PageLink {
          GroupMarkPage(name: name, mark: $pickedMark[or: mark], freeColor: freeColor)
        } label: {
          LabeledContent("アイコン") {
            GroupMarkBadge(mark: mark)
          }
        }
        GroupEndLink(end: end) { end = $0 }
      } footer: {
        Text("アイコンはグループ名から自動で入ります。\(end == nil ? "" : groupEndNote)")
      }
      .settingsRows()
      JoinProfileSection(
        profile: $profile, groupName: trimmed(name), going: "作ると、",
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
            .disabled(!canMake)
        }
      }
    }
    .onAppear { showUnderWay() }
    .waiting(on: groupCalls.making) { made in
      switch made {
      case .success(let group):
        if !group.faceKept { say(joinFaceNotKept) }
        // Still busy until the group has come and the page has turned
        // into メンバーを招待 (GroupsScreen).
        gone = true
        onMade(group.groupID)
      case .failure(is MarkPhotoGone):
        // Back to following the name, as before a photo was picked.
        pickedMark = nil
        sent = nil
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

  /// The mark picked, else the one the name and the user's groups give:
  /// in the first color those groups do not use yet, as /design picks a
  /// new group's. Once sent, the guess stays as sent while the name does:
  /// the group made from it takes its color, which a new guess would skip.
  private var mark: GroupMarkValue {
    if let pickedMark { return pickedMark }
    if let sent, sent.name == trimmed(name) { return sent.mark }
    return guessedMark(for: name, color: freeColor)
  }

  /// The name the group will show: its own, else the usual one.
  private var myName: String { profile.name(usual: usualName) }

  /// The first color the user's groups do not use yet, for the guess and
  /// for a mark picked from an emoji or a photo into an icon or letters.
  private var freeColor: Int { nextGroupColor(groups.map(\.mark), slots: colors.marks.count) }

  /// Whether 作る is under way, the app's one call (`GoingIn`), or done.
  private var busy: Bool { groupCalls.making.underWay != nil || gone }

  /// The group being made as the page opens, the page having been left
  /// while it was: the page shows it under way rather than an empty form,
  /// from which the same group could be asked for again.
  private func showUnderWay() {
    guard sent == nil, name.isEmpty, let begun = groupCalls.making.underWay?.asked else { return }
    name = begun.name
    sent = begun
    end = groupEndDay(begun.endsAtMs)
  }

  private func make() {
    let request = NewGroupRequest.asking(
      name: trimmed(name), mark: mark, displayName: myName, endsAtMs: groupEndsAt(end),
      after: sent)
    // As the button is off for.
    guard request.fits, !request.displayName.isEmpty else { return }
    sent = request
    let asUsual = profile.goingOn(usualName: usualName)
    let face = profile.face
    let calls = groupCalls
    // The app's from here, whether this page still waits or not; tapped
    // again before the page is drawn busy, the same call.
    groupCalls.making.begin(request) {
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
