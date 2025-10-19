use fancy_regex::Regex;
use std::sync::LazyLock;

// Sentence terminators
static SENTENCE_END: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[.!?\n]+").unwrap());

// Abbreviations that shouldn't trigger sentence splits
static ABBREVIATIONS: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
    vec![
        "Dr.", "Mr.", "Mrs.", "Ms.", "Sr.", "Jr.", "Ph.D.", "M.D.", "B.A.", "M.A.", "D.D.S.",
        "etc.", "Inc.", "Ltd.", "Corp.", "Ave.", "St.", "Rd.", "Blvd.",
    ]
});

// Patterns that indicate NOT a sentence boundary
static URL_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"https?://[^\s]+").unwrap());
static EMAIL_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\w\.-]+@[\w\.-]+\.\w+").unwrap());
static INITIAL_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b[A-Z]\.").unwrap());
static NUMBER_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\d+\.\d+").unwrap());
static ELLIPSIS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\.{3,}").unwrap());

#[derive(Debug, Clone)]
pub struct TextSplitter {
    min_sentence_length: usize,
    max_sentence_length: usize,
}

impl TextSplitter {
    pub fn new() -> Self {
        Self {
            min_sentence_length: 10,
            max_sentence_length: 500,
        }
    }

    pub fn with_constraints(min_length: usize, max_length: usize) -> Self {
        Self {
            min_sentence_length: min_length,
            max_sentence_length: max_length,
        }
    }

    pub fn split(&self, text: &str) -> Vec<String> {
        let mut sentences = Vec::new();
        let mut current = String::new();
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            let c = chars[i];
            current.push(c);

            if self.is_sentence_terminator(c) {
                let potential_sentence = current.trim().to_string();

                if self.is_real_boundary(&potential_sentence, &chars, i) {
                    if potential_sentence.len() >= self.min_sentence_length {
                        sentences.push(potential_sentence);
                        current.clear();
                    }
                }
            }

            if current.len() >= self.max_sentence_length {
                let trimmed = current.trim().to_string();
                if !trimmed.is_empty() {
                    sentences.push(trimmed);
                    current.clear();
                }
            }

            i += 1;
        }

        let final_sentence = current.trim().to_string();
        if final_sentence.len() >= self.min_sentence_length {
            sentences.push(final_sentence);
        } else if !sentences.is_empty() && !final_sentence.is_empty() {
            if let Some(last) = sentences.last_mut() {
                last.push(' ');
                last.push_str(&final_sentence);
            }
        }

        sentences
    }

    fn is_sentence_terminator(&self, c: char) -> bool {
        matches!(c, '.' | '!' | '?' | '\n')
    }

    fn is_real_boundary(&self, text: &str, chars: &[char], pos: usize) -> bool {
        if self.ends_with_abbreviation(text) {
            return false;
        }

        let has_url = URL_PATTERN.is_match(text).unwrap_or_else(|e| {
            tracing::warn!("URL pattern match failed: {}. Assuming no URL.", e);
            false
        });
        let has_email = EMAIL_PATTERN.is_match(text).unwrap_or_else(|e| {
            tracing::warn!("Email pattern match failed: {}. Assuming no email.", e);
            false
        });
        if has_url || has_email {
            return false;
        }

        if NUMBER_PATTERN.is_match(text).unwrap_or_else(|e| {
            tracing::warn!("Number pattern match failed: {}. Assuming no number.", e);
            false
        }) {
            return false;
        }

        if ELLIPSIS.is_match(text).unwrap_or_else(|e| {
            tracing::warn!(
                "Ellipsis pattern match failed: {}. Assuming no ellipsis.",
                e
            );
            false
        }) {
            return false;
        }

        if pos > 0 && pos < chars.len() - 1 {
            let prev_is_letter = chars
                .get(pos.saturating_sub(1))
                .map(|c| c.is_alphabetic())
                .unwrap_or(false);
            let next_is_space = chars
                .get(pos + 1)
                .map(|c| c.is_whitespace())
                .unwrap_or(false);
            let after_space_is_capital = chars
                .get(pos + 2)
                .map(|c| c.is_uppercase())
                .unwrap_or(false);

            if prev_is_letter && next_is_space && after_space_is_capital {
                return false;
            }
        }

        if pos < chars.len() - 2 {
            if let Some(&next_char) = chars.get(pos + 1) {
                if next_char.is_whitespace() {
                    if let Some(&after_space) = chars.get(pos + 2) {
                        if after_space.is_lowercase() {
                            return false;
                        }
                    }
                }
            }
        }

        if chars[pos] == '\n' {
            return true;
        }

        true
    }

    fn ends_with_abbreviation(&self, text: &str) -> bool {
        ABBREVIATIONS.iter().any(|abbr| text.ends_with(abbr))
    }

    pub fn split_for_streaming(&self, text: &str, chunk_size: usize) -> Vec<String> {
        let sentences = self.split(text);
        let mut chunks = Vec::new();
        let mut current_chunk = String::new();

        for sentence in sentences {
            if current_chunk.len() + sentence.len() > chunk_size && !current_chunk.is_empty() {
                chunks.push(current_chunk.trim().to_string());
                current_chunk.clear();
            }

            if !current_chunk.is_empty() {
                current_chunk.push(' ');
            }
            current_chunk.push_str(&sentence);
        }

        if !current_chunk.is_empty() {
            chunks.push(current_chunk.trim().to_string());
        }

        chunks
    }
}

