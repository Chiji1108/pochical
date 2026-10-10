import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// はじめの設定 (/design's DesignOnboarding; spec/shift-patterns.md, The
// first run): a welcome with a way back in for people who already have an
// account, then the questions 新しい仕事にする asks, as large cards, ending
// with the kind of work's patterns and its order.

/// Whether the device holds any pattern, read again as that changes.
private struct HasPatternsRequest: FetchKeyRequest, Hashable {
  func fetch(_ db: Database) throws -> Bool {
    try PatternRow.fetchCount(db) > 0
  }
}

/// Whether はじめの設定 is done on this device, or to be asked again:
/// after signing out or deleting the account, the device holds nothing and
/// starts as a new one does.
enum FirstRun {
  static let doneKey = "firstRunDone"

  static func again() {
    UserDefaults.standard.set(false, forKey: doneKey)
  }
}

/// はじめの設定 while it is not done and the device holds no pattern, else
/// the app's tabs. Patterns arriving, from the questions or from an
/// account signed in to, end it. An invitation opened meanwhile waits for
/// the tabs, and is asked about there as any other time.
struct AppRoot: View {
  @AppStorage(FirstRun.doneKey) private var done = false
  @Fetch private var hasPatterns: Bool
  @State private var invite: OpenedInvite?

  init() {
    // Read at once, so the tabs and the welcome do not swap as it loads.
    @Dependency(\.defaultDatabase) var database
    let has = (try? database.read { try HasPatternsRequest().fetch($0) }) ?? false
    _hasPatterns = Fetch(wrappedValue: has, HasPatternsRequest(), animation: .default)
  }

  var body: some View {
    Group {
      if done || hasPatterns {
        RootView(invite: $invite)
      } else {
        Onboarding()
      }
    }
    .onChange(of: hasPatterns, initial: true) { _, has in
      if has { done = true }
    }
    .onOpenURL { url in
      if let code = openedInviteCode(of: url) {
        invite = OpenedInvite(code: code)
      } else if let day = openedDay(of: url) {
        OpenedDay.shared.day = day
      }
    }
  }
}

/// Where はじめの設定 is, past its welcome.
private enum OnboardingStep: Hashable {
  case login, kind, roster, rotation
  case order(JobTemplate)
}

/// はじめの設定: each step pushed as a page, the system's back going a
/// question back.
struct Onboarding: View {
  @Environment(\.themeColors) private var colors
  @State private var path: [OnboardingStep] = []

  var body: some View {
    NavigationStack(path: $path) {
      WelcomeStep {
        path.append(.kind)
      } onLogin: {
        path.append(.login)
      }
      .toolbarVisibility(.hidden, for: .navigationBar)
      .navigationDestination(for: OnboardingStep.self) { step in
        switch step {
        case .login:
          LoginStep {
            // An account with nothing in it yet: on with the questions.
            path = [.kind]
          }
        case .kind:
          KindStep { path.append($0) }
        case .roster:
          TemplateStep(title: "近い働き方を選んでください", templates: ReadyPatterns.rosterTemplates) {
            choose($0)
          }
        case .rotation:
          TemplateStep(title: "どんな順番で回りますか？", templates: ReadyPatterns.rotationTemplates) {
            choose($0)
          }
        case .order(let template):
          OrderStep(template: template)
        }
      }
    }
    .tint(colors.accentDefault)
  }

  /// A kind of work picked: a roster's patterns, or a weekly order, end
  /// the questions; others go on to their order's first day.
  private func choose(_ template: JobTemplate) {
    if let sequence = template.sequence, template.weekly {
      // A week starts on Sunday: its order lines up with the weekdays.
      let month = Day.today.firstOfMonth
      begin(template, sequence: sequence, anchor: month.adding(days: -month.weekday))
    } else if template.custom || template.sequence != nil {
      path.append(.order(template))
    } else {
      begin(template, sequence: [], anchor: .today)
    }
  }
}

