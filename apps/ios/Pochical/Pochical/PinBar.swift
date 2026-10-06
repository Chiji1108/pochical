import PochicalDesign
import PochicalKit
import SwiftUI

/// The pinned lines over a chat (/design's PinBar; spec/chat.md, Pins):
/// the latest under the header, as LINE shows its announcement, a tap
/// going to it; with more than one, ▾ opening all of them under it, each
/// with who wrote it. A long press offers ピン留めを外す, as a line's long
/// press opens its menu; no × in sight, as a pin is everyone's.
struct PinBar: View {
  @Environment(\.themeColors) private var colors
  let pins: [ChatLineRow]
  @Binding var open: Bool
  let nameOf: (String) -> String
  let onJump: (Int64) -> Void
  let onUnpin: (Int64) -> Void

  var body: some View {
    if let latest = pins.first {
      let many = pins.count > 1
      VStack(spacing: 0) {
        HStack(spacing: 4) {
          item(latest) {
            HStack(spacing: 12) {
              Image(systemName: "pin")
                .foregroundStyle(colors.accentDefault)
                .accessibilityHidden(true)
              VStack(alignment: .leading, spacing: 0) {
                Text(many ? "ピン留め・\(pins.count)件" : "ピン留め")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(colors.accentDefault)
                words(latest)
              }
            }
          }
          if many {
            Button(
              open ? "ピン留めを閉じる" : "ピン留めをすべて表示",
              systemImage: open ? "chevron.up" : "chevron.down"
            ) {
              withAnimation(.easeOut(duration: 0.2)) { open.toggle() }
            }
            .labelStyle(.iconOnly)
            .font(.body.weight(.semibold))
            .foregroundStyle(colors.textSecondary)
            .frame(width: Metrics.touch, height: Metrics.touch)
          }
        }
        .padding(.horizontal, 8)
        if many, open {
          VStack(spacing: 0) {
            ForEach(pins, id: \.seq) { line in
              item(line) {
                VStack(alignment: .leading, spacing: 0) {
                  Text(nameOf(line.authorID))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(colors.accentDefault)
                  words(line)
                }
              }
            }
          }
          .padding(.horizontal, 8)
          .overlay(alignment: .top) {
            Rectangle().fill(colors.separator).frame(height: 1)
          }
          .transition(.opacity)
        }
      }
      .padding(.vertical, 4)
      .background(colors.backgroundBase)
      .overlay(alignment: .bottom) {
        Rectangle().fill(colors.separator).frame(height: 1)
      }
    }
  }

  /// A pin a tap goes to, its long press offering ピン留めを外す.
  private func item(_ line: ChatLineRow, @ViewBuilder label: () -> some View) -> some View {
    Button {
      onJump(line.seq)
    } label: {
      label()
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .contextMenu {
      Button("ピン留めを外す", systemImage: "pin.slash") { onUnpin(line.seq) }
    }
    .accessibilityHint("押すとメッセージへ、長押しでピン留めを外す")
  }

  /// A pinned line's words on one line, its mentions as names.
  private func words(_ line: ChatLineRow) -> some View {
    Text(plainText(line.text, nameOf: nameOf).replacingOccurrences(of: "\n", with: " "))
      .font(.subheadline)
      .foregroundStyle(colors.textPrimary)
      .lineLimit(1)
  }
}

/// A pinned line gone to, and the lines held, which a page's coming
/// changes.
struct JumpKey: Hashable {
  let target: Int64?
  let first: Int64?
}
