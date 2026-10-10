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
/// sheet): their face, which opens large when it is a photo, their name,
/// ブロック中 while blocked, メッセージを送る, and ブロック and 通報 in ⋯
/// beside ×, not in sight: rarely used, and a family member's profile
/// should not show ブロック in red (spec/chat.md, Reporting and blocking).
struct MemberProfileSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(\.photoGroupID) private var groupID
  let name: String
  /// Their photo as the group shows it; empty for none.
  var photoID = ""
  let groupName: String
  let groupMark: GroupMarkValue
  let blocked: Bool
  /// Opens the one-to-one chat with them; none from inside it.
  let onMessage: (() -> Void)?
  let onReport: () -> Void
  let onBlock: () -> Void
  let onUnblock: () -> Void
  @State private var viewingPhoto = false

  var body: some View {
    NavigationStack {
      VStack(spacing: 12) {
        if photoID.isEmpty {
          MemberAvatar(name: name, photoID: photoID, size: 72)
        } else {
          Button {
            viewingPhoto = true
          } label: {
            MemberAvatar(name: name, photoID: photoID, size: 72)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("\(name)の写真を大きく見る")
        }
        Text(name).font(.title2.bold())
        if blocked {
          Text("ブロック中")
            .font(.caption.weight(.semibold))
            .foregroundStyle(colors.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(colors.fillTertiary, in: Capsule())
        }
        HStack(spacing: 8) {
          GroupMarkView(mark: groupMark, size: 14, shelf: groupID)
            .accessibilityHidden(true)
          Text("\(groupName)でのプロフィール")
        }
        .font(.footnote)
        .foregroundStyle(colors.textTertiary)
        if let onMessage, !blocked {
          Button {
            onMessage()
            dismiss()
          } label: {
            Label("メッセージを送る", systemImage: "message")
              .font(.headline)
              .frame(maxWidth: .infinity, minHeight: Metrics.control)
          }
          .buttonStyle(.borderedProminent)
          .buttonBorderShape(.capsule)
          .tint(colors.accentFill)
          .foregroundStyle(colors.accentOnFill)
          .padding(.top, 8)
        }
      }
      .padding(.horizontal, 24)
      .frame(maxWidth: .infinity)
      .padding(.top, 24)
      .frame(maxHeight: .infinity, alignment: .top)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
        ToolbarItem(placement: .primaryAction) {
          Menu("\(name)のメニュー", systemImage: "ellipsis") {
            if blocked {
              Button("ブロックを解除", systemImage: "person.crop.circle.badge.checkmark") {
                onUnblock()
                dismiss()
              }
            } else {
              Button("ブロック", systemImage: "nosign") {
                onBlock()
                dismiss()
              }
            }
            Divider()
            Button("通報", systemImage: "flag", role: .destructive) {
              onReport()
              dismiss()
            }
          }
        }
      }
    }
    .presentationDetents([.medium])
    .fullScreenCover(isPresented: $viewingPhoto) {
      PhotoViewer(photo: LinePhoto(id: photoID, width: 1, height: 1), groupID: groupID)
    }
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
    // Not a bubble: a dashed outline where one would be, with 表示 to
    // show it this once, as /design's.
    Button(action: onShow) {
      HStack(spacing: 8) {
        Text("ブロック中のメンバーのメッセージ")
          .foregroundStyle(colors.textTertiary)
        Text("表示")
          .fontWeight(.semibold)
          .foregroundStyle(colors.accentDefault)
      }
      .font(.footnote)
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .overlay(
        RoundedRectangle(cornerRadius: Radius.lg)
          .strokeBorder(colors.borderStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.leading, 40)
    .accessibilityElement(children: .combine)
    .accessibilityHint("押すと表示")
  }
}

/// Whom the user has blocked, read again as it changes.
struct BlocksRequest: FetchKeyRequest, Hashable {
  func fetch(_ db: Database) throws -> Set<String> {
    try Blocks.all(in: db)
  }
}
