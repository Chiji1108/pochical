import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// 月を選ぶ: the system's year and month wheels, turning the pages as they
/// stop, the list's ends kept to (`first`, `last`).
private struct MonthWheels: UIViewRepresentable {
  let month: Day
  let first: Day
  let last: Day
  let onPick: (Day) -> Void

  func makeUIView(context: Context) -> UIDatePicker {
    let picker = UIDatePicker()
    picker.datePickerMode = .yearAndMonth
    picker.preferredDatePickerStyle = .wheels
    picker.addTarget(context.coordinator, action: #selector(Coordinator.changed), for: .valueChanged)
    return picker
  }

  func updateUIView(_ picker: UIDatePicker, context: Context) {
    context.coordinator.onPick = onPick
    // The wheels name months as the headings do: Sep in English.
    picker.locale = Locale(identifier: context.environment.english ? "en_US" : "ja_JP")
    picker.minimumDate = first.firstOfMonth.date(in: .current)
    picker.maximumDate = last.firstOfMonth.date(in: .current)
    let shown = month.firstOfMonth.date(in: .current)
    if Day(picker.date, in: .current).firstOfMonth != month.firstOfMonth {
      picker.setDate(shown, animated: false)
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(onPick: onPick)
  }

  final class Coordinator: NSObject {
    var onPick: (Day) -> Void

    init(onPick: @escaping (Day) -> Void) {
      self.onPick = onPick
    }

    @objc func changed(_ picker: UIDatePicker) {
      onPick(Day(picker.date, in: .current).firstOfMonth)
    }
  }
}

/// A month's name that opens 月を選ぶ, with a small chevron after it saying
/// so (/design's MonthTitleButton); `label` draws the name. The calendar's
/// own heading goes without the chevron, as large as it is. 月を選ぶ is a
/// popover of the system's year and month wheels under the name, so the
/// month stays in sight as it turns; a tap outside closes it.
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
    .popover(isPresented: $choosing) {
      MonthWheels(month: month, first: first, last: last, onPick: onPick)
        .frame(width: 300, height: 216)
        .presentationCompactAdaptation(.popover)
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
