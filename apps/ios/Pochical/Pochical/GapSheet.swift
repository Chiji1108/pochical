import PochicalDesign
import PochicalKit
import SwiftUI

/// What 完了 asks when the month has blank days before its last entered
/// one: whether they are days off, made so all at once with the button
/// (spec/shift-patterns.md, Blanks when entering ends). Asked, not
/// explained: a blank day is most often a day off not entered.
///
/// It stands as tall as it holds (`fittedSheet`), so it draws its own bar
/// rather than a NavigationStack's.
struct GapSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  @Environment(Settings.self) private var settings
  let days: [Day]
  /// The patterns that count as off; with more than one, chips pick
  /// which fills the days, the first to begin with.
  let offPatterns: [Pattern]
  let onFill: (Pattern) -> Void
  @State private var picked: PatternID?
  /// カレンダーでは空白で見せる is offered to whoever was not showing days
  /// off blank as the sheet opened, and stays while it is open: many
  /// leave days off blank for the look, which they keep while the days
  /// are filled.
  @State private var offerBlank: Bool

  init(days: [Day], offPatterns: [Pattern], blankOff: Bool, onFill: @escaping (Pattern) -> Void) {
    self.days = days
    self.offPatterns = offPatterns
    self.onFill = onFill
    _offerBlank = State(initialValue: !blankOff)
  }

  private var offPattern: Pattern {
    offPatterns.first { $0.id == picked } ?? offPatterns[0]
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // The bar of an iOS sheet: × at the leading edge, the title in the
      // middle.
      ZStack {
        Text(days.count == 1 ? "この日はお休みですか？" : "この\(days.count)日はお休みですか？")
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
        .padding(.bottom, 16)
        if offPatterns.count > 1 {
          WrappingRow(spacing: 8) {
            ForEach(offPatterns, id: \.id) { pattern in
              GapChoice(name: pattern.name, picked: pattern.id == offPattern.id) {
                picked = pattern.id
              }
            }
          }
          .accessibilityElement(children: .contain)
          .accessibilityLabel("入れるパターン")
          .padding(.bottom, 16)
        }
        if offerBlank {
          @Bindable var settings = settings
          Toggle(isOn: $settings.device.look.options.blankOff) {
            Text("カレンダーでは空白で見せる")
            Text("お休みとして入れて、印は出しません")
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 10)
          .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xxl))
          .padding(.bottom, 16)
        }
        Button {
          onFill(offPattern)
          dismiss()
        } label: {
          Text("\(offPattern.name)にする")
            .font(.body.weight(.medium))
            .frame(maxWidth: .infinity, minHeight: Metrics.control)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(colors.accentFill)
        .foregroundStyle(colors.accentOnFill)
      }
    }
    .padding(.horizontal, 24)
    .padding(.bottom, 20)
  }
}

/// One of the patterns to fill with, as /design's chips: picked, on the
/// accent's container.
private struct GapChoice: View {
  @Environment(\.themeColors) private var colors
  let name: String
  let picked: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(name)
        .font(.footnote.weight(picked ? .semibold : .regular))
        .foregroundStyle(picked ? colors.accentDefault : colors.textSecondary)
        .padding(.horizontal, 12)
        .frame(minHeight: 34)
        .background(picked ? colors.accentContainer : colors.backgroundCard, in: Capsule())
        .overlay(Capsule().strokeBorder(picked ? colors.accentBorder : colors.borderDefault))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(picked ? .isSelected : [])
  }
}
