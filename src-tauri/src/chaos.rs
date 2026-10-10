//! Chaos monkey for the Rust backend.
//!
//! Seeded, adversarial input + fault injection against the code paths that
//! touch untrusted data: clipboard text/images, search queries, the SQLite
//! file. Every scenario is a plain `#[test]`, so `cargo test chaos` runs them.
//!
//!   CHAOS_SEED=<u64>   replay a run (the seed is printed on failure)
//!   CHAOS_ITERS=<n>    iterations per scenario (default 400)
//!
//! Scenarios collect *all* violations and fail once at the end, so a single
//! run produces the whole bug list instead of stopping at the first one.

use super::*;
use chrono::{Local, TimeZone};
use std::collections::BTreeMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;

// ---------------------------------------------------------------- harness --

struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed | 1)
    }
    fn next(&mut self) -> u64 {
        // xorshift64*
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545F4914F6CDD1D)
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }
    fn pct(&mut self, p: usize) -> bool {
        self.below(100) < p
    }
    fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[self.below(xs.len())]
    }
}

fn seed() -> u64 {
    std::env::var("CHAOS_SEED")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0xC0FFEE)
        })
}

fn iters() -> usize {
    std::env::var("CHAOS_ITERS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(400)
}

/// Deduped violations: kind -> (count, first example).
#[derive(Default)]
struct Findings(BTreeMap<String, (usize, String)>);

impl Findings {
    fn add(&mut self, kind: impl Into<String>, detail: impl std::fmt::Display) {
        let e = self.0.entry(kind.into()).or_insert((0, clip(&detail.to_string())));
        e.0 += 1;
    }
    fn finish(self, scenario: &str, seed: u64) {
        if self.0.is_empty() {
            return;
        }
        let mut msg = format!(
            "[chaos:{scenario}] {} finding(s) — replay with CHAOS_SEED={seed}\n",
            self.0.len()
        );
        for (kind, (n, ex)) in &self.0 {
            msg.push_str(&format!("  - {kind}  (x{n})\n      e.g. {ex}\n"));
        }
        panic!("{msg}");
    }
}

fn clip(s: &str) -> String {
    let dbg = format!("{s:?}");
    if dbg.chars().count() > 200 {
        dbg.chars().take(200).collect::<String>() + "…\""
    } else {
        dbg
    }
}

fn panic_msg(p: Box<dyn std::any::Any + Send>) -> String {
    p.downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| p.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "<non-string panic>".into())
}

/// Run `run`, recording a finding instead of unwinding if it panics.
fn guard<T>(f: &mut Findings, op: &str, input: &str, run: impl FnOnce() -> T) -> Option<T> {
    match catch_unwind(AssertUnwindSafe(run)) {
        Ok(v) => Some(v),
        Err(p) => {
            f.add(
                format!("PANIC in {op}: {}", panic_msg(p).lines().next().unwrap_or("")),
                format!("input={}", clip(input)),
            );
            None
        }
    }
}

// ------------------------------------------------------------- generators --

const ATOMS: &[&str] = &[
    "", " ", "\n", "\t", "\r\n", "\0", "a", "foo", "bar baz", "AND", "OR", "NOT", "NEAR", "NEAR(",
    "\"", "\"\"", "'", "*", "-", "^", ":", "(", ")", "{", "}", "+", ",", ".", "%", "_", "\\",
    ";--", "' OR 1=1 --", "items_fts:", "col:", "𝔘𝔫𝔦𝔠𝔬𝔡𝔢", "🙂", "👨‍👩‍👧‍👦", "é", "e\u{301}", "\u{202e}",
    "\u{feff}", "\u{200b}", "日本語", "مرحبا", "https://example.com/a?b=c", "a@b.co", "#fff",
    "#ffffff", "rgb(1,2,3)", "red", "+1 555 123 4567", "/usr/bin/env", "C:\\Users", "42", "-3.14",
    "fn main() {}", "SELECT * FROM t;", "<div>", "123 Main St, CA", "yesterday", "today",
    "last week", "this month", "past year", "numbers", "links", "phone numbers", "screenshot",
    "I copied", "the ones I saved",
];

const UNITS: &[&str] = &["minute", "hour", "day", "week", "month", "year", "days", "weeks", "years"];
const MONTHS: &[&str] = &[
    "january", "feb", "march", "apr", "may", "june", "july", "aug", "september", "oct", "november",
    "dec",
];
const WEEKDAYS: &[&str] = &["monday", "tue", "wednesday", "thu", "friday", "sat", "sunday"];

