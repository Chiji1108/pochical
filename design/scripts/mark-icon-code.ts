// The marks' icons for the native apps: which glyph each icon id draws
// (src/mark-icons.ts) and the glyphs' paths (src/mark-icon-paths.ts).
// Swift gets each path in absolute moves, lines and curves only, arcs
// turned into curves, for a small parser of its own; Kotlin gets
// Phosphor's paths as they are, which Compose's PathParser reads whole.
import svgpath from "svgpath";

import { markIconPaths } from "../src/mark-icon-paths";
import { markIconGlyphs } from "../src/mark-icons";

const weights = ["duotone", "regular"] as const;

const glyphEntries = Object.entries(markIconGlyphs).flatMap(([icon, glyph]) =>
  glyph === undefined ? [] : [[icon, glyph] as const]
);

type Drawing = (typeof markIconPaths)[keyof typeof markIconPaths];

const layersOf = (drawing: Drawing) =>
  weights.flatMap((weight) =>
    drawing[weight].map(({ d, opacity }) => ({
      d,
      opacity: opacity ?? 1,
      weight,
    }))
  );

const SWIFT_PARSER = String.raw`  /// "M", "L", "H", "V", "C", "Q" and "Z", absolute, as the table has them.
  private static func path(_ d: String) -> Path {
    var path = Path()
    var start = CGPoint.zero
    var current = CGPoint.zero
    for (command, numbers) in commands(d) {
      var index = 0
      func next(_ count: Int) -> [CGFloat]? {
        guard index + count <= numbers.count else { return nil }
        defer { index += count }
        return numbers[index..<index + count].map { CGFloat($0) }
      }
      func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: x, y: y)
      }
      switch command {
      case "M":
        var first = true
        while let n = next(2) {
          current = point(n[0], n[1])
          if first {
            path.move(to: current)
            start = current
            first = false
          } else {
            path.addLine(to: current)
          }
        }
      case "L":
        while let n = next(2) {
          current = point(n[0], n[1])
          path.addLine(to: current)
        }
      case "H":
        while let n = next(1) {
          current = point(n[0], current.y)
          path.addLine(to: current)
        }
      case "V":
        while let n = next(1) {
          current = point(current.x, n[0])
          path.addLine(to: current)
        }
      case "C":
        while let n = next(6) {
          current = point(n[4], n[5])
          path.addCurve(to: current, control1: point(n[0], n[1]), control2: point(n[2], n[3]))
        }
      case "Q":
        while let n = next(4) {
          current = point(n[2], n[3])
          path.addQuadCurve(to: current, control: point(n[0], n[1]))
        }
      case "Z":
        path.closeSubpath()
        current = start
      default:
        break
      }
    }
    return path
  }

  private static func commands(_ d: String) -> [(Character, [Double])] {
    var commands: [(Character, [Double])] = []
    var number = ""
    func endNumber() {
      if let value = Double(number), !commands.isEmpty {
        commands[commands.count - 1].1.append(value)
      }
      number = ""
    }
    for character in d {
      switch character {
      case "0"..."9":
        number.append(character)
      case ".":
        if number.contains(".") { endNumber() }
        number.append(character)
      case "-":
        if number.last != "e" { endNumber() }
        number.append(character)
      case "e":
        number.append(character)
      case " ", ",":
        endNumber()
      default:
        endNumber()
        commands.append((character, []))
      }
    }
    endNumber()
    return commands
  }`;

export function swiftMarkIcons() {
  const drawings = Object.entries(markIconPaths).flatMap(([glyph, drawing]) =>
    layersOf(drawing).map(
      ({ d, opacity, weight }) =>
        `    ${glyph}\t${weight}\t${opacity}\t${svgpath(d).abs().unshort().unarc().round(2).toString()}`
    )
  );
  return [
    "import SwiftUI",
    "",
    "/// The icons a pattern's mark can be drawn with, by the id a pattern keeps (design/src/mark-icons.ts), as Phosphor draws them on a 256 grid: duotone when filled, regular when not.",
    "public enum MarkIcons {",
    "  /// One layer of an icon: its path at the size asked for, and how strongly it is filled (Phosphor's duotone back is faint).",
    "  public struct Layer: Sendable {",
    "    public let path: Path",
    "    public let opacity: Double",
    "  }",
    "",
    '  /// The icon\'s layers at `size` points square, or nil for "letter" and an id with no glyph.',
    "  public static func layers(_ icon: String, filled: Bool, size: CGFloat) -> [Layer]? {",
    '    guard let glyph = glyphs[icon], let layers = drawings[glyph]?[filled ? "duotone" : "regular"] else {',
    "      return nil",
    "    }",
    "    let scale = CGAffineTransform(scaleX: size / 256, y: size / 256)",
    "    return layers.map { Layer(path: $0.path.applying(scale), opacity: $0.opacity) }",
    "  }",
    "",
    "  private static let glyphs: [String: String] = [",
    ...glyphEntries.map(([icon, glyph]) => `    "${icon}": "${glyph}",`),
    "  ]",
    "",
    "  /// Each glyph's layers by weight, read from DRAWINGS on first use.",
    "  private static let drawings: [String: [String: [Layer]]] = {",
    "    var drawings: [String: [String: [Layer]]] = [:]",
    '    for line in DRAWINGS.split(separator: "\\n") {',
    '      let fields = line.split(separator: "\\t", maxSplits: 3).map(String.init)',
    "      let layer = Layer(path: path(fields[3]), opacity: Double(fields[2]) ?? 1)",
    "      drawings[fields[0], default: [:]][fields[1], default: []].append(layer)",
    "    }",
    "    return drawings",
    "  }()",
    "",
    SWIFT_PARSER,
    "",
    '  private static let DRAWINGS = """',
    ...drawings,
    '    """',
    "}",
  ];
}

export function kotlinMarkIcons() {
  return [
    "/**",
    " * The icons a pattern's mark can be drawn with, by the id a pattern keeps",
    " * (design/src/mark-icons.ts), as Phosphor draws them on a 256 grid: each",
    " * glyph's layers by weight, duotone when filled and regular when not, as",
    " * SVG path data for PathParser with how strongly each is filled.",
    " */",
    "object MarkIcons {",
    "  data class Layer(val pathData: String, val opacity: Float)",
    "",
    '  /** Phosphor\'s glyph for each icon id; "letter" has none. */',
    "  val glyphs: Map<String, String> = mapOf(",
    ...glyphEntries.map(([icon, glyph]) => `    "${icon}" to "${glyph}",`),
    "  )",
    "",
    "  val drawings: Map<String, Map<String, List<Layer>>> by lazy {",
    "    mapOf(",
    ...Object.entries(markIconPaths).map(([glyph, drawing]) => {
      const byWeight = weights.map(
        (weight) =>
          `"${weight}" to listOf(${drawing[weight]
            .map(({ d, opacity }) => `Layer("${d}", ${opacity ?? 1}f)`)
            .join(", ")})`
      );
      return `      "${glyph}" to mapOf(${byWeight.join(", ")}),`;
    }),
    "    )",
    "  }",
    "}",
  ];
}
