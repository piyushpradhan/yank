//! Self-contained evaluation harness for Yank's semantic search.
//!
//! Run with:
//!   cd src-tauri && cargo run --example eval_semantic --release
//!
//! What it does:
//! 1. Seeds a fresh SQLite database in `$TMPDIR/yank_eval/eval.db` with 30
//!    synthetic clipboard items spanning ~50 days of history.
//! 2. Embeds each item with the bundled BGE-small-en-v1.5 model (cached at
//!    `~/.cache/yank_eval/models`).
//! 3. Runs 20 queries through three retrieval strategies:
//!      - BM25-only (FTS5 baseline, no time parsing, no fusion)
//!      - Vector-only (cosine over embeddings, no fusion)
//!      - Hybrid v3 (the implementation in this PR: time parsing + RRF + recency)
//! 4. Measures P@1 / P@5 / P@10 / MRR for each strategy and the parser's
//!    time-phrase accuracy.
//! 5. Writes a Chart.js HTML report at `$TMPDIR/yank_eval/eval_report.html`.

use std::collections::HashSet;
use std::path::PathBuf;

use chrono::Local;
use rusqlite::{params, Connection};
use serde::Serialize;

use yank_lib::db;
use yank_lib::embed::{self, EmbedTask};
use yank_lib::local_embed::{self, LocalState};
use yank_lib::query_intent;
use yank_lib::query_time;

const MODEL: &str = "bge-small-en-v1.5";
const TOP_K: usize = 10;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Sample {
    content: &'static str,
    category: &'static str,
    label: Option<&'static str>,
    source: &'static str,
    days_ago: i64,
}

const fn s(
    content: &'static str,
    category: &'static str,
    label: Option<&'static str>,
    source: &'static str,
    days_ago: i64,
) -> Sample {
    Sample { content, category, label, source, days_ago }
}

fn samples() -> Vec<Sample> {
    vec![
        s("https://stripe.com/docs/webhooks/signatures",                       "url",     Some("Stripe webhook signature docs"), "Chrome",   12),
        s("stripe.webhooks.constructEvent(payload, sig, secret)",              "code",    Some("Stripe webhook construct call"), "VSCode",   12),
        s("https://join.slack.com/t/acme/shared_invite/zt-abc123",             "url",     Some("Slack workspace invite"),         "Mail",      4),
        s("https://github.com/anthropics/claude-code/issues/42",               "url",     Some("Claude Code shell hooks issue"),  "Chrome",    6),
        s("useEffect(() => { return () => clearInterval(id); }, [id]);",       "code",    Some("useEffect cleanup pattern"),      "VSCode",    2),
        s("1600 Amphitheatre Parkway, Mountain View, CA 94043",                "address", Some("Googleplex address"),             "Maps",     20),
        s("+1 (415) 555-0142",                                                 "phone",   Some("Sarah's number"),                 "Notes",    15),
        s("noreply@figma.com",                                                 "email",   None,                                   "Mail",      8),
        s("Meeting notes: prioritize auth migration before Q3 release",        "text",    None,                                   "Notes",     3),
        s("https://www.youtube.com/watch?v=dQw4w9WgXcQ",                       "url",     Some("Never Gonna Give You Up - YouTube"), "Chrome", 1),
        s("export const API_URL = 'https://api.staging.acme.com/v2';",         "code",    Some("Staging API URL constant"),       "VSCode",    7),
        s("https://news.ycombinator.com/item?id=39312345",                     "url",     Some("HN: Postgres 17 features"),       "Chrome",   10),
        s("remember to deploy by Friday before the freeze",                    "text",    None,                                   "Notes",     0),
        s("git rebase -i HEAD~5",                                              "code",    Some("Interactive rebase last 5"),      "Terminal", 11),
        s("https://www.figma.com/file/abc/Design-System-v3",                   "url",     Some("Figma design system file"),       "Slack",     5),
        s("SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days';", "code",    Some("Recent signups SQL query"),       "DataGrip",  4),
        s("/Users/me/projects/acme/api/middleware/auth.py",                    "path",    Some("Auth middleware Python file"),    "Terminal",  3),
        s("#FF6B35",                                                           "color",   Some("Brand orange hex"),               "Figma",    14),
        s("OTP: 482915",                                                       "number",  None,                                   "Mail",      0),
        s("https://x.com/dhh/status/1234567890",                               "url",     Some("DHH on Rails 8"),                 "Chrome",   25),
        s("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc",               "code",    Some("API JWT token"),                  "Postman",   2),
        s("https://docs.anthropic.com/claude/docs/getting-started",            "url",     Some("Anthropic Claude docs"),          "Chrome",    9),
        s("Q3 OKRs: ship auth, raise SLA to 99.95%, hire 2 engineers",         "text",    Some("Q3 OKRs"),                        "Notes",    22),
        s("kubectl rollout restart deployment/api",                            "code",    Some("Restart API deployment"),         "Terminal",  7),
        s("docker compose -f docker-compose.dev.yml up --build",               "code",    Some("Local docker stack"),             "Terminal",  1),
        s("https://stripe.com/docs/api/payment_intents",                       "url",     Some("Stripe PaymentIntent API docs"),  "Chrome",   13),
        s("https://github.com/piyushpradhan/yank",                             "url",     Some("Yank repo on GitHub"),            "Chrome",    2),
        s("https://supabase.com/docs/guides/auth",                             "url",     Some("Supabase Auth guide"),            "Chrome",    5),
        s("TODO: refactor the embedding queue to use tokio::spawn",            "text",    Some("Embedding queue refactor todo"),  "Notes",     4),
        s("https://github.com/anthropics/anthropic-sdk-typescript",            "url",     Some("Anthropic TypeScript SDK"),       "Chrome",    3),
    ]
}

