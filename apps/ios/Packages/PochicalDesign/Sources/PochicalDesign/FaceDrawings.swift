// Code generated from design/ by `mise run gen`. Do not edit.

import SwiftUI

/// The drawings a person can use as their face in place of a photo, in the chooser's order (design/src/drawings.ts).
public struct FaceDrawing: Sendable, Identifiable, Hashable {
  public let id: String
  /// Its name, as a screen reader says it.
  public let name: String

  /// The picture, a square that scales to any size.
  public var image: Image { Image(id, bundle: .module) }

  public static let all: [FaceDrawing] = [
    FaceDrawing(id: "cat", name: "ねこ"),
    FaceDrawing(id: "dog", name: "いぬ"),
    FaceDrawing(id: "rabbit", name: "うさぎ"),
    FaceDrawing(id: "bear", name: "くま"),
    FaceDrawing(id: "penguin", name: "ペンギン"),
    FaceDrawing(id: "chick", name: "ひよこ"),
    FaceDrawing(id: "coffee", name: "コーヒー"),
    FaceDrawing(id: "onigiri", name: "おにぎり"),
    FaceDrawing(id: "strawberry", name: "いちご"),
    FaceDrawing(id: "flower", name: "花"),
    FaceDrawing(id: "cactus", name: "サボテン"),
    FaceDrawing(id: "moon", name: "月"),
  ]
}
