import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// 設定's way into the chat with the people who make Pochical (/design's
/// SupportRow), drawn as a chat in the chats' list is: the app's icon, who
/// it is with and the latest line, and the answers not read yet.
struct SupportRow: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @State private var latest: SupportLine?
  @State private var unread = 0

  var body: some View {
    NavigationLink {
      SupportChatScreen()
    } label: {
      HStack(spacing: 12) {
        AppIconChoice.current.image(size: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text("作っている人とチャット").foregroundStyle(colors.textPrimary)
          Text(latest?.text ?? "ほしい機能や不具合のこと、気軽にどうぞ")
            .font(.footnote)
            .foregroundStyle(colors.textTertiary)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        if unread > 0 {
          Text("\(unread)")
            .font(.caption.weight(.semibold))
            .foregroundStyle(colors.accentOnFill)
            .padding(.horizontal, 7)
            .frame(minWidth: 20, minHeight: 20)
            .background(colors.accentFill, in: Capsule())
            .accessibilityLabel("未読\(unread)件")
        }
      }
    }
    // Read again each time the settings show it, as coming back from the
    // chat has read its answers, and as an answer comes.
    .onAppear { Task { await refresh() } }
    .onReceive(NotificationCenter.default.publisher(for: SupportLine.answered)) { _ in
      Task { await refresh() }
    }
  }

  private func refresh() async {
    guard let chat = try? await groupCalls.supportChat() else { return }
    latest = chat.lines.last
    unread = chat.unread
  }
}

