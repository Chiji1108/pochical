import SwiftUI

/// An emoji sprayed up from a view each time `count` goes up, in the paths
/// Pow's spray draws. Pow's plays a Core Haptics pattern of its own with
/// every spray and has no way to leave it out, while a reaction is felt
/// once, by the system's feedback, at the tap that chose it (ChatScreen,
/// spec/haptics.md); so the spray is drawn here, without one.
struct EmojiSpray: ViewModifier {
  let emoji: String
  let count: Int
  @State private var sprays: [Spray] = []

  /// One spray: when it began, and each particle's own rise and shade.
  private struct Spray {
    let start: Date
    let rises: [Double]
    let shades: [Double]
  }

  private static let particles = 11
  /// Pow's spring, critically damped, carrying each spray from 0 to 1.
  private static let spring = Spring(mass: 1, stiffness: 30, damping: 2 * 30.0.squareRoot())
  /// How long a spray lasts: until it is as near its end as Pow's ends.
  private static let duration = spring.settlingDuration(target: 1.0, epsilon: 0.04)
  /// Room round the view the particles fly in, most of it above.
  private static let room = EdgeInsets(top: 320, leading: 160, bottom: 40, trailing: 160)

  func body(content: Content) -> some View {
    content
      .overlay {
        TimelineView(.animation(paused: sprays.isEmpty)) { timeline in
          Canvas { context, size in
            draw(in: &context, size: size, at: timeline.date)
          } symbols: {
            Text(emoji).tag(0)
          }
          .padding(
            EdgeInsets(
              top: -Self.room.top, leading: -Self.room.leading, bottom: -Self.room.bottom,
              trailing: -Self.room.trailing)
          )
          .allowsHitTesting(false)
          .onChange(of: timeline.date) { _, now in
            let over = { (spray: Spray) in now.timeIntervalSince(spray.start) > Self.duration }
            if sprays.contains(where: over) { sprays.removeAll(where: over) }
          }
        }
      }
      .onChange(of: count) {
        let spread = (0..<Self.particles).map { Double($0 % 5) / 5 }
        sprays.append(
          Spray(
            start: .now, rises: spread.map { $0 + .random(in: 0...1) },
            shades: spread.map { _ in .random(in: -0.1...0.1) }))
      }
  }

  private func draw(in context: inout GraphicsContext, size: CGSize, at now: Date) {
    guard let symbol = context.resolveSymbol(id: 0) else { return }
    let width = min(symbol.size.width, size.width / 6)
    let height = min(symbol.size.height, size.height / 8)
    context.translateBy(
      x: size.width / 2,
      y: Self.room.top + (size.height - Self.room.top - Self.room.bottom) / 2)
    for spray in sprays {
      let progress = Self.spring.value(target: 1.0, time: now.timeIntervalSince(spray.start))
      let lift = cos(progress) * progress * -height * 2.5
      for index in 0..<Self.particles {
        let place = Double(index) / 10
        let angle = place * 45 - 22.5
        let rise = spray.rises[index]
        let scale =
          abs(sin((progress * 0.75 + rise) * .pi)) * (1 - pow(progress, 8)) * pow(progress, 0.25)
        let point = CGPoint(
          x: (place - 0.5) * sin(progress * .pi) * width * -2,
          y: lift - rise * progress * height * 2.5)
        context.opacity = min(max(progress * 4, 0), 1)
        context.drawLayer { layer in
          layer.addFilter(.brightness(spray.shades[index]))
          layer.rotate(by: .degrees(-progress * angle - angle * 0.25))
          layer.translateBy(x: point.x, y: point.y)
          layer.scaleBy(x: scale, y: scale)
          layer.rotate(by: .degrees((progress * 2).squareRoot() * angle - angle * 0.25))
          layer.draw(symbol, at: .zero)
        }
      }
    }
  }
}

extension View {
  /// Sprays `emoji` up from the view each time `count` goes up (EmojiSpray).
  func emojiSpray(_ emoji: String, count: Int) -> some View {
    modifier(EmojiSpray(emoji: emoji, count: count))
  }
}
