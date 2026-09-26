// swift-tools-version: 6.2
import PackageDescription

// Code generated from proto/ by `mise run gen`. Do not edit Sources by hand.
let package = Package(
  name: "PochicalProto",
  platforms: [.iOS(.v26), .macOS(.v26)],
  products: [
    .library(name: "PochicalProto", targets: ["PochicalProto"])
  ],
  dependencies: [
    .package(url: "https://github.com/apple/swift-protobuf.git", exact: "1.38.1"),
    .package(url: "https://github.com/connectrpc/connect-swift.git", exact: "1.2.3"),
  ],
  targets: [
    .target(
      name: "PochicalProto",
      dependencies: [
        .product(name: "SwiftProtobuf", package: "swift-protobuf"),
        .product(name: "Connect", package: "connect-swift"),
      ]
    )
  ]
)
