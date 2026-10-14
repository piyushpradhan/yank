//! Opt-in, content-free desktop analytics. Only this module can contact Umami.
//! No arbitrary event names, properties, errors, URLs, or clipboard IDs cross
//! this boundary. Events created before consent are discarded, never replayed.
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::{mpsc, watch};

const STORE: &str = "settings.json";
const KEY: &str = "telemetry";
// Public tracking ID already used by Yank's landing site. /app paths and the
// desktop tag keep application usage separate from landing-page traffic.
const WEBSITE: &str = match option_env!("YANK_UMAMI_WEBSITE_ID") {
    Some(id) => id,
    None => "1ddb11a3-816b-4e55-a80c-06e4d07af03f",
};
const ENDPOINT: &str = "https://gateway.umami.is/api/send";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Preferences {
    enabled: bool,
    prompt_handled: bool,
    installation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TelemetryPreferences {
    pub enabled: bool,
    pub prompt_handled: bool,
}

impl Preferences {
    fn public(&self) -> TelemetryPreferences {
        TelemetryPreferences {
            enabled: self.enabled,
            prompt_handled: self.prompt_handled,
        }
    }
    fn choose(&mut self, enabled: bool) {
        self.enabled = enabled;
        self.prompt_handled = true;
        if enabled {
            self.installation_id
                .get_or_insert_with(|| uuid::Uuid::new_v4().to_string());
        } else {
            self.installation_id = None;
        }
    }
}

macro_rules! values {
    ($name:ident { $($variant:ident),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name { $($variant),+ }
    };
}
values!(Surface {
    Library,
    Palette,
    Background
});
values!(Category {
    Text,
    Code,
    Url,
    Email,
    Phone,
    Color,
    Path,
    Address,
    Number,
    Image
});
values!(Mode { Fuzzy, Semantic });
values!(SearchProvider {
    Fuzzy,
    Local,
    Jev,
    Disabled
});
values!(ResultCount {
    Zero,
    One,
    TwoToFive,
    SixToTwenty,
    OverTwenty
});
values!(SearchStatus {
    Success,
    Error,
    Unavailable
});
values!(Outcome {
    Selected,
    Refined,
    ModeSwitched,
    Cleared,
    Abandoned
});
values!(Feature {
    Copy,
    CopyEdited,
    Pin,
    Unpin,
    Delete,
    Restore,
    Rename,
    RenameLabeledClip,
    Edit,
    ClearHistory,
    DismissDateFilter,
    DismissCategoryFilter,
    CategoryFilter,
    Preview,
    AiSettings,
    Settings,
    ProviderChanged,
    RetryEmbeddings,
});
values!(Operation {
    Copy,
    Pin,
    Delete,
    Restore,
    Rename,
    Edit,
    Paste,
    SemanticSearch
});
values!(PasteOutcome {
    Pasted,
    Copied,
    Failed
});

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "name", rename_all = "snake_case", deny_unknown_fields)]
pub enum TelemetryEvent {
    AppStarted,
    WindowFocused {
        surface: Surface,
    },
    ClipCaptured {
        category: Category,
    },
    FeatureUsed {
        surface: Surface,
        feature: Feature,
        category: Option<Category>,
    },
    SearchCompleted {
        surface: Surface,
        mode: Mode,
        provider: SearchProvider,
        result_count: ResultCount,
        duration_ms: u32,
        time_filter: bool,
        category_filter: bool,
        status: SearchStatus,
    },
    SearchOutcome {
        surface: Surface,
        mode: Mode,
        outcome: Outcome,
        rank: Option<u16>,
    },
    OperationFailed {
        surface: Surface,
        operation: Operation,
    },
    PasteCompleted {
        outcome: PasteOutcome,
    },
}

