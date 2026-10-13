import PochicalDesign
import PochicalKit
import SwiftUI

// The ready-made patterns as chips under their headings (/design's
// ReadyPatternChips), for picking several at once: 勤務や休みを選んで
// ください, after the kind of work in はじめの設定 and 新しい仕事にする,
// and パターンを追加 (spec/shift-patterns.md).

/// The chips, the person adding what else their days hold (出張, 希望休…)
/// or dropping what they never have. Those the kind of work's order needs
/// stay picked.
struct ReadyPatternChips: View {
  @Environment(\.themeColors) private var colors
  @Binding var picked: Set<PatternID>
  let needed: Set<PatternID>
  /// The ones to show; a heading left with none goes.
  var offered: (PatternID) -> Bool = { _ in true }

  var body: some View {
    let sections = ReadyPatterns.offeredSections
      .map { (title: $0.title, ids: $0.ids.filter(offered)) }
      .filter { !$0.ids.isEmpty }
    VStack(alignment: .leading, spacing: 16) {
      ForEach(sections, id: \.title) { section in
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
        Text("繰り返しに入っている勤務や休みは外せません。")
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
      }
    }
  }

  /// Picking a pattern with a next day picks that too, as 夜勤 brings its
  /// 明け, which can still be dropped on its own.
  private func toggle(_ id: PatternID) {
    guard !needed.contains(id) else { return }
    if picked.contains(id) {
      picked.remove(id)
    } else {
      picked.insert(id)
      if let follows = ReadyPatterns.pattern(id)?.nextDay {
        picked.insert(follows)
      }
    }
  }
}

extension JobTemplate {
  /// The patterns its order needs, which cannot be dropped.
  var needed: Set<PatternID> { custom ? [] : Set(sequence ?? []) }

  /// A weekly order, which starts on a Sunday with nothing to type.
  var startsWeekly: Bool { weekly && sequence != nil }
}

/// What the chips ask: a kind of work's own are picked already, so the
/// rest are extras; 自分で作る picks them all.
func patternsQuestion(_ template: JobTemplate) -> (title: String, description: String) {
  template.custom
    ? ("勤務や休みを選んでください", "カレンダーに入れるものです。あとから足したり、名前や時間を変えたりできます。")
    : ("ほかにも使う勤務や休みはありますか？", "選んだ働き方の分は、もう選んであります。あとから足したり、名前や時間を変えたりできます。")
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
