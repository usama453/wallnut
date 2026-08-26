import Foundation
import CryptoKit
import os

public enum Hash {
    /// CRC32 (IEEE, as u32) — must match the receiver's crc32fast table.
    public static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFFFFFF
        for byte in data {
            crc = crcTable[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8)
        }
        return crc ^ 0xFFFFFFFF
    }

    public static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    public static let crcTable: [UInt32] = {
        (0..<256).map { n in
            var c = UInt32(n)
            for _ in 0..<8 {
                c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1
            }
            return c
        }
    }()
}

// MARK: - Incremental hasher (streams into SHA-256 and CRC32 while sending)

public struct IncrementalHasher {
    private var sha = SHA256()
    private var crc: UInt32 = 0xFFFFFFFF
    private var crcDone = false

    public init() {}

    public mutating func update(_ data: Data) {
        sha.update(data: data)
        for byte in data {
            crc = Hash.crcTable[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8)
        }
    }

    public mutating func finish() -> (sha256Hex: String, crc32: UInt32) {
        if !crcDone {
            crc = crc ^ 0xFFFFFFFF
            crcDone = true
        }
        return (sha.finalize().map { String(format: "%02x", $0) }.joined(), crc)
    }
}