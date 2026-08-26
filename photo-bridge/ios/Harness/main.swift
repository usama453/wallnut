import Foundation
import Darwin
func mark(_ s: String) {
    s.withCString { _ = Darwin.write(2, $0, strlen(s)) }
    _ = Darwin.write(2, "\n", 1)
}


// Runtime harness for the dependency-free PhotoBridge modules
// (Protocol, Hash, SessionStore) on the macOS host.

var failures = 0
var passed = 0
func check(_ cond: Bool, _ label: String) {
    if cond {
        passed += 1
        Darwin.write(2, "PASS \(label)\n", 14)
    } else {
        failures += 1
        Darwin.write(2, "FAIL \(label)\n", 15)
    }
}

mark("A:start")
// --- codec roundtrip ---
let hello = Hello(proto_ver: 1, device_id: "iphone-abc", device_name: "Alice iPhone", os: "ios-18.0")
let data = try! Codec.encode(type: .hello, json: hello)
check([UInt8](data.prefix(2)) == [0x50, 0x42], "magic bytes")
check(Int(data.subdata(in: 2..<6).readBE32) == data.count - 7, "BE length")
check(data[6] == MsgType.hello.rawValue, "type byte")
var reader = FrameReader()
reader.append(data)
let frame = try! reader.nextFrame()
check(frame?.type == .hello, "frame type decoded")
check(try! JSONDecoder.pb.decode(Hello.self, from: frame!.payload) == hello, "hello roundtrip")
check(try! reader.nextFrame() == nil, "no extra frame")

mark("B:chunk")
// --- chunk layout ---
let chunk = Data(repeating: 0xAB, count: 1024)
let hdr = ChunkHeader(file_id: "f1", offset: 0, crc32: Hash.crc32(chunk), size: 1024)
let payload = try! Codec.chunkPayload(header: hdr, data: chunk)
check(Int(payload.subdata(in: 0..<4).readBE32) == payload.count - 4 - chunk.count, "chunk header_len prefix")
let split = try! Codec.splitChunk(payload)
if case .payload(let parsed, let pd) = split {
    check(parsed == hdr, "chunk header roundtrip")
    check(pd == chunk, "chunk data roundtrip")
} else {
    check(false, "chunk split type")
}

// --- bad magic / oversize ---
var r2 = FrameReader()
r2.append(Data([0x00, 0x01, 0, 0, 0, 0, 0]))
do { _ = try r2.nextFrame(); check(false, "bad magic rejected") } catch { check(true, "bad magic rejected") }
var r3 = FrameReader()
r3.append(Data([0x50, 0x42, 0x40, 0x00, 0x00, 0x00, 0x00]))
do { _ = try r3.nextFrame(); check(false, "oversize rejected") } catch { check(true, "oversize rejected") }

mark("C:fragmented")
// --- fragmented delivery ---
let a = try! Codec.encode(type: .ping, json: EmptyJSONStub())
let b = try! Codec.encode(type: .ack, json: Ack(file_id: "f", offset: 1048576, bytes: 1048576))
var r4 = FrameReader()
var got: [MsgType] = []
for byte in a + b {
    r4.append(Data([byte]))
    while let f = try? r4.nextFrame() { got.append(f.type) }
}
check(got == [.ping, .ack], "byte-at-a-time framing")

mark("D:vectors")
// --- CRC32 / SHA256 vectors ---
check(Hash.crc32(Data("123456789".utf8)) == 0xCBF43926, "CRC32 check value")
check(Hash.sha256Hex(Data("abc".utf8)) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 check value")

mark("E:incremental")
// --- incremental vs one-shot ---
let big = Data((0..<200_000).map { UInt8($0 % 251) })
var inc = IncrementalHasher()
var i = 0
while i < big.count {
    inc.update(big.subdata(in: i..<min(i + 997, big.count)))
    i += 997
}
let (shaInc, crcInc) = inc.finish()
check(crcInc == Hash.crc32(big), "incremental CRC32")
check(shaInc == Hash.sha256Hex(big), "incremental SHA-256")

mark("F:json")
// --- JSON field names must match Rust serde (snake_case) ---
let helloJSON = try! JSONSerialization.jsonObject(with: data.subdata(in: 7..<data.count)) as! [String: Any]
check(helloJSON["proto_ver"] as? Int == 1, "proto_ver key")
check(helloJSON["device_id"] as? String == "iphone-abc", "device_id key")

mark("G:store")
// --- SessionStore ---
let dbURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.appendingPathComponent("photobridge.sqlite")
try? FileManager.default.removeItem(at: dbURL)
let store = SessionStore()
store.checkpoint("f1", assetID: "a1", kind: "photo", size: 100, sha256: "", modifiedAt: 42, offset: 0, status: .pending)
store.setOffset("f1", offset: 66, status: .transferring)
check(store.offset(for: "f1") == 66, "store offset persist")
check(store.bumpAttempts("f1") == 1, "store attempts")
store.storeHash("f2", modifiedAt: 7, hash: "abc")
check(store.cachedHash(for: "f2", modifiedAt: 7) == "abc", "hash cache hit")
check(store.cachedHash(for: "f2", modifiedAt: 8) == nil, "hash cache miss on modified")
store.lastBackup = Date(timeIntervalSince1970: 1_700_000_000)
check(abs(store.lastBackup!.timeIntervalSince1970 - 1_700_000_000) < 1, "last backup meta")

private struct EmptyJSONStub: Encodable {}
// --- sleep/wake: real loopback network tests ---
import Network

struct PongJSON: Encodable {}
let pongFrame = try! Codec.encode(type: .pong, json: PongJSON())

let pbTestQueue = DispatchQueue(label: "pb.test.server")

final class TestServer {
    let listener: NWListener
    var conn: NWConnection?
    private var pending: [NWConnection] = []
    private var pendingCont: CheckedContinuation<Void, Never>?

    init() throws {
        listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: 0)!)
    }

    private var readyCont: CheckedContinuation<UInt16, Never>?
    private var portResolved: UInt16 = 0

    func start() {
        listener.newConnectionHandler = { c in
            self.conn = c
            c.start(queue: pbTestQueue)
            self.pending.append(c)
            self.pendingCont?.resume()
            self.pendingCont = nil
        }
        listener.stateUpdateHandler = { s in
            Darwin.write(2, "LS: \(s)\n", 10)
            if s == .ready, let p = self.listener.port {
                self.portResolved = p.rawValue
                self.readyCont?.resume(returning: p.rawValue)
                self.readyCont = nil
            }
        }
        listener.start(queue: pbTestQueue)
    }

    /// Port once the listener has bound (reading it earlier yields 0).
    func readyPort() async -> UInt16 {
        if portResolved != 0 { return portResolved }
        return await withCheckedContinuation { (cont: CheckedContinuation<UInt16, Never>) in
            readyCont = cont
        }
    }

    func accept() async -> NWConnection {
        if pending.isEmpty {
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                pendingCont = cont
            }
        }
        return pending.removeFirst()
    }

