import Foundation
import Network
#if os(iOS)
import UIKit
#endif

/// Sender-side session state machine (docs/PROTOCOL.md §4):
/// HELLO → pairing → SESSION_MANIFEST → FILE_STATE → chunk window loop →
/// FILE_DONE → FILE_VERIFIED → SESSION_END. Resume and hash-mismatch
/// retries are driven by the receiver's FILE_STATE + FILE_FAILED answers
/// and mirrored into SessionStore.
@MainActor
public final class TransferEngine: ObservableObject {
    public enum Status: String {
        case idle, connecting, pairing, transferring, completed, failed
    }

    @Published public private(set) var status: Status = .idle
    @Published public private(set) var pinChallenge: PinChallenge?
    @Published public private(set) var pinMessage: String?
    @Published public private(set) var filesTotal = 0
    @Published public private(set) var bytesTotal: UInt64 = 0
    @Published public private(set) var filesDone = 0
    @Published public private(set) var bytesDone: UInt64 = 0
    @Published public private(set) var currentFilename: String?
    @Published public private(set) var currentProgress: UInt64 = 0
    @Published public private(set) var currentSize: UInt64 = 0
    @Published public var errorMessage: String?
    @Published public var summary: String?

    public let store = SessionStore()
    public private(set) var device: DiscoveredDevice?
    public private(set) var deviceName: String?

    private var connection: DeviceConnection?
    private var pinContinuation: CheckedContinuation<String, Never>?
    private var foregroundObserver: NSObjectProtocol?
    private let logger = PBLog.category("engine")

