use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::schemas::WebSocketMessage;
use crate::state::AppState;

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    let session_id = format!("ws_{}", Uuid::new_v4());

    tracing::info!("WebSocket connected: {}", session_id);

    state.init_conversation(&session_id);

    let session_id_clone = session_id.clone();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    loop {
        tokio::select! {

            ws_msg = receiver.next() => {
                match ws_msg {
                    Some(Ok(Message::Text(text))) => {

                        match serde_json::from_str::<WebSocketMessage>(&text) {
                            Ok(ws_msg) => {
                                if let Err(e) = handle_websocket_message(
                                    ws_msg,
                                    &mut sender,
                                    &state,
                                    &session_id_clone,
                                    tx.clone(),
                                )
                                .await
                                {
                                    tracing::error!("Error handling WebSocket message: {}", e);
                                    let error_msg = WebSocketMessage::Error {
                                        message: e.to_string(),
                                    };
                                    if let Ok(json) = serde_json::to_string(&error_msg) {
                                        let _ = sender.send(Message::Text(json)).await;
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to parse WebSocket message: {}", e);
                                let error_msg = WebSocketMessage::Error {
                                    message: format!("Invalid message format: {}", e),
                                };
                                if let Ok(json) = serde_json::to_string(&error_msg) {
                                    let _ = sender.send(Message::Text(json)).await;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        tracing::info!("WebSocket closed: {}", session_id);
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    Some(Err(e)) => {
                        tracing::error!("WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        tracing::info!("WebSocket stream ended");
                        break;
                    }
                    _ => {}
                }
            }

            Some(msg) = rx.recv() => {
                if let Err(e) = sender.send(msg).await {
                    tracing::error!("Failed to send message to client: {}", e);
                    break;
                }
            }
        }
    }

    state.clear_conversation(&session_id);
    tracing::info!("WebSocket disconnected and cleaned up: {}", session_id);
}

async fn handle_websocket_message(
    message: WebSocketMessage,
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
    state: &Arc<AppState>,
    session_id: &str,
    tx: tokio::sync::mpsc::UnboundedSender<Message>,
) -> anyhow::Result<()> {
    match message {
        WebSocketMessage::Ping { timestamp } => {
            let pong_msg = WebSocketMessage::Pong { timestamp };
            let json = serde_json::to_string(&pong_msg)?;
            sender.send(Message::Text(json)).await?;
            tracing::debug!("Responded to ping");
        }
        WebSocketMessage::Chat { text } => {
            tracing::info!("Received chat message: {}", text);

            state.clear_cancellation(session_id);

            let state_clone = state.clone();
            let session_id_clone = session_id.to_string();
            let tx_clone = tx.clone();

            tokio::spawn(async move {
                match state_clone
                    .ollama
                    .chat_completion(&state_clone, &session_id_clone, &text)
                    .await
                {
                    Ok(response) => {
                        if state_clone.is_cancelled(&session_id_clone) {
                            tracing::info!("Request was cancelled, discarding response");
                            state_clone.clear_cancellation(&session_id_clone);
                            return;
                        }

                        tracing::info!("LLM response: {}", response);

                        let response_msg = WebSocketMessage::ChatResponse {
                            response: response.clone(),
                        };
                        if let Ok(json) = serde_json::to_string(&response_msg) {
                            let _ = tx_clone.send(Message::Text(json));
                        }
                    }
                    Err(e) => {
                        tracing::error!("Chat completion failed: {}", e);
                        let error_msg = WebSocketMessage::Error {
                            message: format!("Chat failed: {}. Make sure Ollama is running!", e),
                        };
                        if let Ok(json) = serde_json::to_string(&error_msg) {
                            let _ = tx_clone.send(Message::Text(json));
                        }
                    }
                }
            });
        }
        WebSocketMessage::TTS {
            text: _,
            voice: _,
            speed: _,
        } => {
        }
        WebSocketMessage::Stop | WebSocketMessage::StopPlayback => {
            state.set_cancellation(session_id);
            tracing::info!(
                "Stop request received, cancellation flag set for session: {}",
                session_id
            );

            let stop_msg = WebSocketMessage::Stop;
            let json = serde_json::to_string(&stop_msg)?;
            sender.send(Message::Text(json)).await?;
        }
        WebSocketMessage::ModeChange { mode } => {
            tracing::info!("Mode changed to: {}", mode);
        }
        _ => {
            tracing::warn!("Received unexpected message type from client");
        }
    }

    Ok(())
}
