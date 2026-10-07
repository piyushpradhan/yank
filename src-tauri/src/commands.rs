use arboard::Clipboard;
use image::{ImageBuffer, Rgba};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

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

#[cfg(target_os = "macos")]
fn send_paste_keystroke() -> Result<&'static str, String> {
    use core_graphics::{
        event::{CGEvent, CGEventFlags, CGEventTapLocation, KeyCode},
        event_source::{CGEventSource, CGEventSourceStateID},
    };

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGPreflightPostEventAccess() -> bool;
        fn CGRequestPostEventAccess() -> bool;
    }

    let trusted = unsafe { CGPreflightPostEventAccess() || CGRequestPostEventAccess() };
    if !trusted {
        return Err("Accessibility permission is required to paste automatically".into());
    }

    for key_down in [true, false] {
        let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
            .map_err(|_| "failed to create keyboard event source")?;
        let event = CGEvent::new_keyboard_event(source, KeyCode::ANSI_V, key_down)
            .map_err(|_| "failed to create paste keyboard event")?;
        event.set_flags(CGEventFlags::CGEventFlagCommand);
        event.post(CGEventTapLocation::HID);
    }
    Ok("pasted")
}

/// Map whether a synthesized paste actually happened to the string the
/// frontend keys off. Kept as a pure function so the fallback branch stays
/// testable without instantiating a real input backend. Only the enigo path
/// (Windows/Linux) can fall back to copy-only; macOS pastes or errors.
#[cfg(not(target_os = "macos"))]
fn paste_outcome(pasted: bool) -> &'static str {
    if pasted { "pasted" } else { "copied" }
}

#[cfg(not(target_os = "macos"))]
fn send_paste_keystroke() -> Result<&'static str, String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    // enigo synthesises input for the currently-focused window on Windows
    // (SendInput) and X11/Wayland (XTest / virtual keyboard). The clipboard is
    // already set by the caller; this only triggers the target app's paste.
    //
    // On GNOME/Mutter Wayland there is no virtual-keyboard protocol to talk
    // to, so `Enigo::new` fails. That's not an error worth surfacing — the
    // item is already on the clipboard — so we report "copied" and let the
    // frontend tell the user to paste manually instead of closing silently.
    let mut enigo = match Enigo::new(&Settings::default()) {
        Ok(enigo) => enigo,
        Err(_) => return Ok(paste_outcome(false)),
    };
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|e| e.to_string())?;
    Ok(paste_outcome(true))
}

#[tauri::command]
pub fn paste_to_frontmost_app(app: AppHandle) -> Result<String, String> {
    if let Some(window) = app.get_webview_window("palette") {
        window.hide().map_err(map_err)?;
    }

    // Hand focus back to the app the user was in before the palette opened,
    // then synthesize Cmd/Ctrl+V there. When we couldn't restore a specific
    // target (the palette opened cold, or the platform has no such handle —
    // Linux leaves it to the WM), wait a beat longer for the OS to settle
    // focus on its own.
    let restored = crate::restore_previous_application();
    std::thread::sleep(std::time::Duration::from_millis(if restored { 25 } else { 100 }));
    let outcome = send_paste_keystroke()?;

    Ok(outcome.to_string())
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
    // The label is part of the embedded text: clear the model tag so the
    // embed queue re-embeds this clip.
    conn.execute(
        "UPDATE items SET label = ?1, embedding_model = NULL WHERE id = ?2",
        params![label, id_num],
    )
    .map_err(map_err)?;
    drop(conn);
    let _ = app;
    crate::embed_queue::kick();
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
    db: State<'_, Arc<Db>>,
    settings: State<'_, crate::settings::SettingsState>,
) -> Result<SearchResponse, String> {
    let cfg: crate::embed::EmbedConfig =
        settings.0.read().map_err(|e| e.to_string())?.clone();
    if !cfg.is_active() {
        return Err("semantic search not configured".into());
    }
    search(db.inner().clone(), &cfg, &query, limit.unwrap_or(20)).await
}

