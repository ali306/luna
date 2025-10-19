use anyhow::{Context, Result, bail};
use ndarray::{Array1, Array2};
use ort::session::{Session, SessionOutputs};
use ort::value::Value;
use std::path::Path;

use crate::config;
use super::voices::VoiceStyle;

/// ONNX inference engine for Kokoro TTS
pub struct KokoroInference {
    session: Session,
    sample_rate: usize,
}

impl KokoroInference {
    pub fn from_file<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let model_path = model_path.as_ref();

        if !model_path.exists() {
            bail!("Model file not found: {}", model_path.display());
        }

        tracing::info!("Loading Kokoro ONNX model from: {}", model_path.display());

        let session = Session::builder()
            .context("Failed to create session builder")?
            .commit_from_file(model_path)
            .context("Failed to load ONNX model")?;

        tracing::info!("Kokoro ONNX model loaded successfully");

        Ok(Self {
            session,
            sample_rate: config::TTS_SAMPLE_RATE,
        })
    }

    /// Generates audio from token IDs and voice style
    pub fn generate(
        &mut self,
        token_ids: &[u32],
        voice_style: &VoiceStyle,
        speed: f32,
    ) -> Result<Vec<f32>> {

        let tokens_array = Self::prepare_tokens_array_static(token_ids)?;
        let style_array = Self::prepare_style_array_static(voice_style)?;
        let speed_array = Self::prepare_speed_array_static(speed)?;

        // Convert to ort Values
        let tokens_value = Value::from_array(tokens_array)
            .context("Failed to create tokens tensor")?;
        let style_value = Value::from_array(style_array)
            .context("Failed to create style tensor")?;
        let speed_value = Value::from_array(speed_array)
            .context("Failed to create speed tensor")?;

        // Inference with 3 inputs: tokens, style, speed
        let outputs = self.session
            .run(ort::inputs![tokens_value, style_value, speed_value])
            .context("Failed to run model inference")?;

        let audio = Self::extract_audio_static(&outputs)?;

        // Speed adjustment
        let audio = if (speed - 1.0).abs() > 0.01 {
            Self::adjust_speed_static(&audio, speed)
        } else {
            audio
        };

        Ok(audio)
    }

    fn prepare_tokens_array_static(token_ids: &[u32]) -> Result<Array2<i64>> {
        // Convert token IDs to i64 array
        let shape = [1, token_ids.len()]; // Batch size 1
        let data: Vec<i64> = token_ids.iter().map(|&id| id as i64).collect();

        Array2::from_shape_vec(shape, data)
            .context("Failed to create tokens array")
    }

    fn prepare_style_array_static(voice_style: &VoiceStyle) -> Result<Array2<f32>> {
        let shape = [1, voice_style.len()];
        let data = voice_style.clone();

        Array2::from_shape_vec(shape, data)
            .context("Failed to create style array")
    }

    fn prepare_speed_array_static(speed: f32) -> Result<Array1<f32>> {
        let data = vec![speed];

        Array1::from_vec(data)
            .into_shape_with_order([1])
            .context("Failed to create speed array")
    }

    fn extract_audio_static(outputs: &SessionOutputs) -> Result<Vec<f32>> {
        let output = &outputs[0];
        let (_shape, audio_slice) = output.try_extract_tensor::<f32>()
            .context("Failed to extract audio tensor")?;
        let audio: Vec<f32> = audio_slice.to_vec();

        Ok(audio)
    }

    /// Adjusts audio speed by resampling
    fn adjust_speed_static(audio: &[f32], speed: f32) -> Vec<f32> {
        if speed <= 0.0 {
            return audio.to_vec();
        }

        let input_len = audio.len();
        let output_len = ((input_len as f32) / speed) as usize;

        let mut output = Vec::with_capacity(output_len);

        for i in 0..output_len {
            let src_pos = (i as f32) * speed;
            let src_idx = src_pos.floor() as usize;
            let frac = src_pos - src_idx as f32;

            if src_idx + 1 < input_len {
                // Linear interpolation
                let sample = audio[src_idx] * (1.0 - frac) + audio[src_idx + 1] * frac;
                output.push(sample);
            } else if src_idx < input_len {
                output.push(audio[src_idx]);
            }
        }

        output
    }

    pub fn sample_rate(&self) -> usize {
        self.sample_rate
    }

    /// Converts audio to WAV bytes
    pub fn to_wav_bytes(&self, audio: &[f32]) -> Result<Vec<u8>> {
        use hound::{WavSpec, WavWriter};
        use std::io::Cursor;

        let spec = WavSpec {
            channels: 1,
            sample_rate: self.sample_rate as u32,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = WavWriter::new(&mut cursor, spec)
                .context("Failed to create WAV writer")?;

            for &sample in audio {
                // Convert f32 [-1.0, 1.0] to i16 [-32768, 32767]
                let sample_i16 = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
                writer.write_sample(sample_i16)
                    .context("Failed to write WAV sample")?;
            }

            writer.finalize()
                .context("Failed to finalize WAV")?;
        }

        Ok(cursor.into_inner())
    }

    /// Converts audio to PCM bytes (raw 16-bit samples)
    pub fn to_pcm_bytes(&self, audio: &[f32]) -> Vec<u8> {
        Self::audio_to_pcm_bytes(audio)
    }

    fn audio_to_pcm_bytes(audio: &[f32]) -> Vec<u8> {
        let mut pcm = Vec::with_capacity(audio.len() * 2);

        for &sample in audio {
            let sample_i16 = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
            pcm.extend_from_slice(&sample_i16.to_le_bytes());
        }

        pcm
    }

    pub fn validate_inputs(&self, token_ids: &[u32], voice_style: &VoiceStyle) -> Result<()> {
        if token_ids.is_empty() {
            bail!("Token IDs cannot be empty");
        }

        if voice_style.is_empty() {
            bail!("Voice style cannot be empty");
        }

        if token_ids.len() > config::TTS_MAX_TOKENS {
            bail!("Token sequence too long: {} tokens", token_ids.len());
        }

        Ok(())
    }
}

