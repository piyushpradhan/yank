//! Background worker that generates one-line intent labels for newly-captured
//! clips via Anthropic Claude Haiku. Mirrors the shape of `embed_queue.rs`.
//!
//! Lifecycle:
//! 1. `spawn()` is called once at startup from `lib.rs` → owns an mpsc channel.
//! 2. Anyone (watcher on capture, settings on key change) calls `kick()` to
//!    wake the worker. The worker also retries periodically in case a transient
//!    network error dropped an item last time.
//! 3. For each unlabeled item, call Anthropic. On success, UPDATE + emit
//!    `clip-labeled`. On error, log and stop this batch — we'll retry on the
//!    next kick or the 60-second timer.
//!
//! Robustness:
//! - Never panics the worker thread on bad input — errors are logged.
//! - Stops the current batch on error rather than looping the whole queue
//!   through a broken API; most failures are per-account (bad key, rate limit)
//!   and affect every call.
//! - Emits `clip-labeled` with the id so the frontend can refresh that row
//!   without a full re-fetch.

use std::sync::{
    mpsc::{self, Sender},
    Arc, Mutex, OnceLock,
};
use std::time::Duration;

use rusqlite::params;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::Db;
use crate::embed::EmbedConfig;
use crate::label;
use crate::settings::SettingsState;

static TX: OnceLock<Mutex<Option<Sender<()>>>> = OnceLock::new();

/// How often we wake up even without a kick, to retry items that failed last
/// time (e.g. transient network errors).
const RETRY_INTERVAL: Duration = Duration::from_secs(60);

/// Max items processed per wake. Keeps each tick bounded so a big backlog
/// doesn't hog the single HTTP client for minutes.
const BATCH_LIMIT: i64 = 10;

pub fn kick(app: &AppHandle) {
    let _ = app;
    if let Some(lock) = TX.get() {
        if let Ok(guard) = lock.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(());
            }
        }
    }
}

pub fn spawn(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<()>();
    TX.set(Mutex::new(Some(tx))).ok();

    let handle = app.clone();
    std::thread::spawn(move || {
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(err) => {
                eprintln!("[label] runtime build failed: {err}");
                return;
            }
        };
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
        {
            Ok(c) => c,
            Err(err) => {
                eprintln!("[label] reqwest client failed: {err}");
                return;
            }
        };

        loop {
            let _ = rx.recv_timeout(RETRY_INTERVAL);

            let cfg = snapshot_config(&handle);
            let api_key = cfg.anthropic_api_key.trim().to_string();
            if api_key.is_empty() {
                continue;
            }

            let pending = load_pending(&handle, BATCH_LIMIT);
            if pending.is_empty() {
                continue;
            }

            for (id, category, content) in pending {
                let result = runtime.block_on(label::generate_label(
                    &client, &api_key, &category, &content,
                ));
                match result {
                    Ok(label_text) if !label_text.is_empty() => {
                        if let Err(err) = store_label(&handle, id, &label_text) {
                            eprintln!("[label] store failed id={id}: {err}");
                            continue;
                        }
                        let _ = handle.emit("clip-labeled", id);
                        // Re-embed now that the label is available — the
                        // document text that feeds embeddings includes the
                        // label, so a fresh label can change retrieval
                        // quality noticeably.
                        crate::embed_queue::kick(&handle);
                    }
                    Ok(_) => {
                        eprintln!("[label] empty label for id={id}; skipping");
                    }
                    Err(err) => {
                        eprintln!("[label] failed id={id}: {err}");
                        // Stop the batch — likely an auth/quota issue affecting
                        // every subsequent call.
                        break;
                    }
                }
            }
        }
    });

    // Startup kick so any pre-existing unlabeled items get picked up once
    // settings finish loading.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(800));
        kick(&app);
    });
}

fn snapshot_config(app: &AppHandle) -> EmbedConfig {
    let state = app.state::<SettingsState>();
    state.0.read().map(|g| g.clone()).unwrap_or_default()
}

fn load_pending(app: &AppHandle, limit: i64) -> Vec<(i64, String, String)> {
    let db = app.state::<Arc<Db>>().inner().clone();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, category, content
         FROM items
         WHERE deleted = 0
           AND (label IS NULL OR label = '')
         ORDER BY last_used_at DESC
         LIMIT ?1",
    ) else {
        return Vec::new();
    };
    stmt.query_map(params![limit], |r| {
        let id: i64 = r.get(0)?;
        let category: String = r.get(1)?;
        let content: String = r.get(2)?;
        Ok((id, category, content))
    })
    .map(|iter| iter.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

fn store_label(app: &AppHandle, id: i64, label: &str) -> Result<(), String> {
    let db = app.state::<Arc<Db>>().inner().clone();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // Clearing embedding_model marks the item for re-embedding on the next
    // queue tick — the label is part of the embedded text, so a fresh
    // label should retrigger vectorisation.
    conn.execute(
        "UPDATE items SET label = ?1, embedding_model = NULL WHERE id = ?2",
        params![label, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