/// The chat with the people who make Pochical (/design's SupportChatPage):
/// a small wish or trouble is easier written in a chat than a mail, and
/// the answer comes back in the same place. Drawn as the group chats are;
/// for now in words only. Its head says plainly who reads it and what
/// reaches them.
struct SupportChatScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @State private var lines: [SupportLine] = []
  /// Lines being sent, shown faint until the server keeps them; one that
  /// could not go waits to be tried again.
  @State private var waiting: [Waiting] = []
  @State private var draft = ""
  @State private var composing = false
  private let field = ComposerBox()

  struct Waiting: Identifiable, Hashable {
    let id: String
    let text: String
    var failed = false
  }

  var body: some View {
    ScrollViewReader { reader in
      ScrollView {
        LazyVStack(spacing: 4) {
          intro
          ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
            let first = index == 0 || lines[index - 1].fromSupport != line.fromSupport
            let last = index == lines.count - 1 || lines[index + 1].fromSupport != line.fromSupport
            row(text: line.text, mine: !line.fromSupport, first: first, waiting: false)
              .padding(.top, first && index > 0 ? 8 : 0)
            if last {
              Text(Self.timeText(line.sentAt))
                .font(.caption2)
                .foregroundStyle(colors.textTertiary)
                .frame(maxWidth: .infinity, alignment: line.fromSupport ? .leading : .trailing)
                .padding(.horizontal, line.fromSupport ? 52 : 16)
            }
          }
          ForEach(waiting) { line in
            row(text: line.text, mine: true, first: false, waiting: !line.failed)
            if line.failed {
              Button("送れませんでした。もう一度送る") { send(line) }
                .font(.caption)
                .foregroundStyle(colors.dangerDefault)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal, 16)
            }
          }
          Color.clear.frame(height: 1).id("end")
        }
        .padding(.vertical, 8)
      }
      .defaultScrollAnchor(.bottom)
      .onChange(of: lines.count + waiting.count) { _, _ in
        withAnimation { reader.scrollTo("end", anchor: .bottom) }
      }
    }
    .background(colors.backgroundBase)
    .safeAreaInset(edge: .bottom, spacing: 0) { composer }
    .navigationTitle("ポチカル")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.hidden, for: .tabBar)
    .task { await load() }
    .refreshable { await load() }
    // An answer shows as it is written, as a group chat's line does.
    .onReceive(NotificationCenter.default.publisher(for: SupportLine.answered)) { _ in
      Task { await load() }
    }
    .onAppear { Notifications.shared.supportOpen = true }
    .onDisappear { Notifications.shared.supportOpen = false }
  }

  /// Who this reaches, and everything that does.
  private var intro: some View {
    VStack(spacing: 8) {
      AppIconChoice.current.image(size: 56)
      Text("ポチカルを作っている人に届きます")
        .font(.headline)
        .foregroundStyle(colors.textPrimary)
      Text("使いにくいところ、ほしい機能、不具合のこと。ちょっとしたことでも、気軽に書いてください。返事は数日のうちに、ここに届きます。")
        .font(.subheadline)
        .foregroundStyle(colors.textSecondary)
      Text("届くのは、ここに書いたことと、アプリと端末の情報だけです。\n\(Self.device)")
        .font(.caption)
        .foregroundStyle(colors.textTertiary)
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: 300)
    .padding(.vertical, 16)
  }

  /// A line, Pochical's people's under the app's icon at the start of a
  /// run, as a member's face starts theirs.
  private func row(text: String, mine: Bool, first: Bool, waiting: Bool) -> some View {
    HStack(alignment: .top, spacing: 8) {
      if mine {
        Spacer(minLength: 48)
      } else if first {
        AppIconChoice.current.image(size: 28)
      } else {
        Color.clear.frame(width: 28, height: 1)
      }
      MessageBubble(text: text, mine: mine, first: first, waiting: waiting, nameOf: { _ in "" })
      if !mine {
        Spacer(minLength: 48)
      }
    }
    .padding(.horizontal, 16)
  }

  private var composer: some View {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return HStack(alignment: .bottom, spacing: 8) {
      ComposerField(
        placeholder: "メッセージ", text: $draft, limit: TextLimits.chatMessage,
        composing: $composing, box: field
      )
      .overlay(alignment: .leading) {
        if draft.isEmpty {
          Text("メッセージ")
            .foregroundStyle(colors.textQuaternary)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .frame(minHeight: 38)
      .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xl))
      Button {
        let text = String(field.commit().prefix(TextLimits.chatMessage))
          .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        send(Waiting(id: UUID().uuidString.lowercased(), text: text))
      } label: {
        Image(systemName: "arrow.up")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(colors.accentOnFill)
          .frame(width: 38, height: 38)
          .background(colors.accentFill, in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("送る")
      .opacity(trimmed.isEmpty && !composing ? 0.5 : 1)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(colors.backgroundBase)
  }

  private func load() async {
    guard let chat = try? await groupCalls.supportChat() else { return }
    lines = chat.lines
    if chat.unread > 0 {
      try? await groupCalls.markSupportRead()
    }
  }

  /// Sends a line, faint until kept; one that could not go stays to be
  /// tried again with the same id, so it is kept once.
  private func send(_ line: Waiting) {
    if let index = waiting.firstIndex(where: { $0.id == line.id }) {
      waiting[index].failed = false
    } else {
      waiting.append(line)
    }
    Task {
      do {
        let kept = try await groupCalls.sendSupport(line.text, id: line.id, device: Self.device)
        waiting.removeAll { $0.id == line.id }
        lines.append(kept)
      } catch {
        ReviewPrompt.troubled = true
        if let index = waiting.firstIndex(where: { $0.id == line.id }) {
          waiting[index].failed = true
        }
      }
    }
  }

  /// When a line was sent, as the app writes days: 10月8日 12:35.
  private static func timeText(_ date: Date) -> String {
    let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
    let day = Day(date, in: .current)
    return "\(day.monthDayText) \(parts.hour ?? 0):\(String(format: "%02d", parts.minute ?? 0))"
  }

  /// The app's version and the device, as they reach Pochical's people.
  private static var device: String {
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    let system = UIDevice.current
    return "ポチカル \(version)・\(system.model) (\(system.systemName) \(system.systemVersion))"
  }
}
