use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Pending,
    Transferring,
    Verified,
    Dedup,
    Failed,
}

impl FileStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Transferring => "transferring",
            Self::Verified => "verified",
            Self::Dedup => "dedup",
            Self::Failed => "failed",
        }
    }
    pub fn from_str(s: &str) -> Self {
        match s {
            "pending" => Self::Pending,
            "transferring" => Self::Transferring,
            "verified" => Self::Verified,
            "dedup" => Self::Dedup,
            _ => Self::Failed,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FileRecord {
    pub file_id: String,
    pub device_id: String,
    pub session_id: String,
    pub kind: String,
    pub original_size: u64,
    pub sha256: Option<String>,
    pub status: FileStatus,
    pub progress: u64,
    pub received_path: Option<String>,
    pub created_at: i64,
    pub modified_at: i64,
    pub filename: String,
    pub attempts: u32,
    pub last_error: Option<String>,
    pub verified_at: Option<i64>,
    pub dedup_of: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionRecord {
    pub session_id: String,
    pub device_id: String,
    pub mode: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub status: String,
    pub files_total: u64,
    pub bytes_total: u64,
    pub files_done: u64,
    pub bytes_done: u64,
}

#[derive(Debug, Clone)]
pub struct ManifestDb {
    conn: Arc<Mutex<Connection>>,
}

impl ManifestDb {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS files (
              file_id       TEXT PRIMARY KEY,
              device_id     TEXT NOT NULL,
              session_id    TEXT,
              kind          TEXT,
              original_size INTEGER NOT NULL,
              sha256        TEXT,
              status        TEXT NOT NULL DEFAULT 'pending',
              progress      INTEGER NOT NULL DEFAULT 0,
              received_path TEXT,
              created_at    INTEGER,
              modified_at   INTEGER,
              filename      TEXT,
              attempts      INTEGER NOT NULL DEFAULT 0,
              last_error    TEXT,
              verified_at   INTEGER,
              dedup_of      TEXT
            );
            -- dedup rows repeat an existing hash by design, so exclude them
            DROP INDEX IF EXISTS idx_files_hash;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_files_hash ON files(sha256) WHERE sha256 IS NOT NULL AND dedup_of IS NULL;

            CREATE TABLE IF NOT EXISTS sessions (
              session_id   TEXT PRIMARY KEY,
              device_id    TEXT,
              mode         TEXT,
              started_at   INTEGER,
              finished_at  INTEGER,
              status       TEXT,
              files_total  INTEGER DEFAULT 0,
              bytes_total  INTEGER DEFAULT 0,
              files_done   INTEGER DEFAULT 0,
              bytes_done   INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS backup_checkpoints (
              device_id        TEXT PRIMARY KEY,
              last_backup_ts   INTEGER
            );

            CREATE TABLE IF NOT EXISTS paired_devices (
              device_id   TEXT PRIMARY KEY,
              name        TEXT,
              pin_hash    TEXT NOT NULL,
              salt        TEXT NOT NULL,
              paired_at   INTEGER,
              strikes     INTEGER NOT NULL DEFAULT 0,
              locked_until INTEGER
            );
            "#,
        )?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("manifest lock poisoned")
    }

    // ----- files -----

    pub fn upsert_file(&self, r: &FileRecord) -> rusqlite::Result<()> {
        self.lock().execute(
            r#"INSERT INTO files (file_id, device_id, session_id, kind, original_size, sha256,
                 status, progress, received_path, created_at, modified_at, filename, attempts, last_error, dedup_of)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
               ON CONFLICT(file_id) DO UPDATE SET
                 device_id=excluded.device_id, kind=excluded.kind, original_size=excluded.original_size,
                 filename=excluded.filename, created_at=excluded.created_at, modified_at=excluded.modified_at,
                 sha256=excluded.sha256, status=excluded.status, progress=excluded.progress,
                 received_path=excluded.received_path, last_error=excluded.last_error, dedup_of=excluded.dedup_of"#,
            params![r.file_id, r.device_id, r.session_id, r.kind, r.original_size, r.sha256,
                    r.status.as_str(), r.progress, r.received_path, r.created_at, r.modified_at,
                    r.filename, r.attempts, r.last_error, r.dedup_of],
        )?;
        Ok(())
    }

    pub fn get_file(&self, file_id: &str) -> rusqlite::Result<Option<FileRecord>> {
        self.lock()
            .query_row(
                r#"SELECT file_id, device_id, COALESCE(session_id,''), kind, original_size, sha256,
                          status, progress, received_path, COALESCE(created_at,0), COALESCE(modified_at,0),
                          COALESCE(filename,''), attempts, last_error, verified_at, dedup_of
                   FROM files WHERE file_id = ?1"#,
                [file_id],
                |row| {
                    Ok(FileRecord {
                        file_id: row.get(0)?,
                        device_id: row.get(1)?,
                        session_id: row.get(2)?,
                        kind: row.get(3)?,
                        original_size: row.get(4)?,
                        sha256: row.get(5)?,
                        status: FileStatus::from_str(&row.get::<_, String>(6)?),
                        progress: row.get(7)?,
                        received_path: row.get(8)?,
                        created_at: row.get(9)?,
                        modified_at: row.get(10)?,
                        filename: row.get(11)?,
                        attempts: row.get(12)?,
                        last_error: row.get(13)?,
                        verified_at: row.get(14)?,
                        dedup_of: row.get(15)?,
                    })
                },
            )
            .optional()
    }

    pub fn find_verified_by_hash(&self, sha256: &str) -> rusqlite::Result<Option<(String, String)>> {
        // (received_path, file_id) of a verified file with this hash
        self.lock()
            .query_row(
                "SELECT received_path, file_id FROM files WHERE sha256 = ?1 AND status = 'verified' LIMIT 1",
                [sha256],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
    }

    pub fn set_status(&self, file_id: &str, status: FileStatus, progress: u64, last_error: Option<&str>) -> rusqlite::Result<()> {
        self.lock().execute(
            "UPDATE files SET status=?2, progress=?3, last_error=?4 WHERE file_id=?1",
            params![file_id, status.as_str(), progress, last_error],
        )?;
        Ok(())
    }

    pub fn record_verified(&self, file_id: &str, sha256: &str, path: &str, dedup_of: Option<&str>) -> rusqlite::Result<()> {
        self.lock().execute(
            "UPDATE files SET status='verified', sha256=?2, received_path=?3, verified_at=?4, progress=original_size, dedup_of=?5, last_error=NULL WHERE file_id=?1",
            params![file_id, sha256, path, chrono::Utc::now().timestamp_millis(), dedup_of],
        )?;
        Ok(())
    }

    pub fn bump_attempt(&self, file_id: &str) -> rusqlite::Result<u32> {
        let c = self.lock();
        c.execute("UPDATE files SET attempts = attempts + 1 WHERE file_id=?1", [file_id])?;
        Ok(c.query_row("SELECT attempts FROM files WHERE file_id=?1", [file_id], |r| r.get(0))?)
    }

    pub fn list_files(&self, session_id: &str) -> rusqlite::Result<Vec<FileRecord>> {
        let conn = self.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT file_id, device_id, session_id, kind, original_size, sha256, status, progress,
                          received_path, created_at, modified_at, filename, attempts, last_error, verified_at, dedup_of
                   FROM files WHERE session_id=?1 ORDER BY rowid"#,
            )?;
        let rows = stmt.query_map([session_id], |row| {
            Ok(FileRecord {
                file_id: row.get(0)?,
                device_id: row.get(1)?,
                session_id: row.get(2)?,
                kind: row.get(3)?,
                original_size: row.get(4)?,
                sha256: row.get(5)?,
                status: FileStatus::from_str(&row.get::<_, String>(6)?),
                progress: row.get(7)?,
                received_path: row.get(8)?,
                created_at: row.get(9)?,
                modified_at: row.get(10)?,
                filename: row.get(11)?,
                attempts: row.get(12)?,
                last_error: row.get(13)?,
                verified_at: row.get(14)?,
                dedup_of: row.get(15)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ----- sessions -----

    pub fn create_session(&self, s: &SessionRecord) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO sessions (session_id, device_id, mode, started_at, status, files_total, bytes_total) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![s.session_id, s.device_id, s.mode, s.started_at, s.status, s.files_total, s.bytes_total],
        )?;
        Ok(())
    }

    pub fn update_session_progress(&self, session_id: &str, files_done: u64, bytes_done: u64) -> rusqlite::Result<()> {
        self.lock().execute(
            "UPDATE sessions SET files_done=?2, bytes_done=?3 WHERE session_id=?1",
            params![session_id, files_done, bytes_done],
        )?;
        Ok(())
    }

    pub fn finish_session(&self, session_id: &str, status: &str) -> rusqlite::Result<()> {
        self.lock().execute(
            "UPDATE sessions SET status=?2, finished_at=?3 WHERE session_id=?1",
            params![session_id, status, chrono::Utc::now().timestamp_millis()],
        )?;
        Ok(())
    }

    pub fn get_session(&self, session_id: &str) -> rusqlite::Result<Option<SessionRecord>> {
        self.lock()
            .query_row(
                "SELECT session_id, COALESCE(device_id,''), COALESCE(mode,''), COALESCE(started_at,0), finished_at, COALESCE(status,''), COALESCE(files_total,0), COALESCE(bytes_total,0), COALESCE(files_done,0), COALESCE(bytes_done,0) FROM sessions WHERE session_id=?1",
                [session_id],
                |row| {
                    Ok(SessionRecord {
                        session_id: row.get(0)?,
                        device_id: row.get(1)?,
                        mode: row.get(2)?,
                        started_at: row.get(3)?,
                        finished_at: row.get(4)?,
                        status: row.get(5)?,
                        files_total: row.get(6)?,
                        bytes_total: row.get(7)?,
                        files_done: row.get(8)?,
                        bytes_done: row.get(9)?,
                    })
                },
            )
            .optional()
    }

    pub fn recent_sessions(&self, limit: u32) -> rusqlite::Result<Vec<SessionRecord>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT session_id, COALESCE(device_id,''), COALESCE(mode,''), COALESCE(started_at,0), finished_at, COALESCE(status,''), COALESCE(files_total,0), COALESCE(bytes_total,0), COALESCE(files_done,0), COALESCE(bytes_done,0) FROM sessions ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok(SessionRecord {
                session_id: row.get(0)?,
                device_id: row.get(1)?,
                mode: row.get(2)?,
                started_at: row.get(3)?,
                finished_at: row.get(4)?,
                status: row.get(5)?,
                files_total: row.get(6)?,
                bytes_total: row.get(7)?,
                files_done: row.get(8)?,
                bytes_done: row.get(9)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    // ----- backup checkpoint -----

    pub fn get_checkpoint(&self, device_id: &str) -> rusqlite::Result<Option<i64>> {
        self.lock()
            .query_row("SELECT last_backup_ts FROM backup_checkpoints WHERE device_id=?1", [device_id], |r| r.get(0))
            .optional()
    }

    pub fn set_checkpoint(&self, device_id: &str, ts: i64) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO backup_checkpoints (device_id, last_backup_ts) VALUES (?1,?2)
             ON CONFLICT(device_id) DO UPDATE SET last_backup_ts=excluded.last_backup_ts",
            params![device_id, ts],
        )?;
        Ok(())
    }

    // ----- pairing -----

    pub fn get_paired_device(&self, device_id: &str) -> rusqlite::Result<Option<(String, String, i64, u32, i64)>> {
        // (pin_hash, salt, paired_at, strikes, locked_until) — only for actually paired devices
        self.lock()
            .query_row(
                "SELECT pin_hash, salt, COALESCE(paired_at,0), strikes, COALESCE(locked_until,0) FROM paired_devices WHERE device_id=?1 AND paired_at > 0",
                [device_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .optional()
    }

    pub fn set_paired(&self, device_id: &str, name: &str, pin_hash: &str, salt: &str) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO paired_devices (device_id, name, pin_hash, salt, paired_at, strikes, locked_until) VALUES (?1,?2,?3,?4,?5,0,0)
             ON CONFLICT(device_id) DO UPDATE SET name=excluded.name, pin_hash=excluded.pin_hash, salt=excluded.salt, paired_at=excluded.paired_at, strikes=0, locked_until=0",
            params![device_id, name, pin_hash, salt, chrono::Utc::now().timestamp_millis()],
        )?;
        Ok(())
    }

    pub fn register_strike(&self, device_id: &str) -> rusqlite::Result<u32> {
        let c = self.lock();
        c.execute(
            "INSERT INTO paired_devices (device_id, name, pin_hash, salt, paired_at, strikes, locked_until)
             VALUES (?1, '', '', '', 0, 1, 0)
             ON CONFLICT(device_id) DO UPDATE SET strikes = paired_devices.strikes + 1",
            [device_id],
        )?;
        let strikes: u32 = c.query_row("SELECT strikes FROM paired_devices WHERE device_id=?1", [device_id], |r| r.get(0))?;
        if strikes >= 5 {
            c.execute(
                "UPDATE paired_devices SET locked_until=?2, strikes=0 WHERE device_id=?1",
                params![device_id, chrono::Utc::now().timestamp_millis() + 60_000],
            )?;
        }
        Ok(strikes)
    }

    pub fn clear_strikes(&self, device_id: &str) -> rusqlite::Result<()> {
        self.lock().execute("UPDATE paired_devices SET strikes=0, locked_until=0 WHERE device_id=?1", [device_id])?;
        Ok(())
    }

    pub fn is_locked(&self, device_id: &str) -> rusqlite::Result<Option<i64>> {
        let (_, _, _, _, locked_until) = match self.get_paired_device(device_id)? {
            Some(d) => d,
            None => return Ok(None),
        };
        Ok(if locked_until > chrono::Utc::now().timestamp_millis() { Some(locked_until) } else { None })
    }
}