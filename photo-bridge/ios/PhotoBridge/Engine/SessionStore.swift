import Foundation
import SQLite3

/// iOS session-state mirror (TDD §6.3): per-file checkpoint offsets, hash
/// cache, and the last-backup timestamp. The desktop manifest is
/// authoritative; this store only keeps the phone resumable.
public final class SessionStore {
    private var db: OpaquePointer?
    private let logger = PBLog.category("store")

    public enum FileStatus: String {
        case pending, transferring, verified, failed
    }

    public init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let url = dir.appendingPathComponent("photobridge.sqlite")
        if sqlite3_open(url.path, &db) != SQLITE_OK {
            let msg = db.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed"
            logger.error("sqlite open failed: \(msg)")
            db = nil
            return
        }
        exec("""
        CREATE TABLE IF NOT EXISTS files(
          file_id TEXT PRIMARY KEY, asset_id TEXT, kind TEXT, size INTEGER,
          sha256 TEXT, modified_at INTEGER, offset INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS hashes(
          file_id TEXT PRIMARY KEY, modified_at INTEGER, sha256 TEXT
        );
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
        """)
    }

    private func exec(_ sql: String) {
        guard let db else { return }
        var err: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &err) != SQLITE_OK {
            if let err {
                logger.error("sqlite: \(String(cString: err))")
                sqlite3_free(err)
            }
        }
    }

    private func query(_ sql: String) -> [[String: Any?]] {
        guard let db else { return [] }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(stmt) }
        var rows: [[String: Any?]] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            var row: [String: Any?] = [:]
            for i in 0..<sqlite3_column_count(stmt) {
                let name = String(cString: sqlite3_column_name(stmt, i))
                switch sqlite3_column_type(stmt, i) {
                case SQLITE_INTEGER: row[name] = sqlite3_column_int64(stmt, i)
                case SQLITE_TEXT: row[name] = String(cString: sqlite3_column_text(stmt, i))
                default: row[name] = nil
                }
            }
            rows.append(row)
        }
        return rows
    }

    // MARK: checkpoints

    public func checkpoint(_ fileID: String, assetID: String, kind: String, size: UInt64,
                           sha256: String, modifiedAt: Int64, offset: UInt64, status: FileStatus) {
        exec("""
        INSERT INTO files(file_id, asset_id, kind, size, sha256, modified_at, offset, status, attempts)
        VALUES('\(fileID.sqliteEscaped)','\(assetID.sqliteEscaped)','\(kind.sqliteEscaped)',\(size),
               '\(sha256.sqliteEscaped)',\(modifiedAt),\(offset),'\(status.rawValue)',0)
        ON CONFLICT(file_id) DO UPDATE SET
          offset=excluded.offset, status=excluded.status,
          sha256=excluded.sha256, size=excluded.size
        """)
    }

    public func setOffset(_ fileID: String, offset: UInt64, status: FileStatus) {
        exec("UPDATE files SET offset=\(offset), status='\(status.rawValue)' WHERE file_id='\(fileID.sqliteEscaped)'")
    }

    public func offset(for fileID: String) -> UInt64 {
        guard let row = query("SELECT offset FROM files WHERE file_id='\(fileID.sqliteEscaped)'").first,
              let v = row["offset"] as? Int64 else { return 0 }
        return UInt64(v)
    }

    public func attempts(for fileID: String) -> Int {
        guard let row = query("SELECT attempts FROM files WHERE file_id='\(fileID.sqliteEscaped)'").first,
              let v = row["attempts"] as? Int64 else { return 0 }
        return Int(v)
    }

    public func bumpAttempts(_ fileID: String) -> Int {
        exec("UPDATE files SET attempts=attempts+1 WHERE file_id='\(fileID.sqliteEscaped)'")
        return attempts(for: fileID)
    }

    // MARK: hash cache

    public func cachedHash(for fileID: String, modifiedAt: Int64) -> String? {
        guard let row = query("SELECT sha256 FROM hashes WHERE file_id='\(fileID.sqliteEscaped)' AND modified_at=\(modifiedAt)").first,
              let h = row["sha256"] as? String else { return nil }
        return h
    }

    public func storeHash(_ fileID: String, modifiedAt: Int64, hash: String) {
        exec("""
        INSERT INTO hashes(file_id, modified_at, sha256) VALUES('\(fileID.sqliteEscaped)',\(modifiedAt),'\(hash.sqliteEscaped)')
        ON CONFLICT(file_id) DO UPDATE SET modified_at=excluded.modified_at, sha256=excluded.sha256
        """)
    }

    // MARK: meta

    public var lastBackup: Date? {
        get {
            guard let row = query("SELECT value FROM meta WHERE key='last_backup_ms'").first,
                  let v = row["value"] as? String, let ms = Int64(v) else { return nil }
            return Date(timeIntervalSince1970: Double(ms) / 1000.0)
        }
        set {
            let v = newValue.map { String(Int64($0.timeIntervalSince1970 * 1000)) } ?? "0"
            exec("INSERT INTO meta(key,value) VALUES('last_backup_ms','\(v.sqliteEscaped)') ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        }
    }
}

extension String {
    var sqliteEscaped: String {
        replacingOccurrences(of: "'", with: "''")
    }
}