fn time_phrase(r: &mut Rng) -> String {
    let big = ["0", "1", "7", "30", "365", "100000", "99999999999", "18446744073709551615",
        "99999999999999999999999"];
    match r.below(9) {
        0 => format!("{} {} ago", r.pick(&big), r.pick(UNITS)),
        1 => format!("last {}", r.pick(WEEKDAYS)),
        2 => format!("{} {}", r.pick(&["this", "last", "past"]), r.pick(&["week", "month", "year"])),
        3 => format!("{}{} {}", r.below(40), r.pick(&["st", "nd", "rd", "th", ""]), r.pick(MONTHS)),
        4 => format!("{} {}", r.pick(MONTHS), r.below(40)),
        5 => format!("in {} {}", r.pick(MONTHS), r.pick(&["0", "1", "1969", "2025", "9999", "262143", "99999"])),
        6 => format!("{:04}-{:02}-{:02}", r.below(10000), r.below(100), r.below(100)),
        7 => format!("in {:04}", r.below(10000)),
        _ => r.pick(&["yesterday", "today", "last night"]).to_string(),
    }
}

fn hostile(r: &mut Rng) -> String {
    let mut s = String::new();
    for _ in 0..1 + r.below(6) {
        match r.below(10) {
            0 | 1 | 2 => s.push_str(&time_phrase(r)),
            3 if r.pct(15) => {
                let atom = r.pick(ATOMS);
                s.push_str(&atom.repeat(1 + r.below(50_000 / atom.len().max(1))));
            }
            4 if r.pct(40) => {
                let bytes: Vec<u8> = (0..r.below(64)).map(|_| r.next() as u8).collect();
                s.push_str(&String::from_utf8_lossy(&bytes));
            }
            _ => s.push_str(r.pick(ATOMS)),
        }
        if r.pct(70) {
            s.push(' ');
        }
    }
    s
}

fn random_now(r: &mut Rng) -> chrono::DateTime<Local> {
    const EDGES: &[(i32, u32, u32)] = &[
        (2024, 2, 29), (2025, 1, 1), (2025, 12, 31), (2025, 3, 31), (2025, 1, 31), (2024, 12, 31),
        (1970, 1, 1), (2038, 1, 19), (2100, 2, 28), (2025, 3, 9), (2025, 11, 2), (2000, 2, 29),
    ];
    let (y, m, d) = if r.pct(60) {
        *r.pick(EDGES)
    } else {
        (1970 + r.below(130) as i32, 1 + r.below(12) as u32, 1 + r.below(28) as u32)
    };
    Local
        .with_ymd_and_hms(y, m, d, r.below(24) as u32, r.below(60) as u32, 0)
        .earliest()
        .unwrap_or_else(Local::now)
}

fn random_bytes(r: &mut Rng, max: usize) -> Vec<u8> {
    (0..r.below(max + 1)).map(|_| r.next() as u8).collect()
}

fn tmp_db(name: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("yank-chaos-{}-{name}.db", std::process::id()));
    cleanup(&p);
    p
}

