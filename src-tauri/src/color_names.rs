//! Lightweight color-name engine that bridges raw color values (hex, rgb,
//! hsl, etc.) to human-readable names for semantic search enrichment.
//!
//! When a clipboard item is categorised as `"color"`, the enrichment text
//! from [`enrich_color_text`] is appended to the document text that gets
//! embedded, so queries like "orange" or "navy blue" can match clips
//! containing `#ff6b35` or `rgb(0, 0, 128)`.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

// -- CSS named colors ---------------------------------------------------

static COLORS: Lazy<HashMap<&'static str, (u8, u8, u8)>> = Lazy::new(|| {
    let mut m = HashMap::with_capacity(150);
    // Basic (CSS1)
    m.insert("black", (0, 0, 0));
    m.insert("silver", (192, 192, 192));
    m.insert("gray", (128, 128, 128));
    m.insert("white", (255, 255, 255));
    m.insert("maroon", (128, 0, 0));
    m.insert("red", (255, 0, 0));
    m.insert("purple", (128, 0, 128));
    m.insert("fuchsia", (255, 0, 255));
    m.insert("green", (0, 128, 0));
    m.insert("lime", (0, 255, 0));
    m.insert("olive", (128, 128, 0));
    m.insert("yellow", (255, 255, 0));
    m.insert("navy", (0, 0, 128));
    m.insert("blue", (0, 0, 255));
    m.insert("teal", (0, 128, 128));
    m.insert("aqua", (0, 255, 255));
    // CSS2
    m.insert("orange", (255, 165, 0));
    // Extended (CSS3)
    m.insert("aliceblue", (240, 248, 255));
    m.insert("antiquewhite", (250, 235, 215));
    m.insert("aquamarine", (127, 255, 212));
    m.insert("azure", (240, 255, 255));
    m.insert("beige", (245, 245, 220));
    m.insert("bisque", (255, 228, 196));
    m.insert("blanchedalmond", (255, 235, 205));
    m.insert("blueviolet", (138, 43, 226));
    m.insert("brown", (165, 42, 42));
    m.insert("burlywood", (222, 184, 135));
    m.insert("cadetblue", (95, 158, 160));
    m.insert("chartreuse", (127, 255, 0));
    m.insert("chocolate", (210, 105, 30));
    m.insert("coral", (255, 127, 80));
    m.insert("cornflowerblue", (100, 149, 237));
    m.insert("cornsilk", (255, 248, 220));
    m.insert("crimson", (220, 20, 60));
    m.insert("cyan", (0, 255, 255));
    m.insert("darkblue", (0, 0, 139));
    m.insert("darkcyan", (0, 139, 139));
    m.insert("darkgoldenrod", (184, 134, 11));
    m.insert("darkgray", (169, 169, 169));
    m.insert("darkgreen", (0, 100, 0));
    m.insert("darkgrey", (169, 169, 169));
    m.insert("darkkhaki", (189, 183, 107));
    m.insert("darkmagenta", (139, 0, 139));
    m.insert("darkolivegreen", (85, 107, 47));
    m.insert("darkorange", (255, 140, 0));
    m.insert("darkorchid", (153, 50, 204));
    m.insert("darkred", (139, 0, 0));
    m.insert("darksalmon", (233, 150, 122));
    m.insert("darkseagreen", (143, 188, 143));
    m.insert("darkslateblue", (72, 61, 139));
    m.insert("darkslategray", (47, 79, 79));
    m.insert("darkslategrey", (47, 79, 79));
    m.insert("darkturquoise", (0, 206, 209));
    m.insert("darkviolet", (148, 0, 211));
    m.insert("deeppink", (255, 20, 147));
    m.insert("deepskyblue", (0, 191, 255));
    m.insert("dimgray", (105, 105, 105));
    m.insert("dimgrey", (105, 105, 105));
    m.insert("dodgerblue", (30, 144, 255));
    m.insert("firebrick", (178, 34, 34));
    m.insert("floralwhite", (255, 250, 240));
    m.insert("forestgreen", (34, 139, 34));
    m.insert("gainsboro", (220, 220, 220));
    m.insert("ghostwhite", (248, 248, 255));
    m.insert("gold", (255, 215, 0));
    m.insert("goldenrod", (218, 165, 32));
    m.insert("greenyellow", (173, 255, 47));
    m.insert("grey", (128, 128, 128));
    m.insert("honeydew", (240, 255, 240));
    m.insert("hotpink", (255, 105, 180));
    m.insert("indianred", (205, 92, 92));
    m.insert("indigo", (75, 0, 130));
    m.insert("ivory", (255, 255, 240));
    m.insert("khaki", (240, 230, 140));
    m.insert("lavender", (230, 230, 250));
    m.insert("lavenderblush", (255, 240, 245));
    m.insert("lawngreen", (124, 252, 0));
    m.insert("lemonchiffon", (255, 250, 205));
    m.insert("lightblue", (173, 216, 230));
    m.insert("lightcoral", (240, 128, 128));
    m.insert("lightcyan", (224, 255, 255));
    m.insert("lightgoldenrodyellow", (250, 250, 210));
    m.insert("lightgray", (211, 211, 211));
    m.insert("lightgreen", (144, 238, 144));
    m.insert("lightgrey", (211, 211, 211));
    m.insert("lightpink", (255, 182, 193));
    m.insert("lightsalmon", (255, 160, 122));
    m.insert("lightseagreen", (32, 178, 170));
    m.insert("lightskyblue", (135, 206, 250));
    m.insert("lightslategray", (119, 136, 153));
    m.insert("lightslategrey", (119, 136, 153));
    m.insert("lightsteelblue", (176, 196, 222));
    m.insert("lightyellow", (255, 255, 224));
    m.insert("limegreen", (50, 205, 50));
    m.insert("linen", (250, 240, 230));
    m.insert("magenta", (255, 0, 255));
    m.insert("mediumaquamarine", (102, 205, 170));
    m.insert("mediumblue", (0, 0, 205));
    m.insert("mediumorchid", (186, 85, 211));
    m.insert("mediumpurple", (147, 112, 219));
    m.insert("mediumseagreen", (60, 179, 113));
    m.insert("mediumslateblue", (123, 104, 238));
    m.insert("mediumspringgreen", (0, 250, 154));
    m.insert("mediumturquoise", (72, 209, 204));
    m.insert("mediumvioletred", (199, 21, 133));
    m.insert("midnightblue", (25, 25, 112));
    m.insert("mintcream", (245, 255, 250));
    m.insert("mistyrose", (255, 228, 225));
    m.insert("moccasin", (255, 228, 181));
    m.insert("navajowhite", (255, 222, 173));
    m.insert("oldlace", (253, 245, 230));
    m.insert("olivedrab", (107, 142, 35));
    m.insert("orangered", (255, 69, 0));
    m.insert("orchid", (218, 112, 214));
    m.insert("palegoldenrod", (238, 232, 170));
    m.insert("palegreen", (152, 251, 152));
    m.insert("paleturquoise", (175, 238, 238));
    m.insert("palevioletred", (219, 112, 147));
    m.insert("papayawhip", (255, 239, 213));
    m.insert("peachpuff", (255, 218, 185));
    m.insert("peru", (205, 133, 63));
    m.insert("pink", (255, 192, 203));
    m.insert("plum", (221, 160, 221));
    m.insert("powderblue", (176, 224, 230));
    m.insert("rosybrown", (188, 143, 143));
    m.insert("royalblue", (65, 105, 225));
    m.insert("saddlebrown", (139, 69, 19));
    m.insert("salmon", (250, 128, 114));
    m.insert("sandybrown", (244, 164, 96));
    m.insert("seagreen", (46, 139, 87));
    m.insert("seashell", (255, 245, 238));
    m.insert("sienna", (160, 82, 45));
    m.insert("skyblue", (135, 206, 235));
    m.insert("slateblue", (106, 90, 205));
    m.insert("slategray", (112, 128, 144));
    m.insert("slategrey", (112, 128, 144));
    m.insert("snow", (255, 250, 250));
    m.insert("springgreen", (0, 255, 127));
    m.insert("steelblue", (70, 130, 180));
    m.insert("tan", (210, 180, 140));
    m.insert("thistle", (216, 191, 216));
    m.insert("tomato", (255, 99, 71));
    m.insert("turquoise", (64, 224, 208));
    m.insert("violet", (238, 130, 238));
    m.insert("wheat", (245, 222, 179));
    m.insert("whitesmoke", (245, 245, 245));
    m.insert("yellowgreen", (154, 205, 50));
    // CSS4
    m.insert("rebeccapurple", (102, 51, 153));
    m
});

