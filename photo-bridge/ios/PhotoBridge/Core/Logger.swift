import Foundation
import os

/// Structured logging: os.Logger (categories per module) mirrored to a JSONL
/// file so sessions can be exported for debugging.
public final class PBLog {
    public static let shared = PBLog()

    private let fileLock = NSLock()
    private var file: FileHandle?
    private var fileURL: URL?

    private init() {
        if let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            let url = dir.appendingPathComponent("photobridge-logs.jsonl")
            fileURL = url
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            FileManager.default.createFile(atPath: url.path, contents: nil)
            file = try? FileHandle(forWritingTo: url)
        }
    }

    public static func category(_ name: String) -> Logger {
        Logger(subsystem: "com.photobridge.ios", category: name)
    }

    public func log(category: String, level: String, message: String) {
        let entry: [String: Any] = [
            "ts": Date().timeIntervalSince1970,
            "level": level,
            "cat": category,
            "msg": message,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: entry) {
            fileLock.lock()
            defer { fileLock.unlock() }
            file?.seekToEndOfFile()
            file?.write(data)
            file?.write(Data("\n".utf8))
        }
    }

    public func logURL() -> URL? { fileURL }
}