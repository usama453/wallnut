import Foundation
import Network
import os

public struct DiscoveredDevice: Identifiable, Equatable {
    public let id: String
    public let name: String
    public let endpoint: NWEndpoint

    public static func == (l: DiscoveredDevice, r: DiscoveredDevice) -> Bool {
        l.id == r.id && l.name == r.name && l.endpoint == r.endpoint
    }
}

/// mDNS/DNS-SD browse of `_photobridge._tcp` (receiver advertises ver=1,
/// name=<deviceName>, cap=wifi).
public final class DeviceDiscovery: ObservableObject {
    @Published public private(set) var devices: [DiscoveredDevice] = []
    @Published public private(set) var isBrowsing = false

    private var browser: NWBrowser?
    private let logger = PBLog.category("discovery")

    public init() {}

    public func start() {
        guard browser == nil else { return }
        let params = NWParameters()
        params.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: ProtocolConstants.serviceType, domain: nil), using: params)
        browser.stateUpdateHandler = { [weak self] state in
            DispatchQueue.main.async {
                self?.isBrowsing = state == .ready
            }
        }
        browser.browseResultsChangedHandler = onBrowseResults
        browser.start(queue: .main)
        self.browser = browser
        logger.info("browsing \(ProtocolConstants.serviceType)")
    }

    public func stop() {
        browser?.cancel()
        browser = nil
        DispatchQueue.main.async {
            self.devices = []
            self.isBrowsing = false
        }
        logger.info("browse stopped")
    }

    private func onBrowseResults(_ results: Set<NWBrowser.Result>, _ changes: Set<NWBrowser.Result.Change>) {
        let mapped = results.compactMap { result -> DiscoveredDevice? in
            guard case .service(let name, let type, let domain, _) = result.endpoint else { return nil }
            return DiscoveredDevice(
                id: "\(type).\(domain).\(name)",
                name: name,
                endpoint: result.endpoint
            )
        }
        let sorted = mapped.sorted { $0.name < $1.name }
        DispatchQueue.main.async {
            self.devices = sorted
        }
    }
}

extension os.Logger {
    func info(_ m: String) { info("\(m, privacy: .public)") }
    func warn(_ m: String) { notice("\(m, privacy: .public)") }
    func error(_ m: String) { error("\(m, privacy: .public)") }
}