// -- Regex patterns for parsing ------------------------------------------

static RE_NAMED_COLOR_WHOLE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z]+$").unwrap()
});

// -- Public API ----------------------------------------------------------

/// Returns `true` when `text` is a known CSS named color (case-insensitive).
pub fn is_named_color(text: &str) -> bool {
    let trimmed = text.trim();
    if !RE_NAMED_COLOR_WHOLE.is_match(trimmed) {
        return false;
    }
    COLORS.contains_key(&trimmed.to_ascii_lowercase() as &str)
}

/// Parse any supported color format (hex, rgb, rgba, hsl, hsla, named) into
/// an (r, g, b) tuple. Returns `None` for unrecognised formats.
pub fn parse_color_to_rgb(text: &str) -> Option<(u8, u8, u8)> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(v) = parse_hex(trimmed) {
        return Some(v);
    }
    if let Some(v) = parse_rgb(trimmed) {
        return Some(v);
    }
    if let Some(v) = parse_hsl(trimmed) {
        return Some(v);
    }
    // Named color (exact match, case-insensitive)
    COLORS
        .get(&trimmed.to_ascii_lowercase() as &str)
        .copied()
}

/// Return up to `max` of the closest CSS named colors to the given (r,g,b),
/// ordered by Euclidean distance. If the color is an exact match for a known
/// name, only that name is returned.
pub fn closest_color_names(r: u8, g: u8, b: u8, max: usize) -> Vec<&'static str> {
    let mut dists: Vec<(&str, f64)> = COLORS
        .iter()
        .map(|(name, &(cr, cg, cb))| {
            let dr = r as f64 - cr as f64;
            let dg = g as f64 - cg as f64;
            let db = b as f64 - cb as f64;
            (*name, (dr * dr + dg * dg + db * db).sqrt())
        })
        .collect();
    dists.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

    // Exact match: return only the exact name
    if let Some((_, d)) = dists.first() {
        if *d == 0.0 {
            return vec![dists[0].0];
        }
    }

    dists.iter().take(max).map(|(n, _)| *n).collect()
}

