//! Local embedding model files: what each model needs, whether it is on
//! disk, and background downloads with progress, pause and resume.
//!
//! Files land in the hf-hub cache layout fastembed reads (see
//! [`crate::local_embed::cache_dir`]), so a model downloaded here loads
//! offline. hf-hub resumes a file from its `.part` file, so pausing stops
//! the transfer and keeps the partial file; resuming starts the same
//! download again.

use std::collections::{HashMap, HashSet};
use std::panic::{self, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

use hf_hub::api::sync::ApiBuilder;
use hf_hub::api::Progress;
use hf_hub::Cache;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Files fastembed (or [`crate::local_embed`]) reads for a model, and their
/// combined size so the UI can show it before anything is downloaded.
struct Spec {
    id: &'static str,
    repo: &'static str,
    files: &'static [&'static str],
    bytes: u64,
}

const CATALOG: &[Spec] = &[
    Spec {
        id: "bge-small-en-v1.5",
        repo: "Xenova/bge-small-en-v1.5",
        files: &["onnx/model.onnx", "tokenizer.json", "config.json", "special_tokens_map.json", "tokenizer_config.json"],
        bytes: 133_806_060,
    },
    Spec {
        id: "all-minilm-l6-v2",
        repo: "Qdrant/all-MiniLM-L6-v2-onnx",
        files: &["model.onnx", "tokenizer.json", "config.json", "special_tokens_map.json", "tokenizer_config.json"],
        bytes: 91_102_036,
    },
    Spec {
        id: "embeddinggemma-300m",
        repo: "onnx-community/embeddinggemma-300m-ONNX",
        files: &[
            "onnx/model_q4.onnx",
            "onnx/model_q4.onnx_data",
            "tokenizer.json",
            "config.json",
            "special_tokens_map.json",
            "tokenizer_config.json",
        ],
        bytes: 218_727_651,
    },
    Spec {
        id: "embeddinggemma-2",
        repo: "vespa-engine/embeddinggemma-2-ONNX",
        files: &["onnx/int8/model.onnx", "onnx/int8/model.onnx_data", "tokenizer.json", "tokenizer_config.json"],
        bytes: 346_386_007,
    },
];

fn spec(id: &str) -> Option<&'static Spec> {
    CATALOG.iter().find(|s| s.id == id)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Status {
    Missing { total: u64 },
    Downloading { done: u64, total: u64 },
    Paused { done: u64, total: u64 },
    Ready { total: u64 },
    Failed { done: u64, total: u64, error: String },
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    id: &'static str,
    #[serde(flatten)]
    status: Status,
}

/// Running downloads (their stop flag) and their latest status. A failed
/// download stays here so the UI can show the error until a retry.
struct Live {
    status: Status,
    stop: Option<Arc<AtomicBool>>,
}

static LIVE: LazyLock<Mutex<HashMap<&'static str, Live>>> = LazyLock::new(Default::default);
/// Models the user paused this session; automatic downloads leave them alone.
static USER_PAUSED: LazyLock<Mutex<HashSet<&'static str>>> = LazyLock::new(Default::default);

/// Unwound out of hf-hub's progress callback to stop a transfer: hf-hub
/// has no cancel hook. `resume_unwind` skips the panic hook, so nothing is
/// printed.
struct Stopped;

fn file_len(p: &Path) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

/// What is on disk: every file present, some bytes (complete files or
/// `.part` partials), or nothing.
fn disk_status(dir: &Path, spec: &Spec) -> Status {
    let repo = Cache::new(dir.to_path_buf()).model(spec.repo.into());
    let mut done = 0;
    let mut complete = true;
    for f in spec.files {
        match repo.get(f) {
            Some(p) => done += file_len(&p),
            None => complete = false,
        }
    }
    if complete {
        return Status::Ready { total: done };
    }
    let blobs = dir.join(format!("models--{}", spec.repo.replace('/', "--"))).join("blobs");
    if let Ok(entries) = std::fs::read_dir(blobs) {
        done += entries
            .flatten()
            .filter(|e| e.path().to_string_lossy().ends_with(".part"))
            .map(|e| file_len(&e.path()))
            .sum::<u64>();
    }
    let total = spec.bytes;
    if done > 0 {
        Status::Paused { done: done.min(total), total }
    } else {
        Status::Missing { total }
    }
}

fn status(dir: &Path, spec: &'static Spec) -> Status {
    match LIVE.lock().unwrap().get(spec.id) {
        Some(live) => live.status.clone(),
        None => disk_status(dir, spec),
    }
}

/// Every file of the model is on disk. Unknown ids say yes, so fastembed
/// reports the real error.
pub fn is_ready(dir: &Path, id: &str) -> bool {
    spec(id).is_none_or(|s| matches!(disk_status(dir, s), Status::Ready { .. }))
}

