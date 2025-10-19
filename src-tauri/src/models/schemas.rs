use serde::{Deserialize, Serialize};

// Request types
#[derive(Debug, Deserialize, Serialize)]
pub struct ChatMessage {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TTSRequest {
    pub text: String,
    #[serde(default = "default_voice")]
    pub voice: String,
    #[serde(default = "default_speed")]
    pub speed: f32,
}

fn default_voice() -> String {
    "af_heart".to_string()
}

fn default_speed() -> f32 {
    1.0
}

// Response types
#[derive(Debug, Serialize, Deserialize)]
pub struct TranscriptionResponse {
    pub transcription: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub response: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub whisper_model: String,
    pub whisper_status: String,
    pub ollama_status: String,
    pub ollama_model: String,
    /*     pub tts_engine: String,
    pub tts_status: String, */
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConversationClearResponse {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub language: String,
    pub gender: Option<String>,
}

// WebSocket message types
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type")]
pub enum WebSocketMessage {
    #[serde(rename = "ping")]
    Ping { timestamp: u64 },
    #[serde(rename = "pong")]
    Pong { timestamp: u64 },
    #[serde(rename = "chat")]
    Chat { text: String },
    #[serde(rename = "chat_response")]
    ChatResponse { response: String },
    #[serde(rename = "tts")]
    TTS {
        text: String,
        #[serde(default = "default_voice")]
        voice: String,
        #[serde(default = "default_speed")]
        speed: f32,
    },
    #[serde(rename = "stop")]
    Stop,
    #[serde(rename = "stop_playback")]
    StopPlayback,
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "audio_start")]
    AudioStart { total_chunks: u32, total_size: u32 },
    #[serde(rename = "audio_complete")]
    AudioComplete { duration: f32 },
    #[serde(rename = "audio_analysis")]
    AudioAnalysis {
        analysis: Vec<AudioAnalysisData>,
        duration: f32,
        start_time: f32,
        estimated_start_delay: f32,
    },
    #[serde(rename = "tts_complete")]
    TTSComplete,
    #[serde(rename = "mode_change")]
    ModeChange { mode: String },
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AudioAnalysisData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<f32>,
    pub volume: f32,
    pub bass: f32,
    pub low_mid: f32,
    pub high: f32,
}

