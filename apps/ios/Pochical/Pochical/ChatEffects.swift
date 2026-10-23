import PochicalDesign
import Pow
import SwiftUI
import UIKit

// What plays for a moment over a chat's lines, past the line it comes from
// (a reaction's pop and spray), as Telegram plays its reactions' effects:
// on one layer over the whole of the lines, never in a line's own cell,
// which cuts what it draws to its frame and lies under the lines after it.
// A line only says where the part an effect comes from is in its cell; the
// layer keeps a frame for each line on the screen where the lines lay it
// out, in the same pass and the same animation (the lines' own, the
// keyboard's, a scroll), so an effect on it goes where the line goes,
// growing to make room for a reaction included.

/// A part of an item of the lines an effect plays on: a reaction's pill.
struct EffectPart: Hashable {
  /// The item, by its ChatItemID.
  let item: String
  /// The part, among the item's.
  let name: String
}

/// What plays on a part.
enum ChatEffect {
  /// It came in: Pow's pop round it, in the accent.
  case pop
  /// The reader chose it: `emoji` sprays up from it.
  case spray(String)
}

/// Where the lines' parts ask for their effects, for the chat's layer to
/// play them.
@MainActor final class ChatEffects {
  fileprivate weak var layer: ChatEffectsLayer?

  /// Plays `effect` on `part`, at `frame` in its item's cell.
  func play(_ effect: ChatEffect, on part: EffectPart, at frame: CGRect) {
    layer?.play(effect, on: part, at: frame)
  }

  /// `part` is at `frame` in its item's cell now.
  func move(_ part: EffectPart, to frame: CGRect) {
    layer?.move(part, to: frame)
  }

  /// `part` has gone, and what plays on it with it.
  func end(_ part: EffectPart) {
    layer?.end(part)
  }
}

extension EnvironmentValues {
  /// The chat's effects, for a line's parts to ask for theirs; none
  /// outside the chat's lines, or where a line is only measured.
  @Entry var chatEffects: ChatEffects?
}

/// The layer over the lines the effects play on: never touched, and
/// nothing VoiceOver reads, as the lines under it are.
final class ChatEffectsLayer: UIView {
  let effects = ChatEffects()
  /// The chat's environment, which the effects are drawn in.
  var environment = EnvironmentValues()
  /// A frame for each item on the screen, as the lines lay it out.
  private var items: [String: UIView] = [:]
  /// What plays, by the part it plays on.
  private var playing: [EffectPart: Played] = [:]

  /// An effect's SwiftUI, held at its part's frame in its item's.
  private struct Played {
    let burst: Burst
    let host: UIHostingController<AnyView>
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    effects.layer = self
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  /// Lays the items' frames out as `lines` has them now, `frames` giving
  /// each item's in the lines' content, in whatever animation the lines are
  /// in: the layer is the lines' content as they scroll, and each item's
  /// frame moves with its cell. Items gone from the screen go, with what
  /// plays on them.
  func follow(_ lines: UIScrollView, items shown: [String: CGRect]) {
    frame = lines.frame
    bounds.origin = lines.bounds.origin
    for (id, view) in items where shown[id] == nil {
      view.removeFromSuperview()
      items[id] = nil
      playing = playing.filter { $0.key.item != id }
    }
    for (id, frame) in shown {
      if let view = items[id] {
        view.frame = frame
      } else {
        let view = UIView(frame: frame)
        addSubview(view)
        items[id] = view
      }
    }
  }

  fileprivate func play(_ effect: ChatEffect, on part: EffectPart, at frame: CGRect) {
    guard let item = items[part.item] else { return }
    let played = playing[part] ?? begin(part, in: item)
    played.host.view.frame = frame
    switch effect {
    case .pop: played.burst.pops += 1
    case .spray(let emoji):
      played.burst.emoji = emoji
      played.burst.sprays += 1
    }
  }

  private func begin(_ part: EffectPart, in item: UIView) -> Played {
    let burst = Burst()
    let host = UIHostingController(
      rootView: AnyView(BurstView(burst: burst).environment(\.self, environment)))
    host.sizingOptions = []
    host.safeAreaRegions = []
    host.view.backgroundColor = .clear
    UIView.performWithoutAnimation { item.addSubview(host.view) }
    let played = Played(burst: burst, host: host)
    playing[part] = played
    return played
  }

  fileprivate func move(_ part: EffectPart, to frame: CGRect) {
    playing[part]?.host.view.frame = frame
  }

  fileprivate func end(_ part: EffectPart) {
    playing.removeValue(forKey: part)?.host.view.removeFromSuperview()
  }
}

/// How many times a part has popped and sprayed, and what it sprays.
@MainActor @Observable private final class Burst {
  var pops = 0
  var sprays = 0
  var emoji = ""
}

/// A part's pop and spray, at its frame: Pow's, drawn round where the part
/// is rather than on it. The part itself comes in by the pop's own scale
/// where it is (ReactionRow.transition).
private struct BurstView: View {
  @Environment(\.themeColors) private var colors
  let burst: Burst
  /// What is shown of the burst: caught up with it once drawn, as a pop
  /// and a spray play on a change after the view is there.
  @State private var popped = 0
  @State private var sprayed = 0

  private static let sprays = "chat-effect-sprays"

  var body: some View {
    ZStack {
      if popped > 0 {
        Color.clear.transition(.movingParts.pop(colors.accentDefault))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // Fading in as they leave the part, as in a particle layer of their
    // own (Pow's).
    .changeEffect(.spray(layer: .named(Self.sprays)) { Text(burst.emoji) }, value: sprayed)
    .particleLayer(name: Self.sprays)
    .onAppear(perform: catchUp)
    .onChange(of: burst.pops) { catchUp() }
    .onChange(of: burst.sprays) { catchUp() }
  }

  private func catchUp() {
    withAnimation { popped = burst.pops }
    sprayed = burst.sprays
  }
}