struct Reporter<'a> {
    stop: &'a AtomicBool,
    report: &'a dyn Fn(u64),
    /// Bytes of files already complete.
    base: u64,
    file_done: u64,
    last: Instant,
}

impl Progress for Reporter<'_> {
    fn init(&mut self, _size: usize, _filename: &str) {
        // hf-hub re-inits on resume and on retry, then reports the bytes
        // already on disk as one update.
        self.file_done = 0;
    }

    fn update(&mut self, size: usize) {
        if self.stop.load(Ordering::Relaxed) {
            panic::resume_unwind(Box::new(Stopped));
        }
        self.file_done += size as u64;
        if self.last.elapsed() >= Duration::from_millis(200) {
            self.last = Instant::now();
            (self.report)(self.base + self.file_done);
        }
    }

    fn finish(&mut self) {}
}

/// Download every missing file of `spec` into `dir`. Blocking. `report`
/// gets the running byte count. Returns `Ok(false)` when stopped.
fn fetch(dir: &Path, spec: &Spec, stop: &AtomicBool, report: &dyn Fn(u64)) -> Result<bool, String> {
    let api = ApiBuilder::from_cache(Cache::new(dir.to_path_buf()))
        .with_progress(false)
        .with_retries(3)
        .build()
        .map_err(|e| format!("download setup: {e}"))?;
    let remote = api.model(spec.repo.into());
    let cache = Cache::new(dir.to_path_buf()).model(spec.repo.into());
    let mut base = 0;
    for f in spec.files {
        if let Some(p) = cache.get(f) {
            base += file_len(&p);
            continue;
        }
        let reporter = Reporter { stop, report, base, file_done: 0, last: Instant::now() };
        let got = panic::catch_unwind(AssertUnwindSafe(|| remote.download_with_progress(f, reporter)));
        match got {
            Ok(Ok(p)) => base += file_len(&p),
            Ok(Err(e)) => return Err(format!("{f}: {e}")),
            Err(payload) if payload.is::<Stopped>() => return Ok(false),
            Err(payload) => panic::resume_unwind(payload),
        }
        report(base);
    }
    Ok(true)
}

/// Download a model without the app (the eval harness). Blocking.
pub fn download_blocking(dir: &Path, id: &str) -> Result<(), String> {
    match spec(id) {
        Some(s) => fetch(dir, s, &AtomicBool::new(false), &|_| {}).map(|_| ()),
        None => Ok(()),
    }
}

fn emit(app: &AppHandle, id: &'static str, status: Status) {
    let _ = app.emit("model-download", ModelStatus { id, status });
}

/// Start (or resume) a background download. No-op when one is running or
/// the model is already on disk.
fn start(app: &AppHandle, dir: PathBuf, spec: &'static Spec) {
    let initial = disk_status(&dir, spec);
    let (done, total) = match initial {
        Status::Ready { .. } => return,
        Status::Paused { done, total } => (done, total),
        _ => (0, spec.bytes),
    };
    let stop = Arc::new(AtomicBool::new(false));
    {
        let mut live = LIVE.lock().unwrap();
        if live.get(spec.id).is_some_and(|l| l.stop.is_some()) {
            return;
        }
        let status = Status::Downloading { done, total };
        live.insert(spec.id, Live { status: status.clone(), stop: Some(stop.clone()) });
        emit(app, spec.id, status);
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let report = |done: u64| {
            let status = Status::Downloading { done: done.min(total), total };
            if let Some(l) = LIVE.lock().unwrap().get_mut(spec.id) {
                l.status = status.clone();
            }
            emit(&app, spec.id, status);
        };
        let result = fetch(&dir, spec, &stop, &report);
        let mut live = LIVE.lock().unwrap();
        let status = match result {
            Err(error) => {
                let done = match disk_status(&dir, spec) {
                    Status::Paused { done, .. } => done,
                    _ => 0,
                };
                let status = Status::Failed { done, total, error };
                live.insert(spec.id, Live { status: status.clone(), stop: None });
                status
            }
            Ok(_) => {
                live.remove(spec.id);
                disk_status(&dir, spec)
            }
        };
        drop(live);
        eprintln!("[models] {}: {:?}", spec.id, status);
        let ready = matches!(status, Status::Ready { .. });
        emit(&app, spec.id, status);
        if ready {
            // Let the embed queue index clips with the new model.
            crate::embed_queue::kick(&app);
        }
    });
}

/// Called whenever the app needs `id` (search, the embed queue): starts a
/// download unless the user paused it this session.
pub fn ensure(app: &AppHandle, dir: PathBuf, id: &str) {
    if let Some(s) = spec(id) {
        if !USER_PAUSED.lock().unwrap().contains(s.id) {
            start(app, dir, s);
        }
    }
}

