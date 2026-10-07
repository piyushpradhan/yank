//! Background worker that embeds clips with the local model (see `embed.rs`).
//!
//! Same lifecycle as `label_queue`: `spawn()` once at startup, `kick()` on
//! capture. Each wake embeds up to `BATCH` clips whose vector is missing or
//! from an older model, newest first, so fresh clips are searchable within a
//! second and a backlog drains without starving searches of the model lock.

use std::sync::{
    mpsc::{self, Sender},
    Arc, Mutex, OnceLock,
};
use std::time::Duration;

use rusqlite::params;
use tauri::{AppHandle, Manager};

use crate::db::Db;
use crate::embed;
use crate::settings::SettingsState;

static TX: OnceLock<Mutex<Sender<()>>> = OnceLock::new();

/// Small batches keep each hold of the model lock short (a search waiting on
/// it stalls at most one batch).
const BATCH: i64 = 8;

pub fn kick() {
    if let Some(tx) = TX.get().and_then(|m| m.lock().ok()) {
        let _ = tx.send(());
    }
}

pub fn spawn(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<()>();
    TX.set(Mutex::new(tx.clone())).ok();

    std::thread::spawn(move || loop {
        let _ = rx.recv_timeout(Duration::from_secs(60));
        let active = app
            .state::<SettingsState>()
            .0
            .read()
            .map(|c| c.is_active())
            .unwrap_or(false);
        if !active {
            continue;
        }
        let db = app.state::<Arc<Db>>().inner().clone();
        // Drain the backlog batch by batch; stop on the first error (e.g. the
        // model download failed offline) and retry on the next wake.
        loop {
            match run_batch(&db) {
                Ok(0) => break,
                Ok(_) => continue,
                Err(err) => {
                    eprintln!("[embed] {err}");
                    break;
                }
            }
        }
    });

    let _ = tx.send(()); // backfill on startup
}

/// Embed one batch of pending clips. Returns how many were embedded.
pub fn run_batch(db: &Db) -> Result<usize, String> {
    let pending: Vec<(i64, String, String, i64)> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, category, label, content, created_at, source FROM items
                 WHERE deleted = 0 AND category != 'image'
                   AND (embedding_model IS NULL OR embedding_model != ?1)
                 ORDER BY created_at DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![embed::MODEL_ID, BATCH], |r| {
                let label: Option<String> = r.get(2)?;
                let source: Option<String> = r.get(5)?;
                let category: String = r.get(1)?;
                Ok((
                    r.get::<_, i64>(0)?,
                    embed::doc_text(
                        &category,
                        label.as_deref(),
                        &r.get::<_, String>(3)?,
                        source.as_deref(),
                    ),
                    category,
                    r.get::<_, i64>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if pending.is_empty() {
        return Ok(0);
    }
    // No DB lock held while the model runs.
    let texts: Vec<String> = pending.iter().map(|(_, t, _, _)| t.clone()).collect();
    let vecs = embed::embed_docs(&texts)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    for ((id, _, category, created), v) in pending.iter().zip(vecs) {
        conn.execute(
            "UPDATE items SET embedding = ?1, embedding_model = ?2 WHERE id = ?3",
            params![embed::to_bytes(&v), embed::MODEL_ID, id],
        )
        .map_err(|e| e.to_string())?;
        embed::index_upsert(*id, *created, category, &v);
    }
    Ok(pending.len())
}
