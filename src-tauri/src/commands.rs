use arboard::Clipboard;
use image::{ImageBuffer, Rgba};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::db::Db;

// PNG file magic bytes — used to detect new-format vs. legacy RGBA storage.
const PNG_MAGIC: &[u8; 8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/// Ensures the stored bytes are in PNG format.
/// New items are already PNG; legacy items used `[width:4le][height:4le][rgba…]`
/// and are re-encoded on first access.
fn ensure_png(raw: &[u8]) -> Result<Vec<u8>, String> {
    if raw.len() >= 8 && raw.starts_with(PNG_MAGIC) {
        return Ok(raw.to_vec());
    }
    // Legacy format: [width:4le][height:4le][rgba_bytes…]
    if raw.len() < 8 {
        return Err("Image data too short".into());
    }
    let width = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
    let height = u32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]) as usize;
    let rgba = &raw[8..];
    let expected = width * height * 4;
    if rgba.len() != expected {
        return Err(format!(
            "Legacy RGBA length mismatch: expected {expected}, got {}",
            rgba.len()
        ));
    }
    let buf = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, rgba.to_vec())
        .ok_or("Legacy image buffer creation failed")?;
    let mut png = Vec::new();
    buf.write_to(
        &mut std::io::Cursor::new(&mut png),
        image::ImageFormat::Png,
    )
    .map_err(|e| e.to_string())?;
    Ok(png)
}

/// Decodes stored bytes to raw RGBA — needed for writing back to the clipboard
/// via arboard, which only accepts RGBA pixel data.
fn decode_to_rgba(raw: &[u8]) -> Result<RawImage, String> {
    if raw.len() >= 8 && raw.starts_with(PNG_MAGIC) {
        let img = image::load_from_memory(raw).map_err(|e| e.to_string())?;
        let rgba = img.into_rgba8();
        let (width, height) = (rgba.width() as usize, rgba.height() as usize);
        return Ok(RawImage { width, height, bytes: rgba.into_raw() });
    }
    if raw.len() < 8 {
        return Err("Image data too short".into());
    }
    let width = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
    let height = u32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]) as usize;
    Ok(RawImage { width, height, bytes: raw[8..].to_vec() })
}

