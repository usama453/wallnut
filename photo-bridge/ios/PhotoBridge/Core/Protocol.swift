import Foundation

// Wire protocol mirror of docs/PROTOCOL.md (v1).
// Both this Swift implementation and the Rust receiver MUST pass the
// conformance vectors in conformance/.

public enum MsgType: UInt8, CaseIterable {
    case hello = 0
    case helloAck = 1
    case pinChallenge = 2
    case pinVerify = 3
    case pinOk = 4
    case pinFail = 5
    case sessionManifest = 6
    case fileState = 7
    case chunk = 8
    case ack = 9
    case nak = 10
    case fileDone = 11
    case fileVerified = 12
    case fileFailed = 13
    case sessionEnd = 14
    case sessionAbort = 15
    case ping = 16
    case pong = 17
}

public enum ProtocolError: Error, LocalizedError {
    case badMagic
    case oversize(Int)
    case truncated
    case emptyChunkHeader
    case invalidJSON
    case unexpectedType(MsgType)

    public var errorDescription: String? {
        switch self {
        case .badMagic: return "bad frame magic"
        case .oversize(let n): return "oversize frame: \(n)"
        case .truncated: return "truncated frame"
        case .emptyChunkHeader: return "empty chunk header"
        case .invalidJSON: return "invalid JSON payload"
        case .unexpectedType(let t): return "unexpected frame type \(t.rawValue)"
        }
    }
}

public enum ProtocolConstants {
    public static let maxPayload = 2 * 1024 * 1024
    public static let chunkSize = 1024 * 1024
    public static let window = 4
    public static let serviceType = "_photobridge._tcp"
    public static let port: UInt16 = 8471
}

public struct Frame {
    public let type: MsgType
    public let payload: Data
}

// MARK: - Payload types (JSON on the wire)

public struct Hello: Codable, Equatable {
    public var proto_ver: UInt32
    public var device_id: String
    public var device_name: String
    public var os: String
}

public struct HelloAck: Codable, Equatable {
    public var session_id: String
    public var paired: Bool
}

public struct PinChallenge: Codable, Equatable {
    public var challenge_id: String
    public var expires_at: Int64
}

public struct PinVerify: Codable, Equatable {
    public var challenge_id: String
    public var pin: String
}

public struct PinFail: Codable, Equatable {
    public var strikes_left: UInt32
}

public struct FileEntry: Codable, Equatable {
    public var file_id: String
    public var asset_id: String
    public var kind: String
    public var size: UInt64
    public var sha256: String
    public var created_at: Int64
    public var modified_at: Int64
    public var filename: String
}

public struct SessionManifest: Codable, Equatable {
    public var files: [FileEntry]
}

public enum FileStatus: String, Codable, Equatable {
    case new
    case partial
    case verified
    case dedup
}

public struct FileStateItem: Codable, Equatable {
    public var file_id: String
    public var status: FileStatus
    public var offset: UInt64
}

public struct FileState: Codable, Equatable {
    public var files: [FileStateItem]
}

public struct Ack: Codable, Equatable {
    public var file_id: String
    public var offset: UInt64
    public var bytes: UInt64
}

public struct Nak: Codable, Equatable {
    public var file_id: String
    public var offset: UInt64
    public var reason: String
}

public struct FileDone: Codable, Equatable {
    public var file_id: String
    public var sha256: String
}

public struct FileVerified: Codable, Equatable {
    public var file_id: String
    public var sha256: String
    public var size: UInt64
    public var dedup_of: String?
}

public struct FileFailed: Codable, Equatable {
    public var file_id: String
    public var reason: String
    public var attempt: UInt32
}

public struct SessionEnd: Codable, Equatable {
    public var files_total: UInt64
    public var bytes_total: UInt64
    public var files_done: UInt64
    public var bytes_done: UInt64
}

public struct SessionAbort: Codable, Equatable {
    public var reason: String
}

// Chunk header; first chunk of a file also carries "size" (informational,
// the receiver keys off its own manifest DB).
public struct ChunkHeader: Codable, Equatable {
    public var file_id: String
    public var offset: UInt64
    public var crc32: UInt32
    public var size: UInt64?
}

public enum ChunkData {
    case header(ChunkHeader)
    case payload(ChunkHeader, Data)
}

