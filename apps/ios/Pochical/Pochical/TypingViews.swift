import PochicalDesign
import SwiftUI

/// Someone writing, under the latest line (spec/chat.md, Unread lines and
/// typing): three dots rising in turn, in a bubble of the others' kind with
/// their face. A screen reader hears 〇〇が入力中.
struct TypingLine: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let name: String

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      LetterAvatar(name: name, size: 32)
      PhaseAnimator([0, 1, 2]) { phase in
        HStack(spacing: 4) {
          ForEach(0..<3, id: \.self) { dot in
            Circle()
              .fill(colors.textTertiary)
              .frame(width: 7, height: 7)
              .offset(y: !reduceMotion && dot == phase ? -3 : 0)
          }
        }
      } animation: { _ in .easeInOut(duration: 0.3) }
      .padding(.horizontal, 14)
      .padding(.vertical, 13)
      .background(colors.fillTertiary, in: BubbleShape(mine: false, first: true))
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(name)が入力中")
  }
}
