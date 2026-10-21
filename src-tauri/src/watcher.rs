use arboard::{Clipboard, ImageData};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::categorize::{categorize, make_preview};
use crate::clipboard_privacy::{Inspector, Snapshot};
use crate::db::Db;
use crate::settings::CapturePrivacyState;

/// Hard cap: skip images larger than this to avoid unbounded memory / storage.
const MAX_PIXELS: usize = 50_000_000;

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut cb = match Clipboard::new() {
            Ok(c) => c,
            Err(err) => {
                eprintln!("[watcher] clipboard init failed: {err}");
                return;
            }
        };
        let mut last_text: Option<String> = None;
        let mut last_image_hash: Option<u64> = None;
        let mut inspector = None;
        let mut last_seen = None;
        loop {
            std::thread::sleep(Duration::from_millis(500));

            let policy = app.state::<CapturePrivacyState>();
            let enabled = match policy.0.read() {
                Ok(value) => *value,
                Err(_) => continue,
            };
            let before = match privacy_snapshot(&mut inspector) {
                Ok(snapshot) => snapshot,
                Err(_) => {
                    last_seen = None;
                    continue;
                }
            };
            if last_seen == Some((before, enabled)) {
                continue;
            }
            if before.marked {
                last_seen = Some((before, enabled));
                continue;
            }

            if let Ok(img) = cb.get_image() {
                // Some offers provide both an image and text. Do not let the
                // preferred image representation bypass a detectable secret.
                if enabled
                    && cb
                        .get_text()
                        .is_ok_and(|text| crate::sensitive::detect(&text).is_some())
                {
                    last_seen = Some((before, enabled));
                    continue;
                }
                if !snapshot_still_public(&mut inspector, before) {
                    last_seen = None;
                    continue;
                }
                let Ok(guard) = policy.0.read() else {
                    continue;
                };
                if *guard != enabled {
                    continue;
                }
                let hash = image_hash(&img);
                if last_image_hash != Some(hash) {
                    last_image_hash = Some(hash);
                    let source = active_window_title();
                    insert_image_and_emit(&app, &img, source);
                }
                last_seen = Some((before, enabled));
                continue;
            }

            // Check for text
            let text = match cb.get_text() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if !snapshot_still_public(&mut inspector, before) {
                last_seen = None;
                continue;
            }
            if text.trim().is_empty() {
                last_seen = Some((before, enabled));
                continue;
            }
            // Enabling protection waits for pending writes using the old policy.
            let Ok(guard) = policy.0.read() else {
                continue;
            };
            if *guard != enabled {
                continue;
            }
            if last_text.as_deref() == Some(text.as_str()) {
                last_seen = Some((before, enabled));
                continue;
            }
            let source = active_window_title();
            if let Some(stored) = insert_text_and_emit(&app, &text, source, enabled) {
                if stored {
                    last_text = Some(text);
                }
                last_seen = Some((before, enabled));
            }
        }
    });
}

fn privacy_snapshot(inspector: &mut Option<Inspector>) -> Result<Snapshot, ()> {
    if inspector.is_none() {
        *inspector = Some(Inspector::new()?);
    }
    let result = inspector.as_mut().ok_or(())?.snapshot();
    if result.is_err() {
        *inspector = None;
    }
    result
}

fn snapshot_still_public(inspector: &mut Option<Inspector>, before: Snapshot) -> bool {
    privacy_snapshot(inspector).is_ok_and(|after| before.unchanged_and_public(after))
}

/// Samples bytes spread across the image for collision-resistant hashing.
/// The old approach (first + last byte + dimensions) had obvious failure modes;
/// this samples up to 64 evenly-spaced bytes which is fast and much harder to
/// accidentally collide.
fn image_hash(img: &ImageData) -> u64 {
    let b = &img.bytes;
    let n = b.len();
    let mut h = (img.width as u64).wrapping_mul(0x9e3779b97f4a7c15)
        ^ (img.height as u64).wrapping_mul(0x6c62272e07bb0142);
    if n == 0 {
        return h;
    }
    let step = (n / 64).max(1);
    for (pos, i) in (0..n).step_by(step).take(64).enumerate() {
        h ^= (b[i] as u64).wrapping_mul((pos as u64 + 1).wrapping_mul(0x517cc1b727220a95));
    }
    h
}

/// Encodes raw RGBA pixels from arboard into a PNG byte vector.
/// Returns an error rather than panicking on malformed input.
pub fn encode_as_png(img: &ImageData) -> Result<Vec<u8>, String> {
    use image::{ImageBuffer, Rgba};

    let pixels = img
        .width
        .checked_mul(img.height)
        .filter(|&p| p <= MAX_PIXELS)
        .ok_or_else(|| {
            format!(
                "Image too large ({}x{}, limit {MAX_PIXELS} px)",
                img.width, img.height
            )
        })?;
    let w = u32::try_from(img.width).map_err(|e| e.to_string())?;
    let h = u32::try_from(img.height).map_err(|e| e.to_string())?;
    let expected = pixels * 4;
    if img.bytes.len() != expected {
        return Err(format!(
            "RGBA length mismatch: expected {expected}, got {}",
            img.bytes.len()
        ));
    }

    let buf = ImageBuffer::<Rgba<u8>, _>::from_raw(w, h, img.bytes.to_vec())
        .ok_or("ImageBuffer creation failed")?;

    let mut png = Vec::new();
    buf.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(png)
}