impl TelemetryEvent {
    fn surface(&self) -> Surface {
        match self {
            Self::WindowFocused { surface }
            | Self::FeatureUsed { surface, .. }
            | Self::SearchCompleted { surface, .. }
            | Self::SearchOutcome { surface, .. }
            | Self::OperationFailed { surface, .. } => *surface,
            Self::PasteCompleted { .. } => Surface::Palette,
            _ => Surface::Background,
        }
    }
    fn payload(&self, installation_id: &str) -> serde_json::Value {
        let mut data = serde_json::to_value(self).unwrap();
        let name = data.as_object_mut().unwrap().remove("name").unwrap();
        data["app_version"] = env!("CARGO_PKG_VERSION").into();
        data["os"] = std::env::consts::OS.into();
        data["schema_version"] = 1.into();
        match self {
            Self::SearchCompleted { duration_ms, .. } => {
                data["duration_ms"] = (*duration_ms).min(300_000).into();
            }
            Self::SearchOutcome {
                rank: Some(rank), ..
            } => {
                data["rank"] = (*rank).clamp(1, 500).into();
            }
            _ => {}
        }
        let path = match self.surface() {
            Surface::Library => "/app/library",
            Surface::Palette => "/app/palette",
            Surface::Background => "/app/background",
        };
        let mut body = serde_json::json!({
            "type": "event",
            "payload": {
                "website": WEBSITE, "hostname": "tryyank.com", "url": path,
                "title": "Yank desktop", "referrer": "", "tag": "desktop",
                "id": installation_id, "name": name, "data": data,
            }
        });
        // A native focus event is a pageview, so Umami's visitors/retention
        // reports include desktop use as well as custom events.
        if matches!(self, Self::WindowFocused { .. }) {
            body["payload"].as_object_mut().unwrap().remove("name");
        }
        body
    }
}

struct Gate {
    preferences: Preferences,
    generation: u64,
}
struct Pending {
    event: TelemetryEvent,
    installation_id: String,
    generation: u64,
}
pub struct TelemetryState {
    gate: Arc<Mutex<Gate>>,
    sender: mpsc::Sender<Pending>,
    changed: watch::Sender<u64>,
}

impl TelemetryState {
    fn enqueue(&self, event: TelemetryEvent) {
        let gate = self.gate.lock().unwrap();
        if !gate.preferences.enabled {
            return;
        }
        let Some(id) = &gate.preferences.installation_id else {
            return;
        };
        // Drop on overload. Analytics never waits on the app's critical path.
        let _ = self.sender.try_send(Pending {
            event,
            installation_id: id.clone(),
            generation: gate.generation,
        });
    }
}

pub fn record(app: &AppHandle, event: TelemetryEvent) {
    if let Some(state) = app.try_state::<TelemetryState>() {
        state.enqueue(event);
    }
}

pub fn captured(app: &AppHandle, category: &str) {
    if let Ok(category) = serde_json::from_value::<Category>(category.into()) {
        record(app, TelemetryEvent::ClipCaptured { category });
    }
}

pub fn init(app: &AppHandle) {
    // Missing, unreadable, or malformed preferences always fail closed.
    let mut preferences = app
        .store(STORE)
        .ok()
        .and_then(|s| s.get(KEY))
        .and_then(|v| serde_json::from_value::<Preferences>(v).ok())
        .unwrap_or_default();
    if !preferences.enabled
        || !preferences.prompt_handled
        || preferences
            .installation_id
            .as_ref()
            .is_none_or(|id| uuid::Uuid::parse_str(id).is_err())
    {
        preferences.enabled = false;
        preferences.installation_id = None;
    }
    let gate = Arc::new(Mutex::new(Gate {
        preferences,
        generation: 0,
    }));
    let (sender, mut receiver) = mpsc::channel::<Pending>(128);
    let (changed, mut cancellation) = watch::channel(0);
    app.manage(TelemetryState {
        gate: gate.clone(),
        sender,
        changed,
    });
    tauri::async_runtime::spawn(async move {
        // Development builds must never pollute the production dashboard.
        if cfg!(debug_assertions) {
            return;
        }
        let Ok(client) = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Yank")
            .build()
        else {
            return;
        };
        while let Some(pending) = receiver.recv().await {
            cancellation.borrow_and_update();
            {
                let current = gate.lock().unwrap();
                if !current.preferences.enabled || current.generation != pending.generation {
                    continue;
                }
            }
            let body = pending.event.payload(&pending.installation_id);
            // Dropping the future cancels an in-flight request on opt-out.
            // Nothing is persisted, retried, or replayed on a later opt-in.
            tokio::select! {
                biased;
                _ = cancellation.changed() => {},
                _ = client.post(ENDPOINT).json(&body).send() => {},
            }
        }
    });
    record(app, TelemetryEvent::AppStarted);
}