// ---------------------------------------------------------------------------
// Eval queries (with ground truth)
// ---------------------------------------------------------------------------

struct Q {
    q: &'static str,
    relevant: &'static [usize], // sample indices
    #[allow(dead_code)] // kept for documentation of test intent
    expected_time: Option<&'static str>,
}

const fn q(q: &'static str, relevant: &'static [usize], expected_time: Option<&'static str>) -> Q {
    Q { q, relevant, expected_time }
}

fn queries() -> Vec<Q> {
    vec![
        q("the stripe webhook docs",        &[0, 25],     None),
        q("stripe webhook 12 days ago",     &[0, 1],      Some("12 days ago")),
        q("the slack invite",               &[2],         None),
        q("youtube link from yesterday",    &[9],         Some("yesterday")),
        q("useEffect cleanup",              &[4],         None),
        q("the figma design system",        &[14],        None),
        q("yesterday",                      &[9, 24],     Some("yesterday")),
        q("4 days ago",                     &[2, 15, 28], Some("4 days ago")),
        q("what did I save 7 days ago",     &[10, 23],    Some("7 days ago")),
        q("sql for recent signups",         &[15],        None),
        q("interactive git rebase",         &[13],        None),
        q("brand color hex",                &[17],        None),
        q("OTP code today",                 &[18],        Some("today")),
        q("kubernetes deployment restart",  &[23],        None),
        q("github link 3 days ago",         &[29],        Some("3 days ago")),
        q("Anthropic SDK docs",             &[21, 29],    None),
        q("Q3 OKRs",                        &[22],        None),
        q("tokio refactor todo",            &[28],        None),
        q("auth middleware Python",         &[16],        None),
        q("the staging API URL",            &[10],        None),
    ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Mirror of `embed_queue::build_doc_text` (v3 ordering). Re-implemented
/// here because that function is private to the crate.
fn build_doc(s: &Sample) -> String {
    const MAX: usize = 2000;
    let body: String = s.content.trim().chars().take(MAX).collect();
    let label_t = s.label.unwrap_or("").trim();
    let mut parts: Vec<String> = Vec::with_capacity(5);
    if !label_t.is_empty() {
        parts.push(label_t.to_string());
    }
    parts.push(format!("[{}]", s.category));
    if !s.source.is_empty() {
        parts.push(format!("(from {})", s.source));
    }
    if !label_t.is_empty() {
        parts.push(label_t.to_string());
    }
    parts.push(body);
    parts.join("\n")
}

fn rank_of_first_relevant(results: &[i64], relevant: &HashSet<i64>) -> Option<usize> {
    results
        .iter()
        .position(|id| relevant.contains(id))
        .map(|i| i + 1)
}

fn precision_at_k(results: &[i64], relevant: &HashSet<i64>, k: usize) -> f64 {
    let n_rel = results.iter().take(k).filter(|id| relevant.contains(id)).count();
    let denom = k.min(results.len()).max(1);
    n_rel as f64 / denom as f64
}

// ---------------------------------------------------------------------------
// Retrieval strategies
// ---------------------------------------------------------------------------

fn vector_search_scored(
    conn: &Connection,
    model_id: &str,
    q_vec: &[f32],
    limit: usize,
    time: Option<(i64, i64)>,
) -> rusqlite::Result<Vec<(f32, i64)>> {
    let (from, to) = time.unwrap_or((i64::MIN, i64::MAX));
    let mut stmt = conn.prepare(
        "SELECT id, embedding FROM items
         WHERE deleted = 0 AND embedding IS NOT NULL AND embedding_model = ?1
           AND created_at BETWEEN ?2 AND ?3",
    )?;
    let mut scored: Vec<(f32, i64)> = stmt
        .query_map(params![model_id, from, to], |r| {
            let id: i64 = r.get(0)?;
            let bytes: Vec<u8> = r.get(1)?;
            let vec = embed::from_bytes(&bytes);
            Ok((embed::cosine(q_vec, &vec), id))
        })?
        .filter_map(|r| r.ok())
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    Ok(scored)
}

fn vector_search(
    conn: &Connection,
    model_id: &str,
    q_vec: &[f32],
    limit: usize,
    time: Option<(i64, i64)>,
) -> rusqlite::Result<Vec<i64>> {
    let scored = vector_search_scored(conn, model_id, q_vec, limit, time)?;
    Ok(scored.into_iter().map(|(_, id)| id).collect())
}

fn bm25_search(
    conn: &Connection,
    query: &str,
    limit: usize,
    time: Option<(i64, i64)>,
) -> rusqlite::Result<Vec<i64>> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|t| !t.is_empty())
        .map(|t| format!("{}*", t.replace('"', "\"\"")))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let (from, to) = time.unwrap_or((i64::MIN, i64::MAX));
    let fetch = |q: &str| -> rusqlite::Result<Vec<i64>> {
        let mut stmt = conn.prepare(
            "SELECT i.id FROM items_fts
             JOIN items i ON i.id = items_fts.rowid
             WHERE items_fts MATCH ?1 AND i.deleted = 0
               AND i.created_at BETWEEN ?2 AND ?3
             ORDER BY bm25(items_fts) LIMIT ?4",
        )?;
        let rows: Vec<i64> = stmt
            .query_map(params![q, from, to, limit as i64], |r| r.get::<_, i64>(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    };

    let mut seen: HashSet<i64> = HashSet::new();
    let mut out: Vec<i64> = Vec::with_capacity(limit);
    if terms.len() >= 2 {
        let and_q = terms.join(" ");
        for id in fetch(&and_q)? {
            if seen.insert(id) {
                out.push(id);
            }
            if out.len() >= limit {
                return Ok(out);
            }
        }
    }
    let or_q = terms.join(" OR ");
    for id in fetch(&or_q)? {
        if seen.insert(id) {
            out.push(id);
        }
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

fn hybrid_search(
    conn: &Connection,
    model_id: &str,
    q_vec: &[f32],
    residue: &str,
    limit: usize,
    time: Option<(i64, i64)>,
) -> rusqlite::Result<Vec<i64>> {
    const VEC_POOL: usize = 50;
    const FTS_POOL: usize = 50;
    const RRF_K: f32 = 60.0;
    // Same threshold the production code applies in `search_semantic`:
    // drops vectors that are obviously orthogonal so the recency boost
    // doesn't shuffle them above genuinely relevant items.
    const VEC_THRESHOLD: f32 = 0.15;

    let mut scored = vector_search_scored(conn, model_id, q_vec, VEC_POOL, time)?;
    scored.retain(|(s, _)| *s >= VEC_THRESHOLD);
    let vec_pool: Vec<i64> = scored.into_iter().map(|(_, id)| id).collect();
    let fts_pool = bm25_search(conn, residue, FTS_POOL, time).unwrap_or_default();

    use std::collections::HashMap;
    let mut fused: HashMap<i64, f32> = HashMap::new();
    for (rank, id) in vec_pool.iter().enumerate() {
        *fused.entry(*id).or_insert(0.0) += 1.0 / (RRF_K + rank as f32 + 1.0);
    }
    for (rank, id) in fts_pool.iter().enumerate() {
        *fused.entry(*id).or_insert(0.0) += 1.0 / (RRF_K + rank as f32 + 1.0);
    }

    // Soft recency tiebreak when there is no time window — same shape as
    // the production `search_semantic`.
    if time.is_none() {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let ids: Vec<i64> = fused.keys().copied().collect();
        for id in ids {
            let last: i64 = conn
                .query_row("SELECT last_used_at FROM items WHERE id = ?1", params![id], |r| {
                    r.get(0)
                })
                .unwrap_or(now_ms);
            let age_days = ((now_ms - last).max(0) as f32) / (1000.0 * 60.0 * 60.0 * 24.0);
            // Tiebreak only — must stay below single-pool RRF tier (≈0.016).
            *fused.get_mut(&id).unwrap() += 0.005 * (-age_days / 14.0).exp();
        }
    }

    let mut ranked: Vec<(i64, f32)> = fused.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    Ok(ranked.into_iter().take(limit).map(|(id, _)| id).collect())
}

fn items_in_window(
    conn: &Connection,
    from: i64,
    to: i64,
    limit: usize,
) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM items
         WHERE deleted = 0 AND created_at BETWEEN ?1 AND ?2
         ORDER BY pinned DESC, created_at DESC LIMIT ?3",
    )?;
    let rows: Vec<i64> = stmt
        .query_map(params![from, to, limit as i64], |r| r.get::<_, i64>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

fn items_in_window_with_cat(
    conn: &Connection,
    from: i64,
    to: i64,
    category: Option<&str>,
    limit: usize,
) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM items
         WHERE deleted = 0 AND created_at BETWEEN ?1 AND ?2
           AND (?3 IS NULL OR category = ?3)
         ORDER BY pinned DESC, created_at DESC LIMIT ?4",
    )?;
    let rows: Vec<i64> = stmt
        .query_map(params![from, to, category, limit as i64], |r| {
            r.get::<_, i64>(0)
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// Hybrid v4 (post-fix): mirrors `search_semantic` in `commands.rs`.
/// Same pools as v3 (no category SQL filter), plus a soft additive RRF
/// boost when the user's intent category matches the candidate item's
/// stored category. Sized at ≈ one rank-1 RRF contribution so a category
/// hit can break ties / climb a rank or two but cannot override a
/// clearly-better off-category match.
fn hybrid_v4_search(
    conn: &Connection,
    model_id: &str,
    q_vec: &[f32],
    residue: &str,
    limit: usize,
    time: Option<(i64, i64)>,
    category: Option<&str>,
    cat_map: &std::collections::HashMap<i64, String>,
) -> rusqlite::Result<Vec<i64>> {
    const VEC_POOL: usize = 50;
    const FTS_POOL: usize = 50;
    const RRF_K: f32 = 60.0;
    const VEC_THRESHOLD: f32 = 0.15;
    const CAT_BOOST: f32 = 0.010;

    let mut scored = vector_search_scored(conn, model_id, q_vec, VEC_POOL, time)?;
    scored.retain(|(s, _)| *s >= VEC_THRESHOLD);
    let vec_pool: Vec<i64> = scored.into_iter().map(|(_, id)| id).collect();
    let fts_pool = bm25_search(conn, residue, FTS_POOL, time).unwrap_or_default();

    use std::collections::HashMap;
    let mut fused: HashMap<i64, f32> = HashMap::new();
    for (rank, id) in vec_pool.iter().enumerate() {
        *fused.entry(*id).or_insert(0.0) += 1.0 / (RRF_K + rank as f32 + 1.0);
    }
    for (rank, id) in fts_pool.iter().enumerate() {
        *fused.entry(*id).or_insert(0.0) += 1.0 / (RRF_K + rank as f32 + 1.0);
    }

    if let Some(want) = category {
        let ids: Vec<i64> = fused.keys().copied().collect();
        for id in ids {
            if cat_map.get(&id).map(|s| s.as_str()) == Some(want) {
                *fused.get_mut(&id).unwrap() += CAT_BOOST;
            }
        }
    }

    if time.is_none() {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let ids: Vec<i64> = fused.keys().copied().collect();
        for id in ids {
            let last: i64 = conn
                .query_row("SELECT last_used_at FROM items WHERE id = ?1", params![id], |r| {
                    r.get(0)
                })
                .unwrap_or(now_ms);
            let age_days = ((now_ms - last).max(0) as f32) / (1000.0 * 60.0 * 60.0 * 24.0);
            *fused.get_mut(&id).unwrap() += 0.005 * (-age_days / 14.0).exp();
        }
    }

    let mut ranked: Vec<(i64, f32)> = fused.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    Ok(ranked.into_iter().take(limit).map(|(id, _)| id).collect())
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct StrategyMetrics {
    p_at_1: f64,
    p_at_5: f64,
    p_at_10: f64,
    mrr: f64,
}

#[derive(Serialize)]
struct QueryRow {
    q: String,
    intent_category: Option<String>,
    v4_residue: String,
    bm25_rank: Option<usize>,
    vec_rank: Option<usize>,
    v3_rank: Option<usize>,
    v4_rank: Option<usize>,
}

#[derive(Serialize)]
struct EffectCounts {
    same: usize,
    improved: usize,
    regressed: usize,
}

#[derive(Serialize)]
struct ItemRow {
    idx: usize,
    label: String,
    category: String,
    source: String,
    days_ago: i64,
}

#[derive(Serialize)]
struct Report {
    n_items: usize,
    n_queries: usize,
    bm25: StrategyMetrics,
    vector: StrategyMetrics,
    v3: StrategyMetrics,
    v4: StrategyMetrics,
    effect: EffectCounts,
    queries: Vec<QueryRow>,
    items: Vec<ItemRow>,
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let work_dir = std::env::temp_dir().join("yank_eval");
    std::fs::create_dir_all(&work_dir)?;
    let db_path = work_dir.join("eval.db");
    let _ = std::fs::remove_file(&db_path);
    let conn = db::open(&db_path)?;

    let cache_dir = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".cache")
        .join("yank_eval")
        .join("models");
    std::fs::create_dir_all(&cache_dir)?;

    let state = LocalState::new();
    let model_id = format!("local:{}:v3", MODEL);

    let samples_v = samples();
    let now_ms = chrono::Utc::now().timestamp_millis();

    eprintln!("seeding {} items + embedding (BGE-small)...", samples_v.len());
    eprintln!("  cache: {}", cache_dir.display());
    eprintln!("  (first run downloads ~133 MB)");

    let mut item_ids: Vec<i64> = Vec::with_capacity(samples_v.len());
    let mut cat_map: std::collections::HashMap<i64, String> =
        std::collections::HashMap::with_capacity(samples_v.len());
    for (i, sample) in samples_v.iter().enumerate() {
        let created = now_ms - sample.days_ago * 86_400_000;
        let preview: String = sample.content.chars().take(60).collect();
        conn.execute(
            "INSERT INTO items (content, category, label, preview, source, pinned, deleted, created_at, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6)",
            params![sample.content, sample.category, sample.label, preview, sample.source, created],
        )?;
        let id = conn.last_insert_rowid();
        item_ids.push(id);
        cat_map.insert(id, sample.category.to_string());

        let doc = build_doc(sample);
        let v = local_embed::embed_local(&state, cache_dir.clone(), MODEL, &doc, EmbedTask::Document).await?;
        let bytes = embed::to_bytes(&v);
        conn.execute(
            "UPDATE items SET embedding = ?1, embedding_model = ?2 WHERE id = ?3",
            params![bytes, model_id, id],
        )?;
        if (i + 1) % 5 == 0 {
            eprint!("  · seeded {}/{}\n", i + 1, samples_v.len());
        }
    }

    let queries_v = queries();
    eprintln!("\nrunning {} queries × 3 strategies...", queries_v.len());

    let mut bm25_p1 = 0.0;
    let mut bm25_p5 = 0.0;
    let mut bm25_p10 = 0.0;
    let mut bm25_mrr = 0.0;
    let mut vec_p1 = 0.0;
    let mut vec_p5 = 0.0;
    let mut vec_p10 = 0.0;
    let mut vec_mrr = 0.0;
    let mut v3_p1 = 0.0;
    let mut v3_p5 = 0.0;
    let mut v3_p10 = 0.0;
    let mut v3_mrr = 0.0;
    let mut v4_p1 = 0.0;
    let mut v4_p5 = 0.0;
    let mut v4_p10 = 0.0;
    let mut v4_mrr = 0.0;
    let mut effect_same = 0usize;
    let mut effect_improved = 0usize;
    let mut effect_regressed = 0usize;

    let mut query_rows: Vec<QueryRow> = Vec::with_capacity(queries_v.len());

    for q in &queries_v {
        let relevant: HashSet<i64> = q.relevant.iter().map(|&i| item_ids[i]).collect();

        // Stage 1: pull out the date phrase. Residue is what flows on to v3
        // (and to intent parsing for v4).
        let parsed = query_time::parse(Local::now(), q.q);
        let time_bounds = parsed.time.as_ref().map(|t| (t.from_ms, t.to_ms));
        let v3_residue = parsed.semantic.trim().to_string();

        // Stage 2: intent parse on the time residue — v4 only. Strips filler
        // verbs and pulls out a category, leaving a cleaner residue to embed.
        let intent = query_intent::parse(&parsed.semantic);
        let v4_residue = intent.semantic.trim().to_string();
        let category = intent.category;

        // BM25 baseline — raw query, no parsing.
        let bm25_results = bm25_search(&conn, q.q, TOP_K, None).unwrap_or_default();

        // Vector baseline — raw query embedded as-is.
        let q_vec_raw =
            local_embed::embed_local(&state, cache_dir.clone(), MODEL, q.q, EmbedTask::Query)
                .await?;
        let vec_results = vector_search(&conn, &model_id, &q_vec_raw, TOP_K, None)?;

        // Hybrid v3 — time parsing + RRF + recency. No intent parsing.
        let v3_results: Vec<i64> = if v3_residue.is_empty() {
            if let Some((from, to)) = time_bounds {
                items_in_window(&conn, from, to, TOP_K)?
            } else {
                Vec::new()
            }
        } else {
            let qv = local_embed::embed_local(
                &state,
                cache_dir.clone(),
                MODEL,
                &v3_residue,
                EmbedTask::Query,
            )
            .await?;
            hybrid_search(&conn, &model_id, &qv, &v3_residue, TOP_K, time_bounds)?
        };

        // Hybrid v4 — time parsing + intent parsing + RRF + soft category
        // boost + recency. Mirrors `search_semantic` in commands.rs.
        let v4_results: Vec<i64> = if v4_residue.is_empty() {
            if time_bounds.is_some() || category.is_some() {
                let (from, to) = time_bounds.unwrap_or((i64::MIN, i64::MAX));
                items_in_window_with_cat(&conn, from, to, category, TOP_K)?
            } else {
                Vec::new()
            }
        } else {
            let qv = local_embed::embed_local(
                &state,
                cache_dir.clone(),
                MODEL,
                &v4_residue,
                EmbedTask::Query,
            )
            .await?;
            hybrid_v4_search(
                &conn,
                &model_id,
                &qv,
                &v4_residue,
                TOP_K,
                time_bounds,
                category,
                &cat_map,
            )?
        };

        let bm25_r = rank_of_first_relevant(&bm25_results, &relevant);
        let vec_r = rank_of_first_relevant(&vec_results, &relevant);
        let v3_r = rank_of_first_relevant(&v3_results, &relevant);
        let v4_r = rank_of_first_relevant(&v4_results, &relevant);

        bm25_p1 += precision_at_k(&bm25_results, &relevant, 1);
        bm25_p5 += precision_at_k(&bm25_results, &relevant, 5);
        bm25_p10 += precision_at_k(&bm25_results, &relevant, 10);
        bm25_mrr += bm25_r.map_or(0.0, |r| 1.0 / r as f64);

        vec_p1 += precision_at_k(&vec_results, &relevant, 1);
        vec_p5 += precision_at_k(&vec_results, &relevant, 5);
        vec_p10 += precision_at_k(&vec_results, &relevant, 10);
        vec_mrr += vec_r.map_or(0.0, |r| 1.0 / r as f64);

        v3_p1 += precision_at_k(&v3_results, &relevant, 1);
        v3_p5 += precision_at_k(&v3_results, &relevant, 5);
        v3_p10 += precision_at_k(&v3_results, &relevant, 10);
        v3_mrr += v3_r.map_or(0.0, |r| 1.0 / r as f64);

        v4_p1 += precision_at_k(&v4_results, &relevant, 1);
        v4_p5 += precision_at_k(&v4_results, &relevant, 5);
        v4_p10 += precision_at_k(&v4_results, &relevant, 10);
        v4_mrr += v4_r.map_or(0.0, |r| 1.0 / r as f64);

        // Effect classification: how did v4 move this query's rank-of-
        // first-relevant relative to v3?
        match (v3_r, v4_r) {
            (a, b) if a == b => effect_same += 1,
            (Some(a), Some(b)) if b < a => effect_improved += 1,
            (None, Some(_)) => effect_improved += 1,
            _ => effect_regressed += 1,
        }

        query_rows.push(QueryRow {
            q: q.q.to_string(),
            intent_category: category.map(String::from),
            v4_residue,
            bm25_rank: bm25_r,
            vec_rank: vec_r,
            v3_rank: v3_r,
            v4_rank: v4_r,
        });
    }

    let n = queries_v.len() as f64;
    let bm25_m = StrategyMetrics {
        p_at_1: bm25_p1 / n,
        p_at_5: bm25_p5 / n,
        p_at_10: bm25_p10 / n,
        mrr: bm25_mrr / n,
    };
    let vec_m = StrategyMetrics {
        p_at_1: vec_p1 / n,
        p_at_5: vec_p5 / n,
        p_at_10: vec_p10 / n,
        mrr: vec_mrr / n,
    };
    let v3_m = StrategyMetrics {
        p_at_1: v3_p1 / n,
        p_at_5: v3_p5 / n,
        p_at_10: v3_p10 / n,
        mrr: v3_mrr / n,
    };
    let v4_m = StrategyMetrics {
        p_at_1: v4_p1 / n,
        p_at_5: v4_p5 / n,
        p_at_10: v4_p10 / n,
        mrr: v4_mrr / n,
    };

    eprintln!();
    eprintln!("┌──────────────┬───────┬───────┬────────┬───────┐");
    eprintln!("│ strategy     │  P@1  │  P@5  │  P@10  │  MRR  │");
    eprintln!("├──────────────┼───────┼───────┼────────┼───────┤");
    eprintln!("│ BM25-only    │ {:.3} │ {:.3} │  {:.3} │ {:.3} │", bm25_m.p_at_1, bm25_m.p_at_5, bm25_m.p_at_10, bm25_m.mrr);
    eprintln!("│ Vector-only  │ {:.3} │ {:.3} │  {:.3} │ {:.3} │", vec_m.p_at_1, vec_m.p_at_5, vec_m.p_at_10, vec_m.mrr);
    eprintln!("│ Hybrid v3    │ {:.3} │ {:.3} │  {:.3} │ {:.3} │", v3_m.p_at_1, v3_m.p_at_5, v3_m.p_at_10, v3_m.mrr);
    eprintln!("│ Hybrid v4    │ {:.3} │ {:.3} │  {:.3} │ {:.3} │", v4_m.p_at_1, v4_m.p_at_5, v4_m.p_at_10, v4_m.mrr);
    eprintln!("└──────────────┴───────┴───────┴────────┴───────┘");
    eprintln!();
    eprintln!(
        "v4 vs v3 (rank of first relevant): {} same · {} improved · {} regressed",
        effect_same, effect_improved, effect_regressed
    );

    let report = Report {
        n_items: samples_v.len(),
        n_queries: queries_v.len(),
        bm25: bm25_m,
        vector: vec_m,
        v3: v3_m,
        v4: v4_m,
        effect: EffectCounts {
            same: effect_same,
            improved: effect_improved,
            regressed: effect_regressed,
        },
        queries: query_rows,
        items: samples_v
            .iter()
            .enumerate()
            .map(|(i, s)| ItemRow {
                idx: i,
                label: s.label.unwrap_or(s.content).to_string(),
                category: s.category.to_string(),
                source: s.source.to_string(),
                days_ago: s.days_ago,
            })
            .collect(),
    };

    let html = render_html(&report)?;
    let report_path = work_dir.join("v3_v4_comparison.html");
    std::fs::write(&report_path, html)?;
    eprintln!("\n📊 HTML report: {}", report_path.display());

    Ok(())
}

fn render_html(report: &Report) -> Result<String, Box<dyn std::error::Error>> {
    let data_json = serde_json::to_string(report)?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let rank_cell = |r: Option<usize>| -> String {
        match r {
            None => r#"<td class="rank-miss">—</td>"#.to_string(),
            Some(v) if v <= 3 => format!(r#"<td class="rank-good">{}</td>"#, v),
            Some(v) => format!(r#"<td class="rank-bad">{}</td>"#, v),
        }
    };
    let delta_cell = |v3: Option<usize>, v4: Option<usize>| -> String {
        match (v3, v4) {
            (a, b) if a == b => r#"<td class="delta-zero">·</td>"#.to_string(),
            (None, Some(_)) => r#"<td class="delta-pos">↑ found</td>"#.to_string(),
            (Some(_), None) => r#"<td class="delta-neg">↓ miss</td>"#.to_string(),
            (Some(a), Some(b)) if b < a => {
                format!(r#"<td class="delta-pos">↑ {}→{}</td>"#, a, b)
            }
            (Some(a), Some(b)) => format!(r#"<td class="delta-neg">↓ {}→{}</td>"#, a, b),
            _ => r#"<td class="delta-zero">·</td>"#.to_string(),
        }
    };

    let mut rows = String::new();
    for q in &report.queries {
        let is_regression = match (q.v3_rank, q.v4_rank) {
            (Some(a), Some(b)) => b > a,
            (Some(_), None) => true,
            _ => false,
        };
        let row_class = if is_regression { " class=\"row-regression\"" } else { "" };
        rows.push_str(&format!(
            "<tr{row_class}><td><code>{}</code></td><td>{}</td><td><code>{}</code></td>{}{}{}{}{}</tr>",
            html_escape(&q.q),
            q.intent_category
                .as_deref()
                .map(|c| format!("<code>{}</code>", c))
                .unwrap_or_else(|| "—".to_string()),
            html_escape(&q.v4_residue),
            rank_cell(q.bm25_rank),
            rank_cell(q.vec_rank),
            rank_cell(q.v3_rank),
            rank_cell(q.v4_rank),
            delta_cell(q.v3_rank, q.v4_rank),
            row_class = row_class,
        ));
    }
    let mut item_rows = String::new();
    for it in &report.items {
        item_rows.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td><code>{}</code></td><td>{}</td><td>{}</td></tr>",
            it.idx,
            html_escape(&it.label),
            it.category,
            it.source,
            it.days_ago,
        ));
    }

    Ok(format!(
        r##"<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Yank · Semantic Search Evaluation (v3 → v4)</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root {{ --fg:#1a1a1a; --muted:#666; --border:#e6e6e6; --accent:#FF6B35; }}
  body {{ font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; padding: 32px; max-width: 1100px; margin: 0 auto; color: var(--fg); background: white; }}
  h1 {{ margin: 0 0 4px; font-size: 22px; }}
  .sub {{ color: var(--muted); margin-bottom: 28px; }}
  h2 {{ margin-top: 36px; font-size: 15px; border-bottom: 1px solid var(--border); padding-bottom: 6px; letter-spacing: .02em; text-transform: uppercase; color: #444; }}
  .grid {{ display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; margin-bottom: 12px; }}
  .card {{ background: #fafafa; border: 1px solid var(--border); border-radius: 10px; padding: 18px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
  th, td {{ padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }}
  th {{ background: #f4f4f4; font-weight: 600; color: #333; }}
  td.rank-good {{ color: #0a7e3f; font-weight: 700; text-align: center; }}
  td.rank-bad {{ color: #c33; text-align: center; }}
  td.rank-miss {{ color: #aaa; text-align: center; }}
  td.delta-pos {{ color: #0a7e3f; font-weight: 700; text-align: center; }}
  td.delta-neg {{ color: #c33; font-weight: 700; text-align: center; }}
  td.delta-zero {{ color: #aaa; text-align: center; }}
  .good {{ color: #0a7e3f; font-weight: 700; }}
  .bad {{ color: #c33; font-weight: 700; }}
  code {{ background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 12px; font-family: "SF Mono", "JetBrains Mono", ui-monospace, monospace; }}
  .legend {{ font-size: 12px; color: var(--muted); margin: 8px 0 16px; }}
  .callout {{ background: #fff7f0; border: 1px solid #ffd4b8; border-left: 3px solid var(--accent); padding: 12px 14px; border-radius: 6px; margin: 14px 0; font-size: 13px; }}
  tr.row-regression {{ background: #fff5f5; }}
</style></head>
<body>
<h1>Yank · Semantic Search Evaluation (v3 → v4)</h1>
<p class="sub">{n_items} items seeded · {n_queries} queries · BGE-small-en-v1.5 (local, offline) · run {today}</p>

<div class="callout">
  <strong>v4 (post-fix):</strong> <code>query_intent</code> still runs after time parsing —
  it strips clipboard-action filler verbs (<code>"I copied / yanked / saved"</code>) and
  detects content-type keywords (<code>"numbers"</code>, <code>"links"</code>, <code>"code snippets"</code>).
  But the category is now applied as a soft RRF score boost (≈ one rank-1 contribution),
  not a hard SQL filter — items whose <code>categorize.rs</code> label disagrees with
  the user's intent word stay in the candidate pool.
</div>

<h2>Retrieval accuracy</h2>
<div class="grid">
  <div class="card"><canvas id="precChart" height="260"></canvas></div>
  <div class="card"><canvas id="effectChart" height="260"></canvas></div>
</div>
<p class="legend">P@k = fraction of top-k that's relevant · MRR = mean reciprocal rank of first relevant hit (higher is better).</p>

<h2>Per-query rank of first relevant result</h2>
<p class="legend"><span class="good">green</span> = top 3 · <span class="bad">red</span> = ranked 4–10 · — = not found in top 10 · regression rows tinted pink</p>
<table>
<thead><tr><th>query</th><th>intent cat</th><th>v4 residue → embedder</th><th>BM25</th><th>Vector</th><th>Hybrid&nbsp;v3</th><th>Hybrid&nbsp;v4</th><th>Δ</th></tr></thead>
<tbody>
{rows}
</tbody>
</table>

<h2>Seeded items</h2>
<table>
<thead><tr><th>idx</th><th>label</th><th>category</th><th>source</th><th>age (days)</th></tr></thead>
<tbody>
{item_rows}
</tbody>
</table>

<script>
const D = {data_json};
new Chart(document.getElementById('precChart'), {{
  type: 'bar',
  data: {{
    labels: ['P@1', 'P@5', 'P@10', 'MRR'],
    datasets: [
      {{ label: 'BM25-only',   data: [D.bm25.p_at_1,   D.bm25.p_at_5,   D.bm25.p_at_10,   D.bm25.mrr],   backgroundColor: '#bcbcbc' }},
      {{ label: 'Vector-only', data: [D.vector.p_at_1, D.vector.p_at_5, D.vector.p_at_10, D.vector.mrr], backgroundColor: '#7f9eb7' }},
      {{ label: 'Hybrid v3',   data: [D.v3.p_at_1,     D.v3.p_at_5,     D.v3.p_at_10,     D.v3.mrr],     backgroundColor: '#f3b58a' }},
      {{ label: 'Hybrid v4',   data: [D.v4.p_at_1,     D.v4.p_at_5,     D.v4.p_at_10,     D.v4.mrr],     backgroundColor: '#FF6B35' }},
    ]
  }},
  options: {{
    responsive: true,
    scales: {{ y: {{ min: 0, max: 1, ticks: {{ stepSize: 0.2 }} }} }},
    plugins: {{ title: {{ display: true, text: 'P@k and MRR across strategies' }}, legend: {{ position: 'bottom' }} }}
  }}
}});
new Chart(document.getElementById('effectChart'), {{
  type: 'doughnut',
  data: {{
    labels: ['Same as v3', 'Improved by v4', 'Regressed in v4'],
    datasets: [{{ data: [D.effect.same, D.effect.improved, D.effect.regressed], backgroundColor: ['#0a7e3f', '#FF6B35', '#c33'] }}]
  }},
  options: {{
    plugins: {{
      title: {{ display: true, text: 'v4 effect on rank-of-first-relevant (' + D.n_queries + ' queries)' }},
      legend: {{ position: 'bottom' }}
    }}
  }}
}});
</script>
</body></html>
"##,
        n_items = report.n_items,
        n_queries = report.n_queries,
        today = today,
        rows = rows,
        item_rows = item_rows,
        data_json = data_json,
    ))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
