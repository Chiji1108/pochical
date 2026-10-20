"""probe.py <worktree> apply|revert: puts the uncommitted measuring probes in
(or takes them out of) the iOS app: the local server on 8788, every cell
configured, ended and reused, and per display frame each visible line's
presentation frame on the window with, when the menu layer is there, its
bubble's. Anchors are strings both main and the branch have; a probe whose
anchor is missing is reported, not skipped silently."""
import pathlib, subprocess, sys

wt = pathlib.Path(sys.argv[1])
mode = sys.argv[2]
app = wt / "apps/ios/Pochical/Pochical"
files = {
    "account": wt / "apps/ios/Packages/PochicalKit/Sources/PochicalKit/Account.swift",
    "stage": app / "ChatStage.swift",
}

if mode == "revert":
    subprocess.run(["git", "-C", str(wt), "checkout", "--",
                    str(files["account"]), str(files["stage"])], check=True)
    print("reverted")
    sys.exit(0)

edits = {
    "account": [
        ('URL(string: "http://localhost:8787")!', 'URL(string: "http://localhost:8788")!'),
    ],
    "stage": [
        ("      cell.measure = { width in model.height(of: id, width: width) }\n",
         "      cell.probeID = id\n      probe(\"configure \\(id)\")\n"
         "      cell.measure = { width in model.height(of: id, width: width) }\n"),
        ("    view.addSubview(lines)\n",
         "    view.addSubview(lines)\n"
         "    probeLink = CADisplayLink(target: self, selector: #selector(probeTick))\n"
         "    probeLink?.add(to: .main, forMode: .common)\n"),
        ("  func scrollViewDidScroll(_ scrollView: UIScrollView) {\n",
         """  func collectionView(
    _ collectionView: UICollectionView, didEndDisplaying cell: UICollectionViewCell,
    forItemAt indexPath: IndexPath
  ) {
    probe("ended \\((cell as? LineCell)?.probeID ?? "")")
  }

  private var probeLink: CADisplayLink?
  private var probeLast = ""
  @objc private func probeTick() {
    guard let window = view.window else { return }
    let bounds = lines.layer.presentation()?.bounds ?? lines.bounds
    let origin = view.convert(lines.frame.origin, to: window)
    var parts: [String] = []
    for case let cell as LineCell in lines.visibleCells {
      let f = cell.layer.presentation()?.frame ?? cell.frame
      let y = origin.y + f.minY - bounds.minY
      guard y + f.height > 0, y < window.bounds.height else { continue }
      parts.append("\\(cell.probeID.suffix(10))@\\(String(format: "%.1f", y)),\\(String(format: "%.1f", f.height)),a\\(String(format: "%.2f", cell.contentView.layer.presentation()?.opacity ?? 1))")
    }
    parts.sort { ($0.split(separator: "@")[1].split(separator: ",")[0] as NSString).doubleValue < ($1.split(separator: "@")[1].split(separator: ",")[0] as NSString).doubleValue }
    let guide = view.convert(view.keyboardLayoutGuide.layoutFrame, to: window).minY
    let line = "kb=\\(String(format: "%.1f", guide)) off=\\(String(format: "%.1f", bounds.minY)) " + parts.joined(separator: " ") + probeMenu(window)
    if line != probeLast {
      probeLast = line
      probe("F \\(line)")
    }
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
"""),
        ("  override var safeAreaInsets: UIEdgeInsets { .zero }\n",
         "  override var safeAreaInsets: UIEdgeInsets { .zero }\n  var probeID = \"\"\n"
         "  override func prepareForReuse() {\n    super.prepareForReuse()\n"
         "    probe(\"prepareForReuse \\(probeID)\")\n  }\n"),
    ],
}

menu_probe = {
    "main": """
extension ChatController {
  func probeMenu(_ window: UIWindow) -> String {
    let overlay = window.windowScene?.windows.contains { $0.windowLevel == .alert && !$0.isHidden } ?? false
    return overlay ? " OVERLAY" : ""
  }
}
""",
    "branch": pathlib.Path(__file__).with_name("probe-branch.swift").read_text() if pathlib.Path(__file__).with_name("probe-branch.swift").exists() else "",
}
variant = sys.argv[3] if len(sys.argv) > 3 else "main"
tail = {
    "stage": menu_probe[variant] + """
func probe(_ text: String) {
  print(String(format: "%.4f", Date().timeIntervalSince1970), "POC117DBG", text)
}
""",
}

if variant == "branch":
    edits["stage"] += [
        ("      guard let lineID = pressing?.lineID else { return }\n",
         "      guard let lineID = pressing?.lineID else { return }\n      probe(\"press began \\(lineID)\")\n"),
        ("  private func pressable(_ touch: UITouch) -> Bool {\n",
         "  private func pressable(_ touch: UITouch) -> Bool {\n"
         "    if let p = lines.indexPathForItem(at: touch.location(in: lines)), let c = lines.cellForItem(at: p) as? LineCell {\n"
         "      probe(\"pressable \\(c.item ?? \"-\") at \\(touch.location(in: c)) \\(c.space.bubbles.mapValues(\\.frame))\")\n"
         "    } else { probe(\"pressable no cell at \\(touch.location(in: lines))\") }\n"),
        ("    window.addSubview(layer)\n", "    window.addSubview(layer)\n    probe(\"menu shown\")\n"),
        ("  private func putKeyboardAway() {\n", "  private func putKeyboardAway() {\n    probe(\"keyboard away\")\n"),
        ("  private func menuClosed(_ layer: MenuLayer) {\n", "  private func menuClosed(_ layer: MenuLayer) {\n    probe(\"menu closed\")\n"),
    ]
for key, pairs in edits.items():
    path = files[key]
    text = path.read_text()
    for old, new in pairs:
        if old not in text:
            sys.exit(f"anchor missing in {path.name}: {old[:60]!r}")
        text = text.replace(old, new, 1)
    text += tail.get(key, "")
    path.write_text(text)
print("applied")
