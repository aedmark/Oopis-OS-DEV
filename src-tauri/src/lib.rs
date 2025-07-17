#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::Manager;
use std::path::PathBuf;

// This is the command that will be called from the frontend
#[tauri::command]
fn get_data_dir(app: tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap()
}

fn main() {
    let context = tauri::generate_context!();

    let mut builder = tauri::Builder::default();

    // This section is for portability
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())) {
        let portable_data_dir = exe_dir.join("OopisOS_Data");
        builder = builder.plugin(tauri_plugin_persisted-scope::init(Some(portable_data_dir)));
    }

    builder
        .invoke_handler(tauri::generate_handler![get_data_dir])
        .run(context)
        .expect("error while running tauri application");
}