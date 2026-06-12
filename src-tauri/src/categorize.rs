use once_cell::sync::Lazy;
use regex::Regex;

use crate::color_names;

/// Shared category vocabulary. Anything that maps a query keyword back to a
/// category (see `query_intent`) must agree with this list. Test-only:
/// used by `query_intent::tests::returned_category_is_in_shared_vocab`.
#[allow(dead_code)]
pub const CATEGORIES: &[&str] = &[
    "text", "url", "email", "phone", "color", "path", "code", "number", "address", "image",
];

static RE_URL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^https?://[^\s]+$").unwrap()
});
static RE_EMAIL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$").unwrap()
});
static RE_PHONE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[+]?[\d\s\-().]{7,}$").unwrap()
});
static RE_HEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(?:#?[0-9a-fA-F]{6}|#?[0-9a-fA-F]{8}|#[0-9a-fA-F]{3})$").unwrap()
});
static RE_RGB: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(rgb|rgba|hsl|hsla|oklch|oklab)\(").unwrap()
});
static RE_PATH_WIN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[A-Za-z]:[\\/]").unwrap()
});
static RE_PATH_UNIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(/|~/|\./|\.\./)[^\s]").unwrap()
});
static RE_NUMBER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^-?\d+(\.\d+)?$").unwrap()
});
static RE_ADDRESS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\d+\s+\w.*\b(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Lane|Ln|Way|Ct|Court|Pl|Place|Ter|Terrace|Cir|Circle|Trl|Trail|Pkwy|Hwy|Fwy|Sq|Square|Loop|Plaza|Floor)\b.*,\s*[A-Z]{2}\b").unwrap()
});
static RE_CODEY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(;|=>|fn |def |const |function |import |export |use |SELECT |<[a-zA-Z])").unwrap()
});

pub fn categorize(text: &str) -> &'static str {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return "text";
    }
    let single_line = !trimmed.contains('\n');

    if single_line {
        if RE_URL.is_match(trimmed) {
            return "url";
        }
        if RE_EMAIL.is_match(trimmed) {
            return "email";
        }
        if RE_HEX.is_match(trimmed) || RE_RGB.is_match(trimmed) || color_names::is_named_color(trimmed) {
            return "color";
        }
        if RE_PATH_WIN.is_match(trimmed) || RE_PATH_UNIX.is_match(trimmed) {
            return "path";
        }
        if RE_ADDRESS.is_match(trimmed) {
            return "address";
        }
        if RE_NUMBER.is_match(trimmed) {
            return "number";
        }
        if RE_PHONE.is_match(trimmed) {
            let digits = trimmed.chars().filter(|c| c.is_ascii_digit()).count();
            if digits >= 7 && digits <= 15 {
                return "phone";
            }
        }
    }

    // Code heuristic: many lines or code-like tokens.
    let lines = trimmed.lines().count();
    if lines >= 3 && RE_CODEY.is_match(trimmed) {
        return "code";
    }
    if single_line && RE_CODEY.is_match(trimmed) && trimmed.len() < 400 {
        return "code";
    }

    "text"
}

pub fn make_preview(text: &str) -> String {
    let trimmed = text.trim();
    let first_line = trimmed.lines().next().unwrap_or("").to_string();
    if first_line.chars().count() > 160 {
        first_line.chars().take(160).collect::<String>() + "…"
    } else {
        first_line
    }
}

#[cfg(test)]
mod tests {
    use super::{categorize, make_preview};

    #[test]
    fn test_url() {
        assert_eq!(categorize("https://example.com"), "url");
        assert_eq!(categorize("http://test.org/path"), "url");
    }

    #[test]
    fn test_email() {
        assert_eq!(categorize("user@example.com"), "email");
        assert_eq!(categorize("test.user+tag@domain.org"), "email");
    }

    #[test]
    fn test_phone() {
        assert_eq!(categorize("+1 555 123 4567"), "phone");
        assert_eq!(categorize("555-1234"), "phone");
        assert_eq!(categorize("(555) 123-4567"), "phone");
    }

