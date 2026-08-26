use crate::logging::Logger;
use crate::manifest::{FileRecord, ManifestDb, SessionRecord};
use crate::manifest::FileStatus as DbStatus;
use crate::pairing::{hash_pin, new_salt, now_ms, PinChallenges};
use crate::protocol::*;
use crate::verify::{crc32, hex_eq, sha256_file};
use serde::Serialize;
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpStream;
use tokio::task::spawn_blocking;

pub const MAX_FILE_ATTEMPTS: u32 = 3;

impl From<rusqlite::Error> for CodecError {
    fn from(e: rusqlite::Error) -> Self {
        CodecError::Db(e.to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum EngineEvent {
    Session { session_id: String, status: String, files_total: u64, bytes_total: u64, files_done: u64, bytes_done: u64, speed_bps: u64 },
    File { file_id: String, status: String, progress: u64, size: u64, filename: String },
    Log { level: String, message: String },
    Pin { pin: String },
}

#[derive(Clone)]
pub struct TransferEngine {
    pub db: ManifestDb,
    pub logger: Logger,
    pub events: tokio::sync::broadcast::Sender<EngineEvent>,
    pub storage_dir: Arc<Mutex<PathBuf>>,
    pub challenges: Arc<PinChallenges>,
}

/// Write `data` to `file` at `offset`. Synchronous; called via spawn_blocking.
fn write_at(path: &Path, offset: u64, data: &[u8]) -> std::io::Result<()> {
    let mut f = std::fs::OpenOptions::new().create(true).write(true).open(path)?;
    f.seek(SeekFrom::Start(offset))?;
    f.write_all(data)?;
    Ok(())
}

fn truncate_to(path: &Path, len: u64) -> std::io::Result<()> {
    let f = std::fs::OpenOptions::new().create(true).write(true).open(path)?;
    f.set_len(len)?;
    Ok(())
}

fn fsync(path: &Path) -> std::io::Result<()> {
    let f = std::fs::File::open(path)?;
    f.sync_all()?;
    Ok(())
}

fn unique_final_path(dir: &Path, filename: &str) -> PathBuf {
    let mut p = dir.join(filename);
    let mut i = 1;
    while p.exists() {
        let stem = Path::new(filename).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
        let ext = Path::new(filename).extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        p = dir.join(format!("{} ({}).{}", stem, i, ext.trim_start_matches('.')));
        i += 1;
    }
    p
}

impl TransferEngine {
    /// Handle one TCP connection for the full session lifecycle.
    pub async fn run_session(
        &self,
        stream: TcpStream,
        device_name_hint: String,
    ) {
        let logger = &self.logger;
        let peer = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
        logger.info("engine", format!("connection from {peer}"));

        let result = self.session_inner(stream, &device_name_hint).await;
        match result {
            Ok(()) => logger.info("engine", "session ended cleanly"),
            Err(e) => logger.warn("engine", format!("session error: {e}")),
        }
    }

    async fn session_inner(&self, mut stream: TcpStream, _hint: &str) -> Result<(), CodecError> {
        let (mut rd, mut wr) = stream.split();

        // 1. HELLO
        let hello: Hello = match read_json(&mut rd, MsgType::Hello).await? {
            Some(h) => h,
            None => return Err(CodecError::UnknownType(0)),
        };
        if hello.proto_ver != 1 {
            self.logger.warn("engine", format!("unsupported protocol version {}", hello.proto_ver));
            return Ok(());
        }
        let device_id = hello.device_id.clone();
        self.logger.info("engine", format!("HELLO from {} ({})", hello.device_name, device_id));

        // 2. Pairing
        if let Some(locked_until) = self.db.is_locked(&device_id)? {
            let wait = locked_until - now_ms();
            self.logger.warn("engine", format!("device {device_id} locked for {wait} ms"));
            return Ok(());
        }
        let paired = self.db.get_paired_device(&device_id)?.is_some();
        if !paired {
            // PIN challenge loop
            let (challenge_id, pin, _expires) = self.challenges.issue();
            self.logger.info("engine", "PIN challenge issued (shown in UI)");
            self.events.send(EngineEvent::Pin { pin: pin.clone() }).ok();
            write_json(&mut wr, MsgType::PinChallenge, &PinChallenge { challenge_id: challenge_id.clone(), expires_at: now_ms() + 600_000 }).await?;
            let strikes: u32;
            loop {
                let verify: PinVerify = match read_json(&mut rd, MsgType::PinVerify).await? {
                    Some(v) => v,
                    None => return Ok(()),
                };
                match self.challenges.verify(&verify.challenge_id, &verify.pin) {
                    Ok(true) => {
                        let salt = new_salt();
                        let ph = hash_pin(&pin, &salt);
                        self.db.set_paired(&device_id, &hello.device_name, &ph, &salt)?;
                        self.db.clear_strikes(&device_id)?;
                        write_json(&mut wr, MsgType::PinOk, &serde_json::json!({"paired": true})).await?;
                        self.logger.info("engine", format!("device {device_id} paired"));
                        break;
                    }
                    Ok(false) => {
                        let strikes_now = self.db.register_strike(&device_id)?;
                        strikes = strikes_now;
                        write_json(&mut wr, MsgType::PinFail, &PinFail { strikes_left: 5u32.saturating_sub(strikes) }).await?;
                        self.logger.warn("engine", format!("wrong PIN from {device_id} (strike {strikes})"));
                        if strikes >= 5 {
                            self.logger.warn("engine", format!("device {device_id} locked for 60 s"));
                        }
                        return Ok(()); // single-use challenge: close, client reconnects for a fresh one
                    }
                    Err(()) => {
                        self.logger.warn("engine", "stale or unknown challenge");
                        return Ok(());
                    }
                }
            }
        }
        let session_id = uuid::Uuid::new_v4().to_string();
        write_json(&mut wr, MsgType::HelloAck, &HelloAck { session_id: session_id.clone(), paired: true }).await?;
        self.logger.info("engine", format!("session {session_id} started for {device_id}"));

        // 3. SESSION_MANIFEST
        let manifest: SessionManifest = match read_json(&mut rd, MsgType::SessionManifest).await? {
            Some(m) => m,
            None => return Ok(()),
        };
        let mut files_total: u64 = 0;
        let mut bytes_total: u64 = 0;
        {
            let db = &self.db;
            let mut states: Vec<FileStateItem> = Vec::with_capacity(manifest.files.len());
            for f in &manifest.files {
                files_total += 1;
                bytes_total += f.size;
                let existing = db.get_file(&f.file_id)?;
                let status: DbStatus;
                let offset: u64;
                match existing {
                    Some(rec) if rec.status == DbStatus::Verified => {
                        status = DbStatus::Verified;
                        offset = f.size;
                    }
                    _ => {
                        // resume: an interrupted file continues from its acked offset
                        if let Some(rec) = &existing {
                            if rec.progress > 0 && rec.status != DbStatus::Failed {
                                offset = rec.progress;
                                self.db.set_status(&f.file_id, DbStatus::Transferring, rec.progress, None)?;
                                states.push(FileStateItem { file_id: f.file_id.clone(), status: FileStatus::Partial, offset });
                                continue;
                            }
                        }
                        // dedup by content hash against already-verified files
                        let dedup = if !f.sha256.is_empty() {
                            db.find_verified_by_hash(&f.sha256)?.filter(|(p, _)| Path::new(p).exists())
                        } else {
                            None
                        };
                        if let Some((path, other_file_id)) = dedup {
                            status = DbStatus::Dedup;
                            offset = f.size;
                            let rec = FileRecord {
                                file_id: f.file_id.clone(),
                                device_id: device_id.clone(),
                                session_id: session_id.clone(),
                                kind: f.kind.clone(),
                                original_size: f.size,
                                sha256: if f.sha256.is_empty() { None } else { Some(f.sha256.clone()) },
                                status: DbStatus::Dedup,
                                progress: f.size,
                                received_path: Some(path.clone()),
                                created_at: f.created_at,
                                modified_at: f.modified_at,
                                filename: f.filename.clone(),
                                attempts: 0,
                                last_error: None,
                                verified_at: None,
                                dedup_of: Some(other_file_id.clone()),
                            };
                            db.upsert_file(&rec)?;
                            self.events.send(EngineEvent::File {
                                file_id: f.file_id.clone(), status: "dedup".into(), progress: f.size, size: f.size, filename: f.filename.clone(),
                            }).ok();
                        } else {
                            let rec = FileRecord {
                                file_id: f.file_id.clone(),
                                device_id: device_id.clone(),
                                session_id: session_id.clone(),
                                kind: f.kind.clone(),
                                original_size: f.size,
                                sha256: if f.sha256.is_empty() { None } else { Some(f.sha256.clone()) },
                                status: DbStatus::Pending,
                                progress: 0,
                                received_path: None,
                                created_at: f.created_at,
                                modified_at: f.modified_at,
                                filename: f.filename.clone(),
                                attempts: 0,
                                last_error: None,
                                verified_at: None,
                                dedup_of: None,
                            };
                            db.upsert_file(&rec)?;
                            status = DbStatus::Pending;
                            offset = 0;
                        }
                    }
                }
                states.push(FileStateItem { file_id: f.file_id.clone(), status: wire_status(status), offset });
            }
            self.db
                .create_session(&SessionRecord {
                    session_id: session_id.clone(),
                    device_id: device_id.clone(),
                    mode: "incremental".into(),
                    started_at: now_ms(),
                    finished_at: None,
                    status: "active".into(),
                    files_total,
                    bytes_total,
                    files_done: 0,
                    bytes_done: 0,
                })
                ?;
            write_json(&mut wr, MsgType::FileState, &FileState { files: states }).await?;
        }

        // 4. Transfer loop
        let mut current_file: Option<String> = None;
        let mut expected_offset: u64 = 0;
        let mut current_size: u64 = 0;
        let mut bytes_done: u64 = 0;
        let mut files_done: u64 = 0;
        let started = Instant::now();
        let mut last_event = Instant::now();
        let base_dir = self.storage_dir.lock().unwrap().clone();
        let device_dir = base_dir.join(&device_id);
        std::fs::create_dir_all(&device_dir)?;
        // part files live under a per-device, not per-session, directory so a
        // resumed session can continue the same physical file.
        let part_dir = base_dir.join(".parts").join(&device_id);
        std::fs::create_dir_all(&part_dir)?;

        loop {
            let frame = read_frame(&mut rd).await?;
            match frame.typ {
                MsgType::Chunk => {
                    let (hdr, data) = split_chunk_payload(&frame.payload)?;
                    let is_first = match &current_file {
                        Some(f) => f == &hdr.file_id,
                        None => false,
                    };
                    if !is_first {
                        // starting a new file: either offset 0 or a resume continuation.
                        // Verify sender offset matches our expectation from FILE_STATE.
                        let rec = self.db.get_file(&hdr.file_id)?;
                        let start = rec.as_ref().map(|r| r.progress).unwrap_or(0);
                        if hdr.offset != start {
                            self.logger.warn("engine", format!("file {} expected start {}, got {}", hdr.file_id, start, hdr.offset));
                            return Ok(()); // protocol violation; resume will fix
                        }
                        current_file = Some(hdr.file_id.clone());
                        expected_offset = start;
                        current_size = rec.map(|r| r.original_size).unwrap_or(0);
                        let part = part_dir.join(format!("{}.part", hdr.file_id));
                        if start > 0 {
                            spawn_blocking(move || truncate_to(&part, start)).await.map_err(|e| CodecError::Io(std::io::Error::other(e)))??;
                        }
                        self.db.set_status(&hdr.file_id, DbStatus::Transferring, start, None)?;
                    }
                    if hdr.offset < expected_offset {
                        // duplicate/resend of already-acked bytes: acknowledge idempotently
                        if hdr.offset + data.len() as u64 <= expected_offset {
                            write_json(&mut wr, MsgType::Ack, &Ack { file_id: hdr.file_id.clone(), offset: expected_offset, bytes: data.len() as u64 }).await?;
                            continue;
                        }
                        self.logger.warn("engine", format!("overlapping chunk for {}", hdr.file_id));
                        return Ok(());
                    }
                    if hdr.offset != expected_offset {
                        self.logger.warn("engine", format!("gap: expected {expected_offset}, got {}", hdr.offset));
                        return Ok(());
                    }
                    let actual_crc = crc32(data);
                    if actual_crc != hdr.crc32 {
                        self.logger.warn("engine", format!("CRC mismatch chunk {} at {}", hdr.file_id, hdr.offset));
                        write_json(&mut wr, MsgType::Nak, &Nak { file_id: hdr.file_id.clone(), offset: hdr.offset, reason: "crc_mismatch".into() }).await?;
                        continue;
                    }
                    let part = part_dir.join(format!("{}.part", hdr.file_id));
                    let data_owned = data.to_vec();
                    spawn_blocking(move || write_at(&part, hdr.offset, &data_owned)).await
                            .map_err(|e| CodecError::Io(std::io::Error::other(e)))?
                            .map_err(CodecError::Io)?;
                    expected_offset += data.len() as u64;
                    write_json(&mut wr, MsgType::Ack, &Ack { file_id: hdr.file_id.clone(), offset: expected_offset, bytes: data.len() as u64 }).await?;
                    // persist progress on every ACK so resume is byte-exact
                    {
                        let fid = hdr.file_id.clone();
                        let off = expected_offset;
                        let db2 = self.db.clone();
                        spawn_blocking(move || { let _ = db2.set_status(&fid, DbStatus::Transferring, off, None); }).await.map_err(|e| CodecError::Io(std::io::Error::other(e)))?;
                    }
                    if last_event.elapsed().as_millis() > 500 {
                        let speed = expected_offset as u64 / started.elapsed().as_secs().max(1);
                        self.events.send(EngineEvent::Session {
                            session_id: session_id.clone(), status: "active".into(),
                            files_total, bytes_total, files_done, bytes_done, speed_bps: speed,
                        }).ok();
                        last_event = Instant::now();
                    }
                }
                MsgType::FileDone => {
                    let done: FileDone = serde_json::from_slice(&frame.payload)?;
                    let Some(cur) = &current_file else {
                        return Err(CodecError::UnknownType(0));
                    };
                    if cur != &done.file_id {
                        return Err(CodecError::UnknownType(0));
                    }
                    if expected_offset != current_size {
                        self.logger.warn("engine", format!("FILE_DONE for {} but size mismatch {expected_offset} != {current_size}", done.file_id));
                        return Ok(());
                    }
                    let part = part_dir.join(format!("{}.part", done.file_id));
                    let fid = done.file_id.clone();
                    let rec = self.db.get_file(&fid)?;
                    let filename = rec.as_ref().map(|r| r.filename.clone()).unwrap_or_else(|| fid.clone());
                    let final_name = unique_final_path(&device_dir, &filename);

                    // verify: recompute SHA-256 of the whole part file, compare to sender's
                    let verify_result: Result<String, std::io::Error> = spawn_blocking({
                        let part = part.clone();
                        move || sha256_file(&part)
                    })
                    .await
                    .map_err(|e| CodecError::Io(std::io::Error::other(e)))?;
                    match verify_result {
                        Err(e) => {
                            self.file_failed(&mut wr, &fid, &format!("io: {e}"), rec.as_ref().map(|r| r.attempts).unwrap_or(0) + 1).await?;
                            self.db.set_status(&fid, DbStatus::Failed, expected_offset, Some(&e.to_string()))?;
                            current_file = None;
                            continue;
                        }
                        Ok(hash) => {
                            if !hash.is_empty() && !done.sha256.is_empty() && !hex_eq(&hash, &done.sha256) {
                                let attempts = self.db.bump_attempt(&fid)?;
                                self.logger.file_error("engine", format!("hash mismatch (attempt {attempts})"), &fid);
                                self.file_failed(&mut wr, &fid, "hash_mismatch", attempts).await?;
                                if attempts >= MAX_FILE_ATTEMPTS {
                                    self.db.set_status(&fid, DbStatus::Failed, expected_offset, Some("hash_mismatch"))?;
                                    current_file = None;
                                } else {
                                    // reset for retry from scratch
                                    self.db.set_status(&fid, DbStatus::Pending, 0, None)?;
                                    spawn_blocking(move || truncate_to(&part, 0)).await.map_err(|e| CodecError::Io(std::io::Error::other(e)))??;
                                    current_file = None;
                                }
                                continue;
                            }
                            // verify hash against known dedup candidates: if the part file's
                            // content matches another verified file, link instead of copy
                            let dedup_of = self.db.find_verified_by_hash(&hash)?;
                            let dedup_of = match dedup_of {
                                Some((p, fid2)) if Path::new(&p).exists() && fid2 != fid => Some(fid2),
                                _ => None,
                            };
                            // finalize: fsync part, rename to final path
                            let part = part.clone();
                            let final_path = final_name.clone();
                            let db2 = self.db.clone();
                            let fid2 = fid.clone();
                            let hash2 = hash.clone();
                            let dedup2 = dedup_of.clone();
                            let move_result: Result<(), std::io::Error> = spawn_blocking(move || {
                                fsync(&part)?;
                                if let Some(_d) = &dedup2 {
                                    // keep a copy (or hard link) at final path
                                    match std::fs::hard_link(&part, &final_path) {
                                        Ok(_) => {}
                                        Err(_) => { std::fs::copy(&part, &final_path)?; }
                                    }
                                } else {
                                    std::fs::rename(&part, &final_path)?;
                                }
                                let _ = std::fs::remove_file(&part);
                                let _ = db2.record_verified(&fid2, &hash2, &final_path.to_string_lossy(), dedup2.as_deref());
                                Ok(())
                            })
                            .await
                            .map_err(|e| CodecError::Io(std::io::Error::other(e)))?;
                            match move_result {
                                Ok(()) => {
                                    bytes_done += expected_offset;
                                    files_done += 1;
                                    self.logger.file_info("engine", format!("verified sha256={hash}"), &fid);
                                    write_json(&mut wr, MsgType::FileVerified, &FileVerified { file_id: fid.clone(), sha256: hash, size: expected_offset, dedup_of }).await?;
                                    self.events.send(EngineEvent::File {
                                        file_id: fid, status: "verified".into(), progress: expected_offset, size: expected_offset, filename,
                                    }).ok();
                                }
                                Err(e) => {
                                    self.logger.file_error("engine", format!("finalize failed: {e}"), &fid);
                                    self.db.set_status(&fid, DbStatus::Failed, expected_offset, Some(&e.to_string()))?;
                                    self.file_failed(&mut wr, &fid, &format!("io: {e}"), rec.as_ref().map(|r| r.attempts).unwrap_or(0) + 1).await?;
                                }
                            }
                            current_file = None;
                        }
                    }
                }
                MsgType::Ping => {
                    write_json(&mut wr, MsgType::Pong, &serde_json::json!({})).await?;
                }
                MsgType::SessionEnd => {
                    let end: SessionEnd = serde_json::from_slice(&frame.payload)?;
                    self.db.finish_session(&session_id, "completed")?;
                    self.db.set_checkpoint(&device_id, now_ms())?;
                    self.events.send(EngineEvent::Session {
                        session_id: session_id.clone(), status: "completed".into(),
                        files_total, bytes_total, files_done, bytes_done, speed_bps: 0,
                    }).ok();
                    self.logger.info("engine", format!("session {session_id} completed: {files_done}/{files_total} files, {bytes_done}/{bytes_total} bytes (sender: {}/{})", end.files_done, end.bytes_done));
                    let _ = write_json(&mut wr, MsgType::SessionAbort, &SessionAbort { reason: "session_end".into() }).await;
                    return Ok(());
                }
                MsgType::SessionAbort => {
                    let a: SessionAbort = serde_json::from_slice(&frame.payload)?;
                    self.db.finish_session(&session_id, "aborted")?;
                    self.events.send(EngineEvent::Session {
                        session_id: session_id.clone(), status: "aborted".into(),
                        files_total, bytes_total, files_done, bytes_done, speed_bps: 0,
                    }).ok();
                    self.logger.info("engine", format!("session {session_id} aborted: {}", a.reason));
                    return Ok(());
                }
                other => {
                    self.logger.warn("engine", format!("unexpected message type {other:?}"));
                    return Err(CodecError::UnknownType(other as u8));
                }
            }
        }
    }

    async fn file_failed<W: AsyncWrite + Unpin>(&self, wr: &mut W, file_id: &str, reason: &str, attempt: u32) -> Result<(), CodecError> {
        write_json(wr, MsgType::FileFailed, &FileFailed { file_id: file_id.to_string(), reason: reason.to_string(), attempt }).await
    }
}

fn wire_status(s: DbStatus) -> FileStatus {
    match s {
        DbStatus::Verified => FileStatus::Verified,
        DbStatus::Dedup => FileStatus::Dedup,
        _ => FileStatus::New,
    }
}

async fn read_json<T: serde::de::DeserializeOwned, R: AsyncRead + Unpin>(r: &mut R, expected: MsgType) -> Result<Option<T>, CodecError> {
    let frame = read_frame(r).await?;
    if frame.typ != expected {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&frame.payload)?))
}