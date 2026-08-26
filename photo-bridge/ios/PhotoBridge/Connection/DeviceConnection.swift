import Foundation
import Network

public enum ConnectionError: Error, LocalizedError {
    case notConnected
    case closed
    case timeOut

    public var errorDescription: String? {
        switch self {
        case .notConnected: return "not connected"
        case .closed: return "connection closed"
        case .timeOut: return "timeout"
        }
    }
}

/// Cross-queue state for DeviceConnection. NW receive callbacks run on the
/// connection queue while the heartbeat task, liveness probes and engine
/// calls come from other tasks, so every mutation goes through this lock.
private final class ConnState: @unchecked Sendable {
    let lock = NSLock()

    func sync<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    var closed = false
    var started = false
    var lastActivity = Date()
    var lastPongAt = Date.distantPast
    var missedPongs = 0
    var pendingFrames: [Frame] = []
    var waiters: [(Frame) -> Void] = []
    var heartbeatTask: Task<Void, Never>?
}

/// One framed TCP connection to the receiver. Handles framing
/// (encode/decode), ordered send, and heartbeat PING/PONG while idle.
/// The engine on top drives the session state machine.
public final class DeviceConnection {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "com.photobridge.conn", qos: .userInitiated)
    private var reader = FrameReader()
    private let state = ConnState()
    private let logger = PBLog.category("connection")

    public init(endpoint: NWEndpoint) {
        let params = NWParameters.tcp
        params.includePeerToPeer = true
        connection = NWConnection(to: endpoint, using: params)
    }

    public func start() async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            connection.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    let first = self.state.sync { () -> Bool in
                        let was = self.state.started
                        self.state.started = true
                        return !was
                    }
                    if first { cont.resume() }
                    self.startReceiveLoop()
                    self.startHeartbeat()
                case .failed(let e):
                    let first = self.state.sync { () -> Bool in
                        let was = self.state.started
                        self.state.started = true
                        return !was
                    }
                    if first { cont.resume(throwing: e) }
                case .cancelled:
                    let first = self.state.sync { () -> Bool in
                        let was = self.state.started
                        self.state.started = true
                        return !was
                    }
                    if first { cont.resume(throwing: ConnectionError.closed) }
                default:
                    break
                }
            }
            connection.start(queue: queue)
        }
    }

    /// Send one frame (control or already-framed CHUNK).
    public func send(_ frame: Data) async throws {
        if state.sync({ state.closed }) { throw ConnectionError.closed }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            connection.send(content: frame, completion: .contentProcessed { error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume()
                }
            })
        }
        touch()
    }

    public func send<T: Encodable>(type: MsgType, json: T) async throws {
        try await send(Codec.encode(type: type, json: json))
    }

    /// Next frame of the given type (or any type when nil), in order.
    /// Throws ConnectionError.closed when the connection has failed or been
    /// closed (e.g. the peer went to sleep and the heartbeat timed out), so
    /// the engine never hangs in a waiter.
    public func next(_ type: MsgType? = nil) async throws -> Frame {
        if let f = state.sync({ () -> Frame? in
            if state.closed { return nil }
            if let t = type, let idx = state.pendingFrames.firstIndex(where: { $0.type == t }) {
                return state.pendingFrames.remove(at: idx)
            }
            if type == nil, !state.pendingFrames.isEmpty {
                return state.pendingFrames.removeFirst()
            }
            return nil
        }) {
            return f
        }
        if state.sync({ state.closed }) { throw ConnectionError.closed }
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Frame, Error>) in
            let closedNow = state.sync { () -> Bool in
                if state.closed { return true }
                state.waiters.append { frame in
                    let isClosed = self.state.sync({ self.state.closed })
                    if isClosed {
                        cont.resume(throwing: ConnectionError.closed)
                    } else if let t = type, frame.type != t {
                        cont.resume(throwing: ProtocolError.unexpectedType(frame.type))
                    } else {
                        cont.resume(returning: frame)
                    }
                }
                return false
            }
            if closedNow { cont.resume(throwing: ConnectionError.closed) }
        }
    }

    /// Liveness probe used after wake-from-sleep: PING and wait for PONG.
    /// Returns false (and closes the connection) when the peer does not
    /// answer within 10 seconds.
    public func probeLiveness() async -> Bool {
        if state.sync({ state.closed }) { return false }
        let before = state.sync({ state.lastPongAt })
        guard (try? await send(Codec.encode(type: .ping, json: EmptyJSON()))) != nil else {
            failConnection()
            return false
        }
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline {
            if state.sync({ state.closed }) { return false }
            if state.sync({ state.lastPongAt }) > before { return true }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        logger.warn("liveness probe failed; closing")
        failConnection()
        return false
    }

    public func close() {
        let hb: Task<Void, Never>? = state.sync {
            state.closed = true
            let h = state.heartbeatTask
            state.heartbeatTask = nil
            return h
        }
        hb?.cancel()
        connection.cancel()
    }

    // MARK: - private

    private func touch() {
        state.sync {
            state.lastActivity = Date()
            state.missedPongs = 0
        }
    }

    /// Connection is dead (peer vanished, heartbeat lost, decode error, ...).
    /// Resumes every waiter with ConnectionError.closed so the engine fails
    /// fast instead of hanging forever (e.g. after the desktop slept).
    private func failConnection() {
        let (hb, waiters) = state.sync { () -> (Task<Void, Never>?, [(Frame) -> Void]) in
            guard !state.closed else { return (nil, []) }
            state.closed = true
            let h = state.heartbeatTask
            state.heartbeatTask = nil
            let ws = state.waiters
            state.waiters.removeAll()
            return (h, ws)
        }
        hb?.cancel()
        for w in waiters {
            w(Frame(type: .ping, payload: Data()))
        }
        connection.cancel()
    }

    private func startReceiveLoop() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 7 + ProtocolConstants.maxPayload) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.ingest(data)
            }
            if let error {
                self.logger.error("receive failed: \(error.localizedDescription)")
                self.failConnection()
                return
            }
            if isComplete {
                self.logger.error("connection closed by peer")
                self.failConnection()
                return
            }
            self.continueReceive()
        }
    }

    /// Tail-recursive receive loop (avoids deep stack growth).
    private func continueReceive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 7 + ProtocolConstants.maxPayload) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty { self.ingest(data) }
            if let error {
                self.logger.error("receive failed: \(error.localizedDescription)")
                self.failConnection()
                return
            }
            if isComplete {
                self.logger.error("connection closed by peer")
                self.failConnection()
                return
            }
            self.continueReceive()
        }
    }

    private func ingest(_ bytes: Data) {
        reader.append(bytes)
        do {
            while let frame = try reader.nextFrame() {
                touch()
                if frame.type == .ping {
                    Task { try? await self.send(Codec.encode(type: .pong, json: EmptyJSON())) }
                    continue
                }
                if frame.type == .pong {
                    state.sync {
                        state.missedPongs = 0
                        state.lastPongAt = Date()
                    }
                    continue
                }
                let handled: Bool = state.sync {
                    if !state.waiters.isEmpty {
                        let w = state.waiters.removeFirst()
                        w(frame)
                        return true
                    }
                    state.pendingFrames.append(frame)
                    return false
                }
                _ = handled
            }
        } catch {
            logger.error("frame decode error: \(error.localizedDescription)")
            failConnection()
        }
    }

    private func startHeartbeat() {
        let hb = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                guard let self, !Task.isCancelled else { return }
                let idle = self.state.sync { Date().timeIntervalSince(self.state.lastActivity) }
                if idle > 10 {
                    let lost = self.state.sync { () -> Bool in
                        self.state.missedPongs += 1
                        return self.state.missedPongs >= 3
                    }
                    if lost {
                        self.logger.error("heartbeat lost; closing (resume path)")
                        self.failConnection()
                        return
                    }
                }
                let idleAgain = self.state.sync { Date().timeIntervalSince(self.state.lastActivity) }
                if idleAgain > 15 {
                    Task { try? await self.send(Codec.encode(type: .ping, json: EmptyJSON())) }
                }
            }
        }
        state.sync { state.heartbeatTask = hb }
    }
}

private struct EmptyJSON: Encodable {}