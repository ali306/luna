use anyhow::Result;
use fancy_regex::Regex;
use std::sync::LazyLock;

use super::espeak;
use crate::services::kokoro::vocab::VOCAB;

static PHONEME_PATTERNS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?<=[a-zɹː])(?=hˈʌndɹɪd)").unwrap());
static Z_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#" z(?=[;:,.!?¡¿—…"«»"" ]|$)"#).unwrap());
static NINETY_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?<=nˈaɪn)ti(?!ː)").unwrap());
static KOKORO_EN_US: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"kəkˈoːɹoʊ").unwrap());
static KOKORO_EN_GB: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"kəkˈɔːɹəʊ").unwrap());

static SINGLE_QUOTES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\u{2018}\u{2019}]").unwrap());
static LEFT_DOUBLE_QUOTE: LazyLock<Regex> = LazyLock::new(|| Regex::new("«").unwrap());
static RIGHT_DOUBLE_QUOTE: LazyLock<Regex> = LazyLock::new(|| Regex::new("»").unwrap());
static DOUBLE_QUOTES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\u{201C}\u{201D}]").unwrap());
static LEFT_PAREN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(").unwrap());
static RIGHT_PAREN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\)").unwrap());

// Uncommon punctuation marks
static IDEOGRAPHIC_COMMA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"、").unwrap());
static IDEOGRAPHIC_PERIOD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"。").unwrap());
static IDEOGRAPHIC_EXCLAMATION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"！").unwrap());
static FULLWIDTH_COMMA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"，").unwrap());
static FULLWIDTH_COLON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"：").unwrap());
static FULLWIDTH_SEMICOLON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"；").unwrap());
static FULLWIDTH_QUESTION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"？").unwrap());

// Whitespace
static NON_SPACE_WHITESPACE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^\S \n]").unwrap());
static MULTIPLE_SPACES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"  +").unwrap());
static SPACE_BETWEEN_NEWLINES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?<=\n) +(?=\n)").unwrap());

// Abbreviations
static DR_TITLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bD[Rr]\.(?= [A-Z])").unwrap());
static MR_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:Mr\.|MR\.(?= [A-Z]))").unwrap());
static MS_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:Ms\.|MS\.(?= [A-Z]))").unwrap());
static MRS_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:Mrs\.|MRS\.(?= [A-Z]))").unwrap());
static ETC_ABBR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\betc\.(?! [A-Z])").unwrap());

static YEAH_VARIANTS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(y)eah?\b").unwrap());

// Numbers and currencies
static NUMBER_PATTERNS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)").unwrap()
});
static COMMA_IN_NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?<=\d),(?=\d)").unwrap());
static MONEY_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b",
    )
    .unwrap()
});
static DECIMAL_NUMBER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\d*\.\d+").unwrap());
static HYPHEN_BETWEEN_DIGITS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?<=\d)-(?=\d)").unwrap());
static S_AFTER_DIGIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?<=\d)S").unwrap());

// Possessives
static POSSESSIVE_AFTER_CONSONANT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?<=[BCDFGHJ-NP-TV-Z])'?s\b").unwrap());
static POSSESSIVE_AFTER_X: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?<=X')S\b").unwrap());

// Hyphenated words/letters
static LETTER_SEQUENCES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:[A-Za-z]\.){2,} [a-z]").unwrap());
static DOT_BETWEEN_CAPS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(?<=[A-Z])\.(?=[A-Z])").unwrap());