#[cfg(windows)]
fn active_window_title() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len == 0 {
            return None;
        }
        let title = String::from_utf16_lossy(&buf[..len as usize]);
        if title.trim().is_empty() {
            None
        } else {
            Some(title)
        }
    }
}

#[cfg(not(windows))]
fn active_window_title() -> Option<String> {
    None
}

fn insert_text_and_emit(
    app: &AppHandle,
    text: &str,
    source: Option<String>,
    skip_sensitive: bool,
) -> Option<bool> {
    let db: Arc<Db> = app.state::<Arc<Db>>().inner().clone();
    let stored = {
        let conn = db.conn();
        match store_text(&conn, text, source.as_deref(), skip_sensitive) {
            Ok(Some(item)) => item,
            Ok(None) => return Some(false),
            Err(_) => {
                // SQLite error details can include input data.
                eprintln!("[watcher] could not store clipboard item");
                return None;
            }
        }
    };
    if stored.inserted {
        crate::telemetry::captured(app, stored.category);
    }
    let _ = app.emit("clip-added", stored.id);
    crate::label_queue::kick(app);
    crate::embed_queue::kick(app);
    Some(true)
}

struct StoredText {
    id: i64,
    category: &'static str,
    inserted: bool,
}

fn store_text(
    conn: &rusqlite::Connection,
    text: &str,
    source: Option<&str>,
    skip_sensitive: bool,
) -> rusqlite::Result<Option<StoredText>> {
    if skip_sensitive && crate::sensitive::detect(text).is_some() {
        return Ok(None);
    }
    let category = categorize(text);
    let preview = make_preview(text);
    let (id, inserted) = match crate::db::dedup_text(conn, text)? {
        Some(id) => {
            conn.execute(
                "UPDATE items SET last_used_at = ?1 WHERE id = ?2",
                rusqlite::params![chrono::Utc::now().timestamp_millis(), id],
            )?;
            (id, false)
        }
        None => (
            crate::db::insert_item(conn, text, category, &preview, source)?,
            true,
        ),
    };
    Ok(Some(StoredText {
        id,
        category,
        inserted,
    }))
}

fn insert_image_and_emit(app: &AppHandle, img: &ImageData, source: Option<String>) {
    let png = match encode_as_png(img) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[watcher] PNG encode failed: {e}");
            return;
        }
    };

    let preview = format!("{}×{} image", img.width, img.height);
    let db: Arc<Db> = app.state::<Arc<Db>>().inner().clone();
    let id = {
        let conn = db.conn();
        match crate::db::insert_image_item(&conn, &png, &preview, source.as_deref()) {
            Ok(id) => {
                crate::telemetry::captured(app, "image");
                id
            }
            Err(err) => {
                eprintln!("[watcher] insert image failed: {err}");
                return;
            }
        }
    };
    let _ = app.emit("clip-added", id);
}

#[cfg(test)]
mod privacy_tests {
    use super::*;

    #[test]
    fn rejected_copies_do_not_enter_history_or_fts_or_touch_existing_rows() {
        let path = std::env::temp_dir().join(format!("yank-privacy-{}.db", uuid::Uuid::new_v4()));
        let conn = crate::db::open(&path).unwrap();
        for value in [
            "4111111111111111",
            "123-45-6789",
            "password=orange",
            "-----BEGIN PRIVATE KEY-----",
        ] {
            assert!(store_text(&conn, value, None, true).unwrap().is_none());
        }
        assert_eq!(
            conn.query_row("SELECT count(*) FROM items", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row(
                "SELECT count(*) FROM items_fts WHERE items_fts MATCH 'orange'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        let stored = store_text(&conn, "password=orange", None, false)
            .unwrap()
            .unwrap();
        conn.execute(
            "UPDATE items SET last_used_at = 1 WHERE id = ?1",
            [stored.id],
        )
        .unwrap();
        assert!(store_text(&conn, "password=orange", None, true)
            .unwrap()
            .is_none());
        assert_eq!(
            conn.query_row(
                "SELECT last_used_at FROM items WHERE id = ?1",
                [stored.id],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert!(store_text(&conn, "ordinary text", None, true)
            .unwrap()
            .is_some());
        drop(conn);
        for file in [
            &path,
            &path.with_extension("db-wal"),
            &path.with_extension("db-shm"),
        ] {
            let _ = std::fs::remove_file(file);
        }
    }
}
