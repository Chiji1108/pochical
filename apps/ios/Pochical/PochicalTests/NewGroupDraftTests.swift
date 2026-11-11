import Foundation
import PochicalKit
import Testing

@testable import Pochical

/// 作る asked with a name of the group's own, the page left and opened
/// again while the group is being made: the page takes back the whole
/// draft the call was begun with, so it shows that name, and 作る again
/// with nothing changed (the call having failed) is the same request,
/// which makes no second group of one the server did make.
@MainActor @Test func aDraftTakenBackFromTheCallUnderWayAsksAgainForTheSameRequest() async {
  var draft = NewGroupDraft()
  draft.name = "忘年会"
  draft.profile.ownName = "幹事"
  // A photo picked for the face is the draft's own bytes, so the call's record holds it too.
  draft.profile.face = .picked(Data([1, 2, 3]))
  let request = draft.request(freeColor: 1, usualName: "さくら")
  draft.sent = request
  _ = draft.profile.goingOn(usualName: "さくら")
  let making = GoingIn<NewGroupDraft>()
  let call = making.begin(draft) {
    try await Task.sleep(for: .seconds(60))
    return InGroup(groupID: "group-1", faceKept: true)
  }
  defer { call.answer.cancel() }
  making.left(call)

  let reopened = try? #require(making.underWay?.asked)
  #expect(reopened?.profile.name(usual: "さくら") == "幹事")
  #expect(reopened?.profile.asUsual == false)
  #expect(reopened?.profile.face == .picked(Data([1, 2, 3])))
  #expect(reopened?.request(freeColor: 1, usualName: "さくら") == request)
}

@MainActor @Test func aDraftChangedAfterItWasSentIsANewRequest() {
  var draft = NewGroupDraft()
  draft.name = "忘年会"
  let request = draft.request(freeColor: 1, usualName: "さくら")
  draft.sent = request
  #expect(draft.request(freeColor: 1, usualName: "さくら") == request)

  draft.profile.ownName = "幹事"
  #expect(draft.request(freeColor: 1, usualName: "さくら").id != request.id)
}
