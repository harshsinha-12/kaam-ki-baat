import AppKit
import SwiftUI
import CoreMotion

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private let model = CompanionModel()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 650),
                              styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Kaam Ki Baat · AirPods"
        window.contentView = NSHostingView(rootView: CompanionView(model: model))
        window.center(); window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)
        if CommandLine.arguments.contains("--smoke-ui") {
            // Launch-only smoke: no sensor start, permission request or API request.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                print("UI_SMOKE_OK window=\(window.isVisible) motionStarted=false")
                NSApp.terminate(nil)
            }
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { model.shutdown() }
}

if CommandLine.arguments.contains("--diagnose") {
    let manager = CMHeadphoneMotionManager()
    let report: [String: Any] = [
        "source": "CMHeadphoneMotionManager read-only capability probe",
        "authorizationStatus": CMHeadphoneMotionManager.authorizationStatus().rawValue,
        "deviceMotionAvailable": manager.isDeviceMotionAvailable,
        "deviceMotionActive": manager.isDeviceMotionActive,
        "bundleIdentifier": Bundle.main.bundleIdentifier ?? "unbundled",
        "motionUsageDescriptionPresent": Bundle.main.object(forInfoDictionaryKey: "NSMotionUsageDescription") is String,
        "hardwareVerified": false,
        "note": "Availability is capability, not evidence of connected headphones or real samples. No motion updates requested."
    ]
    let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
    print(String(decoding: data, as: UTF8.self))
} else {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}
