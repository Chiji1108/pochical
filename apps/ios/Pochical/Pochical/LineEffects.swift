import PochicalDesign
import Pow
import SwiftUI

// What plays for a moment past the line it comes from (a reaction's pop
// and spray), in the line's own cell: the cell, cut to its frame at rest
// (LineCell), draws whole while any plays, over the lines next to it, and
// under a line's menu, which stands over the lines.

/// What plays past a line's cell, which the cell draws whole meanwhile.
@MainActor final class LineEffects {
  /// What plays, by the part it plays on.
  private var playing: Set<UUID> = []
  /// Something has begun to play, or nothing plays any more.
  var onChange: (Bool) -> Void = { _ in }

  /// `part` begins to play.
  func begin(_ part: UUID) {
    if playing.insert(part).inserted, playing.count == 1 { onChange(true) }
  }

  /// `part` has played out, or gone.
  func end(_ part: UUID) {
    if playing.remove(part) != nil, playing.isEmpty { onChange(false) }
  }

  /// The cell is given another item: nothing of the last plays there.
  func clear() {
    guard !playing.isEmpty else { return }
    playing = []
    onChange(false)
  }
}

extension EnvironmentValues {
  /// The cell's effects, for a line's parts to tell it of theirs; none
  /// where a line is only measured, which plays none.
  @Entry var lineEffects: LineEffects?
}

/// How many times a part has popped and sprayed, and what it sprays.
@MainActor @Observable final class Burst {
  var pops = 0
  var sprays = 0
  var emoji = ""
  /// Every pop and spray asked for has played to its end.
  @ObservationIgnored var onPlayedOut: () -> Void = {}

  /// It came in: Pow's pop round it, in the accent.
  func pop() { pops += 1 }

  /// The reader chose it: `emoji` sprays up from it.
  func spray(_ emoji: String) {
    self.emoji = emoji
    sprays += 1
  }
}

/// A part's pop and spray, over it: Pow's. The part itself comes in by the
/// pop's own scale (ReactionRow.transition).
struct BurstView: View {
  @Environment(\.themeColors) private var colors
  let burst: Burst
  /// What is shown of the burst: caught up with it once drawn, as a pop
  /// and a spray play on a change after the view is there.
  @State private var popped = 0
  @State private var sprayed = 0
  /// What of the burst has played to its end: the pops whose animation
  /// has finished, and the sprays whose particles have all gone.
  @State private var poppedOut = 0
  @State private var sprayedOut = 0

  /// The layer the sprays' particles are drawn on: its own, since drawn on
  /// one round the whole line they are cut at the line's top.
  private static let sprays = "line-effect-sprays"

  var body: some View {
    ZStack {
      // Each pop its own view, coming in anew.
      if popped > 0 {
        Color.clear.id(popped).transition(.movingParts.pop(colors.accentDefault))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // Fading in as they leave the part, as in a particle layer of their
    // own (Pow's). The particles are drawn only while some fly, and go as
    // the last lands.
    .changeEffect(
      .spray(layer: .named(Self.sprays)) {
        Text(burst.emoji).onDisappear {
          sprayedOut = sprayed
          endIfPlayedOut()
        }
      }, value: sprayed)
    .particleLayer(name: Self.sprays)
    .onAppear(perform: catchUp)
    .onChange(of: burst.pops) { catchUp() }
    .onChange(of: burst.sprays) { catchUp() }
  }

  private func catchUp() {
    if popped != burst.pops {
      let pops = burst.pops
      withAnimation {
        popped = pops
      } completion: {
        poppedOut = pops
        endIfPlayedOut()
      }
    }
    sprayed = burst.sprays
  }

  private func endIfPlayedOut() {
    if poppedOut == burst.pops, sprayedOut == burst.sprays { burst.onPlayedOut() }
  }
}