#[tauri::command]
pub fn get_telemetry_preferences(state: State<'_, TelemetryState>) -> TelemetryPreferences {
    state.gate.lock().unwrap().preferences.public()
}

#[tauri::command]
pub fn set_telemetry_enabled(
    app: AppHandle,
    state: State<'_, TelemetryState>,
    enabled: bool,
) -> Result<TelemetryPreferences, String> {
    let mut gate = state.gate.lock().unwrap();
    let mut next = gate.preferences.clone();
    next.choose(enabled);
    // Stop sharing immediately, even if the local preference write fails.
    if !enabled {
        gate.preferences = next.clone();
        gate.generation += 1;
        state.changed.send_replace(gate.generation);
        let _ = app.emit("telemetry-preferences-changed", gate.preferences.public());
    }
    let store = app
        .store(STORE)
        .map_err(|_| "Could not save your privacy preference.")?;
    store.set(KEY, serde_json::to_value(&next).unwrap());
    if store.save().is_err() {
        // Restore the store's in-memory value so a later unrelated save cannot
        // silently enable telemetry after a failed consent write.
        store.set(KEY, serde_json::to_value(&gate.preferences).unwrap());
        return Err("Could not save your privacy preference.".into());
    }
    let newly_enabled = enabled && !gate.preferences.enabled;
    gate.preferences = next;
    let public = gate.preferences.public();
    drop(gate);
    let _ = app.emit("telemetry-preferences-changed", &public);
    if newly_enabled {
        state.enqueue(TelemetryEvent::AppStarted);
        // Consent is granted in the library, after its initial focus event.
        state.enqueue(TelemetryEvent::WindowFocused {
            surface: Surface::Library,
        });
    }
    Ok(public)
}

#[tauri::command]
pub fn track_usage(state: State<'_, TelemetryState>, event: TelemetryEvent) {
    state.enqueue(event);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn consent_defaults_off_and_opt_out_rotates_identity() {
        let mut prefs = Preferences::default();
        assert!(!prefs.enabled && !prefs.prompt_handled && prefs.installation_id.is_none());
        prefs.choose(true);
        let first = prefs.installation_id.clone().unwrap();
        prefs.choose(true);
        assert_eq!(prefs.installation_id.as_ref().unwrap(), &first);
        prefs.choose(false);
        assert!(!prefs.enabled && prefs.prompt_handled && prefs.installation_id.is_none());
        prefs.choose(true);
        assert_ne!(prefs.installation_id.as_ref().unwrap(), &first);
    }
    #[test]
    fn payloads_reject_content_and_unknown_values() {
        for input in [
            serde_json::json!({"name":"feature_used","surface":"library","feature":"copy","category":null,"content":"secret"}),
            serde_json::json!({"name":"search_outcome","surface":"library","mode":"secret query","outcome":"cleared","rank":null}),
            serde_json::json!({"name":"unknown_event"}),
        ] {
            assert!(serde_json::from_value::<TelemetryEvent>(input).is_err());
        }
        let body = TelemetryEvent::FeatureUsed {
            surface: Surface::Library,
            feature: Feature::Copy,
            category: Some(Category::Code),
        }
        .payload("random-installation");
        assert_eq!(body["payload"]["name"], "feature_used");
        assert_eq!(body["payload"]["data"]["feature"], "copy");
        assert_eq!(body["payload"]["url"], "/app/library");
        assert!(body["payload"]["data"].get("name").is_none());
    }
    #[tokio::test]
    async fn nothing_is_queued_before_consent_or_after_opt_out() {
        let (sender, mut receiver) = mpsc::channel(4);
        let (changed, _) = watch::channel(0);
        let state = TelemetryState {
            gate: Arc::new(Mutex::new(Gate {
                preferences: Preferences::default(),
                generation: 0,
            })),
            sender,
            changed,
        };
        state.enqueue(TelemetryEvent::AppStarted);
        assert!(receiver.try_recv().is_err());
        state.gate.lock().unwrap().preferences.choose(true);
        state.enqueue(TelemetryEvent::AppStarted);
        assert!(receiver.try_recv().is_ok());
        state.gate.lock().unwrap().preferences.choose(false);
        state.enqueue(TelemetryEvent::AppStarted);
        assert!(receiver.try_recv().is_err());
    }
}
