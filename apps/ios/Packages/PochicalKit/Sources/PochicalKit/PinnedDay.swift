import CoreGraphics

/// The day floating over a chat's lines, kept as a list keeps its pinned
/// section header (spec/chat.md, Scrolling): a day's title takes it over
/// once its words are up to where it rests, and the next title coming up
/// under it pushes it up and out on the way there, the two never drawn
/// over each other. All on the lines' own space.
public struct PinnedDay: Equatable, Sendable {
  /// A row of the lines, in order.
  public struct Row: Equatable, Sendable {
    /// Its place among all the lines' rows.
    public let item: Int
    public let foot: CGFloat
    /// A day's title, its words drawn at its foot.
    public let title: Bool

    public init(item: Int, foot: CGFloat, title: Bool) {
      self.item = item
      self.foot = foot
      self.title = title
    }
  }

  /// The row whose day is pinned: the first reaching below where the day
  /// rests, or the one before a title whose words are not up to it yet;
  /// nil with no row there.
  public let item: Int?
  /// How far the next title pushes the pinned day up, from 0 to its
  /// height.
  public let push: CGFloat

  /// - Parameters:
  ///   - rows: those laid out around where the day rests, in order.
  ///   - line: the pinned day's top as it rests.
  ///   - height: the day's words, as tall in a title as pinned.
  public init(rows: [Row], line: CGFloat, height: CGFloat) {
    func reached(_ row: Row) -> Bool { row.foot - height <= line }
    guard let at = rows.firstIndex(where: { $0.foot > line }) else {
      item = nil
      push = 0
      return
    }
    let first = rows[at]
    if first.title, !reached(first) {
      item = first.item > 0 ? first.item - 1 : nil
    } else {
      item = first.item
    }
    let next = rows[at...].first { $0.title && !reached($0) }
    push = next.map { min(height, max(0, line + 2 * height - $0.foot)) } ?? 0
  }
}
