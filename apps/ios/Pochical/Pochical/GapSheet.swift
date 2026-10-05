import PochicalDesign
import PochicalKit
import SwiftUI

/// What 完了 asks when the month has blank days before its last entered
/// one: whether to make them days off, all at once (spec/shift-patterns.md,
/// Blanks when entering ends).
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
  let onFill: (Pattern) -> Void
  @State private var picked: PatternID?

  private var offPattern: Pattern {
    offPatterns.first { $0.id == picked } ?? offPatterns[0]
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 16) {
        Text(lead)
          .font(.subheadline)
          .foregroundStyle(colors.textSecondary)
        ScrollView(.horizontal) {
          HStack(spacing: 8) {
            ForEach(days, id: \.self) { day in
              Text("\(day.day)日(\(WeekdayRow.names[day.weekday]))")
                .font(.footnote)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(colors.fillTertiary, in: Capsule())
            }
          }
        }
        .scrollIndicators(.hidden)
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
        }
        Spacer(minLength: 0)
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
      .padding(.horizontal, 20)
      .padding(.bottom, 8)
      .navigationTitle("空いている日が\(days.count)日あります")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium])
  }

  private var lead: String {
    "\(offPattern.name)にすると、\(month.month)月のお休みが\(offCount)日 → \(offCount + days.count)日になります。"
  }
}
