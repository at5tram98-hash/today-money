// swift-tools-version: 5.9
// 今日のお金の共通ロジック（画面に依存しない）。iOS アプリから使い、Linux / macOS の `swift test` でも検証できる。
import PackageDescription

let package = Package(
    name: "TodayMoneyCore",
    defaultLocalization: "ja",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "TodayMoneyCore", targets: ["TodayMoneyCore"]),
    ],
    targets: [
        .target(name: "TodayMoneyCore"),
        .testTarget(name: "TodayMoneyCoreTests", dependencies: ["TodayMoneyCore"], resources: [.copy("Fixtures")]),
    ]
)
