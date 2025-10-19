use anyhow::{Context, Result};
use bytes::Bytes;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tempfile::NamedTempFile;
use tokio::{fs, process::Command, sync::RwLock, task, time::timeout};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::config;

pub struct WhisperService {
    model_path: PathBuf,
    model_size: String,

    ctx: RwLock<Option<Arc<WhisperContext>>>,
}

impl WhisperService {
    pub fn new() -> Result<Self> {
        let model_size = std::env::var("WHISPER_MODEL").unwrap_or_else(|_| config::WHISPER_DEFAULT_MODEL.to_string());

        let model_path = Self::resolve_model_path();

        Ok(Self {
            model_path,
            model_size,
            ctx: RwLock::new(None),
        })
    }

    fn resolve_model_path() -> PathBuf {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));

        if let Some(dir) = exe_dir {
            let dev_resources = dir.join("../../resources/whisper");
            if dev_resources.exists() {
                return dev_resources;
            }

            if let Some(parent) = dir.parent() {
                let macos_bundle = parent.join("Resources/resources/whisper");
                if macos_bundle.exists() {
                    return macos_bundle;
                }
            }

            dir.join("resources/whisper")
        } else {
            PathBuf::from(
                std::env::var("WHISPER_RESOURCES_DIR")
                    .unwrap_or_else(|_| "resources/whisper".to_string()),
            )
        }
    }

    pub async fn load_model(&self) -> Result<()> {
        let model_file = self
            .model_path
            .join(format!("ggml-{}.bin", self.model_size));

        if !model_file.exists() {
            tracing::warn!(
                "Model file missing: {:?}. Please download ggml-{}.bin.",
                model_file,
                self.model_size
            );
            return Ok(());
        }

        let ctx = task::spawn_blocking({
            let model_file = model_file.clone();
            move || {
                let model_path_str = model_file
                    .to_str()
                    .context("Model path contains invalid UTF-8 characters")?;
                WhisperContext::new_with_params(model_path_str, WhisperContextParameters::default())
                    .context("Failed to load Whisper model")
            }
        })
        .await
        .context("Failed to spawn model load task")??;

        let mut write_guard = self.ctx.write().await;
        *write_guard = Some(Arc::new(ctx));

        Ok(())
    }

    pub async fn transcribe_audio(&self, audio_data: Bytes) -> Result<String> {
        let read_guard = self.ctx.read().await;
        let ctx_arc = read_guard
            .as_ref()
            .cloned()
            .context("Model not loaded — call load_model() first")?;
        drop(read_guard);

        let input_file =
            NamedTempFile::with_suffix(".wav").context("Failed to create input temp file")?;
        let processed_file =
            NamedTempFile::with_suffix(".wav").context("Failed to create processed temp file")?;

        fs::write(input_file.path(), &audio_data)
            .await
            .context("Failed to write input audio file")?;

        let input_path = input_file
            .path()
            .to_str()
            .context("Input temp file path contains invalid UTF-8 characters")?;
        let processed_path = processed_file
            .path()
            .to_str()
            .context("Processed temp file path contains invalid UTF-8 characters")?;

        let ffmpeg_result = timeout(
            Duration::from_secs(config::WHISPER_FFMPEG_TIMEOUT_SECS),
            Command::new("ffmpeg")
                .args(&[
                    "-i",
                    input_path,
                    "-ar",
                    &config::WHISPER_AUDIO_SAMPLE_RATE.to_string(),
                    "-ac",
                    &config::WHISPER_AUDIO_CHANNELS.to_string(),
                    "-f",
                    "wav",
                    processed_path,
                    "-y",
                ])
                .output(),
        )
        .await
        .context("ffmpeg conversion timed out")?
        .context("Failed to run ffmpeg")?;

        if !ffmpeg_result.status.success() {
            anyhow::bail!(
                "ffmpeg failed: {}",
                String::from_utf8_lossy(&ffmpeg_result.stderr)
            );
        }

        let samples = read_wav_as_f32(&processed_file.path().to_path_buf())
            .await
            .context("Failed to read processed WAV")?;

        let transcription = timeout(
            Duration::from_secs(config::WHISPER_TRANSCRIPTION_TIMEOUT_SECS),
            task::spawn_blocking({
                let ctx_for_task = ctx_arc.clone();
                move || transcribe_with_whisper(ctx_for_task, &samples)
            }),
        )
        .await
        .context("Whisper transcription timed out")?
        .context("Whisper transcription task failed")??;

        Ok(transcription)
    }

    pub fn is_loaded(&self) -> bool {
        self.ctx
            .try_read()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }

    pub fn get_model_info(&self) -> (String, String) {
        let status = if self.is_loaded() {
            "loaded"
        } else {
            "not loaded"
        };
        (self.model_size.clone(), status.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whisper_service_creation() {
        let service = WhisperService::new();
        assert!(service.is_ok());

        let service = service.unwrap();
        let (model, status) = service.get_model_info();

        assert!(!model.is_empty());

        assert_eq!(status, "not loaded");
    }

    #[test]
    fn test_whisper_default_model() {
        std::env::remove_var("WHISPER_MODEL");

        let service = WhisperService::new().unwrap();
        let (model, _) = service.get_model_info();

        assert_eq!(model, crate::config::WHISPER_DEFAULT_MODEL);
    }

    #[test]
    fn test_whisper_custom_model() {
        std::env::set_var("WHISPER_MODEL", "small.en");

        let service = WhisperService::new().unwrap();
        let (model, _) = service.get_model_info();

        assert_eq!(model, "small.en");

        std::env::remove_var("WHISPER_MODEL");
    }

    #[test]
    fn test_whisper_not_loaded_initially() {
        let service = WhisperService::new().unwrap();
        assert!(!service.is_loaded());
    }

    #[tokio::test]
    async fn test_load_model_missing_file() {
        let service = WhisperService::new().unwrap();

        let result = service.load_model().await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_model_info() {
        let service = WhisperService::new().unwrap();
        let (model, status) = service.get_model_info();

        assert!(!model.is_empty());
        assert!(status == "loaded" || status == "not loaded");
    }

    #[test]
    fn test_is_loaded_thread_safety() {
        use std::sync::Arc;
        use std::thread;

        let service = Arc::new(WhisperService::new().unwrap());
        let mut handles = vec![];

        for _ in 0..10 {
            let service_clone = service.clone();
            let handle = thread::spawn(move || {
                let _ = service_clone.is_loaded();
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }
    }

    #[tokio::test]
    async fn test_transcribe_without_loaded_model() {
        let service = WhisperService::new().unwrap();

        let wav_data = Bytes::from(vec![0; 100]);

        let result = service.transcribe_audio(wav_data).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not loaded"));
    }

    #[test]
    fn test_model_path_construction() {
        std::env::set_var("WHISPER_MODEL", "tiny");

        let service = WhisperService::new().unwrap();
        let (model, _) = service.get_model_info();

        assert_eq!(model, "tiny");

        std::env::remove_var("WHISPER_MODEL");
    }

    #[test]
    fn test_whisper_timeouts() {
        assert!(crate::config::WHISPER_FFMPEG_TIMEOUT_SECS > 0);
        assert!(crate::config::WHISPER_TRANSCRIPTION_TIMEOUT_SECS > 0);
        assert!(crate::config::WHISPER_FFMPEG_TIMEOUT_SECS < 60);
        assert!(crate::config::WHISPER_TRANSCRIPTION_TIMEOUT_SECS <= 300);
    }
}

fn transcribe_with_whisper(ctx: Arc<WhisperContext>, pcm_data: &[f32]) -> Result<String> {
    let mut state = ctx
        .create_state()
        .context("Failed to create whisper state")?;

    let mut params = FullParams::new(SamplingStrategy::BeamSearch {
        beam_size: config::WHISPER_BEAM_SIZE,
        patience: config::WHISPER_BEAM_PATIENCE,
    });
    params.set_language(Some(config::WHISPER_LANGUAGE));
    params.set_translate(false);

    state
        .full(params, pcm_data)
        .context("Whisper full() failed")?;

    let mut text = String::new();
    for segment in state.as_iter() {
        text.push_str(&segment.to_string());
        text.push(' ');
    }

    Ok(text.trim().to_string())
}

async fn read_wav_as_f32(path: &PathBuf) -> Result<Vec<f32>> {
    use hound::WavReader;
    let data = fs::read(path)
        .await
        .context("Failed to read WAV file bytes")?;
    let reader = WavReader::new(std::io::Cursor::new(data)).context("Invalid WAV format")?;
    let samples: Vec<f32> = reader
        .into_samples::<i16>()
        .filter_map(Result::ok)
        .map(|s| s as f32 / i16::MAX as f32)
        .collect();
    Ok(samples)
}
