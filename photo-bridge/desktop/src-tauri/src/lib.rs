pub mod discovery;
pub mod engine;
pub mod logging;
pub mod manifest;
pub mod pairing;
pub mod protocol;
pub mod server;
pub mod state;
pub mod verify;

use logging::{ensure_dir, log_dir_for, Logger};
use manifest::ManifestDb;
use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("photobridge");
            ensure_dir(&app_data)?;
            ensure_dir(&log_dir_for(&app_data))?;

            let logger = Logger::new(log_dir_for(&app_data));
            let db = ManifestDb::open(&app_data.join("manifest.db"))
                .map_err(|e| format!("manifest db: {e}"))?;
            let receiver_name = hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "PhotoBridge Receiver".to_string());
            let storage_dir = app_data.join("incoming");
            ensure_dir(&storage_dir)?;

            let app_state = state::AppState::new(db, logger, storage_dir, receiver_name);

            let _disc = discovery::Discovery::start(&app_state.receiver_name, &app_state.receiver_name)
                .map_err(|e| format!("mdns: {e}"))?;

            let engine = app_state.engine.clone();
            let logger2 = app_state.logger.clone();
            let _photo_server = server::PhotoServer::spawn(engine, logger2);

            state::spawn_event_bridge(app.handle().clone(), &app_state.engine);

            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            state::get_status,
            state::get_files,
            state::get_logs,
            state::set_storage_dir,
            state::get_receiver_name
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}