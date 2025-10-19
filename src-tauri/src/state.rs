use crate::config;
use crate::models::schemas::ConversationMessage;
use crate::services::{KokoroService, OllamaService, WhisperService};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub conversation_history: Arc<RwLock<HashMap<String, Arc<Vec<ConversationMessage>>>>>,
    pub cancellation_flags: Arc<RwLock<HashMap<String, bool>>>,
    pub system_prompt: String,
    pub ollama_model: String,
    pub whisper_model: String,
    pub ollama: Arc<OllamaService>,
    pub whisper: Arc<WhisperService>,
    pub kokoro: Option<Arc<KokoroService>>,
}

#[cfg(test)]
impl AppState {
    pub fn new_test() -> Self {
        Self {
            conversation_history: Arc::new(RwLock::new(HashMap::new())),
            cancellation_flags: Arc::new(RwLock::new(HashMap::new())),
            system_prompt: "Test system prompt".to_string(),
            ollama_model: "test-model".to_string(),
            whisper_model: "test-whisper".to_string(),
            ollama: Arc::new(OllamaService::new().unwrap()),
            whisper: Arc::new(WhisperService::new().unwrap()),
            kokoro: None,
        }
    }
}

impl AppState {
    pub async fn new() -> anyhow::Result<Self> {
        let ollama = Arc::new(OllamaService::new()?);
        tracing::info!("Ollama initialized");

        let whisper = Arc::new(WhisperService::new()?);
        match whisper.load_model().await {
            Ok(_) => tracing::info!("Whisper initialized"),
            Err(e) => tracing::warn!("Whisper model not available: {}", e),
        }

        let kokoro = match Self::init_kokoro().await {
            Ok(service) => {
                tracing::info!("TTS initialized");
                Some(Arc::new(service))
            }
            Err(e) => {
                tracing::warn!("TTS not available: {}", e);
                tracing::warn!("Kokoro error details: {:?}", e);
                None
            }
        };

        Ok(Self {
            conversation_history: Arc::new(RwLock::new(HashMap::new())),
            cancellation_flags: Arc::new(RwLock::new(HashMap::new())),
            system_prompt: config::SYSTEM_PROMPT.to_string(),
            ollama_model: std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| config::OLLAMA_DEFAULT_MODEL.to_string()),
            whisper_model: std::env::var("WHISPER_MODEL").unwrap_or_else(|_| config::WHISPER_DEFAULT_MODEL.to_string()),
            ollama,
            whisper,
            kokoro,
        })
    }

    async fn init_kokoro() -> anyhow::Result<KokoroService> {
        use crate::services::kokoro::KokoroConfig;

        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));

        let resources_dir = if let Some(dir) = exe_dir {
            let dev_resources = dir.join("../../resources/kokoro");
            if dev_resources.exists() {
                dev_resources.to_string_lossy().to_string()
            } else {
                let macos_bundle = dir
                    .parent()
                    .and_then(|p| Some(p.join("Resources/resources/kokoro")));
                if let Some(bundle_path) = macos_bundle {
                    if bundle_path.exists() {
                        bundle_path.to_string_lossy().to_string()
                    } else {
                        dir.join("resources/kokoro").to_string_lossy().to_string()
                    }
                } else {
                    dir.join("resources/kokoro").to_string_lossy().to_string()
                }
            }
        } else {
            std::env::var("KOKORO_RESOURCES_DIR").unwrap_or_else(|_| "resources/kokoro".to_string())
        };

        tracing::info!("Initializing TTS from: {}", resources_dir);

        let config = KokoroConfig::from_resources_dir(&resources_dir);

        config.validate()?;

        let service = KokoroService::new(config)?;

        Ok(service)
    }

    pub fn get_conversation(&self, session_id: &str) -> Arc<Vec<ConversationMessage>> {
        self.conversation_history
            .read()
            .get(session_id)
            .cloned()
            .unwrap_or_else(|| Arc::new(Vec::new()))
    }

    pub fn add_message(&self, session_id: &str, message: ConversationMessage) {
        let mut history = self.conversation_history.write();
        let messages = history
            .entry(session_id.to_string())
            .or_insert_with(|| Arc::new(Vec::new()));

        Arc::make_mut(messages).push(message);
    }

    pub fn clear_conversation(&self, session_id: &str) -> bool {
        let mut history = self.conversation_history.write();
        history.remove(session_id).is_some()
    }

    pub fn init_conversation(&self, session_id: &str) {
        let mut history = self.conversation_history.write();
        if !history.contains_key(session_id) {
            let mut messages = Vec::new();
            if !self.system_prompt.is_empty() {
                messages.push(ConversationMessage {
                    role: "system".to_string(),
                    content: self.system_prompt.clone(),
                });
            }
            history.insert(session_id.to_string(), Arc::new(messages));
        }
    }

    pub fn set_cancellation(&self, session_id: &str) {
        let mut flags = self.cancellation_flags.write();
        flags.insert(session_id.to_string(), true);
        tracing::info!("Cancellation flag set for session: {}", session_id);
    }

    pub fn is_cancelled(&self, session_id: &str) -> bool {
        self.cancellation_flags
            .read()
            .get(session_id)
            .copied()
            .unwrap_or(false)
    }

    pub fn clear_cancellation(&self, session_id: &str) {
        let mut flags = self.cancellation_flags.write();
        flags.remove(session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_conversation() {
        let state = AppState::new_test();
        let session_id = "test-session";

        state.init_conversation(session_id);

        let conversation = state.get_conversation(session_id);
        assert_eq!(conversation.len(), 1);
        assert_eq!(conversation[0].role, "system");
        assert_eq!(conversation[0].content, "Test system prompt");
    }

    #[test]
    fn test_init_conversation_idempotent() {
        let state = AppState::new_test();
        let session_id = "test-session";

        state.init_conversation(session_id);
        state.init_conversation(session_id);

        let conversation = state.get_conversation(session_id);
        assert_eq!(conversation.len(), 1);
    }

    #[test]
    fn test_add_message() {
        let state = AppState::new_test();
        let session_id = "test-session";

        state.init_conversation(session_id);

        let user_msg = ConversationMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        };
        state.add_message(session_id, user_msg);

        let conversation = state.get_conversation(session_id);
        assert_eq!(conversation.len(), 2);
        assert_eq!(conversation[1].role, "user");
        assert_eq!(conversation[1].content, "Hello");
    }

    #[test]
    fn test_add_multiple_messages() {
        let state = AppState::new_test();
        let session_id = "test-session";

        state.init_conversation(session_id);

        state.add_message(
            session_id,
            ConversationMessage {
                role: "user".to_string(),
                content: "First message".to_string(),
            },
        );

        state.add_message(
            session_id,
            ConversationMessage {
                role: "assistant".to_string(),
                content: "First response".to_string(),
            },
        );

        state.add_message(
            session_id,
            ConversationMessage {
                role: "user".to_string(),
                content: "Second message".to_string(),
            },
        );

        let conversation = state.get_conversation(session_id);
        assert_eq!(conversation.len(), 4);
        assert_eq!(conversation[1].content, "First message");
        assert_eq!(conversation[2].content, "First response");
        assert_eq!(conversation[3].content, "Second message");
    }

    #[test]
    fn test_get_conversation_nonexistent() {
        let state = AppState::new_test();

        let conversation = state.get_conversation("nonexistent");
        assert_eq!(conversation.len(), 0);
    }

    #[test]
    fn test_clear_conversation() {
        let state = AppState::new_test();
        let session_id = "test-session";

        state.init_conversation(session_id);
        state.add_message(
            session_id,
            ConversationMessage {
                role: "user".to_string(),
                content: "Test".to_string(),
            },
        );

        let cleared = state.clear_conversation(session_id);
        assert!(cleared);

        let conversation = state.get_conversation(session_id);
        assert_eq!(conversation.len(), 0);
    }

    #[test]
    fn test_clear_nonexistent_conversation() {
        let state = AppState::new_test();

        let cleared = state.clear_conversation("nonexistent");
        assert!(!cleared);
    }

    #[test]
    fn test_multiple_sessions() {
        let state = AppState::new_test();

        state.init_conversation("session-1");
        state.add_message(
            "session-1",
            ConversationMessage {
                role: "user".to_string(),
                content: "Message 1".to_string(),
            },
        );

        state.init_conversation("session-2");
        state.add_message(
            "session-2",
            ConversationMessage {
                role: "user".to_string(),
                content: "Message 2".to_string(),
            },
        );

        let conv1 = state.get_conversation("session-1");
        let conv2 = state.get_conversation("session-2");

        assert_eq!(conv1.len(), 2);
        assert_eq!(conv2.len(), 2);
        assert_eq!(conv1[1].content, "Message 1");
        assert_eq!(conv2[1].content, "Message 2");
    }

    #[test]
    fn test_concurrent_access() {
        use std::thread;

        let state = AppState::new_test();
        let session_id = "concurrent-session";
        state.init_conversation(session_id);

        let mut handles = vec![];

        for i in 0..10 {
            let state_clone = state.clone();
            let handle = thread::spawn(move || {
                state_clone.add_message(
                    "concurrent-session",
                    ConversationMessage {
                        role: "user".to_string(),
                        content: format!("Message {}", i),
                    },
                );
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        let conversation = state.get_conversation(session_id);

        assert_eq!(conversation.len(), 11);
    }

    #[test]
    fn test_conversation_arc_sharing() {
        let state = AppState::new_test();
        let session_id = "arc-test";

        state.init_conversation(session_id);

        let conv1 = state.get_conversation(session_id);
        let conv2 = state.get_conversation(session_id);

        assert_eq!(conv1.len(), conv2.len());
        assert_eq!(conv1[0].content, conv2[0].content);
    }
}
