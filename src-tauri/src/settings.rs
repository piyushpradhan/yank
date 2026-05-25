use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::embed::EmbedConfig;

pub struct SettingsState(pub Arc<RwLock<EmbedConfig>>);

const STORE_PATH: &str = "settings.json";
const KEY: &str = "embed";

fn load_from_store(app: &AppHandle) -> EmbedConfig {
    let Ok(store) = app.store(STORE_PATH) else {
        return EmbedConfig::default();
    };
    store
        .get(KEY)
        .and_then(|v| serde_json::from_value::<EmbedConfig>(v).ok())
        .unwrap_or_default()
}

fn persist(app: &AppHandle, cfg: &EmbedConfig) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(KEY, serde_json::to_value(cfg).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

pub fn init(app: &AppHandle) -> Arc<RwLock<EmbedConfig>> {
    let cfg = load_from_store(app);
    Arc::new(RwLock::new(cfg))
}

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> EmbedConfig {
    state.0.read().unwrap().clone()
}

#[tauri::command]
pub fn set_settings(
    cfg: EmbedConfig,
    app: AppHandle,
    state: State<'_, SettingsState>,
) -> Result<(), String> {
    let prev = state.0.read().unwrap().clone();
    let model_changed = prev.model_id() != cfg.model_id();
    let anthropic_key_gained =
        prev.anthropic_api_key.trim().is_empty() && !cfg.anthropic_api_key.trim().is_empty();

    *state.0.write().unwrap() = cfg.clone();
    persist(&app, &cfg)?;

    if model_changed {
        // Drop the loaded fastembed instance so the next embed reloads
        // for the new model (or different provider entirely).
        if let Some(local) = app.try_state::<crate::local_embed::LocalState>() {
            local.invalidate();
        }
        let db = app.state::<Arc<crate::db::Db>>().inner().clone();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE items SET embedding = NULL, embedding_model = NULL",
            [],
        )
        .map_err(|e| e.to_string())?;
        let pending: i64 = conn
            .query_row("SELECT COUNT(*) FROM items WHERE deleted = 0", [], |r| {
                r.get(0)
            })
            .unwrap_or(0);
        let _ = app.emit("embed-backfill-started", pending);
    }

    crate::embed_queue::kick(&app);
    if anthropic_key_gained {
        crate::label_queue::kick(&app);
    }
    Ok(())
}

const HINT_KEY: &str = "hintDismissed";
const SHORTCUT_KEY: &str = "paletteShortcut";

#[tauri::command]
pub fn get_hint_dismissed(app: AppHandle) -> bool {
    let Ok(store) = app.store(STORE_PATH) else {
        return false;
    };
    store
        .get(HINT_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[tauri::command]
pub fn set_hint_dismissed(app: AppHandle, dismissed: bool) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(HINT_KEY, serde_json::json!(dismissed));
    store.save().map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ShortcutConfig {
    pub modifiers: u32,
    pub key: String,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        // Ctrl+Shift+Space — chosen for cross-OS safety. Ctrl+Shift+V (the
        // historical pick) collides with "Paste without formatting" on
        // Windows browsers/Office and "Paste and Match Style" on macOS, so
        // it would shadow a binding users hit constantly.
        // keyboard-types::Modifiers: CONTROL=0x08, SHIFT=0x200 → Ctrl+Shift = 0x208.
        Self {
            modifiers: 0x208,
            key: "Space".into(),
        }
    }
}

fn load_shortcut(app: &AppHandle) -> ShortcutConfig {
    let Ok(store) = app.store(STORE_PATH) else {
        return ShortcutConfig::default();
    };
    let cfg = store
        .get(SHORTCUT_KEY)
        .and_then(|v| serde_json::from_value::<ShortcutConfig>(v).ok())
        .unwrap_or_default();
    // Earlier builds persisted nonsense modifier bitmasks (6, 7) that don't
    // contain any real modifier key — those registrations bound to the bare
    // key. If the stored mask has no Ctrl/Shift/Alt/Meta bit set, treat the
    // stored value as corrupt and return the default.
    const USEFUL: u32 = 0x08 /* CONTROL */ | 0x200 /* SHIFT */ | 0x01 /* ALT */ | 0x40 /* META */;
    if cfg.modifiers & USEFUL == 0 {
        return ShortcutConfig::default();
    }
    cfg
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    if enabled {
        mgr.enable()
            .map_err(|e: tauri_plugin_autostart::Error| e.to_string())
    } else {
        mgr.disable()
            .map_err(|e: tauri_plugin_autostart::Error| e.to_string())
    }
}

fn persist_shortcut(app: &AppHandle, sc: &ShortcutConfig) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(
        SHORTCUT_KEY,
        serde_json::to_value(sc).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_shortcut(app: AppHandle) -> ShortcutConfig {
    load_shortcut(&app)
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, sc: ShortcutConfig) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let shortcut = crate::build_shortcut(&sc);
    if let Some(lock) = crate::SHORTCUT.get() {
        if let Ok(mut guard) = lock.lock() {
            if let Some(old) = guard.take() {
                let _ = app.global_shortcut().unregister(old);
            }
        }
    }
    app.global_shortcut()
        .register(shortcut.clone())
        .map_err(|e| e.to_string())?;
    if let Some(lock) = crate::SHORTCUT.get() {
        if let Ok(mut guard) = lock.lock() {
            guard.replace(shortcut);
        }
    }
    persist_shortcut(&app, &sc)
}

pub fn get_loaded_shortcut(app: &AppHandle) -> ShortcutConfig {
    load_shortcut(app)
}

const THEME_KEY: &str = "theme";

#[tauri::command]
pub fn get_theme(app: AppHandle) -> String {
    let Ok(store) = app.store(STORE_PATH) else {
        return "dark".into();
    };
    store
        .get(THEME_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "dark".into())
}

#[tauri::command]
pub fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(THEME_KEY, serde_json::json!(theme));
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit("theme-changed", &theme);
    Ok(())
}
