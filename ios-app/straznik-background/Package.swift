// swift-tools-version: 5.9
import PackageDescription

// Nazwa pakietu musi brzmieć „StraznikBackground”: Capacitor CLI wylicza ją
// z nazwy pakietu npm (straznik-background) i tak wpisuje do CapApp-SPM.
let package = Package(
    name: "StraznikBackground",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "StraznikBackground",
            targets: ["StraznikBackgroundPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", "12.19.0"..<"13.0.0")
    ],
    targets: [
        .target(
            name: "StraznikBackgroundPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk")
            ],
            path: "ios/Sources/StraznikBackgroundPlugin")
    ]
)