// Internal message type for conversation history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_chat_message_serialization() {
        let msg = ChatMessage {
            text: "Hello, world!".to_string(),
            session_id: Some("session-123".to_string()),
        };

        let json = serde_json::to_string(&msg).unwrap();
        let deserialized: ChatMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.text, "Hello, world!");
        assert_eq!(deserialized.session_id, Some("session-123".to_string()));
    }

    #[test]
    fn test_chat_message_without_session() {
        let msg = ChatMessage {
            text: "Test message".to_string(),
            session_id: None,
        };

        let json = serde_json::to_string(&msg).unwrap();
        assert!(!json.contains("session_id"));

        let deserialized: ChatMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.text, "Test message");
        assert_eq!(deserialized.session_id, None);
    }

    #[test]
    fn test_tts_request_defaults() {
        let json = r#"{"text":"Hello"}"#;
        let request: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(request.text, "Hello");
        assert_eq!(request.voice, "af_heart");
        assert_eq!(request.speed, 1.0);
    }

    #[test]
    fn test_tts_request_custom_values() {
        let json = r#"{"text":"Hello","voice":"custom_voice","speed":1.5}"#;
        let request: TTSRequest = serde_json::from_str(json).unwrap();

        assert_eq!(request.text, "Hello");
        assert_eq!(request.voice, "custom_voice");
        assert_eq!(request.speed, 1.5);
    }

    #[test]
    fn test_health_response_serialization() {
        let response = HealthResponse {
            status: "healthy".to_string(),
            whisper_model: "base.en".to_string(),
            whisper_status: "loaded".to_string(),
            ollama_status: "healthy".to_string(),
            ollama_model: "gemma3:1b".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        let deserialized: HealthResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.status, "healthy");
        assert_eq!(deserialized.whisper_model, "base.en");
        assert_eq!(deserialized.ollama_model, "gemma3:1b");
    }

    #[test]
    fn test_websocket_ping_pong() {
        let ping = WebSocketMessage::Ping { timestamp: 12345 };
        let json = serde_json::to_string(&ping).unwrap();
        assert!(json.contains(r#""type":"ping"#));
        assert!(json.contains("12345"));

        let pong = WebSocketMessage::Pong { timestamp: 67890 };
        let json = serde_json::to_string(&pong).unwrap();
        assert!(json.contains(r#""type":"pong"#));
        assert!(json.contains("67890"));
    }

    #[test]
    fn test_websocket_chat_message() {
        let chat = WebSocketMessage::Chat {
            text: "Hello, AI!".to_string(),
        };

        let json = serde_json::to_string(&chat).unwrap();
        let deserialized: WebSocketMessage = serde_json::from_str(&json).unwrap();

        match deserialized {
            WebSocketMessage::Chat { text } => assert_eq!(text, "Hello, AI!"),
            _ => panic!("Expected Chat variant"),
        }
    }

    #[test]
    fn test_websocket_tts_with_defaults() {
        let json = r#"{"type":"tts","text":"Speak this"}"#;
        let msg: WebSocketMessage = serde_json::from_str(json).unwrap();

        match msg {
            WebSocketMessage::TTS { text, voice, speed } => {
                assert_eq!(text, "Speak this");
                assert_eq!(voice, "af_heart");
                assert_eq!(speed, 1.0);
            }
            _ => panic!("Expected TTS variant"),
        }
    }

    #[test]
    fn test_websocket_tts_custom_values() {
        let tts = WebSocketMessage::TTS {
            text: "Custom speech".to_string(),
            voice: "custom_voice".to_string(),
            speed: 1.2,
        };

        let json = serde_json::to_string(&tts).unwrap();
        let deserialized: WebSocketMessage = serde_json::from_str(&json).unwrap();

        match deserialized {
            WebSocketMessage::TTS { text, voice, speed } => {
                assert_eq!(text, "Custom speech");
                assert_eq!(voice, "custom_voice");
                assert_eq!(speed, 1.2);
            }
            _ => panic!("Expected TTS variant"),
        }
    }

    #[test]
    fn test_websocket_error() {
        let error = WebSocketMessage::Error {
            message: "Something went wrong".to_string(),
        };

        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""type":"error"#));
        assert!(json.contains("Something went wrong"));
    }

    #[test]
    fn test_websocket_audio_start() {
        let audio_start = WebSocketMessage::AudioStart {
            total_chunks: 10,
            total_size: 1024,
        };

        let json = serde_json::to_string(&audio_start).unwrap();
        let deserialized: WebSocketMessage = serde_json::from_str(&json).unwrap();

        match deserialized {
            WebSocketMessage::AudioStart {
                total_chunks,
                total_size,
            } => {
                assert_eq!(total_chunks, 10);
                assert_eq!(total_size, 1024);
            }
            _ => panic!("Expected AudioStart variant"),
        }
    }

    #[test]
    fn test_audio_analysis_data() {
        let analysis = AudioAnalysisData {
            time: Some(1.5),
            volume: 0.8,
            bass: 0.6,
            low_mid: 0.7,
            high: 0.5,
        };

        let json = serde_json::to_string(&analysis).unwrap();
        let deserialized: AudioAnalysisData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.time, Some(1.5));
        assert_eq!(deserialized.volume, 0.8);
        assert_eq!(deserialized.bass, 0.6);
    }

    #[test]
    fn test_audio_analysis_data_without_time() {
        let analysis = AudioAnalysisData {
            time: None,
            volume: 0.5,
            bass: 0.3,
            low_mid: 0.4,
            high: 0.2,
        };

        let json = serde_json::to_string(&analysis).unwrap();
        assert!(!json.contains("\"time\""));

        let deserialized: AudioAnalysisData = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.time, None);
    }

    #[test]
    fn test_conversation_message() {
        let msg = ConversationMessage {
            role: "user".to_string(),
            content: "What is the weather?".to_string(),
        };

        let json = serde_json::to_string(&msg).unwrap();
        let deserialized: ConversationMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.role, "user");
        assert_eq!(deserialized.content, "What is the weather?");
    }

    #[test]
    fn test_websocket_stop_messages() {
        let stop = WebSocketMessage::Stop;
        let json = serde_json::to_string(&stop).unwrap();
        assert!(json.contains(r#""type":"stop"#));

        let stop_playback = WebSocketMessage::StopPlayback;
        let json = serde_json::to_string(&stop_playback).unwrap();
        assert!(json.contains(r#""type":"stop_playback"#));
    }

    #[test]
    fn test_voice_info() {
        let info = VoiceInfo {
            id: "af_heart".to_string(),
            name: "Heart".to_string(),
            language: "en".to_string(),
            gender: Some("female".to_string()),
        };

        let json = serde_json::to_string(&info).unwrap();
        let deserialized: VoiceInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, "af_heart");
        assert_eq!(deserialized.name, "Heart");
        assert_eq!(deserialized.gender, Some("female".to_string()));
    }
}
