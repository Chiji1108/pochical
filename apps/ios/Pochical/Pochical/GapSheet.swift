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
  @Environment(Settings.self) private var settings
  let month: Day
  let days: [Day]
  /// The patterns that count as off; with more than one, chips pick
  /// which fills the days, the first to begin with.
  let offPatterns: [Pattern]
  /// The month's days off now.
  let offCount: Int
  /// Whether filling the days leaves the month with no blank day.
  let completes: Bool
  /// Whether the person shares their days with a group, who will see
  /// the days off too.
  let sharing: Bool
  let onFill: (Pattern) -> Void
  @State private var picked: PatternID?
  /// 休みの日は空白で見せる is offered to whoever was not showing days off
  /// blank as the sheet opened, and stays while it is open.
  @State private var offerBlank: Bool

  init(
    month: Day, days: [Day], offPatterns: [Pattern], offCount: Int, completes: Bool,
    sharing: Bool, blankOff: Bool, onFill: @escaping (Pattern) -> Void
  ) {
    self.month = month
    self.days = days
    self.offPatterns = offPatterns
    self.offCount = offCount
    self.completes = completes
    self.sharing = sharing
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
          .font(.body)
          .foregroundStyle(colors.textPrimary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.bottom, 20)
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
            Text("休みの日は空白で見せる")
            Text("入力中と週表示では薄く出ます")
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
        Button("あとで入れる") { dismiss() }
          .buttonStyle(.plain)
          .font(.body)
          .foregroundStyle(colors.textTertiary)
          .frame(maxWidth: .infinity, minHeight: Metrics.touch)
          .padding(.top, 4)
      }
    }
    .padding(.horizontal, 24)
    .padding(.bottom, 12)
  }

  /// What filling the days does: the month's days off, which the summary
  /// counts, grow by them, and a month left with no blank is complete.
  private var lead: Text {
    let count = Text("\(offCount)日 → \(offCount + days.count)日")
      .fontWeight(.bold)
      .foregroundStyle(colors.accentDefault)
    var said = Text(
      "\(offPattern.name)にすると、\(month.monthText)のお休みが\(count)になります。")
    if sharing {
      said = Text("\(said)\nグループの人にもお休みが見えます。")
    }
    if completes {
      said = Text("\(said)\nこれで\(month.monthText)が全部埋まります。")
    }
    return said
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
