use anyhow::{Context, Result};
use ollama_rs::{
    generation::chat::{request::ChatMessageRequest, ChatMessage, MessageRole},
    Ollama,
};
use std::sync::Arc;

use crate::config;
use crate::models::schemas::ConversationMessage;
use crate::state::AppState;

pub struct OllamaService {
    client: Arc<Ollama>,
    host: String,
    model: String,
}

impl OllamaService {
    pub fn new() -> Result<Self> {
        let host =
            std::env::var("OLLAMA_HOST").unwrap_or_else(|_| config::OLLAMA_DEFAULT_HOST.to_string());

        let model = std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| config::OLLAMA_DEFAULT_MODEL.to_string());

        let full_url = if host.starts_with("http://") || host.starts_with("https://") {
            host.clone()
        } else {
            format!("http://{}", host)
        };

        tracing::info!("Initializing Ollama client with URL: {}", full_url);

        let ollama = if full_url == config::OLLAMA_DEFAULT_HOST {
            Ollama::default()
        } else {
            let url =
                url::Url::parse(&full_url).context(format!("Invalid Ollama URL: {}", full_url))?;

            let scheme = url.scheme();
            let host = url
                .host_str()
                .ok_or_else(|| anyhow::anyhow!("No host in URL"))?;
            let port = url.port().unwrap_or(config::OLLAMA_DEFAULT_PORT);

            let base_url = format!("{}://{}", scheme, host);
            Ollama::new(base_url, port)
        };

        Ok(Self {
            client: Arc::new(ollama),
            host: full_url,
            model,
        })
    }

    pub async fn chat(&self, messages: Arc<Vec<ConversationMessage>>) -> Result<String> {
        let chat_messages: Vec<ChatMessage> = messages
            .iter()
            .map(|msg| {
                let role = match msg.role.as_str() {
                    "system" => MessageRole::System,
                    "user" => MessageRole::User,
                    "assistant" => MessageRole::Assistant,
                    _ => MessageRole::User,
                };
                ChatMessage::new(role, msg.content.clone())
            })
            .collect();

        let request = ChatMessageRequest::new(self.model.clone(), chat_messages);

        let response = self
            .client
            .send_chat_messages(request)
            .await
            .context("Failed to send chat message to Ollama")?;

        let content = response.message.content;

        Ok(content)
    }

    pub async fn chat_completion(
        &self,
        state: &AppState,
        session_id: &str,
        user_message: &str,
    ) -> Result<String> {
        state.init_conversation(session_id);

        state.add_message(
            session_id,
            ConversationMessage {
                role: "user".to_string(),
                content: user_message.to_string(),
            },
        );

        let history = state.get_conversation(session_id);

        let assistant_reply = self.chat(history).await?;

        state.add_message(
            session_id,
            ConversationMessage {
                role: "assistant".to_string(),
                content: assistant_reply.clone(),
            },
        );

        Ok(assistant_reply)
    }

    pub async fn check_health(&self) -> Result<bool> {
        match self.client.list_local_models().await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    pub fn get_service_info(&self) -> (String, String) {
        (self.host.clone(), self.model.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ollama_service_creation() {
        let service = OllamaService::new();
        assert!(service.is_ok());

        let service = service.unwrap();
        let (host, _model) = service.get_service_info();

        assert!(host.contains("localhost") || host.contains("11434"));
    }

    #[test]
    fn test_ollama_service_with_protocol() {
        std::env::set_var("OLLAMA_HOST", "http://example.com:11434");
        std::env::set_var("OLLAMA_MODEL", "test-model");

        let service = OllamaService::new();
        assert!(service.is_ok());

        let service = service.unwrap();
        let (host, model) = service.get_service_info();

        assert_eq!(host, "http://example.com:11434");
        assert_eq!(model, "test-model");

        std::env::remove_var("OLLAMA_HOST");
        std::env::remove_var("OLLAMA_MODEL");
    }

    #[test]
    fn test_ollama_service_without_protocol() {
        std::env::set_var("OLLAMA_HOST", "example.com:11434");

        let service = OllamaService::new();
        assert!(service.is_ok());

        let service = service.unwrap();
        let (host, _) = service.get_service_info();

        assert!(host.starts_with("http://"));
        assert!(host.contains("example.com"));

        std::env::remove_var("OLLAMA_HOST");
    }

    #[tokio::test]
    async fn test_conversation_flow() {
        let state = crate::state::AppState::new_test();
        let _service = OllamaService::new().unwrap();
        let session_id = "test-session";

        state.init_conversation(session_id);

        let history = state.get_conversation(session_id);
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].role, "system");
    }

    #[test]
    fn test_message_role_conversion() {
        let messages = vec![
            ConversationMessage {
                role: "system".to_string(),
                content: "You are helpful".to_string(),
            },
            ConversationMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            },
            ConversationMessage {
                role: "assistant".to_string(),
                content: "Hi there".to_string(),
            },
            ConversationMessage {
                role: "unknown".to_string(),
                content: "Test".to_string(),
            },
        ];

        assert_eq!(messages.len(), 4);
    }

    #[test]
    fn test_url_parsing() {
        let test_cases = vec![
            ("http://localhost:11434", true),
            ("https://example.com:11434", true),
            ("localhost:11434", true),
            ("example.com", true),
        ];

        for (url, should_succeed) in test_cases {
            std::env::set_var("OLLAMA_HOST", url);
            let result = OllamaService::new();
            assert_eq!(result.is_ok(), should_succeed, "Failed for URL: {}", url);
            std::env::remove_var("OLLAMA_HOST");
        }
    }

    #[test]
    fn test_default_model() {
        std::env::remove_var("OLLAMA_MODEL");

        let service = OllamaService::new().unwrap();
        let (_, model) = service.get_service_info();

        assert_eq!(model, crate::config::OLLAMA_DEFAULT_MODEL);
    }

    #[test]
    fn test_custom_model() {
        std::env::set_var("OLLAMA_MODEL", "custom-model");

        let service = OllamaService::new().unwrap();
        let (_, model) = service.get_service_info();

        assert_eq!(model, "custom-model");

        std::env::remove_var("OLLAMA_MODEL");
    }
}
