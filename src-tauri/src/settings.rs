use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::embed::{EmbedConfig, Provider};

pub struct SettingsState(pub Arc<RwLock<EmbedConfig>>);

const STORE_PATH: &str = "settings.json";
const KEY: &str = "embed";

fn load_from_store(app: &AppHandle) -> EmbedConfig {
    let Ok(store) = app.store(STORE_PATH) else {
        return EmbedConfig::default();
    };
    let mut cfg: EmbedConfig = store
        .get(KEY)
        .and_then(|v| serde_json::from_value::<EmbedConfig>(v).ok())
        .unwrap_or_default();
    // Jev was briefly the default; without a key it was never really chosen.
    if cfg.provider == Provider::Jev && cfg.typesafe_api_key.trim().is_empty() {
        cfg.provider = Provider::Local;
    }
    cfg
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
    let model_changed = prev.local_model != cfg.local_model;
    let anthropic_key_gained =
        prev.anthropic_api_key.trim().is_empty() && !cfg.anthropic_api_key.trim().is_empty();

    *state.0.write().unwrap() = cfg.clone();
    persist(&app, &cfg)?;

    if model_changed {
        // Drop the loaded model so the next embed reloads the new one.
        if let Some(local) = app.try_state::<crate::local_embed::LocalState>() {
            local.invalidate();
        }
    }
    // Jev re-ranks at query time; only the local provider has vectors to backfill.
    if cfg.provider == Provider::Local && (model_changed || prev.provider != Provider::Local) {
        let db = app.state::<Arc<crate::db::Db>>().inner().clone();
        let conn = db.conn();
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM items WHERE deleted = 0
                   AND (embedding_model IS NULL OR embedding_model != ?1)",
                [cfg.model_id()],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if pending > 0 {
            let _ = app.emit("embed-backfill-started", pending);
        }
    }

    crate::embed_queue::kick(&app);
    if anthropic_key_gained {
        crate::label_queue::kick(&app);
    }
    Ok(())
}

/// Probe a candidate `EmbedConfig` so configuration errors and network
/// failures surface in the AI settings modal instead of only at search time.
/// `Local` is skipped — it would download/load the model on first call.
#[tauri::command]
pub async fn test_embed_provider(cfg: EmbedConfig) -> Result<(), String> {
    match cfg.provider {
        Provider::Disabled => Err("Semantic search is turned off.".into()),
        Provider::Local => Ok(()),
        Provider::Jev => {
            if cfg.typesafe_api_key.trim().is_empty() {
                return Err("TypeSafe API key is required.".into());
            }
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(8))
                .build()
                .map_err(|e| format!("http client: {e}"))?;
            crate::jev::ping(&client, &cfg.typesafe_api_key, &cfg.typesafe_model).await
        }
    }
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

const MINIMIZED_ON_START_KEY: &str = "minimizedOnStart";

/// Default is `true` — the autostart plugin launches with `--minimized`, so
/// "start minimized" is the expected behaviour until the user opts out.
pub fn start_minimized_enabled(app: &AppHandle) -> bool {
    let Ok(store) = app.store(STORE_PATH) else {
        return true;
    };
    store
        .get(MINIMIZED_ON_START_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

#[tauri::command]
pub fn get_minimized_on_start(app: AppHandle) -> bool {
    start_minimized_enabled(&app)
}

#[tauri::command]
pub fn set_minimized_on_start(app: AppHandle, minimized: bool) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(MINIMIZED_ON_START_KEY, serde_json::json!(minimized));
    store.save().map_err(|e| e.to_string())
}

const TRANSLUCENT_KEY: &str = "translucent";

/// Default is `false` — the palette is opaque on Linux unless the user opts
/// into the frosted-glass look (which can ghost on affected WebKitGTK builds).
pub fn translucent_enabled(app: &AppHandle) -> bool {
    let Ok(store) = app.store(STORE_PATH) else {
        return false;
    };
    store
        .get(TRANSLUCENT_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[tauri::command]
pub fn get_translucent(app: AppHandle) -> bool {
    translucent_enabled(&app)
}

#[tauri::command]
pub fn set_translucent(app: AppHandle, translucent: bool) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(TRANSLUCENT_KEY, serde_json::json!(translucent));
    store.save().map_err(|e| e.to_string())?;
    crate::apply_translucency(&app, translucent);
    let _ = app.emit("translucent-changed", translucent);
    Ok(())
}

const MONOCHROME_ICON_KEY: &str = "monochromeIcon";

/// Default is `false` — the tray shows the orange app icon unless the user
/// opts into the monochrome one from the tray menu.
pub fn monochrome_icon_enabled(app: &AppHandle) -> bool {
    let Ok(store) = app.store(STORE_PATH) else {
        return false;
    };
    store
        .get(MONOCHROME_ICON_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Persist the choice and update the live tray icon to match.
pub fn set_monochrome_icon(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(MONOCHROME_ICON_KEY, serde_json::json!(enabled));
    store.save().map_err(|e| e.to_string())?;
    crate::apply_tray_icon(app, enabled);
    Ok(())
}

const PALETTE_SEMANTIC_DEFAULT_KEY: &str = "paletteSemanticDefault";

/// Default is `false` — the palette opens in fuzzy mode unless the user opts
/// into describing what they want by default (issue #59).
#[tauri::command]
pub fn get_palette_semantic_default(app: AppHandle) -> bool {
    let Ok(store) = app.store(STORE_PATH) else {
        return false;
    };
    store
        .get(PALETTE_SEMANTIC_DEFAULT_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[tauri::command]
pub fn set_palette_semantic_default(app: AppHandle, enabled: bool) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(PALETTE_SEMANTIC_DEFAULT_KEY, serde_json::json!(enabled));
    store.save().map_err(|e| e.to_string())?;
    // The palette is a separate, long-lived window — tell it so the next open
    // picks up the new default without a restart.
    let _ = app.emit("palette-semantic-default-changed", enabled);
    Ok(())
}
