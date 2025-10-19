pub mod espeak;
pub mod inference;
pub mod phonemizer;
pub mod service;
pub mod splitter;
pub mod tokenizer;
pub mod vocab;
pub mod voices;

#[cfg(feature = "download")]
pub mod downloader;

pub use inference::AudioFormat;
pub use service::{GenerationOptions, KokoroConfig, KokoroService};

#[cfg(feature = "download")]
pub use downloader::KokoroDownloader;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub const MODEL_VERSION: &str = "0.19";

pub const DEFAULT_MODEL_REPO: &str = "hexgrad/Kokoro-82M";

pub mod model_files {
    pub const MODEL_ONNX: &str = "kokoro-v0_19.onnx";
    pub const TOKENIZER_JSON: &str = "tokenizer.json";
}

pub mod voice_ids {
    pub const AF_HEART: &str = "af_heart";
    pub const AF_BELLA: &str = "af_bella";
    pub const AF_SARAH: &str = "af_sarah";
    pub const AM_ADAM: &str = "am_adam";
    pub const AM_MICHAEL: &str = "am_michael";
    pub const BF_EMMA: &str = "bf_emma";
    pub const BF_ISABELLA: &str = "bf_isabella";
    pub const BM_GEORGE: &str = "bm_george";
    pub const BM_LEWIS: &str = "bm_lewis";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn test_model_version() {
        assert_eq!(MODEL_VERSION, "0.19");
    }

    #[test]
    fn test_voice_constants() {
        assert_eq!(voice_ids::AF_HEART, "af_heart");
    }
}
