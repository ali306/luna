use std::collections::HashMap;
use std::sync::LazyLock;

pub static VOCAB: LazyLock<HashMap<char, usize>> = LazyLock::new(|| {
    let pad = "$";
    let punctuation = ";:,.!?¡¿—…\"«»\u{201C}\u{201D} ";
    let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let letters_ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";

    let symbols: String = [pad, punctuation, letters, letters_ipa].concat();

    symbols
        .chars()
        .enumerate()
        .map(|(idx, c)| (c, idx))
        .collect()
});

pub static REVERSE_VOCAB: LazyLock<HashMap<usize, char>> =
    LazyLock::new(|| VOCAB.iter().map(|(&c, &idx)| (idx, c)).collect());

#[allow(dead_code)]
pub fn print_sorted_reverse_vocab() {
    let mut sorted_keys: Vec<_> = REVERSE_VOCAB.keys().collect();
    sorted_keys.sort();

    for key in sorted_keys {
        eprintln!("{}: {}", key, REVERSE_VOCAB[key]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vocab_contains_basics() {
        assert!(VOCAB.contains_key(&'a'));
        assert!(VOCAB.contains_key(&'ə'));
        assert!(VOCAB.contains_key(&'ˈ'));
        assert!(VOCAB.contains_key(&' '));
    }

    #[test]
    fn test_vocab_size() {
        assert!(VOCAB.len() > 100);
    }
}
