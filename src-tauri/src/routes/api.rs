use axum::extract::Multipart;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    Json,
};
use std::sync::Arc;

use crate::models::schemas::{
    ChatMessage, ChatResponse, ConversationClearResponse, HealthResponse, TTSRequest,
    TranscriptionResponse,
};
use crate::state::AppState;

pub async fn health_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<HealthResponse>, AppError> {
    let ollama_healthy = state.ollama.check_health().await.unwrap_or(false);
    let ollama_status = if ollama_healthy {
        "healthy"
    } else {
        "unhealthy"
    };

    let (whisper_model, whisper_status) = state.whisper.get_model_info();
    let (_, ollama_model) = state.ollama.get_service_info();

    Ok(Json(HealthResponse {
        status: "healthy".to_string(),
        whisper_model,
        whisper_status,
        ollama_status: ollama_status.to_string(),
        ollama_model,
    }))
}

pub async fn transcribe_audio(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<TranscriptionResponse>, AppError> {
    let mut audio_data = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read multipart field: {}", e)))?
    {
        if field.name() == Some("audio_file") {
            audio_data =
                Some(field.bytes().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read audio data: {}", e))
                })?);
            break;
        }
    }

    let audio_data =
        audio_data.ok_or_else(|| AppError::BadRequest("No audio file provided".to_string()))?;

    let transcription = state
        .whisper
        .transcribe_audio(audio_data)
        .await
        .map_err(|e| AppError::InternalServerError(format!("Transcription failed: {}", e)))?;

    Ok(Json(TranscriptionResponse { transcription }))
}

pub async fn chat_completion(
    State(state): State<Arc<AppState>>,
    Json(message): Json<ChatMessage>,
) -> Result<Json<ChatResponse>, AppError> {
    let session_id = message.session_id.as_deref().unwrap_or("default");

    let response = state
        .ollama
        .chat_completion(&state, session_id, &message.text)
        .await
        .map_err(|e| AppError::ServiceUnavailable(format!("Ollama error: {}", e)))?;

    Ok(Json(ChatResponse { response }))
}