/// BM25 weight in the first-stage score. Small: dense cosine carries the
/// meaning; this nudges exact keyword/ID hits and covers clips the embed
/// queue hasn't reached yet. Larger weights hurt paraphrase queries (eval).
const BM25_W: f32 = 0.02;
/// Soft category boost ("the tracking number" prefers `number` clips).
const CAT_BOOST: f32 = 0.02;

/// The search pipeline behind `search_semantic`, callable without Tauri
/// state so the eval harness exercises exactly this code.
///
/// 1. Parse out a date phrase (SQL window) and category keyword (soft boost).
/// 2. Stage 1, local: cosine of the query embedding against every clip's
///    stored vector, plus small BM25 / category / colour / recency nudges.
/// 3. Stage 2, optional: the top `Reranker::pool` go to the configured
///    re-ranker (Jev or Laya) as one Choice question; its probabilities,
///    blended per `Reranker::weight`, decide the order. If it fails, the
///    stage-1 order stands, so a flaky network never breaks search.
pub async fn search(
    db: Arc<Db>,
    cfg: &crate::embed::EmbedConfig,
    query: &str,
    limit: usize,
) -> Result<SearchResponse, String> {
    use std::collections::HashMap;

    let q_trimmed = query.trim().to_string();
    if q_trimmed.is_empty() {
        return Ok(SearchResponse { items: Vec::new(), time_window: None, category: None });
    }

    let parsed = crate::query_time::parse(chrono::Local::now(), &q_trimmed);
    let time_dto = parsed.time.as_ref().map(|t| TimeWindowDto {
        from_ms: t.from_ms,
        to_ms: t.to_ms,
        label: t.label.clone(),
    });
    let time_bounds = parsed.time.as_ref().map(|t| (t.from_ms, t.to_ms));
    let (from_ms, to_ms) = time_bounds.unwrap_or((i64::MIN, i64::MAX));

    // Category intent ("numbers", "links") is a soft boost, or a hard SQL
    // filter only when nothing else is left ("numbers").
    let intent = crate::query_intent::parse(&parsed.semantic);
    let semantic_q = intent.semantic.trim().to_string();
    let category_filter: Option<&str> = intent.category;
    let category_dto = intent.category.map(|c| c.to_string());
    let color_intent = crate::color_intent::detect(&q_trimmed);

    // Pure time / category query ("yesterday", "numbers"): newest matches.
    if semantic_q.is_empty() {
        if time_bounds.is_some() || category_filter.is_some() {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let items = items_in_window(&conn, from_ms, to_ms, category_filter, limit)?;
            return Ok(SearchResponse { items, time_window: time_dto, category: category_dto });
        }
        return Ok(SearchResponse { items: Vec::new(), time_window: None, category: None });
    }

    // ---- Stage 1: local embeddings -------------------------------------
    // If the model can't load (first-run download offline) we still answer
    // from BM25 below.
    let qv = {
        let q = semantic_q.clone();
        match tokio::task::spawn_blocking(move || crate::embed::embed_query(&q)).await {
            Ok(Ok(v)) => Some(v),
            Ok(Err(e)) => {
                eprintln!("[search] query embedding unavailable: {e}");
                None
            }
            Err(e) => {
                eprintln!("[search] query embedding task: {e}");
                None
            }
        }
    };

    let cat_want = category_filter.or(if color_intent.is_color { Some("color") } else { None });
    let now_ms = chrono::Utc::now().timestamp_millis();
    let rerank_with = cfg.reranker();
    let pool_size = rerank_with.as_ref().map_or(limit, |r| r.pool.max(limit));

    let pool: Vec<(f32, ClipItem)> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        // id -> (score, category, created_at)
        let mut scored: HashMap<i64, (f32, String, i64)> = HashMap::new();
        if let Some(qv) = &qv {
            for (id, cos, cat, created) in crate::embed::scan(&conn, qv, from_ms, to_ms)? {
                scored.insert(id, (cos, cat, created));
            }
        }
        for (rank, item) in bm25_pool(&conn, &semantic_q, 50, time_bounds)
            .unwrap_or_default()
            .into_iter()
            .enumerate()
        {
            let Ok(id) = item.id.parse::<i64>() else { continue };
            let nudge = BM25_W / (1.0 + rank as f32 / 5.0);
            scored
                .entry(id)
                .and_modify(|e| e.0 += nudge)
                .or_insert((nudge, item.category.clone(), now_ms - item.minutes_ago * 60_000));
        }

        // Colour similarity: when the query names a concrete colour, pull
        // perceptually-close swatches in (even ones no text describes).
        if let Some((tr, tg, tb)) = color_intent.target {
            const COLOR_MAX_DIST: f32 = 64.0;
            const COLOR_BOOST: f32 = 0.10;
            let mut stmt = conn
                .prepare(
                    "SELECT id, content, created_at FROM items
                     WHERE deleted = 0 AND category = 'color' AND created_at BETWEEN ?1 AND ?2",
                )
                .map_err(map_err)?;
            let rows = stmt
                .query_map(params![from_ms, to_ms], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))
                })
                .map_err(map_err)?;
            for (id, content, created) in rows.filter_map(|r| r.ok()) {
                let Some((r, g, b)) = crate::color_names::parse_color_to_rgb(&content) else {
                    continue;
                };
                let (dr, dg, db_) = (tr as f32 - r as f32, tg as f32 - g as f32, tb as f32 - b as f32);
                let dist = (dr * dr + dg * dg + db_ * db_).sqrt();
                if dist <= COLOR_MAX_DIST {
                    let boost = COLOR_BOOST * (1.0 - dist / COLOR_MAX_DIST);
                    scored
                        .entry(id)
                        .and_modify(|e| e.0 += boost)
                        .or_insert((boost, "color".into(), created));
                }
            }
        }

        for (score, cat, created) in scored.values_mut() {
            if cat_want == Some(cat.as_str()) {
                *score += CAT_BOOST;
            }
            // Recency tiebreak (~2-week decay), only without a date phrase.
            if time_bounds.is_none() {
                let age_days = (now_ms - *created).max(0) as f32 / 86_400_000.0;
                *score += 0.005 * (-age_days / 14.0).exp();
            }
        }

        let mut top: Vec<(i64, f32)> = scored.into_iter().map(|(id, (s, _, _))| (id, s)).collect();
        top.sort_by(|a, b| b.1.total_cmp(&a.1));
        top.truncate(pool_size);
        load_items(&conn, &top)?
    };

    // ---- Stage 2: optional re-rank ---------------------------------------
    // Only the top `r.pool` go out; anything below keeps its stage-1 order.
    let mut ranked: Vec<(f32, f32, ClipItem)> = pool.into_iter().map(|(s, it)| (s, s, it)).collect();
    if let Some(r) = rerank_with {
        let n = ranked.len().min(r.pool);
        let texts: Vec<String> = ranked[..n].iter().map(|(_, _, it)| candidate_text(it)).collect();
        match crate::jev::rerank(&r.url, &r.api_key, &r.model, &semantic_q, &texts).await {
            Ok(probs) => {
                let stage1: Vec<f32> = ranked[..n].iter().map(|row| row.1).collect();
                let fused = fuse(&probs, &stage1, r.weight);
                // Re-ranked rows sit above the unsent tail.
                for (row, f) in ranked[..n].iter_mut().zip(fused) {
                    row.0 = f + 1e3;
                }
            }
            Err(e) => eprintln!("[search] re-rank failed, using local order: {e}"),
        }
    }
    // Final score, then stage-1 score, then pinned.
    ranked.sort_by(|a, b| {
        b.0.total_cmp(&a.0)
            .then(b.1.total_cmp(&a.1))
            .then(b.2.pinned.cmp(&a.2.pinned))
    });
    let items = ranked.into_iter().take(limit).map(|(_, _, i)| i).collect();
    Ok(SearchResponse { items, time_window: time_dto, category: category_dto })
}