struct RawImage {
    width: usize,
    height: usize,
    bytes: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipItem {
    pub id: String,
    pub category: String,
    pub label: String,
    /// True when `label` came from the AI labeller; false when we fell back to
    /// the content preview because no label has been generated yet. Lets the
    /// UI render a distinct "still thinking" treatment instead of pretending
    /// the preview is a real label.
    #[serde(rename = "labelGenerated")]
    pub label_generated: bool,
    pub source: String,
    #[serde(rename = "minutesAgo")]
    pub minutes_ago: i64,
    pub pinned: bool,
    pub content: String,
    pub preview: String,
    #[serde(default)]
    pub deleted: bool,
    #[serde(rename = "deletedAt", default)]
    pub deleted_at: Option<i64>,
}

fn map_err<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipItem> {
    let id: i64 = row.get("id")?;
    let content: String = row.get("content")?;
    let category: String = row.get("category")?;
    let label: Option<String> = row.get("label")?;
    let preview: String = row.get("preview")?;
    let source: Option<String> = row.get("source")?;
    let pinned: i64 = row.get("pinned")?;
    let deleted: i64 = row.get("deleted")?;
    let deleted_at: Option<i64> = row.get("deleted_at")?;
    let last_used_at: i64 = row.get("last_used_at")?;

    let now = chrono::Utc::now().timestamp_millis();
    let minutes_ago = ((now - last_used_at) / 60_000).max(0);

    let (display_label, label_generated) = match label {
        Some(s) if !s.trim().is_empty() => (s, true),
        _ => (preview.clone(), false),
    };

    Ok(ClipItem {
        id: id.to_string(),
        category,
        label: display_label,
        label_generated,
        source: source.unwrap_or_default(),
        minutes_ago,
        pinned: pinned != 0,
        content,
        preview,
        deleted: deleted != 0,
        deleted_at,
    })
}

#[tauri::command]
pub fn list_items(db: State<'_, Arc<Db>>) -> Result<Vec<ClipItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, content, category, label, preview, source, pinned, deleted, deleted_at, last_used_at
             FROM items
             WHERE deleted = 0
             ORDER BY pinned DESC, last_used_at DESC
             LIMIT 500",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map([], row_to_item)
        .map_err(map_err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(map_err)?;
    Ok(rows)
}

#[tauri::command]
pub fn touch_item(id: String, db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();
    let id_num: i64 = id.parse().map_err(map_err)?;
    conn.execute(
        "UPDATE items SET last_used_at = ?1 WHERE id = ?2",
        params![now, id_num],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn pin_item(id: String, db: State<'_, Arc<Db>>) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;
    let current: i64 = conn
        .query_row(
            "SELECT pinned FROM items WHERE id = ?1",
            params![id_num],
            |r| r.get(0),
        )
        .map_err(map_err)?;
    let new_val: i64 = if current == 0 { 1 } else { 0 };
    conn.execute(
        "UPDATE items SET pinned = ?1 WHERE id = ?2",
        params![new_val, id_num],
    )
    .map_err(map_err)?;
    Ok(new_val != 0)
}

#[tauri::command]
pub fn delete_item(id: String, db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE items SET deleted = 1, deleted_at = ?1 WHERE id = ?2",
        params![now, id_num],
    )
    .map_err(map_err)?;
    Ok(())
}

/// Returned by `get_image`: PNG bytes the frontend can create a Blob URL from,
/// plus pre-parsed dimensions so callers don't need to parse the PNG header.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImagePng {
    pub bytes: Vec<u8>,
    pub width: usize,
    pub height: usize,
}

fn load_raw(conn: &rusqlite::Connection, id_num: i64) -> Option<Vec<u8>> {
    conn.query_row(
        "SELECT image_data FROM items WHERE id = ?1 AND category = 'image' AND deleted = 0",
        params![id_num],
        |r| r.get(0),
    )
    .ok()
    .filter(|d: &Vec<u8>| !d.is_empty())
}

#[tauri::command]
pub fn get_image(id: String, db: State<'_, Arc<Db>>) -> Result<Option<ImagePng>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;
    let raw = match load_raw(&conn, id_num) {
        None => return Ok(None),
        Some(r) => r,
    };
    let png = ensure_png(&raw)?;
    // Read width/height from the PNG IHDR (bytes 16-23, big-endian).
    let (width, height) = if png.len() >= 24 {
        (
            u32::from_be_bytes([png[16], png[17], png[18], png[19]]) as usize,
            u32::from_be_bytes([png[20], png[21], png[22], png[23]]) as usize,
        )
    } else {
        (0, 0)
    };
    Ok(Some(ImagePng { bytes: png, width, height }))
}

#[tauri::command]
pub fn copy_image(id: String, db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;
    let raw = load_raw(&conn, id_num).ok_or("Image not found")?;
    let decoded = decode_to_rgba(&raw)?;
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_image(arboard::ImageData {
        width: decoded.width,
        height: decoded.height,
        bytes: decoded.bytes.into(),
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_item(id: String, db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;
    conn.execute(
        "UPDATE items SET deleted = 0, deleted_at = NULL WHERE id = ?1",
        params![id_num],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn update_label(
    id: String,
    label: String,
    app: tauri::AppHandle,
    db: State<'_, Arc<Db>>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;
    // Clearing embedding_model marks the item for re-embedding on the next
    // queue tick — the label is part of the embedded text now, so an edit
    // here needs to flow into the vector or semantic search will see stale
    // content for this id.
    conn.execute(
        "UPDATE items SET label = ?1, embedding_model = NULL WHERE id = ?2",
        params![label, id_num],
    )
    .map_err(map_err)?;
    drop(conn);
    crate::embed_queue::kick(&app);
    Ok(())
}

/// Parse a query the same way `search_semantic` does and return only the
/// semantic residue — used by the UI when the user dismisses the
/// detected-date chip, so the time phrase is removed from the input
/// without the user having to find and delete it themselves.
#[tauri::command]
pub fn strip_time(query: String) -> String {
    let now = chrono::Local::now();
    crate::query_time::parse(now, &query).semantic
}

/// Sibling of [`strip_time`] for the category chip. Removes only the
/// recognised category keyword (not filler verbs) so the user's input
/// after dismissal stays close to what they typed.
#[tauri::command]
pub fn strip_category(query: String) -> String {
    crate::query_intent::strip_category(&query)
}

#[tauri::command]
pub fn clear_history(db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM items WHERE pinned = 0", [])
        .map_err(map_err)?;
    Ok(())
}

/// DTO mirroring `query_time::TimeWindow` minus the byte span. Serialised
/// to the frontend as `{ fromMs, toMs, label }` for the chip caption.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimeWindowDto {
    #[serde(rename = "fromMs")]
    pub from_ms: i64,
    #[serde(rename = "toMs")]
    pub to_ms: i64,
    pub label: String,
}

/// Response shape for `search_semantic`. `time_window` is `Some` when the
/// query contained a recognised date phrase like "4 days ago" so the UI
/// can render the dismissible date chip. `category` mirrors that for a
/// content-type keyword like "numbers" or "links" — when present, results
/// have already been narrowed to that category in SQL.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResponse {
    pub items: Vec<ClipItem>,
    #[serde(rename = "timeWindow")]
    pub time_window: Option<TimeWindowDto>,
    pub category: Option<String>,
}

#[tauri::command]
pub async fn search_semantic(
    query: String,
    limit: Option<usize>,
    app: tauri::AppHandle,
    db: State<'_, Arc<Db>>,
    settings: State<'_, crate::settings::SettingsState>,
    local: State<'_, crate::local_embed::LocalState>,
) -> Result<SearchResponse, String> {
    use crate::embed::{self, EmbedConfig, EmbedTask, Provider};
    use crate::local_embed;

    let cfg: EmbedConfig = settings.0.read().map_err(|e| e.to_string())?.clone();
    if !cfg.is_active() {
        return Err("semantic search not configured".into());
    }
    let q_trimmed = query.trim().to_string();
    if q_trimmed.is_empty() {
        return Ok(SearchResponse { items: Vec::new(), time_window: None, category: None });
    }
    let limit = limit.unwrap_or(20);

    // Pull any date phrase out of the query before we embed it. The
    // residue ("semantic") is what hits the vector and BM25 pools; the
    // window becomes a SQL filter on `created_at` so we never have to
    // rank items outside it.
    let parsed = crate::query_time::parse(chrono::Local::now(), &q_trimmed);
    let time_dto = parsed.time.as_ref().map(|t| TimeWindowDto {
        from_ms: t.from_ms,
        to_ms: t.to_ms,
        label: t.label.clone(),
    });
    let time_bounds = parsed.time.as_ref().map(|t| (t.from_ms, t.to_ms));

    // Then pull category intent ("numbers", "links", "code snippets") and
    // shed filler verbs ("I copied"). Filler removal cleans up the residue
    // that gets embedded so common phrases like "I copied" stop dominating
    // the query vector. Category is a *soft* signal during hybrid search
    // (RRF boost below) — applied as a hard SQL filter only for pure
    // category queries with no semantic residue ("numbers").
    let intent = crate::query_intent::parse(&parsed.semantic);
    let semantic_q = intent.semantic.trim().to_string();
    let category_filter: Option<&str> = intent.category;
    let category_dto = intent.category.map(|c| c.to_string());

    // Pure time / category query ("yesterday", "numbers", "numbers
    // yesterday"): skip embedding entirely and return newest items
    // matching the SQL filters, pinned first.
    if semantic_q.is_empty() {
        if time_bounds.is_some() || category_filter.is_some() {
            let (from, to) = time_bounds.unwrap_or((i64::MIN, i64::MAX));
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let items = items_in_window(&conn, from, to, category_filter, limit)?;
            return Ok(SearchResponse { items, time_window: time_dto, category: category_dto });
        }
        return Ok(SearchResponse { items: Vec::new(), time_window: None, category: None });
    }

    // Embed the residue outside the DB lock.
    let q_vec = if matches!(cfg.provider, Provider::Local) {
        local_embed::embed_local(
            local.inner(),
            local_embed::cache_dir(&app),
            &cfg.local_model,
            &semantic_q,
            EmbedTask::Query,
        )
        .await?
    } else {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        embed::embed(&cfg, &client, &semantic_q, EmbedTask::Query).await?
    };

    // Pool A — vector candidates. K is intentionally wider than `limit`
    // because RRF then re-ranks this pool against the BM25 pool before
    // we trim to the final window.
    const VEC_POOL: usize = 50;
    const FTS_POOL: usize = 50;
    // Loose floor — RRF fusion does the actual ranking, this just drops
    // embeddings that are clearly orthogonal to the query.
    const VEC_THRESHOLD: f32 = 0.15;
    // Standard RRF constant from the original paper; dampens runaway rank
    // differences so the two pools blend smoothly.
    const RRF_K: f32 = 60.0;

    let db: Arc<Db> = db.inner().clone();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let model_id = cfg.model_id();
    let (from_ms, to_ms) = time_bounds.unwrap_or((i64::MIN, i64::MAX));

    // --- Pool A: cosine --------------------------------------------------
    let mut stmt_vec = conn
        .prepare(
            "SELECT id, content, category, label, preview, source, pinned,
                    deleted, deleted_at, last_used_at, embedding
             FROM items
             WHERE deleted = 0 AND embedding IS NOT NULL AND embedding_model = ?1
               AND created_at BETWEEN ?2 AND ?3",
        )
        .map_err(map_err)?;

    let mut scored: Vec<(f32, ClipItem)> = stmt_vec
        .query_map(params![model_id, from_ms, to_ms], |row| {
            let item = row_to_item(row)?;
            let bytes: Vec<u8> = row.get("embedding")?;
            let vec = embed::from_bytes(&bytes);
            Ok((embed::cosine(&q_vec, &vec), item))
        })
        .map_err(map_err)?
        .filter_map(|r| r.ok())
        .collect();

    scored.retain(|(score, _)| *score >= VEC_THRESHOLD);
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(VEC_POOL);

    // --- Pool B: BM25 via FTS5 ------------------------------------------
    let fts_pool = bm25_pool(&conn, &semantic_q, FTS_POOL, time_bounds)
        .unwrap_or_default();

    // --- Reciprocal Rank Fusion -----------------------------------------
    // For each item present in either pool, score = Σ 1 / (RRF_K + rank_i).
    // Items in both pools are boosted; items unique to one still get a
    // contribution from that pool. Robust to BM25's unbounded scale and
    // cosine's [-1, 1] scale.
    use std::collections::HashMap;
    let mut fused: HashMap<String, (f32, ClipItem)> = HashMap::new();

    for (rank, (_score, item)) in scored.iter().enumerate() {
        let contribution = 1.0 / (RRF_K + rank as f32 + 1.0);
        fused
            .entry(item.id.clone())
            .and_modify(|(s, _)| *s += contribution)
            .or_insert((contribution, item.clone()));
    }
    for (rank, item) in fts_pool.iter().enumerate() {
        let contribution = 1.0 / (RRF_K + rank as f32 + 1.0);
        fused
            .entry(item.id.clone())
            .and_modify(|(s, _)| *s += contribution)
            .or_insert((contribution, item.clone()));
    }

    // Soft category boost — replaces v4's hard SQL filter that excluded
    // items whose `categorize.rs` label didn't match the user's intent
    // word (e.g. "OTP code" wanted `code` but the OTP item is labelled
    // `number`; "staging API URL" wanted `url` but `const API_URL = …;`
    // is labelled `code`). Sized to ≈ one rank-1 RRF contribution so a
    // category-matching item that lands mid-pool can climb over a strong
    // off-category neighbour, but a clearly-better off-category match
    // still wins.
    const CAT_BOOST: f32 = 0.010;
    if let Some(want) = category_filter {
        for (_, (score, item)) in fused.iter_mut() {
            if item.category == want {
                *score += CAT_BOOST;
            }
        }
    }

    // Soft recency tiebreak — only when the user didn't already constrain
    // recency via a date phrase. The coefficient stays well below the
    // single-pool RRF rank-1 contribution (1/(K+1) ≈ 0.016) so it can
    // *break* ties between similarly-relevant items but cannot promote
    // an unrelated recent item over a relevant older one. Decays over
    // ~2 weeks.
    if time_bounds.is_none() {
        for (_, (score, item)) in fused.iter_mut() {
            let age_days = (item.minutes_ago.max(0) as f32) / (60.0 * 24.0);
            *score += 0.005 * (-age_days / 14.0).exp();
        }
    }

    let mut ranked: Vec<(f32, ClipItem)> = fused.into_values().collect();
    // Pinned items win ties; otherwise sort strictly by fused score desc.
    ranked.sort_by(|a, b| {
        let pin_cmp = b.1.pinned.cmp(&a.1.pinned);
        if pin_cmp != std::cmp::Ordering::Equal {
            return pin_cmp;
        }
        b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal)
    });

    let items = ranked.into_iter().take(limit).map(|(_, i)| i).collect();
    Ok(SearchResponse { items, time_window: time_dto, category: category_dto })
}

/// Newest items inside `[from_ms, to_ms]` — used when the query is purely
/// a time phrase ("yesterday"), purely a category keyword ("numbers"), or
/// the two combined ("numbers yesterday") and there's nothing left to
/// embed. `category` is applied as an exact match when `Some`.
fn items_in_window(
    conn: &rusqlite::Connection,
    from_ms: i64,
    to_ms: i64,
    category: Option<&str>,
    limit: usize,
) -> Result<Vec<ClipItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, content, category, label, preview, source, pinned,
                    deleted, deleted_at, last_used_at
             FROM items
             WHERE deleted = 0 AND created_at BETWEEN ?1 AND ?2
               AND (?3 IS NULL OR category = ?3)
             ORDER BY pinned DESC, created_at DESC
             LIMIT ?4",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![from_ms, to_ms, category, limit as i64], row_to_item)
        .map_err(map_err)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// Run the residue through FTS5 with a time-window filter and return the
/// top-N item rows ranked by BM25. Tries an AND-form query first for
/// multi-token residues (precision) and falls back to OR-prefix (recall)
/// to top up the pool. Returns an empty Vec when the tokeniser rejects
/// the query (rare — usually only-punctuation residues).
fn bm25_pool(
    conn: &rusqlite::Connection,
    query: &str,
    limit: usize,
    time: Option<(i64, i64)>,
) -> Result<Vec<ClipItem>, String> {
    // Split on whitespace, strip quotes, prefix-match each term. `cors`
    // matches `corsair`. Embedded quotes are escaped per FTS5 syntax.
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|t| !t.is_empty())
        .map(|t| format!("{}*", t.replace('\"', "\"\"")))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let (from_ms, to_ms) = time.unwrap_or((i64::MIN, i64::MAX));

    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut out: Vec<ClipItem> = Vec::with_capacity(limit);

    // AND form first — FTS5's default operator between bare terms is AND,
    // so "foo* bar*" demands both. Only worth running for multi-token
    // residues; a single term degenerates to the same query as OR.
    if terms.len() >= 2 {
        let and_q = terms.join(" ");
        for item in run_bm25(conn, &and_q, from_ms, to_ms, limit)? {
            if seen.insert(item.id.clone()) {
                out.push(item);
            }
            if out.len() >= limit {
                return Ok(out);
            }
        }
    }

    // OR-prefix to top up: catches paraphrases the AND form missed.
    let or_q = terms.join(" OR ");
    for item in run_bm25(conn, &or_q, from_ms, to_ms, limit)? {
        if seen.insert(item.id.clone()) {
            out.push(item);
        }
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

fn run_bm25(
    conn: &rusqlite::Connection,
    match_q: &str,
    from_ms: i64,
    to_ms: i64,
    limit: usize,
) -> Result<Vec<ClipItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.content, i.category, i.label, i.preview, i.source,
                    i.pinned, i.deleted, i.deleted_at, i.last_used_at
             FROM items_fts
             JOIN items i ON i.id = items_fts.rowid
             WHERE items_fts MATCH ?1 AND i.deleted = 0
               AND i.created_at BETWEEN ?2 AND ?3
             ORDER BY bm25(items_fts)
             LIMIT ?4",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(
            params![match_q, from_ms, to_ms, limit as i64],
            row_to_item,
        )
        .map_err(map_err)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn search_fts(
    query: String,
    db: State<'_, Arc<Db>>,
) -> Result<Vec<ClipItem>, String> {
    let q = query.trim();
    if q.is_empty() {
        return list_items(db);
    }
    let match_q = format!("{}*", q.replace('\"', "\"\""));
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.content, i.category, i.label, i.preview, i.source,
                    i.pinned, i.deleted, i.deleted_at, i.last_used_at
             FROM items_fts
             JOIN items i ON i.id = items_fts.rowid
             WHERE items_fts MATCH ?1 AND i.deleted = 0
             ORDER BY i.pinned DESC, bm25(items_fts)
             LIMIT 100",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![match_q], row_to_item)
        .map_err(map_err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(map_err)?;
    Ok(rows)
}

/// Kick the embed queue to retry any failed or stalled backfill items.
/// Callable from the frontend when the user clicks "Retry" on the backfill pill.
#[tauri::command]
pub fn retry_embed_backfill(app: AppHandle) {
    crate::embed_queue::kick(&app);
}

pub fn spawn_sweeper(app: AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let db: Arc<Db> = app.state::<Arc<Db>>().inner().clone();
        let cutoff = chrono::Utc::now().timestamp_millis() - 4_000;
        let n = {
            let conn = match db.0.lock() {
                Ok(c) => c,
                Err(_) => continue,
            };
            conn.execute(
                "DELETE FROM items WHERE deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?1",
                params![cutoff],
            )
            .unwrap_or(0)
        };
        if n > 0 {
            let _ = app.emit("clip-swept", n);
        }
    });
}