    public init() {
        #if os(iOS)
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { await self?.onForeground() }
        }
        #endif
    }

    deinit {
        if let foregroundObserver {
            NotificationCenter.default.removeObserver(foregroundObserver)
        }
    }

    /// Called when the app returns to the foreground (e.g. after the user
    /// locked the phone mid-transfer). A short sleep may leave the TCP
    /// connection alive; a long one almost certainly does not — probe it and
    /// fail fast so the UI offers Retry (which resumes from the last ack)
    /// instead of a spinner that never resolves.
    @MainActor
    private func onForeground() async {
        guard status == .transferring, let conn = connection else { return }
        let alive = await conn.probeLiveness()
        guard !alive else { return }
        connection?.close()
        connection = nil
        fail(message: "Connection lost while away — tap Retry to resume")
    }

    private var deviceID: String {
        let key = "pb_device_id"
        if let existing = UserDefaults.standard.string(forKey: key) { return existing }
        let id = "iphone-\(UUID().uuidString.prefix(8).lowercased())"
        UserDefaults.standard.set(id, forKey: key)
        return id
    }

    #if os(iOS)
    private static var deviceDisplayName: String { UIDevice.current.name }
    private static var deviceOS: String { "ios-\(UIDevice.current.systemVersion)" }
    #else
    private static var deviceDisplayName: String { ProcessInfo.processInfo.hostName }
    private static var deviceOS: String { "macos-\(ProcessInfo.processInfo.operatingSystemVersionString)" }
    #endif

    // MARK: - UI hooks

    public func submitPin(_ pin: String) {
        pinContinuation?.resume(returning: pin)
        pinContinuation = nil
        pinChallenge = nil
    }

    public func cancelPin() {
        pinContinuation?.resume(returning: "")
        pinContinuation = nil
        pinChallenge = nil
    }

    public func cancel() {
        connection?.close()
        connection = nil
        status = .idle
    }

    public func fail(message: String) {
        errorMessage = message
        status = .failed
        connection?.close()
        connection = nil
    }

    // MARK: - Session

    public func run(device: DiscoveredDevice, resources: [PhotoResource], hashes: [String: String]) async {
        status = .connecting
        self.device = device
        deviceName = device.name
        errorMessage = nil
        summary = nil
        filesDone = 0
        bytesDone = 0

        do {
            let conn = DeviceConnection(endpoint: device.endpoint)
            connection = conn
            try await conn.start()
            logger.info("connected to \(device.name)")

            try await conn.send(type: .hello, json: Hello(
                proto_ver: 1,
                device_id: deviceID,
                device_name: Self.deviceDisplayName,
                os: Self.deviceOS
            ))

            // handshake until HELLO_ACK (PIN challenge first when unpaired)
            var sessionID = ""
            handshakeLoop: while true {
                let frame = try await conn.next()
                switch frame.type {
                case .pinChallenge:
                    let ch = try decode(PinChallenge.self, frame)
                    pinChallenge = ch
                    status = .pairing
                    pinMessage = "Enter the 6-digit PIN shown on \(device.name)"
                    let pin = await withCheckedContinuation { (cont: CheckedContinuation<String, Never>) in
                        pinContinuation = cont
                    }
                    guard !pin.isEmpty else {
                        throw ConnectionError.closed
                    }
                    try await conn.send(type: .pinVerify, json: PinVerify(challenge_id: ch.challenge_id, pin: pin))
                case .pinFail:
                    let f = try decode(PinFail.self, frame)
                    pinMessage = "Wrong PIN — \(f.strikes_left) attempt(s) left"
                    throw ConnectionError.closed
                case .helloAck:
                    let ack = try decode(HelloAck.self, frame)
                    sessionID = ack.session_id
                    break handshakeLoop
                case .sessionAbort:
                    let ab = try decode(SessionAbort.self, frame)
                    logger.warning("session abort: \(ab.reason, privacy: .public)")
                    throw ConnectionError.closed
                default:
                    throw ProtocolError.unexpectedType(frame.type)
                }
            }
            logger.info("handshake done, session \(sessionID)")

            let files = resources.map { r -> FileEntry in
                FileEntry(
                    file_id: r.id,
                    asset_id: r.assetID,
                    kind: r.kind.rawValue,
                    size: r.size,
                    sha256: hashes[r.id] ?? "",
                    created_at: r.createdAt,
                    modified_at: r.modifiedAt,
                    filename: r.filename
                )
            }
            guard !files.isEmpty else {
                status = .completed
                summary = "Nothing to transfer"
                conn.close()
                return
            }
            filesTotal = files.count
            bytesTotal = files.reduce(0) { $0 + $1.size }

            try await conn.send(type: .sessionManifest, json: SessionManifest(files: files))
            let stateFrame = try await conn.next(.fileState)
            let state = try decode(FileState.self, stateFrame)
            let stateByID = Dictionary(uniqueKeysWithValues: state.files.map { ($0.file_id, $0) })
            let resourcesByID = Dictionary(uniqueKeysWithValues: resources.map { ($0.id, $0) })

            status = .transferring
            var failedFiles = 0
            for entry in files {
                guard let resource = resourcesByID[entry.file_id] else { continue }
                let st = stateByID[entry.file_id]
                let start: UInt64
                switch st?.status ?? .new {
                case .verified, .dedup:
                    filesDone += 1
                    bytesDone += entry.size
                    continue
                case .partial:
                    start = st?.offset ?? 0
                case .new:
                    start = 0
                }

                let ok = try await transferFile(entry, resource: resource, startOffset: start, conn: conn)
                if ok {
                    filesDone += 1
                    bytesDone += entry.size
                    store.checkpoint(entry.file_id, assetID: entry.asset_id, kind: entry.kind,
                                     size: entry.size, sha256: entry.sha256, modifiedAt: entry.modified_at,
                                     offset: entry.size, status: .verified)
                } else {
                    failedFiles += 1
                }
            }

            try await conn.send(type: .sessionEnd, json: SessionEnd(
                files_total: UInt64(files.count),
                bytes_total: bytesTotal,
                files_done: UInt64(filesDone),
                bytes_done: bytesDone
            ))
            // receiver answers SESSION_ABORT{reason:"session_end"} then closes
            _ = try? await conn.next(.sessionAbort)
            conn.close()

            store.lastBackup = Date()
            status = .completed
            summary = failedFiles == 0
                ? "\(filesDone) files, \(ByteCount.string(bytesDone)) transferred"
                : "\(filesDone) files done, \(failedFiles) failed"
            logger.info("session complete: \(self.summary ?? "")")
        } catch {
            errorMessage = error.localizedDescription
            status = .failed
            logger.error("session error: \(error.localizedDescription)")
            connection?.close()
            connection = nil
        }
    }

    // MARK: - File transfer

    private struct SentChunk {
        let offset: UInt64
        let data: Data
    }

    private func transferFile(_ entry: FileEntry, resource: PhotoResource, startOffset: UInt64,
                              conn: DeviceConnection) async throws -> Bool {
        currentFilename = entry.filename
        currentSize = entry.size
        currentProgress = startOffset
        logger.info("file \(entry.filename) from offset \(startOffset)")

        let streamer = PhotoStreamer(resource: resource.phResource)
        defer { streamer.cancel() }

        var hasher = IncrementalHasher()
        var wire = Data()
        var streamDone = false
        var sentOffset = startOffset
        var ackedOffset = startOffset
        var inFlight: [SentChunk] = []
        var chunkRetries = 0
        var lastFrame = Date()
        var fileDoneSent = false
        var finalHash = ""

        let stream = streamer.stream()
        var iterator = stream.makeAsyncIterator()

        func nextChunk() async throws -> Data? {
            // accumulate stream bytes into 1 MiB wire chunks
            while wire.count < ProtocolConstants.chunkSize, !streamDone {
                if let piece = try await iterator.next() {
                    hasher.update(piece)
                    wire.append(piece)
                } else {
                    streamDone = true
                }
            }
            if wire.isEmpty { return nil }
            let chunk = wire
            wire = Data()
            return chunk
        }

        func sendChunk(_ chunk: Data, at offset: UInt64) async throws {
            let header = ChunkHeader(
                file_id: entry.file_id,
                offset: offset,
                crc32: Hash.crc32(chunk),
                size: offset == 0 ? entry.size : nil
            )
            try await conn.send(Codec.encode(type: .chunk, payload: Codec.chunkPayload(header: header, data: chunk)))
            inFlight.append(SentChunk(offset: offset, data: chunk))
            sentOffset = offset + UInt64(chunk.count)
        }

        while true {
            if Date().timeIntervalSince(lastFrame) > 60 {
                throw ConnectionError.timeOut
            }
            if !fileDoneSent {
                // keep the window full
                while inFlight.count < ProtocolConstants.window {
                    guard let chunk = try await nextChunk() else { break }
                    try await sendChunk(chunk, at: sentOffset)
                }
                if inFlight.isEmpty, streamDone {
                    // everything sent and acked: finish the file
                    // FILE_DONE carries the FULL-file hash; when resuming we
                    // didn't read the first bytes, so use the precomputed
                    // cache hash (present by construction when startOffset>0).
                    let done = hasher.finish()
                    if startOffset == 0 {
                        finalHash = done.sha256Hex
                    } else {
                        guard !entry.sha256.isEmpty else {
                            logger.error("resume without precomputed hash for \(entry.filename)")
                            return false
                        }
                        finalHash = entry.sha256
                    }
                    try await conn.send(type: .fileDone, json: FileDone(file_id: entry.file_id, sha256: finalHash))
                    fileDoneSent = true
                    continue
                }
            }
            let frame = try await conn.next()
            lastFrame = Date()
            switch frame.type {
            case .ack:
                let ack = try decode(Ack.self, frame)
                guard ack.file_id == entry.file_id else { throw ConnectionError.closed }
                inFlight = []
                chunkRetries = 0
                ackedOffset = ack.offset
                currentProgress = ackedOffset
                store.setOffset(entry.file_id, offset: ackedOffset, status: .transferring)

            case .nak:
                let nak = try decode(Nak.self, frame)
                guard nak.file_id == entry.file_id else { throw ConnectionError.closed }
                guard let idx = inFlight.firstIndex(where: { $0.offset == nak.offset }) else {
                    throw ConnectionError.closed // NAK for a chunk we don't hold: resync via new session
                }
                inFlight = Array(inFlight[idx...])
                sentOffset = nak.offset
                chunkRetries += 1
                if chunkRetries > 3 {
                    logger.error("NAK retries exhausted for \(entry.filename)")
                    return false
                }
                try await sendChunk(inFlight.removeFirst().data, at: nak.offset)

            case .fileFailed:
                let failed = try decode(FileFailed.self, frame)
                guard failed.file_id == entry.file_id else { throw ConnectionError.closed }
                let attempts = store.bumpAttempts(entry.file_id)
                if failed.reason == "hash_mismatch", attempts < 3 {
                    // receiver reset the file; re-stream from byte 0
                    logger.warn("hash mismatch (attempt \(attempts)); restarting \(entry.filename)")
                    return try await transferFile(entry, resource: resource, startOffset: 0, conn: conn)
                }
                logger.error("file failed: \(failed.reason) (attempt \(failed.attempt))")
                return false

            case .fileVerified:
                let v = try decode(FileVerified.self, frame)
                guard v.file_id == entry.file_id else { throw ConnectionError.closed }
                if !v.sha256.isEmpty {
                    store.storeHash(entry.file_id, modifiedAt: entry.modified_at, hash: v.sha256)
                }
                currentProgress = entry.size
                logger.info("verified \(entry.filename)")
                return true

            case .sessionAbort:
                throw ConnectionError.closed

            default:
                break // PING/PONG handled inside the connection
            }
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, _ frame: Frame) throws -> T {
        try JSONDecoder.pb.decode(type, from: frame.payload)
    }
}

public enum ByteCount {
    public static func string(_ n: UInt64) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(n), countStyle: .file)
    }
}