import SwiftUI

@main
struct PhotoBridgeApp: App {
    @StateObject private var discovery = DeviceDiscovery()
    @StateObject private var engine = TransferEngine()

    var body: some Scene {
        WindowGroup {
            ContentView(discovery: discovery, engine: engine)
        }
    }
}