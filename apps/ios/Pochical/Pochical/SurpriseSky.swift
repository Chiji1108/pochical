import PochicalDesign
import PochicalKit
import SwiftUI

/// おたのしみ, the other choice for the calendar's month name (/design's
/// useSurprise; spec/calendar.md, The month): a sky of pale light at the
/// top of the calendar, fading into the ground below it. It first comes
/// with a tap on the name, never before, and each tap drifts it to another
/// sky, kept until the next tap, so a sky someone likes can be
/// screenshotted. The first is the テーマ's own; the rest come at random,
/// the テーマ's among them. Only a tap changes it: a テーマ's sky stays after
/// the テーマ changes.
struct SurpriseSky: View {
  @Environment(Settings.self) private var settings
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let heading = settings.device.heading
    let theme = settings.device.theme
    let dark = theme.isAlwaysDark || colorScheme == .dark
    ZStack {
      if heading.surprise, let id = heading.sky,
        let lights = Skies.lights(id)?.colors(dark: dark, theme: theme.rawValue)
      {
        SkyLight(lights: lights)
          .id(id)
          .transition(.opacity)
      }
    }
    .animation(.easeOut(duration: Skies.changeSeconds), value: heading.sky)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  /// Another sky than the one up, at random: one anyone may get, or the
  /// テーマ's own; the テーマ's own the first time.
  static func next(after id: String?, theme: Theme) -> String {
    let own = Skies.own(theme.rawValue)
    guard let id else { return own }
    return (Skies.anyone + [own]).filter { $0 != id }.randomElement() ?? own
  }
}

/// One sky: light spreading from both top corners and the middle, over the
/// heading only and gone by the calendar's first weeks, breathing slowly
/// while it stays.
private struct SkyLight: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let lights: [Color]
  @State private var breathing = false

  var body: some View {
    GeometryReader { proxy in
      let size = proxy.size
      ZStack(alignment: .topLeading) {
        // From the top corners, wide; from the middle, a little lower.
        light(lights[0], radii: CGSize(width: 0.9, height: 0.8), at: UnitPoint(x: 0, y: 0),
          fade: 0.7, in: size)
        light(lights[2], radii: CGSize(width: 0.9, height: 0.8), at: UnitPoint(x: 1, y: 0),
          fade: 0.7, in: size)
        light(lights[1], radii: CGSize(width: 0.8, height: 0.7), at: UnitPoint(x: 0.5, y: 0.25),
          fade: 0.75, in: size)
      }
      .frame(width: size.width, height: size.height, alignment: .topLeading)
      // A little larger than its place, so breathing never shows an edge.
      .scaleEffect(breathing ? 1.08 : 1, anchor: .top)
      .offset(x: (breathing ? 0.02 : -0.02) * size.width)
    }
    .mask(
      LinearGradient(
        stops: [.init(color: .black, location: 0.3), .init(color: .clear, location: 1)],
        startPoint: .top, endPoint: .bottom))
    .onAppear {
      guard !reduceMotion else { return }
      withAnimation(
        .easeInOut(duration: Skies.breathSeconds).repeatForever(autoreverses: true)
      ) { breathing = true }
    }
  }

  /// A light as CSS's radial-gradient(w% h% at x y, color, transparent
  /// fade): an ellipse of the given radii, fractions of the box, about
  /// `center`, its color gone by `fade` of the way out.
  private func light(
    _ color: Color, radii: CGSize, at center: UnitPoint, fade: CGFloat, in size: CGSize
  ) -> some View {
    let width = 2 * radii.width * size.width
    let height = 2 * radii.height * size.height
    return EllipticalGradient(
      colors: [color, color.opacity(0)], center: .center, startRadiusFraction: 0,
      endRadiusFraction: fade / 2
    )
    .frame(width: width, height: height)
    .position(x: center.x * size.width, y: center.y * size.height)
  }
}
