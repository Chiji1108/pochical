import Testing

@testable import PochicalDesign

@Test func joinsEachPhrasesLetters() {
  #expect("もう一度お試し".phrased == "も\u{2060}う一\u{2060}度お\u{2060}試\u{2060}し")
  #expect("家族👩🏻‍💻です".phrased == "家\u{2060}族\u{2060}👩🏻‍💻\u{2060}で\u{2060}す")
}

// BudouX ends a phrase between か and its voicing mark here (か / ゙さくらさんの /
// シフトを / 見る); a letter never breaks, so が stays one and joins さ.
@Test func keepsALetterWholeWhereAPhraseEndsInsideIt() {
  #expect(
    "か\u{3099}さくらさんのシフトを見る".phrased
      == "か\u{3099}\u{2060}さ\u{2060}く\u{2060}ら\u{2060}さ\u{2060}ん\u{2060}のシ\u{2060}フ\u{2060}ト\u{2060}を見\u{2060}る")
}

@Test func leavesTextWithoutJapaneseAlone() {
  #expect("Pochical 1.0".phrased == "Pochical 1.0")
  #expect("".phrased == "")
  #expect("あ".phrased == "あ")
}