fn cleanup(p: &PathBuf) {
    for ext in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{ext}", p.display()));
    }
    // db::open quarantines damaged files as `<name>.corrupt-<ms>[-wal|-shm]`.
    if let (Some(dir), Some(name)) = (p.parent(), p.file_name().and_then(|n| n.to_str())) {
        let prefix = format!("{name}.corrupt-");
        for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
            if e.file_name().to_string_lossy().starts_with(&prefix) {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

/// Lock the DB without inheriting a poison left by an earlier injected panic —
/// the harness must keep going; poisoning itself is covered by its own scenario.
fn lock(st: &Arc<Db>) -> std::sync::MutexGuard<'_, rusqlite::Connection> {
    st.0.lock().unwrap_or_else(|e| e.into_inner())
}

fn mock_app_with_db(path: &PathBuf) -> tauri::App<tauri::test::MockRuntime> {
    let app = tauri::test::mock_app();
    let conn = crate::db::open(path).expect("open chaos db");
    app.manage(Arc::new(Db(Mutex::new(conn))));
    app
}

// -------------------------------------------------------------- scenarios --

#[test]
fn chaos_text_and_query_parsers_survive_hostile_input() {
    let seed = seed();
    let mut r = Rng::new(seed);
    let mut f = Findings::default();

    for _ in 0..iters() {
        let s = hostile(&mut r);
        let now = random_now(&mut r);

        if let Some(cat) = guard(&mut f, "categorize", &s, || crate::categorize::categorize(&s)) {
            if !crate::categorize::CATEGORIES.contains(&cat) {
                f.add("categorize returned a category outside the shared vocab", cat);
            }
        }
        if let Some(p) = guard(&mut f, "make_preview", &s, || crate::categorize::make_preview(&s)) {
            if p.chars().count() > 161 || p.contains('\n') {
                f.add("make_preview exceeded 160 chars or spans lines", &p);
            }
        }
        guard(&mut f, "query_time::parse", &s, || {
            let out = crate::query_time::parse(now, &s);
            if let Some(tw) = out.time {
                if tw.from_ms > tw.to_ms {
                    return Some(format!("inverted window {}..{} for {:?}", tw.from_ms, tw.to_ms, s));
                }
            }
            None
        })
        .flatten()
        .map(|m| f.add("query_time window has from > to", m));
        guard(&mut f, "query_intent::parse", &s, || crate::query_intent::parse(&s));
        guard(&mut f, "query_intent::strip_category", &s, || {
            crate::query_intent::strip_category(&s)
        });
        // Same chain `search_semantic` runs.
        guard(&mut f, "time→intent chain", &s, || {
            let t = crate::query_time::parse(now, &s);
            crate::query_intent::parse(&t.semantic)
        });
    }
    f.finish("parsers", seed);
}

#[test]
fn chaos_vector_math_is_total_and_dimension_safe() {
    let seed = seed();
    let mut r = Rng::new(seed);
    let mut f = Findings::default();

    for _ in 0..iters() {
        let blob = random_bytes(&mut r, 400);
        let decoded = guard(&mut f, "from_bytes", &format!("{} bytes", blob.len()), || {
            crate::embed::from_bytes(&blob)
        });
        if let Some(v) = decoded {
            if blob.len() % 4 != 0 && !v.is_empty() {
                f.add(
                    "from_bytes silently accepts a BLOB whose length is not a multiple of 4",
                    format!("{} bytes -> {} floats", blob.len(), v.len()),
                );
            }
        }
    }

    // A truncated/foreign embedding must not look similar to a real query.
    let q = crate::embed::normalize(vec![1.0, 0.0, 0.0, 0.0]);
    let stored = crate::embed::normalize(vec![1.0]);
    let score = crate::embed::cosine(&q, &stored);
    if score >= 0.15 {
        f.add(
            "cosine() truncates mismatched dimensions and scores a 1-dim vector as 1.0 vs a 4-dim query",
            format!("score={score}"),
        );
    }
    let score = crate::embed::cosine(&[f32::NAN, 1.0], &[1.0, 1.0]);
    if score.is_nan() {
        // Callers filter with `>= threshold`, which is false for NaN, so this is
        // survivable — only note it if a sort can see it. (Informational.)
    }
    f.finish("vector-math", seed);
}

#[test]
fn chaos_image_decoders_never_panic_or_lie() {
    use arboard::ImageData;
    let seed = seed();
    let mut r = Rng::new(seed);
    let mut f = Findings::default();

    for _ in 0..iters() {
        // Legacy `[w:4le][h:4le][rgba…]` blobs with hostile dimensions.
        let (w, h): (u32, u32) = match r.below(4) {
            0 => (r.next() as u32, r.next() as u32),
            1 => (u32::MAX, u32::MAX),
            2 => (r.below(64) as u32, r.below(64) as u32),
            _ => (0, r.below(10) as u32),
        };
        let mut raw = Vec::new();
        raw.extend_from_slice(&w.to_le_bytes());
        raw.extend_from_slice(&h.to_le_bytes());
        raw.extend(random_bytes(&mut r, 256));
        if r.pct(15) {
            raw.truncate(r.below(8));
        }
        if r.pct(20) {
            let mut with_magic = PNG_MAGIC.to_vec();
            with_magic.extend(random_bytes(&mut r, 128));
            raw = with_magic;
        }
        let tag = format!("{} bytes, hdr w={w} h={h}", raw.len());

        if let Some(res) = guard(&mut f, "ensure_png", &tag, || ensure_png(&raw)) {
            if let Ok(png) = res {
                if !png.starts_with(PNG_MAGIC) {
                    f.add("ensure_png returned Ok with non-PNG bytes", &tag);
                }
            }
        }
        if let Some(Ok(img)) = guard(&mut f, "decode_to_rgba", &tag, || decode_to_rgba(&raw)) {
            if img.bytes.len() != img.width.saturating_mul(img.height).saturating_mul(4) {
                f.add(
                    "decode_to_rgba returned Ok with a pixel buffer that does not match width*height*4 (arboard will be handed inconsistent data)",
                    format!("{}x{} but {} bytes", img.width, img.height, img.bytes.len()),
                );
            }
        }

        // Watcher side: arboard hands us arbitrary dimensions + buffer.
        let (iw, ih) = match r.below(4) {
            0 => (usize::MAX, usize::MAX),
            1 => (r.next() as usize, r.below(10)),
            2 => (r.below(32), r.below(32)),
            _ => (u32::MAX as usize + 1 + r.below(4), 1),
        };
        let bytes = random_bytes(&mut r, 512);
        let tag = format!("{iw}x{ih}, {} bytes", bytes.len());
        guard(&mut f, "watcher::encode_as_png", &tag, || {
            crate::watcher::encode_as_png(&ImageData {
                width: iw,
                height: ih,
                bytes: bytes.into(),
            })
        });
    }
    f.finish("image-decoders", seed);
}

fn needle(r: &mut Rng) -> String {
    format!("zq{:x}{:x}", r.next() & 0xffffff, r.next() & 0xffffff)
}

fn hostile_id(r: &mut Rng, known: &[i64]) -> String {
    match r.below(8) {
        0 => String::new(),
        1 => "abc".into(),
        2 => "1; DROP TABLE items".into(),
        3 => i64::MAX.to_string(),
        4 => "9223372036854775808".into(),
        5 => "-1".into(),
        _ if !known.is_empty() => r.pick(known).to_string(),
        _ => "1".into(),
    }
}

#[test]
fn chaos_db_operation_storm_keeps_invariants() {
    let seed = seed();
    let mut r = Rng::new(seed);
    let mut f = Findings::default();
    let path = tmp_db("storm");
    let app = mock_app_with_db(&path);
    let st = || app.state::<Arc<Db>>();
    let mut known: Vec<i64> = Vec::new();
    // needle -> id, for the "inserted content is findable" recall invariant.
    let mut needles: Vec<(String, i64)> = Vec::new();

    for i in 0..iters() * 3 {
        let op = r.below(14);
        let label = format!("op#{i}/{op}");
        match op {
            0 | 1 | 2 => {
                // Clipboard text arrives (watcher path: dedup → insert).
                let n = needle(&mut r);
                let text = format!("{} {n} {}", hostile(&mut r), hostile(&mut r));
                let res = guard(&mut f, "watcher text insert", &text, || {
                    let st = st();
                    let conn = lock(&st);
                    let category = crate::categorize::categorize(&text);
                    let preview = crate::categorize::make_preview(&text);
                    match crate::db::dedup_text(&conn, &text)? {
                        Some(id) => Ok(id),
                        None => crate::db::insert_item(&conn, &text, category, &preview, None),
                    }
                });
                match res {
                    Some(Ok(id)) => {
                        known.push(id);
                        needles.push((n, id));
                    }
                    Some(Err(e)) => f.add(format!("text insert failed: {e}"), clip(&text)),
                    None => {
                        let _ = st().0.clear_poison();
                    }
                }
            }
            3 => {
                let bytes = random_bytes(&mut r, 300);
                let res = guard(&mut f, "image insert", &label, || {
                    let st = st();
                    let conn = lock(&st);
                    crate::db::insert_image_item(&conn, &bytes, "1×1 image", None)
                });
                if let Some(Ok(id)) = res {
                    known.push(id);
                }
            }
            4 => {
                let id = hostile_id(&mut r, &known);
                guard(&mut f, "touch_item", &id, || touch_item(id.clone(), st()));
            }
            5 => {
                let id = hostile_id(&mut r, &known);
                guard(&mut f, "pin_item", &id, || pin_item(id.clone(), st()));
            }
            6 => {
                let id = hostile_id(&mut r, &known);
                if guard(&mut f, "delete_item", &id, || delete_item(id.clone(), st())).is_some() {
                    needles.retain(|(_, nid)| nid.to_string() != id);
                }
            }
            7 => {
                let id = hostile_id(&mut r, &known);
                guard(&mut f, "restore_item", &id, || restore_item(id.clone(), st()));
            }
            8 => {
                let id = hostile_id(&mut r, &known);
                guard(&mut f, "get_image", &id, || get_image(id.clone(), st()));
            }
            9 => {
                // User types arbitrary text in the fuzzy search box.
                let q = hostile(&mut r);
                let res = guard(&mut f, "bm25_pool", &q, || {
                    let st = st();
                    let conn = lock(&st);
                    bm25_pool(&conn, &q, 100, None)
                });
                if let Some(Err(e)) = res {
                    if !q.trim().is_empty() {
                        f.add(
                            format!("bm25_pool returns Err for a user-typed query: {e}"),
                            clip(&q),
                        );
                    }
                }
            }
            10 => {
                // Semantic path's BM25 pool — callers `.unwrap_or_default()`,
                // which would silently turn an FTS error into "no results".
                let q = hostile(&mut r);
                let tw = r.pct(30).then(|| (0i64, i64::MAX));
                let res = guard(&mut f, "bm25_pool", &q, || {
                    let st = st();
                    let conn = lock(&st);
                    bm25_pool(&conn, &q, 50, tw)
                });
                if let Some(Err(e)) = res {
                    f.add(format!("bm25_pool errors (callers swallow it → silent empty results): {e}"), clip(&q));
                }
            }
            11 => {
                if r.pct(10) {
                    guard(&mut f, "clear_history", &label, || clear_history(st()));
                    known.retain(|id| {
                        let st = st();
                        let conn = lock(&st);
                        conn.query_row("SELECT 1 FROM items WHERE id=?1", [id], |_| Ok(())).is_ok()
                    });
                    needles.retain(|(_, id)| known.contains(id));
                }
            }
            12 => {
                // Label / content edit (mirrors update_label / update_content SQL;
                // those take a Wry AppHandle so they can't run on the mock runtime).
                if let Some(id) = known.last().copied() {
                    let new_label = hostile(&mut r);
                    guard(&mut f, "label edit (FTS update trigger)", &new_label, || {
                        let st = st();
                        let conn = lock(&st);
                        conn.execute(
                            "UPDATE items SET label = ?1, embedding_model = NULL WHERE id = ?2",
                            params![new_label, id],
                        )
                    });
                }
            }
            _ => {
                // The 2s sweeper's SQL.
                guard(&mut f, "sweeper delete", &label, || {
                    let st = st();
                    let conn = lock(&st);
                    conn.execute("DELETE FROM items WHERE deleted = 1", [])
                });
                known.retain(|id| {
                    let st = st();
                    let conn = lock(&st);
                    conn.query_row("SELECT 1 FROM items WHERE id=?1", [id], |_| Ok(())).is_ok()
                });
                needles.retain(|(_, id)| known.contains(id));
            }
        }

        if st().0.is_poisoned() {
            f.add("a panicking command poisoned the DB mutex (every later command would fail)", &label);
            st().0.clear_poison();
        }
        if i % 25 == 0 {
            check_db_invariants(&mut f, &app, &mut r, &needles);
        }
    }
    check_db_invariants(&mut f, &app, &mut r, &needles);
    drop(app);
    cleanup(&path);
    f.finish("db-storm", seed);
}

fn check_db_invariants(
    f: &mut Findings,
    app: &tauri::App<tauri::test::MockRuntime>,
    r: &mut Rng,
    needles: &[(String, i64)],
) {
    let st = || app.state::<Arc<Db>>();
    if let Some(Ok(items)) = guard(f, "list_items", "", || list_items(st())) {
        if items.iter().any(|i| i.deleted) {
            f.add("list_items returned a soft-deleted item", "");
        }
        if items.len() > 500 {
            f.add("list_items exceeded its LIMIT 500", items.len());
        }
        let mut seen_unpinned = false;
        for it in &items {
            if it.pinned && seen_unpinned {
                f.add("list_items: pinned item sorted after an unpinned one", &it.id);
            }
            if !it.pinned {
                seen_unpinned = true;
            }
        }
    }
    let st2 = st();
    let conn = lock(&st2);
    match conn.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0)) {
        Ok(s) if s == "ok" => {}
        Ok(s) => f.add("PRAGMA integrity_check failed", s),
        Err(e) => f.add("PRAGMA integrity_check errored", e),
    }
    if let Err(e) = conn.execute(
        "INSERT INTO items_fts(items_fts, rank) VALUES('integrity-check', 1)",
        [],
    ) {
        f.add("FTS index is out of sync with items table", e);
    }
    drop(conn);

    // Recall: a still-live item must be findable by its unique token.
    if !needles.is_empty() {
        let (n, id) = r.pick(needles).clone();
        let live: bool = {
            let st3 = st();
            let c = lock(&st3);
            c.query_row("SELECT deleted = 0 FROM items WHERE id = ?1", [id], |row| row.get(0))
                .unwrap_or(false)
        };
        if live {
            let st4 = st();
            let c = lock(&st4);
            match bm25_pool(&c, &n, 100, None) {
                Ok(hits) if hits.iter().any(|h| h.id == id.to_string()) => {}
                Ok(_) => f.add("bm25_pool failed to find a live item by its unique token", &n),
                Err(e) => f.add(format!("bm25_pool errored on a plain token: {e}"), &n),
            }
        }
    }
}

