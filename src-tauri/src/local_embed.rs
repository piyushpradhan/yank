//! Bundled, fully-local embedding via fastembed (ONNX Runtime).
//!
//! The model is downloaded once into the Tauri app data dir and then runs
//! offline. We hold a single loaded `TextEmbedding` instance behind a
//! mutex; callers serialise through it. `embed_local` is async and runs
//! the actual inference on the blocking pool so it never stalls the
//! Tauri runtime.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use tauri::{AppHandle, Manager};

use crate::embed::{normalize, EmbedTask};

struct Cached {
    name: String,
    model: TextEmbedding,
}

/// Tauri-managed state holding the lazily-initialised local model.
/// Wrapped in `Arc<Mutex<…>>` so we can move a clone into `spawn_blocking`.
pub struct LocalState {
    inner: Arc<Mutex<Option<Cached>>>,
}

impl LocalState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    /// Drop the cached model — call when the user picks a different
    /// local model so the next embed reloads. Cheap; no IO.
    pub fn invalidate(&self) {
        if let Ok(mut g) = self.inner.lock() {
            *g = None;
        }
    }

    fn handle(&self) -> Arc<Mutex<Option<Cached>>> {
        self.inner.clone()
    }
}

/// Map our user-facing model id strings to fastembed's enum.
fn resolve_model(name: &str) -> Result<EmbeddingModel, String> {
    match name {
        "bge-small-en-v1.5" => Ok(EmbeddingModel::BGESmallENV15),
        "all-minilm-l6-v2" => Ok(EmbeddingModel::AllMiniLML6V2),
        other => Err(format!("unsupported local model: {other}")),
    }
}

/// BGE models perform noticeably better on retrieval when the query is
/// prefixed with the canonical instruction; documents stay raw.
fn apply_query_prefix(model: &str, text: &str, task: EmbedTask) -> String {
    if matches!(task, EmbedTask::Query) && model.starts_with("bge-") {
        format!(
            "Represent this sentence for searching relevant passages: {text}"
        )
    } else {
        text.to_string()
    }
}

/// Embed a single text with the bundled local model. Lazily loads (and
/// downloads on first use) into `cache_dir`.
pub async fn embed_local(
    state: &LocalState,
    cache_dir: PathBuf,
    model_name: &str,
    text: &str,
    task: EmbedTask,
) -> Result<Vec<f32>, String> {
    let inner = state.handle();
    let model_name = model_name.to_string();
    let prepped = apply_query_prefix(&model_name, text, task);

    tokio::task::spawn_blocking(move || -> Result<Vec<f32>, String> {
        let mut guard = inner.lock().map_err(|e| format!("lock: {e}"))?;
        let need_init = match guard.as_ref() {
            Some(c) => c.name != model_name,
            None => true,
        };
        if need_init {
            std::fs::create_dir_all(&cache_dir)
                .map_err(|e| format!("create cache dir: {e}"))?;
            let kind = resolve_model(&model_name)?;
            let opts = InitOptions::new(kind)
                .with_cache_dir(cache_dir.clone())
                .with_show_download_progress(false);
            let model = TextEmbedding::try_new(opts)
                .map_err(|e| format!("local model init: {e}"))?;
            *guard = Some(Cached {
                name: model_name.clone(),
                model,
            });
        }

        let cached = guard.as_mut().expect("just initialised");
        let mut out = cached
            .model
            .embed(vec![prepped], None)
            .map_err(|e| format!("local embed: {e}"))?;
        let v = out.pop().ok_or_else(|| "local embed: empty".to_string())?;
        Ok(normalize(v))
    })
    .await
    .map_err(|e| format!("blocking join: {e}"))?
}

/// Resolve where on disk we keep the downloaded model files.
pub fn cache_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir")
        .join("models")
}