/// Audio output format
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioFormat {
    Float32,
    /// 16-bit PCM (little-endian)
    PCM16,
    WAV,
}

#[derive(Debug, Clone)]
pub struct AudioOutput {
    pub samples: Vec<f32>,
    pub sample_rate: usize,
    pub duration_seconds: f32,
}

impl AudioOutput {
    pub fn new(samples: Vec<f32>, sample_rate: usize) -> Self {
        let duration_seconds = samples.len() as f32 / sample_rate as f32;
        Self {
            samples,
            sample_rate,
            duration_seconds,
        }
    }

    pub fn to_format(&self, format: AudioFormat, inference: &KokoroInference) -> Result<Vec<u8>> {
        match format {
            AudioFormat::Float32 => {
                // Convert f32 to bytes
                let mut bytes = Vec::with_capacity(self.samples.len() * 4);
                for &sample in &self.samples {
                    bytes.extend_from_slice(&sample.to_le_bytes());
                }
                Ok(bytes)
            }
            AudioFormat::PCM16 => Ok(inference.to_pcm_bytes(&self.samples)),
            AudioFormat::WAV => inference.to_wav_bytes(&self.samples),
        }
    }

    pub fn samples(&self) -> &[f32] {
        &self.samples
    }

    pub fn sample_rate(&self) -> usize {
        self.sample_rate
    }

    pub fn duration(&self) -> f32 {
        self.duration_seconds
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pcm_conversion() {
        let audio = vec![0.0, 0.5, -0.5, 1.0, -1.0];
        let pcm = KokoroInference::audio_to_pcm_bytes(&audio);

        // Each sample is 2 bytes (i16)
        assert_eq!(pcm.len(), audio.len() * 2);

        let samples_i16: Vec<i16> = pcm
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();

        assert_eq!(samples_i16[0], 0);      // 0.0 * 32767 = 0
        assert_eq!(samples_i16[1], 16383);  // 0.5 * 32767 = 16383.5 -> 16383
        assert_eq!(samples_i16[2], -16383); // -0.5 * 32767 = -16383.5 -> -16383
        assert_eq!(samples_i16[3], 32767);  // 1.0 * 32767 = 32767
        assert_eq!(samples_i16[4], -32767); // -1.0 * 32767 = -32767
    }

    #[test]
    fn test_audio_output() {
        let samples = vec![0.0; 24000];
        let output = AudioOutput::new(samples, 24000);

        assert_eq!(output.sample_rate(), 24000);
        assert!((output.duration() - 1.0).abs() < 0.01);
        assert_eq!(output.samples().len(), 24000);
    }

    #[test]
    fn test_speed_adjustment() {
        let audio = vec![0.0, 1.0, 0.0, -1.0];

        // Test 2x speed
        let adjusted = KokoroInference::adjust_speed_static(&audio, 2.0);
        assert_eq!(adjusted.len(), 2);

        // Test 0.5x speed
        let adjusted = KokoroInference::adjust_speed_static(&audio, 0.5);
        assert_eq!(adjusted.len(), 8);

        // Test 1.0x speed
        let adjusted = KokoroInference::adjust_speed_static(&audio, 1.0);
        assert_eq!(adjusted.len(), 4);
    }
}