#[test]
fn chaos_concurrent_clients_do_not_deadlock_or_corrupt() {
    let seed = seed();
    let mut f = Findings::default();
    let path = tmp_db("concurrent");
    let app = mock_app_with_db(&path);
    let (tx, rx) = mpsc::channel::<Vec<String>>();
    let workers = 8;
    // Bumped after every finished op. A hang is "no op completes for 30s", not
    // "the run took long": throughput legitimately scales with CHAOS_ITERS and
    // with how much hostile content the workers have piled into the DB.
    let progress = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    // What each worker is doing right now, so a hang report names the culprit.
    let current = Arc::new(Mutex::new(vec![String::new(); workers]));

    for w in 0..workers {
        let handle = app.handle().clone();
        let tx = tx.clone();
        let progress = progress.clone();
        let current = current.clone();
        std::thread::spawn(move || {
            let mut r = Rng::new(seed.wrapping_add(w as u64 * 7919));
            let mut errs = Vec::new();
            for _ in 0..(iters() / 2).max(50) {
                let st = handle.state::<Arc<Db>>();
                let res = catch_unwind(AssertUnwindSafe(|| match r.below(6) {
                    0 | 1 => {
                        let t = hostile(&mut r);
                        current.lock().unwrap()[w] = format!("insert_item, {} bytes: {}", t.len(), clip(&t));
                        let c = lock(&st);
                        crate::db::insert_item(&c, &t, "text", "p", None).map(|_| ()).map_err(|e| e.to_string())
                    }
                    2 => list_items(st.clone()).map(|_| ()),
                    3 => {
                        let q = hostile(&mut r);
                        current.lock().unwrap()[w] = format!("bm25_pool, {} bytes: {}", q.len(), clip(&q));
                        let c = lock(&st);
                        bm25_pool(&c, &q, 100, None).map(|_| ())
                    }
                    4 => pin_item((1 + r.below(50)).to_string(), st.clone()).map(|_| ()),
                    _ => delete_item((1 + r.below(50)).to_string(), st.clone()),
                }));
                match res {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => errs.push(format!("op error: {e}")),
                    Err(p) => errs.push(format!("PANIC: {}", panic_msg(p))),
                }
                progress.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
            let _ = tx.send(errs);
        });
    }
    drop(tx);

    let mut done = 0;
    let (mut last_seen, mut last_change) = (0usize, Instant::now());
    while done < workers {
        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(errs) => {
                done += 1;
                for e in errs {
                    // "Query returned no rows" on pin of a missing id is expected noise.
                    if !e.contains("no rows") {
                        let kind = if e.contains("fts5") {
                            "concurrent client: bm25_pool hit an FTS5 syntax error"
                        } else if e.contains("no such column") {
                            "concurrent client: bm25_pool query parsed as an FTS5 column filter"
                        } else if e.starts_with("PANIC") {
                            "concurrent client: PANIC"
                        } else {
                            "concurrent client: other op error"
                        };
                        f.add(kind, e);
                    }
                }
            }
            Err(_) => {
                let now = progress.load(std::sync::atomic::Ordering::Relaxed);
                if now != last_seen {
                    (last_seen, last_change) = (now, Instant::now());
                } else if last_change.elapsed() > Duration::from_secs(30) {
                    f.add(
                        "deadlock/hang: no operation completed for 30s",
                        format!(
                            "{done}/{workers} workers done, {now} ops finished; in flight: {:?}",
                            current.lock().unwrap().iter().filter(|c| !c.is_empty()).collect::<Vec<_>>()
                        ),
                    );
                    break;
                }
            }
        }
    }
    let ok: bool = {
        let st = app.state::<Arc<Db>>();
        let c = lock(&st);
        c.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
            .map(|s| s == "ok")
            .unwrap_or(false)
    };
    if !ok {
        f.add("integrity_check failed after concurrent load", "");
    }
    drop(app);
    cleanup(&path);
    f.finish("concurrency", seed);
}