/// Blend re-ranker probabilities with stage-1 scores: `w * z(ln p) +
/// (1 - w) * z(stage1)`, z = standardised within the pool. Log-probability
/// puts a Choice distribution and per-item logits (Laya) on one scale.
/// `w >= 1` is the plain re-ranker order.
fn fuse(probs: &[f32], stage1: &[f32], w: f32) -> Vec<f32> {
    fn z(x: &[f32]) -> Vec<f32> {
        let n = x.len().max(1) as f32;
        let mean = x.iter().sum::<f32>() / n;
        let sd = (x.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / n).sqrt() + 1e-6;
        x.iter().map(|v| (v - mean) / sd).collect()
    }
    let lp: Vec<f32> = probs.iter().map(|p| p.max(1e-12).ln()).collect();
    if w >= 1.0 {
        return lp;
    }
    z(&lp).iter().zip(z(stage1)).map(|(a, b)| w * a + (1.0 - w) * b).collect()
}

/// Fetch full rows for scored ids, preserving the given order.
fn load_items(conn: &rusqlite::Connection, top: &[(i64, f32)]) -> Result<Vec<(f32, ClipItem)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, content, category, label, preview, source, pinned,
                    deleted, deleted_at, last_used_at
             FROM items WHERE id = ?1 AND deleted = 0",
        )
        .map_err(map_err)?;
    Ok(top
        .iter()
        .filter_map(|(id, s)| stmt.query_row(params![id], row_to_item).ok().map(|it| (*s, it)))
        .collect())
}