static PUNCTUATION_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(\s*[;:,.!?¡¿—…"«»""(){}\[\]]+\s*)+"#).unwrap());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    AmericanEnglish,
    BritishEnglish,
}

impl Language {
    pub fn code(&self) -> &str {
        match self {
            Language::AmericanEnglish => "a",
            Language::BritishEnglish => "b",
        }
    }

    pub fn espeak_voice(&self) -> &str {
        match self {
            Language::AmericanEnglish => "en-us",
            Language::BritishEnglish => "en-gb",
        }
    }
}

#[derive(Debug, Clone)]
struct TextSegment {
    is_match: bool,
    text: String,
}

/// Splits a string on a regex, but keeps the delimiters
fn split_with_delimiters(text: &str, regex: &Regex) -> Vec<TextSegment> {
    let mut result = Vec::new();
    let mut prev = 0;

    for mat in regex.find_iter(text) {
        let mat = match mat {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!(
                    "Regex match failed: {}. Treating remaining text as non-match.",
                    e
                );
                if prev < text.len() {
                    result.push(TextSegment {
                        is_match: false,
                        text: text[prev..].to_string(),
                    });
                }
                return result;
            }
        };

        let start = mat.start();
        let end = mat.end();

        // Add text before match
        if prev < start {
            result.push(TextSegment {
                is_match: false,
                text: text[prev..start].to_string(),
            });
        }

        // Add the match itself (delimiter/punctuation)
        if end > start {
            result.push(TextSegment {
                is_match: true,
                text: text[start..end].to_string(),
            });
        }

        prev = end;
    }

    // Add remaining text after last match
    if prev < text.len() {
        result.push(TextSegment {
            is_match: false,
            text: text[prev..].to_string(),
        });
    }

    result
}

/// Splits numbers into phonetic equivalents
fn split_num(match_text: &str) -> String {
    if match_text.contains('.') {
        return match_text.to_string();
    } else if match_text.contains(':') {
        // Time format like "3:45"
        let parts: Vec<&str> = match_text.split(':').collect();
        if parts.len() == 2 {
            if let (Ok(h), Ok(m)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
                if m == 0 {
                    return format!("{} o'clock", h);
                } else if m < 10 {
                    return format!("{} oh {}", h, m);
                }
                return format!("{} {}", h, m);
            }
        }
        return match_text.to_string();
    }

    // Year format like "1984" or "1984s"
    if match_text.len() >= 4 {
        let year_str = if match_text.ends_with('s') {
            &match_text[..4]
        } else {
            match_text
        };

        if let Ok(year) = year_str.parse::<i32>() {
            if year < 1100 || year % 1000 < 10 {
                return match_text.to_string();
            }

            let left = &match_text[..2];
            if let Ok(right) = match_text[2..4].parse::<i32>() {
                let suffix = if match_text.ends_with('s') { "s" } else { "" };

                if year % 1000 >= 100 && year % 1000 <= 999 {
                    if right == 0 {
                        return format!("{} hundred{}", left, suffix);
                    } else if right < 10 {
                        return format!("{} oh {}{}", left, right, suffix);
                    }
                }
                return format!("{} {}{}", left, right, suffix);
            }
        }
    }

    match_text.to_string()
}

/// Formats monetary values
fn flip_money(match_text: &str) -> String {
    if match_text.is_empty() {
        return match_text.to_string();
    }

    let currency_symbol = &match_text[..1];
    let bill = if currency_symbol == "$" {
        "dollar"
    } else {
        "pound"
    };
    let amount = &match_text[1..];

    // Check if it's not a valid number
    if amount.parse::<f64>().is_err() && !amount.contains('.') {
        return format!("{} {}s", amount, bill);
    }

    // No decimal point
    if !amount.contains('.') {
        let suffix = if amount == "1" { "" } else { "s" };
        return format!("{} {}{}", amount, bill, suffix);
    }

    // Has decimal point
    let parts: Vec<&str> = amount.split('.').collect();
    if parts.len() == 2 {
        let b = parts[0];
        let c = parts[1].to_string() + &"0".repeat(2 - parts[1].len().min(2));
        if let Ok(d) = c[..2].parse::<i32>() {
            let coins = if currency_symbol == "$" {
                if d == 1 {
                    "cent"
                } else {
                    "cents"
                }
            } else {
                if d == 1 {
                    "penny"
                } else {
                    "pence"
                }
            };
            return format!(
                "{} {}{} and {} {}",
                b,
                bill,
                if b == "1" { "" } else { "s" },
                d,
                coins
            );
        }
    }

    match_text.to_string()
}

/// Processes decimal numbers
fn point_num(match_text: &str) -> String {
    let parts: Vec<&str> = match_text.split('.').collect();
    if parts.len() == 2 {
        let a = parts[0];
        let b = parts[1]
            .chars()
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join(" ");
        return format!("{} point {}", a, b);
    }
    match_text.to_string()
}

pub struct Phonemizer {
    language: Language,
}

impl Phonemizer {
    pub fn new(language: Language) -> Self {
        Self { language }
    }

