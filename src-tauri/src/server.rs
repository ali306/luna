use anyhow::Result;
use axum::{
    routing::{delete, get, post},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::config;
use crate::routes::{
    api::{
        chat_completion, clear_conversation, favicon, health_check, root, transcribe_audio,
        tts_generate,
    },
    websocket::websocket_handler,
};
use crate::state::AppState;

pub async fn start_server() -> Result<()> {
    tracing::info!("Initializing server...");

    tracing::info!("Loading models and services...");
    let app_state = match AppState::new().await {
        Ok(state) => {
            tracing::info!("All services initialized");
            Arc::new(state)
        }
        Err(e) => {
            tracing::error!("Failed to initialize app state: {}", e);
            tracing::error!("Error: {:?}", e);
            return Err(e);
        }
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(root))
        .route("/favicon.ico", get(favicon))
        .route("/api/health", get(health_check))
        .route("/api/transcribe", post(transcribe_audio))
        .route("/api/chat", post(chat_completion))
        .route("/api/conversation/:session_id", delete(clear_conversation))
        .route("/api/tts/generate", post(tts_generate))
        .route("/ws", get(websocket_handler))
        .with_state(app_state)
        .layer(cors);

    let addr = format!("0.0.0.0:{}", config::SERVER_PORT);
    tracing::info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server listening on http://{}", addr);
    tracing::info!("WebSocket endpoint: ws://{}/ws", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
