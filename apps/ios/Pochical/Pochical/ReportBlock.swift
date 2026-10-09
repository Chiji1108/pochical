import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// Reporting and blocking (spec/chat.md), as the stores ask of an app where
// people post to each other: a reason, sent, then blocking offered; and a
// member's profile, where blocking lives. Neither is shown to the member
// concerned.

/// What is being reported: a line, or a member.
enum ReportTarget: Identifiable {
  case line(ChatLineRow, writer: String)
  case member(id: String, name: String)

  var id: String {
    switch self {
    case .line(let line, _): "line-\(line.threadID)-\(line.seq)"
    case .member(let id, _): "member-\(id)"
    }
  }

  /// Who is reported, or who wrote the line.
  var memberID: String {
    switch self {
    case .line(let line, _): line.authorID
    case .member(let id, _): id
    }
  }

  var name: String {
    switch self {
    case .line(_, let writer): writer
    case .member(_, let name): name
    }
  }

  /// What the sheet names, and what goes with the report, said plainly.
  var what: String {
    switch self {
    case .line(_, let writer): "\(writer)のメッセージ"
    case .member(_, let name): name
    }
  }

  var sends: String {
    switch self {
    case .line: "このメッセージと前後の数件"
    case .member(_, let name): "\(name)の名前とアイコン"
    }
  }
}

/// The reasons, then 送信 (/design's ReportSheet).
struct ReportSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.dismiss) private var dismiss
  let target: ReportTarget
  let groupID: String
  /// Sent: the app then offers blocking, or says 通報しました.
  let onSent: () -> Void
  @State private var reason: GroupCalls.ReportReason?
  @State private var sending = false
  @State private var failed = false

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(GroupCalls.ReportReason.allCases, id: \.self) { choice in
            Button {
              reason = choice
            } label: {
              HStack {
                Text(choice.label).foregroundStyle(colors.textPrimary)
                Spacer()
                Image(systemName: "checkmark")
                  .foregroundStyle(colors.accentDefault)
                  .opacity(reason == choice ? 1 : 0)
              }
              .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(reason == choice ? .isSelected : [])
          }
        } header: {
          Text("\(target.what)を通報する理由")
        } footer: {
          Text("通報すると、\(target.sends)がポチカルに送られます。相手には知らされません。")
        }
      }
      .navigationTitle("通報")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("送信", systemImage: "checkmark", role: .confirm) {
            Task { await send() }
          }
          .disabled(reason == nil || sending)
        }
      }
      .alert("送れませんでした", isPresented: $failed) {
        Button("OK", role: .cancel) {}
      } message: {
        Text("通信できるところで、もう一度送ってください。")
      }
    }
  }

  private func send() async {
    guard let reason else { return }
    sending = true
    defer { sending = false }
    do {
      switch target {
      case .line(let line, _):
        try await groupCalls.report(
          line: line.seq, in: line.threadID, of: groupID, because: reason)
      case .member(let id, _):
        try await groupCalls.report(member: id, of: groupID, because: reason)
      }
      onSent()
      dismiss()
    } catch {
      ReviewPrompt.troubled = true
      failed = true
    }
  }
}

/// Someone else in the group, from their face in a chat (/design's member
/// sheet): their name, ブロック中 while blocked, and 通報 and ブロック in ⋯,
/// beside ×, not in sight: rarely used, and a family member's profile
/// should not show it in red.
struct MemberProfileSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let name: String
  /// Their photo as the group shows it; empty for none.
  var photoID = ""
  let groupName: String
  let blocked: Bool
  let onReport: () -> Void
  let onBlock: () -> Void
  let onUnblock: () -> Void

  var body: some View {
    NavigationStack {
      VStack(spacing: 12) {
        MemberAvatar(name: name, photoID: photoID, size: 88)
        Text(name).font(.title2.bold())
        if blocked {
          Text("ブロック中")
            .font(.caption.weight(.semibold))
            .foregroundStyle(colors.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(colors.fillTertiary, in: Capsule())
        }
        Text("\(groupName)でのプロフィール")
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
      }
      .frame(maxWidth: .infinity)
      .padding(.top, 24)
      .frame(maxHeight: .infinity, alignment: .top)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
        ToolbarItem(placement: .primaryAction) {
          Menu("その他", systemImage: "ellipsis") {
            Button("通報", systemImage: "exclamationmark.bubble") {
              onReport()
              dismiss()
            }
            if blocked {
              Button("ブロックを解除", systemImage: "person.crop.circle.badge.checkmark") {
                onUnblock()
                dismiss()
              }
            } else {
              Button("ブロック", systemImage: "nosign", role: .destructive) {
                onBlock()
                dismiss()
              }
            }
          }
        }
      }
    }
    .presentationDetents([.medium])
  }
}

/// Someone being blocked or unblocked, asked first.
struct BlockQuestion: Identifiable {
  let userID: String
  let name: String
  let block: Bool
  /// Asked right after reporting them, as Instagram and X do.
  var afterReport = false
  var id: String { "\(userID)-\(block)-\(afterReport)" }

  var title: String {
    if afterReport { return "通報しました" }
    return block ? "\(name)をブロックしますか？" : "\(name)のブロックを解除しますか？"
  }

  var message: String {
    if afterReport {
      return "\(name)をブロックしますか？メッセージが表示されなくなり、個人チャットも届かなくなります。相手には知らされません。"
    }
    return block
      ? "メッセージが表示されなくなり、個人チャットも届かなくなります。ブロックしたことは相手に知らされません。"
      : "メッセージがまた表示され、個人チャットも届くようになります。"
  }
}

/// A blocked member's line in a group chat, folded to one line; a tap
/// shows it this once (spec/chat.md, Reporting and blocking).
struct BlockedLine: View {
  @Environment(\.themeColors) private var colors
  let onShow: () -> Void

  var body: some View {
    Button(action: onShow) {
      Text("ブロック中のメンバーのメッセージ")
        .font(.caption)
        .foregroundStyle(colors.textTertiary)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(colors.fillQuaternary, in: Capsule())
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.leading, 40)
    .accessibilityHint("押すと表示")
  }
}

/// Whom the user has blocked, read again as it changes.
struct BlocksRequest: FetchKeyRequest, Hashable {
  func fetch(_ db: Database) throws -> Set<String> {
    try Blocks.all(in: db)
  }
}
