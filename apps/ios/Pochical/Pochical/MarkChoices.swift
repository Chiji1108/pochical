import PochicalDesign
import SwiftUI

// The choices a mark is picked from, a pattern's and a group's alike
// (/design's ChoiceGrid and colorGrid).

/// A grid of choices, eight across, the chosen one ringed.
struct MarkChoiceGrid<Item: Hashable, Cell: View>: View {
  @Environment(\.themeColors) private var colors
  let items: [Item]
  let chosen: Item
  let cell: (Item) -> Cell
  let pick: (Item) -> Void

  init(
    _ items: [Item], chosen: Item, @ViewBuilder cell: @escaping (Item) -> Cell,
    pick: @escaping (Item) -> Void
  ) {
    self.items = items
    self.chosen = chosen
    self.cell = cell
    self.pick = pick
  }

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 8), spacing: 6) {
      ForEach(items, id: \.self) { item in
        Button {
          pick(item)
        } label: {
          cell(item)
            .frame(width: 38, height: 38)
            .background {
              if item == chosen {
                RoundedRectangle(cornerRadius: Radius.sm)
                  .strokeBorder(colors.accentDefault, lineWidth: 2)
              }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(item == chosen ? .isSelected : [])
      }
    }
    .padding(.vertical, 4)
  }
}

/// A mark's colors, six across (/design's colorGrid): each a circle of
/// its tint edged in its color, the picked one ringed apart from it.
struct MarkColorGrid: View {
  @Environment(\.themeColors) private var colors
  let chosen: Int
  let pick: (Int) -> Void

  var body: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6), spacing: 12) {
      ForEach(colors.marks.indices, id: \.self) { slot in
        let mark = colors.marks[slot]
        Button {
          pick(slot)
        } label: {
          Circle()
            .fill(mark.tint)
            .strokeBorder(mark.color, lineWidth: 2)
            .frame(width: 36, height: 36)
            .padding(5)
            .overlay {
              if slot == chosen {
                Circle().strokeBorder(mark.color, lineWidth: 2)
              }
            }
            .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(mark.name)
        .accessibilityAddTraits(slot == chosen ? .isSelected : [])
      }
    }
    .padding(.vertical, 4)
  }
}

/// The icons or emoji offered, the one picked from all of them (the icon
/// sheet, the emoji keyboard) first when it is not among them.
func withPicked(_ offered: [String], _ chosen: String) -> [String] {
  offered.contains(chosen) || chosen.isEmpty ? offered : [chosen] + offered
}
