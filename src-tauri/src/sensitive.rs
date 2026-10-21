//! Offline retention rules. These recognize evidence of a secret, not arbitrary passwords.
use once_cell::sync::Lazy;
use regex::Regex;
use std::borrow::Cow;

// Scan the entire clip or skip it. Never save an unchecked suffix.
const MAX_SCAN_BYTES: usize = 1_048_576;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    CardNumber,
    SocialSecurityNumber,
    Credential,
    PrivateKey,
    ScanLimit,
}

static PRIVATE_KEY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----").unwrap()
});
static CREDENTIAL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(concat!(
        r#"(?im)(?:^|[^\p{L}\p{N}_])['\"]?(?:password|passwd|pwd|passphrase|"#,
        r#"client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|"#,
        r#"auth[_-]?token|secret[_-]?key|secret|token)['\"]?[ \t]*[:=][ \t]*"#,
        r#"(?:['\"][^'\"\r\n]+['\"]|[^\s'\",;{}]+)"#,
    ))
    .unwrap()
});
static AUTHORIZATION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:authorization|proxy-authorization)[ \t]*:[ \t]*(?:bearer|basic)[ \t]+[a-z0-9+/_.=-]+").unwrap()
});
static URL_PASSWORD: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[a-zA-Z][a-zA-Z0-9+.-]*://[^\s/:@]+:[^\s/@]+@").unwrap());
static TOKEN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(concat!(
        r"\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}",
        r"|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}",
        r"|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}",
        r"|xox[baprs]-[A-Za-z0-9-]{20,})\b",
    ))
    .unwrap()
});
static SSN_CONTEXT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(?:ssn|social[ -]+security(?:[ -]+number)?)\b").unwrap());
static NUMERIC_RUN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[0-9](?:[0-9 .-]*[0-9])?\b").unwrap());

pub fn detect(text: &str) -> Option<Reason> {
    if text.len() > MAX_SCAN_BYTES {
        return Some(Reason::ScanLimit);
    }
    if PRIVATE_KEY.is_match(text) {
        return Some(Reason::PrivateKey);
    }
    if CREDENTIAL.is_match(text)
        || AUTHORIZATION.is_match(text)
        || URL_PASSWORD.is_match(text)
        || TOKEN.is_match(text)
    {
        return Some(Reason::Credential);
    }

    let normalized = normalize_numbers(text);
    for run in NUMERIC_RUN.find_iter(&normalized) {
        let groups: Vec<&str> = run
            .as_str()
            .split([' ', '-', '.'])
            .filter(|s| !s.is_empty())
            .collect();
        let digits: Vec<u8> = run
            .as_str()
            .bytes()
            .filter(u8::is_ascii_digit)
            .map(|b| b - b'0')
            .collect();
        if (13..=19).contains(&digits.len())
            && card_grouping(&groups)
            && !digits.iter().all(|&d| d == digits[0])
            && luhn(&digits)
        {
            return Some(Reason::CardNumber);
        }
        if digits.len() == 9 && valid_ssn(&digits) {
            let formatted = groups.len() == 3 && groups.iter().map(|g| g.len()).eq([3, 2, 4]);
            let mut start = run.start().saturating_sub(64);
            let mut end = (run.end() + 64).min(normalized.len());
            while !normalized.is_char_boundary(start) {
                start += 1;
            }
            while !normalized.is_char_boundary(end) {
                end -= 1;
            }
            if formatted || (groups.len() == 1 && SSN_CONTEXT.is_match(&normalized[start..end])) {
                return Some(Reason::SocialSecurityNumber);
            }
        }
    }
    None
}

fn normalize_numbers(text: &str) -> Cow<'_, str> {
    if !text.chars().any(|c| matches!(c, '\u{00a0}' | '\u{2007}' | '\u{202f}' | '\u{2010}'..='\u{2015}' | '\u{2212}' | '\u{ff10}'..='\u{ff19}')) {
        return Cow::Borrowed(text);
    }
    Cow::Owned(
        text.chars()
            .map(|c| match c {
                '\u{00a0}' | '\u{2007}' | '\u{202f}' => ' ',
                '\u{2010}'..='\u{2015}' | '\u{2212}' => '-',
                '\u{ff10}'..='\u{ff19}' => char::from(b'0' + (c as u32 - 0xff10) as u8),
                _ => c,
            })
            .collect(),
    )
}

