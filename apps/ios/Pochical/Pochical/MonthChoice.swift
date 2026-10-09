import PochicalDesign
import PochicalKit
import SwiftUI

/// 月を選ぶ (/design's MonthChoiceSheet), as Google Calendar's title opens
/// a small calendar: a year with its arrows, as a picker keeps them, and
/// its twelve months. The month shown is filled, this month outlined, and
/// months past the list's ends can't be picked.
struct MonthChoiceSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  /// The month on screen, whose year the sheet opens on.
  let month: Day
  let first: Day
  let last: Day
  let onPick: (Day) -> Void
  @State private var year: Int

  init(month: Day, first: Day, last: Day, onPick: @escaping (Day) -> Void) {
    self.month = month
    self.first = first
    self.last = last
    self.onPick = onPick
    _year = State(initialValue: month.year)
  }

  var body: some View {
    let today = Day.today
    VStack(spacing: 16) {
      ZStack {
        Text("月を選ぶ").font(.headline)
        Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
          .labelStyle(.iconOnly)
          .buttonStyle(BarButton())
          .foregroundStyle(colors.textPrimary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      HStack(spacing: 8) {
        Button("前の年", systemImage: "chevron.left") { year -= 1 }
          .disabled(year <= first.year)
        Text(verbatim: "\(year)年")
          .font(.headline)
          .monospacedDigit()
          .contentTransition(.numericText(value: Double(year)))
          .animation(.default, value: year)
        Button("次の年", systemImage: "chevron.right") { year += 1 }
          .disabled(year >= last.year)
      }
      .labelStyle(.iconOnly)
      .buttonStyle(.plain)
      .foregroundStyle(colors.accentDefault)
      .frame(minHeight: Metrics.touch)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8)
      {
        ForEach(1...12, id: \.self) { number in
          let choice = Day(year: year, month: number, day: 1)
          let shown = choice == month.firstOfMonth
          let current = choice == today.firstOfMonth
          let outside = choice < first.firstOfMonth || choice > last.firstOfMonth
          Button {
            onPick(choice)
            dismiss()
          } label: {
            Text("\(number)月")
              .font(.body.weight(.semibold))
              .foregroundStyle(
                outside
                  ? colors.textDisabled
                  : shown ? colors.accentOnFill : current ? colors.accentDefault : colors.textPrimary
              )
              .frame(maxWidth: .infinity, minHeight: Metrics.touch)
              .background(shown ? colors.accentFill : colors.fillQuaternary, in: Capsule())
              .overlay {
                if current, !shown {
                  Capsule().strokeBorder(colors.accentDefault, lineWidth: 1.5)
                }
              }
          }
          .buttonStyle(.plain)
          .disabled(outside)
          .accessibilityAddTraits(shown ? .isSelected : [])
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.top, 16)
    .padding(.bottom, 20)
  }
}

/// A month's name that opens 月を選ぶ, with a small chevron after it saying
/// so (/design's MonthTitleButton); `label` draws the name. The calendar's
/// own heading goes without the chevron, as large as it is.
struct MonthTitleButton<Label: View>: View {
  @Environment(\.themeColors) private var colors
  let month: Day
  let first: Day
  let last: Day
  var chevron = true
  let onPick: (Day) -> Void
  @ViewBuilder let label: () -> Label
  @State private var choosing = false

  var body: some View {
    Button {
      choosing = true
    } label: {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        label()
        if chevron {
          Image(systemName: "chevron.down")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(colors.textTertiary)
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityHint("押すと月を選べます")
    .fittedSheet(isPresented: $choosing) {
      MonthChoiceSheet(month: month, first: first, last: last, onPick: onPick)
    }
  }
}

/// 今日 or 今月, back to today's day or month while it is out of sight
/// (/design's TodayButton), the calendar's own button.
struct TodayButton: View {
  /// 日 for a list of days, 月 for a month at a time.
  let unit: String
  let action: () -> Void

  var body: some View {
    Button("今\(unit)", action: action)
      .buttonStyle(BarButton())
      .accessibilityLabel("今\(unit)に戻る")
      .transition(.opacity)
  }
}

/// A day to pick, as a month of days (/design's InputDatePicker's sheet):
/// × to close, the title, and 今日.
struct DayChoiceSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let title: String
  let day: Day
  let onPick: (Day) -> Void

  var body: some View {
    VStack(spacing: 8) {
      ZStack {
        Text(title).font(.headline)
        HStack {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
            .labelStyle(.iconOnly)
            .buttonStyle(BarButton())
            .foregroundStyle(colors.textPrimary)
          Spacer()
          Button("今日") { pick(.today) }
            .buttonStyle(.plain)
            .font(.body.weight(.medium))
            .foregroundStyle(colors.accentDefault)
            .frame(minHeight: Metrics.touch)
        }
      }
      DatePicker(
        title,
        selection: Binding { day.date(in: .current) } set: { pick(Day($0, in: .current)) },
        displayedComponents: .date
      )
      .datePickerStyle(.graphical)
      .labelsHidden()
    }
    .padding(.horizontal, 20)
    .padding(.top, 16)
    .padding(.bottom, 12)
  }

  private func pick(_ picked: Day) {
    onPick(picked)
    dismiss()
  }
}
