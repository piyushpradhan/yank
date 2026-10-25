//! Bundled, fully-local embedding via fastembed (ONNX Runtime).
//!
//! The model is downloaded once into the Tauri app data dir and then runs
//! offline. We hold a single loaded `TextEmbedding` instance behind a
//! mutex; callers serialise through it. `embed_local` is async and runs
//! the actual inference on the blocking pool so it never stalls the
//! Tauri runtime.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use fastembed::{
    EmbeddingModel, InitOptionsUserDefined, OutputKey, Pooling, QuantizationMode, TextEmbedding,
    TextInitOptions, TokenizerFiles, UserDefinedEmbeddingModel,
};
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

/// Load a user-facing model id. fastembed ships BGE, MiniLM and
/// EmbeddingGemma-300M; EmbeddingGemma 2 (Oct 2026) isn't in its catalogue
/// yet, so it loads as a user-defined model (see [`load_gemma2`]).
fn load_model(name: &str, cache_dir: PathBuf) -> Result<TextEmbedding, String> {
    let kind = match name {
        "bge-small-en-v1.5" => EmbeddingModel::BGESmallENV15,
        "all-minilm-l6-v2" => EmbeddingModel::AllMiniLML6V2,
        // 4-bit ONNX, ~200 MB.
        "embeddinggemma-300m" => EmbeddingModel::EmbeddingGemma300MQ4,
        "embeddinggemma-2" => return load_gemma2(cache_dir),
        other => return Err(format!("unsupported local model: {other}")),
    };
    let opts = TextInitOptions::new(kind)
        .with_cache_dir(cache_dir)
        .with_show_download_progress(false);
    TextEmbedding::try_new(opts).map_err(|e| format!("local model init: {e}"))
}

/// EmbeddingGemma 2, text tower only, int8 (~314 MB). The official
/// onnx-community export also demands image/audio/video feature inputs that
/// fastembed can't feed; vespa-engine's export stubs them out with empty
/// constants (weights unchanged, verified against sentence-transformers).
/// ponytail: third-party repo; switch to fastembed's built-in entry once it lands.
fn load_gemma2(cache_dir: PathBuf) -> Result<TextEmbedding, String> {
    let api = hf_hub::api::sync::ApiBuilder::new()
        .with_cache_dir(cache_dir)
        .with_progress(false)
        .build()
        .map_err(|e| format!("hf api: {e}"))?;
    let read = |repo: &str, file: &str| -> Result<Vec<u8>, String> {
        let path = api
            .model(repo.into())
            .get(file)
            .map_err(|e| format!("download {repo}/{file}: {e}"))?;
        std::fs::read(path).map_err(|e| format!("read {file}: {e}"))
    };
    const REPO: &str = "vespa-engine/embeddinggemma-2-ONNX";
    let tokenizer = TokenizerFiles {
        tokenizer_file: read(REPO, "tokenizer.json")?,
        // Only consulted for pad_token_id; absent here, so fastembed falls
        // back to the tokenizer's `<pad>` id.
        config_file: b"{}".to_vec(),
        special_tokens_map_file: b"{}".to_vec(),
        tokenizer_config_file: read(REPO, "tokenizer_config.json")?,
    };
    let model = UserDefinedEmbeddingModel::new(read(REPO, "onnx/int8/model.onnx")?, tokenizer)
        .with_external_initializer("model.onnx_data".into(), read(REPO, "onnx/int8/model.onnx_data")?)
        .with_pooling(Pooling::Mean)
        .with_quantization(QuantizationMode::Dynamic);
    let model = UserDefinedEmbeddingModel {
        output_key: Some(OutputKey::ByName("sentence_embedding")),
        ..model
    };
    TextEmbedding::try_new_from_user_defined(model, InitOptionsUserDefined::new())
        .map_err(|e| format!("local model init: {e}"))
}

/// Retrieval prompts each model was trained with; documents stay raw for
/// BGE and MiniLM.
fn apply_prompt(model: &str, text: &str, task: EmbedTask) -> String {
    match (model, task) {
        (m, EmbedTask::Query) if m.starts_with("bge-") => {
            format!("Represent this sentence for searching relevant passages: {text}")
        }
        // Same prompts for both generations (from the model cards).
        (m, EmbedTask::Query) if m.starts_with("embeddinggemma") => {
            format!("task: search result | query: {text}")
        }
        (m, EmbedTask::Document) if m.starts_with("embeddinggemma") => {
            format!("title: none | text: {text}")
        }
        _ => text.to_string(),
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
    // Downloads happen in `model_store`, never inside an embed call.
    if !crate::model_store::is_ready(&cache_dir, model_name) {
        return Err(format!("{model_name} is not downloaded yet"));
    }
    let inner = state.handle();
    let model_name = model_name.to_string();
    let prepped = apply_prompt(&model_name, text, task);

    tokio::task::spawn_blocking(move || -> Result<Vec<f32>, String> {
        let mut guard = inner.lock().map_err(|e| format!("lock: {e}"))?;
        let need_init = match guard.as_ref() {
            Some(c) => c.name != model_name,
            None => true,
        };
        if need_init {
            std::fs::create_dir_all(&cache_dir)
                .map_err(|e| format!("create cache dir: {e}"))?;
            let model = load_model(&model_name, cache_dir.clone())?;
            *guard = Some(Cached {
                name: model_name.clone(),
                model,
            });
        }

        let cached = guard.as_mut().expect("just initialised");
        let mut out = cached
            .model
            .embed([prepped], None)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_model_gets_its_retrieval_prompt() {
        let q = |m| apply_prompt(m, "x", EmbedTask::Query);
        let d = |m| apply_prompt(m, "x", EmbedTask::Document);
        assert!(q("bge-small-en-v1.5").starts_with("Represent this sentence"));
        assert_eq!(d("bge-small-en-v1.5"), "x");
        assert_eq!(q("all-minilm-l6-v2"), "x");
        for m in ["embeddinggemma-300m", "embeddinggemma-2"] {
            assert_eq!(q(m), "task: search result | query: x");
            assert_eq!(d(m), "title: none | text: x");
        }
    }
}
