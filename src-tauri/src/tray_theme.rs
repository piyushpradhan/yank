//! Whether the tray background is light, and a hook for when that changes.
//! Self-contained (no tauri types) so each platform's code can be built alone.
//!
//! `watch` is called once from `setup`, on the main thread.

/// macOS tints the white template icon itself, so it never needs the dark one.
#[cfg(target_os = "macos")]
pub fn is_light() -> bool {
    false
}

/// Nothing to watch: the OS re-tints the template icon itself.
#[cfg(target_os = "macos")]
pub fn watch(_on_change: impl Fn() + Clone + Send + 'static) {}

#[cfg(target_os = "windows")]
use windows::{
    core::{w, PCWSTR},
    Win32::System::{
        Registry::{
            RegGetValueW, RegNotifyChangeKeyValue, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
            KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, RRF_RT_REG_DWORD,
        },
        Threading::{CreateEventW, WaitForSingleObject, INFINITE},
    },
};

#[cfg(target_os = "windows")]
const PERSONALIZE: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");

/// The taskbar/tray follows `SystemUsesLightTheme`; `AppsUseLightTheme` (what
/// tao reports as the window theme) can differ. Missing value (Windows 10
/// before 1903, always dark taskbar) reads as dark.
#[cfg(target_os = "windows")]
pub fn is_light() -> bool {
    let mut data = 0u32;
    let mut len = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            PERSONALIZE,
            w!("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut data as *mut u32 as *mut _),
            Some(&mut len),
        )
    };
    status.is_ok() && data == 1
}

/// Windows only emits a window theme event when the *app* mode changes, so
/// watch the registry key behind the taskbar mode instead.
#[cfg(target_os = "windows")]
pub fn watch(on_change: impl Fn() + Clone + Send + 'static) {
    std::thread::spawn(move || unsafe {
        let mut key = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, PERSONALIZE, None, KEY_NOTIFY, &mut key).is_err() {
            return;
        }
        let Ok(event) = CreateEventW(None, false, false, None) else {
            return;
        };
        // Re-arm before calling back: a write landing mid-callback (Windows
        // writes the apps and system values one after the other) then re-fires
        // instead of being lost.
        while RegNotifyChangeKeyValue(key, false, REG_NOTIFY_CHANGE_LAST_SET, Some(event), true)
            .is_ok()
        {
            on_change();
            WaitForSingleObject(event, INFINITE);
        }
    });
}

#[cfg(target_os = "linux")]
use gtk::prelude::GtkSettingsExt;

/// GNOME Shell's (and so Ubuntu's) top bar stays dark in light mode. Other
/// panels mostly follow the GTK theme.
// ponytail: GTK theme stands in for the panel on non-GNOME desktops; a Plasma
// or Cinnamon theme that differs from the GTK theme still gets the wrong glyph.
#[cfg(target_os = "linux")]
pub fn is_light() -> bool {
    let desktops = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase();
    let has = |name: &str| desktops.split(':').any(|d| d == name);
    // Budgie reports "Budgie:GNOME" but themes its own panel.
    if (has("gnome") || has("unity")) && !has("budgie") {
        return false;
    }
    gtk::Settings::default().is_some_and(|s| {
        let dark_name = s.gtk_theme_name().is_some_and(|n| n.to_lowercase().contains("dark"));
        !(dark_name || s.is_gtk_application_prefer_dark_theme())
    })
}

/// tao never emits `ThemeChanged` on Linux; GTK's own settings do notify when
/// the desktop switches theme.
#[cfg(target_os = "linux")]
pub fn watch(on_change: impl Fn() + Clone + Send + 'static) {
    let Some(settings) = gtk::Settings::default() else {
        return;
    };
    let f = on_change.clone();
    settings.connect_gtk_theme_name_notify(move |_| f());
    settings.connect_gtk_application_prefer_dark_theme_notify(move |_| on_change());
}
