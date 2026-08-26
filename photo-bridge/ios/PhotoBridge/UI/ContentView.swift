import SwiftUI
import Photos

struct ContentView: View {
    @ObservedObject var discovery: DeviceDiscovery
    @ObservedObject var engine: TransferEngine

    @State private var photoAuth: PHAuthorizationStatus = .notDetermined
    @State private var mode: SelectionMode = .all
    @State private var preparing = false
    @State private var prepMessage = ""
    @State private var pinInput = ""
    @State private var activeSession: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if photoAuth == .notDetermined || photoAuth == .denied || photoAuth == .restricted {
                        Button("Allow Photo Library Access") {
                            Task { photoAuth = await PhotoLibrary.requestAuthorization() }
                        }
                    } else if photoAuth == .limited {
                        Label("Limited library access — transferring authorized photos only",
                              systemImage: "photo.on.rectangle.angled")
                            .font(.footnote)
                    }
                }

                Section("What to transfer") {
                    Picker("Mode", selection: $mode) {
                        ForEach(SelectionMode.allCases) { m in
                            Text(label(for: m)).tag(m)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("Desktop") {
                    if discovery.isBrowsing, discovery.devices.isEmpty {
                        ProgressView("Looking for PhotoBridge on your Mac…")
                    } else if discovery.devices.isEmpty {
                        Text("No desktop found. Make sure PhotoBridge is running on your Mac and both devices are on the same Wi-Fi.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(discovery.devices) { device in
                            Button {
                                startTransfer(to: device)
                            } label: {
                                HStack {
                                    Image(systemName: "desktopcomputer")
                                    Text(device.name)
                                    Spacer()
                                    if engine.status == .transferring, engine.deviceName == device.name {
                                        ProgressView()
                                    }
                                }
                            }
                            .disabled(preparing || engine.status == .transferring)
                        }
                    }
                }
            }
            .navigationTitle("PhotoBridge")
            .onAppear {
                photoAuth = PhotoLibrary.authorizationStatus()
                discovery.start()
            }
            .onDisappear { discovery.stop() }
            .safeAreaInset(edge: .bottom) {
                statusBar
            }
            .sheet(isPresented: pinSheetBinding) {
                pinSheet
            }
            .alert("Transfer problem", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(engine.errorMessage ?? "")
            }
        }
    }

    // MARK: - status bar

    private var statusBar: some View {
        Group {
            switch engine.status {
            case .idle:
                EmptyView()
            case .connecting:
                Label("Connecting…", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
                    .padding(12)
            case .pairing:
                Label("Waiting for PIN…", systemImage: "key.viewfinder")
                    .frame(maxWidth: .infinity)
                    .padding(12)
            case .transferring:
                VStack(spacing: 6) {
                    if let name = engine.currentFilename {
                        Text(name)
                            .font(.footnote)
                            .lineLimit(1)
                    }
                    ProgressView(value: Double(engine.bytesDone), total: Double(max(engine.bytesTotal, 1)))
                    Text("\(engine.filesDone)/\(engine.filesTotal) files · \(ByteCount.string(engine.bytesDone)) of \(ByteCount.string(engine.bytesTotal))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
            case .completed:
                Label(engine.summary ?? "Done", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .frame(maxWidth: .infinity)
                    .padding(12)
            case .failed:
                if let device = engine.device {
                    Button("Retry") { startTransfer(to: device) }
                        .frame(maxWidth: .infinity)
                        .padding(12)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .background(.bar)
    }

    // MARK: - PIN sheet

    private var pinSheetBinding: Binding<Bool> {
        Binding(
            get: { engine.status == .pairing && engine.pinChallenge != nil },
            set: { if !$0 { engine.cancelPin() } }
        )
    }

    private var pinSheet: some View {
        VStack(spacing: 16) {
            Image(systemName: "key.viewfinder").font(.largeTitle)
            Text(engine.pinMessage ?? "Enter the PIN shown on the desktop")
                .multilineTextAlignment(.center)
            TextField("PIN", text: $pinInput)
                #if os(iOS)
                .keyboardType(.numberPad)
                #endif
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 220)
                .onSubmit { submitPin() }
            Button("Connect") { submitPin() }
                .buttonStyle(.borderedProminent)
                .disabled(pinInput.count != 6)
        }
        .padding(32)
        .presentationDetents([.height(260)])
    }

    private func submitPin() {
        let pin = pinInput
        pinInput = ""
        engine.submitPin(pin)
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { engine.errorMessage != nil },
            set: { if !$0 { engine.errorMessage = nil } }
        )
    }

    // MARK: - transfer

    private func label(for m: SelectionMode) -> String {
        switch m {
        case .all: return "All photos & videos"
        case .sinceLastBackup: return "Since last backup"
        case .selected: return "Selected items"
        }
    }

    private func startTransfer(to device: DiscoveredDevice) {
        guard activeSession == nil else { return }
        preparing = true
        prepMessage = "Preparing…"
        let mode = self.mode
        activeSession = Task { @MainActor in
            defer {
                preparing = false
                activeSession = nil
            }
            do {
                let since: Date? = mode == .sinceLastBackup ? engine.store.lastBackup : nil
                let batch = try await PhotoLibrary.resources(mode: mode, since: since)
                guard !batch.resources.isEmpty else {
                    engine.summary = "Nothing to transfer"
                    return
                }
                prepMessage = "Computing hashes (\(batch.resources.count) files)…"
                let hashes = await HashCache(store: engine.store).precomputeHashes(for: batch)
                await engine.run(device: device, resources: batch.resources, hashes: hashes)
            } catch {
                engine.fail(message: error.localizedDescription)
            }
        }
    }
}