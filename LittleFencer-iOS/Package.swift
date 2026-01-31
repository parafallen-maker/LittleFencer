// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "LittleFencer",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "LittleFencer",
            targets: ["LittleFencer"]
        )
    ],
    dependencies: [
        // Note: MediaPipe iOS SDK can be added via CocoaPods if needed
        // The app currently uses Vision Framework with 19→33 point mapping
        // For native MediaPipe, add via Podfile:
        // pod 'MediaPipeTasksVision'
    ],
    targets: [
        .target(
            name: "LittleFencer",
            dependencies: [],
            path: "LittleFencer"
        )
    ]
)
