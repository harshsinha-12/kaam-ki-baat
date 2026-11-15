// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KaamKiBaatAirPods",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "KaamKiBaatAirPods", targets: ["AirPodsCompanion"]),
        .executable(name: "AirPodsAPISmoke", targets: ["AirPodsAPISmoke"]),
    ],
    targets: [
        .target(name: "AirPodsCore"),
        .executableTarget(name: "AirPodsCompanion", dependencies: ["AirPodsCore"]),
        .executableTarget(name: "AirPodsAPISmoke", dependencies: ["AirPodsCore"]),
        .testTarget(name: "AirPodsCoreTests", dependencies: ["AirPodsCore"]),
    ]
)
