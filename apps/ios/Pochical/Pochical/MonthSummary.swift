import PochicalDesign
import PochicalKit
import SwiftUI

// 今月のお休み under the calendar and 今月の内訳 it opens (/design's
// MonthSummary and BreakdownSheet).

/// A number of days that opens what they are (/design's SummaryRow): a
/// rounded row, the label quiet, the number in the accent, the chevron
/// faint, the whole row pressed.
struct SummaryRow: View {
  @Environment(\.themeColors) private var colors
  let label: String
  let days: Int
  let onOpen: () -> Void

  var body: some View {
    Button(action: onOpen) {
      HStack {
        Text(label)
          .font(.footnote)
          .foregroundStyle(colors.textSecondary)
        Spacer()
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text(days, format: .number)
            .font(.system(size: 25, weight: .semibold))
            .monospacedDigit()
            .contentTransition(.numericText(value: Double(days)))
          Text("日").font(.footnote)
        }
        .foregroundStyle(colors.accentDefault)
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(colors.textQuaternary)
          .padding(.leading, 12)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(label) \(days)日")
    .animation(Springs.standard, value: days)
  }
}

/// 今月の内訳: how many days of each pattern and how many still blank,
/// then the month's length.
struct MonthBreakdownSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let month: Day
  /// Each pattern in the person's order, with its days in the month.
  let counts: [(pattern: Pattern, days: Int)]
  let unfilled: Int

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(counts, id: \.pattern.id) { count in
            LabeledContent {
              days(count.days)
            } label: {
              Label {
                Text(count.pattern.name).foregroundStyle(colors.textPrimary)
              } icon: {
                ShiftMark(pattern: count.pattern, size: 18)
              }
            }
          }
          LabeledContent {
            days(unfilled)
          } label: {
            Text("未入力").foregroundStyle(colors.textTertiary)
          }
        } footer: {
          Text("この月は全\(month.daysOfMonth.count)日")
            .frame(maxWidth: .infinity)
        }
        .settingsRows()
      }
      .settingsList()
      .navigationTitle("今月の内訳")
      .navigationSubtitle(month.yearMonthText)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
  }

  private func days(_ count: Int) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(count, format: .number)
        .font(.title3.weight(.semibold))
        .monospacedDigit()
      Text("日").font(.footnote)
    }
    .foregroundStyle(colors.accentDefault)
    .accessibilityElement(children: .combine)
  }
}
