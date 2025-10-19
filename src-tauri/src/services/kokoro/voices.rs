use anyhow::{bail, Context, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const VOICE_STYLE_COLS: usize = 256;

pub type VoiceStyle = Vec<f32>;

pub struct VoiceManager {
    voices_dir: PathBuf,
    cache: Arc<RwLock<HashMap<String, VoiceStyle>>>,
}

impl VoiceManager {
    pub fn new<P: AsRef<Path>>(voices_dir: P) -> Result<Self> {
        let voices_dir = voices_dir.as_ref().to_path_buf();

        if !voices_dir.exists() {
            bail!("Voices directory does not exist: {}", voices_dir.display());
        }

        Ok(Self {
            voices_dir,
            cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    pub fn load_voice_with_token_count(&self, voice_id: &str, token_count: Option<usize>) -> Result<VoiceStyle> {
        let cache_key = if let Some(count) = token_count {
            format!("{}:{}", voice_id, count)
        } else {
            voice_id.to_string()
        };

        {
            let cache = self.cache.read();
            if let Some(style) = cache.get(&cache_key) {
                return Ok(style.clone());
            }
        }

        let voice_path = self.voices_dir.join(format!("{}.bin", voice_id));

        if !voice_path.exists() {
            bail!("Voice file not found: {}", voice_path.display());
        }

        let style = Self::load_voice_file_with_token_count(&voice_path, token_count)
            .context(format!("Failed to load voice: {}", voice_id))?;

        tracing::debug!(
            "Loaded voice '{}' with {} dimensions (token_count: {:?})",
            voice_id,
            style.len(),
            token_count
        );

        {
            let mut cache = self.cache.write();
            cache.insert(cache_key, style.clone());
        }

        Ok(style)
    }

    fn load_voice_file_with_token_count(path: &Path, token_count: Option<usize>) -> Result<VoiceStyle> {
        let bytes = std::fs::read(path).context("Failed to read voice file")?;

        if bytes.len() % 4 != 0 {
            bail!("Invalid voice file: size is not a multiple of 4");
        }

        let mut style = Vec::with_capacity(bytes.len() / 4);

        for chunk in bytes.chunks_exact(4) {
            let value = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            style.push(value);
        }

        // Check if this is a multi-row voice file (matrix format)
        // Voice files can be 512x256 or 510x256 depending on the source
        if style.len() % VOICE_STYLE_COLS == 0 && style.len() >= VOICE_STYLE_COLS {
            let num_rows = style.len() / VOICE_STYLE_COLS;

            // Only extract a row if we have multiple rows
            if num_rows > 1 {
                let num_tokens = if let Some(count) = token_count {
                    let adjusted = count.saturating_sub(2);
                    adjusted.min(num_rows - 1)
                } else {
                    0
                };

                tracing::debug!(
                    "Voice file is {}x{}, selecting row {} (token_count: {:?})",
                    num_rows,
                    VOICE_STYLE_COLS,
                    num_tokens,
                    token_count
                );

                let start_idx = num_tokens * VOICE_STYLE_COLS;
                let end_idx = start_idx + VOICE_STYLE_COLS;

                if end_idx <= style.len() {
                    Ok(style[start_idx..end_idx].to_vec())
                } else {
                    bail!(
                        "Invalid token count {} (max: {})",
                        num_tokens,
                        num_rows - 1
                    );
                }
            } else {
                Ok(style)
            }
        } else if style.len() == VOICE_STYLE_COLS {
            Ok(style)
        } else {
            bail!(
                "Invalid voice file size: {} floats (expected {} or multiple of {})",
                style.len(),
                VOICE_STYLE_COLS,
                VOICE_STYLE_COLS
            );
        }
    }

    pub fn has_voice(&self, voice_id: &str) -> bool {
        let voice_path = self.voices_dir.join(format!("{}.bin", voice_id));
        voice_path.exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_load_voice_file_with_token_count() {
        let temp_dir = tempfile::tempdir().unwrap();
        let voice_path = temp_dir.path().join("test_voice.bin");

        let mut file = std::fs::File::create(&voice_path).unwrap();
        for i in 0..VOICE_STYLE_COLS {
            let value = (i as f32) / VOICE_STYLE_COLS as f32;
            file.write_all(&value.to_le_bytes()).unwrap();
        }

        let style = VoiceManager::load_voice_file_with_token_count(&voice_path, None).unwrap();
        assert_eq!(style.len(), VOICE_STYLE_COLS);
        assert!((style[0] - 0.0).abs() < 0.001);
        assert!((style[VOICE_STYLE_COLS / 2] - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_voice_cache() {
        let temp_dir = tempfile::tempdir().unwrap();
        let voices_dir = temp_dir.path().join("voices");
        std::fs::create_dir(&voices_dir).unwrap();

        let voice_path = voices_dir.join("test.bin");
        let mut file = std::fs::File::create(&voice_path).unwrap();
        for _ in 0..VOICE_STYLE_COLS {
            file.write_all(&0.5f32.to_le_bytes()).unwrap();
        }

        let manager = VoiceManager::new(&voices_dir).unwrap();

        let style1 = manager.load_voice_with_token_count("test", None).unwrap();
        assert_eq!(style1.len(), VOICE_STYLE_COLS);

        let style2 = manager.load_voice_with_token_count("test", None).unwrap();
        assert_eq!(style2, style1);
    }

    #[test]
    fn test_has_voice() {
        let temp_dir = tempfile::tempdir().unwrap();
        let voices_dir = temp_dir.path().join("voices");
        std::fs::create_dir(&voices_dir).unwrap();

        let voice_path = voices_dir.join("test.bin");
        std::fs::File::create(&voice_path).unwrap();

        let manager = VoiceManager::new(&voices_dir).unwrap();

        assert!(manager.has_voice("test"));
        assert!(!manager.has_voice("nonexistent"));
    }
}
