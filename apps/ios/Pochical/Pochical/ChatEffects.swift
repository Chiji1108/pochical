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

/// Where an item of the lines is: its frame in the lines' content, and
/// its cell's own transform (dragged aside to reply).
struct ItemPlace {
  let frame: CGRect
  let transform: CGAffineTransform
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
  var environment = EnvironmentValues() {
    didSet {
      for ground in [onLines] + menus.map(\.ground) {
        for played in ground.playing.values {
          played.host.rootView = Self.content(played.burst, environment)
        }
      }
    }
  }
  /// What plays over the lines, on this layer.
  private lazy var onLines = Ground(view: self)
  /// What plays on the line each menu lifts, on the menu's own ground
  /// (MenuLayer.effects), the open menu's last. An effect is drawn where
  /// its part shows: over the menu's dimming and the lifted bubble, which
  /// stands in for its line, and under its bar and its menu, which stand
  /// in front of it. A menu closed stays, taking nothing, until what plays
  /// on it has played out there, its SwiftUI never moved (a hosting view
  /// moved starts afresh).
  private var menus: [Menu] = []

  /// A view effects play on.
  private struct Ground {
    let view: UIView
    /// A frame for each item on the screen, as the lines lay it out.
    var items: [String: UIView] = [:]
    /// What plays, by the part it plays on.
    var playing: [EffectPart: Played] = [:]

    /// Takes away the items not in `shown`, with what plays on them.
    mutating func keep(_ shown: [String: ItemPlace]) {
      for (id, view) in items where shown[id] == nil {
        view.removeFromSuperview()
        items[id] = nil
        for part in playing.keys where part.item == id { end(part) }
      }
    }

    /// Takes `part`'s effect away, played out or not.
    mutating func end(_ part: EffectPart) {
      playing.removeValue(forKey: part)?.remove()
    }
  }

  /// A menu's ground, for the item whose bubble it lifts. Its items'
  /// frames are its own, made as effects begin there.
  private struct Menu {
    var ground: Ground
    let item: String
    /// Takes the menu away.
    let remove: () -> Void
    var closed = false

    /// Takes `part`'s effect away, and its item's frame with nothing left
    /// on it.
    mutating func end(_ part: EffectPart) {
      ground.end(part)
      if let view = ground.items[part.item], view.subviews.isEmpty {
        view.removeFromSuperview()
        ground.items[part.item] = nil
      }
    }
  }

  /// An effect's SwiftUI, held at its part's frame in its item's until it
  /// has played out.
  private struct Played {
    let burst: Burst
    let host: UIHostingController<AnyView>

    /// Takes it off the screen, where it tells of its end no more.
    func remove() {
      burst.onPlayedOut = {}
      host.view.removeFromSuperview()
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    effects.layer = self
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window == nil else { return }
    for index in menus.indices { menus[index].ground.keep([:]) }
    removePlayedOut()
  }

  /// Lays the items' frames out as `lines` has them now, `shown` giving
  /// each item's place in the lines' content, in whatever animation the
  /// lines are in: the layer is the lines' content as they scroll, and
  /// each item's frame moves with its cell, dragged aside to reply
  /// included. Items gone from the screen go, with what plays on them.
  func follow(_ lines: UIScrollView, items shown: [String: ItemPlace]) {
    frame = lines.frame
    bounds.origin = lines.bounds.origin
    onLines.keep(shown)
    for index in menus.indices { menus[index].ground.keep(shown) }
    for (id, place) in shown {
      if let view = onLines.items[id] {
        put(view, at: place)
      } else {
        // New to the screen: where it is, not moved there.
        let view = UIView()
        UIView.performWithoutAnimation {
          addSubview(view)
          put(view, at: place)
        }
        onLines.items[id] = view
      }
      for menu in menus {
        if let view = menu.ground.items[id] { put(view, at: place) }
      }
    }
    removePlayedOut()
  }

  /// A menu has opened, lifting the bubble of the item `item`: what comes
  /// to the item from now on plays on `ground`, the menu's, and `remove`
  /// takes the menu away once it has closed and what plays there has
  /// played out.
  func menuOpened(ground: UIView, lifting item: String, remove: @escaping () -> Void) {
    menus.append(Menu(ground: Ground(view: ground), item: item, remove: remove))
  }

  /// The open menu has closed: what comes to its item plays on the lines
  /// again.
  func menuClosed() {
    guard let index = menus.lastIndex(where: { !$0.closed }) else { return }
    menus[index].closed = true
    removePlayedOut()
  }