func servePongs() {
        var reader = FrameReader()
        func loop() {
            conn?.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, done, err in
                if let data, !data.isEmpty {
                    reader.append(data)
                    while let f = try? reader.nextFrame() {
                        if f.type == .ping {
                            Darwin.write(2, "server: PING -> PONG\n", 22)
                            self.conn?.send(content: pongFrame, completion: .contentProcessed { _ in })
                        }
                    }
                }
                if done || err != nil { return }
                loop()
            }
        }
        loop()
    }

    func vanish() {
        conn?.cancel()
        listener.cancel()
    }
}

enum RaceOutcome: Equatable { case done(Bool), timeout }
func race(_ work: @escaping () async -> Bool, _ sec: Double) async -> RaceOutcome {
    let box = ResultBox()
    let workTask = Task {
        let r: RaceOutcome = await work() ? .done(true) : .done(false)
        box.claim(r)
    }
    let timerTask = Task {
        try? await Task.sleep(nanoseconds: UInt64(sec * 1_000_000_000))
        box.claim(.timeout)
    }
    while true {
        if let v = box.value() {
            workTask.cancel()
            timerTask.cancel()
            return v
        }
        try? await Task.sleep(nanoseconds: 50_000_000)
    }
}

final class ResultBox: @unchecked Sendable {
    private let lock = NSLock()
    private var v: RaceOutcome?
    func claim(_ r: RaceOutcome) {
        lock.lock()
        if v == nil { v = r }
        lock.unlock()
    }
    func value() -> RaceOutcome? {
        lock.lock()
        defer { lock.unlock() }
        return v
    }
}

func runNetworkTests() async {
    mark("N1:start")
    // Test 1: liveness probe on a live peer -> true
    do {
        let server = try TestServer()
        server.start()
        mark("N2:listener")
        let port = await server.readyPort()
        let client = DeviceConnection(endpoint: .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!))
        mark("N3:connecting")
        try await client.start()
        let accepted = await server.accept()
        _ = accepted
        server.servePongs()
        mark("N4:probing")
        let outcome = await race({ await client.probeLiveness() }, 15)
        check(outcome == .done(true), "probe live peer -> true")
        client.close()
        server.vanish()
    } catch {
        check(false, "probe live peer setup: \(error)")
    }

    // Test 2: peer vanishes (desktop sleeps) -> next() throws .closed, probe false
    do {
        let server = try TestServer()
        server.start()
        mark("N2:listener")
        let port = await server.readyPort()
        let client = DeviceConnection(endpoint: .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!))
        mark("T2:starting")
        let startOk = await race({ do { try await client.start(); return true } catch { return false } }, 15)
        mark("T2:started=\(startOk)")
        check(startOk == .done(true), "test2 client start")
        let acceptOk = await race({ await server.accept(); return true }, 15)
        mark("T2:accepted=\(acceptOk)")
        check(acceptOk == .done(true), "test2 accept")
        server.servePongs()
        let sendOk = await race({ do { try await client.send(type: MsgType.ping, json: PongJSON()); return true } catch { return false } }, 10)
        mark("T2:sent=\(sendOk)")
        check(sendOk == .done(true), "test2 send")
        server.vanish()  // abrupt close, like a sleeping desktop
        let outcome = await race({
            do {
                _ = try await client.next()
                return false
            } catch {
                return error is ConnectionError
            }
        }, 5)
        check(outcome == .done(true), "next() throws after peer vanish")
        let probe = await race({ await client.probeLiveness() }, 5)
        check(probe == .done(false), "probe dead peer -> false")
        client.close()
    } catch {
        check(false, "peer vanish setup: \(error)")
    }

    // Test 3: clean close() unblocks waiters too
    do {
        let server = try TestServer()
        server.start()
        mark("N2:listener")
        let port = await server.readyPort()
        let client = DeviceConnection(endpoint: .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!))
        try await client.start()
        let accepted = await server.accept()
        _ = accepted
        server.servePongs()
        let outcome = await race({
            do {
                try await client.send(type: MsgType.ping, json: PongJSON())
                client.close()
                _ = try await client.next()
                return false
            } catch {
                return error is ConnectionError
            }
        }, 5)
        check(outcome == .done(true), "next() throws after close()")
        server.vanish()
    } catch {
        check(false, "close setup: \(error)")
    }
}

await runNetworkTests()

Darwin.write(2, failures == 0 ? "ALL PASS\n" : "\(failures) FAILURES\n", 40)
exit(failures == 0 ? 0 : 1)
