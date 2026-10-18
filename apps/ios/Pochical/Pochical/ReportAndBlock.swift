import PochicalKit
import SwiftUI
import SwiftUINavigation

/// Someone else whose profile is open.
struct ProfileOf: Identifiable {
  let id: String
  let name: String
  var photoID = ""
}

/// Reporting a line or a member, their profile, and blocking them asked
/// first (spec/chat.md, Reporting and blocking).
struct ReportAndBlock: ViewModifier {
  let groupID: String
  let groupName: String
  let groupMark: GroupMarkValue
  let blocked: Set<String>
  @Binding var reporting: ReportTarget?
  @Binding var profileOf: ProfileOf?
  @Binding var blockQuestion: BlockQuestion?
  /// Opens the one-to-one chat with someone, when it is not the one open.
  let onMessage: (ProfileOf) -> (() -> Void)?
  let onReported: (ReportTarget) -> Void
  let onSetBlocked: (BlockQuestion) -> Void
  /// Takes them out of the group, where the profile offers it (グループの
  ///設定's members).
  var onRemove: ((ProfileOf) -> Void)?
  /// What follows once a sheet has gone: one cannot come up while another
  /// is going.
  @State private var next: (() -> Void)?

  func body(content: Content) -> some View {
    content
      .sheet(item: $reporting, onDismiss: runNext) { target in
        ReportSheet(target: target, groupID: groupID) { next = { onReported(target) } }
      }
      .sheet(item: $profileOf, onDismiss: runNext) { person in
        MemberProfileSheet(
          name: person.name, photoID: person.photoID, groupName: groupName,
          groupMark: groupMark, blocked: blocked.contains(person.id),
          onMessage: onMessage(person).map { open in { next = open } },
          onReport: { next = { reporting = .member(id: person.id, name: person.name) } },
          onBlock: {
            next = {
              blockQuestion = BlockQuestion(userID: person.id, name: person.name, block: true)
            }
          },
          onUnblock: {
            next = {
              blockQuestion = BlockQuestion(userID: person.id, name: person.name, block: false)
            }
          },
          onRemove: onRemove.map { remove in { remove(person) } })
      }
      .alert(item: $blockQuestion) { question in
        Text(question.title)
      } actions: { question in
        Button(question.afterReport ? "しない" : "キャンセル", role: .cancel) {}
        Button(question.block ? "ブロック" : "解除", role: question.block ? .destructive : nil) {
          onSetBlocked(question)
        }
      } message: { question in
        Text(question.message)
      }
  }

  private func runNext() {
    let action = next
    next = nil
    action?()
  }
}
