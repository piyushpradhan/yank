use arboard::{Clipboard, ImageData};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::categorize::{categorize, make_preview};
use crate::db::Db;

/// Hard cap: skip images larger than this to avoid unbounded memory / storage.
#[cfg(target_os = "windows")]
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
        #[cfg(target_os = "windows")]
        let mut last_image_hash: Option<u64> = None;
        loop {
            std::thread::sleep(Duration::from_millis(500));

            // Check for image first (only on supported platforms).
            // When plain-text-only mode is on, skip image capture entirely.
            #[cfg(target_os = "windows")]
            {
                if !crate::settings::PLAIN_TEXT_ONLY.load(std::sync::atomic::Ordering::Relaxed) {
                    if let Ok(img) = cb.get_image() {
                        let hash = image_hash(&img);
                        if last_image_hash != Some(hash) {
                            last_image_hash = Some(hash);
                            let source = active_window_title();
                            insert_image_and_emit(&app, &img, source);
                        }
                        continue;
                    }
                }
            }

            // Check for text
            let text = match cb.get_text() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if text.trim().is_empty() {
                continue;
            }
            if last_text.as_deref() == Some(text.as_str()) {
                continue;
            }
            last_text = Some(text.clone());
            let source = active_window_title();
            insert_text_and_emit(&app, &text, source);
        }
    });
}

/// Samples bytes spread across the image for collision-resistant hashing.
/// The old approach (first + last byte + dimensions) had obvious failure modes;
/// this samples up to 64 evenly-spaced bytes which is fast and much harder to
/// accidentally collide.
#[cfg(target_os = "windows")]
fn image_hash(img: &ImageData) -> u64 {
    let b = &img.bytes;
    let n = b.len();
    let mut h = (img.width as u64)
        .wrapping_mul(0x9e3779b97f4a7c15)
        ^ (img.height as u64).wrapping_mul(0x6c62272e07bb0142);
    if n == 0 {
        return h;
    }
    let step = (n / 64).max(1);
    for (pos, i) in (0..n).step_by(step).take(64).enumerate() {
        h ^= (b[i] as u64)
            .wrapping_mul((pos as u64 + 1).wrapping_mul(0x517cc1b727220a95));
    }
    h
}

/// Encodes raw RGBA pixels from arboard into a PNG byte vector.
/// Returns an error rather than panicking on malformed input.
#[cfg(target_os = "windows")]
pub fn encode_as_png(img: &ImageData) -> Result<Vec<u8>, String> {
    use image::{ImageBuffer, Rgba};

    let pixels = img.width * img.height;
    if pixels > MAX_PIXELS {
        return Err(format!(
            "Image too large ({pixels} px, limit {MAX_PIXELS})"
        ));
    }
    let expected = pixels * 4;
    if img.bytes.len() != expected {
        return Err(format!(
            "RGBA length mismatch: expected {expected}, got {}",
            img.bytes.len()
        ));
    }

    let buf = ImageBuffer::<Rgba<u8>, _>::from_raw(
        img.width as u32,
        img.height as u32,
        img.bytes.to_vec(),
    )
    .ok_or("ImageBuffer creation failed")?;

    let mut png = Vec::new();
    buf.write_to(
        &mut std::io::Cursor::new(&mut png),
        image::ImageFormat::Png,
    )
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

fn insert_text_and_emit(app: &AppHandle, text: &str, source: Option<String>) {
    let category = categorize(text);
    let preview = make_preview(text);
    let db: Arc<Db> = app.state::<Arc<Db>>().inner().clone();
    let id = {
        let conn = db.0.lock().unwrap();
        match crate::db::insert_item(&conn, text, category, &preview, source.as_deref()) {
            Ok(id) => id,
            Err(err) => {
                eprintln!("[watcher] insert failed: {err}");
                return;
            }
        }
    };
    let _ = app.emit("clip-added", id);
    crate::label_queue::kick(app);
    crate::embed_queue::kick(app);
}

#[cfg(target_os = "windows")]
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
        let conn = db.0.lock().unwrap();
        match crate::db::insert_image_item(&conn, &png, &preview, source.as_deref()) {
            Ok(id) => id,
            Err(err) => {
                eprintln!("[watcher] insert image failed: {err}");
                return;
            }
        }
    };
    let _ = app.emit("clip-added", id);
}