/// Produce space-separated colour-name keywords for a raw colour clip
/// content string.  If the content is a recognised colour format, the
/// closest named colours are returned so they can be appended to the
/// embedding document text.  Returns an empty string for unparseable input.
pub fn enrich_color_text(content: &str) -> String {
    let trimmed = content.trim();
    if let Some((r, g, b)) = parse_color_to_rgb(trimmed) {
        closest_color_names(r, g, b, 4).join(" ")
    } else {
        String::new()
    }
}

// -- Parsers -------------------------------------------------------------

fn parse_hex(text: &str) -> Option<(u8, u8, u8)> {
    let hex = text.strip_prefix('#').unwrap_or(text);
    let hlen = hex.len();
    if hlen != 3 && hlen != 6 && hlen != 8 {
        return None;
    }
    // Validate all chars are hex digits
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let (r, g, b) = if hlen == 3 {
        let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
        let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
        let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
        (r, g, b)
    } else {
        let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
        (r, g, b)
    };
    Some((r, g, b))
}

fn parse_rgb(text: &str) -> Option<(u8, u8, u8)> {
    let low = text.to_ascii_lowercase();
    if !(low.starts_with("rgb(") || low.starts_with("rgba(")) {
        return None;
    }
    let inner = text.split_once('(')?.1.strip_suffix(')')?.trim();
    if inner.is_empty() {
        return None;
    }

    // Strip alpha channel: everything after last '/' or last comma if looks like alpha
    let inner = if let Some((color_part, _alpha)) = inner.rsplit_once('/') {
        color_part.trim()
    } else if inner.matches(',').count() >= 3 {
        // rgba(): trim the last comma-separated value (alpha)
        inner.rsplitn(2, ',').nth(1)?.trim()
    } else {
        inner
    };

    // Split by commas, then by spaces within each part for modern syntax
    let parts: Vec<&str> = if inner.contains(',') {
        inner.split(',').map(str::trim).filter(|s| !s.is_empty()).collect()
    } else {
        inner
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .collect()
    };

    let part_count = parts.len();
    // For space-separated notation: first 3 values are r g b
    let parts = if part_count > 3 { &parts[..3] } else { &parts };
    if parts.len() < 3 {
        return None;
    }

    let r = parse_component(parts[0])?;
    let g = parse_component(parts[1])?;
    let b = parse_component(parts[2])?;
    Some((r, g, b))
}

