import PochicalDesign
import PochicalKit
import SwiftUI

/// What 完了 asks when the month has blank days before its last entered
/// one: whether to make them days off, all at once (spec/shift-patterns.md,
/// Blanks when entering ends).
///
/// It stands as tall as it holds (`fittedSheet`), so it draws its own bar
/// rather than a NavigationStack's.
struct GapSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let month: Day
  let days: [Day]
  /// The patterns that count as off; with more than one, chips pick
  /// which fills the days, the first to begin with.
  let offPatterns: [Pattern]
  /// The month's days off now.
  let offCount: Int
  /// Whether filling the days leaves the month with no blank day.
  let completes: Bool
  let onFill: (Pattern) -> Void
  @State private var picked: PatternID?

  private var offPattern: Pattern {
    offPatterns.first { $0.id == picked } ?? offPatterns[0]
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // The bar of an iOS sheet: × at the leading edge, the title in the
      // middle.
      ZStack {
        Text("空いている日が\(days.count)日あります")
          .font(.headline)
          .foregroundStyle(colors.textPrimary)
          .padding(.horizontal, Metrics.touch + 8)
          .accessibilityAddTraits(.isHeader)
        Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
          .labelStyle(.iconOnly)
          .buttonStyle(BarButton())
          .foregroundStyle(colors.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, -4)
      .padding(.top, 16)
      .padding(.bottom, 16)
      VStack(alignment: .leading, spacing: 0) {
        lead
          .font(.subheadline)
          .foregroundStyle(colors.textSecondary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.bottom, 20)
        ScrollView(.horizontal) {
          HStack(spacing: 8) {
            ForEach(days, id: \.self) { day in
              Text(day.dayWeekdayText)
                .font(.footnote)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(colors.fillTertiary, in: Capsule())
            }
          }
        }
        .scrollIndicators(.hidden)
        .padding(.bottom, 16)
        if offPatterns.count > 1 {
          HStack(spacing: 8) {
            ForEach(offPatterns, id: \.id) { pattern in
              Button(pattern.name) { picked = pattern.id }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .tint(pattern.id == offPattern.id ? colors.accentDefault : colors.textSecondary)
                .accessibilityAddTraits(pattern.id == offPattern.id ? .isSelected : [])
            }
          }
          .accessibilityElement(children: .contain)
          .accessibilityLabel("入れるパターン")
          .padding(.bottom, 16)
        }
        Button {
          onFill(offPattern)
          dismiss()
        } label: {
          Text("\(offPattern.name)にする")
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: Metrics.control)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(colors.accentFill)
        .foregroundStyle(colors.accentOnFill)
      }
    }
    .padding([.horizontal, .bottom], 20)
  }

  /// What filling the days does: the month's days off, which the summary
  /// counts, grow by them, and a month left with no blank is complete.
  private var lead: Text {
    let count = Text("\(offCount)日 → \(offCount + days.count)日")
      .fontWeight(.bold)
      .foregroundStyle(colors.accentDefault)
    let change = Text(
      "\(offPattern.name)にすると、\(month.monthText)のお休みが\(count)になります。")
    guard completes else { return change }
    return Text("\(change)\nこれで\(month.monthText)が全部埋まります。")
  }
}
