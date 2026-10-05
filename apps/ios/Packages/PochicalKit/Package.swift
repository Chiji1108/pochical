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
    .package(path: "../PochicalProto"),
    .package(url: "https://github.com/pointfreeco/sqlite-data.git", exact: "1.12.0"),
    // SQLiteData's own, for ValueObservation, which it does not export.
    .package(url: "https://github.com/groue/GRDB.swift", exact: "7.11.1"),
  ],
  targets: [
    .target(
      name: "PochicalKit",
      dependencies: [
        "PochicalDesign",
        "PochicalProto",
        .product(name: "SQLiteData", package: "sqlite-data"),
        .product(name: "GRDB", package: "GRDB.swift"),
      ]
    ),
    .testTarget(name: "PochicalKitTests", dependencies: ["PochicalKit"]),
  ]
)