/// The kind of work's patterns become the person's, and its order repeats.
@MainActor private func begin(_ template: JobTemplate, sequence: [PatternID], anchor: Day) {
  @Dependency(\.defaultDatabase) var database
  let ids = Set(template.patternIDs)
  let incoming = template.patternIDs.compactMap(ReadyPatterns.pattern).map {
    Pattern($0, keeping: ids)
  }
  let now = Int64(Date.now.timeIntervalSince1970 * 1000)
  try? database.write {
    try OwnValues.begin(
      with: incoming, sequence: sequence, anchor: anchor, today: .today,
      holidayCountry: HolidayCountry.current, now: now, in: $0)
  }
}

// MARK: Steps

/// The app icon's poodle, just the drawing, over the name it gives and
/// what the app is for; はじめる at the foot, in reach of the thumb.
private struct WelcomeStep: View {
  @Environment(\.themeColors) private var colors
  let onStart: () -> Void
  let onLogin: () -> Void

  var body: some View {
    VStack(spacing: 4) {
      VStack(spacing: 12) {
        Image("WelcomePoodle")
          .resizable()
          .frame(width: 200, height: 200)
          .padding(.top, -24)
          .padding(.bottom, -20)
          .accessibilityHidden(true)
        Text("ポチカル")
          .font(.title.bold())
          .foregroundStyle(colors.textPrimary)
          .padding(.top, 8)
        // Each phrase stays whole, so the line breaks after the comma.
        Text("シフトをポチッと入れて、\n家族や友達と見せ合えるカレンダーです。")
          .font(.body)
          .lineSpacing(6)
          .foregroundStyle(colors.textTertiary)
      }
      .multilineTextAlignment(.center)
      .frame(maxHeight: .infinity)
      .padding(.horizontal, 12)

      Button(action: onStart) {
        Text("はじめる")
          .font(.headline)
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
      Button(action: onLogin) {
        Text("アカウントをお持ちの方はログイン")
          .font(.subheadline)
          .frame(maxWidth: .infinity, minHeight: Metrics.touch)
      }
      .foregroundStyle(colors.accentDefault)
    }
    .padding(.horizontal, 20)
    .padding(.bottom, 12)
    .background(colors.backgroundBase)
  }
}

/// For someone moving to a new phone: signing in brings their data back
/// instead of answering the questions again.
private struct LoginStep: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.userSocket) private var userSocket
  @Dependency(\.defaultDatabase) private var database
  /// Told when the account signed in to holds nothing yet.
  let onEmpty: () -> Void

  var body: some View {
    StepPage(
      title: "アカウントでログイン",
      description: "前の端末で使っていたシフトとグループを、そのまま戻します。",
      footnote: "はじめて使うときは、戻って「はじめる」から始めてください。"
    ) {
      AppleSignInButton { _, how in
        // The account's data comes in, and its patterns end the first
        // run; one that brought none goes on with the questions.
        if how == .switched {
          await userSocket?.catchUp(within: .seconds(10))
        }
        let has = (try? await database.read { try HasPatternsRequest().fetch($0) }) ?? false
        if !has { onEmpty() }
      }
    }
  }
}

/// The one question that tells ways of working apart: whether shifts
/// repeat, yes first, as the answer that sets up more (spec/shift-patterns.md,
/// Repeating orders).
private struct KindStep: View {
  let onPick: (OnboardingStep) -> Void

  var body: some View {
    StepPage(
      title: "シフトに繰り返しはありますか？",
      description: "繰り返しがあっても、違う日だけあとから変えられます。",
      footnote: "あとから設定で変えられます"
    ) {
      OptionCard(icon: "🔁", title: "繰り返しがある", note: "当番・非番、工場の交代勤務、曜日で固定など") {
        onPick(.rotation)
      }
      OptionCard(icon: "📋", title: "繰り返しはない", note: "勤務表やシフト表で、その都度決まる") {
        onPick(.roster)
      }
    }
  }
}

