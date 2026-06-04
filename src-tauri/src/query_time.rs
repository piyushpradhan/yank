//! Offline natural-language date phrase parser for search queries.
//!
//! Recognises common English time expressions ("4 days ago", "yesterday",
//! "last week", "5th January", "in March 2025", ISO dates, "last Friday")
//! and returns a `(from, to)` ms window plus the residue with the matched
//! phrase stripped. Runs entirely offline.

use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, TimeZone, Weekday};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TimeWindow {
    #[serde(rename = "fromMs")]
    pub from_ms: i64,
    #[serde(rename = "toMs")]
    pub to_ms: i64,
    pub label: String,
    #[serde(skip_serializing)]
    pub matched_span: (usize, usize),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedQuery {
    pub semantic: String,
    pub time: Option<TimeWindow>,
}

pub fn parse(now: DateTime<Local>, query: &str) -> ParsedQuery {
    let lower = query.to_ascii_lowercase();
    if let Some(tw) = parse_single(&lower, now) {
        let semantic = strip(query, tw.matched_span);
        return ParsedQuery { semantic, time: Some(tw) };
    }
    ParsedQuery {
        semantic: query.trim().to_string(),
        time: None,
    }
}

fn strip(query: &str, (start, end): (usize, usize)) -> String {
    let mut joined = String::with_capacity(query.len());
    joined.push_str(&query[..start]);
    joined.push(' ');
    joined.push_str(&query[end..]);
    collapse_ws(&joined)
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

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

fn day_range_ms(date: NaiveDate) -> (i64, i64) {
    let start = date.and_hms_opt(0, 0, 0).expect("midnight exists");
    let end = (date + Duration::days(1))
        .and_hms_opt(0, 0, 0)
        .expect("next midnight exists");
    let start_local = Local
        .from_local_datetime(&start)
        .earliest()
        .unwrap_or_else(Local::now);
    let end_local = Local
        .from_local_datetime(&end)
        .earliest()
        .unwrap_or_else(Local::now);
    (start_local.timestamp_millis(), end_local.timestamp_millis() - 1)
}

fn week_range(d: NaiveDate) -> (i64, i64) {
    let dow = d.weekday().num_days_from_monday() as i64;
    let monday = d - Duration::days(dow);
    let sunday = monday + Duration::days(6);
    let (from, _) = day_range_ms(monday);
    let (_, to) = day_range_ms(sunday);
    (from, to)
}

fn month_range(y: i32, m: u32) -> Option<(i64, i64)> {
    let first = NaiveDate::from_ymd_opt(y, m, 1)?;
    let next = if m == 12 {
        NaiveDate::from_ymd_opt(y + 1, 1, 1)?
    } else {
        NaiveDate::from_ymd_opt(y, m + 1, 1)?
    };
    let (from, _) = day_range_ms(first);
    let (_, to) = day_range_ms(next - Duration::days(1));
    Some((from, to))
}

fn year_range(y: i32) -> (i64, i64) {
    let first = NaiveDate::from_ymd_opt(y, 1, 1).expect("jan 1");
    let last = NaiveDate::from_ymd_opt(y, 12, 31).expect("dec 31");
    let (from, _) = day_range_ms(first);
    let (_, to) = day_range_ms(last);
    (from, to)
}

fn month_num(s: &str) -> Option<u32> {
    Some(match s {
        "january" | "jan" => 1,
        "february" | "feb" => 2,
        "march" | "mar" => 3,
        "april" | "apr" => 4,
        "may" => 5,
        "june" | "jun" => 6,
        "july" | "jul" => 7,
        "august" | "aug" => 8,
        "september" | "sep" | "sept" => 9,
        "october" | "oct" => 10,
        "november" | "nov" => 11,
        "december" | "dec" => 12,
        _ => return None,
    })
}

fn weekday_of(s: &str) -> Option<Weekday> {
    Some(match s {
        "monday" => Weekday::Mon,
        "tuesday" => Weekday::Tue,
        "wednesday" => Weekday::Wed,
        "thursday" => Weekday::Thu,
        "friday" => Weekday::Fri,
        "saturday" => Weekday::Sat,
        "sunday" => Weekday::Sun,
        _ => return None,
    })
}

/// Most recent occurrence of `target` weekday at or before `today`,
/// excluding `today` itself — "last Friday" said on Friday means the
/// Friday a week ago.
fn most_recent_weekday(today: NaiveDate, target: Weekday) -> NaiveDate {
    let cur = today.weekday().num_days_from_monday() as i64;
    let tgt = target.num_days_from_monday() as i64;
    let mut diff = cur - tgt;
    if diff <= 0 {
        diff += 7;
    }
    today - Duration::days(diff)
}

/// Pick the most plausible year for a bare month-day phrase: current
/// year if that date is on or before today, otherwise previous year.
fn year_for(today: NaiveDate, month: u32, day: u32) -> i32 {
    let y = today.year();
    match NaiveDate::from_ymd_opt(y, month, day) {
        Some(d) if d <= today => y,
        _ => y - 1,
    }
}

fn span(m: &regex::Captures) -> (usize, usize) {
    let full = m.get(0).expect("full match present");
    (full.start(), full.end())
}

// ---------------------------------------------------------------------------
// Patterns (priority order, first match wins)
// ---------------------------------------------------------------------------

const MONTH_ALT: &str = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const WEEKDAY_ALT: &str = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";

static RE_ISO: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(\d{4})-(\d{2})-(\d{2})\b").unwrap());

static RE_DAY_MONTH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({MONTH_ALT})(?:[,\s]+(\d{{4}}))?\b"
    ))
    .unwrap()
});