  /// The open menu's place in `menus`, when it lifts `item`.
  private func menu(lifting item: String) -> Int? {
    guard let index = menus.lastIndex(where: { !$0.closed }), menus[index].item == item
    else { return nil }
    return index
  }

  private func put(_ view: UIView, at place: ItemPlace) {
    view.bounds = CGRect(origin: .zero, size: place.frame.size)
    view.center = convert(CGPoint(x: place.frame.midX, y: place.frame.midY), to: view.superview)
    view.transform = place.transform
  }

  fileprivate func play(_ effect: ChatEffect, on part: EffectPart, at frame: CGRect) {
    guard let played = played(on: part, at: frame) else { return }
    played.host.view.frame = frame
    switch effect {
    case .pop: played.burst.pops += 1
    case .spray(let emoji):
      played.burst.emoji = emoji
      played.burst.sprays += 1
    }
  }

  /// What plays on `part`, on the open menu lifting its item or else on
  /// the lines, started at `frame` when nothing plays there yet; none
  /// while its item is off the screen.
  private func played(on part: EffectPart, at frame: CGRect) -> Played? {
    if let index = menu(lifting: part.item) {
      if let played = menus[index].ground.playing[part] { return played }
      let ground = menus[index].ground.view
      guard let item = menus[index].ground.items[part.item] ?? itemFrame(part.item, on: ground)
      else { return nil }
      let played = begin(part, in: item, at: frame)
      menus[index].ground.items[part.item] = item
      menus[index].ground.playing[part] = played
      return played
    }
    if let played = onLines.playing[part] { return played }
    guard let item = onLines.items[part.item] else { return nil }
    let played = begin(part, in: item, at: frame)
    onLines.playing[part] = played
    return played
  }

  /// The SwiftUI of an effect on `part` in `item`, put at `frame` at once,
  /// whatever animation it is asked in, and gone when it has played out.
  private func begin(_ part: EffectPart, in item: UIView, at frame: CGRect) -> Played {
    let burst = Burst()
    burst.onPlayedOut = { [weak self, weak burst] in
      if let self, let burst { playedOut(burst, on: part) }
    }
    let host = UIHostingController(rootView: Self.content(burst, environment))
    host.sizingOptions = []
    host.safeAreaRegions = []
    host.view.backgroundColor = .clear
    UIView.performWithoutAnimation {
      host.view.frame = frame
      item.addSubview(host.view)
    }
    return Played(burst: burst, host: host)
  }

  /// A frame for the item on a menu's `ground`, where its frame on the
  /// lines is.
  private func itemFrame(_ item: String, on ground: UIView) -> UIView? {
    guard let lines = onLines.items[item] else { return nil }
    let view = UIView()
    UIView.performWithoutAnimation {
      ground.addSubview(view)
      view.bounds = lines.bounds
      view.center = convert(lines.center, to: ground)
      view.transform = lines.transform
    }
    return view
  }

  /// `burst` has played out: it goes from where it played, and a closed
  /// menu it was the last on with it.
  private func playedOut(_ burst: Burst, on part: EffectPart) {
    if onLines.playing[part]?.burst === burst { onLines.end(part) }
    for index in menus.indices where menus[index].ground.playing[part]?.burst === burst {
      menus[index].end(part)
    }
    removePlayedOut()
  }

  /// Takes away the closed menus nothing plays on any more.
  private func removePlayedOut() {
    menus.removeAll { menu in
      guard menu.closed, menu.ground.items.isEmpty else { return false }
      menu.remove()
      return true
    }
  }

  private static func content(_ burst: Burst, _ environment: EnvironmentValues) -> AnyView {
    AnyView(BurstView(burst: burst).environment(\.self, environment))
  }

  fileprivate func move(_ part: EffectPart, to frame: CGRect) {
    onLines.playing[part]?.host.view.frame = frame
    for menu in menus { menu.ground.playing[part]?.host.view.frame = frame }
  }

  fileprivate func end(_ part: EffectPart) {
    onLines.end(part)
    for index in menus.indices { menus[index].end(part) }
    removePlayedOut()
  }
}

/// How many times a part has popped and sprayed, and what it sprays.
@MainActor @Observable private final class Burst {
  var pops = 0
  var sprays = 0
  var emoji = ""
  /// Every pop and spray asked for has played to its end.
  @ObservationIgnored var onPlayedOut: () -> Void = {}
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
  /// What of the burst has played to its end: the pops whose animation
  /// has finished, and the sprays whose particles have all gone.
  @State private var poppedOut = 0
  @State private var sprayedOut = 0

  private static let sprays = "chat-effect-sprays"

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
