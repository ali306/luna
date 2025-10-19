pub const SERVER_PORT: u16 = 40000;
pub const PROCESS_KILL_DELAY_MS: u64 = 1000;

pub const OLLAMA_DEFAULT_HOST: &str = "http://localhost:11434";
pub const OLLAMA_DEFAULT_MODEL: &str = "gemma3:1b";
pub const OLLAMA_DEFAULT_PORT: u16 = 11434;

pub const WHISPER_DEFAULT_MODEL: &str = "base.en";
pub const WHISPER_FFMPEG_TIMEOUT_SECS: u64 = 30;
pub const WHISPER_TRANSCRIPTION_TIMEOUT_SECS: u64 = 300;
pub const WHISPER_AUDIO_SAMPLE_RATE: u32 = 16000;
pub const WHISPER_AUDIO_CHANNELS: u16 = 1;
pub const WHISPER_BEAM_SIZE: i32 = 5;
pub const WHISPER_BEAM_PATIENCE: f32 = -1.0;
pub const WHISPER_LANGUAGE: &str = "en";

pub const TTS_DEFAULT_VOICE: &str = "af_heart";
pub const TTS_DEFAULT_SPEED: f32 = 1.0;
pub const TTS_SPEED_MIN: f32 = 0.25;
pub const TTS_SPEED_MAX: f32 = 4.0;
pub const TTS_CHUNK_THRESHOLD: usize = 300;
pub const TTS_SAMPLE_RATE: usize = 24000;
pub const TTS_MAX_TOKENS: usize = 10000;

pub const LOG_LEVEL: tracing::Level = tracing::Level::INFO;

pub const SYSTEM_PROMPT: &str = "You are a voice assistant. Your name is Luna.
Be clear, brief, and friendly.
Answer in short, natural sentences.
If unsure, say so and offer simple follow-up help.
Avoid unnecessary detail or repetition. Avoid lists and emojis.
";
