//! Detects when a search query is *explicitly* asking for a color and, when
//! possible, resolves the request to a concrete RGB target.
//!
//! [`crate::query_intent`] already catches the generic keyword forms
//! ("colors", "hex codes") and routes them to the `color` category. What it
//! misses is the far more common way people actually search for a swatch:
//! by *name* ("indigo", "navy blue") or by pasting the value itself
//! ("#4b0082", "rgb(75, 0, 130)"). None of those contain the literal word
//! "color", so the old pipeline embedded them as plain text and let the real
//! color clip compete on equal footing with prose that merely mentions
//! colour.
//!
//! When we recognise a color request here, `search_semantic` ranks stored
//! `color` clips by perceptual closeness to [`ColorIntent::target`] — so the
//! actual value the user copied surfaces, not a code block about colours.

use once_cell::sync::Lazy;
use regex::Regex;

use crate::color_names;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColorIntent {
    /// `true` when the query references a color by name or by raw value.
    pub is_color: bool,
    /// The concrete color the user asked for, resolved to RGB. `Some` for
    /// named colors and raw hex/rgb/hsl values; this is what the
    /// similarity boost ranks stored clips against.
    pub target: Option<(u8, u8, u8)>,
}

const NONE: ColorIntent = ColorIntent { is_color: false, target: None };

// Raw color values embedded anywhere in the query: `#abc`/`#aabbcc`/8-digit
// hex, or a functional `rgb()/rgba()/hsl()/hsla()` form. We let
// `parse_color_to_rgb` validate the capture so a stray `#deadbeef`-style word
// that isn't a real length is rejected.
static RE_RAW: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)")
        .expect("raw color regex compiles")
});

/// Inspect a raw search query for explicit color intent.
pub fn detect(query: &str) -> ColorIntent {
    // 1. A raw value wins — it's the least ambiguous signal.
    if let Some(rgb) = find_raw_value(query) {
        return ColorIntent { is_color: true, target: Some(rgb) };
    }

    // 2. A CSS named color token. Two-word forms ("dark blue" -> "darkblue")
    //    are checked before single tokens so the more specific name wins.
    let tokens: Vec<&str> = query
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|t| !t.is_empty())
        .collect();

    for pair in tokens.windows(2) {
        let joined = format!("{}{}", pair[0], pair[1]);
        if let Some(rgb) = color_names::named_rgb(&joined) {
            return ColorIntent { is_color: true, target: Some(rgb) };
        }
    }
    for tok in &tokens {
        if let Some(rgb) = color_names::named_rgb(tok) {
            return ColorIntent { is_color: true, target: Some(rgb) };
        }
    }

    NONE
}

fn find_raw_value(query: &str) -> Option<(u8, u8, u8)> {
    RE_RAW
        .find_iter(query)
        .find_map(|m| color_names::parse_color_to_rgb(m.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_color_resolves_to_target() {
        let c = detect("indigo copied from chrome");
        assert!(c.is_color);
        assert_eq!(c.target, Some((75, 0, 130)));
    }

    #[test]
    fn bare_named_color() {
        assert_eq!(detect("navy").target, Some((0, 0, 128)));
    }

    #[test]
    fn two_word_named_color_beats_single() {
        // "dark blue" -> "darkblue" (0,0,139), not plain "blue" (0,0,255).
        assert_eq!(detect("the dark blue one").target, Some((0, 0, 139)));
    }

    #[test]
    fn raw_hex_value() {
        let c = detect("that #4b0082 swatch");
        assert!(c.is_color);
        assert_eq!(c.target, Some((75, 0, 130)));
    }

    #[test]
    fn raw_rgb_value() {
        assert_eq!(detect("rgb(75, 0, 130) from figma").target, Some((75, 0, 130)));
    }

    #[test]
    fn raw_value_wins_over_stray_name() {
        // Raw value is the stronger signal even if a name appears too.
        assert_eq!(detect("red but actually #0000ff").target, Some((0, 0, 255)));
    }

    #[test]
    fn no_color_intent() {
        assert_eq!(detect("stripe webhook signature"), NONE);
        assert_eq!(detect("the rust function I wrote"), NONE);
    }

    #[test]
    fn name_must_be_whole_token() {
        // "redis" contains "red" but is not the color red.
        assert_eq!(detect("redis config"), NONE);
        // "tangerine" contains "tan" but isn't a CSS color name.
        assert_eq!(detect("tangerine dream"), NONE);
    }

    #[test]
    fn case_insensitive() {
        assert_eq!(detect("CRIMSON banner").target, Some((220, 20, 60)));
    }
}
