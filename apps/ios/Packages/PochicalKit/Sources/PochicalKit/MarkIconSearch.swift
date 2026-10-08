import Foundation
import PochicalDesign

/// The icon picker's search (/design's IconPickerSheet): the kinds with
/// only the icons whose name or words hold every word typed, width, case
/// and katakana folded, so ケア, けあ and ｹｱ find the same.
public enum MarkIconSearch {
  public static func sections(matching query: String) -> [MarkIconNames.Section] {
    let words = folded(query).split(whereSeparator: \.isWhitespace).map(String.init)
    guard !words.isEmpty else { return MarkIconNames.sections }
    return MarkIconNames.sections.compactMap { section in
      let icons = section.icons.filter { icon in
        let text = folded("\(MarkIconNames.names[icon] ?? "") \(MarkIconNames.words[icon] ?? "")")
        return words.allSatisfy { text.contains($0) }
      }
      return icons.isEmpty ? nil : MarkIconNames.Section(title: section.title, icons: icons)
    }
  }

  private static func folded(_ text: String) -> String {
    let wide = text.precomposedStringWithCompatibilityMapping.lowercased()
    return wide.applyingTransform(.hiraganaToKatakana, reverse: true) ?? wide
  }
}