pub async fn clear_conversation(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<ConversationClearResponse>, AppError> {
    let cleared = state.clear_conversation(&session_id);

    let (status, message) = if cleared {
        ("success", "Conversation history cleared")
    } else {
        ("info", "No conversation history found")
    };

    Ok(Json(ConversationClearResponse {
        status: status.to_string(),
        message: message.to_string(),
    }))
}

pub async fn favicon() -> impl IntoResponse {
    StatusCode::NO_CONTENT
}

pub async fn root() -> Html<String> {
    Html("<html><body><h1>Luna Voice Assistant API</h1><p>Backend running on Rust!</p></body></html>".to_string())
}

pub async fn tts_generate(
    State(state): State<Arc<AppState>>,
    Json(request): Json<TTSRequest>,
) -> Result<impl IntoResponse, AppError> {
    use axum::body::Body;
    use axum::http::header;

    tracing::info!(
        "TTS output: text='{}', speed={}",
        request.text,
        request.speed
    );

    if request.text.is_empty() {
        return Err(AppError::BadRequest("Text cannot be empty".to_string()));
    }

    const MAX_TEXT_LENGTH: usize = 5000;
    if request.text.len() > MAX_TEXT_LENGTH {
        return Err(AppError::BadRequest(format!(
            "Text too long: {} characters (max {})",
            request.text.len(),
            MAX_TEXT_LENGTH
        )));
    }

    if request.speed < 0.25 || request.speed > 4.0 {
        return Err(AppError::BadRequest(format!(
            "Speed must be between 0.25 and 4.0, got {}",
            request.speed
        )));
    }

    let kokoro = state
        .kokoro
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("TTS service not initialized".to_string()))?;

    if !kokoro.has_voice(&request.voice) {
        let available_voices = kokoro.list_voices();
        return Err(AppError::BadRequest(format!(
            "Invalid voice '{}'. Available voices: {}",
            request.voice,
            available_voices.join(", ")
        )));
    }

    let audio_bytes = kokoro
        .generate(
            &request.text,
            crate::services::kokoro::GenerationOptions {
                voice: Some(request.voice),
                speed: Some(request.speed),
                language: None,
                format: crate::services::kokoro::AudioFormat::WAV,
            },
        )
        .await
        .map_err(|e| {
            tracing::error!("TTS generation failed: {}", e);
            tracing::error!("Error details: {:?}", e);
            AppError::InternalServerError(format!("TTS generation failed: {}", e))
        })?;

    tracing::info!("TTS generation successful, {} bytes", audio_bytes.len());

    Ok((
        [(header::CONTENT_TYPE, "audio/wav")],
        Body::from(audio_bytes),
    ))
}

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    InternalServerError(String),
    ServiceUnavailable(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::InternalServerError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
            AppError::ServiceUnavailable(msg) => (StatusCode::SERVICE_UNAVAILABLE, msg),
        };

        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::schemas::ConversationMessage;
    use axum::http::StatusCode;

    #[test]
    fn test_app_error_bad_request() {
        let error = AppError::BadRequest("Invalid input".to_string());
        let response = error.into_response();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_app_error_internal_server_error() {
        let error = AppError::InternalServerError("Server error".to_string());
        let response = error.into_response();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn test_app_error_service_unavailable() {
        let error = AppError::ServiceUnavailable("Service down".to_string());
        let response = error.into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn test_health_check_response_structure() {
        let state = Arc::new(crate::state::AppState::new_test());

        let result = health_check(State(state)).await;

        assert!(result.is_ok());
        let response = result.unwrap();

        assert!(!response.whisper_model.is_empty());
        assert!(!response.ollama_model.is_empty());
    }

    #[tokio::test]
    async fn test_clear_conversation_success() {
        let state = Arc::new(crate::state::AppState::new_test());
        let session_id = "test-session";

        state.init_conversation(session_id);
        state.add_message(
            session_id,
            ConversationMessage {
                role: "user".to_string(),
                content: "Test".to_string(),
            },
        );

        let result = clear_conversation(State(state.clone()), Path(session_id.to_string())).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status, "success");
    }

    #[tokio::test]
    async fn test_clear_conversation_not_found() {
        let state = Arc::new(crate::state::AppState::new_test());

        let result = clear_conversation(State(state), Path("nonexistent".to_string())).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status, "info");
        assert!(response.message.contains("No conversation"));
    }

    #[tokio::test]
    async fn test_root_endpoint() {
        let response = root().await;

        let html = response.0;
        assert!(html.contains("Luna Voice Assistant"));
        assert!(html.contains("Backend running on Rust"));
    }

    #[tokio::test]
    async fn test_favicon_endpoint() {
        let response = favicon().await;
        let response = response.into_response();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[test]
    fn test_tts_request_validation() {
        let empty_text = TTSRequest {
            text: "".to_string(),
            voice: "af_heart".to_string(),
            speed: 1.0,
        };
        assert!(empty_text.text.is_empty());

        let max_length = 5000;
        let long_text = TTSRequest {
            text: "a".repeat(max_length + 1),
            voice: "af_heart".to_string(),
            speed: 1.0,
        };
        assert!(long_text.text.len() > max_length);

        let invalid_speed_low = TTSRequest {
            text: "Hello".to_string(),
            voice: "af_heart".to_string(),
            speed: 0.1,
        };
        assert!(invalid_speed_low.speed < 0.25);

        let invalid_speed_high = TTSRequest {
            text: "Hello".to_string(),
            voice: "af_heart".to_string(),
            speed: 5.0,
        };
        assert!(invalid_speed_high.speed > 4.0);

        let valid = TTSRequest {
            text: "Hello, world!".to_string(),
            voice: "af_heart".to_string(),
            speed: 1.0,
        };
        assert!(!valid.text.is_empty());
        assert!(valid.speed >= 0.25 && valid.speed <= 4.0);
    }

    #[test]
    fn test_chat_message_session_handling() {
        let msg_with_session = ChatMessage {
            text: "Hello".to_string(),
            session_id: Some("session-123".to_string()),
        };
        assert_eq!(
            msg_with_session.session_id.as_deref().unwrap_or("default"),
            "session-123"
        );

        let msg_without_session = ChatMessage {
            text: "Hello".to_string(),
            session_id: None,
        };
        assert_eq!(
            msg_without_session
                .session_id
                .as_deref()
                .unwrap_or("default"),
            "default"
        );
    }

    #[test]
    fn test_health_response_structure() {
        let response = HealthResponse {
            status: "healthy".to_string(),
            whisper_model: "base.en".to_string(),
            whisper_status: "loaded".to_string(),
            ollama_status: "healthy".to_string(),
            ollama_model: "gemma3:1b".to_string(),
        };

        assert_eq!(response.status, "healthy");
        assert!(!response.whisper_model.is_empty());
        assert!(!response.ollama_model.is_empty());
    }

    #[test]
    fn test_conversation_clear_response_structure() {
        let success = ConversationClearResponse {
            status: "success".to_string(),
            message: "Cleared".to_string(),
        };
        assert_eq!(success.status, "success");

        let info = ConversationClearResponse {
            status: "info".to_string(),
            message: "Not found".to_string(),
        };
        assert_eq!(info.status, "info");
    }
}
