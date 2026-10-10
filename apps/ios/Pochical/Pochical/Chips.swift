import PochicalDesign
import SwiftUI

/// One of a row of choices as a chip (/design's ChoiceChip): on the card's
/// ground with a line round it, and picked, on the accent's container. A
/// face at its start brings the chip's end in close around it.
struct ChoiceChip<Leading: View>: View {
  @Environment(\.themeColors) private var colors
  let name: String
  let picked: Bool
  let action: () -> Void
  @ViewBuilder let leading: () -> Leading

  var body: some View {
    Button(action: action) {
      HStack(spacing: Leading.self == EmptyView.self ? 4 : 8) {
        leading()
        Text(name)
          .font(.footnote.weight(picked ? .semibold : .regular))
          .lineLimit(1)
      }
      .foregroundStyle(picked ? colors.accentDefault : colors.textSecondary)
      .padding(.leading, Leading.self == EmptyView.self ? 12 : 4)
      .padding(.trailing, 12)
      .frame(minHeight: 34)
      .background(picked ? colors.accentContainer : colors.backgroundCard, in: Capsule())
      .overlay(Capsule().strokeBorder(picked ? colors.accentBorder : colors.borderDefault))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(picked ? .isSelected : [])
  }
}

extension ChoiceChip where Leading == EmptyView {
  init(name: String, picked: Bool, action: @escaping () -> Void) {
    self.init(name: name, picked: picked, action: action) { EmptyView() }
  }
}