private struct TemplateStep: View {
  let title: String
  let templates: [JobTemplate]
  let onChoose: (JobTemplate) -> Void

  var body: some View {
    StepPage(title: title, description: "あとから名前や時間を変えられます。") {
      ForEach(templates) { template in
        OptionCard(title: template.title, note: template.note) {
          onChoose(template)
        } more: {
          // An order's days, or the keys a roster's work gives.
          if let sequence = template.sequence, !template.custom {
            SequenceTiles(sequence: sequence, patterns: readyByID, weekly: template.weekly)
              .padding(.top, 4)
          } else if !template.custom {
            KeysPreview(patternIDs: template.patternIDs, patterns: readyByID)
              .padding(.top, 4)
          }
        }
      }
    }
  }
}

/// The order on the calendar, filling the screen: a kind of work's own,
/// from this month's 1st, or one typed from nothing; either typed over,
/// and the day pressed moves where it starts. A first run's covers every
/// day, and 完了 asks nothing, as no day is there yet.
private struct OrderStep: View {
  @Environment(\.themeColors) private var colors
  let template: JobTemplate
  @State private var sequence: [PatternID]
  @State private var anchor = Day.today.firstOfMonth

  init(template: JobTemplate) {
    self.template = template
    _sequence = State(initialValue: template.sequence ?? [])
  }

  var body: some View {
    let first = template.sequence?.first.flatMap { readyByID[$0]?.name }
    RepeatCalendar(
      sequence: $sequence, anchor: $anchor, cover: .always,
      patterns: template.patternIDs.compactMap { readyByID[$0] },
      holidayCountry: HolidayCountry.current
    )
    .background(colors.backgroundBase)
    .navigationTitle(template.custom || first == nil ? "並びを入れる" : "「\(first ?? "")」の日を押す")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("完了", systemImage: "checkmark", role: .confirm) {
          begin(template, sequence: sequence, anchor: anchor)
        }
        .disabled(sequence.isEmpty)
      }
    }
  }
}

// MARK: Pieces

/// A step: a heading with what it asks, its answers, and a note at the
/// foot.
private struct StepPage<Content: View>: View {
  @Environment(\.themeColors) private var colors
  let title: String
  let description: String
  var footnote: String?
  @ViewBuilder let content: Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
          Text(title)
            .font(.title2.weight(.semibold))
            .foregroundStyle(colors.textPrimary)
          Text(description)
            .font(.subheadline)
            .foregroundStyle(colors.textTertiary)
        }
        VStack(spacing: 12) {
          content
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 8)
      .padding(.bottom, 20)
    }
    .safeAreaInset(edge: .bottom) {
      if let footnote {
        Text(footnote)
          .font(.caption)
          .foregroundStyle(colors.textQuaternary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .padding(.horizontal, 20)
          .padding(.bottom, 12)
      }
    }
    .background(colors.backgroundBase)
    .navigationBarTitleDisplayMode(.inline)
  }
}

/// An answer as a large card (/design's OptionCard): its mark, what it
/// is with a note under it, more under that, and an arrow.
private struct OptionCard<More: View>: View {
  @Environment(\.themeColors) private var colors
  var icon: String?
  let title: String
  let note: String
  let action: () -> Void
  @ViewBuilder var more: More

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        if let icon {
          Text(icon).font(.system(size: 28)).accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 4) {
          Text(title).font(.headline).foregroundStyle(colors.textPrimary)
          Text(note).font(.caption).foregroundStyle(colors.textTertiary)
          more
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: "chevron.right")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(colors.textQuaternary)
      }
      .padding(16)
      .frame(minHeight: 72)
      .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xxl))
      .overlay(RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.borderDefault))
      .contentShape(.rect(cornerRadius: Radius.xxl))
    }
    .buttonStyle(.plain)
  }
}

extension OptionCard where More == EmptyView {
  init(icon: String? = nil, title: String, note: String, action: @escaping () -> Void) {
    self.init(icon: icon, title: title, note: note, action: action) { EmptyView() }
  }
}