#[test]
fn chaos_panic_while_holding_db_lock_is_recoverable() {
    let seed = seed();
    let mut f = Findings::default();
    let path = tmp_db("poison");
    let app = mock_app_with_db(&path);

    // Something (a worker thread, a watcher callback) panics mid-query.
    let handle = app.handle().clone();
    let _ = std::thread::spawn(move || {
        let st = handle.state::<Arc<Db>>();
        let _guard = st.0.lock().unwrap();
        panic!("chaos: injected panic while holding the DB lock");
    })
    .join();

    let st = || app.state::<Arc<Db>>();
    if let Err(e) = list_items(st()) {
        f.add(
            "after ONE panic under the DB lock every command fails permanently (mutex poisoned, no recovery)",
            format!("list_items -> {e}"),
        );
    }
    if let Err(e) = pin_item("1".into(), st()) {
        if e.contains("poison") {
            f.add("pin_item also poisoned", &e);
        }
    }
    drop(app);
    cleanup(&path);
    f.finish("poisoned-lock", seed);
}

#[test]
fn chaos_corrupt_or_killed_database_still_opens() {
    let seed = seed();
    let mut r = Rng::new(seed);
    let mut f = Findings::default();

    // Build one healthy, populated DB to mutilate.
    let base = tmp_db("corrupt-base");
    {
        let conn = crate::db::open(&base).unwrap();
        for i in 0..200 {
            crate::db::insert_item(&conn, &format!("clip number {i} lorem ipsum {}", "x".repeat(200)), "text", "p", None).unwrap();
        }
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
    }
    let healthy = std::fs::read(&base).unwrap();
    cleanup(&base);

    for i in 0..(iters() / 8).max(20) {
        let p = tmp_db(&format!("corrupt-{i}"));
        let mut bytes = healthy.clone();
        let what = match r.below(5) {
            0 => {
                bytes = random_bytes(&mut r, 4096);
                "pure garbage".to_string()
            }
            1 => {
                bytes.truncate(r.below(bytes.len()));
                format!("truncated to {} bytes (kill -9 mid-copy)", bytes.len())
            }
            2 => {
                for _ in 0..1 + r.below(8) {
                    let at = r.below(bytes.len());
                    bytes[at] ^= 1 << r.below(8);
                }
                "bit flips".to_string()
            }
            3 => {
                let at = r.below(bytes.len().saturating_sub(4096).max(1)) + 100;
                let n = (bytes.len() - at).min(512);
                for b in &mut bytes[at..at + n] {
                    *b = 0;
                }
                format!("{n} zeroed bytes at {at}")
            }
            _ => {
                bytes.clear();
                "zero-length file".to_string()
            }
        };
        std::fs::write(&p, &bytes).unwrap();
        // Either outcome is fine for the *opener*; a panic isn't, and neither
        // is a "successful" open that can't serve the app's first query.
        let opened = guard(&mut f, "db::open", &what, || crate::db::open(&p));
        match opened {
            Some(Ok(conn)) => {
                let probe = conn.query_row(
                    "SELECT count(*) FROM (SELECT id FROM items WHERE deleted = 0 ORDER BY pinned DESC, last_used_at DESC LIMIT 500)",
                    [],
                    |row| row.get::<_, i64>(0),
                );
                if let Err(e) = probe {
                    f.add(format!("db::open succeeded but the first list query fails: {e}"), &what);
                }
            }
            Some(Err(e)) => f.add(
                format!("db::open fails on a damaged file and lib.rs does .expect(\"failed to open db\") → app crashes at every launch, no quarantine/rebuild: {e}"),
                &what,
            ),
            None => {}
        }
        cleanup(&p);
    }

    // kill -9 mid-write: WAL chopped at a random byte.
    for i in 0..(iters() / 20).max(5) {
        let p = tmp_db(&format!("wal-{i}"));
        {
            let conn = crate::db::open(&p).unwrap();
            conn.execute_batch("PRAGMA wal_autocheckpoint=0;").unwrap();
            for j in 0..100 {
                crate::db::insert_item(&conn, &format!("wal clip {j}"), "text", "p", None).unwrap();
            }
            // Copy while the connection is still open so the WAL is un-checkpointed.
            let wal = std::fs::read(format!("{}-wal", p.display())).unwrap_or_default();
            let main = std::fs::read(&p).unwrap();
            let q = tmp_db(&format!("wal-{i}-copy"));
            std::fs::write(&q, &main).unwrap();
            let cut = if wal.is_empty() { 0 } else { r.below(wal.len()) };
            std::fs::write(format!("{}-wal", q.display()), &wal[..cut]).unwrap();
            match guard(&mut f, "db::open(truncated WAL)", "", || crate::db::open(&q)) {
                Some(Ok(c)) => {
                    let ok = c
                        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                        .unwrap_or_default();
                    if ok != "ok" {
                        f.add("truncated WAL → integrity_check failed after reopen", ok);
                    }
                }
                Some(Err(e)) => f.add(format!("truncated WAL → db::open fails: {e}"), ""),
                None => {}
            }
            cleanup(&q);
        }
        cleanup(&p);
    }
    f.finish("corrupt-db", seed);
}

