import CoreGraphics

/// Where a held line's bubble, its reactions' bar and its menu go on the
/// screen (spec/chat.md, Opening a message's menu): the bubble where it
/// was, the bar over it and the menu under it, or over the bar when there
/// is no room under it, as LINE turns it. Only when neither fits are the
/// three moved together to stay in the room, the bubble drawn smaller
/// about its top corner by the writer, down to `leastScale`, and cut short
/// at its end past that. All on one space, the window's.
public struct MenuPlacement: Equatable, Sendable {
  /// Between the bar, the bubble and the menu.
  public static let gap: CGFloat = 8
  /// Kept free at the room's edges and the screen's sides.
  public static let margin: CGFloat = 12
  /// How small a tall bubble is drawn at least; past that its end is cut.
  public static let leastScale: CGFloat = 0.5
  /// The least height a bubble is drawn at beside its menu.
  public static let leastBubble: CGFloat = 60

  /// The bubble as it is drawn: smaller than it is when `scale` is below
  /// 1, and cut at its foot to this height.
  public let bubble: CGRect
  /// How large the bubble is drawn, about its top corner by the writer.
  public let scale: CGFloat
  /// The reactions' bar, for a line that takes them.
  public let bar: CGRect?
  /// The menu, as tall as the room leaves it, its items scrolled past that.
  public let menu: CGRect
  /// The menu is under the bubble, else over the bar.
  public let menuUnder: Bool
  /// The bubble stays where it was, the bar and the menu fitting round it.
  public let inPlace: Bool
  /// The keyboard up goes down for the room they take.
  public private(set) var putsKeyboardAway = false

  /// A keyboard up stays, as LINE keeps it, when the three fit over it with
  /// the bubble where it was; else they take the screen's room and the
  /// keyboard goes down for it, as iMessage puts it down, so they are
  /// placed once for the room they end in, not for the keyboard going.
  ///
  /// - Parameters:
  ///   - bubble: Where the line's bubble is.
  ///   - top: The screen's safe top.
  ///   - bottom: The screen's safe foot.
  ///   - keyboardTop: The keyboard's top while it is up.
  ///   - width: The screen's width.
  ///   - bar: The bar's size; none for a line that takes no reactions.
  ///   - menu: The menu's width, and its height with all its items.
  ///   - leastMenu: The least height the menu is drawn at, one item's.
  ///   - mine: The reader's own line, lined up by the screen's right.
  public init(
    bubble: CGRect, top: CGFloat, bottom: CGFloat, keyboardTop: CGFloat?, width: CGFloat,
    bar: CGSize?, menu: CGSize, leastMenu: CGFloat, mine: Bool
  ) {
    func placed(foot: CGFloat) -> MenuPlacement {
      MenuPlacement(
        bubble: bubble, top: top, foot: foot, width: width, bar: bar, menu: menu,
        leastMenu: leastMenu, mine: mine)
    }
    guard let keyboardTop, keyboardTop < bottom else {
      self = placed(foot: bottom)
      return
    }
    let over = placed(foot: keyboardTop)
    if over.inPlace {
      self = over
      return
    }
    self = placed(foot: bottom)
    putsKeyboardAway = true
  }

  /// Placed between `top` and `foot`.
  private init(
    bubble frame: CGRect, top: CGFloat, foot: CGFloat, width: CGFloat, bar: CGSize?,
    menu: CGSize, leastMenu: CGFloat, mine: Bool
  ) {
    let top = top + Self.margin
    let bottom = foot - Self.margin
    let gap = Self.gap
    let barSpace = bar.map { $0.height + gap } ?? 0
    let menuHeight = min(
      menu.height, max(leastMenu, bottom - top - barSpace - Self.leastBubble - 2 * gap))
    let menuSpace = gap + menuHeight
    let stays = frame.minY - barSpace >= top && frame.maxY <= bottom
    let fits =
      stays && (frame.maxY + menuSpace <= bottom || frame.minY - barSpace - menuSpace >= top)
    var bubble = frame
    var scale: CGFloat = 1
    let menuY: CGFloat
    if fits {
      let under = frame.maxY + menuSpace <= bottom
      menuY = under ? frame.maxY + gap : frame.minY - barSpace - menuSpace
      menuUnder = under
    } else {
      let space = max(bottom - top - barSpace - menuSpace, Self.leastBubble)
      scale = min(1, max(space / frame.height, Self.leastScale))
      let width = frame.width * scale
      let height = min(frame.height * scale, space)
      var y = frame.minY
      if y - barSpace < top { y = top + barSpace }
      if y + height + menuSpace > bottom { y = bottom - menuSpace - height }
      bubble = CGRect(x: mine ? frame.maxX - width : frame.minX, y: y, width: width, height: height)
      menuY = bubble.maxY + gap
      menuUnder = true
    }
    // Lined up with the bubble's edge by its writer, within the sides.
    func across(_ itemWidth: CGFloat) -> CGFloat {
      let left = mine ? frame.maxX - itemWidth : frame.minX
      return min(max(left, Self.margin), width - itemWidth - Self.margin)
    }
    self.bubble = bubble
    self.scale = scale
    self.bar = bar.map { size in
      CGRect(x: across(size.width), y: bubble.minY - barSpace, width: size.width, height: size.height)
    }
    self.menu = CGRect(x: across(menu.width), y: menuY, width: menu.width, height: menuHeight)
    inPlace = fits
  }
}
