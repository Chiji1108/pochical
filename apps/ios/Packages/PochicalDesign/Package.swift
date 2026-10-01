// swift-tools-version: 6.2
import PackageDescription

// Code generated from design/ by `mise run gen`. Do not edit Sources by hand.
let package = Package(
  name: "PochicalDesign",
  platforms: [.iOS(.v26), .macOS(.v26)],
  products: [
    .library(name: "PochicalDesign", targets: ["PochicalDesign"])
  ],
  targets: [
    .target(name: "PochicalDesign"),
    .testTarget(name: "PochicalDesignTests", dependencies: ["PochicalDesign"]),
  ]
)