#[tauri::command]
pub fn list_local_models(app: AppHandle) -> Vec<ModelStatus> {
    let dir = crate::local_embed::cache_dir(&app);
    CATALOG.iter().map(|s| ModelStatus { id: s.id, status: status(&dir, s) }).collect()
}

#[tauri::command]
pub fn download_local_model(app: AppHandle, id: String) -> Result<(), String> {
    let s = spec(&id).ok_or_else(|| format!("unknown model: {id}"))?;
    USER_PAUSED.lock().unwrap().remove(s.id);
    // Also retries a failed download, from where it stopped.
    start(&app, crate::local_embed::cache_dir(&app), s);
    Ok(())
}

#[tauri::command]
pub fn pause_local_model(id: String) -> Result<(), String> {
    let s = spec(&id).ok_or_else(|| format!("unknown model: {id}"))?;
    USER_PAUSED.lock().unwrap().insert(s.id);
    if let Some(stop) = LIVE.lock().unwrap().get(s.id).and_then(|l| l.stop.as_ref()) {
        stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// Delete a model's files (or a paused partial download). Refused for the
/// model search is using and while a download runs.
#[tauri::command]
pub fn delete_local_model(
    app: AppHandle,
    id: String,
    settings: State<'_, crate::settings::SettingsState>,
    local: State<'_, crate::local_embed::LocalState>,
) -> Result<(), String> {
    let s = spec(&id).ok_or_else(|| format!("unknown model: {id}"))?;
    if settings.0.read().map_err(|e| e.to_string())?.local_model == s.id {
        return Err("This model is in use. Pick another model first.".into());
    }
    {
        let mut live = LIVE.lock().unwrap();
        if live.get(s.id).is_some_and(|l| l.stop.is_some()) {
            return Err("Pause the download before deleting it.".into());
        }
        live.remove(s.id);
    }
    let dir = crate::local_embed::cache_dir(&app);
    let folder = dir.join(format!("models--{}", s.repo.replace('/', "--")));
    if folder.exists() {
        std::fs::remove_dir_all(&folder).map_err(|e| format!("delete {}: {e}", s.id))?;
    }
    local.invalidate();
    emit(&app, s.id, disk_status(&dir, s));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disk_status_tracks_partial_and_complete_downloads() {
        let dir = std::env::temp_dir().join(format!("yank-model-store-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let s = spec("all-minilm-l6-v2").unwrap();
        assert_eq!(disk_status(&dir, s), Status::Missing { total: s.bytes });

        // A partial blob from a paused transfer (hf-hub sync names it `.part`).
        let repo = dir.join("models--Qdrant--all-MiniLM-L6-v2-onnx");
        std::fs::create_dir_all(repo.join("blobs")).unwrap();
        std::fs::write(repo.join("blobs/abc.part"), [0u8; 10]).unwrap();
        assert_eq!(disk_status(&dir, s), Status::Paused { done: 10, total: s.bytes });
        assert!(!is_ready(&dir, s.id));

        // Every file in the snapshot hf-hub's `refs/main` points at.
        std::fs::remove_file(repo.join("blobs/abc.part")).unwrap();
        std::fs::create_dir_all(repo.join("refs")).unwrap();
        std::fs::write(repo.join("refs/main"), "c0ffee").unwrap();
        for f in s.files {
            let p = repo.join("snapshots/c0ffee").join(f);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, [0u8; 3]).unwrap();
        }
        assert_eq!(disk_status(&dir, s), Status::Ready { total: 3 * s.files.len() as u64 });
        assert!(is_ready(&dir, s.id));
        assert!(is_ready(&dir, "not-a-catalog-model"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Downloads ~90 MB. `cargo test --lib -- --ignored pause_then_resume`
    #[test]
    #[ignore]
    fn pause_then_resume_finishes_from_the_partial_file() {
        let dir = std::env::temp_dir().join(format!("yank-model-resume-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let s = spec("all-minilm-l6-v2").unwrap();
        let stop = AtomicBool::new(false);
        let stopped = fetch(&dir, s, &stop, &|done| stop.store(done > 20_000_000, Ordering::Relaxed)).unwrap();
        assert!(!stopped, "should stop part way");
        let Status::Paused { done, .. } = disk_status(&dir, s) else { panic!("expected a partial download") };
        assert!(done > 20_000_000, "partial bytes kept: {done}");

        // Progress picks up at the partial size rather than restarting at 0.
        let first = std::cell::Cell::new(None);
        let finished = fetch(&dir, s, &AtomicBool::new(false), &|d| {
            first.set(first.get().or(Some(d)));
        });
        assert!(finished.unwrap());
        assert!(first.get().unwrap() >= done, "resumed at {:?}, partial was {done}", first.get());
        assert!(matches!(disk_status(&dir, s), Status::Ready { .. }));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
