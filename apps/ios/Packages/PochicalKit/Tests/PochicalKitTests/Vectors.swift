import Foundation
import Testing

/// A file of spec/vectors, the cases every platform checks its own code
/// against, read from the repository this package is in.
func vectors<Cases: Decodable>(_ name: String, as _: Cases.Type = Cases.self) -> Cases {
  // Tests/PochicalKitTests/Vectors.swift, under apps/ios/Packages/PochicalKit.
  var root = URL(filePath: #filePath)
  for _ in 0..<7 {
    root.deleteLastPathComponent()
  }
  let url = root.appending(path: "spec/vectors/\(name).json")
  do {
    return try JSONDecoder().decode(Cases.self, from: Data(contentsOf: url))
  } catch {
    fatalError("Cannot read \(url.path()): \(error)")
  }
}

/// One case of a vectors file, named as the file names it.
protocol VectorCase: Decodable, Sendable, CustomTestStringConvertible {
  var name: String { get }
}

extension VectorCase {
  var testDescription: String { name }
}
