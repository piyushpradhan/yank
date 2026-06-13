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
use std::collections::HashSet;

use crate::color_names;

// CSS named colors that double as common English nouns/adjectives, so a
// bare single-token match is *not* enough evidence of color intent.
// "navy ship", "snow leopard", "tan complexion", "olive oil" all hit one of
// these words without meaning the swatch. For these, we require either a
// color marker elsewhere in the query, a raw value, or that the query
// consists *only* of color-name tokens.
//
// Single-token names not on this list (indigo, crimson, fuchsia, turquoise,
// chartreuse, aquamarine, gainsboro, …) are specific enough that the bare
// form is reliable, so they still fire as before.
static AMBIGUOUS_NAMES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "black", "white", "red", "green", "blue", "yellow", "gray", "grey",
        "brown", "pink", "purple", "orange", "navy", "tan", "snow", "plum",
        "salmon", "coral", "olive", "peru", "wheat", "khaki", "ivory", "gold",
        "silver", "beige", "lavender", "rose", "violet", "lime", "aqua",
        "magenta", "cyan", "maroon", "teal", "sienna", "thistle", "linen",
        "tomato", "chocolate", "azure", "moccasin", "bisque", "fuchsia",
        "honeydew",
    ]
    .into_iter()
    .collect()
});

// Words that signal the query is about colour even when the only colour
// reference is an ambiguous single token. The keyword forms `query_intent`
// already recognises ("color", "colors", "colour", "colours", "hex codes")
// are included here too so an ambiguous name + that keyword resolves to a
// target.
static COLOR_MARKERS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "color", "colors", "colour", "colours", "hex", "rgb", "rgba", "hsl",
        "hsla", "swatch", "swatches", "shade", "tint", "hue", "palette", "css",
    ]
    .into_iter()
    .collect()
});

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

    // Two-word CSS compounds ("dark blue", "light coral") are self-
    // disambiguating — they're not idiomatic outside a colour context — so
    // they fire regardless of the ambiguous-name gate.
    for pair in tokens.windows(2) {
        let joined = format!("{}{}", pair[0], pair[1]);
        if let Some(rgb) = color_names::named_rgb(&joined) {
            return ColorIntent { is_color: true, target: Some(rgb) };
        }
    }

    // For single tokens, the words on AMBIGUOUS_NAMES (navy, snow, tan,
    // orange, …) need extra evidence the user really means the colour:
    // either a colour marker word elsewhere in the query, or a query that
    // is *only* colour-name and marker tokens (e.g. bare "navy",
    // "red blue"). Names off that list (indigo, crimson, …) still fire on
    // a bare match.
    let has_marker = tokens
        .iter()
        .any(|t| COLOR_MARKERS.contains(&t.to_ascii_lowercase().as_str()));
    let only_color_or_marker = !tokens.is_empty()
        && tokens.iter().all(|t| {
            let lower = t.to_ascii_lowercase();
            COLOR_MARKERS.contains(&lower.as_str())
                || color_names::named_rgb(t).is_some()
        });

    for tok in &tokens {
        if let Some(rgb) = color_names::named_rgb(tok) {
            let lower = tok.to_ascii_lowercase();
            if AMBIGUOUS_NAMES.contains(&lower.as_str())
                && !has_marker
                && !only_color_or_marker
            {
                continue;
            }
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

    // -- ambiguous-name gate --------------------------------------------

    #[test]
    fn ambiguous_single_token_with_prose_is_rejected() {
        // Common English uses of CSS-color words shouldn't trigger the
        // colour-similarity boost: "navy" the military branch, "snow" the
        // weather, "tan" the skin tone, "olive" the food, "orange" the
        // fruit.
        assert_eq!(detect("navy ship documentation"), NONE);
        assert_eq!(detect("snow leopard release notes"), NONE);
        assert_eq!(detect("tan complexion notes"), NONE);
        assert_eq!(detect("olive oil recipe"), NONE);
        assert_eq!(detect("orange juice grocery list"), NONE);
        assert_eq!(detect("rose petals essay"), NONE);
        assert_eq!(detect("gold standard analysis"), NONE);
    }

    #[test]
    fn ambiguous_single_token_with_marker_is_accepted() {
        // A marker word ("color", "hex", "swatch", …) is enough context to
        // promote an otherwise-ambiguous single token.
        assert_eq!(detect("orange hex code").target, Some((255, 165, 0)));
        assert_eq!(detect("the red color from logo").target, Some((255, 0, 0)));
        assert_eq!(detect("snow swatch").target, Some((255, 250, 250)));
        assert_eq!(detect("brand palette gold").target, Some((255, 215, 0)));
    }

    #[test]
    fn ambiguous_single_token_alone_is_accepted() {
        // A query that's *just* an ambiguous color name is still a colour
        // request — there's nothing else it could mean.
        assert_eq!(detect("navy").target, Some((0, 0, 128)));
        assert_eq!(detect("red").target, Some((255, 0, 0)));
        assert_eq!(detect("Orange").target, Some((255, 165, 0)));
    }

    #[test]
    fn unambiguous_single_token_still_fires_with_prose() {
        // Names rare enough to be specific to colour ("indigo", "crimson",
        // "fuchsia", "chartreuse") stay reliable on a bare match.
        assert_eq!(detect("indigo copied from chrome").target, Some((75, 0, 130)));
        assert_eq!(detect("crimson banner").target, Some((220, 20, 60)));
        assert_eq!(detect("turquoise from figma").target, Some((64, 224, 208)));
    }

    #[test]
    fn two_word_compound_bypasses_gate() {
        // CSS compounds aren't natural English phrases, so they fire even
        // when one half is on the ambiguous list.
        assert_eq!(detect("dark blue button").target, Some((0, 0, 139)));
        assert_eq!(detect("light coral chip").target, Some((240, 128, 128)));
        assert_eq!(detect("hot pink accent").target, Some((255, 105, 180)));
    }

    #[test]
    fn raw_value_with_ambiguous_word_still_fires() {
        // The raw-value short-circuit still wins, so #abc + "navy" in the
        // same query resolves to the raw value.
        assert_eq!(detect("navy ship #ff0000").target, Some((255, 0, 0)));
    }
}