fn card_grouping(groups: &[&str]) -> bool {
    groups.len() == 1
        || (groups.len() >= 4
            && groups[..groups.len() - 1].iter().all(|g| g.len() == 4)
            && (1..=4).contains(&groups[groups.len() - 1].len()))
        || (groups.len() == 3
            && groups[0].len() == 4
            && groups[1].len() == 6
            && (4..=5).contains(&groups[2].len()))
}

fn luhn(digits: &[u8]) -> bool {
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| {
            let n = u32::from(d) * if i % 2 == 1 { 2 } else { 1 };
            if n > 9 {
                n - 9
            } else {
                n
            }
        })
        .sum();
    sum % 10 == 0
}

fn valid_ssn(d: &[u8]) -> bool {
    let area = u16::from(d[0]) * 100 + u16::from(d[1]) * 10 + u16::from(d[2]);
    area != 0
        && area != 666
        && area < 900
        && (d[3] != 0 || d[4] != 0)
        && d[5..].iter().any(|&n| n != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_numeric_formats_without_an_issuer_prefix_gate() {
        for value in [
            "4111111111111111",
            "2221000000000009",
            "4000000000000000006",
            "4111 1111 1111 1111",
            "4111.1111.1111.1111",
            "4111\u{a0}1111\u{a0}1111\u{a0}1111",
            "３７８２８２２４６３１０００５",
            "3782-822463-10005",
            "card: 4111111111111111\nthanks",
        ] {
            assert_eq!(detect(value), Some(Reason::CardNumber), "{value}");
        }
        for value in [
            "123-45-6789",
            "123 45 6789",
            "SSN: 123456789",
            "123456789 (social security number)",
            "日本語 ssn: 123456789",
        ] {
            assert_eq!(detect(value), Some(Reason::SocialSecurityNumber), "{value}");
        }
    }

    #[test]
    fn keeps_ordinary_copies_and_invalid_numeric_candidates() {
        for value in [
            "orange",
            "correct horse battery staple",
            "42",
            "123456789",
            "order: 123456789",
            "+1 555 123 4567",
            "2026-10-21",
            "#ffffff",
            "0000000000000000",
            "1111111111111111",
            "4111111111111112",
            "14111111111111111",
            "41111111111111110000",
            "000-12-3456",
            "666-12-3456",
            "900-12-3456",
            "123-00-3456",
            "123-45-0000",
            "password length",
            "password = \"\"",
            "api_key: ''",
            "-----BEGIN PUBLIC KEY-----",
            "b4ab013d-61ad-4d9d-840f-cf15d56ed820",
            "support@example.com",
        ] {
            assert_eq!(detect(value), None, "{value}");
        }
    }

    #[test]
    fn recognizes_labeled_weak_secrets_and_structured_credentials() {
        for value in [
            "password=orange",
            r#"{"password": "orange"}"#,
            "export API_KEY=short",
            "client_secret: 1234",
            "Authorization: Bearer eyJ0ZXN0",
            "https://user:pass@example.com",
            "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
            "sk_live_abcdefghijklmnop",
            "sk-proj-abcdefghijklmnopqrstuvwxyz",
            "xoxb-1234567890-1234567890-abc",
        ] {
            assert_eq!(detect(value), Some(Reason::Credential), "{value}");
        }
        assert_eq!(
            detect("-----BEGIN OPENSSH PRIVATE KEY-----"),
            Some(Reason::PrivateKey)
        );
    }

    #[test]
    fn scans_the_full_clip_and_skips_over_budget() {
        let mut text = "ordinary text\n".repeat(2000);
        text.push_str("password=orange");
        assert_eq!(detect(&text), Some(Reason::Credential));
        assert_eq!(
            detect(&"x".repeat(MAX_SCAN_BYTES + 1)),
            Some(Reason::ScanLimit)
        );
    }
}
