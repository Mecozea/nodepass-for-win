// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn get_app_version() -> String {
    let version = env!("CARGO_PKG_VERSION").to_string();
    #[cfg(debug_assertions)]
    {
        format!("{}-dev", version)
    }
    #[cfg(not(debug_assertions))]
    {
        version
    }
}

fn main() {
    nodepass_gui_lib::run()
}
