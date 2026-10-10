import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// スタイル (/design's MarkPage): how shifts are marked and the テーマ, each
/// choice drawn on the person's own patterns, and this week in the look
/// over them, so there is nothing to confirm.
struct StyleSettings: View {
  @Environment(Settings.self) private var settings
  @Environment(\.colorScheme) private var colorScheme
  /// The light or dark the preview and the テーマ cards are seen in, from
  /// the preview's ☀︎ / ☾; the screen's until one is picked.
  @State private var picked: ColorScheme?
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]

  var body: some View {
    @Bindable var settings = settings
    let calendar = OwnCalendar(days: [], patterns: patterns, patternOrder: patternOrder, orders: [])
    let work = calendar.patterns.first { !$0.countsAsOff }
    let off = calendar.patterns.first(where: \.countsAsOff)
    let samples = styleSamples(of: calendar.patterns).compactMap { calendar.patternsByID[$0] }
    Form {
      Section {
        StylePreview(picked: $picked)
      }
      .settingsOnPage()
      Section {
        Choices(
          options: Shape.allCases, picked: Shape(settings.device.look),
          label: \.name, size: .regular
        ) { shape in
          if let work {
            ShiftMark(pattern: work, size: 20)
              .environment(\.look, shape.look(from: settings.device.look))
          }
        } onPick: { shape in
          settings.device.look = shape.look(from: settings.device.look)
        }
        .settingsOnPage()
      } header: {
        Text("シフトの見た目")
      } footer: {
        Text("グループの人にも、この見た目で表示されます。")
      }
      Section("テーマ") {
        ThemeChoices(samples: samples, scheme: picked ?? colorScheme)
          .settingsOnPage()
      }
      // Emoji keep their own colors, so シフトの色 would change nothing.
      if settings.device.look.style != .emoji {
        Section("シフトの色") {
          Choices(
            options: [true, false], picked: settings.device.look.colored,
            label: { $0 ? "色分け" : "ワントーン" }, size: .tall
          ) { colored in
            HStack(spacing: 4) {
              ForEach(samples, id: \.id) { pattern in
                ShiftMark(pattern: pattern, size: 18)
              }
            }
            .environment(\.look, lookWith { $0.colored = colored })
          } onPick: { colored in
            settings.device.look.colored = colored
          }
          .settingsOnPage()
        }
      }
      Section("休みの見せ方") {
        Choices(
          options: OffLook.allCases, picked: OffLook(settings.device.look.options),
          label: \.name, size: .tall
        ) { offLook in
          sample(off) { offLook.apply(to: &$0.options) }
        } onPick: { offLook in
          offLook.apply(to: &settings.device.look.options)
        }
        .settingsOnPage()
      }
      Section("シフト名") {
        Choices(
          options: [false, true], picked: settings.device.look.options.names,
          label: { $0 ? "あり" : "なし" }, size: .tall
        ) { names in
          sample(work) { $0.options.names = names }
        } onPick: { names in
          settings.device.look.options.names = names
        }
        .settingsOnPage()
      }
    }
    .settingsList()
    .navigationTitle("スタイル")
  }

  private func lookWith(_ change: (inout Look) -> Void) -> Look {
    var look = settings.device.look
    change(&look)
    return look
  }

  /// A day drawn small in the person's look as `change` leaves it: its
  /// date, and the pattern's mark on it, as the month would show it.
  @ViewBuilder private func sample(_ pattern: Pattern?, change: (inout Look) -> Void) -> some View {
    var look = settings.device.look
    let _ = change(&look)
    if let pattern {
      DayCell(
        day: Day(year: 2026, month: 10, day: 5), entry: DayEntry(shift: pattern.id), note: nil,
        pattern: pattern, outside: false, isToday: false, isHoliday: false,
        offShown: look.options.blankOff ? .hidden : .shown
      )
      .frame(width: 44)
      .environment(\.look, look)
    }
  }
}

/// The four shapes members see: icons filled (塗り) or outlined (線),
/// emoji, and letters on their tile.
private enum Shape: CaseIterable, Hashable {
  case filled, outlined, emoji, badge

  init(_ look: Look) {
    switch look.style {
    case .icon: self = look.fill ? .filled : .outlined
    case .emoji: self = .emoji
    case .badge: self = .badge
    }
  }

  var name: String {
    switch self {
    case .filled: "塗り"
    case .outlined: "線"
    case .emoji: "絵文字"
    case .badge: "文字"
    }
  }

  /// The look in this shape; only icons carry their fill, so the others
  /// leave it as it was.
  func look(from look: Look) -> Look {
    var look = look
    switch self {
    case .filled, .outlined:
      look.style = .icon
      look.fill = self == .filled
    case .emoji: look.style = .emoji
    case .badge: look.style = .badge
    }
    return look
  }
}