// MARK: - Framing codec

public enum Codec {
    public static let magic: [UInt8] = [0x50, 0x42]

    /// Frame = magic(2) + u32 BE length(4) + type(1) + payload.
    public static func encode(type: MsgType, payload: Data) throws -> Data {
        guard payload.count <= ProtocolConstants.maxPayload else {
            throw ProtocolError.oversize(payload.count)
        }
        var out = Data(magic)
        out.append(contentsOf: UInt32(payload.count).bytes)
        out.append(type.rawValue)
        out.append(payload)
        return out
    }

    public static func encode<T: Encodable>(type: MsgType, json: T) throws -> Data {
        try encode(type: type, payload: JSONEncoder.encodePB(json))
    }

    /// CHUNK payload: u32 BE header_len + JSON header + raw bytes.
    public static func chunkPayload(header: ChunkHeader, data: Data) throws -> Data {
        let hjson = try JSONEncoder.encodePB(header)
        guard 4 + hjson.count + data.count <= ProtocolConstants.maxPayload else {
            throw ProtocolError.oversize(4 + hjson.count + data.count)
        }
        var out = Data(UInt32(hjson.count).bytes)
        out.append(hjson)
        out.append(data)
        return out
    }

    /// Parse a CHUNK payload into (header, data).
    public static func splitChunk(_ payload: Data) throws -> ChunkData {
        guard payload.count >= 4 else { throw ProtocolError.emptyChunkHeader }
        let hlen = Int(payload.subdata(in: 0..<4).readBE32)
        guard hlen > 0, 4 + hlen <= payload.count else { throw ProtocolError.emptyChunkHeader }
        let hdr = try JSONDecoder.pb.decode(ChunkHeader.self, from: payload.subdata(in: 4..<(4 + hlen)))
        return .payload(hdr, payload.subdata(in: (4 + hlen)..<payload.count))
    }
}

// MARK: - Frame reader (incremental)

/// Buffered frame decoder: feed bytes, get frames.
public struct FrameReader {
    public private(set) var buffer = [UInt8]()
    private let maxFrame: Int = 7 + ProtocolConstants.maxPayload

    public init() {}

    public mutating func append(_ bytes: Data) {
        buffer.append(contentsOf: bytes)
        if buffer.count > maxFrame * 2 { buffer.removeFirst(buffer.count - maxFrame) }
    }

    /// Returns one complete frame if available.
    public mutating func nextFrame() throws -> Frame? {
        guard buffer.count >= 7 else { return nil }
        let magicOK = buffer[0] == Codec.magic[0] && buffer[1] == Codec.magic[1]
        guard magicOK else { throw ProtocolError.badMagic }
        let len = Int(UInt32(buffer[2]) << 24 | UInt32(buffer[3]) << 16 | UInt32(buffer[4]) << 8 | UInt32(buffer[5]))
        guard len <= ProtocolConstants.maxPayload else { throw ProtocolError.oversize(len) }
        guard buffer.count >= 7 + len else { return nil }
        let type = MsgType(rawValue: buffer[6])
        let payload = Data(buffer[7..<(7 + len)])
        buffer.removeFirst(7 + len)
        guard let type else { throw ProtocolError.unexpectedType(.init(rawValue: buffer[6]) ?? .ping) }
        return Frame(type: type, payload: payload)
    }
}

// MARK: - Small helpers

extension UInt32 {
    fileprivate var bytes: [UInt8] {
        [
            UInt8((self >> 24) & 0xFF), UInt8((self >> 16) & 0xFF),
            UInt8((self >> 8) & 0xFF), UInt8(self & 0xFF),
        ]
    }
}

extension Data {
    var readBE32: UInt32 {
        guard count >= 4 else { return 0 }
        return (UInt32(self[0]) << 24) | (UInt32(self[1]) << 16) | (UInt32(self[2]) << 8) | UInt32(self[3])
    }

    var hex: String { map { String(format: "%02x", $0) }.joined() }
}

extension JSONEncoder {
    static let pb: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = []
        return e
    }()

    static func encodePB<T: Encodable>(_ value: T) throws -> Data {
        try pb.encode(value)
    }
}

extension JSONDecoder {
    static let pb = JSONDecoder()
}