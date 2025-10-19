use crate::services::kokoro::vocab::VOCAB;
use anyhow::{Context, Result};
use fancy_regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenizerConfig {
    pub version: String,
    pub normalizer: Option<Normalizer>,
    pub pre_tokenizer: Option<PreTokenizer>,
    pub post_processor: Option<PostProcessor>,
    pub model: TokenizerModel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Normalizer {
    #[serde(rename = "type")]
    pub normalizer_type: String,
    pub pattern: Pattern,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    #[serde(rename = "Regex")]
    pub regex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreTokenizer {
    #[serde(rename = "type")]
    pub tokenizer_type: String,
    pub pattern: Pattern,
    pub behavior: String,
    pub invert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostProcessor {
    #[serde(rename = "type")]
    pub processor_type: String,
    pub single: Vec<TokenTemplate>,
    pub special_tokens: HashMap<String, SpecialToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TokenTemplate {
    Special(SpecialTokenRef),
    Sequence(SequenceRef),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecialTokenRef {
    #[serde(rename = "SpecialToken")]
    pub special_token: SpecialTokenData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceRef {
    #[serde(rename = "Sequence")]
    pub sequence: SequenceData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecialTokenData {
    pub id: String,
    pub type_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceData {
    pub id: String,
    pub type_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecialToken {
    pub id: String,
    pub ids: Vec<u32>,
    pub tokens: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenizerModel {
    pub vocab: HashMap<String, u32>,
}

pub struct KokoroTokenizer {
    config: TokenizerConfig,
    vocab: HashMap<String, u32>,
    normalizer_regex: Option<Regex>,
    special_token_id: u32,
}

impl KokoroTokenizer {
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let content =
            std::fs::read_to_string(path).context("Failed to read tokenizer config file")?;
        Self::from_json(&content)
    }

    pub fn from_json(json: &str) -> Result<Self> {
        let config: TokenizerConfig =
            serde_json::from_str(json).context("Failed to parse tokenizer config")?;

        let vocab = VOCAB
            .iter()
            .map(|(&c, &idx)| (c.to_string(), idx as u32))
            .collect::<HashMap<String, u32>>();

        let normalizer_regex = config
            .normalizer
            .as_ref()
            .and_then(|n| Regex::new(&n.pattern.regex).ok());

        let special_token_id = vocab.get("$").copied().unwrap_or(0);

        Ok(Self {
            config,
            vocab,
            normalizer_regex,
            special_token_id,
        })
    }

    pub fn normalize(&self, text: &str) -> String {
        if let Some(regex) = &self.normalizer_regex {
            regex.replace_all(text, "").to_string()
        } else {
            text.to_string()
        }
    }

    pub fn tokenize(&self, text: &str) -> Vec<String> {
        text.chars().map(|c| c.to_string()).collect()
    }

    pub fn encode(&self, text: &str) -> Result<Vec<u32>> {
        let normalized = self.normalize(text);

        let tokens = self.tokenize(&normalized);

        let mut ids = vec![self.special_token_id];

        for token in tokens {
            if let Some(&id) = self.vocab.get(&token) {
                ids.push(id);
            } else {
                tracing::warn!("Unknown token: {}", token);
            }
        }

        ids.push(self.special_token_id);

        Ok(ids)
    }

    pub fn encode_with_truncation(
        &self,
        text: &str,
        max_length: Option<usize>,
    ) -> Result<Vec<u32>> {
        let mut ids = self.encode(text)?;

        if let Some(max_len) = max_length {
            if ids.len() > max_len {
                ids.truncate(max_len - 1);
                ids.push(self.special_token_id);
            }
        }

        Ok(ids)
    }

    pub fn special_token_id(&self) -> u32 {
        self.special_token_id
    }

    pub fn vocab_size(&self) -> usize {
        self.vocab.len()
    }

    pub fn contains(&self, token: &str) -> bool {
        self.vocab.contains_key(token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenizer_encode() {
        let json = r#"{
            "version": "1.0",
            "normalizer": null,
            "pre_tokenizer": null,
            "post_processor": null,
            "model": {
                "vocab": {
                    "$": 0,
                    " ": 16,
                    "H": 24,
                    "e": 47,
                    "l": 54,
                    "o": 57
                }
            }
        }"#;

        let tokenizer = KokoroTokenizer::from_json(json).unwrap();
        let ids = tokenizer.encode("Hello").unwrap();

        assert_eq!(ids.len(), 7);
        assert_eq!(ids[0], 0); // Start token
        assert_eq!(ids[1], 24); // H
        assert_eq!(ids[2], 47); // e
        assert_eq!(ids[6], 0); // End token
    }

    #[test]
    fn test_tokenizer_normalize() {
        let json = r#"{
            "version": "1.0",
            "normalizer": {
                "type": "Replace",
                "pattern": {
                    "Regex": "[0-9]"
                },
                "content": ""
            },
            "model": {
                "vocab": {
                    "$": 0,
                    "a": 1
                }
            }
        }"#;

        let tokenizer = KokoroTokenizer::from_json(json).unwrap();
        let normalized = tokenizer.normalize("abc123def");
        assert_eq!(normalized, "abcdef");
    }

    #[test]
    fn test_tokenizer_truncation() {
        let json = r#"{
            "version": "1.0",
            "model": {
                "vocab": {
                    "$": 0,
                    "a": 1,
                    "b": 2,
                    "c": 3
                }
            }
        }"#;

        let tokenizer = KokoroTokenizer::from_json(json).unwrap();
        let ids = tokenizer.encode_with_truncation("abcabc", Some(5)).unwrap();

        assert_eq!(ids.len(), 5);
        assert_eq!(ids[0], 0); // Start
        assert_eq!(ids[4], 0); // End
    }
}