#[test]
fn chaos_interrupted_migrations_converge_to_current_schema() {
    let seed = seed();
    let mut f = Findings::default();
    let has_col = |c: &rusqlite::Connection, name: &str| -> bool {
        c.query_row(
            "SELECT count(*) FROM pragma_table_info('items') WHERE name = ?1",
            [name],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    };

    // (description, setup applied to a fully-migrated DB, then reopened)
    let cases: Vec<(&str, Vec<&str>)> = vec![
        ("v1 schema only", vec![
            "ALTER TABLE items DROP COLUMN image_data", "ALTER TABLE items DROP COLUMN embedding",
            "ALTER TABLE items DROP COLUMN embedding_model", "PRAGMA user_version = 1"]),
        ("v2", vec![
            "ALTER TABLE items DROP COLUMN image_data", "ALTER TABLE items DROP COLUMN embedding",
            "ALTER TABLE items DROP COLUMN embedding_model", "PRAGMA user_version = 2"]),
        ("v3 (no embedding cols)", vec![
            "ALTER TABLE items DROP COLUMN embedding", "ALTER TABLE items DROP COLUMN embedding_model",
            "PRAGMA user_version = 3"]),
        ("v3 + crash between the two v4 ALTERs (embedding added, embedding_model missing)", vec![
            "ALTER TABLE items DROP COLUMN embedding_model", "PRAGMA user_version = 3"]),
        ("v3 + crash after image_data ALTER but before user_version bump", vec![
            "ALTER TABLE items DROP COLUMN embedding", "ALTER TABLE items DROP COLUMN embedding_model",
            "PRAGMA user_version = 2"]),
        ("future version (downgrade)", vec!["PRAGMA user_version = 99"]),
    ];

    for (desc, steps) in cases {
        let p = tmp_db("migrate");
        {
            let c = crate::db::open(&p).unwrap();
            crate::db::insert_item(&c, "survivor", "text", "survivor", None).unwrap();
            for s in &steps {
                if let Err(e) = c.execute_batch(s) {
                    f.add(format!("chaos setup step failed: {s}: {e}"), desc);
                }
            }
        }
        match guard(&mut f, "db::open(migrate)", desc, || crate::db::open(&p)) {
            Some(Ok(c)) => {
                let future = desc.starts_with("future");
                for col in ["image_data", "embedding", "embedding_model"] {
                    if !future && !has_col(&c, col) {
                        f.add(format!("after reopening, column items.{col} is still missing"), desc);
                    }
                }
                let n: i64 = c.query_row("SELECT count(*) FROM items", [], |r| r.get(0)).unwrap_or(-1);
                if n != 1 {
                    f.add(format!("migration lost rows: expected 1, got {n}"), desc);
                }
                // The embed queue's first query.
                if let Err(e) = c.prepare(
                    "SELECT id, content FROM items WHERE deleted = 0 AND category != 'image' AND (embedding IS NULL OR embedding_model IS NOT ?1) LIMIT 10",
                ) {
                    f.add(format!("embed-queue query fails after migration: {e}"), desc);
                }
            }
            Some(Err(e)) => f.add(format!("migration from '{desc}' errors: {e}"), desc),
            None => {}
        }
        cleanup(&p);
    }
    f.finish("migrations", seed);
}

#[test]
fn chaos_huge_clipboard_payloads_stay_bounded() {
    let seed = seed();
    let mut f = Findings::default();
    let path = tmp_db("huge");
    let app = mock_app_with_db(&path);
    let st = || app.state::<Arc<Db>>();

    // 30 × 1 MB clips, plus one 8 MB single-token blob (copying a minified
    // bundle / base64 dump is very normal behaviour).
    let one_mb = "lorem ipsum dolor ".repeat(60_000);
    {
        let s = st();
        let c = lock(&s);
        for i in 0..30 {
            crate::db::insert_item(&c, &format!("{i} {one_mb}"), "text", "p", None).unwrap();
        }
        crate::db::insert_item(&c, &"A".repeat(8_000_000), "text", "p", None).unwrap();
    }

    let t = Instant::now();
    let listed = list_items(st()).unwrap();
    let payload = serde_json::to_vec(&listed).map(|v| v.len()).unwrap_or(0);
    let dt = t.elapsed();
    if payload > 10 * 1024 * 1024 {
        // ponytail: list_items ships full content; upgrade path = preview-only list + get_content(id) on copy/paste/edit, when big-clip libraries get slow.
        eprintln!(
            "note: list_items ships full `content` for every row over IPC: {} MB for {} items in {:?}",
            payload / 1_000_000,
            listed.len(),
            dt
        );
    }

    let t = Instant::now();
    {
        let s = st();
        let c = lock(&s);
        let _ = bm25_pool(&c, "lorem", 100, None);
        let _ = bm25_pool(&c, "zzzzzz", 100, None);
    }
    if t.elapsed() > Duration::from_secs(3) {
        f.add("bm25_pool over large corpus is slow (blocks the DB lock)", format!("{:?}", t.elapsed()));
    }

    let t = Instant::now();
    {
        let s = st();
        let c = lock(&s);
        c.execute("UPDATE items SET pinned = 1 WHERE id = 1", []).unwrap();
    }
    if t.elapsed() > Duration::from_secs(2) {
        f.add(
            "a pin/touch on a large row re-tokenises the whole clip (FTS AFTER UPDATE trigger fires on every column)",
            format!("{:?}", t.elapsed()),
        );
    }
    drop(app);
    cleanup(&path);
    f.finish("huge-payloads", seed);
}
