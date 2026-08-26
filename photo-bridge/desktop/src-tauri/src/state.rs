use crate::engine::{EngineEvent, TransferEngine};
use crate::logging::Logger;
use crate::manifest::ManifestDb;
use crate::pairing::PinChallenges;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};

pub struct AppState {
    pub db: ManifestDb,
    pub logger: Logger,
    pub engine: TransferEngine,
    pub storage_dir: Arc<Mutex<PathBuf>>,
    pub receiver_name: String,
}

#[derive(serde::Serialize)]
pub struct UiFileRow {
    pub file_id: String,
    pub filename: String,
    pub kind: String,
    pub size: u64,
    pub progress: u64,
    pub status: String,
    pub sha256: Option<String>,
    pub attempts: u32,
    pub last_error: Option<String>,
    pub verified_at: Option<i64>,
    pub dedup_of: Option<String>,
}

#[derive(serde::Serialize)]
pub struct UiSessionRow {
    pub session_id: String,
    pub device_id: String,
    pub status: String,
    pub files_total: u64,
    pub bytes_total: u64,
    pub files_done: u64,
    pub bytes_done: u64,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

#[tauri::command]
pub fn get_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let sessions = state
        .db
        .recent_sessions(20)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|s| UiSessionRow {
            session_id: s.session_id,
            device_id: s.device_id,
            status: s.status,
            files_total: s.files_total,
            bytes_total: s.bytes_total,
            files_done: s.files_done,
            bytes_done: s.bytes_done,
            started_at: s.started_at,
            finished_at: s.finished_at,
        })
        .collect::<Vec<_>>();
    let storage = state.storage_dir.lock().unwrap().clone();
    Ok(serde_json::json!({
        "receiver_name": state.receiver_name,
        "storage_dir": storage.to_string_lossy(),
        "storage_set": !storage.as_os_str().is_empty(),
        "sessions": sessions,
    }))
}

#[tauri::command]
pub fn get_files(state: State<'_, AppState>, session_id: String) -> Result<Vec<UiFileRow>, String> {
    let files = state
        .db
        .list_files(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(files
        .into_iter()
        .map(|f| UiFileRow {
            file_id: f.file_id,
            filename: f.filename,
            kind: f.kind,
            size: f.original_size,
            progress: f.progress,
            status: f.status.as_str().to_string(),
            sha256: f.sha256,
            attempts: f.attempts,
            last_error: f.last_error,
            verified_at: f.verified_at,
            dedup_of: f.dedup_of,
        })
        .collect())
}

#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>, n: usize) -> Result<Vec<crate::logging::LogEntry>, String> {
    Ok(state.logger.recent(n).await)
}

#[tauri::command]
pub async fn set_storage_dir(state: State<'_, AppState>, dir: String) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        return Err("not a directory".into());
    }
    crate::logging::ensure_dir(&path).map_err(|e| e.to_string())?;
    {
        let mut sd = state.storage_dir.lock().unwrap();
        *sd = path;
    }
    state.logger.info("state", format!("storage dir set to {dir}"));
    Ok(())
}

#[tauri::command]
pub fn get_receiver_name(state: State<'_, AppState>) -> String {
    state.receiver_name.clone()
}

/// Bridge engine events to the Tauri frontend.
pub fn spawn_event_bridge(app: tauri::AppHandle, engine: &TransferEngine) {
    let mut rx = engine.events.subscribe();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(EngineEvent::Session { session_id, status, files_total, bytes_total, files_done, bytes_done, speed_bps }) => {
                    let _ = app.emit("pb://session", serde_json::json!({
                        "session_id": session_id, "status": status,
                        "files_total": files_total, "bytes_total": bytes_total,
                        "files_done": files_done, "bytes_done": bytes_done, "speed_bps": speed_bps,
                    }));
                }
                Ok(EngineEvent::File { file_id, status, progress, size, filename }) => {
                    let _ = app.emit("pb://file", serde_json::json!({
                        "file_id": file_id, "status": status, "progress": progress, "size": size, "filename": filename,
                    }));
                }
                Ok(EngineEvent::Log { level, message }) => {
                    let _ = app.emit("pb://log", serde_json::json!({ "level": level, "message": message }));
                }
                Ok(EngineEvent::Pin { pin }) => {
                    let _ = app.emit("pb://pin", serde_json::json!({ "pin": pin }));
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

impl AppState {
    pub fn new(db: ManifestDb, logger: Logger, storage_dir: PathBuf, receiver_name: String) -> Self {
        let (events_tx, _) = tokio::sync::broadcast::channel(1024);
        let storage_dir = Arc::new(Mutex::new(storage_dir));
        let engine = TransferEngine {
            db: db.clone(),
            logger: logger.clone(),
            events: events_tx,
            storage_dir: storage_dir.clone(),
            challenges: Arc::new(PinChallenges::new()),
        };
        Self { db, logger, engine, storage_dir, receiver_name }
    }
}