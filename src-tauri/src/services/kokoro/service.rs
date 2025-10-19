use anyhow::{bail, Context, Result};
use parking_lot::RwLock;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock as TokioRwLock;

use crate::config;
use super::{
    inference::{AudioFormat, AudioOutput, KokoroInference},
    phonemizer::{Language, Phonemizer},
    splitter::TextSplitter,
    tokenizer::KokoroTokenizer,
    voices::VoiceManager,
};

#[derive(Debug, Clone)]
pub struct KokoroConfig {
    pub model_path: PathBuf,
    pub tokenizer_path: PathBuf,
    pub voices_dir: PathBuf,
    pub default_language: Language,
    pub default_voice: String,
    pub default_speed: f32,
}

impl KokoroConfig {
    pub fn from_resources_dir<P: AsRef<Path>>(resources_dir: P) -> Self {
        let resources_dir = resources_dir.as_ref();
        Self {
            model_path: resources_dir.join("model.onnx"),
            tokenizer_path: resources_dir.join("tokenizer.json"),
            voices_dir: resources_dir.join("voices"),
            default_language: Language::AmericanEnglish,
            default_voice: config::TTS_DEFAULT_VOICE.to_string(),
            default_speed: config::TTS_DEFAULT_SPEED,
        }
    }

    pub fn validate(&self) -> Result<()> {
        if !self.model_path.exists() {
            bail!("Model file not found: {}", self.model_path.display());
        }
        if !self.tokenizer_path.exists() {
            bail!(
                "Tokenizer file not found: {}",
                self.tokenizer_path.display()
            );
        }
        if !self.voices_dir.exists() {
            bail!("Voices directory not found: {}", self.voices_dir.display());
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct GenerationOptions {
    pub voice: Option<String>,
    pub speed: Option<f32>,
    pub language: Option<Language>,
    pub format: AudioFormat,
}

impl Default for GenerationOptions {
    fn default() -> Self {
        Self {
            voice: None,
            speed: None,
            language: None,
            format: AudioFormat::WAV,
        }
    }
}

pub struct KokoroService {
    config: KokoroConfig,
    inference: Arc<RwLock<KokoroInference>>,
    tokenizer: Arc<KokoroTokenizer>,
    voice_manager: Arc<VoiceManager>,
    phonemizer: Arc<TokioRwLock<Phonemizer>>,
    splitter: TextSplitter,
}

impl KokoroService {
    pub fn new(config: KokoroConfig) -> Result<Self> {
        config.validate().context("Invalid configuration")?;

        tracing::info!("Initializing Kokoro TTS service");

        let inference = Arc::new(RwLock::new(
            KokoroInference::from_file(&config.model_path)
                .context("Failed to load inference model")?,
        ));

        let tokenizer = Arc::new(
            KokoroTokenizer::from_file(&config.tokenizer_path)
                .context("Failed to load tokenizer")?,
        );

        let voice_manager = Arc::new(
            VoiceManager::new(&config.voices_dir).context("Failed to initialize voice manager")?,
        );

        let phonemizer = Arc::new(TokioRwLock::new(Phonemizer::new(config.default_language)));

        let splitter = TextSplitter::new();

        tracing::info!("TTS initialized successfully");

        Ok(Self {
            config,
            inference,
            tokenizer,
            voice_manager,
            phonemizer,
            splitter,
        })
    }

    pub async fn generate(&self, text: &str, options: GenerationOptions) -> Result<Vec<u8>> {
        let voice_id = options
            .voice
            .as_deref()
            .unwrap_or(&self.config.default_voice);

        let speed = options.speed.unwrap_or(self.config.default_speed);
        let speed = speed.clamp(config::TTS_SPEED_MIN, config::TTS_SPEED_MAX);

        if let Some(language) = options.language {
            self.phonemizer.write().await.set_language(language);
        }

        if text.len() > config::TTS_CHUNK_THRESHOLD {
            let mut combined_audio = Vec::new();
            let sample_rate = self.inference.read().sample_rate();

            self.generate_streaming(text, voice_id, speed, |chunk_output| {
                combined_audio.extend_from_slice(chunk_output.samples());
                Ok(())
            })
            .await?;

            let audio_output = AudioOutput::new(combined_audio, sample_rate);
            let inference = self.inference.read();
            audio_output.to_format(options.format, &*inference)
        } else {
            let processed_text = self.preprocess_text(text).await?;
            let audio_output = self.generate_audio(&processed_text, voice_id, speed)?;

            let inference = self.inference.read();
            audio_output.to_format(options.format, &*inference)
        }
    }

    pub fn generate_audio(
        &self,
        phonemes: &str,
        voice_id: &str,
        speed: f32,
    ) -> Result<AudioOutput> {
        let token_ids = self
            .tokenizer
            .encode(phonemes)
            .context("Failed to tokenize phonemes")?;

        let voice_style = self
            .voice_manager
            .load_voice_with_token_count(voice_id, Some(token_ids.len()))
            .context("Failed to load voice")?;

        self.inference
            .read()
            .validate_inputs(&token_ids, &voice_style)
            .context("Invalid inputs")?;

        tracing::debug!(
            "Generating audio: {} tokens, voice={}, speed={}",
            token_ids.len(),
            voice_id,
            speed
        );

        let audio_samples = self
            .inference
            .write()
            .generate(&token_ids, &voice_style, speed)
            .context("Failed to generate audio")?;

        let sample_rate = self.inference.read().sample_rate();
        Ok(AudioOutput::new(audio_samples, sample_rate))
    }

    pub async fn generate_streaming<F>(
        &self,
        text: &str,
        voice_id: &str,
        speed: f32,
        mut callback: F,
    ) -> Result<()>
    where
        F: FnMut(AudioOutput) -> Result<()>,
    {
        let sentences = self.splitter.split(text);

        tracing::info!("Streaming generation: {} sentences", sentences.len());

        for (i, sentence) in sentences.iter().enumerate() {
            tracing::debug!(
                "Generating sentence {}/{}: {}",
                i + 1,
                sentences.len(),
                sentence
            );

            let processed_sentence = self.preprocess_text(sentence).await?;

            let audio = self
                .generate_audio(&processed_sentence, voice_id, speed)
                .context(format!("Failed to generate sentence {}", i + 1))?;

            callback(audio)?;
        }

        Ok(())
    }

    async fn preprocess_text(&self, text: &str) -> Result<String> {
        let phonemizer = self.phonemizer.read().await;
        let processed = phonemizer.process(text).await;
        //tracing::info!("Phonemizer input: '{}' -> output: '{}'", text, processed);
        Ok(processed)
    }

    pub fn has_voice(&self, voice_id: &str) -> bool {
        self.voice_manager.has_voice(voice_id)
    }

    pub fn list_voices(&self) -> Vec<String> {
        // Return a list of voice files in the voices directory
        let mut voices = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&self.config.voices_dir) {
            for entry in entries.flatten() {
                if let Some(stem) = entry.path().file_stem().and_then(|s| s.to_str()) {
                    if entry.path().extension().and_then(|s| s.to_str()) == Some("bin") {
                        voices.push(stem.to_string());
                    }
                }
            }
        }
        voices
    }

    pub fn sample_rate(&self) -> usize {
        self.inference.read().sample_rate()
    }

    pub async fn set_language(&self, language: Language) {
        self.phonemizer.write().await.set_language(language);
    }

    pub async fn language(&self) -> Language {
        self.phonemizer.read().await.language()
    }

    pub fn config(&self) -> &KokoroConfig {
        &self.config
    }
}

impl Clone for KokoroService {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            inference: Arc::clone(&self.inference),
            tokenizer: Arc::clone(&self.tokenizer),
            voice_manager: Arc::clone(&self.voice_manager),
            phonemizer: Arc::clone(&self.phonemizer),
            splitter: self.splitter.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config() -> KokoroConfig {
        KokoroConfig {
            model_path: PathBuf::from("test/model.onnx"),
            tokenizer_path: PathBuf::from("test/tokenizer.json"),
            voices_dir: PathBuf::from("test/voices"),
            default_language: Language::AmericanEnglish,
            default_voice: crate::config::TTS_DEFAULT_VOICE.to_string(),
            default_speed: crate::config::TTS_DEFAULT_SPEED,
        }
    }

    #[test]
    fn test_config_from_resources() {
        let config = KokoroConfig::from_resources_dir("/path/to/resources");
        assert!(config.model_path.ends_with("model.onnx"));
        assert!(config.tokenizer_path.ends_with("tokenizer.json"));
        assert!(config.voices_dir.ends_with("voices"));
    }

    #[test]
    fn test_generation_options_default() {
        let options = GenerationOptions::default();
        assert!(options.voice.is_none());
        assert!(options.speed.is_none());
        assert!(options.language.is_none());
        assert_eq!(options.format, AudioFormat::WAV);
    }

    #[test]
    fn test_config_validation() {
        let config = create_test_config();

        assert!(config.validate().is_err());
    }
}
