import PochicalDesign
import PochicalKit
import SwiftUI

// 使うパターンを選んでください, after the kind of work in はじめの設定 and
// 新しい仕事にする (/design's PatternsStep; spec/shift-patterns.md,
// Changing jobs): every ready-made pattern as a chip under its heading,
// the kind of work's own already picked.

/// The chips, the person adding what else their days hold (出張, 希望休…)
/// or dropping what they never have. Those the kind of work's order needs
/// stay picked.
struct ReadyPatternChips: View {
  @Environment(\.themeColors) private var colors
  @Binding var picked: Set<PatternID>
  let needed: Set<PatternID>

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      ForEach(ReadyPatterns.offeredSections, id: \.title) { section in
        VStack(alignment: .leading, spacing: 8) {
          Text(section.title)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(colors.textTertiary)
            .accessibilityAddTraits(.isHeader)
          WrappingRow(spacing: 8) {
            ForEach(section.ids, id: \.self) { id in
              if let pattern = readyByID[id] {
                ChoiceChip(name: pattern.name, picked: picked.contains(id)) {
                  toggle(id)
                } leading: {
                  ShiftMark(pattern: pattern, size: 16).padding(.leading, 6)
                }
              }
            }
          }
        }
      }
      if !needed.isEmpty {
        Text("並びに入っているパターンは外せません。")
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
      }
    }
  }

  private func toggle(_ id: PatternID) {
    guard !needed.contains(id) else { return }
    if picked.contains(id) {
      picked.remove(id)
    } else {
      picked.insert(id)
    }
  }
}

extension JobTemplate {
  /// The patterns its order needs, which cannot be dropped.
  var needed: Set<PatternID> { custom ? [] : Set(sequence ?? []) }

  /// A weekly order, which starts on a Sunday with nothing to type.
  var startsWeekly: Bool { weekly && sequence != nil }
}

/// The picked patterns, in the order the chips show them.
func chosenPatterns(_ picked: Set<PatternID>) -> [PatternID] {
  ReadyPatterns.offered.filter(picked.contains)
}

/// The ready-made patterns with the ids, as the person's.
func readyPatterns(_ ids: [PatternID]) -> [Pattern] {
  let keeping = Set(ids)
  return ids.compactMap(ReadyPatterns.pattern).map { Pattern($0, keeping: keeping) }
}
