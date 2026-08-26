use chrono::Utc;
use serde::Serialize;
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub ts: i64,
    pub level: Level,
    pub module: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_id: Option<String>,
}

#[derive(Clone)]
pub struct Logger {
    tx: mpsc::UnboundedSender<LogEntry>,
    /// live events for the UI
    live_tx: broadcast::Sender<LogEntry>,
    /// ring buffer for late subscribers
    ring: Arc<Mutex<VecDeque<LogEntry>>>,
}

const RING_CAPACITY: usize = 2000;

impl Logger {
    pub fn new(log_dir: PathBuf) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<LogEntry>();
        let (live_tx, _) = broadcast::channel::<LogEntry>(256);
        let ring = Arc::new(Mutex::new(VecDeque::new()));
        let ring_for_task = ring.clone();
        let live_tx_for_task = live_tx.clone();

        std::thread::spawn(move || {
            let path = log_dir.join("photobridge.jsonl");
            while let Some(entry) = rx.blocking_recv() {
                // rolling: keep 5 files of 10 MB
                if let Ok(meta) = std::fs::metadata(&path) {
                    if meta.len() > 10 * 1024 * 1024 {
                        for i in (1..=4).rev() {
                            let src = log_dir.join(format!("photobridge.{}.jsonl", i - 1));
                            let dst = log_dir.join(format!("photobridge.{}.jsonl", i));
                            if src.exists() {
                                let _ = std::fs::rename(&src, &dst);
                            }
                        }
                        let _ = std::fs::remove_file(&path);
                    }
                }
                if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
                    let _ = writeln!(f, "{}", serde_json::to_string(&entry).unwrap_or_default());
                }
                let _ = live_tx_for_task.send(entry.clone());
                let mut ring = ring_for_task.blocking_lock();
                ring.push_back(entry);
                while ring.len() > RING_CAPACITY {
                    ring.pop_front();
                }
            }
        });

        Self { tx, live_tx, ring }
    }

    fn log(&self, level: Level, module: &str, message: impl Into<String>, file_id: Option<String>) {
        let entry = LogEntry {
            ts: Utc::now().timestamp_millis(),
            level,
            module: module.to_string(),
            message: message.into(),
            file_id,
        };
        let _ = self.tx.send(entry);
    }

    pub fn info(&self, module: &str, msg: impl Into<String>) {
        self.log(Level::Info, module, msg, None);
    }
    pub fn warn(&self, module: &str, msg: impl Into<String>) {
        self.log(Level::Warn, module, msg, None);
    }
    pub fn error(&self, module: &str, msg: impl Into<String>) {
        self.log(Level::Error, module, msg, None);
    }
    pub fn file_info(&self, module: &str, msg: impl Into<String>, file_id: &str) {
        self.log(Level::Info, module, msg, Some(file_id.to_string()));
    }
    pub fn file_error(&self, module: &str, msg: impl Into<String>, file_id: &str) {
        self.log(Level::Error, module, msg, Some(file_id.to_string()));
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LogEntry> {
        self.live_tx.subscribe()
    }

    pub async fn recent(&self, n: usize) -> Vec<LogEntry> {
        let ring = self.ring.lock().await;
        ring.iter().rev().take(n).cloned().collect()
    }
}

/// Small helper for cross-platform path handling.
pub fn sanitize_filename(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            c => c,
        })
        .collect();
    if out.is_empty() {
        out = "unnamed".to_string();
    }
    if out.len() > 180 {
        out = out[..180].to_string();
    }
    out
}

pub fn log_dir_for(app_data: &Path) -> PathBuf {
    app_data.join("logs")
}

pub fn ensure_dir(p: &Path) -> std::io::Result<()> {
    if !p.exists() {
        std::fs::create_dir_all(p)?;
    }
    Ok(())
}