fn parse_hsl(text: &str) -> Option<(u8, u8, u8)> {
    let low = text.to_ascii_lowercase();
    if !(low.starts_with("hsl(") || low.starts_with("hsla(")) {
        return None;
    }
    let inner = text.split_once('(')?.1.strip_suffix(')')?.trim();
    if inner.is_empty() {
        return None;
    }

    // Strip alpha
    let inner = if let Some((color_part, _)) = inner.rsplit_once('/') {
        color_part.trim()
    } else if inner.matches(',').count() >= 3 {
        inner.rsplitn(2, ',').nth(1)?.trim()
    } else {
        inner
    };

    let parts: Vec<&str> = if inner.contains(',') {
        inner.split(',').map(str::trim).filter(|s| !s.is_empty()).collect()
    } else {
        inner
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .collect()
    };

    if parts.len() < 3 {
        return None;
    }
    let parts = &parts[..3];

    let h = parse_hue(parts[0])?;
    let s = parse_percent(parts[1])? / 100.0;
    let l = parse_percent(parts[2])? / 100.0;

    let s = s.clamp(0.0, 1.0);
    let l = l.clamp(0.0, 1.0);

    hsl_to_rgb(h, s, l)
}

fn parse_component(s: &str) -> Option<u8> {
    let s = s.trim();
    if let Some(pct) = s.strip_suffix('%') {
        let v: f64 = pct.trim().parse().ok()?;
        Some(((v / 100.0) * 255.0).round().clamp(0.0, 255.0) as u8)
    } else {
        let v: f64 = s.parse().ok()?;
        Some(v.round().clamp(0.0, 255.0) as u8)
    }
}

fn parse_hue(s: &str) -> Option<f64> {
    let s = s.trim().to_ascii_lowercase();
    let split_idx = s.find(|c: char| !c.is_ascii_digit() && c != '.' && c != '-');
    let (num_str, unit) = match split_idx {
        Some(idx) => s.split_at(idx),
        None => (s.as_str(), ""),
    };
    let val: f64 = num_str.trim().parse().ok()?;
    let unit = unit.trim();

    if unit.is_empty() || unit == "deg" {
        Some(val)
    } else if unit == "grad" {
        Some(val * 360.0 / 400.0)
    } else if unit == "rad" {
        Some(val.to_degrees())
    } else if unit == "turn" {
        Some(val * 360.0)
    } else {
        None
    }
}