/// How days off show: on a tint of their color (強調), as a mark alone
/// (印だけ), or left blank (空白), faint again while entering and in a day's
/// week.
enum OffLook: CaseIterable, Hashable {
  case highlight, mark, blank

  init(_ options: MarkOptions) {
    if options.blankOff {
      self = .blank
    } else {
      self = options.highlight ? .highlight : .mark
    }
  }

  var name: String {
    switch self {
    case .highlight: "強調"
    case .mark: "印だけ"
    case .blank: "空白"
    }
  }

  func apply(to options: inout MarkOptions) {
    options.highlight = self == .highlight
    options.blankOff = self == .blank
  }
}

/// Choices side by side in one track, each drawing what it does over its
/// name, as /design's tall segments and iOS's segmented control: the
/// picked one raised on the card's ground, which slides to the next as it
/// is picked; track and raised ground both round-ended, as iOS 26's.
struct Choices<Option: Hashable, Sample: View>: View {
  /// How tall each choice stands (/design's segment sizes): compact for
  /// names alone, regular for a mark over its name, tall for a day.
  enum Size {
    case compact, regular, tall

    var minHeight: CGFloat {
      switch self {
      case .compact: Metrics.action
      case .regular: 62
      case .tall: 76
      }
    }
  }

  @Environment(\.themeColors) private var colors
  @Namespace private var raised
  let options: [Option]
  let picked: Option
  let label: (Option) -> String
  var size = Size.compact
  @ViewBuilder let sample: (Option) -> Sample
  let onPick: (Option) -> Void

  var body: some View {
    HStack(spacing: 4) {
      ForEach(options, id: \.self) { option in
        let isPicked = option == picked
        Button {
          withAnimation(Springs.standard) { onPick(option) }
        } label: {
          VStack(spacing: 4) {
            sample(option)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
            Text(label(option))
              .font(.subheadline.weight(isPicked ? .semibold : .regular))
              .foregroundStyle(isPicked ? colors.textPrimary : colors.textSecondary)
          }
          .padding(.vertical, 8)
          .frame(maxWidth: .infinity, minHeight: size.minHeight, maxHeight: .infinity)
          // Where the raised ground stands when this one is picked.
          .matchedGeometryEffect(id: option, in: raised, isSource: true)
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(option))
        .accessibilityAddTraits(isPicked ? .isSelected : [])
      }
    }
    .fixedSize(horizontal: false, vertical: true)
    // One raised ground under every choice, so as it slides it passes
    // under the ones between rather than over them.
    .background {
      Capsule()
        .fill(colors.backgroundCard)
        .shadow(Shadow.sm)
        .matchedGeometryEffect(id: picked, in: raised, isSource: false)
    }
    .padding(4)
    .background(colors.fillTertiary, in: Capsule())
  }
}

/// The テーマ, three to a page swiped sideways with dots under them, as
/// /design's (after Telegram's 外観): each card the テーマ's own screen in
/// the light or dark picked by ☀︎ / ☾, with the person's marks on its card and
/// its text and accent side by side.
private struct ThemeChoices: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  let samples: [Pattern]
  /// The light or dark each card shows its テーマ in.
  let scheme: ColorScheme
  @State private var page = 0

  private static let pages = stride(from: 0, to: Theme.allCases.count, by: 3).map {
    Array(Theme.allCases[$0..<min($0 + 3, Theme.allCases.count)])
  }

  var body: some View {
    VStack(spacing: 4) {
      TabView(selection: $page) {
        ForEach(Self.pages.indices, id: \.self) { index in
          HStack(alignment: .top, spacing: 8) {
            ForEach(Self.pages[index], id: \.self) { theme in
              card(theme)
            }
          }
          .frame(maxHeight: .infinity, alignment: .top)
          .tag(index)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      .frame(height: 100)
      PageDots(count: Self.pages.count, current: $page, label: "テーマのページ")
    }
    .onAppear {
      // Opens on the page of the テーマ in use.
      page = Self.pages.firstIndex { $0.contains(settings.device.theme) } ?? 0
    }
  }

  private func card(_ theme: Theme) -> some View {
    let isPicked = theme == settings.device.theme
    let own = theme.colors(theme.isAlwaysDark ? .dark : scheme)
    return ChoiceTile(name: theme.name, picked: isPicked, size: .small) {
      settings.device.theme = theme
    } picture: {
      VStack(spacing: 8) {
        HStack(spacing: 2) {
          ForEach(samples, id: \.id) { pattern in
            ShiftMark(pattern: pattern, size: 14)
          }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(own.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(own.separator))
        HStack(spacing: 4) {
          Capsule().fill(own.textPrimary).frame(width: 20, height: 4)
          Capsule().fill(own.accentFill).frame(width: 28, height: 4)
        }
      }
      .padding(8)
      .padding(.bottom, 4)
      .background(own.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.lg))
      .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(own.separator))
      .environment(\.themeColors, own)
    }
  }
}
