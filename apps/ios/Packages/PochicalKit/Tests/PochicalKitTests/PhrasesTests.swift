import PochicalDesign
import Testing

struct PhrasesVectors: Decodable, Sendable {
  struct Case: VectorCase {
    let name: String
    let text: String
    let expected: [String]
  }

  let split: [Case]
}

@Test(arguments: try vectors("phrases", as: PhrasesVectors.self).split)
func splitsAsTheSiteDoes(_ vector: PhrasesVectors.Case) {
  #expect(Phrases.split(vector.text) == vector.expected)
}
