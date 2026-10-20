
extension ChatController {
  /// The menu layer's bubble on the window as drawn this frame (its
  /// clipping view's presentation), with where its line's bubble is drawn
  /// in its cell this frame: the cell's presentation frame and the bubble's
  /// place in it.
  func probeMenu(_ window: UIWindow) -> String {
    guard let layer = window.subviews.first(where: { $0 is MenuLayer }) else { return "" }
    var parts = [" MENU"]
    if let lift = layer.subviews.first(where: { !$0.isUserInteractionEnabled }) {
      let p = lift.layer.presentation()?.position ?? lift.center
      let a = lift.layer.presentation()?.opacity ?? 1
      let s = lift.layer.presentation()?.transform.m11 ?? 1
      parts.append(String(format: "lift=%.1f,%.1f,s%.3f,a%.2f", p.y, p.x, s, a))
    }
    let scrim = layer.subviews.first
    parts.append(String(format: "scrim=%.2f", scrim?.layer.presentation()?.opacity ?? -1))
    if let anchor = menuAnchor {
      let bounds = lines.layer.presentation()?.bounds ?? lines.bounds
      let origin = view.convert(lines.frame.origin, to: window)
      if let cell = lines.visibleCells.first(where: { ($0 as? LineCell)?.item == anchor.item }) {
        let f = cell.layer.presentation()?.frame ?? cell.frame
        let y = origin.y + f.minY - bounds.minY + anchor.inCell.midY
        let x = origin.x + f.minX - bounds.minX + anchor.inCell.midX
        parts.append(String(format: "line=%.1f,%.1f", y, x))
      } else {
        parts.append("line=none")
      }
    }
    return parts.joined(separator: " ")
  }
}
