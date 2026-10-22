import Testing

@testable import PochicalDesign

@Test func joinsEachPhrasesLetters() {
  #expect("もう一度お試し".phrased == "も\u{2060}う一\u{2060}度お\u{2060}試\u{2060}し")
  #expect("家族👩🏻‍💻です".phrased == "家\u{2060}族\u{2060}👩🏻‍💻\u{2060}で\u{2060}す")
}

@Test func leavesTextWithoutJapaneseAlone() {
  #expect("Pochical 1.0".phrased == "Pochical 1.0")
  #expect("".phrased == "")
  #expect("あ".phrased == "あ")
}