static RE_MONTH_DAY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"\b({MONTH_ALT})\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:[,\s]+(\d{{4}}))?\b"
    ))
    .unwrap()
});

static RE_IN_MONTH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"\bin\s+({MONTH_ALT})(?:\s+(\d{{4}}))?\b"
    ))
    .unwrap()
});

static RE_IN_YEAR: Lazy<Regex> = Lazy::new(|| Regex::new(r"\bin\s+(\d{4})\b").unwrap());

static RE_RELATIVE_AGO: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago\b").unwrap()
});

static RE_YESTERDAY: Lazy<Regex> = Lazy::new(|| Regex::new(r"\byesterday\b").unwrap());
static RE_TODAY: Lazy<Regex> = Lazy::new(|| Regex::new(r"\btoday\b").unwrap());

static RE_THIS_LAST_UNIT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(this|last|past)\s+(week|month|year)\b").unwrap());

static RE_THIS_LAST_WEEKDAY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"\b(this|last|past|on)\s+({WEEKDAY_ALT})\b"
    ))
    .unwrap()
});

fn parse_single(lower: &str, now: DateTime<Local>) -> Option<TimeWindow> {
    let today = now.date_naive();

    // ISO date (most specific).
    if let Some(c) = RE_ISO.captures(lower) {
        if let (Ok(y), Ok(mo), Ok(d)) = (
            c[1].parse::<i32>(),
            c[2].parse::<u32>(),
            c[3].parse::<u32>(),
        ) {
            if let Some(date) = NaiveDate::from_ymd_opt(y, mo, d) {
                let (from, to) = day_range_ms(date);
                return Some(TimeWindow {
                    from_ms: from,
                    to_ms: to,
                    label: date.format("%b %-d, %Y").to_string(),
                    matched_span: span(&c),
                });
            }
        }
    }

    // "5th January" / "5 Jan 2025"
    if let Some(c) = RE_DAY_MONTH.captures(lower) {
        if let (Ok(d), Some(mo)) = (c[1].parse::<u32>(), month_num(&c[2])) {
            let y = c
                .get(3)
                .and_then(|m| m.as_str().parse::<i32>().ok())
                .unwrap_or_else(|| year_for(today, mo, d));
            if let Some(date) = NaiveDate::from_ymd_opt(y, mo, d) {
                let (from, to) = day_range_ms(date);
                return Some(TimeWindow {
                    from_ms: from,
                    to_ms: to,
                    label: date.format("%b %-d, %Y").to_string(),
                    matched_span: span(&c),
                });
            }
        }
    }

    // "January 5, 2025"
    if let Some(c) = RE_MONTH_DAY.captures(lower) {
        if let (Some(mo), Ok(d)) = (month_num(&c[1]), c[2].parse::<u32>()) {
            let y = c
                .get(3)
                .and_then(|m| m.as_str().parse::<i32>().ok())
                .unwrap_or_else(|| year_for(today, mo, d));
            if let Some(date) = NaiveDate::from_ymd_opt(y, mo, d) {
                let (from, to) = day_range_ms(date);
                return Some(TimeWindow {
                    from_ms: from,
                    to_ms: to,
                    label: date.format("%b %-d, %Y").to_string(),
                    matched_span: span(&c),
                });
            }
        }
    }

    // "in March 2025"
    if let Some(c) = RE_IN_MONTH.captures(lower) {
        if let Some(mo) = month_num(&c[1]) {
            let y = c
                .get(2)
                .and_then(|m| m.as_str().parse::<i32>().ok())
                .unwrap_or(today.year());
            if let Some((from, to)) = month_range(y, mo) {
                let label = NaiveDate::from_ymd_opt(y, mo, 1)
                    .map(|d| d.format("%B %Y").to_string())
                    .unwrap_or_default();
                return Some(TimeWindow {
                    from_ms: from,
                    to_ms: to,
                    label,
                    matched_span: span(&c),
                });
            }
        }
    }

    // "in 2024"
    if let Some(c) = RE_IN_YEAR.captures(lower) {
        if let Ok(y) = c[1].parse::<i32>() {
            let (from, to) = year_range(y);
            return Some(TimeWindow {
                from_ms: from,
                to_ms: to,
                label: y.to_string(),
                matched_span: span(&c),
            });
        }
    }

    // "4 days ago"
    if let Some(c) = RE_RELATIVE_AGO.captures(lower) {
        if let Ok(n) = c[1].parse::<i64>() {
            let unit = &c[2];
            let (from, to, label) = match unit {
                "minute" => {
                    let p = now - Duration::minutes(n);
                    let s = (p - Duration::minutes(30)).timestamp_millis();
                    let e = (p + Duration::minutes(30)).timestamp_millis();
                    (s, e, format!("{} min ago", n))
                }
                "hour" => {
                    let p = now - Duration::hours(n);
                    let s = (p - Duration::hours(1)).timestamp_millis();
                    let e = (p + Duration::hours(1)).timestamp_millis();
                    (s, e, format!("{} hr ago", n))
                }
                "day" => {
                    let d = (now - Duration::days(n)).date_naive();
                    let (s, e) = day_range_ms(d);
                    (s, e, format!("{} day{} ago", n, if n == 1 { "" } else { "s" }))
                }
                "week" => {
                    let d = (now - Duration::weeks(n)).date_naive();
                    let (s, e) = week_range(d);
                    (s, e, format!("{} week{} ago", n, if n == 1 { "" } else { "s" }))
                }
                "month" => {
                    let mut y = today.year();
                    let mut m = today.month() as i64 - n;
                    while m <= 0 {
                        m += 12;
                        y -= 1;
                    }
                    let (s, e) = month_range(y, m as u32)?;
                    (s, e, format!("{} month{} ago", n, if n == 1 { "" } else { "s" }))
                }
                "year" => {
                    let y = today.year() - n as i32;
                    let (s, e) = year_range(y);
                    (s, e, format!("{} year{} ago", n, if n == 1 { "" } else { "s" }))
                }
                _ => return None,
            };
            return Some(TimeWindow {
                from_ms: from,
                to_ms: to,
                label,
                matched_span: span(&c),
            });
        }
    }

    if let Some(c) = RE_YESTERDAY.captures(lower) {
        let d = today - Duration::days(1);
        let (from, to) = day_range_ms(d);
        return Some(TimeWindow {
            from_ms: from,
            to_ms: to,
            label: "yesterday".to_string(),
            matched_span: span(&c),
        });
    }

    if let Some(c) = RE_TODAY.captures(lower) {
        let (from, to) = day_range_ms(today);
        return Some(TimeWindow {
            from_ms: from,
            to_ms: to,
            label: "today".to_string(),
            matched_span: span(&c),
        });
    }

    // "this/last/past week|month|year"
    if let Some(c) = RE_THIS_LAST_UNIT.captures(lower) {
        let is_this = &c[1] == "this";
        let unit = &c[2];
        let (from, to, label) = match unit {
            "week" => {
                let d = if is_this { today } else { today - Duration::days(7) };
                let (f, t) = week_range(d);
                (
                    f,
                    t,
                    if is_this { "this week".to_string() } else { "last week".to_string() },
                )
            }
            "month" => {
                let (y, m) = if is_this {
                    (today.year(), today.month())
                } else {
                    let mut y = today.year();
                    let mut m = today.month() as i32 - 1;
                    if m < 1 {
                        m = 12;
                        y -= 1;
                    }
                    (y, m as u32)
                };
                let (f, t) = month_range(y, m)?;
                let label = if is_this {
                    "this month".to_string()
                } else {
                    NaiveDate::from_ymd_opt(y, m, 1)
                        .map(|d| d.format("%B %Y").to_string())
                        .unwrap_or_else(|| "last month".to_string())
                };
                (f, t, label)
            }
            "year" => {
                let y = if is_this { today.year() } else { today.year() - 1 };
                let (f, t) = year_range(y);
                (f, t, y.to_string())
            }
            _ => return None,
        };
        return Some(TimeWindow {
            from_ms: from,
            to_ms: to,
            label,
            matched_span: span(&c),
        });
    }

    // "this/last/past/on Monday"
    if let Some(c) = RE_THIS_LAST_WEEKDAY.captures(lower) {
        if let Some(wd) = weekday_of(&c[2]) {
            let d = most_recent_weekday(today, wd);
            let (from, to) = day_range_ms(d);
            return Some(TimeWindow {
                from_ms: from,
                to_ms: to,
                label: d.format("%A, %b %-d").to_string(),
                matched_span: span(&c),
            });
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn frozen_now() -> DateTime<Local> {
        // 2026-06-03 12:00:00 local — a Wednesday.
        Local.with_ymd_and_hms(2026, 6, 3, 12, 0, 0).unwrap()
    }

    fn day_ms(y: i32, m: u32, d: u32) -> (i64, i64) {
        day_range_ms(NaiveDate::from_ymd_opt(y, m, d).unwrap())
    }

    #[test]
    fn four_days_ago_alone() {
        let p = parse(frozen_now(), "4 days ago");
        let tw = p.time.expect("time parsed");
        assert_eq!(p.semantic, "");
        let (f, t) = day_ms(2026, 5, 30);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
        assert_eq!(tw.label, "4 days ago");
    }

    #[test]
    fn website_link_four_days_ago_strips_phrase() {
        let p = parse(frozen_now(), "the website link I copied 4 days ago");
        assert_eq!(p.semantic, "the website link I copied");
        assert!(p.time.is_some());
    }

    #[test]
    fn yesterday_alone() {
        let p = parse(frozen_now(), "yesterday");
        let tw = p.time.expect("time parsed");
        assert_eq!(p.semantic, "");
        let (f, t) = day_ms(2026, 6, 2);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
    }

    #[test]
    fn last_week_range() {
        // today = Wed 2026-06-03; current week Mon=06-01 .. Sun=06-07
        // last week Mon=05-25 .. Sun=05-31
        let p = parse(frozen_now(), "last week");
        let tw = p.time.expect("time parsed");
        let (f, _) = day_ms(2026, 5, 25);
        let (_, t) = day_ms(2026, 5, 31);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
        assert_eq!(tw.label, "last week");
    }

    #[test]
    fn fifth_january_uses_current_year_when_past() {
        let p = parse(frozen_now(), "5th January");
        let tw = p.time.expect("time parsed");
        let (f, t) = day_ms(2026, 1, 5);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
    }

    #[test]
    fn fifth_december_uses_previous_year_when_future() {
        let p = parse(frozen_now(), "5th December");
        let tw = p.time.expect("time parsed");
        let (f, t) = day_ms(2025, 12, 5);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
    }

    #[test]
    fn in_march_2025_full_month_window() {
        let p = parse(frozen_now(), "the slides from in March 2025");
        let tw = p.time.expect("time parsed");
        let (f, _) = day_ms(2025, 3, 1);
        let (_, t) = day_ms(2025, 3, 31);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
        assert_eq!(p.semantic, "the slides from");
        assert_eq!(tw.label, "March 2025");
    }

    #[test]
    fn iso_date_window() {
        let p = parse(frozen_now(), "2025-12-31");
        let tw = p.time.expect("time parsed");
        let (f, t) = day_ms(2025, 12, 31);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
    }

    #[test]
    fn last_friday_with_filler() {
        // today = Wed 2026-06-03; last Friday = 2026-05-29
        let p = parse(frozen_now(), "links from last Friday");
        let tw = p.time.expect("time parsed");
        let (f, t) = day_ms(2026, 5, 29);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
        assert_eq!(p.semantic, "links from");
    }

    #[test]
    fn no_time_phrase_preserved() {
        let p = parse(frozen_now(), "stripe webhook implementation");
        assert!(p.time.is_none());
        assert_eq!(p.semantic, "stripe webhook implementation");
    }

    #[test]
    fn today_keyword() {
        let p = parse(frozen_now(), "today");
        let tw = p.time.expect("time parsed");
        let (f, t) = day_ms(2026, 6, 3);
        assert_eq!(tw.from_ms, f);
        assert_eq!(tw.to_ms, t);
    }

    #[test]
    fn singular_day_label() {
        let p = parse(frozen_now(), "1 day ago");
        let tw = p.time.expect("time parsed");
        assert_eq!(tw.label, "1 day ago");
    }
}