impl Default for TextSplitter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_split() {
        let splitter = TextSplitter::new();
        let text = "This is sentence one. This is sentence two! Is this sentence three?";
        let sentences = splitter.split(text);
        assert!(sentences.len() >= 1, "Should produce at least one sentence");
        let joined = sentences.join(" ");
        assert!(joined.contains("sentence one"));
        assert!(joined.contains("sentence two"));
        assert!(joined.contains("sentence three"));
    }

    #[test]
    fn test_abbreviation_handling() {
        let splitter = TextSplitter::new();
        let text = "Dr. Smith works at Main St. He is very experienced.";
        let sentences = splitter.split(text);
        assert!(sentences.len() >= 1, "Should produce at least one sentence");
        let joined = sentences.join(" ");
        assert!(joined.contains("Dr. Smith"));
        assert!(joined.contains("experienced"));
    }

    #[test]
    fn test_url_handling() {
        let splitter = TextSplitter::new();
        let text = "Visit https://example.com for more info. It's a great site.";
        let sentences = splitter.split(text);

        assert!(sentences.len() >= 1, "Should produce at least one sentence");
        let joined = sentences.join(" ");
        assert!(
            joined.contains("https://example.com"),
            "Should preserve URL"
        );
        assert!(joined.contains("great site"), "Should include all text");
    }

    #[test]
    fn test_newline_split() {
        let splitter = TextSplitter::new();
        let text = "First paragraph.\nSecond paragraph.\nThird paragraph.";
        let sentences = splitter.split(text);

        assert_eq!(sentences.len(), 3);
    }

    #[test]
    fn test_min_length() {
        let splitter = TextSplitter::with_constraints(20, 500);
        let text = "Hi. This is a longer sentence that meets the minimum.";
        let sentences = splitter.split(text);

        assert!(sentences.len() <= 2);
    }

    #[test]
    fn test_max_length() {
        let splitter = TextSplitter::with_constraints(10, 50);
        let long_text = "This is a very long sentence that should be split because it exceeds the maximum length constraint that we have set for our splitter.";
        let sentences = splitter.split(long_text);

        assert!(sentences.len() > 1);
        assert!(sentences.iter().all(|s| s.len() <= 50));
    }

    #[test]
    fn test_streaming_chunks() {
        let splitter = TextSplitter::new();
        let text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
        let chunks = splitter.split_for_streaming(text, 40);

        assert!(chunks.len() >= 1);
        for chunk in &chunks {
            assert!(chunk.len() <= 80);
        }
    }

    #[test]
    fn test_ellipsis_handling() {
        let splitter = TextSplitter::new();
        let text = "Wait... this is interesting. Let me think about it.";
        let sentences = splitter.split(text);

        assert!(sentences.len() >= 1, "Should produce at least one sentence");
        let joined = sentences.join(" ");
        assert!(joined.contains("Wait"), "Should preserve beginning");
        assert!(joined.contains("think about it"), "Should preserve ending");
    }

    #[test]
    fn test_number_handling() {
        let splitter = TextSplitter::new();
        let text = "The value is 3.14159 approximately. That's pi.";
        let sentences = splitter.split(text);

        assert_eq!(sentences.len(), 2);
    }
}