fn parse_percent(s: &str) -> Option<f64> {
    let s = s.trim();
    if let Some(pct) = s.strip_suffix('%') {
        pct.trim().parse().ok()
    } else {
        s.parse().ok()
    }
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> Option<(u8, u8, u8)> {
    let h = ((h % 360.0) + 360.0) % 360.0;
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;

    let (r1, g1, b1) = match h {
        h if h < 60.0 => (c, x, 0.0),
        h if h < 120.0 => (x, c, 0.0),
        h if h < 180.0 => (0.0, c, x),
        h if h < 240.0 => (0.0, x, c),
        h if h < 300.0 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };

    Some((
        ((r1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((g1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((b1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
    ))
}

// -- Tests ---------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_hex ---

    #[test]
    fn hex_6_digit_lowercase() {
        assert_eq!(parse_hex("#ff0000"), Some((255, 0, 0)));
    }

    #[test]
    fn hex_6_digit_uppercase() {
        assert_eq!(parse_hex("#FF0000"), Some((255, 0, 0)));
    }

    #[test]
    fn hex_6_digit_no_hash() {
        assert_eq!(parse_hex("ff0000"), Some((255, 0, 0)));
    }

    #[test]
    fn hex_3_digit() {
        assert_eq!(parse_hex("#fff"), Some((255, 255, 255)));
        assert_eq!(parse_hex("#f00"), Some((255, 0, 0)));
        assert_eq!(parse_hex("#0f0"), Some((0, 255, 0)));
    }

    #[test]
    fn hex_8_digit() {
        assert_eq!(parse_hex("#ff0000ff"), Some((255, 0, 0)));
        assert_eq!(parse_hex("#00000000"), Some((0, 0, 0)));
    }

    #[test]
    fn hex_invalid() {
        assert_eq!(parse_hex("hello"), None);
        assert_eq!(parse_hex("#ggg"), None);
        assert_eq!(parse_hex("#12"), None);
        assert_eq!(parse_hex("#12345"), None);
        assert_eq!(parse_hex(""), None);
    }

    // --- parse_rgb ---

    #[test]
    fn rgb_commas() {
        assert_eq!(parse_rgb("rgb(255, 0, 0)"), Some((255, 0, 0)));
        assert_eq!(parse_rgb("rgb(0, 255, 0)"), Some((0, 255, 0)));
        assert_eq!(parse_rgb("rgb(0, 0, 255)"), Some((0, 0, 255)));
    }

    #[test]
    fn rgba_commas() {
        assert_eq!(parse_rgb("rgba(255, 0, 0, 1.0)"), Some((255, 0, 0)));
        assert_eq!(parse_rgb("rgba(255, 0, 0, 0.5)"), Some((255, 0, 0)));
        assert_eq!(parse_rgb("rgba(0, 255, 0, 0)"), Some((0, 255, 0)));
    }

    #[test]
    fn rgb_percentages() {
        let result = parse_rgb("rgb(100%, 0%, 0%)");
        assert!(result.is_some());
        let (r, g, b) = result.unwrap();
        assert!(r >= 254);
        assert_eq!(g, 0);
        assert_eq!(b, 0);
    }

    #[test]
    fn rgb_spaces() {
        assert_eq!(parse_rgb("rgb(255, 0, 0)"), Some((255, 0, 0)));
        assert_eq!(parse_rgb("rgb( 255 , 0 , 0 )"), Some((255, 0, 0)));
    }

    #[test]
    fn rgb_modern_syntax() {
        assert_eq!(parse_rgb("rgb(255 0 0)"), Some((255, 0, 0)));
        assert_eq!(parse_rgb("rgb(255 0 0 / 1)"), Some((255, 0, 0)));
    }

    // --- parse_hsl ---

    #[test]
    fn hsl_red() {
        assert_eq!(parse_hsl("hsl(0, 100%, 50%)"), Some((255, 0, 0)));
    }

    #[test]
    fn hsl_green() {
        assert_eq!(parse_hsl("hsl(120, 100%, 50%)"), Some((0, 255, 0)));
    }

    #[test]
    fn hsl_blue() {
        assert_eq!(parse_hsl("hsl(240, 100%, 50%)"), Some((0, 0, 255)));
    }

    #[test]
    fn hsl_white() {
        assert_eq!(parse_hsl("hsl(0, 0%, 100%)"), Some((255, 255, 255)));
    }

    #[test]
    fn hsl_black() {
        assert_eq!(parse_hsl("hsl(0, 0%, 0%)"), Some((0, 0, 0)));
    }

    #[test]
    fn hsla_with_alpha() {
        assert_eq!(parse_hsl("hsla(120, 100%, 50%, 1.0)"), Some((0, 255, 0)));
        assert_eq!(parse_hsl("hsla(120, 100%, 50%, 0.5)"), Some((0, 255, 0)));
    }

    #[test]
    fn hsl_modern_syntax() {
        assert_eq!(parse_hsl("hsl(120 100% 50%)"), Some((0, 255, 0)));
        assert_eq!(parse_hsl("hsl(120 100% 50% / 1)"), Some((0, 255, 0)));
    }

    #[test]
    fn hsl_hue_with_unit() {
        assert_eq!(parse_hsl("hsl(120deg, 100%, 50%)"), Some((0, 255, 0)));
    }

    // --- parse_color_to_rgb ---

    #[test]
    fn parse_named_color() {
        assert_eq!(parse_color_to_rgb("red"), Some((255, 0, 0)));
        assert_eq!(parse_color_to_rgb("RED"), Some((255, 0, 0)));
        assert_eq!(parse_color_to_rgb("navy"), Some((0, 0, 128)));
    }

    #[test]
    fn parse_dispatches_to_hex() {
        assert_eq!(parse_color_to_rgb("#ff0000"), Some((255, 0, 0)));
    }

    #[test]
    fn parse_dispatches_to_rgb() {
        assert_eq!(parse_color_to_rgb("rgb(255, 0, 0)"), Some((255, 0, 0)));
    }

    #[test]
    fn parse_dispatches_to_hsl() {
        assert_eq!(parse_color_to_rgb("hsl(0, 100%, 50%)"), Some((255, 0, 0)));
    }

    #[test]
    fn parse_unknown() {
        assert_eq!(parse_color_to_rgb("notacolor"), None);
        assert_eq!(parse_color_to_rgb(""), None);
    }

    // --- closest_color_names ---

    #[test]
    fn exact_match_returns_only_that_name() {
        let names = closest_color_names(255, 0, 0, 4);
        assert_eq!(names, vec!["red"]);
    }

    #[test]
    fn close_match_returns_multiple() {
        let names = closest_color_names(250, 10, 10, 3);
        assert_eq!(names.len(), 3);
        assert_eq!(names[0], "red"); // closest to red
    }

    #[test]
    fn hex_named_roundtrip() {
        let orange_hex = parse_color_to_rgb("#ffa500").unwrap();
        let names = closest_color_names(orange_hex.0, orange_hex.1, orange_hex.2, 1);
        assert_eq!(names[0], "orange");
    }

    // --- is_named_color ---

    #[test]
    fn known_named_color() {
        assert!(is_named_color("red"));
        assert!(is_named_color("Blue"));
        assert!(is_named_color("REBECCAPURPLE"));
    }

    #[test]
    fn not_a_named_color() {
        assert!(!is_named_color(""));
        assert!(!is_named_color("  "));
        assert!(!is_named_color("notacolor"));
        assert!(!is_named_color("#ff0000"));
        assert!(!is_named_color("rgb(255,0,0)"));
        assert!(!is_named_color("dark blue")); // multi-word not supported for category detection
    }

    // --- enrich_color_text ---

    #[test]
    fn enrich_hex_to_names() {
        let enriched = enrich_color_text("#ff0000");
        assert_eq!(enriched, "red");
    }

    #[test]
    fn enrich_rgb_to_names() {
        let enriched = enrich_color_text("rgb(0, 0, 128)");
        assert_eq!(enriched, "navy");
    }

    #[test]
    fn enrich_non_color_returns_empty() {
        assert_eq!(enrich_color_text("not a color"), "");
        assert_eq!(enrich_color_text(""), "");
    }

    #[test]
    fn enrich_orange_hex() {
        let enriched = enrich_color_text("#ffa500");
        assert_eq!(enriched, "orange");
    }

    #[test]
    fn enrich_figma_orange() {
        // Figma-style orange: #ff6b35
        let enriched = enrich_color_text("#ff6b35");
        assert!(!enriched.is_empty());
        assert!(enriched.contains("orange") || enriched.contains("coral") || enriched.contains("tomato"),
            "Expected a warm-color name, got: {enriched}");
    }

    #[test]
    fn enrich_max_four_names() {
        let enriched = enrich_color_text("#7a8b9c");
        let parts: Vec<_> = enriched.split_whitespace().collect();
        assert!(parts.len() <= 4, "expected ≤4 names, got {}", parts.len());
    }

    // --- parse_component ---

    #[test]
    fn parse_component_int() {
        assert_eq!(parse_component("255"), Some(255));
        assert_eq!(parse_component("0"), Some(0));
        assert_eq!(parse_component("128"), Some(128));
    }

    #[test]
    fn parse_component_percent() {
        assert_eq!(parse_component("100%"), Some(255));
        assert_eq!(parse_component("0%"), Some(0));
        assert_eq!(parse_component("50%"), Some(128));
    }

    #[test]
    fn parse_component_clamped() {
        assert_eq!(parse_component("300"), Some(255));
        assert_eq!(parse_component("-10"), Some(0));
        assert_eq!(parse_component("200%"), Some(255));
    }
}