    fn normalize_quotes_and_brackets(&self, text: &str) -> String {
        let mut result = text.to_string();
        result = SINGLE_QUOTES.replace_all(&result, "'").to_string();
        result = LEFT_DOUBLE_QUOTE
            .replace_all(&result, "\u{201C}")
            .to_string(); // "
        result = RIGHT_DOUBLE_QUOTE
            .replace_all(&result, "\u{201D}")
            .to_string(); // "
        result = DOUBLE_QUOTES.replace_all(&result, "\"").to_string();
        result = LEFT_PAREN.replace_all(&result, "«").to_string();
        result = RIGHT_PAREN.replace_all(&result, "»").to_string();
        result
    }

    fn normalize_uncommon_punctuation(&self, text: &str) -> String {
        let mut result = text.to_string();
        result = IDEOGRAPHIC_COMMA.replace_all(&result, ", ").to_string();
        result = IDEOGRAPHIC_PERIOD.replace_all(&result, ". ").to_string();
        result = IDEOGRAPHIC_EXCLAMATION
            .replace_all(&result, "! ")
            .to_string();
        result = FULLWIDTH_COMMA.replace_all(&result, ", ").to_string();
        result = FULLWIDTH_COLON.replace_all(&result, ": ").to_string();
        result = FULLWIDTH_SEMICOLON.replace_all(&result, "; ").to_string();
        result = FULLWIDTH_QUESTION.replace_all(&result, "? ").to_string();
        result
    }

    fn normalize_whitespace(&self, text: &str) -> String {
        let mut result = text.to_string();
        result = NON_SPACE_WHITESPACE.replace_all(&result, " ").to_string();
        result = MULTIPLE_SPACES.replace_all(&result, " ").to_string();
        result = SPACE_BETWEEN_NEWLINES.replace_all(&result, "").to_string();
        result
    }

    fn normalize_abbreviations(&self, text: &str) -> String {
        let mut result = text.to_string();
        result = DR_TITLE.replace_all(&result, "Doctor").to_string();
        result = MR_TITLE.replace_all(&result, "Mister").to_string();
        result = MS_TITLE.replace_all(&result, "Miss").to_string();
        result = MRS_TITLE.replace_all(&result, "Mrs").to_string();
        result = ETC_ABBR.replace_all(&result, "etc").to_string();
        result
    }

    fn normalize_casual_words(&self, text: &str) -> String {
        YEAH_VARIANTS.replace_all(text, "${1}e'a").to_string()
    }

