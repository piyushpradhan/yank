/// Runtime platform/session details the frontend needs to surface honest
/// guidance that can't be expressed at build time. Right now that's one flag:
/// whether the app is running under a Wayland compositor, which the global
/// shortcut (`global-hotkey` 0.7.0) cannot register against — it is X11-only.
#[derive(serde::Serialize)]
pub struct PlatformInfo {
    pub wayland: bool,
}

#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    // `XDG_SESSION_TYPE` is the authoritative signal (set by the login
    // session to `wayland` or `x11`). It can be unset when launched from a
    // context that predates the DE (cron, some SSH sessions), in which case
    // the presence of `WAYLAND_DISPLAY` is a reliable fallback.
    let session = std::env::var("XDG_SESSION_TYPE")
        .or_else(|_| std::env::var("WAYLAND_DISPLAY").map(|_| "wayland".into()))
        .unwrap_or_default();
    let wayland = session.eq_ignore_ascii_case("wayland");
    PlatformInfo { wayland }
}
