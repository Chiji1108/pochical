// swift-tools-version: 6.2
import PackageDescription

// What the app and its widgets share that is written by hand: the logic
// spec/ describes, checked against spec/vectors, and the database.
let package = Package(
  name: "PochicalKit",
  platforms: [.iOS(.v26), .macOS(.v26)],
  products: [
    .library(name: "PochicalKit", targets: ["PochicalKit"])
  ],
  dependencies: [
    .package(path: "../PochicalDesign"),
    .package(url: "https://github.com/pointfreeco/sqlite-data.git", from: "1.12.0"),
  ],
  targets: [
    .target(
      name: "PochicalKit",
      dependencies: [
        "PochicalDesign",
        .product(name: "SQLiteData", package: "sqlite-data"),
      ]
    ),
    .testTarget(name: "PochicalKitTests", dependencies: ["PochicalKit"]),
  ]
)
