import XCTest
@testable import PhotoBridge

final class ProtocolTests: XCTestCase {
    func testFrameEncodeDecodeRoundtrip() throws {
        let hello = Hello(proto_ver: 1, device_id: "iphone-abc", device_name: "Alice iPhone", os: "ios-18.0")
        let data = try Codec.encode(type: .hello, json: hello)
        XCTAssertEqual([UInt8](data.prefix(2)), [0x50, 0x42])
        XCTAssertEqual(Int(data.subdata(in: 2..<6).readBE32), data.count - 7)
        XCTAssertEqual(data[6], MsgType.hello.rawValue)

        var reader = FrameReader()
        reader.append(data)
        let frame = try reader.nextFrame()
        XCTAssertEqual(frame?.type, .hello)
        let decoded = try JSONDecoder.pb.decode(Hello.self, from: frame!.payload)
        XCTAssertEqual(decoded, hello)
        XCTAssertNil(try reader.nextFrame())
    }

    func testChunkPayloadLayout() throws {
        let chunk = Data(repeating: 0xAB, count: 1024)
        let hdr = ChunkHeader(file_id: "f1", offset: 0, crc32: Hash.crc32(chunk), size: 1024)
        let payload = try Codec.chunkPayload(header: hdr, data: chunk)
        XCTAssertEqual(Int(payload.subdata(in: 0..<4).readBE32), payload.count - 4 - chunk.count)
        guard case .payload(let parsed, let data) = try Codec.splitChunk(payload) else {
            return XCTFail("expected payload chunk")
        }
        XCTAssertEqual(parsed, hdr)
        XCTAssertEqual(data, chunk)
    }

    func testChunkHeaderCarriesSizeOnlyOnFirstChunk() throws {
        let chunk = Data("x".utf8)
        var hdr = ChunkHeader(file_id: "f", offset: 0, crc32: 0, size: 5)
        var payload = try Codec.chunkPayload(header: hdr, data: chunk)
        let json = try JSONDecoder.pb.decode(ChunkHeader.self, from: payload.subdata(in: 4..<payload.count - 1))
        XCTAssertEqual(json.size, 5)

        hdr.size = nil
        hdr.offset = 5
        payload = try Codec.chunkPayload(header: hdr, data: chunk)
        let json2 = try JSONDecoder.pb.decode(ChunkHeader.self, from: payload.subdata(in: 4..<payload.count - 1))
        XCTAssertNil(json2.size)
    }

    func testBadMagicRejected() {
        var reader = FrameReader()
        reader.append(Data([0x00, 0x01, 0, 0, 0, 0, 0]))
        XCTAssertThrowsError(try reader.nextFrame()) { error in
            guard case ProtocolError.badMagic = error else {
                return XCTFail("expected badMagic, got \(error)")
            }
        }
    }

    func testOversizeRejected() {
        var reader = FrameReader()
        reader.append(Data([0x50, 0x42, 0x40, 0x00, 0x00, 0x00, 0x00]))
        XCTAssertThrowsError(try reader.nextFrame()) { error in
            guard case ProtocolError.oversize = error else {
                return XCTFail("expected oversize, got \(error)")
            }
        }
    }

    func testPartialFrameAccumulates() throws {
        let data = try Codec.encode(type: .ping, json: EmptyJSONStub())
        var reader = FrameReader()
        reader.append(data.prefix(3))
        XCTAssertNil(try reader.nextFrame())
        reader.append(Data(data.dropFirst(3)))
        XCTAssertEqual(try reader.nextFrame()?.type, .ping)
    }

    func testSplitFrameStream() throws {
        let a = try Codec.encode(type: .pong, json: EmptyJSONStub())
        let b = try Codec.encode(type: .ack, json: Ack(file_id: "f", offset: 1048576, bytes: 1048576))
        var reader = FrameReader()
        // feed 3 bytes at a time to exercise buffering
        for byte in a + b {
            reader.append(Data([byte]))
            _ = try? reader.nextFrame()
        }
        var frames: [MsgType] = []
        while let f = try reader.nextFrame() { frames.append(f.type) }
        XCTAssertEqual(frames, [.pong, .ack])
    }
}

private struct EmptyJSONStub: Encodable {}

final class HashTests: XCTestCase {
    func testCRC32KnownVector() {
        // "123456789" → 0xCBF43926 (standard check value)
        XCTAssertEqual(Hash.crc32(Data("123456789".utf8)), 0xCBF43926)
    }

    func testCRC32MatchesIncremental() {
        let data = Data((0..<100_000).map { UInt8($0 % 251) })
        var inc = IncrementalHasher()
        for i in stride(from: 0, to: data.count, by: 997) {
            inc.update(data.subdata(in: i..<min(i + 997, data.count)))
        }
        let (_, crc) = inc.finish()
        XCTAssertEqual(crc, Hash.crc32(data))
    }

    func testSHA256KnownVector() {
        XCTAssertEqual(Hash.sha256Hex(Data("abc".utf8)),
                       "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    func testIncrementalSHA256MatchesOneShot() {
        let data = Data((0..<50_000).map { UInt8($0 % 253) })
        var inc = IncrementalHasher()
        for i in stride(from: 0, to: data.count, by: 1000) {
            inc.update(data.subdata(in: i..<min(i + 1000, data.count)))
        }
        let (hash, _) = inc.finish()
        XCTAssertEqual(hash, Hash.sha256Hex(data))
    }
}

final class StoreTests: XCTestCase {
    func testCheckpointAndHashCache() {
        let store = SessionStore()
        store.checkpoint("f1", assetID: "a1", kind: "photo", size: 100, sha256: "", modifiedAt: 42, offset: 0, status: .pending)
        store.setOffset("f1", offset: 66, status: .transferring)
        XCTAssertEqual(store.offset(for: "f1"), 66)
        XCTAssertEqual(store.attempts(for: "f1"), 0)
        XCTAssertEqual(store.bumpAttempts("f1"), 1)

        store.storeHash("f2", modifiedAt: 7, hash: "abc")
        XCTAssertEqual(store.cachedHash(for: "f2", modifiedAt: 7), "abc")
        XCTAssertNil(store.cachedHash(for: "f2", modifiedAt: 8))

        store.lastBackup = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertNotNil(store.lastBackup)
    }
}