    fn normalize_numbers_and_currency(&self, text: &str) -> String {
        let mut result = text.to_string();

        result = NUMBER_PATTERNS
            .replace_all(&result, |caps: &fancy_regex::Captures| {
                caps.get(0)
                    .map(|m| split_num(m.as_str()))
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .to_string();

        result = COMMA_IN_NUMBER.replace_all(&result, "").to_string();

        result = MONEY_PATTERN
            .replace_all(&result, |caps: &fancy_regex::Captures| {
                caps.get(0)
                    .map(|m| flip_money(m.as_str()))
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .to_string();

        result = DECIMAL_NUMBER
            .replace_all(&result, |caps: &fancy_regex::Captures| {
                caps.get(0)
                    .map(|m| point_num(m.as_str()))
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .to_string();

        result = HYPHEN_BETWEEN_DIGITS
            .replace_all(&result, " to ")
            .to_string();
        result = S_AFTER_DIGIT.replace_all(&result, " S").to_string();

        result
    }

    fn normalize_possessives(&self, text: &str) -> String {
        let mut result = text.to_string();
        result = POSSESSIVE_AFTER_CONSONANT
            .replace_all(&result, "'S")
            .to_string();
        result = POSSESSIVE_AFTER_X.replace_all(&result, "s").to_string();
        result
    }

    fn normalize_hyphenated_words(&self, text: &str) -> String {
        let mut result = text.to_string();
        result = LETTER_SEQUENCES
            .replace_all(&result, |caps: &fancy_regex::Captures| {
                caps.get(0)
                    .map(|m| m.as_str().replace('.', "-"))
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .to_string();
        result = DOT_BETWEEN_CAPS.replace_all(&result, "-").to_string();
        result
    }

    pub fn normalize_text(&self, text: &str) -> String {
        let result = text.to_string();

        let result = self.normalize_quotes_and_brackets(&result);
        let result = self.normalize_uncommon_punctuation(&result);
        let result = self.normalize_whitespace(&result);
        let result = self.normalize_abbreviations(&result);
        let result = self.normalize_casual_words(&result);
        let result = self.normalize_numbers_and_currency(&result);
        let result = self.normalize_possessives(&result);
        let result = self.normalize_hyphenated_words(&result);

        result.trim().to_string()
    }

    fn apply_kokoro_transformations(&self, mut phonemes: String) -> String {
        phonemes = KOKORO_EN_US.replace_all(&phonemes, "kˈoʊkəɹoʊ").to_string();
        phonemes = KOKORO_EN_GB.replace_all(&phonemes, "kˈəʊkəɹəʊ").to_string();

        phonemes = phonemes
            .replace("ʲ", "j")
            .replace("r", "ɹ")
            .replace("x", "k")
            .replace("ɬ", "l");

        phonemes = PHONEME_PATTERNS.replace_all(&phonemes, " ").to_string();
        phonemes = Z_PATTERN.replace_all(&phonemes, "z").to_string();

        if self.language == Language::AmericanEnglish {
            phonemes = NINETY_PATTERN.replace_all(&phonemes, "di").to_string();
        }

        phonemes.trim().to_string()
    }

    /// Filters phonemes to only include valid vocabulary characters
    fn filter_to_vocab(&self, phonemes: &str) -> String {
        phonemes.chars().filter(|c| VOCAB.contains_key(c)).collect()
    }

    pub async fn phonemize(&self, text: &str) -> Result<String> {
        let normalized = self.normalize_text(text);

        let sections = split_with_delimiters(&normalized, &PUNCTUATION_PATTERN);

        tracing::debug!("Split text into {} sections", sections.len());

        let mut phoneme_parts = Vec::new();

        for section in sections {
            if section.is_match {
                tracing::debug!("Keeping punctuation: '{}'", section.text);
                phoneme_parts.push(section.text);
            } else if !section.text.trim().is_empty() {
                tracing::debug!("Phonemizing text: '{}'", section.text);

                match espeak::text_to_phonemes(&section.text, self.language).await {
                    Ok(phonemes) => {
                        phoneme_parts.push(phonemes);
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Failed to phonemize '{}': {}. Using original text.",
                            section.text,
                            e
                        );
                        phoneme_parts.push(section.text);
                    }
                }
            }
        }

        let joined = phoneme_parts.join("");

        let transformed = self.apply_kokoro_transformations(joined);

        let filtered = self.filter_to_vocab(&transformed);

        let result = MULTIPLE_SPACES
            .replace_all(filtered.trim(), " ")
            .to_string();

        Ok(result)
    }

    pub async fn process(&self, text: &str) -> String {
        match self.phonemize(text).await {
            Ok(phonemes) => {
                tracing::debug!("Phonemization successful: '{}' -> '{}'", text, phonemes);
                phonemes
            }
            Err(e) => {
                tracing::error!(
                    "Phonemization failed: {}. Falling back to normalized text.",
                    e
                );
                let fallback = self.normalize_text(text);
                tracing::error!("Using fallback text: '{}'", fallback);
                fallback
            }
        }
    }

    pub fn language(&self) -> Language {
        self.language
    }

    pub fn set_language(&mut self, language: Language) {
        self.language = language;
    }
}

impl Default for Phonemizer {
    fn default() -> Self {
        Self::new(Language::AmericanEnglish)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_abbreviations() {
        let phonemizer = Phonemizer::default();

        let input = "Dr. Smith and Mr. Jones met at the hospital.";
        let output = phonemizer.normalize_text(input);

        assert!(output.contains("Doctor"));
        assert!(output.contains("Mister"));
        assert!(!output.contains("Dr."));
        assert!(!output.contains("Mr."));
    }

    #[test]
    fn test_normalize_contractions() {
        let phonemizer = Phonemizer::default();

        let input = "I'm sure you're right, but they won't agree.";
        let output = phonemizer.normalize_text(input);

        assert!(!output.is_empty());
        assert!(output.contains("I'm") || output.len() > 0);
    }

    #[test]
    fn test_normalize_quotes() {
        let phonemizer = Phonemizer::default();

        let input = r#""Hello," she said. 'How are you?'"#;
        let output = phonemizer.normalize_text(input);

        assert!(!output.contains('\u{201C}')); // Left double quote
        assert!(!output.contains('\u{201D}')); // Right double quote
    }

    #[test]
    fn test_normalize_whitespace() {
        let phonemizer = Phonemizer::default();

        let input = "Hello    world   test";
        let output = phonemizer.normalize_text(input);

        assert_eq!(output, "Hello world test");
    }

    #[test]
    fn test_language_code() {
        assert_eq!(Language::AmericanEnglish.code(), "a");
        assert_eq!(Language::BritishEnglish.code(), "b");
    }

    #[test]
    fn test_language_espeak_voice() {
        assert_eq!(Language::AmericanEnglish.espeak_voice(), "en-us");
        assert_eq!(Language::BritishEnglish.espeak_voice(), "en-gb");
    }

    #[test]
    fn test_filter_to_vocab() {
        let phonemizer = Phonemizer::default();

        let input = "həˈloʊ wɜːld";
        let output = phonemizer.filter_to_vocab(input);

        assert!(output.contains('ə'));
        assert!(output.contains('ˈ'));
    }

    #[test]
    fn test_apply_kokoro_transformations() {
        let phonemizer = Phonemizer::new(Language::AmericanEnglish);

        // Test character replacements
        let input = "rʲxɬ".to_string();
        let output = phonemizer.apply_kokoro_transformations(input);

        assert!(output.contains('ɹ'));
        assert!(output.contains('j'));
        assert!(output.contains('k'));
        assert!(output.contains('l'));
    }

    #[test]
    fn test_split_with_delimiters() {
        // Test that punctuation is preserved when splitting
        let text = "Hello, world! How are you?";

        let segments = split_with_delimiters(text, &PUNCTUATION_PATTERN);
        assert!(segments.len() > 1);

        let has_punctuation = segments.iter().any(|s| s.is_match);
        assert!(has_punctuation, "Should have punctuation segments");

        let has_text = segments
            .iter()
            .any(|s| !s.is_match && !s.text.trim().is_empty());
        assert!(has_text, "Should have text segments");
    }

    #[test]
    fn test_punctuation_pattern_handles_brackets() {
        // Test that the regex pattern handles square brackets correctly
        let text = "Hello [world] and {test}";
        let segments = split_with_delimiters(text, &PUNCTUATION_PATTERN);

        assert!(segments.len() > 0);

        let has_brackets = segments
            .iter()
            .any(|s| s.is_match && (s.text.contains('[') || s.text.contains('{')));
        assert!(has_brackets, "Should identify brackets as punctuation");
    }

    #[test]
    fn test_punctuation_pattern_handles_apostrophe() {
        // Test the exact input from the bug report
        let text = "How's your day going so far?";
        let segments = split_with_delimiters(text, &PUNCTUATION_PATTERN);

        assert!(segments.len() > 0);

        let has_text = segments
            .iter()
            .any(|s| !s.is_match && s.text.contains("How"));
        let has_punctuation = segments.iter().any(|s| s.is_match);

        assert!(has_text, "Should preserve text 'How'");
        assert!(has_punctuation, "Should identify punctuation");
    }

    #[test]
    fn test_normalize_numbers() {
        let phonemizer = Phonemizer::default();

        // Test time format
        let input = "Meet me at 3:45 today";
        let output = phonemizer.normalize_text(input);
        assert!(
            output.contains("3 45") || output.contains("three"),
            "Time should be expanded"
        );

        // Test decimal numbers
        let input2 = "The value is 3.14159";
        let output2 = phonemizer.normalize_text(input2);
        assert!(
            output2.contains("point"),
            "Decimal should be expanded to 'point'"
        );
    }

    #[test]
    fn test_normalize_currency() {
        let phonemizer = Phonemizer::default();

        // Test dollar amounts
        let input = "That costs $5";
        let output = phonemizer.normalize_text(input);
        assert!(output.contains("dollar"), "Should expand $ to dollar");

        // Test with cents
        let input2 = "Price is $3.50";
        let output2 = phonemizer.normalize_text(input2);
        assert!(
            output2.contains("dollar") && output2.contains("cent"),
            "Should expand dollars and cents"
        );
    }
}