    #[test]
    fn test_color_hex() {
        assert_eq!(categorize("#ff0000"), "color");
        assert_eq!(categorize("#fff"), "color");
        assert_eq!(categorize("#123"), "color");
        assert_eq!(categorize("123456"), "color");
        // Bare 3-digit hex is ambiguous with plain numbers; require # prefix.
        assert_eq!(categorize("fff"), "text");
        assert_eq!(categorize("123"), "number");
        assert_eq!(categorize("abc"), "text");
    }

    #[test]
    fn test_color_rgb() {
        assert_eq!(categorize("rgb(255, 0, 0)"), "color");
        assert_eq!(categorize("hsl(120, 50%, 50%)"), "color");
    }

    #[test]
    fn test_color_named() {
        assert_eq!(categorize("red"), "color");
        assert_eq!(categorize("Blue"), "color");
        assert_eq!(categorize("navy"), "color");
        assert_eq!(categorize("REBECCAPURPLE"), "color");
    }

    #[test]
    fn test_named_color_not_false_positive() {
        // Multi-word content is a separate heuristic; single alphabetic words
        // that aren't named colors stay as text.
        assert_eq!(categorize("hello"), "text");
        assert_eq!(categorize("world"), "text");
        assert_eq!(categorize("function"), "text");
    }

    #[test]
    fn test_path_windows() {
        assert_eq!(categorize("C:\\Users\\test"), "path");
        assert_eq!(categorize("D:/folder/file.txt"), "path");
    }

    #[test]
    fn test_path_unix() {
        assert_eq!(categorize("/home/user/file"), "path");
        assert_eq!(categorize("~/Documents"), "path");
        assert_eq!(categorize("./script.sh"), "path");
    }

    #[test]
    fn test_number() {
        assert_eq!(categorize("123"), "number");
        assert_eq!(categorize("-45.67"), "number");
        assert_eq!(categorize("3.14159"), "number");
    }

    #[test]
    fn test_code() {
        assert_eq!(categorize("function foo() { return 1; }"), "code");
        assert_eq!(categorize("const x = 5;"), "code");
        assert_eq!(categorize("import React from 'react'"), "code");
        assert_eq!(categorize("SELECT * FROM users"), "code");
    }

    #[test]
    fn test_multiline_code() {
        let code = "fn main() {\n    println!(\"hello\");\n    let x = 1;\n}";
        assert_eq!(categorize(code), "code");
    }

    #[test]
    fn test_text_fallback() {
        assert_eq!(categorize("Hello world"), "text");
        assert_eq!(categorize("random text here"), "text");
    }

    #[test]
    fn test_empty() {
        assert_eq!(categorize(""), "text");
        assert_eq!(categorize("   "), "text");
    }

    #[test]
    fn test_address() {
        // The RE_ADDRESS regex targets US-format "CITY, STATE ZIP" patterns.
        // UK postcodes (e.g. "NW1 6XE") and multi-clause addresses (e.g. with
        // "Floor 3" in the middle) are not detected.
        let cases: &[(&str, &str)] = &[
            ("700 Montgomery St, San Francisco, CA 94111", "address"),
            ("123 Main St, Anytown, ST 12345", "address"),
            ("1 Infinite Loop, Cupertino, CA 95014", "address"),
            ("456 Oak Avenue, Portland, OR 97201", "address"),
            ("10 Downing St, London, UK", "address"),
        ];
        for (addr, expected) in cases {
            assert_eq!(
                categorize(addr),
                *expected,
                "address '{addr}' should be '{expected}', got '{}'",
                categorize(addr)
            );
        }
    }

    #[test]
    fn test_make_preview() {
        assert_eq!(make_preview("hello world"), "hello world");
        assert_eq!(make_preview("line1\nline2\nline3"), "line1");
    }

    #[test]
    fn test_make_preview_truncates_long_lines() {
        let long = "a".repeat(200);
        let preview = make_preview(&long);
        assert!(preview.ends_with('…'));
        assert_eq!(preview.len(), 163);
    }
}
