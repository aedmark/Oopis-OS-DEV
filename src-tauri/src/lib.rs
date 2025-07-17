// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let context = tauri::generate_context!();
  tauri::Builder::default()
    .setup(|app| {
      // Get the directory where the .exe is running
      let exe_path = app.path()
        .executable_dir()
        .expect("failed to get executable dir");

      // Define our portable data folder path
      let data_dir = exe_path.join("OopisOS_Data");

      // Manually create the window using the public builder API
      tauri::window::WindowBuilder::new(app.handle(), "main", tauri::WebviewUrl::App("index.html".into()))
        .title("OopisOS")
        .user_data_path(data_dir)
        .build()
        .expect("Failed to create portable window");

      Ok(())
    })
    .run(context)
    .expect("error while running tauri application");
}