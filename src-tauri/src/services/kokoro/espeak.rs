use anyhow::{Context, Result};
use std::time::Duration;
use tokio::process::Command;

use super::phonemizer::Language;

pub fn detect_data_path() -> Option<String> {
    if let Ok(path) = std::env::var("ESPEAK_DATA_PATH") {
        if std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }

    if let Ok(homebrew_prefix) = std::env::var("HOMEBREW_PREFIX") {
        let data_path = format!("{}/share/espeak-ng-data", homebrew_prefix);
        if std::path::Path::new(&data_path).exists() {
            return Some(data_path);
        }
    }

    if let Ok(which_output) = std::process::Command::new("which")
        .arg("espeak-ng")
        .output()
    {
        if which_output.status.success() {
            let espeak_path = String::from_utf8_lossy(&which_output.stdout)
                .trim()
                .to_string();
            tracing::debug!("Found espeak-ng at: {}", espeak_path);

            if let Some(bin_pos) = espeak_path.rfind("/bin/") {
                let prefix = &espeak_path[..bin_pos];
                let data_path = format!("{}/share/espeak-ng-data", prefix);
                if std::path::Path::new(&data_path).exists() {
                    return Some(data_path);
                }
            }
        }
    }

    if let Ok(readlink_output) = std::process::Command::new("readlink")
        .arg("-f")
        .arg("/usr/bin/espeak-ng")
        .output()
    {
        if readlink_output.status.success() {
            let espeak_path = String::from_utf8_lossy(&readlink_output.stdout)
                .trim()
                .to_string();
            if let Some(bin_pos) = espeak_path.rfind("/bin/") {
                let prefix = &espeak_path[..bin_pos];
                let data_path = format!("{}/share/espeak-ng-data", prefix);
                if std::path::Path::new(&data_path).exists() {
                    return Some(data_path);
                }
            }
        }
    }

    let common_paths = [
        "/opt/homebrew/share/espeak-ng-data",
        "/usr/local/share/espeak-ng-data",
        "/usr/share/espeak-ng-data",
    ];

    for path in &common_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let user_homebrew_paths = [
            format!("{}/homebrew/share/espeak-ng-data", home),
            format!("{}/.homebrew/share/espeak-ng-data", home),
        ];

        for path in &user_homebrew_paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }
    }

    tracing::error!("Could not detect espeak-ng data path from any known location");
    None
}

pub async fn text_to_phonemes(text: &str, language: Language) -> Result<String> {
    const MAX_TEXT_LENGTH: usize = 5000;
    if text.len() > MAX_TEXT_LENGTH {
        anyhow::bail!(
            "Text too long for phonemization: {} characters (max: {})",
            text.len(),
            MAX_TEXT_LENGTH
        );
    }

    // --ipa: Output IPA phonemes
    // -v: Voice selection
    // -q: Quiet mode (no audio output)
    let mut cmd = Command::new("espeak-ng");
    cmd.arg("--ipa")
        .arg("-v")
        .arg(language.espeak_voice())
        .arg("-q")
        .arg(text);

    let data_path = detect_data_path();

    if let Some(path) = &data_path {
        tracing::debug!("Using espeak-ng data path: {}", path);
        cmd.env("ESPEAK_DATA_PATH", path);
    } else {
        tracing::warn!("Could not detect espeak-ng data path. Phonemization may fail.");
    }

    const TIMEOUT: Duration = Duration::from_secs(10);
    let output = tokio::time::timeout(TIMEOUT, cmd.output())
        .await
        .context("espeak-ng command timed out after 10 seconds")?
        .context("Failed to execute espeak-ng command. Make sure espeak-ng is installed.")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!("espeak-ng stderr: {}", stderr);
        anyhow::bail!(
            "espeak-ng command failed: {}. Try setting ESPEAK_DATA_PATH environment variable.",
            stderr
        );
    }

    let phonemes =
        String::from_utf8(output.stdout).context("Invalid UTF-8 output from espeak-ng")?;

    tracing::debug!("espeak-ng raw output for '{}': '{}'", text, phonemes.trim());

    Ok(phonemes.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_text_to_phonemes_validates_length() {
        let long_text = "a".repeat(6000);
        let result = text_to_phonemes(&long_text, Language::AmericanEnglish).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too long"));
    }
}
