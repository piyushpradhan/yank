use arboard::Clipboard;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::db::Db;

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

#[tauri::command]
pub fn get_image(id: String, db: State<'_, Arc<Db>>) -> Result<Option<ImageData>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;

    let data: Option<Vec<u8>> = conn
        .query_row(
            "SELECT image_data FROM items WHERE id = ?1 AND category = 'image' AND deleted = 0",
            params![id_num],
            |r| r.get(0),
        )
        .ok()
        .filter(|d: &Vec<u8>| !d.is_empty());

    match data {
        Some(raw) if raw.len() >= 8 => {
            let width = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
            let height = u32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]) as usize;
            let bytes = raw[8..].to_vec();
            Ok(Some(ImageData { width, height, bytes }))
        }
        _ => Ok(None),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    pub width: usize,
    pub height: usize,
    pub bytes: Vec<u8>,
}

#[tauri::command]
pub fn copy_image(id: String, db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;

    let data: Option<Vec<u8>> = conn
        .query_row(
            "SELECT image_data FROM items WHERE id = ?1 AND category = 'image' AND deleted = 0",
            params![id_num],
            |r| r.get(0),
        )
        .ok()
        .filter(|d: &Vec<u8>| !d.is_empty());

    match data {
        Some(raw) if raw.len() >= 8 => {
            let width = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
            let height = u32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]) as usize;
            let bytes: Vec<u8> = raw[8..].to_vec();

            let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
            let img = arboard::ImageData {
                width,
                height,
                bytes: bytes.into(),
            };
            cb.set_image(img).map_err(|e| e.to_string())?;
            Ok(())
        }
        _ => Err("Image not found".into()),
    }
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
pub fn update_label(id: String, label: String, db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id_num: i64 = id.parse().map_err(map_err)?;
    conn.execute(
        "UPDATE items SET label = ?1 WHERE id = ?2",
        params![label, id_num],
    )
    .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn clear_history(db: State<'_, Arc<Db>>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM items WHERE pinned = 0", [])
        .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub async fn search_semantic(
    query: String,
    limit: Option<usize>,
    app: tauri::AppHandle,
    db: State<'_, Arc<Db>>,
    settings: State<'_, crate::settings::SettingsState>,
    local: State<'_, crate::local_embed::LocalState>,
) -> Result<Vec<ClipItem>, String> {
    use crate::embed::{self, EmbedConfig, EmbedTask, Provider};
    use crate::local_embed;

    let cfg: EmbedConfig = settings.0.read().map_err(|e| e.to_string())?.clone();
    if !cfg.is_active() {
        return Err("semantic search not configured".into());
    }
    let q_trimmed = query.trim().to_string();
    if q_trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.unwrap_or(20);

    // Embed the query outside the DB lock.
    let q_vec = if matches!(cfg.provider, Provider::Local) {
        local_embed::embed_local(
            local.inner(),
            local_embed::cache_dir(&app),
            &cfg.local_model,
            &q_trimmed,
            EmbedTask::Query,
        )
        .await?
    } else {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        embed::embed(&cfg, &client, &q_trimmed, EmbedTask::Query).await?
    };

    // Pool A — vector candidates. Score every embedded item by cosine on
    // the L2-normalised vectors, filter out obvious noise, keep the top K.
    // K is intentionally wider than `limit` because RRF then re-ranks this
    // pool against the BM25 pool before we trim to the final window.
    const VEC_POOL: usize = 50;
    const FTS_POOL: usize = 50;
    // 0.25 is a loose floor — we rely on RRF fusion for final ordering, so
    // we just want to drop embeddings that are clearly orthogonal.
    const VEC_THRESHOLD: f32 = 0.25;
    // Standard RRF constant from the original paper; dampens runaway rank
    // differences so the two pools blend smoothly.
    const RRF_K: f32 = 60.0;

    let db: Arc<Db> = db.inner().clone();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let model_id = cfg.model_id();

    // --- Pool A: cosine --------------------------------------------------
    let mut stmt_vec = conn
        .prepare(
            "SELECT id, content, category, label, preview, source, pinned,
                    deleted, deleted_at, last_used_at, embedding
             FROM items
             WHERE deleted = 0 AND embedding IS NOT NULL AND embedding_model = ?1",
        )
        .map_err(map_err)?;

    let mut scored: Vec<(f32, ClipItem)> = stmt_vec
        .query_map(params![model_id], |row| {
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
    // Build a forgiving MATCH query — prefix every term so "cors" matches
    // "corsair", and escape embedded quotes. If the tokeniser rejects the
    // query (rare — e.g. only punctuation) we fall through with an empty
    // BM25 pool.
    let fts_pool = bm25_pool(&conn, &q_trimmed, FTS_POOL).unwrap_or_default();

    // --- Reciprocal Rank Fusion -----------------------------------------
    // For each item present in either pool, score = Σ 1 / (RRF_K + rank_i).
    // Items unique to one pool still get a contribution from that pool;
    // items in both are boosted. This is robust to different score scales
    // (BM25 is unbounded negative, cosine is [-1, 1]).
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

    let mut ranked: Vec<(f32, ClipItem)> = fused.into_values().collect();
    // Pinned items win ties; otherwise sort strictly by fused score desc.
    ranked.sort_by(|a, b| {
        let pin_cmp = b.1.pinned.cmp(&a.1.pinned);
        if pin_cmp != std::cmp::Ordering::Equal {
            return pin_cmp;
        }
        b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(ranked.into_iter().take(limit).map(|(_, i)| i).collect())
}

/// Run the query through FTS5 and return the top-N item rows in BM25 order.
/// Returns an empty Vec if the query is unusable (e.g. only punctuation).
fn bm25_pool(
    conn: &rusqlite::Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<ClipItem>, String> {
    // Split on whitespace, strip quotes, prefix-match each term. `foo bar`
    // becomes `foo* bar*` — matches documents containing a token that starts
    // with either.
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|t| !t.is_empty())
        .map(|t| format!("{}*", t.replace('\"', "\"\"")))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let match_q = terms.join(" OR ");

    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.content, i.category, i.label, i.preview, i.source,
                    i.pinned, i.deleted, i.deleted_at, i.last_used_at
             FROM items_fts
             JOIN items i ON i.id = items_fts.rowid
             WHERE items_fts MATCH ?1 AND i.deleted = 0
             ORDER BY bm25(items_fts)
             LIMIT ?2",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params![match_q, limit as i64], row_to_item)
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