/// Upper bound on characters we send the re-ranker per candidate, keeping
/// token cost and latency predictable while preserving the gist of a long clip.
const MAX_CAND_CHARS: usize = 500;

/// Compose the plain text handed to the re-ranker for a candidate clip. It reads
/// natural language, so we lead with the AI label (high-signal summary, only
/// when present), then the body, then the source app so queries like "the
/// slack link" can hit on source even when the content is a bare URL.
fn candidate_text(item: &ClipItem) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(4);
    if item.label_generated && !item.label.is_empty() {
        parts.push(item.label.clone());
    }
    let mut body: String = item.content.trim().chars().take(MAX_CAND_CHARS).collect();
    // Colour enrichment: Jev sees the raw hex/rgb value, but a human-readable
    // name is high signal for queries like "orange". Append the nearest named
    // colours so a bare "#ff6b35" still matches a "brand orange" search.
    if item.category == "color" {
        let enriched = crate::color_names::enrich_color_text(&body);
        if !enriched.is_empty() {
            body = format!("{body} {enriched}");
        }
    }
    if !body.is_empty() {
        parts.push(body);
    }
    if !item.source.is_empty() {
        parts.push(format!("(from {})", item.source));
    }
    parts.join("\n")
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

#[cfg(test)]
mod tests {
    #[test]
    fn fuse_full_weight_is_reranker_order_half_weight_blends() {
        let probs = [0.7, 0.2, 0.1];
        let stage1 = [0.1, 0.9, 0.5];
        let full = super::fuse(&probs, &stage1, 1.0);
        assert!(full[0] > full[1] && full[1] > full[2]);
        // At 0.5 the strong stage-1 score lifts item 1 over item 0.
        let half = super::fuse(&probs, &stage1, 0.5);
        assert!(half[1] > half[0]);
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn paste_outcome_reports_copied_when_backend_falls_back() {
        assert_eq!(super::paste_outcome(true), "pasted");
        assert_eq!(super::paste_outcome(false), "copied");
    }
}
