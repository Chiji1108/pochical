import PochicalDesign
import PochicalKit
import SwiftUI

// 今月のお休み under the calendar and 今月の内訳 it opens (/design's
// MonthSummary and BreakdownSheet).

/// A number of days that opens what they are (/design's SummaryRow): a
/// rounded row, the label quiet, the number in the accent, the chevron
/// faint, the whole row pressed. The label and the number may be names
/// that roll, as the calendar's do with the month.
struct SummaryRow<Label: View, Days: View>: View {
  @Environment(\.themeColors) private var colors
  /// What a screen reader hears for the whole row.
  let spoken: String
  let onOpen: () -> Void
  @ViewBuilder let label: () -> Label
  @ViewBuilder let days: () -> Days

  var body: some View {
    Button(action: onOpen) {
      HStack {
        label()
          .font(.footnote)
          .foregroundStyle(colors.textSecondary)
        Spacer()
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          days()
            .font(.system(size: 25, weight: .semibold))
            .monospacedDigit()
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
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(spoken)
    .accessibilityAddTraits(.isButton)
  }
}

/// 今月のお休み, or 〇月のお休み away from this month (/design's
/// MonthSummary): the month and its count roll as the heading's name does,
/// following the pages to the month coming in, so the row is already right
/// as the page lands; the words around them stay put. With reduced motion
/// they just change.
struct MonthSummary: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let position: PagerPosition
  /// The month the page at an index shows.
  let monthAt: (Int) -> Day
  /// A month's days off.
  let daysOff: (Day) -> Int
  let onOpen: (Day) -> Void

  var body: some View {
    let at = position.pages
    let page = Int(at.rounded())
    let share = reduceMotion ? 0 : at - CGFloat(page)
    let month = monthAt(page)
    let coming = share > 0 ? monthAt(page + 1) : share < 0 ? monthAt(page - 1) : month
    SummaryRow(spoken: "\(name(month))のお休み \(daysOff(month))日") {
      onOpen(month)
    } label: {
      HStack(alignment: .firstTextBaseline, spacing: 0) {
        RollingText(text: name(month), coming: name(coming), share: share)
        Text("のお休み")
      }
    } days: {
      RollingText(
        text: String(daysOff(month)), coming: String(daysOff(coming)), share: share)
    }
  }

  private func name(_ month: Day) -> String {
    month == Day.today.firstOfMonth ? "今月" : month.monthText
  }
}

/// 今月の内訳: how many days of each pattern and how many still blank,
/// then the month's length; half the screen, or all of it for many
/// patterns.
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
    .presentationDetents([.medium, .large])
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
