import Testing

@testable import PochicalDesign

// The phrases BudouX finds on the site (apps/web/tests/phrases.test.tsx),
// so a sentence breaks in the same places in the app.
@Test func splitsAsTheSiteDoes() {
  #expect(
    Phrases.split("参加すると、あなたのシフトもメンバーに見えるようになります。")
      == ["参加すると、", "あなたの", "シフトも", "メンバーに", "見えるようになります。"])
  #expect(
    Phrases.split("通信状態を確認して、もう一度お試しください。")
      == ["通信状態を", "確認して、", "もう", "一度", "お試しください。"])
  #expect(
    Phrases.split("家族や友だちのシフトを、ひとつの表に。みんなが休みの日も、すぐ見つかります。")
      == [
        "家族や", "友だちの", "シフトを、", "ひとつの", "表に。", "みんなが", "休みの", "日も、",
        "すぐ", "見つかります。",
      ])
}

@Test func joinsEachPhrasesLetters() {
  #expect("もう一度お試し".phrased == "も\u{2060}う一\u{2060}度お\u{2060}試\u{2060}し")
}

@Test func leavesTextWithoutJapaneseAlone() {
  #expect("Pochical 1.0".phrased == "Pochical 1.0")
  #expect("".phrased == "")
  #expect("あ".phrased == "あ")
}
