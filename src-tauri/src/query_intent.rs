//! Offline parser that pulls content-category intent ("urls", "numbers",
//! "code snippets") and clipboard-action filler ("I copied", "I yanked")
//! out of a search query so the residue that hits the embedder represents
//! what the user actually wants, not how they described the act of
//! clipping it.
//!
//! Mirrors the shape of [`crate::query_time::parse`] — runs after time
//! parsing on the residue it leaves, returns the meaningful tail plus an
//! optional category that becomes a SQL filter in `search_semantic`.
//!
//! Multi-category intent ("links and numbers") is not handled — the first
//! match in the string wins.

use once_cell::sync::Lazy;
use regex::Regex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedIntent {
    pub semantic: String,
    pub category: Option<&'static str>,
}

// Specific phrases listed before their general forms so leftmost-first
// alternation picks the stronger signal ("phone numbers" beats "numbers").
static RE_CATEGORY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(phone\s+numbers?|phones?|email\s+addresses?|emails?|hex\s+codes?|colou?rs?|urls?|links?|websites?|code\s+snippets?|snippets?|code|file\s+paths?|paths?|files?|street\s+addresses?|addresses?|numbers?|screenshots?|pictures?|images?)\b",
    )
    .expect("category regex compiles")
});

// Generic filler: "(that)? (the ones)? I {verb}". Every clipboard item
// was, by definition, copied/yanked/saved — so the verb phrase carries no
// signal and BGE just averages it into the query embedding as noise.
static RE_FILLER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(?:that\s+)?(?:the\s+ones?\s+)?i\s+(?:copied|yanked|saved|had|wrote|made|took|want(?:ed)?|need(?:ed)?|kept|grabbed)\b",
    )
    .expect("filler regex compiles")
});

/// Remove only the recognised category keyword from the query, leaving
/// filler verbs and time phrases intact. Used by the `strip_category`
/// Tauri command when the user dismisses the category chip — we want
/// their search bar to mirror what they typed, minus the keyword.
pub fn strip_category(query: &str) -> String {
    match RE_CATEGORY.find(query) {
        Some(m) => collapse_ws(&strip(query, m.start(), m.end())),
        None => query.to_string(),
    }
}

pub fn parse(query: &str) -> ParsedIntent {
    let (residue, category) = match RE_CATEGORY.find(query) {
        Some(m) => {
            let cat = classify(m.as_str());
            let stripped = strip(query, m.start(), m.end());
            (stripped, Some(cat))
        }
        None => (query.to_string(), None),
    };
    let de_fillered = RE_FILLER.replace_all(&residue, " ").into_owned();
    ParsedIntent {
        semantic: collapse_ws(&de_fillered),
        category,
    }
}

fn classify(matched: &str) -> &'static str {
    let lower = matched.to_ascii_lowercase();
    let normalized: String = lower.split_whitespace().collect::<Vec<_>>().join(" ");
    match normalized.as_str() {
        "phone" | "phones" | "phone number" | "phone numbers" => "phone",
        "email" | "emails" | "email address" | "email addresses" => "email",
        "color" | "colors" | "colour" | "colours" | "hex code" | "hex codes" => "color",
        "url" | "urls" | "link" | "links" | "website" | "websites" => "url",
        "code" | "snippet" | "snippets" | "code snippet" | "code snippets" => "code",
        "path" | "paths" | "file" | "files" | "file path" | "file paths" => "path",
        "address" | "addresses" | "street address" | "street addresses" => "address",
        "number" | "numbers" => "number",
        "image" | "images" | "picture" | "pictures" | "screenshot" | "screenshots" => "image",
        _ => "text",
    }
}

fn strip(query: &str, start: usize, end: usize) -> String {
    let mut out = String::with_capacity(query.len());
    out.push_str(&query[..start]);
    out.push(' ');
    out.push_str(&query[end..]);
    out
}

fn collapse_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = true;
    for c in s.chars() {
        if c.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(c);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn extracts_number_category_and_strips_filler() {
        // The user-facing bug from the plan: "numbers I copied" must shed
        // both the category keyword *and* the filler verb so the residue
        // (here, just the leftover time phrase yet to be parsed) is clean.
        let p = parse("numbers I copied yesterday");
        assert_eq!(p.category, Some("number"));
        assert_eq!(p.semantic, "yesterday");
    }

    #[test]
    fn handles_links_synonym_for_url() {
        let p = parse("links I yanked");
        assert_eq!(p.category, Some("url"));
        assert_eq!(p.semantic, "");
    }

    #[test]
    fn phone_numbers_beats_numbers() {
        let p = parse("phone numbers I saved last week");
        assert_eq!(p.category, Some("phone"));
        assert_eq!(p.semantic, "last week");
    }

    #[test]
    fn unrelated_noun_keeps_residue_only_strips_filler() {
        // "function" isn't a category keyword, so nothing routes by type
        // but the "I copied" filler still has to go.
        let p = parse("that one rust function I copied");
        assert_eq!(p.category, None);
        assert_eq!(p.semantic, "that one rust function");
    }

    #[test]
    fn bare_category_keyword() {
        let p = parse("colors");
        assert_eq!(p.category, Some("color"));
        assert_eq!(p.semantic, "");
    }

    #[test]
    fn category_keyword_in_middle_keeps_residue() {
        // Bare "numbers" still routes the query, but the surrounding
        // phrase is preserved as the embedded residue.
        let p = parse("the numbers in chapter 3");
        assert_eq!(p.category, Some("number"));
        assert_eq!(p.semantic, "the in chapter 3");
    }

    #[test]
    fn no_intent_passes_through() {
        let p = parse("stripe webhook signature");
        assert_eq!(p.category, None);
        assert_eq!(p.semantic, "stripe webhook signature");
    }

    #[test]
    fn the_ones_i_filler() {
        let p = parse("the ones I saved");
        assert_eq!(p.category, None);
        assert_eq!(p.semantic, "");
    }

    #[test]
    fn colour_british_spelling() {
        let p = parse("colour");
        assert_eq!(p.category, Some("color"));
    }

    #[test]
    fn code_keyword_does_not_match_inside_word() {
        // "decode" must not trigger code-category routing.
        let p = parse("how to decode base64");
        assert_eq!(p.category, None);
        assert_eq!(p.semantic, "how to decode base64");
    }

    #[test]
    fn case_insensitive_and_punctuation_safe() {
        let p = parse("URLs I COPIED");
        assert_eq!(p.category, Some("url"));
        assert_eq!(p.semantic, "");
    }

    #[test]
    fn screenshot_maps_to_image() {
        let p = parse("screenshots");
        assert_eq!(p.category, Some("image"));
    }

    #[test]
    fn returned_category_is_in_shared_vocab() {
        // Belt-and-braces: every category we emit must be a real
        // categorize.rs label, otherwise the SQL filter would silently
        // match nothing.
        for q in [
            "phone numbers", "emails", "colors", "urls", "code", "paths",
            "addresses", "numbers", "images",
        ] {
            let cat = parse(q).category.expect("category extracted");
            assert!(
                crate::categorize::CATEGORIES.contains(&cat),
                "category {cat:?} from query {q:?} not in CATEGORIES",
            );
        }
    }
}
