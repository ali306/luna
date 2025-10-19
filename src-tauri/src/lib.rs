use log::info;

mod config;
mod models;
mod process;
mod routes;
mod server;
mod services;
mod state;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(config::LOG_LEVEL)
        .init();

    if std::env::var("ESPEAK_DATA_PATH").is_err() {
        if let Some(path) = services::kokoro::espeak::detect_data_path() {
            info!("Setting ESPEAK_DATA_PATH to: {}", path);
            std::env::set_var("ESPEAK_DATA_PATH", path);
        } else {
            log::warn!("Could not auto-detect espeak-ng data path. TTS may not work correctly.");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(move |_app| {
            info!("Initializing Luna Voice Assistant");
            tauri::async_runtime::spawn(async move {
                info!("Starting Rust backend server...");
                match server::start_server().await {
                    Ok(_) => info!("Backend server stopped"),
                    Err(e) => {
                        log::error!("Backend server error: {}", e);
                        log::error!("Error details: {:?}", e);
                    }
                }
            });

            info!("Application setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
