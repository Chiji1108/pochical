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
      for played in Array(onLines.playing.values) + overMenu.playing.values {
        played.host.rootView = Self.content(played.burst, environment)
      }
    }
  }
  /// What plays over the lines, on this layer.
  private lazy var onLines = Ground(view: self)
  /// What plays on the line whose bubble a menu lifts, over the menu in
  /// the window, its dimming and the bubble included, as the lifted bubble
  /// stands in for its line. Each plays out there, its SwiftUI never moved
  /// (a hosting view moved starts afresh); the view goes once nothing
  /// is there and the menu has gone.
  private var overMenu = Ground(view: UIView())
  /// The item whose bubble a menu lifts.
  private var lifted: String?

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
        playing = playing.filter { $0.key.item != id }
      }
    }
  }

  /// An effect's SwiftUI, held at its part's frame in its item's.
  private struct Played {
    let burst: Burst
    let host: UIHostingController<AnyView>
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
    overMenu.view.isUserInteractionEnabled = false
    overMenu.view.accessibilityElementsHidden = true
    overMenu.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effects.layer = self
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window == nil else { return }
    overMenu.keep([:])
    lifted = nil
    overMenu.view.removeFromSuperview()
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
    overMenu.keep(shown)
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
      if let view = overMenu.items[id] { put(view, at: place) }
    }
    if overMenu.items.isEmpty { clearOverMenu() }
  }

  /// Puts `menu`, which lifts the bubble of the item `item`, in `window`,
  /// under what plays over menus; what comes to the item from now on
  /// plays over it.
  func putMenu(_ menu: UIView, in window: UIWindow, lifting item: String) {
    if overMenu.view.superview === window {
      window.insertSubview(menu, belowSubview: overMenu.view)
    } else {
      window.addSubview(menu)
      overMenu.view.frame = window.bounds
      window.addSubview(overMenu.view)
    }
    lifted = item
  }

  /// The menu has gone: what comes to its item plays on the lines again,
  /// and what plays over the menu plays out there.
  func menuGone() {
    lifted = nil
    clearOverMenu()
  }

  private func put(_ view: UIView, at place: ItemPlace) {
    view.bounds = CGRect(origin: .zero, size: place.frame.size)
    view.center = convert(CGPoint(x: place.frame.midX, y: place.frame.midY), to: view.superview)
    view.transform = place.transform
  }

  fileprivate func play(_ effect: ChatEffect, on part: EffectPart, at frame: CGRect) {
    let played: Played?
    if lifted == part.item {
      played = overMenu.playing[part] ?? begin(part, over: true, at: frame)
    } else {
      played = onLines.playing[part] ?? begin(part, over: false, at: frame)
    }
    guard let played else { return }
    played.host.view.frame = frame
    switch effect {
    case .pop: played.burst.pops += 1
    case .spray(let emoji):
      played.burst.emoji = emoji
      played.burst.sprays += 1
    }
  }

  /// Starts what plays on `part`, over the menu or on the lines, put at
  /// `frame` at once, whatever animation it is asked in; none while its
  /// item is off the screen.
  private func begin(_ part: EffectPart, over: Bool, at frame: CGRect) -> Played? {
    guard let item = over ? itemOverMenu(part.item) : onLines.items[part.item] else { return nil }
    let burst = Burst()
    let host = UIHostingController(rootView: Self.content(burst, environment))
    host.sizingOptions = []
    host.safeAreaRegions = []
    host.view.backgroundColor = .clear
    UIView.performWithoutAnimation {
      host.view.frame = frame
      item.addSubview(host.view)
    }
    let played = Played(burst: burst, host: host)
    if over {
      overMenu.playing[part] = played
    } else {
      onLines.playing[part] = played
    }
    return played
  }

  /// The item's frame over the menu, where its frame on the lines is.
  private func itemOverMenu(_ item: String) -> UIView? {
    if let view = overMenu.items[item] { return view }
    guard let lines = onLines.items[item] else { return nil }
    let view = UIView()
    UIView.performWithoutAnimation {
      overMenu.view.addSubview(view)
      view.bounds = lines.bounds
      view.center = convert(lines.center, to: overMenu.view)
      view.transform = lines.transform
    }
    overMenu.items[item] = view
    return view
  }

  /// Takes the view over menus away once nothing plays there and no menu
  /// is open.
  private func clearOverMenu() {
    if lifted == nil, overMenu.items.isEmpty { overMenu.view.removeFromSuperview() }
  }

  private static func content(_ burst: Burst, _ environment: EnvironmentValues) -> AnyView {
    AnyView(BurstView(burst: burst).environment(\.self, environment))
  }

  fileprivate func move(_ part: EffectPart, to frame: CGRect) {
    onLines.playing[part]?.host.view.frame = frame
    overMenu.playing[part]?.host.view.frame = frame
  }

  fileprivate func end(_ part: EffectPart) {
    onLines.playing.removeValue(forKey: part)?.host.view.removeFromSuperview()
    overMenu.playing.removeValue(forKey: part)?.host.view.removeFromSuperview()
    for (id, view) in overMenu.items where view.subviews.isEmpty {
      view.removeFromSuperview()
      overMenu.items[id] = nil
    }
    clearOverMenu()
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
      // Each pop its own view, coming in anew.
      if popped > 0 {
        Color.clear.id(popped).transition(.movingParts.pop(colors.accentDefault))
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
