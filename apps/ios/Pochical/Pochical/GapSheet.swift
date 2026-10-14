import PochicalDesign
import PochicalKit
import SwiftUI

/// What 完了 asks when the month has blank days before its last entered
/// one: whether they are days off, made so all at once with the button
/// (spec/shift-patterns.md, Blanks when entering ends). Asked, not
/// explained: a blank day is most often a day off not entered.
struct GapSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(Settings.self) private var settings
  let days: [Day]
  /// The patterns that count as off; with more than one, chips pick
  /// which fills the days, the first to begin with.
  let offPatterns: [Pattern]
  let onFill: (Pattern) -> Void
  /// The pattern picked to fill with, shared with the calendar behind,
  /// which shows it faint on the days; none for the first.
  @Binding var picked: PatternID?
  /// The patterns the person's look showed blank as the sheet opened:
  /// カレンダーでは空白で見せる is offered for the one picked unless it was
  /// one of them, and stays while the sheet is open, as many leave a day
  /// off blank for the look, which they keep while the days are filled.
  @State private var blankAtOpen: Set<PatternID>
  /// Switched on: the look turns blank as the days are filled, and not
  /// before, so × changes nothing.
  @State private var blank = false

  init(
    days: [Day], offPatterns: [Pattern], picked: Binding<PatternID?>, openedLook: MarkOptions,
    onFill: @escaping (Pattern) -> Void
  ) {
    self.days = days
    _picked = picked
    self.offPatterns = offPatterns
    self.onFill = onFill
    _blankAtOpen = State(
      initialValue: Set(
        offPatterns.map(\.id).filter { openedLook.offLook(of: $0) == .blank }))
  }

  private var offPattern: Pattern {
    offPatterns.first { $0.id == picked } ?? offPatterns[0]
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          // The days, as /design's tags: words to read, not to press.
          WrappingRow(spacing: 8) {
            ForEach(days, id: \.self) { day in
              Text(day.dayWeekdayText)
                .font(.footnote)
                .foregroundStyle(colors.textSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.sm))
            }
          }
          if offPatterns.count > 1 {
            WrappingRow(spacing: 8) {
              ForEach(offPatterns, id: \.id) { pattern in
                ChoiceChip(name: pattern.name, picked: pattern.id == offPattern.id) {
                  picked = pattern.id
                }
              }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("入れるパターン")
          }
          if !blankAtOpen.contains(offPattern.id) {
            Toggle(isOn: $blank) {
              Text("カレンダーでは空白で見せる")
              Text("お休みとして入れて、印は出しません")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 8)
      }
      .scrollBounceBehavior(.basedOnSize)
      // The answer stays at the foot, whatever scrolls above it.
      .safeAreaInset(edge: .bottom) {
        Button {
          if blank && !blankAtOpen.contains(offPattern.id) {
            settings.device.look.setOffLook(
              .blank, of: offPattern.id, offPatterns: offPatterns.map(\.id))
          }
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
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
      }
      .navigationTitle(days.count == 1 ? "この日はお休みですか？" : "この\(days.count)日はお休みですか？")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium])
    // Opaque, so the calendar's own buttons do not show through the glass
    // under this one's.
    .presentationBackground(colors.backgroundBase)
  }
}
